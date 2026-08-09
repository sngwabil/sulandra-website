import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';

export type BaseAuthContext = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type EntityAccessLevel = 'READ' | 'WRITE' | 'MANAGE';

export type EntityAccessContext = {
  legalEntityId: string;
  legalEntityCode: string;
  legalEntityName: string;
  legalEntityStatus: 'ACTIVE' | 'PLANNED' | 'INACTIVE';
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  allowedDepartmentIds: string[];
  accessLevel: EntityAccessLevel;
  enterpriseOwner: boolean;
  operational: boolean;
  enterpriseSharedRequest: boolean;
  selectedBy: 'HEADER' | 'PRIMARY_EMPLOYMENT' | 'SCLS_COMPATIBILITY' | 'FIRST_AUTHORIZED';
};

export type ScopedAuthContext = BaseAuthContext & {
  legalEntityId?: string;
  departmentId?: string | null;
  allowedDepartmentIds?: string[];
  entityAccessLevel?: EntityAccessLevel;
  enterpriseOwner?: boolean;
};

type IdentityRow = {
  id: string;
  organizationId: string;
  role: string;
  email: string | null;
};

type EntityRow = {
  id: string;
  code: string;
  displayName: string;
  status: EntityAccessContext['legalEntityStatus'];
  hasEmployment: boolean;
  hasPrimaryEmployment: boolean;
  hasGrant: boolean;
  grantRank: number;
};

type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  sharedEnterprise: boolean;
};

type EmploymentRow = {
  departmentId: string | null;
  primaryEmployment: boolean;
};

type GrantRow = {
  scopeType: 'ENTERPRISE' | 'LEGAL_ENTITY' | 'DEPARTMENT' | 'CLIENT';
  legalEntityId: string | null;
  departmentId: string | null;
  accessLevel: EntityAccessLevel;
};

const OWNER_EMAIL = 'admin@sulandrahealth.com';
const accessRank: Record<EntityAccessLevel, number> = { READ: 1, WRITE: 2, MANAGE: 3 };
const rankAccess = (rank: number): EntityAccessLevel => rank >= 3 ? 'MANAGE' : rank >= 2 ? 'WRITE' : 'READ';
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const enterpriseSharedPrefixes = [
  '/api/intranet',
  '/api/education',
  '/api/learning',
  '/api/employee-learning',
];

const isEnterpriseSharedPath = (path: string) =>
  enterpriseSharedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

const requestedHeader = (request: Request, name: string) => {
  const value = request.header(name)?.trim();
  return value || null;
};

const actualIdentity = async (prisma: PrismaClient, auth: BaseAuthContext) => {
  const rows = await prisma.$queryRawUnsafe<IdentityRow[]>(
    `SELECT "id","organizationId","role"::text AS "role","email"
     FROM "User" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1`,
    auth.userId,
    auth.organizationId,
  );
  const identity = rows[0];
  if (!identity || !Object.values(UserRole).includes(identity.role as UserRole)) {
    throw httpError(401, 'The signed-in account is no longer available');
  }
  return {
    ...identity,
    role: identity.role as UserRole,
    email: identity.email?.trim().toLowerCase() || undefined,
    enterpriseOwner: identity.email?.trim().toLowerCase() === OWNER_EMAIL,
  };
};

const entityCandidates = async (
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
) => prisma.$queryRawUnsafe<EntityRow[]>(
  `SELECT entity."id",entity."code",entity."displayName",entity."status",
          EXISTS (
            SELECT 1 FROM "Employment" employment
            WHERE employment."organizationId"=entity."organizationId" AND employment."userId"=$2
              AND employment."legalEntityId"=entity."id" AND employment."status"<>'TERMINATED'
          ) AS "hasEmployment",
          EXISTS (
            SELECT 1 FROM "Employment" employment
            WHERE employment."organizationId"=entity."organizationId" AND employment."userId"=$2
              AND employment."legalEntityId"=entity."id" AND employment."status"<>'TERMINATED'
              AND employment."primaryEmployment"=true
          ) AS "hasPrimaryEmployment",
          EXISTS (
            SELECT 1 FROM "UserEntityAccessGrant" grant_row
            LEFT JOIN "Department" grant_department ON grant_department."id"=grant_row."departmentId"
            WHERE grant_row."organizationId"=entity."organizationId" AND grant_row."userId"=$2
              AND grant_row."active"=true AND grant_row."effectiveFrom"<=now()
              AND (grant_row."effectiveTo" IS NULL OR grant_row."effectiveTo">now())
              AND (
                grant_row."scopeType"='ENTERPRISE'
                OR grant_row."legalEntityId"=entity."id"
                OR grant_department."legalEntityId"=entity."id"
                OR (grant_row."scopeType"='CLIENT' AND EXISTS (
                  SELECT 1 FROM "ClientEnrollment" enrollment
                  WHERE enrollment."organizationId"=entity."organizationId"
                    AND enrollment."clientId"=grant_row."clientId" AND enrollment."legalEntityId"=entity."id"
                    AND enrollment."status" IN ('PENDING','ACTIVE','PAUSED')
                ))
              )
          ) AS "hasGrant",
          COALESCE((
            SELECT max(CASE grant_row."accessLevel" WHEN 'MANAGE' THEN 3 WHEN 'WRITE' THEN 2 ELSE 1 END)::int
            FROM "UserEntityAccessGrant" grant_row
            WHERE grant_row."organizationId"=entity."organizationId" AND grant_row."userId"=$2
              AND grant_row."active"=true AND grant_row."effectiveFrom"<=now()
              AND (grant_row."effectiveTo" IS NULL OR grant_row."effectiveTo">now())
              AND grant_row."scopeType" IN ('ENTERPRISE','LEGAL_ENTITY')
              AND (grant_row."scopeType"='ENTERPRISE' OR grant_row."legalEntityId"=entity."id")
          ),0)::int AS "grantRank"
   FROM "LegalEntity" entity
   WHERE entity."organizationId"=$1
   ORDER BY entity."displayName"`,
  organizationId,
  userId,
);

