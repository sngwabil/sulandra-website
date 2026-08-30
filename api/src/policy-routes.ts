import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  legalEntityId?: string | null;
  enterpriseOwner?: boolean;
};

type AuditFn = (
  auth: Partial<AuthContext>,
  action: string,
  resourceType: string,
  resourceId?: string,
  metadata?: object,
) => Promise<void>;

type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (response: Response) => AuthContext;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
  audit: AuditFn;
};

export type PolicyKnowledgeRow = {
  id: string;
  organizationId: string;
  legalEntityId: string | null;
  legalEntityName: string | null;
  legalEntityCode: string | null;
  scopeType: 'ENTERPRISE' | 'COMPANY';
  policyCode: string;
  title: string;
  slug: string;
  category: string;
  responsibleDepartment: string | null;
  summary: string;
  objective: string;
  scopeText: string;
  definitionsText: string;
  policyText: string;
  proceduresText: string;
  responsibilitiesText: string;
  documentationText: string;
  complianceText: string;
  referencesText: string;
  relatedDocumentsText: string;
  tags: string[];
  status: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'RETIRED';
  versionNumber: number;
  effectiveDate: Date | string | null;
  reviewDate: Date | string | null;
  approvalAuthority: string | null;
  changeNote: string | null;
  publishedAt: Date | string | null;
  updatedAt: Date | string;
  relevance?: number;
};

type PolicyRevisionRow = {
  id: string;
  versionNumber: number;
  changeNote: string | null;
  publishedById: string | null;
  publishedAt: Date | string;
};

type EntityRow = { id: string; code: string; displayName: string; status: string };

const ADMIN_POLICY_ROLES = [
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
] as const;

const POLICY_PUBLIC_BASE = () => (process.env.SULANDRA_PUBLIC_BASE_URL?.trim() || 'https://www.sulandrahealth.com').replace(/\/$/, '');
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const asIsoDate = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const policyUrl = (id: string) => `${POLICY_PUBLIC_BASE()}/policies.html?policy=${encodeURIComponent(id)}`;
const policyPdfUrl = (id: string) => `${POLICY_PUBLIC_BASE()}/policy-pdf.html?id=${encodeURIComponent(id)}`;
const rowForClient = (row: PolicyKnowledgeRow) => ({
  ...row,
  effectiveDate: asIsoDate(row.effectiveDate),
  reviewDate: asIsoDate(row.reviewDate),
  policyUrl: policyUrl(row.id),
  pdfUrl: policyPdfUrl(row.id),
});

const cleanPlainText = (value: unknown, max = 30_000) => String(value ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .trim()
  .slice(0, max);

const slugify = (value: string) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 100) || 'policy';

const policyCodeSchema = z.string().trim().min(3).max(40).transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9][A-Z0-9.-]+$/.test(value), 'Policy code may use letters, numbers, dots, and hyphens only');
const dateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const textSchema = (max = 30_000) => z.string().max(max).optional().transform((value) => cleanPlainText(value, max));
const tagsSchema = z.array(z.string().trim().min(1).max(60)).max(30).optional().transform((values) =>
  [...new Set((values || []).map((value) => value.toLowerCase()))].slice(0, 30),
);

const draftSchema = z.object({
  scopeType: z.enum(['ENTERPRISE', 'COMPANY']),
  legalEntityId: z.string().trim().min(1).nullable().optional(),
  templateKey: z.string().trim().max(80).optional(),
  policyCode: policyCodeSchema,
  title: z.string().trim().min(3).max(240),
  category: z.string().trim().min(2).max(120),
  responsibleDepartment: z.string().trim().max(160).nullable().optional(),
  summary: textSchema(2_500),
  objective: textSchema(8_000),
  scopeText: textSchema(8_000),
  definitionsText: textSchema(20_000),
  policyText: textSchema(40_000),
  proceduresText: textSchema(40_000),
  responsibilitiesText: textSchema(20_000),
  documentationText: textSchema(20_000),
  complianceText: textSchema(20_000),
  referencesText: textSchema(20_000),
  relatedDocumentsText: textSchema(20_000),
  tags: tagsSchema,
  effectiveDate: dateSchema,
  reviewDate: dateSchema,
  approvalAuthority: z.string().trim().max(240).nullable().optional(),
  changeNote: z.string().trim().max(2_000).nullable().optional(),
});

