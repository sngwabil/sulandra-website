import { randomUUID } from 'node:crypto';
import type express from 'express';
import type { PrismaClient } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  legalEntityId?: string;
  enterpriseOwner?: boolean;
};
type Dependencies = {
  authOf: (response: express.Response) => AuthContext;
  audit?: (auth: Partial<AuthContext>, action: string, resourceType: string, resourceId?: string, metadata?: object) => Promise<void>;
};

const readRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.AUDITOR, UserRole.DSP,
  UserRole.DELEGATING_NURSE, UserRole.LPN, UserRole.RN, UserRole.HOUSE_MANAGER,
  UserRole.BILLING_SPECIALIST, UserRole.CEO, UserRole.DOO,
]);
const managementRoles = new Set<UserRole>([
  UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.DELEGATING_NURSE,
  UserRole.RN, UserRole.HOUSE_MANAGER, UserRole.CEO, UserRole.DOO,
]);
const clean = (value: unknown, max = 5000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const httpError = (status: number, message: string, details?: unknown) => Object.assign(new Error(message), { status, details });
const owner = (a: AuthContext) => a.enterpriseOwner === true || String(a.email || '').trim().toLowerCase() === 'admin@sulandrahealth.com';
const entity = (a: AuthContext) => {
  if (!a.legalEntityId) throw httpError(409, 'Select Sulandra Community Living Services (SCLS) before documenting DODD services');
  return a.legalEntityId;
};
const elevated = (a: AuthContext) => owner(a) || managementRoles.has(a.role) || a.role === UserRole.AUDITOR || a.role === UserRole.BILLING_SPECIALIST;
const canWrite = (a: AuthContext) => owner(a) || managementRoles.has(a.role) || [UserRole.DSP, UserRole.LPN].includes(a.role);
const canManageRetention = (a: AuthContext) => owner(a) || managementRoles.has(a.role) || a.role === UserRole.BILLING_SPECIALIST;

const createSchema = z.object({
  documentationProfileCode: z.string().trim().min(1).max(120),
  serviceType: z.string().trim().min(1).max(200),
  serviceCode: z.string().trim().max(120).optional().nullable(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  homeId: z.string().trim().max(120).optional().nullable(),
  authorizationId: z.string().trim().max(120).optional().nullable(),
  evvVisitId: z.string().trim().max(120).optional().nullable(),
  clinicalTaskId: z.string().trim().max(120).optional().nullable(),
  placeOfService: z.string().trim().max(500).optional().nullable(),
  individualMedicaidId: z.string().trim().max(80).optional().nullable(),
  providerName: z.string().trim().max(300).optional().nullable(),
  providerIdentifier: z.string().trim().max(120).optional().nullable(),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  units: z.coerce.number().nonnegative().optional().nullable(),
  unitType: z.string().trim().max(80).optional().nullable(),
  groupSize: z.coerce.number().int().positive().optional().nullable(),
  serviceNarrative: z.string().trim().max(20_000).optional().nullable(),
  individualResponse: z.string().trim().max(10_000).optional().nullable(),
  serviceSpecificData: z.record(z.unknown()).default({}),
});
const patchSchema = createSchema.partial().omit({ documentationProfileCode: true, serviceDate: true });
const signSchema = z.object({
  signatureIntent: z.string().trim().min(3).max(500),
  signerDisplayName: z.string().trim().min(2).max(300),
  signerCredentials: z.string().trim().max(200).optional().nullable(),
});
const voidSchema = z.object({ reason: z.string().trim().min(5).max(2000) });
const retentionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('PAYMENT_RECEIVED'), at: z.string().datetime() }),
  z.object({ action: z.literal('AUDIT_OPENED'), at: z.string().datetime(), reason: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal('AUDIT_RESOLVED'), at: z.string().datetime(), reason: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal('LEGAL_HOLD_SET'), reason: z.string().trim().min(3).max(2000) }),
  z.object({ action: z.literal('LEGAL_HOLD_RELEASED'), reason: z.string().trim().min(3).max(2000) }),
]);

