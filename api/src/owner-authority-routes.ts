import type { Express, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, UserRole } from '@prisma/client';

type AuthContext = { userId: string; organizationId: string; role: UserRole };
type Dependencies = {
  app: Express;
  prisma: PrismaClient;
  authOf: (res: Response) => AuthContext;
};

type OwnerUserRow = { id: string; organizationId: string; email: string };
type EntityRow = { id: string; code: string; displayName: string; status: string };

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
const assignRoleSchema = z.object({ role: z.nativeEnum(UserRole) });

const appointmentMetadata = (extra: Record<string, unknown> = {}) => ({
  hiringPath: 'INTERNAL_APPOINTMENT',
  careersApplicationCreated: false,
  interviewRequired: false,
  offerRequired: false,
  ...extra,
});

export function registerOwnerAuthorityRoutes({ app, prisma, authOf }: Dependencies) {
  let readyPromise: Promise<void> | null = null;
  const ensureReady = () => readyPromise ??= (async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE "EmployeePortalCredential" c
       SET "displayName" = $1, "updatedAt" = NOW()
       FROM "User" u
       WHERE c."userId" = u."id" AND LOWER(u."email") = LOWER($2)`,
      OWNER_NAME,
      OWNER_EMAIL,
    ).catch(() => undefined);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LeadershipAppointment" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "organizationId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "legalEntityId" TEXT,
        "appointmentKey" TEXT NOT NULL,
        "appointmentType" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "scopeText" TEXT,
        "effectiveDate" DATE NOT NULL DEFAULT CURRENT_DATE,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "source" TEXT NOT NULL DEFAULT 'INTERNAL_APPOINTMENT',
        "credentialLabel" TEXT,
        "credentialVerificationStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
        "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "LeadershipAppointment_type_check" CHECK ("appointmentType" IN ('OWNERSHIP','EXECUTIVE_CLINICAL','ENTITY_CLINICAL')),
        CONSTRAINT "LeadershipAppointment_status_check" CHECK ("status" IN ('ACTIVE','INACTIVE')),
        CONSTRAINT "LeadershipAppointment_credential_check" CHECK ("credentialVerificationStatus" IN ('NOT_REQUIRED','PENDING_VERIFICATION','VERIFIED','EXPIRED')),
        CONSTRAINT "LeadershipAppointment_org_user_key" UNIQUE ("organizationId","userId","appointmentKey")
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "LeadershipAppointment_user_idx"
       ON "LeadershipAppointment"("organizationId","userId","status","appointmentType")`,
    );

    const owners = await prisma.$queryRawUnsafe<OwnerUserRow[]>(
      `SELECT "id","organizationId","email"
       FROM "User"
       WHERE LOWER("email")=LOWER($1)
       ORDER BY "createdAt" ASC
       LIMIT 1`,
      OWNER_EMAIL,
    );
    const owner = owners[0];
    if (!owner) throw new Error('Enterprise owner account is not configured');

    const entities = await prisma.$queryRawUnsafe<EntityRow[]>(
      `SELECT "id","code","displayName","status"
       FROM "LegalEntity"
       WHERE "organizationId"=$1 AND "code" IN ('SULANDRA_HEALTH','SCLS','HOME_HEALTH')`,
      owner.organizationId,
    );
    const entityByCode = new Map(entities.map((entity) => [entity.code, entity]));
    const sulandraHealth = entityByCode.get('SULANDRA_HEALTH');
    const scls = entityByCode.get('SCLS');
    const homeHealth = entityByCode.get('HOME_HEALTH');
    if (!sulandraHealth || !scls || !homeHealth) {
      throw new Error('Sulandra enterprise legal entities are not configured');
    }

    const departmentId = async (legalEntityId: string, code: string) => {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "Department"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "code"=$3
         LIMIT 1`,
        owner.organizationId,
        legalEntityId,
        code,
      );
      return rows[0]?.id ?? null;
    };

    const [executiveDepartmentId, sclsClinicalDepartmentId, homeHealthNursingDepartmentId] = await Promise.all([
      departmentId(sulandraHealth.id, 'EXECUTIVE'),
      departmentId(scls.id, 'CLINICAL_SERVICES'),
      departmentId(homeHealth.id, 'NURSING'),
    ]);

    const upsertEmployment = async (
      legalEntityId: string,
      department: string | null,
      jobTitle: string,
      employmentType: 'OWNER' | 'EMPLOYEE',
      primaryEmployment: boolean,
    ) => {
      const updated = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `UPDATE "Employment"
         SET "departmentId"=$4,"jobTitle"=$5,"employmentType"=$6,"status"='ACTIVE',
             "primaryEmployment"=$7,"endsAt"=NULL,"source"='INTERNAL_OWNER_APPOINTMENT',
             "metadata"=COALESCE("metadata",'{}'::jsonb) || $8::jsonb,"updatedAt"=NOW()
         WHERE "organizationId"=$1 AND "userId"=$2 AND "legalEntityId"=$3 AND "status"<>'TERMINATED'
         RETURNING "id"`,
        owner.organizationId,
        owner.id,
        legalEntityId,
        department,
        jobTitle,
        employmentType,
        primaryEmployment,
        JSON.stringify(appointmentMetadata({ internalHire: true })),
      );
      if (updated[0]) return;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Employment"
           ("organizationId","userId","legalEntityId","departmentId","jobTitle","employmentType","status","primaryEmployment","startsAt","source","metadata")
         VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,CURRENT_DATE,'INTERNAL_OWNER_APPOINTMENT',$8::jsonb)`,
        owner.organizationId,
        owner.id,
        legalEntityId,
        department,
        jobTitle,
        employmentType,
        primaryEmployment,
        JSON.stringify(appointmentMetadata({ internalHire: true })),
      );
    };

    await prisma.$executeRawUnsafe(
      `UPDATE "Employment"
       SET "primaryEmployment"=FALSE,"updatedAt"=NOW()
       WHERE "organizationId"=$1 AND "userId"=$2 AND "status"<>'TERMINATED'`,
      owner.organizationId,
      owner.id,
    );

    await upsertEmployment(
      sulandraHealth.id,
      executiveDepartmentId,
      'Owner / Founder, Chief Executive Officer & Enterprise Director of Nursing',
      'OWNER',
      true,
    );
    await upsertEmployment(
      homeHealth.id,
      homeHealthNursingDepartmentId,
      'Director of Nursing / Clinical Director',
      'EMPLOYEE',
      false,
    );
    await upsertEmployment(
      scls.id,
      sclsClinicalDepartmentId,
      'Clinical / Nursing Oversight',
      'EMPLOYEE',
      false,
    );

    const upsertAppointment = async (
      appointmentKey: string,
      appointmentType: 'OWNERSHIP' | 'EXECUTIVE_CLINICAL' | 'ENTITY_CLINICAL',
      title: string,
      legalEntityId: string,
      scopeText: string,
      credentialLabel: string | null,
      credentialVerificationStatus: 'NOT_REQUIRED' | 'PENDING_VERIFICATION',
      metadata: Record<string, unknown> = {},
    ) => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "LeadershipAppointment"
           ("organizationId","userId","legalEntityId","appointmentKey","appointmentType","title","scopeText","effectiveDate","status","source","credentialLabel","credentialVerificationStatus","metadata","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,'ACTIVE','INTERNAL_APPOINTMENT',$8,$9,$10::jsonb,NOW(),NOW())
         ON CONFLICT ("organizationId","userId","appointmentKey") DO UPDATE SET
           "legalEntityId"=EXCLUDED."legalEntityId","appointmentType"=EXCLUDED."appointmentType","title"=EXCLUDED."title",
           "scopeText"=EXCLUDED."scopeText","status"='ACTIVE',"source"='INTERNAL_APPOINTMENT',
           "credentialLabel"=EXCLUDED."credentialLabel","credentialVerificationStatus"=EXCLUDED."credentialVerificationStatus",
           "metadata"=EXCLUDED."metadata","updatedAt"=NOW()`,
        owner.organizationId,
        owner.id,
        legalEntityId,
        appointmentKey,
        appointmentType,
        title,
        scopeText,
        credentialLabel,
        credentialVerificationStatus,
        JSON.stringify(appointmentMetadata(metadata)),
      );
    };

    await upsertAppointment(
      'OWNER_FOUNDER',
      'OWNERSHIP',
      'Owner / Founder',
      sulandraHealth.id,
      'Sulandra Health enterprise ownership and founder capacity',
      null,
      'NOT_REQUIRED',
    );
    await upsertAppointment(
      'CHIEF_EXECUTIVE_OFFICER',
      'OWNERSHIP',
      'Chief Executive Officer (CEO)',
      sulandraHealth.id,
      'Chief executive leadership of Sulandra Health and its enterprise companies',
      null,
      'NOT_REQUIRED',
      { executiveTitleCode: 'CEO', displayAsCredentialSuffix: true },
    );
    await upsertAppointment(
      'ENTERPRISE_DON',
      'EXECUTIVE_CLINICAL',
      'Enterprise Director of Nursing',
      sulandraHealth.id,
      'Enterprise clinical leadership across Sulandra companies where nursing oversight is assigned',
      'RN',
      'PENDING_VERIFICATION',
      { credentialClaim: 'RN', verificationRequiredBeforeRegulatedUse: true },
    );
    await upsertAppointment(
      'HOME_HEALTH_DON',
      'ENTITY_CLINICAL',
      'Director of Nursing / Clinical Director',
      homeHealth.id,
      'Sulandra Home Health Care Services clinical and nursing leadership',
      'RN',
      'PENDING_VERIFICATION',
      { entityStatus: homeHealth.status, regulatoryActivationDependsOnEntityReadiness: true },
    );
    await upsertAppointment(
      'SCLS_CLINICAL_OVERSIGHT',
      'ENTITY_CLINICAL',
      'Clinical / Nursing Oversight',
      scls.id,
      'SCLS nursing and clinical oversight only; Director of Operations is a separate hire',
      'RN',
      'PENDING_VERIFICATION',
      { doddDirectorOfOperationsSeparateHire: true, dooAssignedToOwner: false },
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO "EmployeeManagementProfile"
         ("userId","organizationId","displayName","department","jobTitle","employmentStatus","hireDate","notes","createdAt","updatedAt")
       VALUES ($1,$2,$3,'Executive / Clinical Leadership','Chief Executive Officer & Enterprise Director of Nursing','ACTIVE',CURRENT_DATE,
               'Internal owner/chief executive/executive clinical appointment. DODD Director of Operations is intentionally a separate hire.',NOW(),NOW())
       ON CONFLICT ("userId") DO UPDATE SET
         "displayName"=EXCLUDED."displayName","department"=EXCLUDED."department","jobTitle"=EXCLUDED."jobTitle",
         "employmentStatus"='ACTIVE',"notes"=EXCLUDED."notes","updatedAt"=NOW()`,
      owner.id,
      owner.organizationId,
      OWNER_NAME,
    ).catch(() => undefined);

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION protect_sulandra_enterprise_owner()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND LOWER(OLD."email") = LOWER('${OWNER_EMAIL}') THEN
          RAISE EXCEPTION 'The enterprise owner account cannot be deleted';
        END IF;
        IF TG_OP = 'UPDATE' AND LOWER(OLD."email") = LOWER('${OWNER_EMAIL}') THEN
          IF NEW."email" IS DISTINCT FROM OLD."email" OR NEW."role" IS DISTINCT FROM OLD."role" OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
            RAISE EXCEPTION 'The enterprise owner identity, role, and organization cannot be modified';
          END IF;
        END IF;
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_trigger
          WHERE tgname = 'protect_sulandra_enterprise_owner_trigger'
            AND tgrelid = '"User"'::regclass
            AND NOT tgisinternal
        ) THEN
          CREATE TRIGGER protect_sulandra_enterprise_owner_trigger
          BEFORE UPDATE OR DELETE ON "User"
          FOR EACH ROW EXECUTE FUNCTION protect_sulandra_enterprise_owner();
        END IF;
      END
      $$;
    `);
  })().catch((error) => {
    readyPromise = null;
    throw error;
  });

  void ensureReady().catch((error) => console.error('Enterprise owner authority initialization failed', error));

  const requireOwner = async (res: Response) => {
    await ensureReady();
    const auth = authOf(res);
    const rows = await prisma.$queryRawUnsafe<Array<{ email: string }>>(
      `SELECT "email" FROM "User" WHERE "id" = $1 AND "organizationId" = $2 LIMIT 1`,
      auth.userId,
      auth.organizationId,
    );
    return { auth, isOwner: String(rows[0]?.email || '').toLowerCase() === OWNER_EMAIL };
  };

  const leadershipProfile = async (auth: AuthContext) => {
    const appointments = await prisma.$queryRawUnsafe<any[]>(
      `SELECT appointment."id",appointment."appointmentKey",appointment."appointmentType",appointment."title",appointment."scopeText",
              appointment."effectiveDate",appointment."status",appointment."source",appointment."credentialLabel",
              appointment."credentialVerificationStatus",appointment."metadata",
              entity."id" AS "legalEntityId",entity."code" AS "legalEntityCode",entity."displayName" AS "legalEntityName",entity."status" AS "legalEntityStatus"
       FROM "LeadershipAppointment" appointment
       LEFT JOIN "LegalEntity" entity ON entity."id"=appointment."legalEntityId"
       WHERE appointment."organizationId"=$1 AND appointment."userId"=$2 AND appointment."status"='ACTIVE'
       ORDER BY CASE appointment."appointmentType" WHEN 'OWNERSHIP' THEN 0 WHEN 'EXECUTIVE_CLINICAL' THEN 1 ELSE 2 END, appointment."title"`,
      auth.organizationId,
      auth.userId,
    );
    const employments = await prisma.$queryRawUnsafe<any[]>(
      `SELECT employment."id",employment."jobTitle",employment."employmentType",employment."status",employment."primaryEmployment",
              employment."startsAt",employment."endsAt",employment."source",employment."metadata",
              entity."id" AS "legalEntityId",entity."code" AS "legalEntityCode",entity."displayName" AS "legalEntityName",entity."status" AS "legalEntityStatus",
              department."id" AS "departmentId",department."code" AS "departmentCode",department."name" AS "departmentName"
       FROM "Employment" employment
       JOIN "LegalEntity" entity ON entity."id"=employment."legalEntityId"
       LEFT JOIN "Department" department ON department."id"=employment."departmentId"
       WHERE employment."organizationId"=$1 AND employment."userId"=$2 AND employment."status"<>'TERMINATED'
       ORDER BY employment."primaryEmployment" DESC,entity."displayName"`,
      auth.organizationId,
      auth.userId,
    );
    return {
      isOwner: true,
      internalHire: true,
      hiringPath: 'INTERNAL_APPOINTMENT',
      careersApplicationCreated: false,
      interviewRequired: false,
      offerRequired: false,
      displayName: OWNER_NAME,
      email: OWNER_EMAIL,
      clearance: 'ENTERPRISE_OWNER',
      organizationId: auth.organizationId,
      appointments,
      employments,
      separateHireRoles: [
        {
          code: 'DODD_DOO',
          title: 'Director of Operations',
          legalEntityCode: 'SCLS',
          staffingPlan: 'SEPARATE_HIRE',
          assignedToOwner: false,
        },
      ],
    };
  };

  app.get('/api/owner/authority', async (_req, res, next) => {
    try {
      const { auth, isOwner } = await requireOwner(res);
      if (!isOwner) return res.status(403).json({ error: 'Enterprise owner clearance required' });
      res.json({ data: await leadershipProfile(auth) });
    } catch (error) { next(error); }
  });

  app.get('/api/owner/profile', async (_req, res, next) => {
    try {
      const { auth, isOwner } = await requireOwner(res);
      if (!isOwner) return res.status(403).json({ error: 'Enterprise owner clearance required' });
      res.json({ data: await leadershipProfile(auth) });
    } catch (error) { next(error); }
  });

  app.get('/api/owner/employees', async (_req, res, next) => {
    try {
      const { auth, isOwner } = await requireOwner(res);
      if (!isOwner) return res.status(403).json({ error: 'Enterprise owner clearance required' });
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT u."id", u."email", u."role"::text AS "role",
                COALESCE(NULLIF(c."displayName", ''), u."email") AS "displayName",
                CASE WHEN LOWER(u."email") = LOWER($2) THEN TRUE ELSE FALSE END AS "isOwner"
         FROM "User" u
         LEFT JOIN "EmployeePortalCredential" c ON c."userId" = u."id"
         WHERE u."organizationId" = $1
         ORDER BY CASE WHEN LOWER(u."email") = LOWER($2) THEN 0 ELSE 1 END, COALESCE(NULLIF(c."displayName", ''), u."email")`,
        auth.organizationId,
        OWNER_EMAIL,
      );
      res.json({ data: rows });
    } catch (error) { next(error); }
  });

  app.patch('/api/owner/employees/:id/role', async (req, res, next) => {
    try {
      const { auth, isOwner } = await requireOwner(res);
      if (!isOwner) return res.status(403).json({ error: 'Enterprise owner clearance required' });
      const input = assignRoleSchema.parse(req.body);
      const target = await prisma.$queryRawUnsafe<Array<{ id: string; email: string }>>(
        `SELECT "id", "email" FROM "User" WHERE "id" = $1 AND "organizationId" = $2 LIMIT 1`,
        req.params.id,
        auth.organizationId,
      );
      if (!target[0]) return res.status(404).json({ error: 'Employee not found' });
      if (String(target[0].email).toLowerCase() === OWNER_EMAIL) {
        return res.status(409).json({ error: 'The enterprise owner account is immutable and cannot be managed by any user' });
      }
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `UPDATE "User" SET "role" = $1::"UserRole" WHERE "id" = $2 AND "organizationId" = $3 RETURNING "id", "email", "role"::text AS "role"`,
        input.role,
        req.params.id,
        auth.organizationId,
      );
      res.json({ data: rows[0] });
    } catch (error) { next(error); }
  });
}