const updateSchema = draftSchema.partial().omit({ scopeType: true, legalEntityId: true, templateKey: true });

export const POLICY_TEMPLATES = [
  {
    key: 'ENTERPRISE_GOVERNANCE',
    name: 'Enterprise Governance Policy',
    category: 'Governance & Administration',
    description: 'Organization-wide governance, administrative, ethics, records, and enterprise operating policies.',
  },
  {
    key: 'CLINICAL_CARE',
    name: 'Clinical & Care Policy',
    category: 'Clinical & Care',
    description: 'Clinical practice, nursing, medication, documentation, client safety, and care-delivery policies.',
  },
  {
    key: 'WORKFORCE_HR',
    name: 'Workforce & Human Resources Policy',
    category: 'Workforce & Human Resources',
    description: 'Employment, attendance, conduct, onboarding, supervision, performance, and workforce policies.',
  },
  {
    key: 'SAFETY_COMPLIANCE',
    name: 'Safety & Compliance Policy',
    category: 'Safety & Compliance',
    description: 'Safety, incident prevention, regulatory compliance, quality, reporting, and risk policies.',
  },
  {
    key: 'IT_SECURITY',
    name: 'Technology & Information Security Policy',
    category: 'Technology & Security',
    description: 'Access, cybersecurity, privacy, acceptable use, systems, data, and technology operations policies.',
  },
  {
    key: 'FINANCE_PROCUREMENT',
    name: 'Finance & Procurement Policy',
    category: 'Finance & Procurement',
    description: 'Purchasing, expenses, reimbursements, payments, cash controls, and financial operating policies.',
  },
  {
    key: 'SERVICE_OPERATIONS',
    name: 'Service Operations Policy',
    category: 'Service Operations',
    description: 'Company-specific service delivery, residential, home health, transportation, and operational policies.',
  },
  {
    key: 'EMERGENCY_CONTINUITY',
    name: 'Emergency & Business Continuity Policy',
    category: 'Emergency & Continuity',
    description: 'Emergency response, disaster preparedness, continuity, communications, and recovery policies.',
  },
] as const;

const searchableTextSql = `
  COALESCE(p."policyCode",'') || ' ' ||
  COALESCE(p."title",'') || ' ' ||
  COALESCE(p."category",'') || ' ' ||
  COALESCE(p."responsibleDepartment",'') || ' ' ||
  COALESCE(p."summary",'') || ' ' ||
  COALESCE(p."objective",'') || ' ' ||
  COALESCE(p."scopeText",'') || ' ' ||
  COALESCE(p."definitionsText",'') || ' ' ||
  COALESCE(p."policyText",'') || ' ' ||
  COALESCE(p."proceduresText",'') || ' ' ||
  COALESCE(p."responsibilitiesText",'') || ' ' ||
  COALESCE(p."documentationText",'') || ' ' ||
  COALESCE(p."complianceText",'') || ' ' ||
  COALESCE(p."referencesText",'') || ' ' ||
  COALESCE(p."relatedDocumentsText",'')`;

const POLICY_SELECT = `
  p."id",p."organizationId",p."legalEntityId",e."displayName" AS "legalEntityName",e."code" AS "legalEntityCode",
  p."scopeType",p."policyCode",p."title",p."slug",p."category",p."responsibleDepartment",p."summary",
  p."objective",p."scopeText",p."definitionsText",p."policyText",p."proceduresText",p."responsibilitiesText",
  p."documentationText",p."complianceText",p."referencesText",p."relatedDocumentsText",p."tags",p."status",
  p."versionNumber",p."effectiveDate",p."reviewDate",p."approvalAuthority",p."changeNote",p."publishedAt",p."updatedAt"`;

const meaningfulPolicyTerms = (query: string) => {
  const stop = new Set([
    'a','about','an','and','are','can','do','does','for','from','give','i','in','is','it','link','me','my','of','on','our',
    'please','policy','policies','procedure','procedures','protocol','protocols','send','show','tell','the','to','us','what','where','which','with','sia',
  ]);
  const terms = query.toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,}/g) || [];
  return [...new Set(terms.filter((term) => !stop.has(term)))].slice(0, 10).join(' ');
};