async function ensureScls(prisma: PrismaClient, a: AuthContext) {
  if (!readRoles.has(a.role) && !owner(a)) throw httpError(403, 'DODD service-documentation access is required');
  const rows = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
    `SELECT "code" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    a.organizationId, entity(a),
  );
  if (rows[0]?.code !== 'SCLS') throw httpError(409, 'Select Sulandra Community Living Services (SCLS)');
}

async function patientAllowed(prisma: PrismaClient, a: AuthContext, patientId: string) {
  if (elevated(a)) return;
  const rows = await prisma.$queryRawUnsafe<Array<{ allowed: boolean }>>(
    `SELECT EXISTS(
       SELECT 1 FROM "SpireEmployeeClientAssignment"
        WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 AND "clientId"=$4
       UNION ALL
       SELECT 1 FROM "SpirePatientHomeAssignment" p
       JOIN "SpireEmployeeHomeAssignment" h
         ON h."organizationId"=p."organizationId" AND h."legalEntityId"=p."legalEntityId" AND h."homeId"=p."homeId"
       WHERE p."organizationId"=$1 AND p."legalEntityId"=$2 AND h."userId"=$3 AND p."patientId"=$4
         AND (p."endsAt" IS NULL OR p."endsAt">NOW())
     ) AS allowed`,
    a.organizationId, entity(a), a.userId, patientId,
  );
  if (!rows[0]?.allowed) throw httpError(403, 'This individual is outside your assigned SCLS scope');
}

async function loadDocument(prisma: PrismaClient, a: AuthContext, patientId: string, id: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT d.*,to_jsonb(p) AS "profile"
       FROM "SpireDoddServiceDocument" d
       JOIN "SpireDoddDocumentationProfile" p ON p."code"=d."documentationProfileCode"
      WHERE d."organizationId"=$1 AND d."legalEntityId"=$2 AND d."patientId"=$3 AND d."id"=$4 LIMIT 1`,
    a.organizationId, entity(a), patientId, id,
  );
  if (!rows[0]) throw httpError(404, 'DODD service document was not found');
  return rows[0];
}

async function documentEvent(
  prisma: PrismaClient, a: AuthContext, patientId: string, documentId: string,
  eventType: string, fromStatus: string | null, toStatus: string | null,
  reason: string | null, beforeValue: unknown, afterValue: unknown,
) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "SpireDoddServiceDocumentEvent"(
       "organizationId","legalEntityId","patientId","serviceDocumentId","eventType","fromStatus","toStatus",
       "actorUserId","actorEmail","reason","beforeValue","afterValue"
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,
    a.organizationId, entity(a), patientId, documentId, eventType, fromStatus, toStatus,
    a.userId, a.email ?? null, reason,
    beforeValue == null ? null : JSON.stringify(beforeValue),
    afterValue == null ? null : JSON.stringify(afterValue),
  );
}

function jsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function requiredSpecificFields(profile: Record<string, unknown>) {
  return Array.isArray(profile.requiredServiceSpecificFields)
    ? profile.requiredServiceSpecificFields.map(String)
    : [];
}
function validateComplete(row: Record<string, unknown>) {
  const profile = jsonObject(row.profile);
  const errors: string[] = [];
  const need = (key: string, label: string) => { if (!clean(row[key], 20_000)) errors.push(`${label} is required`); };
  need('serviceType', 'Type of service');
  need('individualName', 'Individual name');
  need('individualMedicaidId', 'Individual Medicaid ID');
  need('providerName', 'Provider name');
  need('providerIdentifier', 'Provider identifier/contract number');
  if (profile.requiresPlace === true) need('placeOfService', 'Place of service');
  if (profile.requiresStartStop === true && (!row.startAt || !row.endAt)) errors.push('Service start and stop times are required');
  if (profile.requiresUnits === true && (row.units === null || row.units === undefined)) errors.push('Delivered units/time are required');
  if (profile.requiresGroupSize === true && !Number(row.groupSize || 0)) errors.push('Group size is required');
  if (profile.requiresNarrative === true) need('serviceNarrative', 'ISP-related service description/details');
  if (profile.requiresIndividualResponse === true) need('individualResponse', 'Individual response/progress toward outcomes');
  const specific = jsonObject(row.serviceSpecificData);
  for (const key of requiredSpecificFields(profile)) {
    const value = specific[key];
    const missing = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (missing) errors.push(`Service-specific field ${key} is required`);
  }
  return errors;
}

