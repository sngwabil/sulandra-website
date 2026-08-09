import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { z } from 'zod';
import {
  entityAccessOf,
  requireEntityManageAccess,
  requireEnterpriseOwner,
  type EntityAccessContext,
} from './entity-access.js';

type AuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  legalEntityId?: string;
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
type RawDb = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};

const managerRoles = [
  UserRole.ADMINISTRATOR,
  UserRole.PROGRAM_MANAGER,
  UserRole.HR_MANAGER,
  UserRole.HOUSE_MANAGER,
  UserRole.CEO,
  UserRole.COO,
] as const;
const serviceTypes = [
  'HOMEMAKER_PERSONAL_CARE',
  'SHARED_LIVING',
  'RESPITE',
  'TRANSPORTATION',
  'NURSING',
  'HOME_HEALTH',
  'COMMUNITY_INTEGRATION',
  'OTHER',
] as const;
const statuses = ['NEW', 'REVIEWING', 'CONTACTED', 'INTAKE_STARTED', 'ACCEPTED', 'DECLINED', 'CLOSED'] as const;
const companyCodes = ['SULANDRA_HEALTH', 'SCLS', 'HOME_HEALTH', 'NMT'] as const;
const intakeModes = ['OPERATIONAL', 'PRELAUNCH_INTEREST', 'ENTERPRISE_CONSULTATION'] as const;

type ServiceType = typeof serviceTypes[number];
type CompanyCode = typeof companyCodes[number];
type IntakeMode = typeof intakeModes[number];
type LegalEntityRow = {
  id: string;
  organizationId: string;
  code: CompanyCode | string;
  displayName: string;
  status: string;
  isProvider: boolean;
  metadata: unknown;
};

