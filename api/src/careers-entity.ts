import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { EntityAccessContext } from './entity-access.js';
import { requireDepartmentMatch } from './entity-access.js';

export type CareerEntity = {
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  status: 'ACTIVE' | 'PLANNED' | 'INACTIVE';
  isEmployer: boolean;
};

export type CareerDepartment = {
  id: string;
  code: string;
  name: string;
};

const requestError = (status: number, message: string) => Object.assign(new Error(message), { status });

export async function publicCareerEntity(
  prisma: PrismaClient,
  organizationId: string,
  requestedCode?: string | null,
) {
  const code = requestedCode?.trim().toUpperCase() || 'SCLS';
  const rows = await prisma.$queryRawUnsafe<CareerEntity[]>(
    `SELECT "id","code","legalName","displayName","status","isEmployer"
     FROM "LegalEntity"
     WHERE "organizationId"=$1 AND "code"=$2 AND "status"='ACTIVE' AND "isEmployer"=true
     LIMIT 1`,
    organizationId,
    code,
  );
  if (!rows[0]) throw requestError(404, 'Careers are not currently available for the selected company');
  return rows[0];
}

export async function careerEntityById(
  prisma: PrismaClient,
  organizationId: string,
  legalEntityId: string,
) {
  const rows = await prisma.$queryRawUnsafe<CareerEntity[]>(
    `SELECT "id","code","legalName","displayName","status","isEmployer"
     FROM "LegalEntity" WHERE "organizationId"=$1 AND "id"=$2 LIMIT 1`,
    organizationId,
    legalEntityId,
  );
  if (!rows[0]) throw requestError(404, 'Hiring company was not found');
  return rows[0];
}

const roleDepartmentCodes = (roleOrTitle?: string | null) => {
  const value = String(roleOrTitle || '').toUpperCase();
  if (/DELEGATING_NURSE|\bRN\b|\bLPN\b|NURS/.test(value)) return ['NURSING', 'CLINICAL_SERVICES'];
  if (/DRIVER|TRANSPORT|NMT|DISPATCH/.test(value)) return ['DRIVERS', 'DISPATCH', 'COMMUNITY_LIVING'];
  if (/DSP|DIRECT SUPPORT|HOUSE_MANAGER|PROGRAM_MANAGER|COMMUNITY/.test(value)) return ['COMMUNITY_LIVING'];
  if (/HUMAN_RESOURCES|\bHR\b/.test(value)) return ['HUMAN_RESOURCES', 'ADMINISTRATION'];
  return ['ADMINISTRATION'];
};

export async function publicCareerDepartment(
  prisma: PrismaClient,
  organizationId: string,
  legalEntityId: string,
  roleOrTitle?: string | null,
) {
  const departments = await prisma.$queryRawUnsafe<CareerDepartment[]>(
    `SELECT "id","code","name" FROM "Department"
     WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "active"=true
     ORDER BY "name"`,
    organizationId,
    legalEntityId,
  );
  for (const code of [...roleDepartmentCodes(roleOrTitle), 'ADMINISTRATION']) {
    const department = departments.find((candidate) => candidate.code === code);
    if (department) return department;
  }
  if (!departments[0]) throw requestError(409, 'The hiring company has no active department for this application');
  return departments[0];
}

export async function resolveCareerDepartment(
  prisma: PrismaClient,
  organizationId: string,
  access: EntityAccessContext,
  options: { departmentId?: string | null; departmentLabel?: string | null; roleOrTitle?: string | null },
) {
  const departments = await prisma.$queryRawUnsafe<CareerDepartment[]>(
    `SELECT "id","code","name" FROM "Department"
     WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "active"=true
     ORDER BY "name"`,
    organizationId,
    access.legalEntityId,
  );
  if (!departments.length) throw requestError(409, 'The selected company has no active hiring department');

  let department = options.departmentId
    ? departments.find((candidate) => candidate.id === options.departmentId)
    : undefined;
  if (options.departmentId && !department) {
    throw requestError(400, 'The selected hiring department does not belong to this company');
  }
  if (!department && options.departmentLabel) {
    const normalized = options.departmentLabel.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    department = departments.find((candidate) =>
      candidate.code === normalized || candidate.name.toLowerCase() === options.departmentLabel?.trim().toLowerCase());
  }
  if (!department) {
    for (const code of roleDepartmentCodes(options.roleOrTitle)) {
      department = departments.find((candidate) => candidate.code === code);
      if (department) break;
    }
  }
  department ??= departments.find((candidate) => candidate.id === access.departmentId);
  department ??= departments.find((candidate) => candidate.code === 'ADMINISTRATION');
  department ??= departments.find((candidate) => access.allowedDepartmentIds.includes(candidate.id));
  if (!department) throw requestError(403, 'You do not have access to an active hiring department in this company');
  requireDepartmentMatch(access, department.id);
  return department;
}

export function careersReferenceNumber(entityCode: string) {
  const prefix = entityCode.replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'SULANDRA';
  return `${prefix}-APP-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export const companyDivisionLine = (entity: Pick<CareerEntity, 'displayName'>) =>
  entity.displayName === 'Sulandra Health' ? entity.displayName : `${entity.displayName} · Sulandra Health`;