async function validateLinks(prisma: PrismaClient, a: AuthContext, patientId: string, row: Record<string, unknown>) {
  if (row.authorizationId) {
    const auths = await prisma.$queryRawUnsafe<Array<{ patientId: string; serviceCode: string }>>(
      `SELECT "patientId","serviceCode" FROM "SpireServiceAuthorization"
        WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      a.organizationId, String(row.authorizationId),
    );
    if (!auths[0] || auths[0].patientId !== patientId) throw httpError(409, 'Linked authorization does not belong to this individual');
    if (row.serviceCode && auths[0].serviceCode && String(row.serviceCode) !== auths[0].serviceCode) {
      throw httpError(409, 'Service-document code does not match the linked authorization');
    }
  }
  if (row.evvVisitId) {
    const visits = await prisma.$queryRawUnsafe<Array<{ patientId: string; serviceCode: string }>>(
      `SELECT "patientId","serviceCode" FROM "SpireEvvVisit"
        WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      a.organizationId, String(row.evvVisitId),
    );
    if (!visits[0] || visits[0].patientId !== patientId) throw httpError(409, 'Linked EVV visit does not belong to this individual');
    if (row.serviceCode && visits[0].serviceCode && String(row.serviceCode) !== visits[0].serviceCode) {
      throw httpError(409, 'Service-document code does not match the linked EVV visit');
    }
  }
}