const requestSchema = z.object({
  requesterName: z.string().trim().min(2).max(200),
  requesterRelationship: z.string().trim().max(120).default('Self'),
  clientName: z.string().trim().min(2).max(200),
  clientDateOfBirth: z.string().trim().max(20).default(''),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(7).max(40),
  preferredContact: z.enum(['EMAIL', 'PHONE', 'TEXT']).default('EMAIL'),
  streetAddress: z.string().trim().max(300).default(''),
  city: z.string().trim().max(120).default(''),
  state: z.string().trim().max(40).default('OH'),
  zipCode: z.string().trim().max(10).default(''),
  county: z.string().trim().max(120).default(''),
  fundingSource: z.string().trim().max(160).default(''),
  serviceTypes: z.array(z.enum(serviceTypes)).min(1).max(8),
  urgency: z.enum(['ROUTINE', 'SOON', 'URGENT']).default('ROUTINE'),
  currentProvider: z.string().trim().max(200).default(''),
  requestedStartDate: z.string().trim().max(20).default(''),
  notes: z.string().trim().max(8000).default(''),
  companyCode: z.enum(companyCodes).optional(),
  sourcePath: z.string().trim().max(500).default(''),
  consent: z.literal(true),
});
const reviewSchema = z.object({
  status: z.enum(statuses).optional(),
  assignedToUserId: z.string().trim().optional().nullable(),
  serviceHomeId: z.string().trim().optional().nullable(),
  clientId: z.string().trim().optional().nullable(),
  internalNotes: z.string().trim().max(12000).optional(),
  dispositionReason: z.string().trim().max(2000).optional(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
});
const routeSchema = z.object({
  reason: z.string().trim().min(12).max(1000).default('Provider approval and operating capability verified'),
});

const requestNumber = () => `SR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const enabledModulesOf = (entity: Pick<LegalEntityRow, 'metadata'>) => {
  const modules = recordOf(entity.metadata).enabledModules;
  return Array.isArray(modules) ? modules.filter((value): value is string => typeof value === 'string') : [];
};
const stateOf = (metadata: Record<string, unknown>, key: string) => String(metadata[key] || '').trim().toUpperCase();

const operationCapability: Partial<Record<CompanyCode, string>> = {
  SCLS: 'SCLS_OPERATIONS',
  HOME_HEALTH: 'HOME_HEALTH_OPERATIONS',
  NMT: 'NMT_OPERATIONS',
};

const formalIntakeReadiness = (entity: LegalEntityRow) => {
  const metadata = recordOf(entity.metadata);
  const modules = enabledModulesOf(entity);
  const operationModule = operationCapability[entity.code as CompanyCode];
  if (entity.status !== 'ACTIVE') return { ready: false, reason: 'The requested company workspace is not active.' };
  if (!entity.isProvider) return { ready: false, reason: 'Provider authority has not been activated for the requested company.' };
  if (!operationModule || !modules.includes(operationModule)) return { ready: false, reason: 'The required operating module is not enabled.' };
  if (!modules.includes('CLIENT_INTAKE') || !modules.includes('SPIRE')) return { ready: false, reason: 'Formal intake and SPIRE capabilities are not both enabled.' };
  if (!['ACTIVE', 'APPROVED'].includes(stateOf(metadata, 'licensingStatus'))) return { ready: false, reason: 'Licensing or provider approval is not recorded as active.' };
  if (stateOf(metadata, 'serviceOperationsStatus') !== 'ACTIVE') return { ready: false, reason: 'Service operations are not recorded as active.' };
  if (!['ACTIVE', 'ACCEPTING', 'ACCEPTING_REFERRALS'].includes(stateOf(metadata, 'referralStatus'))) return { ready: false, reason: 'Referral acceptance is not recorded as active.' };
  if (entity.code !== 'SCLS' && metadata.formalProviderIntakeEnabled !== true) return { ready: false, reason: 'Formal provider intake has not received its explicit activation.' };
  return { ready: true, reason: 'Formal provider intake is enabled.' };
};

const serviceCompany: Partial<Record<ServiceType, CompanyCode>> = {
  HOMEMAKER_PERSONAL_CARE: 'SCLS',
  SHARED_LIVING: 'SCLS',
  RESPITE: 'SCLS',
  COMMUNITY_INTEGRATION: 'SCLS',
  NURSING: 'HOME_HEALTH',
  HOME_HEALTH: 'HOME_HEALTH',
  TRANSPORTATION: 'NMT',
};

const inferRequestedCompany = (selectedServices: ServiceType[], explicit?: CompanyCode): CompanyCode => {
  const candidates = new Set(selectedServices.map((service) => serviceCompany[service]).filter((value): value is CompanyCode => Boolean(value)));
  if (candidates.size === 1) return [...candidates][0];
  if (candidates.size === 0 && explicit) return explicit;
  return 'SULANDRA_HEALTH';
};

export function registerClientServiceRequestRoutes({ app, prisma, authOf, requireRoles, audit }: Dependencies) {
  const gate = requireRoles(...managerRoles);
  const resolveOrganizationId = async () => {
    const configured = String(process.env.SULANDRA_ORGANIZATION_ID || '').trim();
    if (configured) return configured;
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "Organization" LIMIT 1`);
    if (!rows[0]?.id) throw httpError(503, 'Sulandra organization is not configured for service requests');
    return rows[0].id;
  };

  const entityById = async (db: RawDb, organizationId: string, legalEntityId: string, lock = false) => {
    const rows = await db.$queryRawUnsafe<LegalEntityRow[]>(
      `SELECT "id","organizationId","code","displayName","status","isProvider","metadata"
       FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1${lock ? ' FOR SHARE' : ''}`,
      organizationId,
      legalEntityId,
    );
    if (!rows[0]) throw httpError(404, 'The selected company was not found');
    return rows[0];
  };

  const resolvePublicRouting = async (organizationId: string, selectedServices: ServiceType[], explicit?: CompanyCode) => {
    const entities = await prisma.$queryRawUnsafe<LegalEntityRow[]>(
      `SELECT "id","organizationId","code","displayName","status","isProvider","metadata"
       FROM "LegalEntity" WHERE "organizationId"=$1 AND "code"=ANY($2::text[])`,
      organizationId,
      [...companyCodes],
    );
    const byCode = new Map(entities.map((entity) => [entity.code, entity]));
    const holding = byCode.get('SULANDRA_HEALTH');
    if (!holding || !enabledModulesOf(holding).includes('CLIENT_INTAKE')) {
      throw httpError(503, 'Sulandra consultation intake is temporarily unavailable');
    }
    const requestedCode = inferRequestedCompany(selectedServices, explicit);
    const requested = byCode.get(requestedCode) ?? holding;
    const readiness = formalIntakeReadiness(requested);
    if (readiness.ready) {
      return { owner: requested, requested, intakeMode: 'OPERATIONAL' as IntakeMode };
    }
    if (requested.id !== holding.id) {
      return { owner: holding, requested, intakeMode: 'PRELAUNCH_INTEREST' as IntakeMode };
    }
    return { owner: holding, requested: holding, intakeMode: 'ENTERPRISE_CONSULTATION' as IntakeMode };
  };

  const requestSelect = `SELECT request_row.*,
      assignee."email" AS "assignedToEmail",
      COALESCE(NULLIF(credential."displayName",''),assignee."email") AS "assignedToName",
      owner."code" AS "ownerCompanyCode",owner."displayName" AS "ownerCompanyName",
      requested."code" AS "requestedCompanyCode",requested."displayName" AS "requestedCompanyName",
      requested."status" AS "requestedEntityStatus",requested."isProvider" AS "requestedEntityIsProvider",
      requested."metadata" AS "requestedEntityMetadata"
    FROM "ClientServiceRequest" request_row
    JOIN "LegalEntity" owner ON owner."organizationId"=request_row."organizationId" AND owner."id"=request_row."legalEntityId"
    JOIN "LegalEntity" requested ON requested."organizationId"=request_row."organizationId" AND requested."id"=request_row."requestedLegalEntityId"
    LEFT JOIN "User" assignee ON assignee."organizationId"=request_row."organizationId" AND assignee."id"=request_row."assignedToUserId"
    LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=assignee."id"`;

  const selectedEntity = (organizationId: string, access: EntityAccessContext) => entityById(prisma, organizationId, access.legalEntityId);

  const directories = async (organizationId: string, legalEntityId: string) => {
    const employees = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT DISTINCT user_row."id",user_row."email",user_row."role"::text AS "role",
              COALESCE(NULLIF(credential."displayName",''),user_row."email") AS "displayName"
       FROM "Employment" employment
       JOIN "User" user_row ON user_row."organizationId"=employment."organizationId" AND user_row."id"=employment."userId"
       LEFT JOIN "EmployeePortalCredential" credential ON credential."userId"=user_row."id"
       WHERE employment."organizationId"=$1 AND employment."legalEntityId"=$2 AND employment."status"<>'TERMINATED'
       ORDER BY COALESCE(NULLIF(credential."displayName",''),user_row."email")`,
      organizationId,
      legalEntityId,
    );
    const homeTable = await prisma.$queryRawUnsafe<Array<{ available: boolean }>>(
      `SELECT to_regclass('public."TimeAttendanceLocation"') IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema=current_schema() AND table_name='TimeAttendanceLocation' AND column_name='legalEntityId'
          ) AS "available"`,
    );
    const homes = homeTable[0]?.available
      ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT "id","name" FROM "TimeAttendanceLocation"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "active"=true ORDER BY "name"`,
        organizationId,
        legalEntityId,
      )
      : [];
    return { employees, homes };
  };

  const rowForResponse = (row: any, homeNames: Map<string, string>) => {
    const requestedEntity: LegalEntityRow = {
      id: String(row.requestedLegalEntityId),
      organizationId: String(row.organizationId),
      code: String(row.requestedCompanyCode),
      displayName: String(row.requestedCompanyName),
      status: String(row.requestedEntityStatus),
      isProvider: row.requestedEntityIsProvider === true,
      metadata: row.requestedEntityMetadata,
    };
    const readiness = formalIntakeReadiness(requestedEntity);
    const {
      requestedEntityMetadata: _metadata,
      requestedEntityStatus: _status,
      requestedEntityIsProvider: _provider,
      ...safeRow
    } = row;
    return {
      ...safeRow,
      serviceHomeName: row.serviceHomeId ? homeNames.get(String(row.serviceHomeId)) ?? null : null,
      requestedCompanyReady: readiness.ready,
      requestedCompanyReadinessReason: readiness.reason,
      formalIntakeAvailable: row.intakeMode === 'OPERATIONAL' && readiness.ready,
    };
  };

  const validateReferences = async (
    db: RawDb,
    organizationId: string,
    legalEntityId: string,
    values: { assignedToUserId: string | null; serviceHomeId: string | null; clientId: string | null },
  ) => {
    if (values.assignedToUserId) {
      const assignees = await db.$queryRawUnsafe<Array<{ allowed: boolean }>>(
        `SELECT EXISTS (
           SELECT 1 FROM "Employment" employment
           WHERE employment."organizationId"=$1 AND employment."legalEntityId"=$2
             AND employment."userId"=$3 AND employment."status"<>'TERMINATED'
           UNION ALL
           SELECT 1 FROM "UserEntityAccessGrant" grant_row
           LEFT JOIN "Department" department ON department."id"=grant_row."departmentId"
           WHERE grant_row."organizationId"=$1 AND grant_row."userId"=$3 AND grant_row."active"=true
             AND grant_row."effectiveFrom"<=now() AND (grant_row."effectiveTo" IS NULL OR grant_row."effectiveTo">now())
             AND (grant_row."scopeType"='ENTERPRISE' OR grant_row."legalEntityId"=$2 OR department."legalEntityId"=$2)
         ) AS "allowed"`,
        organizationId,
        legalEntityId,
        values.assignedToUserId,
      );
      if (!assignees[0]?.allowed) throw httpError(409, 'The assignee does not have active access to the selected company');
    }
    if (values.serviceHomeId) {
      const homes = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "TimeAttendanceLocation"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 AND "active"=true LIMIT 1`,
        organizationId,
        legalEntityId,
        values.serviceHomeId,
      ).catch(() => []);
      if (!homes[0]) throw httpError(409, 'The service home does not belong to the selected company');
    }
    if (values.clientId) {
      const clients = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "ClientEnrollment"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "clientId"=$3
           AND "status" IN ('PENDING','ACTIVE','PAUSED') LIMIT 1`,
        organizationId,
        legalEntityId,
        values.clientId,
      );
      if (!clients[0]) throw httpError(409, 'The linked client is not enrolled with the selected company');
    }
  };

  app.post('/public/client-service-requests', async (req, res, next) => {
    try {
      const input = requestSchema.parse(req.body);
      const organizationId = await resolveOrganizationId();
      const routing = await resolvePublicRouting(organizationId, input.serviceTypes, input.companyCode);
      const id = randomUUID();
      const number = requestNumber();
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ClientServiceRequest" (
           "id","organizationId","legalEntityId","requestedLegalEntityId","intakeMode","sourcePath",
           "requestNumber","requesterName","requesterRelationship","clientName","clientDateOfBirth","email","phone",
           "preferredContact","streetAddress","city","state","zipCode","county","fundingSource","serviceTypes",
           "urgency","currentProvider","requestedStartDate","notes","status","consentAt"
         ) VALUES (
           $1,$2,$3,$4,$5,NULLIF($6,''),$7,$8,$9,$10,NULLIF($11,''),$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,
           $22,$23,NULLIF($24,''),$25,'NEW',NOW()
         )`,
        id,
        organizationId,
        routing.owner.id,
        routing.requested.id,
        routing.intakeMode,
        input.sourcePath,
        number,
        input.requesterName,
        input.requesterRelationship,
        input.clientName,
        input.clientDateOfBirth,
        input.email,
        input.phone,
        input.preferredContact,
        input.streetAddress,
        input.city,
        input.state,
        input.zipCode,
        input.county,
        input.fundingSource,
        JSON.stringify(input.serviceTypes),
        input.urgency,
        input.currentProvider,
        input.requestedStartDate,
        input.notes,
      );
      res.status(201).json({
        data: {
          id,
          requestNumber: number,
          status: 'NEW',
          submissionType: routing.intakeMode,
          requestedCompany: routing.requested.displayName,
        },
      });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/client-service-requests', gate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const status = String(req.query.status || '').trim();
      const [entity, directory, rows] = await Promise.all([
        selectedEntity(auth.organizationId, access),
        directories(auth.organizationId, access.legalEntityId),
        prisma.$queryRawUnsafe<any[]>(
          `${requestSelect}
           WHERE request_row."organizationId"=$1 AND request_row."legalEntityId"=$2
             AND ($3='' OR request_row."status"=$3)
           ORDER BY CASE request_row."urgency" WHEN 'URGENT' THEN 0 WHEN 'SOON' THEN 1 ELSE 2 END,
                    request_row."createdAt" DESC LIMIT 1000`,
          auth.organizationId,
          access.legalEntityId,
          status,
        ),
      ]);
      const homeNames = new Map(directory.homes.map((home) => [String(home.id), String(home.name)]));
      const requests = rows.map((row) => rowForResponse(row, homeNames));
      const readiness = formalIntakeReadiness(entity);
      const metrics = {
        total: requests.length,
        new: requests.filter((row) => row.status === 'NEW').length,
        urgent: requests.filter((row) => row.urgency === 'URGENT' && !['ACCEPTED', 'DECLINED', 'CLOSED'].includes(row.status)).length,
        intakeStarted: requests.filter((row) => row.status === 'INTAKE_STARTED').length,
        prelaunchInterest: requests.filter((row) => row.intakeMode === 'PRELAUNCH_INTEREST').length,
      };
      res.json({
        data: {
          requests,
          metrics,
          directories: directory,
          workspace: {
            legalEntityId: access.legalEntityId,
            legalEntityCode: access.legalEntityCode,
            legalEntityName: access.legalEntityName,
            accessLevel: access.accessLevel,
            enterpriseOwner: access.enterpriseOwner,
            capabilities: access.capabilities,
            formalIntakeAvailable: readiness.ready,
            formalIntakeReadinessReason: readiness.reason,
          },
        },
      });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/client-service-requests/:requestId', gate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      const [rows, directory] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `${requestSelect} WHERE request_row."organizationId"=$1 AND request_row."legalEntityId"=$2 AND request_row."id"=$3 LIMIT 1`,
          auth.organizationId,
          access.legalEntityId,
          req.params.requestId,
        ),
        directories(auth.organizationId, access.legalEntityId),
      ]);
      if (!rows[0]) return void res.status(404).json({ error: 'Service request was not found in the selected company' });
      const homeNames = new Map(directory.homes.map((home) => [String(home.id), String(home.name)]));
      res.json({ data: rowForResponse(rows[0], homeNames) });
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/client-service-requests/:requestId', gate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const input = reviewSchema.parse(req.body);
      const current = (await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "ClientServiceRequest"
         WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,
        auth.organizationId,
        access.legalEntityId,
        req.params.requestId,
      ))[0];
      if (!current) return void res.status(404).json({ error: 'Service request was not found in the selected company' });
      const status = input.status ?? current.status;
      const assigned = input.assignedToUserId === undefined ? current.assignedToUserId : input.assignedToUserId;
      const home = input.serviceHomeId === undefined ? current.serviceHomeId : input.serviceHomeId;
      const clientId = input.clientId === undefined ? current.clientId : input.clientId;
      const notes = input.internalNotes === undefined ? current.internalNotes : input.internalNotes;
      const reason = input.dispositionReason === undefined ? current.dispositionReason : input.dispositionReason;
      const follow = input.nextFollowUpAt === undefined ? current.nextFollowUpAt : input.nextFollowUpAt;
      if (current.intakeMode !== 'OPERATIONAL' && ['INTAKE_STARTED', 'ACCEPTED'].includes(status)) {
        throw httpError(409, 'Pre-launch interest cannot be accepted as a service or advanced to formal intake');
      }
      if (status === 'INTAKE_STARTED' && !current.intakeImportId) {
        throw httpError(409, 'Use Start Formal Intake so the permanent SPIRE intake link is created');
      }
      await validateReferences(prisma, auth.organizationId, access.legalEntityId, {
        assignedToUserId: assigned,
        serviceHomeId: home,
        clientId,
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "ClientServiceRequest" SET
           "status"=$1,"assignedToUserId"=$2,"serviceHomeId"=$3,"clientId"=$4,"internalNotes"=$5,
           "dispositionReason"=$6,"nextFollowUpAt"=$7,"reviewedById"=$8,
           "reviewedAt"=COALESCE("reviewedAt",NOW()),"updatedAt"=NOW()
         WHERE "organizationId"=$9 AND "legalEntityId"=$10 AND "id"=$11`,
        status,
        assigned,
        home,
        clientId,
        notes,
        reason,
        follow,
        auth.userId,
        auth.organizationId,
        access.legalEntityId,
        current.id,
      );
      await audit?.(auth, 'UPDATE_CLIENT_SERVICE_REQUEST', 'ClientServiceRequest', current.id, {
        legalEntityId: access.legalEntityId,
        requestNumber: current.requestNumber,
        intakeMode: current.intakeMode,
        before: { status: current.status, assignedToUserId: current.assignedToUserId, serviceHomeId: current.serviceHomeId, clientId: current.clientId },
        after: { status, assignedToUserId: assigned, serviceHomeId: home, clientId },
      });
      res.json({ data: { id: current.id, status, clientId } });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/client-service-requests/:requestId/start-intake', gate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      const result = await prisma.$transaction(async (tx) => {
        const entity = await entityById(tx, auth.organizationId, access.legalEntityId, true);
        const readiness = formalIntakeReadiness(entity);
        if (!readiness.ready) throw httpError(409, `Formal intake is blocked: ${readiness.reason}`);
        const current = (await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "ClientServiceRequest"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1 FOR UPDATE`,
          auth.organizationId,
          access.legalEntityId,
          req.params.requestId,
        ))[0];
        if (!current) throw httpError(404, 'Service request was not found in the selected company');
        if (current.intakeMode !== 'OPERATIONAL' || current.requestedLegalEntityId !== access.legalEntityId) {
          throw httpError(409, 'This record is consultation or pre-launch interest and cannot start formal provider intake');
        }
        await validateReferences(tx, auth.organizationId, access.legalEntityId, {
          assignedToUserId: current.assignedToUserId,
          serviceHomeId: current.serviceHomeId,
          clientId: current.clientId,
        });
        const draft = {
          source: 'CLIENT_SERVICE_REQUEST',
          legalEntityId: access.legalEntityId,
          legalEntityCode: access.legalEntityCode,
          serviceRequestId: current.id,
          requestNumber: current.requestNumber,
          client: {
            name: current.clientName,
            dateOfBirth: current.clientDateOfBirth,
            email: current.email,
            phone: current.phone,
            address: {
              streetAddress: current.streetAddress,
              city: current.city,
              state: current.state,
              zipCode: current.zipCode,
              county: current.county,
            },
          },
          requester: {
            name: current.requesterName,
            relationship: current.requesterRelationship,
            preferredContact: current.preferredContact,
          },
          serviceTypes: current.serviceTypes,
          fundingSource: current.fundingSource,
          currentProvider: current.currentProvider,
          requestedStartDate: current.requestedStartDate,
          urgency: current.urgency,
          notes: current.notes,
        };
        let intakeImportId = current.intakeImportId as string | null;
        if (!intakeImportId) {
          intakeImportId = randomUUID();
          await tx.$executeRawUnsafe(
            `INSERT INTO "SpireIntakeImport" (
               "id","organizationId","legalEntityId","clientId","fileName","mimeType","storageKey","status",
               "extractionProvider","extractedData","submittedByUserId","createdAt","updatedAt"
             ) VALUES ($1,$2,$3,NULL,$4,$5,NULL,'REVIEW_REQUIRED','SULANDRA_SERVICE_REQUEST',$6::jsonb,$7,NOW(),NOW())`,
            intakeImportId,
            auth.organizationId,
            access.legalEntityId,
            `Service Request ${current.requestNumber}`,
            'application/vnd.sulandra.service-request+json',
            JSON.stringify(draft),
            auth.userId,
          );
        } else {
          const imports = await tx.$queryRawUnsafe<Array<{ id: string }>>(
            `SELECT "id" FROM "SpireIntakeImport"
             WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1`,
            auth.organizationId,
            access.legalEntityId,
            intakeImportId,
          );
          if (!imports[0]) throw httpError(409, 'The linked SPIRE intake import belongs to a different company or no longer exists');
        }
        await tx.$executeRawUnsafe(
          `UPDATE "ClientServiceRequest" SET "status"='INTAKE_STARTED',"intakeImportId"=$1,
             "reviewedById"=$2,"reviewedAt"=COALESCE("reviewedAt",NOW()),"updatedAt"=NOW()
           WHERE "organizationId"=$3 AND "legalEntityId"=$4 AND "id"=$5`,
          intakeImportId,
          auth.userId,
          auth.organizationId,
          access.legalEntityId,
          current.id,
        );
        return { current, intakeImportId, draft };
      });
      await audit?.(auth, 'START_CLIENT_INTAKE', 'ClientServiceRequest', result.current.id, {
        legalEntityId: access.legalEntityId,
        requestNumber: result.current.requestNumber,
        clientName: result.current.clientName,
        intakeImportId: result.intakeImportId,
      });
      res.json({
        data: {
          id: result.current.id,
          status: 'INTAKE_STARTED',
          intakeImportId: result.intakeImportId,
          clientDraft: result.draft,
        },
      });
    } catch (error) { next(error); }
  });

  app.post('/api/admin/client-service-requests/:requestId/route-to-requested-company', gate, async (req, res, next) => {
    try {
      const auth = authOf(res);
      const access = entityAccessOf(res);
      requireEntityManageAccess(access);
      requireEnterpriseOwner(access);
      const input = routeSchema.parse(req.body ?? {});
      const result = await prisma.$transaction(async (tx) => {
        const current = (await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "ClientServiceRequest"
           WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "id"=$3 LIMIT 1 FOR UPDATE`,
          auth.organizationId,
          access.legalEntityId,
          req.params.requestId,
        ))[0];
        if (!current) throw httpError(404, 'Service request was not found in the selected company');
        if (current.intakeMode !== 'PRELAUNCH_INTEREST') throw httpError(409, 'Only pre-launch interest can be routed to a newly approved provider');
        if (current.intakeImportId) throw httpError(409, 'A request with a formal intake link cannot be moved between companies');
        if (['DECLINED', 'CLOSED'].includes(current.status)) throw httpError(409, 'Reopen the request before routing it to an operating provider');
        const target = await entityById(tx, auth.organizationId, String(current.requestedLegalEntityId), true);
        const readiness = formalIntakeReadiness(target);
        if (!readiness.ready) throw httpError(409, `The requested company is not ready for formal intake: ${readiness.reason}`);
        await tx.$executeRawUnsafe(
          `INSERT INTO "ClientServiceRequestRoutingEvent" (
             "id","organizationId","requestId","fromLegalEntityId","toLegalEntityId","fromMode","toMode",
             "reason","routedById","metadata"
           ) VALUES ($1,$2,$3,$4,$5,$6,'OPERATIONAL',$7,$8,$9::jsonb)`,
          randomUUID(),
          auth.organizationId,
          current.id,
          current.legalEntityId,
          target.id,
          current.intakeMode,
          input.reason,
          auth.userId,
          JSON.stringify({ requestNumber: current.requestNumber, targetCode: target.code }),
        );
        await tx.$executeRawUnsafe(
          `UPDATE "ClientServiceRequest" SET
             "legalEntityId"=$1,"intakeMode"='OPERATIONAL',"status"='REVIEWING',
             "assignedToUserId"=NULL,"serviceHomeId"=NULL,"clientId"=NULL,
             "reviewedById"=$2,"updatedAt"=NOW()
           WHERE "organizationId"=$3 AND "legalEntityId"=$4 AND "id"=$5`,
          target.id,
          auth.userId,
          auth.organizationId,
          access.legalEntityId,
          current.id,
        );
        return { current, target };
      });
      await audit?.(auth, 'ROUTE_PRELAUNCH_INTEREST_TO_APPROVED_PROVIDER', 'ClientServiceRequest', result.current.id, {
        requestNumber: result.current.requestNumber,
        fromLegalEntityId: access.legalEntityId,
        toLegalEntityId: result.target.id,
        toLegalEntityCode: result.target.code,
        reason: input.reason,
      });
      res.json({
        data: {
          id: result.current.id,
          status: 'REVIEWING',
          intakeMode: 'OPERATIONAL',
          legalEntityId: result.target.id,
          legalEntityCode: result.target.code,
        },
      });
    } catch (error) { next(error); }
  });
}
