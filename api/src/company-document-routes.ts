import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  legalEntityId?: string;
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
  authOf: (response: express.Response) => AuthContext;
  audit?: AuditFn;
};

const readers = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.HR_MANAGER,
  UserRole.PROGRAM_MANAGER,
  UserRole.AUDITOR,
  UserRole.CEO,
  UserRole.DOO,
]);
const writers = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.HR_MANAGER,
  UserRole.PROGRAM_MANAGER,
  UserRole.CEO,
  UserRole.DOO,
]);
const restrictedReaders = new Set<UserRole>([
  UserRole.ADMINISTRATOR,
  UserRole.CEO,
  UserRole.DOO,
]);

const sensitivitySchema = z.enum(['GENERAL', 'CONFIDENTIAL', 'RESTRICTED']);
const folderSchema = z.object({
  parentFolderId: z.string().trim().min(1).optional().nullable(),
  name: z.string().trim().min(2).max(160),
  category: z.string().trim().min(2).max(80).default('GENERAL'),
  description: z.string().trim().max(2_000).optional().nullable(),
  sensitivity: sensitivitySchema.default('CONFIDENTIAL'),
});
const folderPatchSchema = folderSchema.partial().extend({ active: z.boolean().optional() });
const uploadSchema = z.object({
  documentId: z.string().trim().min(1).optional().nullable(),
  folderId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().min(1).max(240).optional(),
  documentType: z.string().trim().min(1).max(100).default('GENERAL'),
  sensitivity: sensitivitySchema.default('CONFIDENTIAL'),
  effectiveDate: z.string().trim().max(20).optional().nullable(),
  expirationDate: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(8_000).optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({}),
  originalFileName: z.string().trim().min(1).max(300),
  mimeType: z.string().trim().min(1).max(200),
  contentBase64: z.string().min(1).max(36_000_000),
  changeNote: z.string().trim().max(2_000).optional().nullable(),
});
const documentPatchSchema = z.object({
  folderId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(240).optional(),
  documentType: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'SUPERSEDED', 'ARCHIVED']).optional(),
  sensitivity: sensitivitySchema.optional(),
  effectiveDate: z.string().trim().max(20).optional().nullable(),
  expirationDate: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(8_000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const selectedEntityId = (auth: AuthContext) => {
  if (!auth.legalEntityId) throw httpError(409, 'Select a Sulandra company before opening Company Documents');
  return auth.legalEntityId;
};
const owner = (auth: AuthContext) => auth.enterpriseOwner === true
  || String(auth.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';
const ensureRead = (auth: AuthContext) => {
  if (!readers.has(auth.role) && !owner(auth)) throw httpError(403, 'Company document access is restricted');
};
const ensureWrite = (auth: AuthContext) => {
  ensureRead(auth);
  if (auth.role === UserRole.AUDITOR || (!writers.has(auth.role) && !owner(auth))) {
    throw httpError(403, 'You have read-only company document access');
  }
};
const ensureSensitivity = (auth: AuthContext, sensitivity: unknown) => {
  if (String(sensitivity) === 'RESTRICTED' && !owner(auth) && !restrictedReaders.has(auth.role)) {
    throw httpError(403, 'Restricted company documents require executive or enterprise-owner access');
  }
};
const asDate = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : null;
const safeFileName = (value: string) => value.replace(/[\r\n"]/g, '_').replace(/[\\/]/g, '_').slice(0, 300) || 'document';

const defaultsByCompany: Record<string, Array<[string, string, 'GENERAL' | 'CONFIDENTIAL' | 'RESTRICTED']>> = {
  SULANDRA_HEALTH: [
    ['Corporate & Formation', 'CORPORATE', 'RESTRICTED'],
    ['Tax & Finance', 'FINANCE', 'RESTRICTED'],
    ['Insurance', 'INSURANCE', 'CONFIDENTIAL'],
    ['Enterprise Policies', 'POLICIES', 'CONFIDENTIAL'],
    ['Contracts & Legal', 'CONTRACTS', 'RESTRICTED'],
    ['Human Resources', 'HUMAN_RESOURCES', 'RESTRICTED'],
    ['Technology & Security', 'TECHNOLOGY', 'RESTRICTED'],
  ],
  SCLS: [
    ['Licensing & Provider Enrollment', 'LICENSING', 'RESTRICTED'],
    ['Ohio DODD & Medicaid', 'DODD_MEDICAID', 'CONFIDENTIAL'],
    ['Policies & Procedures', 'POLICIES', 'CONFIDENTIAL'],
    ['Insurance', 'INSURANCE', 'CONFIDENTIAL'],
    ['Service Homes', 'SERVICE_HOMES', 'CONFIDENTIAL'],
    ['Clinical Operations', 'CLINICAL', 'RESTRICTED'],
    ['Human Resources', 'HUMAN_RESOURCES', 'RESTRICTED'],
    ['Billing & Authorizations', 'BILLING', 'RESTRICTED'],
    ['Education & Compliance', 'COMPLIANCE', 'CONFIDENTIAL'],
    ['Contracts & Vendors', 'CONTRACTS', 'RESTRICTED'],
  ],
  HOME_HEALTH: [
    ['Licensing & Certification', 'LICENSING', 'RESTRICTED'],
    ['Medicare, Medicaid & Payers', 'PAYER_ENROLLMENT', 'RESTRICTED'],
    ['Policies & Procedures', 'POLICIES', 'CONFIDENTIAL'],
    ['Clinical Operations', 'CLINICAL', 'RESTRICTED'],
    ['Quality & Compliance', 'QUALITY', 'CONFIDENTIAL'],
    ['Human Resources', 'HUMAN_RESOURCES', 'RESTRICTED'],
    ['Billing & Revenue Cycle', 'BILLING', 'RESTRICTED'],
    ['Insurance', 'INSURANCE', 'CONFIDENTIAL'],
    ['Contracts & Vendors', 'CONTRACTS', 'RESTRICTED'],
  ],
  NMT: [
    ['Licensing & Provider Enrollment', 'LICENSING', 'RESTRICTED'],
    ['Transportation Compliance', 'TRANSPORTATION_COMPLIANCE', 'CONFIDENTIAL'],
    ['Vehicles & Fleet', 'FLEET', 'CONFIDENTIAL'],
    ['Driver Compliance', 'DRIVER_COMPLIANCE', 'RESTRICTED'],
    ['Insurance', 'INSURANCE', 'CONFIDENTIAL'],
    ['Policies & Procedures', 'POLICIES', 'CONFIDENTIAL'],
    ['Billing & Trip Documentation', 'BILLING', 'RESTRICTED'],
    ['Human Resources', 'HUMAN_RESOURCES', 'RESTRICTED'],
    ['Contracts & Vendors', 'CONTRACTS', 'RESTRICTED'],
  ],
};

async function entityCode(prisma: PrismaClient, auth: AuthContext) {
  const rows = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
    `SELECT "code" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    auth.organizationId,
    selectedEntityId(auth),
  );
  if (!rows[0]) throw httpError(404, 'Selected company was not found');
  return rows[0].code;
}

async function seedFolders(prisma: PrismaClient, auth: AuthContext) {
  const entityId = selectedEntityId(auth);
  const code = await entityCode(prisma, auth);
  const defaults = defaultsByCompany[code] || [
    ['Company Records', 'GENERAL', 'CONFIDENTIAL'],
    ['Policies & Procedures', 'POLICIES', 'CONFIDENTIAL'],
    ['Contracts', 'CONTRACTS', 'RESTRICTED'],
  ];
  for (const [name, category, sensitivity] of defaults) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CompanyDocumentFolder"
         ("id","organizationId","legalEntityId","name","category","sensitivity","active","systemFolder","createdById")
       SELECT $1,$2,$3,$4,$5,$6,TRUE,TRUE,$7
       WHERE NOT EXISTS(
         SELECT 1 FROM "CompanyDocumentFolder"
         WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "parentFolderId" IS NULL
           AND lower("name")=lower($4) AND "active"=TRUE
       )`,
      randomUUID(), auth.organizationId, entityId, name, category, sensitivity, auth.userId,
    );
  }
}

async function folderById(prisma: PrismaClient, auth: AuthContext, folderId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT * FROM "CompanyDocumentFolder"
     WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,
    auth.organizationId,
    selectedEntityId(auth),
    folderId,
  );
  if (!rows[0]) throw httpError(404, 'Company document folder was not found');
  ensureSensitivity(auth, rows[0].sensitivity);
  return rows[0];
}

async function documentById(prisma: PrismaClient, auth: AuthContext, documentId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT document.*,folder."name" AS "folderName"
     FROM "CompanyDocument" document
     JOIN "CompanyDocumentFolder" folder ON folder."id"=document."folderId"
     WHERE document."organizationId"=$1 AND document."legalEntityId"=$2 AND document."id"=$3 LIMIT 1`,
    auth.organizationId,
    selectedEntityId(auth),
    documentId,
  );
  if (!rows[0]) throw httpError(404, 'Company document was not found');
  ensureSensitivity(auth, rows[0].sensitivity);
  return rows[0];
}

async function recordEvent(
  prisma: PrismaClient,
  auth: AuthContext,
  eventType: string,
  details: Record<string, unknown>,
  folderId?: string | null,
  documentId?: string | null,
  versionId?: string | null,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompanyDocumentEvent"
       ("id","organizationId","legalEntityId","folderId","documentId","versionId","actorUserId","eventType","details","ipAddress","userAgent")
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
    randomUUID(), auth.organizationId, selectedEntityId(auth), folderId ?? null, documentId ?? null,
    versionId ?? null, auth.userId, eventType, JSON.stringify(details), auth.ipAddress ?? null, auth.userAgent ?? null,
  );
}

export const registerCompanyDocumentRoutes = (
  app: express.Express,
  prisma: PrismaClient,
  dependencies: Dependencies,
) => {
  const { authOf, audit } = dependencies;

  app.get('/api/admin/company-documents/tree', async (_req, res, next) => {
    try {
      const auth = authOf(res); ensureRead(auth); await seedFolders(prisma, auth);
      const entityId = selectedEntityId(auth);
      const [folders, documents] = await Promise.all([
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT folder.*,
             (SELECT count(*)::int FROM "CompanyDocument" document
              WHERE document."organizationId"=folder."organizationId" AND document."legalEntityId"=folder."legalEntityId"
                AND document."folderId"=folder."id" AND document."status"<>'ARCHIVED') AS "documentCount"
           FROM "CompanyDocumentFolder" folder
           WHERE folder."organizationId"=$1 AND folder."legalEntityId"=$2 AND folder."active"=TRUE
           ORDER BY folder."parentFolderId" NULLS FIRST,folder."name"`,
          auth.organizationId, entityId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT document.*,folder."name" AS "folderName",
             version."originalFileName",version."mimeType",version."sizeBytes",version."sha256",version."createdAt" AS "versionCreatedAt",
             version."uploadedById"
           FROM "CompanyDocument" document
           JOIN "CompanyDocumentFolder" folder ON folder."id"=document."folderId"
           LEFT JOIN "CompanyDocumentVersion" version
             ON version."documentId"=document."id" AND version."version"=document."currentVersion"
           WHERE document."organizationId"=$1 AND document."legalEntityId"=$2
           ORDER BY document."status",document."title"`,
          auth.organizationId, entityId,
        ),
      ]);
      const visibleFolders = folders.filter((folder) => {
        try { ensureSensitivity(auth, folder.sensitivity); return true; } catch { return false; }
      });
      const visibleFolderIds = new Set(visibleFolders.map((folder) => String(folder.id)));
      const visibleDocuments = documents.filter((document) => {
        if (!visibleFolderIds.has(String(document.folderId))) return false;
        try { ensureSensitivity(auth, document.sensitivity); return true; } catch { return false; }
      });
      res.json({ data: { legalEntityId: entityId, folders: visibleFolders, documents: visibleDocuments } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/company-documents/folders', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureWrite(auth); const input = folderSchema.parse(req.body);
      ensureSensitivity(auth, input.sensitivity);
      if (input.parentFolderId) {
        const parent = await folderById(prisma, auth, input.parentFolderId);
        ensureSensitivity(auth, parent.sensitivity);
      }
      const id = randomUUID();
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "CompanyDocumentFolder"
           ("id","organizationId","legalEntityId","parentFolderId","name","category","description","sensitivity","active","systemFolder","createdById")
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE,FALSE,$9) RETURNING *`,
        id, auth.organizationId, selectedEntityId(auth), input.parentFolderId ?? null, input.name, input.category,
        input.description ?? null, input.sensitivity, auth.userId,
      );
      await recordEvent(prisma, auth, 'FOLDER_CREATED', { name: input.name, category: input.category }, id);
      await audit?.(auth, 'CREATE_COMPANY_DOCUMENT_FOLDER', 'CompanyDocumentFolder', id, { legalEntityId: selectedEntityId(auth), name: input.name });
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/company-documents/folders/:folderId', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureWrite(auth); const current = await folderById(prisma, auth, req.params.folderId);
      const input = folderPatchSchema.parse(req.body);
      if (current.systemFolder === true && input.active === false) throw httpError(409, 'System company folders cannot be archived');
      if (input.sensitivity) ensureSensitivity(auth, input.sensitivity);
      if (input.parentFolderId === req.params.folderId) throw httpError(409, 'A folder cannot contain itself');
      if (input.parentFolderId) await folderById(prisma, auth, input.parentFolderId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "CompanyDocumentFolder" SET
           "parentFolderId"=CASE WHEN $4::boolean THEN $5 ELSE "parentFolderId" END,
           "name"=COALESCE($6,"name"),"category"=COALESCE($7,"category"),
           "description"=CASE WHEN $8::boolean THEN $9 ELSE "description" END,
           "sensitivity"=COALESCE($10,"sensitivity"),"active"=COALESCE($11,"active"),"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 RETURNING *`,
        auth.organizationId, selectedEntityId(auth), req.params.folderId,
        Object.hasOwn(input, 'parentFolderId'), input.parentFolderId ?? null,
        input.name ?? null, input.category ?? null, Object.hasOwn(input, 'description'), input.description ?? null,
        input.sensitivity ?? null, input.active ?? null,
      );
      await recordEvent(prisma, auth, 'FOLDER_UPDATED', { before: current, after: input }, req.params.folderId);
      await audit?.(auth, 'UPDATE_COMPANY_DOCUMENT_FOLDER', 'CompanyDocumentFolder', req.params.folderId, input);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/company-documents/files', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureWrite(auth); const input = uploadSchema.parse(req.body);
      let content: Buffer;
      try { content = Buffer.from(input.contentBase64.replace(/^data:[^;]+;base64,/, ''), 'base64'); }
      catch { throw httpError(400, 'Document content is not valid base64'); }
      if (!content.length) throw httpError(400, 'Uploaded document is empty');
      if (content.length > MAX_FILE_BYTES) throw httpError(413, 'Company documents may not exceed 25 MB per version');
      const sha256 = createHash('sha256').update(content).digest('hex');
      const entityId = selectedEntityId(auth);

      let documentId = input.documentId || null;
      let version = 1;
      let folderId = input.folderId || null;
      if (documentId) {
        const current = await documentById(prisma, auth, documentId);
        folderId = String(current.folderId);
        version = Number(current.currentVersion || 0) + 1;
        ensureSensitivity(auth, current.sensitivity);
      } else {
        if (!folderId) throw httpError(400, 'Folder is required for a new company document');
        await folderById(prisma, auth, folderId);
        ensureSensitivity(auth, input.sensitivity);
        documentId = randomUUID();
      }

      const versionId = randomUUID();
      await prisma.$transaction(async (tx) => {
        if (version === 1) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "CompanyDocument"
               ("id","organizationId","legalEntityId","folderId","title","documentType","status","sensitivity","currentVersion","effectiveDate","expirationDate","notes","metadata","createdById","updatedById")
             VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',$7,1,$8,$9,$10,$11::jsonb,$12,$12)`,
            documentId, auth.organizationId, entityId, folderId,
            input.title || input.originalFileName, input.documentType, input.sensitivity,
            asDate(input.effectiveDate), asDate(input.expirationDate), input.notes ?? null,
            JSON.stringify(input.metadata), auth.userId,
          );
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO "CompanyDocumentVersion"
             ("id","organizationId","legalEntityId","documentId","version","originalFileName","mimeType","sizeBytes","sha256","content","changeNote","uploadedById")
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          versionId, auth.organizationId, entityId, documentId, version, safeFileName(input.originalFileName),
          input.mimeType, content.length, sha256, content, input.changeNote ?? null, auth.userId,
        );
        if (version > 1) {
          await tx.$executeRawUnsafe(
            `UPDATE "CompanyDocument" SET "currentVersion"=$1,"updatedById"=$2,"updatedAt"=NOW()
             WHERE "organizationId"=$3 AND "legalEntityId"=$4 AND "id"=$5`,
            version, auth.userId, auth.organizationId, entityId, documentId,
          );
        }
      });
      await recordEvent(prisma, auth, version === 1 ? 'DOCUMENT_UPLOADED' : 'DOCUMENT_VERSION_UPLOADED',
        { version, originalFileName: input.originalFileName, mimeType: input.mimeType, sizeBytes: content.length, sha256 },
        folderId, documentId, versionId);
      await audit?.(auth, version === 1 ? 'CREATE_COMPANY_DOCUMENT' : 'CREATE_COMPANY_DOCUMENT_VERSION', 'CompanyDocument', documentId, { version, sha256, sizeBytes: content.length });
      res.status(201).json({ data: { id: documentId, folderId, versionId, version, sha256, sizeBytes: content.length } });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/company-documents/files/:documentId/versions', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureRead(auth); await documentById(prisma, auth, req.params.documentId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id","documentId","version","originalFileName","mimeType","sizeBytes","sha256","changeNote","uploadedById","createdAt"
         FROM "CompanyDocumentVersion"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "documentId"=$3 ORDER BY "version" DESC`,
        auth.organizationId, selectedEntityId(auth), req.params.documentId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/company-documents/files/:documentId/download', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureRead(auth); const document = await documentById(prisma, auth, req.params.documentId);
      const requestedVersion = Number(req.query.version || document.currentVersion);
      if (!Number.isInteger(requestedVersion) || requestedVersion < 1) throw httpError(400, 'Invalid document version');
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string; originalFileName: string; mimeType: string; sizeBytes: number; sha256: string; content: Buffer }>>(
        `SELECT "id","originalFileName","mimeType","sizeBytes","sha256","content"
         FROM "CompanyDocumentVersion"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "documentId"=$3 AND "version"=$4 LIMIT 1`,
        auth.organizationId, selectedEntityId(auth), req.params.documentId, requestedVersion,
      );
      const version = rows[0];
      if (!version) throw httpError(404, 'Document version was not found');
      await recordEvent(prisma, auth, 'DOCUMENT_DOWNLOADED', { version: requestedVersion, sha256: version.sha256 }, String(document.folderId), req.params.documentId, version.id);
      res.setHeader('Content-Type', version.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', String(version.sizeBytes));
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(version.originalFileName)}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(version.content);
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/company-documents/files/:documentId', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureWrite(auth); const current = await documentById(prisma, auth, req.params.documentId);
      const input = documentPatchSchema.parse(req.body);
      if (input.sensitivity) ensureSensitivity(auth, input.sensitivity);
      if (input.folderId) await folderById(prisma, auth, input.folderId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "CompanyDocument" SET
           "folderId"=COALESCE($4,"folderId"),"title"=COALESCE($5,"title"),"documentType"=COALESCE($6,"documentType"),
           "status"=COALESCE($7,"status"),"sensitivity"=COALESCE($8,"sensitivity"),
           "effectiveDate"=CASE WHEN $9::boolean THEN $10 ELSE "effectiveDate" END,
           "expirationDate"=CASE WHEN $11::boolean THEN $12 ELSE "expirationDate" END,
           "notes"=CASE WHEN $13::boolean THEN $14 ELSE "notes" END,
           "metadata"=COALESCE($15::jsonb,"metadata"),"updatedById"=$16,"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 RETURNING *`,
        auth.organizationId, selectedEntityId(auth), req.params.documentId,
        input.folderId ?? null, input.title ?? null, input.documentType ?? null, input.status ?? null, input.sensitivity ?? null,
        Object.hasOwn(input, 'effectiveDate'), asDate(input.effectiveDate),
        Object.hasOwn(input, 'expirationDate'), asDate(input.expirationDate),
        Object.hasOwn(input, 'notes'), input.notes ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null, auth.userId,
      );
      await recordEvent(prisma, auth, input.status === 'ARCHIVED' ? 'DOCUMENT_ARCHIVED' : 'DOCUMENT_UPDATED', { before: current, after: input }, String(rows[0].folderId), req.params.documentId);
      await audit?.(auth, input.status === 'ARCHIVED' ? 'ARCHIVE_COMPANY_DOCUMENT' : 'UPDATE_COMPANY_DOCUMENT', 'CompanyDocument', req.params.documentId, input);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/company-documents/events', async (req, res, next) => {
    try {
      const auth = authOf(res); ensureRead(auth);
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
      const documentId = typeof req.query.documentId === 'string' ? req.query.documentId.trim() : '';
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "CompanyDocumentEvent"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND ($3='' OR "documentId"=$3)
         ORDER BY "createdAt" DESC LIMIT $4`,
        auth.organizationId, selectedEntityId(auth), documentId, limit,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });
};