async function queryPublishedPolicies(
  prisma: PrismaClient,
  auth: AuthContext,
  query: string,
  options: { limit?: number; includeAllCompanies?: boolean; category?: string | null } = {},
) {
  const search = meaningfulPolicyTerms(query);
  const includeAllCompanies = Boolean(options.includeAllCompanies && auth.enterpriseOwner);
  const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
  const rows = await prisma.$queryRawUnsafe<PolicyKnowledgeRow[]>(
    `SELECT ${POLICY_SELECT},
       CASE WHEN $4::text='' THEN 0::float ELSE
         ts_rank_cd(to_tsvector('english', ${searchableTextSql}), websearch_to_tsquery('english',$4))::float
       END AS "relevance"
     FROM "PolicyDocument" p
     LEFT JOIN "LegalEntity" e ON e."id"=p."legalEntityId" AND e."organizationId"=p."organizationId"
     WHERE p."organizationId"=$1
       AND p."status"='PUBLISHED'
       AND (
         p."scopeType"='ENTERPRISE'
         OR p."legalEntityId"=$2
         OR $3::boolean=TRUE
       )
       AND ($5::text='' OR LOWER(p."category")=LOWER($5))
       AND (
         $4::text=''
         OR to_tsvector('english', ${searchableTextSql}) @@ websearch_to_tsquery('english',$4)
         OR p."title" ILIKE '%' || $4 || '%'
         OR p."policyCode" ILIKE '%' || $4 || '%'
         OR p."category" ILIKE '%' || $4 || '%'
         OR p."summary" ILIKE '%' || $4 || '%'
       )
     ORDER BY "relevance" DESC, p."effectiveDate" DESC NULLS LAST, p."title" ASC
     LIMIT $6`,
    auth.organizationId,
    auth.legalEntityId ?? '',
    includeAllCompanies,
    search,
    options.category?.trim() || '',
    limit,
  );
  return rows;
}

export async function searchPublishedPoliciesForSia(
  prisma: PrismaClient,
  auth: AuthContext,
  query: string,
  limit = 6,
): Promise<PolicyKnowledgeRow[]> {
  return queryPublishedPolicies(prisma, auth, query, {
    limit,
    includeAllCompanies: Boolean(auth.enterpriseOwner),
  });
}

const compact = (value: string, max = 1_200) => value.replace(/\s+/g, ' ').trim().slice(0, max);
export const serializePolicyKnowledgeForSia = (rows: PolicyKnowledgeRow[]) => {
  if (!rows.length) return ['serverPolicyKnowledge: NO_MATCH'];
  const lines = ['serverPolicyKnowledge: AUTHORITATIVE_PUBLISHED_POLICY_MATCHES'];
  for (const row of rows) {
    const relevantText = [row.summary, row.objective, row.policyText, row.proceduresText]
      .map((value) => compact(value || '', 700))
      .filter(Boolean)
      .join(' | ')
      .slice(0, 2_000);
    lines.push(`serverPolicyRecord: ${JSON.stringify({
      id: row.id,
      policyCode: row.policyCode,
      title: row.title,
      scope: row.scopeType,
      company: row.scopeType === 'ENTERPRISE' ? 'All Sulandra companies' : row.legalEntityName,
      category: row.category,
      version: row.versionNumber,
      effectiveDate: asIsoDate(row.effectiveDate),
      reviewDate: asIsoDate(row.reviewDate),
      summary: compact(row.summary || '', 700),
      objective: compact(row.objective || '', 700),
      relevantText,
      policyUrl: policyUrl(row.id),
      pdfUrl: policyPdfUrl(row.id),
    })}`);
  }
  return lines;
};

const loadPolicy = async (prisma: PrismaClient, organizationId: string, id: string) => {
  const rows = await prisma.$queryRawUnsafe<PolicyKnowledgeRow[]>(
    `SELECT ${POLICY_SELECT}
     FROM "PolicyDocument" p
     LEFT JOIN "LegalEntity" e ON e."id"=p."legalEntityId" AND e."organizationId"=p."organizationId"
     WHERE p."organizationId"=$1 AND p."id"=$2 LIMIT 1`,
    organizationId,
    id,
  );
  return rows[0] || null;
};