export async function resolveEntityAccess(
  prisma: PrismaClient,
  auth: BaseAuthContext,
  request: Pick<Request, 'path' | 'header'>,
) {
  const identity = await actualIdentity(prisma, auth);
  const requestedEntityId = requestedHeader(request as Request, 'x-legal-entity-id');
  const requestedDepartmentId = requestedHeader(request as Request, 'x-department-id');
  const allEntities = await entityCandidates(prisma, identity.organizationId, identity.id);
  const authorizedEntities = identity.enterpriseOwner
    ? allEntities
    : allEntities.filter((entity) => entity.hasEmployment || entity.hasGrant);

  let entity: EntityRow | undefined;
  let selectedBy: EntityAccessContext['selectedBy'];
  if (requestedEntityId) {
    const existing = allEntities.find((candidate) => candidate.id === requestedEntityId);
    if (!existing) throw httpError(404, 'The selected company was not found');
    entity = authorizedEntities.find((candidate) => candidate.id === requestedEntityId);
    if (!entity) throw httpError(403, 'You do not have access to the selected company');
    selectedBy = 'HEADER';
  } else {
    entity = authorizedEntities.find((candidate) => candidate.hasPrimaryEmployment)
      ?? authorizedEntities.find((candidate) => candidate.code === 'SCLS' && candidate.status === 'ACTIVE')
      ?? authorizedEntities.find((candidate) => candidate.status === 'ACTIVE')
      ?? authorizedEntities[0];
    if (!entity) throw httpError(403, 'No company access is assigned to this account');
    selectedBy = entity.hasPrimaryEmployment
      ? 'PRIMARY_EMPLOYMENT'
      : entity.code === 'SCLS'
        ? 'SCLS_COMPATIBILITY'
        : 'FIRST_AUTHORIZED';
  }

  const [departments, employments, grants] = await Promise.all([
    prisma.$queryRawUnsafe<DepartmentRow[]>(
      `SELECT "id","code","name","sharedEnterprise" FROM "Department"
       WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "active"=true ORDER BY "name"`,
      identity.organizationId,
      entity.id,
    ),
    prisma.$queryRawUnsafe<EmploymentRow[]>(
      `SELECT "departmentId","primaryEmployment" FROM "Employment"
       WHERE "organizationId"=$1 AND "userId"=$2 AND "legalEntityId"=$3 AND "status"<>'TERMINATED'
       ORDER BY "primaryEmployment" DESC,"startsAt"`,
      identity.organizationId,
      identity.id,
      entity.id,
    ),
    prisma.$queryRawUnsafe<GrantRow[]>(
      `SELECT grant_row."scopeType",grant_row."legalEntityId",grant_row."departmentId",grant_row."accessLevel"
       FROM "UserEntityAccessGrant" grant_row
       LEFT JOIN "Department" department ON department."id"=grant_row."departmentId"
       WHERE grant_row."organizationId"=$1 AND grant_row."userId"=$2 AND grant_row."active"=true
         AND grant_row."effectiveFrom"<=now() AND (grant_row."effectiveTo" IS NULL OR grant_row."effectiveTo">now())
         AND (grant_row."scopeType"='ENTERPRISE' OR grant_row."legalEntityId"=$3 OR department."legalEntityId"=$3)`,
      identity.organizationId,
      identity.id,
      entity.id,
    ),
  ]);

  const entityGrantRank = grants
    .filter((grant) => grant.scopeType === 'ENTERPRISE' || grant.scopeType === 'LEGAL_ENTITY')
    .reduce((rank, grant) => Math.max(rank, accessRank[grant.accessLevel]), entity.grantRank || 0);
  const managesEveryDepartment = identity.enterpriseOwner || entityGrantRank >= accessRank.MANAGE;
  const permittedDepartmentIds = new Set<string>();
  for (const employment of employments) {
    if (employment.departmentId) permittedDepartmentIds.add(employment.departmentId);
  }
  for (const grant of grants) {
    if (grant.scopeType === 'DEPARTMENT' && grant.departmentId) permittedDepartmentIds.add(grant.departmentId);
  }
  const allowedDepartmentIds = managesEveryDepartment
    ? departments.map((department) => department.id)
    : departments.filter((department) => permittedDepartmentIds.has(department.id)).map((department) => department.id);

  let department: DepartmentRow | undefined;
  if (requestedDepartmentId) {
    department = departments.find((candidate) => candidate.id === requestedDepartmentId);
    if (!department) throw httpError(404, 'The selected department was not found in this company');
    if (!allowedDepartmentIds.includes(department.id)) {
      throw httpError(403, 'You do not have access to the selected department');
    }
  } else {
    const primaryDepartmentId = employments.find((employment) => employment.primaryEmployment)?.departmentId
      ?? employments.find((employment) => employment.departmentId)?.departmentId
      ?? null;
    department = departments.find((candidate) => candidate.id === primaryDepartmentId)
      ?? (allowedDepartmentIds.length === 1 ? departments.find((candidate) => candidate.id === allowedDepartmentIds[0]) : undefined);
  }

  const access: EntityAccessContext = {
    legalEntityId: entity.id,
    legalEntityCode: entity.code,
    legalEntityName: entity.displayName,
    legalEntityStatus: entity.status,
    departmentId: department?.id ?? null,
    departmentCode: department?.code ?? null,
    departmentName: department?.name ?? null,
    allowedDepartmentIds,
    accessLevel: identity.enterpriseOwner ? 'MANAGE' : rankAccess(Math.max(entityGrantRank, entity.hasEmployment ? 1 : 0)),
    enterpriseOwner: identity.enterpriseOwner,
    operational: entity.status === 'ACTIVE',
    enterpriseSharedRequest: isEnterpriseSharedPath(request.path),
    selectedBy,
  };

  return { identity, access };
}

