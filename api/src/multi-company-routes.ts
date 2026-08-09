import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
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
  audit?: AuditFn;
};

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const code = z.string().trim().min(2).max(80).regex(/^[A-Z][A-Z0-9_]*$/);
const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const metadata = z.record(z.unknown()).optional().default({});

const legalEntityCreateSchema = z.object({
  code,
  legalName: z.string().trim().min(2).max(240),
  displayName: z.string().trim().min(2).max(180),
  entityType: z.enum(['HOLDING', 'OPERATING']).default('OPERATING'),
  status: z.enum(['ACTIVE', 'PLANNED', 'INACTIVE']).default('PLANNED'),
  parentLegalEntityId: nullableText(100),
  isEmployer: z.boolean().default(false),
  isProvider: z.boolean().default(false),
  branding: z.record(z.unknown()).optional().default({}),
  contact: z.record(z.unknown()).optional().default({}),
  metadata,
});

const legalEntityPatchSchema = legalEntityCreateSchema.omit({ code: true }).partial();

const departmentCreateSchema = z.object({
  legalEntityId: z.string().trim().min(1).max(100),
  code,
  name: z.string().trim().min(2).max(180),
  description: nullableText(2_000),
  sharedEnterprise: z.boolean().default(false),
  active: z.boolean().default(true),
  metadata,
});

const departmentPatchSchema = departmentCreateSchema.omit({ legalEntityId: true, code: true }).partial();

const employmentCreateSchema = z.object({
  userId: z.string().trim().min(1).max(100),
  legalEntityId: z.string().trim().min(1).max(100),
  departmentId: nullableText(100),
  employeeNumber: nullableText(80),
  jobTitle: nullableText(160),
  employmentType: z.enum(['OWNER', 'EMPLOYEE', 'CONTRACTOR', 'TEMPORARY', 'VOLUNTEER']).default('EMPLOYEE'),
  status: z.enum(['ACTIVE', 'LEAVE', 'SUSPENDED', 'TERMINATED']).default('ACTIVE'),
  primaryEmployment: z.boolean().default(false),
  startsAt: z.coerce.date().default(() => new Date()),
  endsAt: z.coerce.date().optional().nullable(),
  source: z.string().trim().min(1).max(80).default('MANUAL'),
  metadata,
});

const employmentPatchSchema = employmentCreateSchema.omit({ userId: true, legalEntityId: true }).partial();

const grantCreateSchema = z.object({
  userId: z.string().trim().min(1).max(100),
  scopeType: z.enum(['ENTERPRISE', 'LEGAL_ENTITY', 'DEPARTMENT', 'CLIENT']),
  legalEntityId: nullableText(100),
  departmentId: nullableText(100),
  clientId: nullableText(100),
  roleCode: code.default('MEMBER'),
  permissionKey: code.default('PORTAL_ACCESS'),
  accessLevel: z.enum(['READ', 'WRITE', 'MANAGE']).default('READ'),
  effectiveFrom: z.coerce.date().default(() => new Date()),
  effectiveTo: z.coerce.date().optional().nullable(),
  reason: nullableText(1_000),
  metadata,
}).superRefine((value, context) => {
  if (value.scopeType === 'LEGAL_ENTITY' && !value.legalEntityId) context.addIssue({ code: 'custom', path: ['legalEntityId'], message: 'Legal entity is required for this scope' });
  if (value.scopeType === 'DEPARTMENT' && !value.departmentId) context.addIssue({ code: 'custom', path: ['departmentId'], message: 'Department is required for this scope' });
  if (value.scopeType === 'CLIENT' && !value.clientId) context.addIssue({ code: 'custom', path: ['clientId'], message: 'Client is required for this scope' });
});

const grantPatchSchema = z.object({
  accessLevel: z.enum(['READ', 'WRITE', 'MANAGE']).optional(),
  active: z.boolean().optional(),
  effectiveTo: z.coerce.date().optional().nullable(),
  reason: nullableText(1_000),
  metadata: z.record(z.unknown()).optional(),
});