export const registerSpireDoddServiceDocumentationRoutes = (
  app: express.Express, prisma: PrismaClient, deps: Dependencies,
) => {
  const { authOf, audit } = deps;

  app.get('/api/spire/dodd/documentation-profiles', async (_req, res, next) => {
    try {
      const a = authOf(res); await ensureScls(prisma, a);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireDoddDocumentationProfile" WHERE "active"=TRUE ORDER BY "name"`,
      );
      res.json({ data: rows });
    } catch (e) { next(e); }
  });

  app.get('/api/spire/patients/:patientId/dodd/service-documents', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await ensureScls(prisma, a); await patientAllowed(prisma, a, patientId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT d.*,r."policyCode",r."paymentReceivedAt",r."minimumRetainUntil",r."auditOpenedAt",r."auditResolvedAt",
                r."legalHold",r."calculatedRetainUntil",r."dispositionStatus"
           FROM "SpireDoddServiceDocument" d
           LEFT JOIN "SpireRecordRetention" r ON r."organizationId"=d."organizationId"
            AND r."resourceType"='DODD_SERVICE_DOCUMENT' AND r."resourceId"=d."id"
          WHERE d."organizationId"=$1 AND d."legalEntityId"=$2 AND d."patientId"=$3
          ORDER BY d."serviceDate" DESC,d."createdAt" DESC LIMIT 1000`,
        a.organizationId, entity(a), patientId,
      );
      res.json({ data: rows });
    } catch (e) { next(e); }
  });

  app.get('/api/spire/patients/:patientId/dodd/service-documents/:documentId', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await ensureScls(prisma, a); await patientAllowed(prisma, a, patientId);
      const document = await loadDocument(prisma, a, patientId, req.params.documentId);
      const [events, retention, retentionEvents] = await Promise.all([
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireDoddServiceDocumentEvent" WHERE "organizationId"=$1 AND "serviceDocumentId"=$2 ORDER BY "createdAt"`,
          a.organizationId, req.params.documentId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT * FROM "SpireRecordRetention" WHERE "organizationId"=$1 AND "resourceType"='DODD_SERVICE_DOCUMENT' AND "resourceId"=$2 LIMIT 1`,
          a.organizationId, req.params.documentId,
        ),
        prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT e.* FROM "SpireRecordRetentionEvent" e JOIN "SpireRecordRetention" r ON r."id"=e."retentionId"
            WHERE r."organizationId"=$1 AND r."resourceType"='DODD_SERVICE_DOCUMENT' AND r."resourceId"=$2 ORDER BY e."createdAt"`,
          a.organizationId, req.params.documentId,
        ),
      ]);
      res.json({ data: { document, events, retention: retention[0] ?? null, retentionEvents } });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/dodd/service-documents', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await ensureScls(prisma, a); await patientAllowed(prisma, a, patientId);
      if (!canWrite(a) || a.role === UserRole.AUDITOR) throw httpError(403, 'DODD service-document creation requires direct-care or management access');
      const i = createSchema.parse(req.body);
      const profiles = await prisma.$queryRawUnsafe<Array<{ code: string }>>(
        `SELECT "code" FROM "SpireDoddDocumentationProfile" WHERE "code"=$1 AND "active"=TRUE AND $2::date>="effectiveFrom" AND ("effectiveTo" IS NULL OR $2::date<="effectiveTo") LIMIT 1`,
        i.documentationProfileCode, i.serviceDate,
      );
      if (!profiles[0]) throw httpError(409, 'The selected documentation profile is not active for this service date');
      const patients = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id","firstName","preferredName","lastName" FROM "SpirePatient" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
        a.organizationId, patientId,
      );
      const patient = patients[0]; if (!patient) throw httpError(404, 'Individual was not found');
      const individualName = [patient.preferredName || patient.firstName, patient.lastName].filter(Boolean).join(' ').trim();
      let medicaidId = i.individualMedicaidId ?? null, providerIdentifier = i.providerIdentifier ?? null;
      if (i.evvVisitId) {
        const evv = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT "patientId","patientMedicaidId","providerMedicaidId","serviceCode" FROM "SpireEvvVisit"
            WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, a.organizationId, i.evvVisitId,
        );
        if (!evv[0] || evv[0].patientId !== patientId) throw httpError(409, 'Linked EVV visit does not belong to this individual');
        medicaidId ||= clean(evv[0].patientMedicaidId, 80) || null;
        providerIdentifier ||= clean(evv[0].providerMedicaidId, 120) || null;
        if (i.serviceCode && evv[0].serviceCode && i.serviceCode !== evv[0].serviceCode) throw httpError(409, 'Service code does not match linked EVV visit');
      }
      const userRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT COALESCE(to_jsonb(u)->>'displayName',to_jsonb(u)->>'fullName',to_jsonb(u)->>'name',u."email") AS "displayName",
                COALESCE(to_jsonb(u)->>'credentials',to_jsonb(u)->>'title',u."role"::text) AS "credentials"
           FROM "User" u WHERE u."organizationId"=$1 AND u."id"=$2 LIMIT 1`, a.organizationId, a.userId,
      );
      const id = randomUUID();
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "SpireDoddServiceDocument"(
          "id","organizationId","legalEntityId","patientId","homeId","authorizationId","evvVisitId","clinicalTaskId",
          "documentationProfileCode","serviceType","serviceCode","serviceDate","placeOfService","individualName","individualMedicaidId",
          "providerName","providerIdentifier","staffUserId","staffDisplayName","staffCredentials","startAt","endAt","units","unitType",
          "groupSize","serviceNarrative","individualResponse","serviceSpecificData","status","createdByUserId"
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13,$14,$15,$16,$17,$18,$19,$20,$21::timestamptz,$22::timestamptz,$23,$24,$25,$26,$27,$28::jsonb,'DRAFT',$18)
        RETURNING *`,
        id, a.organizationId, entity(a), patientId, i.homeId ?? null, i.authorizationId ?? null, i.evvVisitId ?? null, i.clinicalTaskId ?? null,
        i.documentationProfileCode, i.serviceType, i.serviceCode ?? null, i.serviceDate, i.placeOfService ?? null, individualName, medicaidId,
        i.providerName ?? null, providerIdentifier, a.userId, clean(userRows[0]?.displayName, 300) || a.email || null,
        clean(userRows[0]?.credentials, 200) || null, i.startAt ?? null, i.endAt ?? null, i.units ?? null, i.unitType ?? null,
        i.groupSize ?? null, i.serviceNarrative ?? null, i.individualResponse ?? null, JSON.stringify(i.serviceSpecificData),
      );
      await validateLinks(prisma, a, patientId, rows[0]);
      const retentionId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireRecordRetention"("id","organizationId","legalEntityId","resourceType","resourceId","policyCode")
         VALUES($1,$2,$3,'DODD_SERVICE_DOCUMENT',$4,'DODD_SERVICE_DOCUMENTATION_6Y')`,
        retentionId, a.organizationId, entity(a), id,
      );
      await documentEvent(prisma, a, patientId, id, 'CREATED', null, 'DRAFT', null, null, rows[0]);
      await audit?.(a, 'CREATE_DODD_SERVICE_DOCUMENT', 'SpireDoddServiceDocument', id, { patientId, serviceType: i.serviceType, serviceDate: i.serviceDate });
      res.status(201).json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  app.patch('/api/spire/patients/:patientId/dodd/service-documents/:documentId', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await ensureScls(prisma, a); await patientAllowed(prisma, a, patientId);
      if (!canWrite(a) || a.role === UserRole.AUDITOR) throw httpError(403, 'DODD service-document editing requires direct-care or management access');
      const current = await loadDocument(prisma, a, patientId, req.params.documentId);
      if (!['DRAFT','COMPLETE'].includes(String(current.status))) throw httpError(409, 'Signed or voided service documentation cannot be edited');
      const i = patchSchema.parse(req.body);
      const merged = { ...current, ...i, serviceSpecificData: i.serviceSpecificData === undefined ? current.serviceSpecificData : i.serviceSpecificData };
      if (i.startAt !== undefined || i.endAt !== undefined) {
        const start = i.startAt === undefined ? current.startAt : i.startAt;
        const end = i.endAt === undefined ? current.endAt : i.endAt;
        if (start && end && new Date(String(end)) <= new Date(String(start))) throw httpError(400, 'Service end time must be after start time');
      }
      await validateLinks(prisma, a, patientId, merged);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireDoddServiceDocument" SET
          "serviceType"=COALESCE($1,"serviceType"),"serviceCode"=CASE WHEN $2 THEN $3 ELSE "serviceCode" END,
          "homeId"=CASE WHEN $4 THEN $5 ELSE "homeId" END,"authorizationId"=CASE WHEN $6 THEN $7 ELSE "authorizationId" END,
          "evvVisitId"=CASE WHEN $8 THEN $9 ELSE "evvVisitId" END,"clinicalTaskId"=CASE WHEN $10 THEN $11 ELSE "clinicalTaskId" END,
          "placeOfService"=CASE WHEN $12 THEN $13 ELSE "placeOfService" END,"individualMedicaidId"=CASE WHEN $14 THEN $15 ELSE "individualMedicaidId" END,
          "providerName"=CASE WHEN $16 THEN $17 ELSE "providerName" END,"providerIdentifier"=CASE WHEN $18 THEN $19 ELSE "providerIdentifier" END,
          "startAt"=CASE WHEN $20 THEN $21::timestamptz ELSE "startAt" END,"endAt"=CASE WHEN $22 THEN $23::timestamptz ELSE "endAt" END,
          "units"=CASE WHEN $24 THEN $25::numeric ELSE "units" END,"unitType"=CASE WHEN $26 THEN $27 ELSE "unitType" END,
          "groupSize"=CASE WHEN $28 THEN $29::integer ELSE "groupSize" END,"serviceNarrative"=CASE WHEN $30 THEN $31 ELSE "serviceNarrative" END,
          "individualResponse"=CASE WHEN $32 THEN $33 ELSE "individualResponse" END,"serviceSpecificData"=CASE WHEN $34 THEN $35::jsonb ELSE "serviceSpecificData" END,
          "status"=CASE WHEN "status"='COMPLETE' THEN 'DRAFT' ELSE "status" END,"completedAt"=NULL,"completedByUserId"=NULL,"updatedAt"=NOW()
         WHERE "organizationId"=$36 AND "legalEntityId"=$37 AND "patientId"=$38 AND "id"=$39 RETURNING *`,
        i.serviceType ?? null, Object.hasOwn(i,'serviceCode'), i.serviceCode ?? null,
        Object.hasOwn(i,'homeId'), i.homeId ?? null, Object.hasOwn(i,'authorizationId'), i.authorizationId ?? null,
        Object.hasOwn(i,'evvVisitId'), i.evvVisitId ?? null, Object.hasOwn(i,'clinicalTaskId'), i.clinicalTaskId ?? null,
        Object.hasOwn(i,'placeOfService'), i.placeOfService ?? null, Object.hasOwn(i,'individualMedicaidId'), i.individualMedicaidId ?? null,
        Object.hasOwn(i,'providerName'), i.providerName ?? null, Object.hasOwn(i,'providerIdentifier'), i.providerIdentifier ?? null,
        Object.hasOwn(i,'startAt'), i.startAt ?? null, Object.hasOwn(i,'endAt'), i.endAt ?? null,
        Object.hasOwn(i,'units'), i.units ?? null, Object.hasOwn(i,'unitType'), i.unitType ?? null,
        Object.hasOwn(i,'groupSize'), i.groupSize ?? null, Object.hasOwn(i,'serviceNarrative'), i.serviceNarrative ?? null,
        Object.hasOwn(i,'individualResponse'), i.individualResponse ?? null, Object.hasOwn(i,'serviceSpecificData'), JSON.stringify(i.serviceSpecificData ?? {}),
        a.organizationId, entity(a), patientId, req.params.documentId,
      );
      await documentEvent(prisma, a, patientId, req.params.documentId, 'EDITED', String(current.status), String(rows[0].status), null, current, rows[0]);
      await audit?.(a, 'EDIT_DODD_SERVICE_DOCUMENT', 'SpireDoddServiceDocument', req.params.documentId, { patientId });
      res.json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/dodd/service-documents/:documentId/complete', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await ensureScls(prisma, a); await patientAllowed(prisma, a, patientId);
      if (!canWrite(a) || a.role === UserRole.AUDITOR) throw httpError(403, 'DODD service-document completion requires direct-care or management access');
      const current = await loadDocument(prisma, a, patientId, req.params.documentId);
      if (String(current.status) !== 'DRAFT') throw httpError(409, 'Only draft service documentation can be completed');
      await validateLinks(prisma, a, patientId, current);
      const validationErrors = validateComplete(current);
      if (validationErrors.length) throw httpError(409, 'DODD service documentation is incomplete', { validationErrors });
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireDoddServiceDocument" SET "status"='COMPLETE',"completedByUserId"=$1,"completedAt"=NOW(),"updatedAt"=NOW()
          WHERE "organizationId"=$2 AND "legalEntityId"=$3 AND "patientId"=$4 AND "id"=$5 RETURNING *`,
        a.userId, a.organizationId, entity(a), patientId, req.params.documentId,
      );
      await documentEvent(prisma, a, patientId, req.params.documentId, 'COMPLETED', 'DRAFT', 'COMPLETE', null, current, rows[0]);
      await audit?.(a, 'COMPLETE_DODD_SERVICE_DOCUMENT', 'SpireDoddServiceDocument', req.params.documentId, { patientId });
      res.json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/dodd/service-documents/:documentId/sign', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await ensureScls(prisma, a); await patientAllowed(prisma, a, patientId);
      if (!canWrite(a) || a.role === UserRole.AUDITOR || !a.email) throw httpError(403, 'Authenticated direct-care identity and email are required to sign service documentation');
      const i = signSchema.parse(req.body), current = await loadDocument(prisma, a, patientId, req.params.documentId);
      if (String(current.status) !== 'COMPLETE') throw httpError(409, 'Complete the required service-document fields before signing');
      const validationErrors = validateComplete(current); if (validationErrors.length) throw httpError(409, 'DODD service documentation is incomplete', { validationErrors });
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireDoddServiceDocument" SET "status"='SIGNED',"signedByUserId"=$1,"signerEmail"=$2,
          "signerDisplayName"=$3,"signerCredentials"=$4,"signatureIntent"=$5,"signedAt"=NOW(),"updatedAt"=NOW()
         WHERE "organizationId"=$6 AND "legalEntityId"=$7 AND "patientId"=$8 AND "id"=$9 RETURNING *`,
        a.userId, a.email, i.signerDisplayName, i.signerCredentials ?? null, i.signatureIntent,
        a.organizationId, entity(a), patientId, req.params.documentId,
      );
      await documentEvent(prisma, a, patientId, req.params.documentId, 'SIGNED', 'COMPLETE', 'SIGNED', i.signatureIntent, current, rows[0]);
      await audit?.(a, 'SIGN_DODD_SERVICE_DOCUMENT', 'SpireDoddServiceDocument', req.params.documentId, { patientId, signerUserId: a.userId });
      res.json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/dodd/service-documents/:documentId/void', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await ensureScls(prisma, a); await patientAllowed(prisma, a, patientId);
      if (!managementRoles.has(a.role) && !owner(a)) throw httpError(403, 'Voiding signed service documentation requires SCLS management access');
      const i = voidSchema.parse(req.body), current = await loadDocument(prisma, a, patientId, req.params.documentId);
      if (String(current.status) !== 'SIGNED') throw httpError(409, 'Only signed service documentation can be voided; drafts should be corrected instead');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireDoddServiceDocument" SET "status"='VOID',"voidedByUserId"=$1,"voidReason"=$2,"voidedAt"=NOW(),"updatedAt"=NOW()
          WHERE "organizationId"=$3 AND "legalEntityId"=$4 AND "patientId"=$5 AND "id"=$6 RETURNING *`,
        a.userId, i.reason, a.organizationId, entity(a), patientId, req.params.documentId,
      );
      await documentEvent(prisma, a, patientId, req.params.documentId, 'VOIDED', 'SIGNED', 'VOID', i.reason, current, rows[0]);
      await audit?.(a, 'VOID_DODD_SERVICE_DOCUMENT', 'SpireDoddServiceDocument', req.params.documentId, { patientId, reason: i.reason });
      res.json({ data: rows[0] });
    } catch (e) { next(e); }
  });

  app.post('/api/spire/patients/:patientId/dodd/service-documents/:documentId/retention', async (req, res, next) => {
    try {
      const a = authOf(res), patientId = req.params.patientId; await ensureScls(prisma, a); await patientAllowed(prisma, a, patientId);
      if (!canManageRetention(a)) throw httpError(403, 'Retention controls require SCLS management or billing access');
      await loadDocument(prisma, a, patientId, req.params.documentId);
      const i = retentionSchema.parse(req.body);
      const currentRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM "SpireRecordRetention" WHERE "organizationId"=$1 AND "resourceType"='DODD_SERVICE_DOCUMENT' AND "resourceId"=$2 LIMIT 1`,
        a.organizationId, req.params.documentId,
      );
      const current = currentRows[0]; if (!current) throw httpError(404, 'Retention record was not found');
      let sql = '', args: unknown[] = [];
      if (i.action === 'PAYMENT_RECEIVED') { sql='"paymentReceivedAt"=$1::timestamptz'; args=[i.at]; }
      if (i.action === 'AUDIT_OPENED') { sql='"auditOpenedAt"=$1::timestamptz,"auditResolvedAt"=NULL'; args=[i.at]; }
      if (i.action === 'AUDIT_RESOLVED') { if (!current.auditOpenedAt) throw httpError(409, 'An audit cannot be resolved before it is opened'); sql='"auditResolvedAt"=$1::timestamptz'; args=[i.at]; }
      if (i.action === 'LEGAL_HOLD_SET') { sql='"legalHold"=TRUE,"legalHoldReason"=$1,"legalHoldSetByUserId"=$2,"legalHoldSetAt"=NOW()'; args=[i.reason,a.userId]; }
      if (i.action === 'LEGAL_HOLD_RELEASED') { if (!current.legalHold) throw httpError(409, 'No legal hold is active'); sql='"legalHold"=FALSE,"legalHoldReason"=NULL,"legalHoldSetByUserId"=NULL,"legalHoldSetAt"=NULL'; args=[]; }
      const bind = args.map((_, index) => `$${index + 1}`); void bind;
      const orgIndex = args.length + 1, idIndex = args.length + 2;
      const updatedRows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "SpireRecordRetention" SET ${sql},"updatedAt"=NOW() WHERE "organizationId"=$${orgIndex} AND "id"=$${idIndex} RETURNING *`,
        ...args, a.organizationId, String(current.id),
      );
      const updated = updatedRows[0];
      await prisma.$executeRawUnsafe(
        `INSERT INTO "SpireRecordRetentionEvent"("organizationId","retentionId","eventType","actorUserId","reason","beforeValue","afterValue")
         VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
        a.organizationId, current.id, i.action, a.userId, 'reason' in i ? i.reason ?? null : null,
        JSON.stringify(current), JSON.stringify(updated),
      );
      await audit?.(a, `DODD_RETENTION_${i.action}`, 'SpireRecordRetention', String(current.id), { patientId, serviceDocumentId: req.params.documentId });
      res.json({ data: updated });
    } catch (e) { next(e); }
  });
};