const canAccessPolicy = (auth: AuthContext, row: PolicyKnowledgeRow, includeDraft = false) => {
  if (!includeDraft && row.status !== 'PUBLISHED') return false;
  if (row.scopeType === 'ENTERPRISE') return true;
  if (auth.enterpriseOwner) return true;
  return Boolean(auth.legalEntityId && row.legalEntityId === auth.legalEntityId);
};

const ensureTargetEntity = async (
  prisma: PrismaClient,
  auth: AuthContext,
  scopeType: 'ENTERPRISE' | 'COMPANY',
  legalEntityId?: string | null,
) => {
  if (scopeType === 'ENTERPRISE') {
    if (!auth.enterpriseOwner && auth.role !== UserRole.CEO) throw httpError(403, 'Enterprise policy publishing is restricted to enterprise leadership');
    return null;
  }
  const target = (legalEntityId || auth.legalEntityId || '').trim();
  if (!target) throw httpError(400, 'A company is required for a company policy');
  if (!auth.enterpriseOwner && target !== auth.legalEntityId) throw httpError(403, 'You may author policies only for the selected company');
  const rows = await prisma.$queryRawUnsafe<EntityRow[]>(
    `SELECT "id","code","displayName","status" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    auth.organizationId,
    target,
  );
  if (!rows[0]) throw httpError(404, 'The selected Sulandra company was not found');
  return target;
};

const snapshot = (row: PolicyKnowledgeRow) => ({
  policyCode: row.policyCode,
  title: row.title,
  slug: row.slug,
  scopeType: row.scopeType,
  legalEntityId: row.legalEntityId,
  category: row.category,
  responsibleDepartment: row.responsibleDepartment,
  summary: row.summary,
  objective: row.objective,
  scopeText: row.scopeText,
  definitionsText: row.definitionsText,
  policyText: row.policyText,
  proceduresText: row.proceduresText,
  responsibilitiesText: row.responsibilitiesText,
  documentationText: row.documentationText,
  complianceText: row.complianceText,
  referencesText: row.referencesText,
  relatedDocumentsText: row.relatedDocumentsText,
  tags: row.tags,
  versionNumber: row.versionNumber,
  effectiveDate: asIsoDate(row.effectiveDate),
  reviewDate: asIsoDate(row.reviewDate),
  approvalAuthority: row.approvalAuthority,
});

const requirePublishable = (row: PolicyKnowledgeRow) => {
  const missing: string[] = [];
  if (!row.objective.trim()) missing.push('Objective / Purpose');
  if (!row.scopeText.trim()) missing.push('Scope');
  if (!row.policyText.trim()) missing.push('Policy');
  if (!row.effectiveDate) missing.push('Effective Date');
  if (!row.responsibleDepartment?.trim()) missing.push('Responsible Department');
  if (missing.length) throw httpError(400, `Complete these required policy fields before publishing: ${missing.join(', ')}`);
};

const pdfSafe = (value: string) => value
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2013\u2014]/g, '-')
  .replace(/\u2022/g, '-')
  .replace(/[^\x20-\x7E\n]/g, '?');
const pdfEscape = (value: string) => pdfSafe(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const wrapText = (value: string, maxChars: number) => {
  const lines: string[] = [];
  for (const paragraph of pdfSafe(value).split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = '';
    for (const word of words) {
      if (!line) line = word;
      else if (`${line} ${word}`.length <= maxChars) line += ` ${word}`;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
};

type PdfLine = { text: string; bold?: boolean; size?: number; gapAfter?: number };
const pushPdfSection = (lines: PdfLine[], label: string, value: string) => {
  if (!value.trim()) return;
  lines.push({ text: label.toUpperCase(), bold: true, size: 11, gapAfter: 4 });
  for (const item of wrapText(value, 92)) lines.push({ text: item, size: 9.5 });
  lines.push({ text: '', size: 8, gapAfter: 5 });
};

const buildPolicyPdf = (row: PolicyKnowledgeRow) => {
  const lines: PdfLine[] = [
    { text: 'SULANDRA HEALTH', bold: true, size: 15, gapAfter: 4 },
    { text: row.scopeType === 'ENTERPRISE' ? 'Enterprise Policy' : `${row.legalEntityName || 'Sulandra Company'} Policy`, bold: true, size: 10, gapAfter: 10 },
    { text: `${row.policyCode}  |  ${row.title}`, bold: true, size: 13, gapAfter: 10 },
    { text: `Responsible Department: ${row.responsibleDepartment || '-'}`, size: 9 },
    { text: `Version: ${row.versionNumber}    Effective Date: ${asIsoDate(row.effectiveDate) || '-'}    Review Date: ${asIsoDate(row.reviewDate) || '-'}`, size: 9 },
    { text: `Scope: ${row.scopeType === 'ENTERPRISE' ? 'All Sulandra companies' : (row.legalEntityName || 'Company-specific')}`, size: 9, gapAfter: 10 },
  ];
  pushPdfSection(lines, 'Objective / Purpose', row.objective);
  pushPdfSection(lines, 'Scope', row.scopeText);
  pushPdfSection(lines, 'Definitions', row.definitionsText);
  pushPdfSection(lines, 'Policy', row.policyText);
  pushPdfSection(lines, 'Procedures', row.proceduresText);
  pushPdfSection(lines, 'Responsibilities', row.responsibilitiesText);
  pushPdfSection(lines, 'Documentation & Records', row.documentationText);
  pushPdfSection(lines, 'Compliance & Monitoring', row.complianceText);
  pushPdfSection(lines, 'References', row.referencesText);
  pushPdfSection(lines, 'Related Documents', row.relatedDocumentsText);
  if (row.approvalAuthority) pushPdfSection(lines, 'Approval Authority', row.approvalAuthority);

  const pageHeight = 792;
  const top = 742;
  const bottom = 52;
  const left = 54;
  const pages: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let y = top;
  for (const line of lines) {
    const size = line.size || 10;
    const height = Math.max(12, size + 3) + (line.gapAfter || 0);
    if (y - height < bottom && current.length) {
      pages.push(current);
      current = [];
      y = top;
    }
    current.push(line);
    y -= height;
  }
  if (current.length) pages.push(current);

  const objects: string[] = ['', '', '', ''];
  objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  const pageRefs: number[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    let cursorY = top;
    const commands: string[] = ['BT'];
    for (const line of pages[index]) {
      const size = line.size || 10;
      commands.push(`/${line.bold ? 'F2' : 'F1'} ${size} Tf`);
      commands.push(`1 0 0 1 ${left} ${cursorY.toFixed(1)} Tm`);
      commands.push(`(${pdfEscape(line.text)}) Tj`);
      cursorY -= Math.max(12, size + 3) + (line.gapAfter || 0);
    }
    commands.push('ET');
    commands.push(`BT /F1 8 Tf 1 0 0 1 ${left} 28 Tm (Page ${index + 1} of ${pages.length}) Tj ET`);
    const stream = commands.join('\n');
    const contentObjectNumber = objects.length + 2;
    const pageObjectNumber = objects.length + 1;
    pageRefs.push(pageObjectNumber);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`);
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] >>`;

  let pdf = '%PDF-1.4\n%SulandraPolicy\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
};

export function registerPolicyRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  const adminGate = requireRoles(...ADMIN_POLICY_ROLES);

  app.get('/api/policies', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const query = String(req.query.q || req.query.query || '').slice(0, 500);
      const includeAllCompanies = String(req.query.scope || '').toUpperCase() === 'ALL';
      const category = typeof req.query.category === 'string' ? req.query.category : null;
      const rows = await queryPublishedPolicies(prisma, auth, query, {
        limit: Number(req.query.limit || 50),
        includeAllCompanies,
        category,
      });
      const categories = [...new Set(rows.map((row) => row.category))].sort();
      res.json({ data: { policies: rows.map(rowForClient), categories, query } });
    } catch (error) { next(error); }
  });

  app.get('/api/policies/:policyId', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const row = await loadPolicy(prisma, auth.organizationId, req.params.policyId);
      if (!row || !canAccessPolicy(auth, row)) return void res.status(404).json({ error: 'Published policy was not found' });
      const revisions = await prisma.$queryRawUnsafe<PolicyRevisionRow[]>(
        `SELECT "id","versionNumber","changeNote","publishedById","publishedAt"
         FROM "PolicyDocumentRevision" WHERE "organizationId"=$1 AND "policyId"=$2 ORDER BY "versionNumber" DESC LIMIT 25`,
        auth.organizationId,
        row.id,
      );
      res.json({ data: { policy: rowForClient(row), revisions } });
    } catch (error) { next(error); }
  });

  app.get('/api/policies/:policyId/pdf', async (req, res, next) => {
    try {
      const auth = authOf(res);
      const row = await loadPolicy(prisma, auth.organizationId, req.params.policyId);
      if (!row || !canAccessPolicy(auth, row)) return void res.status(404).json({ error: 'Published policy was not found' });
      const pdf = buildPolicyPdf(row);
      const filename = `${row.policyCode}-${slugify(row.title)}-v${row.versionNumber}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(pdf);
      await audit(auth, 'VIEW_POLICY_PDF', 'PolicyDocument', row.id, { versionNumber: row.versionNumber });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/policies/templates', adminGate, (_req, res) => {
    res.json({
      data: {
        templates: POLICY_TEMPLATES,
        standardSections: [
          'Policy Identification & Ownership', 'Objective / Purpose', 'Scope', 'Definitions', 'Policy', 'Procedures',
          'Responsibilities', 'Documentation & Records', 'Compliance & Monitoring', 'References', 'Related Documents', 'Revision History',
        ],
      },
    });
  });

  app.get('/api/admin/policies/companies', adminGate, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<EntityRow[]>(
        `SELECT "id","code","displayName","status" FROM "LegalEntity" WHERE "organizationId"=$1 ORDER BY "displayName"`,
        auth.organizationId,
      );
      const companies = auth.enterpriseOwner ? rows : rows.filter((row) => row.id === auth.legalEntityId);
      res.json({ data: { companies, enterpriseScopeAllowed: Boolean(auth.enterpriseOwner || auth.role === UserRole.CEO) } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/policies', adminGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const status = String(req.query.status || '').toUpperCase();
      const rows = await prisma.$queryRawUnsafe<PolicyKnowledgeRow[]>(
        `SELECT ${POLICY_SELECT}
         FROM "PolicyDocument" p
         LEFT JOIN "LegalEntity" e ON e."id"=p."legalEntityId" AND e."organizationId"=p."organizationId"
         WHERE p."organizationId"=$1
           AND ($2::boolean=TRUE OR p."scopeType"='ENTERPRISE' OR p."legalEntityId"=$3)
           AND ($4::text='' OR p."status"=$4)
         ORDER BY CASE p."status" WHEN 'IN_REVIEW' THEN 0 WHEN 'DRAFT' THEN 1 WHEN 'PUBLISHED' THEN 2 ELSE 3 END,
                  p."updatedAt" DESC LIMIT 250`,
        auth.organizationId,
        Boolean(auth.enterpriseOwner),
        auth.legalEntityId ?? '',
        ['DRAFT','IN_REVIEW','PUBLISHED','RETIRED'].includes(status) ? status : '',
      );
      res.json({ data: { policies: rows.map(rowForClient) } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/policies/:policyId', adminGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const row = await loadPolicy(prisma, auth.organizationId, req.params.policyId);
      if (!row || !canAccessPolicy(auth, row, true)) return void res.status(404).json({ error: 'Policy was not found' });
      const revisions = await prisma.$queryRawUnsafe<PolicyRevisionRow[]>(
        `SELECT "id","versionNumber","changeNote","publishedById","publishedAt" FROM "PolicyDocumentRevision"
         WHERE "organizationId"=$1 AND "policyId"=$2 ORDER BY "versionNumber" DESC`,
        auth.organizationId,
        row.id,
      );
      res.json({ data: { policy: rowForClient(row), revisions } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/policies', adminGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = draftSchema.parse(req.body);
      const legalEntityId = await ensureTargetEntity(prisma, auth, input.scopeType, input.legalEntityId);
      const duplicate = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "PolicyDocument" WHERE "organizationId"=$1 AND "policyCode"=$2 AND COALESCE("legalEntityId",'')=COALESCE($3,'') AND "status"<>'RETIRED' LIMIT 1`,
        auth.organizationId,
        input.policyCode,
        legalEntityId,
      );
      if (duplicate[0]) throw httpError(409, 'That policy code is already in use for this scope');
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PolicyDocument" (
          "id","organizationId","legalEntityId","scopeType","policyCode","title","slug","category","responsibleDepartment",
          "summary","objective","scopeText","definitionsText","policyText","proceduresText","responsibilitiesText","documentationText",
          "complianceText","referencesText","relatedDocumentsText","tags","effectiveDate","reviewDate","approvalAuthority","changeNote",
          "createdById","updatedById","createdAt","updatedAt"
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::text[],
          $22::date,$23::date,$24,$25,$26,$26,NOW(),NOW()
        )`,
        id, auth.organizationId, legalEntityId, input.scopeType, input.policyCode, input.title, slugify(input.title), input.category,
        input.responsibleDepartment ?? null, input.summary, input.objective, input.scopeText, input.definitionsText, input.policyText,
        input.proceduresText, input.responsibilitiesText, input.documentationText, input.complianceText, input.referencesText,
        input.relatedDocumentsText, input.tags, input.effectiveDate ?? null, input.reviewDate ?? null, input.approvalAuthority ?? null,
        input.changeNote ?? null, auth.userId,
      );
      await audit(auth, 'CREATE_POLICY_DRAFT', 'PolicyDocument', id, {
        policyCode: input.policyCode,
        scopeType: input.scopeType,
        legalEntityId,
        templateKey: input.templateKey || null,
      });
      const row = await loadPolicy(prisma, auth.organizationId, id);
      res.status(201).json({ data: { policy: row ? rowForClient(row) : { id } } });
    } catch (error) { next(error); }
  });

  app.put('/api/admin/policies/:policyId', adminGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const existing = await loadPolicy(prisma, auth.organizationId, req.params.policyId);
      if (!existing || !canAccessPolicy(auth, existing, true)) return void res.status(404).json({ error: 'Policy was not found' });
      if (existing.status === 'PUBLISHED') throw httpError(409, 'Published policy versions are immutable. Create the next revision before editing.');
      if (existing.status === 'RETIRED') throw httpError(409, 'Retired policies cannot be edited');
      const input = updateSchema.parse(req.body);
      const next = {
        policyCode: input.policyCode ?? existing.policyCode,
        title: input.title ?? existing.title,
        category: input.category ?? existing.category,
        responsibleDepartment: input.responsibleDepartment !== undefined ? input.responsibleDepartment : existing.responsibleDepartment,
        summary: input.summary ?? existing.summary,
        objective: input.objective ?? existing.objective,
        scopeText: input.scopeText ?? existing.scopeText,
        definitionsText: input.definitionsText ?? existing.definitionsText,
        policyText: input.policyText ?? existing.policyText,
        proceduresText: input.proceduresText ?? existing.proceduresText,
        responsibilitiesText: input.responsibilitiesText ?? existing.responsibilitiesText,
        documentationText: input.documentationText ?? existing.documentationText,
        complianceText: input.complianceText ?? existing.complianceText,
        referencesText: input.referencesText ?? existing.referencesText,
        relatedDocumentsText: input.relatedDocumentsText ?? existing.relatedDocumentsText,
        tags: input.tags ?? existing.tags,
        effectiveDate: input.effectiveDate !== undefined ? input.effectiveDate : asIsoDate(existing.effectiveDate),
        reviewDate: input.reviewDate !== undefined ? input.reviewDate : asIsoDate(existing.reviewDate),
        approvalAuthority: input.approvalAuthority !== undefined ? input.approvalAuthority : existing.approvalAuthority,
        changeNote: input.changeNote !== undefined ? input.changeNote : existing.changeNote,
      };
      await prisma.$executeRawUnsafe(
        `UPDATE "PolicyDocument" SET
          "policyCode"=$3,"title"=$4,"slug"=$5,"category"=$6,"responsibleDepartment"=$7,"summary"=$8,"objective"=$9,
          "scopeText"=$10,"definitionsText"=$11,"policyText"=$12,"proceduresText"=$13,"responsibilitiesText"=$14,
          "documentationText"=$15,"complianceText"=$16,"referencesText"=$17,"relatedDocumentsText"=$18,"tags"=$19::text[],
          "effectiveDate"=$20::date,"reviewDate"=$21::date,"approvalAuthority"=$22,"changeNote"=$23,"updatedById"=$24,"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "id"=$2`,
        auth.organizationId, existing.id, next.policyCode, next.title, slugify(next.title), next.category, next.responsibleDepartment,
        next.summary, next.objective, next.scopeText, next.definitionsText, next.policyText, next.proceduresText, next.responsibilitiesText,
        next.documentationText, next.complianceText, next.referencesText, next.relatedDocumentsText, next.tags, next.effectiveDate,
        next.reviewDate, next.approvalAuthority, next.changeNote, auth.userId,
      );
      await audit(auth, 'UPDATE_POLICY_DRAFT', 'PolicyDocument', existing.id, { policyCode: next.policyCode });
      const row = await loadPolicy(prisma, auth.organizationId, existing.id);
      res.json({ data: { policy: row ? rowForClient(row) : { id: existing.id } } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/policies/:policyId/submit-review', adminGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const row = await loadPolicy(prisma, auth.organizationId, req.params.policyId);
      if (!row || !canAccessPolicy(auth, row, true)) return void res.status(404).json({ error: 'Policy was not found' });
      if (row.status !== 'DRAFT') throw httpError(409, 'Only a draft policy can be submitted for review');
      requirePublishable(row);
      await prisma.$executeRawUnsafe(
        `UPDATE "PolicyDocument" SET "status"='IN_REVIEW',"updatedById"=$3,"updatedAt"=NOW() WHERE "organizationId"=$1 AND "id"=$2`,
        auth.organizationId, row.id, auth.userId,
      );
      await audit(auth, 'SUBMIT_POLICY_REVIEW', 'PolicyDocument', row.id, { policyCode: row.policyCode });
      res.json({ data: { status: 'IN_REVIEW' } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/policies/:policyId/publish', adminGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const row = await loadPolicy(prisma, auth.organizationId, req.params.policyId);
      if (!row || !canAccessPolicy(auth, row, true)) return void res.status(404).json({ error: 'Policy was not found' });
      if (!['DRAFT','IN_REVIEW'].includes(row.status)) throw httpError(409, 'Only a draft or reviewed policy can be published');
      if (row.scopeType === 'ENTERPRISE' && !auth.enterpriseOwner && auth.role !== UserRole.CEO) throw httpError(403, 'Enterprise policy publishing is restricted to enterprise leadership');
      requirePublishable(row);
      const revisionId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PolicyDocumentRevision" ("id","organizationId","policyId","versionNumber","snapshot","changeNote","publishedById","publishedAt")
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,NOW())`,
        revisionId, auth.organizationId, row.id, row.versionNumber, JSON.stringify(snapshot(row)), row.changeNote, auth.userId,
      );
      await prisma.$executeRawUnsafe(
        `UPDATE "PolicyDocument" SET "status"='PUBLISHED',"publishedById"=$3,"publishedAt"=NOW(),"retiredAt"=NULL,"updatedById"=$3,"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "id"=$2`,
        auth.organizationId, row.id, auth.userId,
      );
      await audit(auth, 'PUBLISH_POLICY', 'PolicyDocument', row.id, {
        policyCode: row.policyCode,
        versionNumber: row.versionNumber,
        scopeType: row.scopeType,
        legalEntityId: row.legalEntityId,
      });
      const published = await loadPolicy(prisma, auth.organizationId, row.id);
      res.json({ data: { policy: published ? rowForClient(published) : { id: row.id }, revisionId } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/policies/:policyId/retire', adminGate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const row = await loadPolicy(prisma, auth.organizationId, req.params.policyId);
      if (!row || !canAccessPolicy(auth, row, true)) return void res.status(404).json({ error: 'Policy was not found' });
      if (row.status !== 'PUBLISHED') throw httpError(409, 'Only a published policy can be retired');
      await prisma.$executeRawUnsafe(
        `UPDATE "PolicyDocument" SET "status"='RETIRED',"retiredAt"=NOW(),"updatedById"=$3,"updatedAt"=NOW() WHERE "organizationId"=$1 AND "id"=$2`,
        auth.organizationId, row.id, auth.userId,
      );
      await audit(auth, 'RETIRE_POLICY', 'PolicyDocument', row.id, { policyCode: row.policyCode, versionNumber: row.versionNumber });
      res.json({ data: { status: 'RETIRED' } });
    } catch (error) { next(error); }
  });
}