export const entityAccessOf = (response: Response) => {
  const access = response.locals.entityAccess as EntityAccessContext | undefined;
  if (!access) throw httpError(500, 'Company access context was not resolved');
  return access;
};

export const requireEntityMatch = (access: EntityAccessContext, legalEntityId: string) => {
  if (access.legalEntityId !== legalEntityId) {
    throw httpError(403, 'The requested record belongs to a different company');
  }
};

export const requireDepartmentMatch = (access: EntityAccessContext, departmentId: string) => {
  if (!access.allowedDepartmentIds.includes(departmentId)) {
    throw httpError(403, 'The requested record belongs to a department you cannot access');
  }
};

export const requireEntityManageAccess = (access: EntityAccessContext) => {
  if (access.accessLevel !== 'MANAGE') {
    throw httpError(403, 'Company management access is required');
  }
};

export const requireEnterpriseOwner = (access: EntityAccessContext) => {
  if (!access.enterpriseOwner) {
    throw httpError(403, 'Only the Enterprise Owner may manage legal companies');
  }
};

export const createEntityAccessMiddleware = ({ prisma }: { prisma: PrismaClient }): RequestHandler =>
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const auth = response.locals.auth as BaseAuthContext | undefined;
      if (!auth && (
        request.path.startsWith('/public/')
        || request.path.startsWith('/internal/')
        || request.path === '/health'
        || request.path === '/live'
      )) {
        next();
        return;
      }
      if (!auth) throw httpError(401, 'Authentication required');
      const { identity, access } = await resolveEntityAccess(prisma, auth, request);
      response.locals.entityAccess = access;
      response.locals.auth = {
        ...auth,
        userId: identity.id,
        organizationId: identity.organizationId,
        role: identity.role,
        email: identity.email,
        legalEntityId: access.legalEntityId,
        departmentId: access.departmentId,
        allowedDepartmentIds: access.allowedDepartmentIds,
        entityAccessLevel: access.accessLevel,
        enterpriseOwner: access.enterpriseOwner,
      } satisfies ScopedAuthContext;
      next();
    } catch (error) {
      next(error);
    }
  };
