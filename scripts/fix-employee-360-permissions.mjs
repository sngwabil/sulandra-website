import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const permissionPath = path.join(root, 'api', 'src', 'employee-360-permissions.ts');
let source = await readFile(permissionPath, 'utf8');

const ensureAnchor = `  const ensureSchema = () => schemaPromise ??= (async () => {\n    await prisma.$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS "Employee360AccessGrant" (`;
if (!source.includes('Employee360 permission prerequisites')) {
  const prerequisites = `  const ensureSchema = () => schemaPromise ??= (async () => {\n    // Employee360 permission prerequisites: the authorization middleware runs before the management routes.\n    await prisma.$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS "EmployeeManagementProfile" (\n      "userId" TEXT PRIMARY KEY,\n      "organizationId" TEXT NOT NULL,\n      "displayName" TEXT,\n      "employeeNumber" TEXT,\n      "personalEmail" TEXT,\n      "phone" TEXT,\n      "alternatePhone" TEXT,\n      "department" TEXT,\n      "jobTitle" TEXT,\n      "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',\n      "hireDate" DATE,\n      "terminationDate" DATE,\n      "supervisorId" TEXT,\n      "streetAddress" TEXT,\n      "city" TEXT,\n      "state" TEXT,\n      "zipCode" TEXT,\n      "emergencyContactName" TEXT,\n      "emergencyContactPhone" TEXT,\n      "notes" TEXT,\n      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    )\`);\n    await prisma.$executeRawUnsafe(\`CREATE INDEX IF NOT EXISTS "EmployeeManagementProfile_org_idx" ON "EmployeeManagementProfile"("organizationId")\`);\n    await prisma.$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS "EmployeeDocument" (\n      "id" TEXT PRIMARY KEY,\n      "organizationId" TEXT NOT NULL,\n      "employeeId" TEXT NOT NULL,\n      "category" TEXT NOT NULL,\n      "title" TEXT NOT NULL,\n      "fileName" TEXT NOT NULL,\n      "mimeType" TEXT NOT NULL,\n      "contentBase64" TEXT NOT NULL,\n      "fileSizeBytes" INTEGER NOT NULL,\n      "issueDate" DATE,\n      "expirationDate" DATE,\n      "notes" TEXT NOT NULL DEFAULT '',\n      "sensitivity" TEXT NOT NULL DEFAULT 'GENERAL',\n      "employeeVisible" BOOLEAN NOT NULL DEFAULT FALSE,\n      "status" TEXT NOT NULL DEFAULT 'ACTIVE',\n      "uploadedById" TEXT NOT NULL,\n      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()\n    )\`);\n    await prisma.$executeRawUnsafe(\`CREATE INDEX IF NOT EXISTS "EmployeeDocument_employee_idx" ON "EmployeeDocument"("organizationId","employeeId","status")\`);\n    await prisma.$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS "Employee360AccessGrant" (`;
  if (!source.includes(ensureAnchor)) throw new Error('Unable to locate Employee 360 permission schema anchor');
  source = source.replace(ensureAnchor, prerequisites);
}

const scopeIndexAnchor = '    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Employee360AccessGrant_scope_idx" ON "Employee360AccessGrant"("organizationId","scopeType","locationId","employeeId")`);';
if (!source.includes('Employee360AccessGrant_active_unique_idx')) {
  source = source.replace(
    scopeIndexAnchor,
    `${scopeIndexAnchor}\n    await prisma.$executeRawUnsafe(\`CREATE UNIQUE INDEX IF NOT EXISTS "Employee360AccessGrant_active_unique_idx" ON "Employee360AccessGrant"("organizationId","actorUserId","profile","scopeType",COALESCE("locationId",''),COALESCE("employeeId",'')) WHERE "active"=TRUE\`);`,
  );
}

if (!source.includes('const profileSnapshot = async')) {
  const maskAnchor = '  const maskEmployee = (employee: Record<string, unknown>, capabilities: Record<Capability, boolean>) => {';
  const snapshotHelper = `  const profileSnapshot = async (auth: AuthContext, employeeId: string) => {\n    const rows = await prisma.$queryRawUnsafe<any[]>(\n      \`SELECT COALESCE(NULLIF(p."displayName",''),NULLIF(c."displayName",''),u."email") AS "displayName",\n              p."employeeNumber",p."personalEmail",p."phone",p."alternatePhone",p."department",p."jobTitle",\n              COALESCE(p."employmentStatus",'ACTIVE') AS "employmentStatus",p."hireDate",p."terminationDate",p."supervisorId",\n              p."streetAddress",p."city",p."state",p."zipCode",p."emergencyContactName",p."emergencyContactPhone",p."notes"\n       FROM "User" u\n       LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"\n       LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"\n       WHERE u."id"=$1 AND u."organizationId"=$2 LIMIT 1\`,\n      employeeId,\n      auth.organizationId,\n    );\n    if (!rows[0]) throw Object.assign(new Error('Employee profile was not found'), { status: 404 });\n    return rows[0];\n  };\n\n${maskAnchor}`;
  if (!source.includes(maskAnchor)) throw new Error('Unable to locate Employee 360 profile masking anchor');
  source = source.replace(maskAnchor, snapshotHelper);
}

const profileBlockAnchor = `        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {\n          await requireCapability(auth, req, policies, target, 'VIEW_HR_NOTES', { write: true });\n        }\n        return void next();`;
if (!source.includes('Preserve fields outside the actor')) {
  const replacement = `        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notes')) {\n          await requireCapability(auth, req, policies, target, 'VIEW_HR_NOTES', { write: true });\n        }\n\n        // Preserve fields outside the actor's permission set so a limited edit cannot erase confidential data.\n        const current = await profileSnapshot(auth, target.id);\n        const access = capabilityMap(policies, target);\n        const merged = { ...current, ...(req.body || {}) };\n        if (!access.MANAGE_PRIVATE_PROFILE) {\n          for (const field of sensitiveFields) merged[field] = current[field];\n        }\n        if (!access.MANAGE_EMPLOYMENT) {\n          for (const field of ['employmentStatus', 'hireDate', 'terminationDate', 'supervisorId']) merged[field] = current[field];\n        }\n        if (!access.VIEW_HR_NOTES) merged.notes = current.notes;\n        merged.displayName = merged.displayName || current.displayName;\n        merged.employmentStatus = merged.employmentStatus || current.employmentStatus || 'ACTIVE';\n        req.body = merged;\n        return void next();`;
  if (!source.includes(profileBlockAnchor)) throw new Error('Unable to locate Employee 360 scoped profile-write anchor');
  source = source.replace(profileBlockAnchor, replacement);
}

await writeFile(permissionPath, source, 'utf8');
console.log('Employee 360 permission prerequisites, duplicate-grant protection, and restricted-field preservation are build-safe.');