const enrollmentCreateSchema = z.object({
  clientId: z.string().trim().min(1).max(100),
  legalEntityId: z.string().trim().min(1).max(100),
  departmentId: nullableText(100),
  serviceType: code,
  programCode: nullableText(100),
  status: z.enum(['PENDING', 'ACTIVE', 'PAUSED', 'DISCHARGED', 'INACTIVE']).default('ACTIVE'),
  primaryEnrollment: z.boolean().default(false),
  startsAt: z.coerce.date().default(() => new Date()),
  endsAt: z.coerce.date().optional().nullable(),
  source: z.string().trim().min(1).max(80).default('MANUAL'),
  metadata,
});

const enrollmentPatchSchema = enrollmentCreateSchema.omit({ clientId: true, legalEntityId: true, serviceType: true }).partial();

const notFound = (message: string) => Object.assign(new Error(message), { status: 404 });
const conflict = (message: string) => Object.assign(new Error(message), { status: 409 });
const asJson = (value: unknown) => JSON.stringify(value ?? {});

const actualIdentity = async (prisma: PrismaClient, auth: AuthContext) => {
  const rows = await prisma.$queryRawUnsafe<Array<{ email: string | null; role: string }>>(
    `SELECT "email","role"::text AS "role" FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,
    auth.userId,
    auth.organizationId,
  );
  if (!rows[0]) throw notFound('Signed-in user was not found');
  return { ...rows[0], isOwner: String(rows[0].email ?? '').trim().toLowerCase() === OWNER_EMAIL };
};

export async function getUserEntityContext(prisma: PrismaClient, auth: AuthContext) {
  const identity = await actualIdentity(prisma, auth);
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT entity."id",entity."code",entity."legalName",entity."displayName",entity."entityType",entity."status",
            entity."parentLegalEntityId",entity."isEmployer",entity."isProvider",entity."branding",entity."contact",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',employment."id",'departmentId',employment."departmentId",'departmentCode',department."code",
                'departmentName',department."name",'employeeNumber',employment."employeeNumber",'jobTitle',employment."jobTitle",
                'employmentType',employment."employmentType",'status',employment."status",'primaryEmployment',employment."primaryEmployment",
                'startsAt',employment."startsAt",'endsAt',employment."endsAt"
              ) ORDER BY employment."primaryEmployment" DESC,employment."startsAt")
              FROM "Employment" employment
              LEFT JOIN "Department" department ON department."id"=employment."departmentId"
              WHERE employment."organizationId"=entity."organizationId" AND employment."legalEntityId"=entity."id"
                AND employment."userId"=$2 AND employment."status"<>'TERMINATED'
            ),'[]'::jsonb) AS "employments",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'id',grant_row."id",'scopeType',grant_row."scopeType",'departmentId',grant_row."departmentId",
                'clientId',grant_row."clientId",'roleCode',grant_row."roleCode",'permissionKey',grant_row."permissionKey",
                'accessLevel',grant_row."accessLevel",'effectiveFrom',grant_row."effectiveFrom",'effectiveTo',grant_row."effectiveTo"
              ) ORDER BY grant_row."scopeType",grant_row."permissionKey")
              FROM "UserEntityAccessGrant" grant_row
              WHERE grant_row."organizationId"=entity."organizationId" AND grant_row."userId"=$2 AND grant_row."active"=true
                AND grant_row."effectiveFrom"<=now() AND (grant_row."effectiveTo" IS NULL OR grant_row."effectiveTo">now())
                AND (grant_row."scopeType"='ENTERPRISE' OR grant_row."legalEntityId"=entity."id"
                  OR grant_row."departmentId" IN (SELECT d."id" FROM "Department" d WHERE d."legalEntityId"=entity."id"))
            ),'[]'::jsonb) AS "grants",
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object('id',department."id",'code',department."code",'name',department."name",'sharedEnterprise',department."sharedEnterprise") ORDER BY department."name")
              FROM "Department" department WHERE department."legalEntityId"=entity."id" AND department."active"=true
            ),'[]'::jsonb) AS "departments"
     FROM "LegalEntity" entity
     WHERE entity."organizationId"=$1 AND (
       $3::boolean=true
       OR EXISTS (SELECT 1 FROM "Employment" employment WHERE employment."organizationId"=$1 AND employment."userId"=$2 AND employment."legalEntityId"=entity."id" AND employment."status"<>'TERMINATED')
       OR EXISTS (SELECT 1 FROM "UserEntityAccessGrant" grant_row WHERE grant_row."organizationId"=$1 AND grant_row."userId"=$2 AND grant_row."active"=true
         AND grant_row."effectiveFrom"<=now() AND (grant_row."effectiveTo" IS NULL OR grant_row."effectiveTo">now())
         AND (grant_row."scopeType"='ENTERPRISE' OR grant_row."legalEntityId"=entity."id"
           OR grant_row."departmentId" IN (SELECT d."id" FROM "Department" d WHERE d."legalEntityId"=entity."id")))
     )
     ORDER BY CASE entity."status" WHEN 'ACTIVE' THEN 0 WHEN 'PLANNED' THEN 1 ELSE 2 END,entity."displayName"`,
    auth.organizationId,
    auth.userId,
    identity.isOwner,
  );

  let primaryEntityId: string | null = null;
  for (const row of rows) {
    const employments = Array.isArray(row.employments) ? row.employments as Array<Record<string, unknown>> : [];
    if (employments.some((employment) => employment.primaryEmployment === true)) primaryEntityId = String(row.id);
  }
  if (!primaryEntityId) primaryEntityId = rows.find((row) => row.status === 'ACTIVE')?.id as string | undefined ?? null;

  return {
    primaryEntityId,
    entities: rows,
    enterpriseOwner: identity.isOwner,
    sharedAccess: {
      intranet: true,
      education: true,
    },
  };
}

export function registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  const manager = requireRoles(UserRole.ADMINISTRATOR, UserRole.HR_MANAGER, UserRole.CEO, UserRole.DOO);

  const requireEntity = async (auth: AuthContext, entityId: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      auth.organizationId,
      entityId,
    );
    if (!rows[0]) throw notFound('Legal entity was not found');
  };

  const requireDepartment = async (auth: AuthContext, departmentId: string, legalEntityId?: string | null) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; legalEntityId: string }>>(
      `SELECT "id","legalEntityId" FROM "Department" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      auth.organizationId,
      departmentId,
    );
    if (!rows[0]) throw notFound('Department was not found');
    if (legalEntityId && rows[0].legalEntityId !== legalEntityId) throw conflict('Department does not belong to the selected legal entity');
  };

  const requireUser = async (auth: AuthContext, userId: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "User" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      auth.organizationId,
      userId,
    );
    if (!rows[0]) throw notFound('Employee user was not found');
  };

  const requireClient = async (auth: AuthContext, clientId: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT "id" FROM "SpirePatient" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
      auth.organizationId,
      clientId,
    );
    if (!rows[0]) throw notFound('Client was not found');
  };

  app.get('/api/entity-context', async (_req, res, next) => {
    try {
      res.json({ data: await getUserEntityContext(prisma, authOf(res)) });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/legal-entities', manager, async (_req, res, next) => {
    try {
      const auth = authOf(res);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT entity.*,
                (SELECT count(*)::int FROM "Department" department WHERE department."legalEntityId"=entity."id" AND department."active"=true) AS "departmentCount",
                (SELECT count(*)::int FROM "Employment" employment WHERE employment."legalEntityId"=entity."id" AND employment."status"<>'TERMINATED') AS "activeEmploymentCount",
                (SELECT count(*)::int FROM "ClientEnrollment" enrollment WHERE enrollment."legalEntityId"=entity."id" AND enrollment."status" IN ('PENDING','ACTIVE','PAUSED')) AS "activeClientCount"
         FROM "LegalEntity" entity WHERE entity."organizationId"=$1 ORDER BY entity."displayName"`,
        auth.organizationId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/legal-entities', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = legalEntityCreateSchema.parse(req.body);
      if (input.parentLegalEntityId) await requireEntity(auth, input.parentLegalEntityId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "LegalEntity" ("organizationId","code","legalName","displayName","entityType","status","parentLegalEntityId","isEmployer","isProvider","branding","contact","metadata")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb) RETURNING *`,
        auth.organizationId, input.code, input.legalName, input.displayName, input.entityType, input.status,
        input.parentLegalEntityId ?? null, input.isEmployer, input.isProvider, asJson(input.branding), asJson(input.contact), asJson(input.metadata),
      );
      await audit?.(auth, 'CREATE_LEGAL_ENTITY', 'LegalEntity', String(rows[0].id), { code: input.code, status: input.status });
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/legal-entities/:entityId', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = legalEntityPatchSchema.parse(req.body);
      await requireEntity(auth, req.params.entityId);
      if (input.parentLegalEntityId) await requireEntity(auth, input.parentLegalEntityId);
      if (input.parentLegalEntityId === req.params.entityId) throw conflict('A legal entity cannot be its own parent');
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "LegalEntity" SET
           "legalName"=COALESCE($3,"legalName"),"displayName"=COALESCE($4,"displayName"),"entityType"=COALESCE($5,"entityType"),
           "status"=COALESCE($6,"status"),"parentLegalEntityId"=CASE WHEN $7::boolean THEN $8 ELSE "parentLegalEntityId" END,
           "isEmployer"=COALESCE($9,"isEmployer"),"isProvider"=COALESCE($10,"isProvider"),
           "branding"=COALESCE($11::jsonb,"branding"),"contact"=COALESCE($12::jsonb,"contact"),"metadata"=COALESCE($13::jsonb,"metadata"),"updatedAt"=now()
         WHERE "organizationId"=$1 AND "id"=$2 RETURNING *`,
        auth.organizationId, req.params.entityId, input.legalName ?? null, input.displayName ?? null, input.entityType ?? null,
        input.status ?? null, Object.hasOwn(input, 'parentLegalEntityId'), input.parentLegalEntityId ?? null,
        input.isEmployer ?? null, input.isProvider ?? null, input.branding ? asJson(input.branding) : null,
        input.contact ? asJson(input.contact) : null, input.metadata ? asJson(input.metadata) : null,
      );
      await audit?.(auth, 'UPDATE_LEGAL_ENTITY', 'LegalEntity', req.params.entityId, input);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/departments', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const entityId = typeof req.query.legalEntityId === 'string' ? req.query.legalEntityId : null;
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT department.*,entity."code" AS "legalEntityCode",entity."displayName" AS "legalEntityName"
         FROM "Department" department JOIN "LegalEntity" entity ON entity."id"=department."legalEntityId"
         WHERE department."organizationId"=$1 AND ($2::text IS NULL OR department."legalEntityId"=$2)
         ORDER BY entity."displayName",department."name"`, auth.organizationId, entityId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/departments', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = departmentCreateSchema.parse(req.body);
      await requireEntity(auth, input.legalEntityId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "Department" ("organizationId","legalEntityId","code","name","description","sharedEnterprise","active","metadata")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING *`,
        auth.organizationId, input.legalEntityId, input.code, input.name, input.description ?? null,
        input.sharedEnterprise, input.active, asJson(input.metadata),
      );
      await audit?.(auth, 'CREATE_DEPARTMENT', 'Department', String(rows[0].id), { legalEntityId: input.legalEntityId, code: input.code });
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/departments/:departmentId', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = departmentPatchSchema.parse(req.body);
      await requireDepartment(auth, req.params.departmentId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "Department" SET "name"=COALESCE($3,"name"),
           "description"=CASE WHEN $4::boolean THEN $5 ELSE "description" END,
           "sharedEnterprise"=COALESCE($6,"sharedEnterprise"),"active"=COALESCE($7,"active"),
           "metadata"=COALESCE($8::jsonb,"metadata"),"updatedAt"=now()
         WHERE "organizationId"=$1 AND "id"=$2 RETURNING *`,
        auth.organizationId, req.params.departmentId, input.name ?? null, Object.hasOwn(input, 'description'), input.description ?? null,
        input.sharedEnterprise ?? null, input.active ?? null, input.metadata ? asJson(input.metadata) : null,
      );
      await audit?.(auth, 'UPDATE_DEPARTMENT', 'Department', req.params.departmentId, input);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/employments', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const entityId = typeof req.query.legalEntityId === 'string' ? req.query.legalEntityId : null;
      const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT employment.*,user_row."email",entity."code" AS "legalEntityCode",entity."displayName" AS "legalEntityName",
                department."code" AS "departmentCode",department."name" AS "departmentName"
         FROM "Employment" employment JOIN "User" user_row ON user_row."id"=employment."userId" AND user_row."organizationId"=employment."organizationId"
         JOIN "LegalEntity" entity ON entity."id"=employment."legalEntityId"
         LEFT JOIN "Department" department ON department."id"=employment."departmentId"
         WHERE employment."organizationId"=$1 AND ($2::text IS NULL OR employment."legalEntityId"=$2) AND ($3::text IS NULL OR employment."userId"=$3)
         ORDER BY entity."displayName",user_row."email",employment."startsAt" DESC`, auth.organizationId, entityId, userId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/employments', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = employmentCreateSchema.parse(req.body);
      await Promise.all([requireUser(auth, input.userId), requireEntity(auth, input.legalEntityId)]);
      if (input.departmentId) await requireDepartment(auth, input.departmentId, input.legalEntityId);
      if (input.primaryEmployment) {
        await prisma.$executeRawUnsafe(`UPDATE "Employment" SET "primaryEmployment"=false,"updatedAt"=now() WHERE "organizationId"=$1 AND "userId"=$2 AND "status"<>'TERMINATED'`, auth.organizationId, input.userId);
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "Employment" ("organizationId","userId","legalEntityId","departmentId","employeeNumber","jobTitle","employmentType","status","primaryEmployment","startsAt","endsAt","source","metadata")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
        auth.organizationId, input.userId, input.legalEntityId, input.departmentId ?? null, input.employeeNumber ?? null,
        input.jobTitle ?? null, input.employmentType, input.status, input.primaryEmployment, input.startsAt, input.endsAt ?? null,
        input.source, asJson(input.metadata),
      );
      await audit?.(auth, 'CREATE_EMPLOYMENT', 'Employment', String(rows[0].id), { userId: input.userId, legalEntityId: input.legalEntityId });
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/employments/:employmentId', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = employmentPatchSchema.parse(req.body);
      const current = await prisma.$queryRawUnsafe<Array<{ id: string; userId: string; legalEntityId: string }>>(
        `SELECT "id","userId","legalEntityId" FROM "Employment" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.employmentId,
      );
      if (!current[0]) throw notFound('Employment was not found');
      if (input.departmentId) await requireDepartment(auth, input.departmentId, current[0].legalEntityId);
      if (input.primaryEmployment) {
        await prisma.$executeRawUnsafe(`UPDATE "Employment" SET "primaryEmployment"=false,"updatedAt"=now() WHERE "organizationId"=$1 AND "userId"=$2 AND "id"<>$3 AND "status"<>'TERMINATED'`, auth.organizationId, current[0].userId, req.params.employmentId);
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "Employment" SET
           "departmentId"=CASE WHEN $3::boolean THEN $4 ELSE "departmentId" END,
           "employeeNumber"=CASE WHEN $5::boolean THEN $6 ELSE "employeeNumber" END,
           "jobTitle"=CASE WHEN $7::boolean THEN $8 ELSE "jobTitle" END,
           "employmentType"=COALESCE($9,"employmentType"),"status"=COALESCE($10,"status"),
           "primaryEmployment"=COALESCE($11,"primaryEmployment"),"startsAt"=COALESCE($12,"startsAt"),
           "endsAt"=CASE WHEN $13::boolean THEN $14 ELSE "endsAt" END,
           "source"=COALESCE($15,"source"),"metadata"=COALESCE($16::jsonb,"metadata"),"updatedAt"=now()
         WHERE "organizationId"=$1 AND "id"=$2 RETURNING *`,
        auth.organizationId, req.params.employmentId,
        Object.hasOwn(input, 'departmentId'), input.departmentId ?? null,
        Object.hasOwn(input, 'employeeNumber'), input.employeeNumber ?? null,
        Object.hasOwn(input, 'jobTitle'), input.jobTitle ?? null,
        input.employmentType ?? null, input.status ?? null, input.primaryEmployment ?? null, input.startsAt ?? null,
        Object.hasOwn(input, 'endsAt'), input.endsAt ?? null, input.source ?? null, input.metadata ? asJson(input.metadata) : null,
      );
      await audit?.(auth, 'UPDATE_EMPLOYMENT', 'Employment', req.params.employmentId, input);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/entity-access-grants', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT grant_row.*,user_row."email",entity."displayName" AS "legalEntityName",department."name" AS "departmentName"
         FROM "UserEntityAccessGrant" grant_row JOIN "User" user_row ON user_row."id"=grant_row."userId" AND user_row."organizationId"=grant_row."organizationId"
         LEFT JOIN "LegalEntity" entity ON entity."id"=grant_row."legalEntityId"
         LEFT JOIN "Department" department ON department."id"=grant_row."departmentId"
         WHERE grant_row."organizationId"=$1 AND ($2::text IS NULL OR grant_row."userId"=$2)
         ORDER BY user_row."email",grant_row."scopeType",grant_row."permissionKey"`, auth.organizationId, userId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/entity-access-grants', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = grantCreateSchema.parse(req.body);
      await requireUser(auth, input.userId);
      if (input.legalEntityId) await requireEntity(auth, input.legalEntityId);
      if (input.departmentId) await requireDepartment(auth, input.departmentId, input.legalEntityId);
      if (input.clientId) await requireClient(auth, input.clientId);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "UserEntityAccessGrant" ("organizationId","userId","scopeType","legalEntityId","departmentId","clientId","roleCode","permissionKey","accessLevel","effectiveFrom","effectiveTo","grantedById","reason","metadata")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb) RETURNING *`,
        auth.organizationId, input.userId, input.scopeType, input.legalEntityId ?? null, input.departmentId ?? null,
        input.clientId ?? null, input.roleCode, input.permissionKey, input.accessLevel, input.effectiveFrom,
        input.effectiveTo ?? null, auth.userId, input.reason ?? null, asJson(input.metadata),
      );
      await audit?.(auth, 'CREATE_ENTITY_ACCESS_GRANT', 'UserEntityAccessGrant', String(rows[0].id), { userId: input.userId, scopeType: input.scopeType, accessLevel: input.accessLevel });
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/entity-access-grants/:grantId', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = grantPatchSchema.parse(req.body);
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "UserEntityAccessGrant" SET "accessLevel"=COALESCE($3,"accessLevel"),"active"=COALESCE($4,"active"),
           "effectiveTo"=CASE WHEN $5::boolean THEN $6 ELSE "effectiveTo" END,
           "reason"=CASE WHEN $7::boolean THEN $8 ELSE "reason" END,"metadata"=COALESCE($9::jsonb,"metadata"),"updatedAt"=now()
         WHERE "organizationId"=$1 AND "id"=$2 RETURNING *`,
        auth.organizationId, req.params.grantId, input.accessLevel ?? null, input.active ?? null,
        Object.hasOwn(input, 'effectiveTo'), input.effectiveTo ?? null, Object.hasOwn(input, 'reason'), input.reason ?? null,
        input.metadata ? asJson(input.metadata) : null,
      );
      if (!rows[0]) throw notFound('Access grant was not found');
      await audit?.(auth, 'UPDATE_ENTITY_ACCESS_GRANT', 'UserEntityAccessGrant', req.params.grantId, input);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/client-enrollments', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const entityId = typeof req.query.legalEntityId === 'string' ? req.query.legalEntityId : null;
      const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : null;
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT enrollment.*,entity."code" AS "legalEntityCode",entity."displayName" AS "legalEntityName",department."name" AS "departmentName",
                patient."firstName",patient."preferredName",patient."lastName",patient."medicalRecordNumber"
         FROM "ClientEnrollment" enrollment JOIN "LegalEntity" entity ON entity."id"=enrollment."legalEntityId"
         JOIN "SpirePatient" patient ON patient."id"=enrollment."clientId" AND patient."organizationId"=enrollment."organizationId"
         LEFT JOIN "Department" department ON department."id"=enrollment."departmentId"
         WHERE enrollment."organizationId"=$1 AND ($2::text IS NULL OR enrollment."legalEntityId"=$2) AND ($3::text IS NULL OR enrollment."clientId"=$3)
         ORDER BY patient."lastName",patient."firstName",enrollment."startsAt" DESC`, auth.organizationId, entityId, clientId,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/client-enrollments', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = enrollmentCreateSchema.parse(req.body);
      await Promise.all([requireClient(auth, input.clientId), requireEntity(auth, input.legalEntityId)]);
      if (input.departmentId) await requireDepartment(auth, input.departmentId, input.legalEntityId);
      if (input.primaryEnrollment) {
        await prisma.$executeRawUnsafe(`UPDATE "ClientEnrollment" SET "primaryEnrollment"=false,"updatedAt"=now() WHERE "organizationId"=$1 AND "clientId"=$2 AND "status" IN ('PENDING','ACTIVE','PAUSED')`, auth.organizationId, input.clientId);
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `INSERT INTO "ClientEnrollment" ("organizationId","clientId","legalEntityId","departmentId","serviceType","programCode","status","primaryEnrollment","startsAt","endsAt","source","metadata")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING *`,
        auth.organizationId, input.clientId, input.legalEntityId, input.departmentId ?? null, input.serviceType,
        input.programCode ?? null, input.status, input.primaryEnrollment, input.startsAt, input.endsAt ?? null,
        input.source, asJson(input.metadata),
      );
      await audit?.(auth, 'CREATE_CLIENT_ENROLLMENT', 'ClientEnrollment', String(rows[0].id), { clientId: input.clientId, legalEntityId: input.legalEntityId, serviceType: input.serviceType });
      res.status(201).json({ data: rows[0] });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/client-enrollments/:enrollmentId', manager, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const input = enrollmentPatchSchema.parse(req.body);
      const current = await prisma.$queryRawUnsafe<Array<{ id: string; clientId: string; legalEntityId: string }>>(
        `SELECT "id","clientId","legalEntityId" FROM "ClientEnrollment" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`, auth.organizationId, req.params.enrollmentId,
      );
      if (!current[0]) throw notFound('Client enrollment was not found');
      if (input.departmentId) await requireDepartment(auth, input.departmentId, current[0].legalEntityId);
      if (input.primaryEnrollment) {
        await prisma.$executeRawUnsafe(`UPDATE "ClientEnrollment" SET "primaryEnrollment"=false,"updatedAt"=now() WHERE "organizationId"=$1 AND "clientId"=$2 AND "id"<>$3 AND "status" IN ('PENDING','ACTIVE','PAUSED')`, auth.organizationId, current[0].clientId, req.params.enrollmentId);
      }
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `UPDATE "ClientEnrollment" SET
           "departmentId"=CASE WHEN $3::boolean THEN $4 ELSE "departmentId" END,
           "programCode"=CASE WHEN $5::boolean THEN $6 ELSE "programCode" END,
           "status"=COALESCE($7,"status"),"primaryEnrollment"=COALESCE($8,"primaryEnrollment"),
           "startsAt"=COALESCE($9,"startsAt"),"endsAt"=CASE WHEN $10::boolean THEN $11 ELSE "endsAt" END,
           "source"=COALESCE($12,"source"),"metadata"=COALESCE($13::jsonb,"metadata"),"updatedAt"=now()
         WHERE "organizationId"=$1 AND "id"=$2 RETURNING *`,
        auth.organizationId, req.params.enrollmentId, Object.hasOwn(input, 'departmentId'), input.departmentId ?? null,
        Object.hasOwn(input, 'programCode'), input.programCode ?? null, input.status ?? null, input.primaryEnrollment ?? null,
        input.startsAt ?? null, Object.hasOwn(input, 'endsAt'), input.endsAt ?? null, input.source ?? null,
        input.metadata ? asJson(input.metadata) : null,
      );
      await audit?.(auth, 'UPDATE_CLIENT_ENROLLMENT', 'ClientEnrollment', req.params.enrollmentId, input);
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });
}
