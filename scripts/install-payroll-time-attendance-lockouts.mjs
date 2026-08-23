import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routesPath = path.join(root, 'api', 'src', 'time-attendance-routes.ts');
const payrollPath = path.join(root, 'api', 'src', 'time-attendance-payroll-lock.ts');

let payroll = await readFile(payrollPath, 'utf8');
const stableOld = `const stable = (value: unknown): unknown => {\n  if (Array.isArray(value)) return value.map(stable);\n  if (value && typeof value === 'object') {`;
const stableNew = `const stable = (value: unknown): unknown => {\n  if (value instanceof Date) return value.toISOString();\n  if (Array.isArray(value)) return value.map(stable);\n  if (value && typeof value === 'object') {`;
if (!payroll.includes('if (value instanceof Date) return value.toISOString();\n  if (Array.isArray(value))')) {
  if (!payroll.includes(stableOld)) throw new Error('Payroll lock installer could not find deterministic fingerprint normalizer anchor');
  payroll = payroll.replace(stableOld, stableNew);
}
payroll = payroll.replaceAll(
  `RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;`,
  `IF TG_OP='DELETE' THEN RETURN OLD; END IF;\n      RETURN NEW;`,
);
await writeFile(payrollPath, payroll, 'utf8');

let source = await readFile(routesPath, 'utf8');
const importStatement = `import { ensureTimeAttendancePayrollLockSchema, registerTimeAttendancePayrollLockRoutes } from './time-attendance-payroll-lock.js';`;
if (!source.includes(importStatement)) {
  const importAnchor = `import { entityAccessOf, requireEntityManageAccess, type EntityAccessContext } from './entity-access.js';`;
  if (!source.includes(importAnchor)) throw new Error('Payroll lock installer could not find time-attendance import anchor');
  source = source.replace(importAnchor, `${importAnchor}\n${importStatement}`);
}

const schemaAnchor = `  await prisma.$executeRawUnsafe(\`ALTER TABLE \"TimeAttendanceAudit\" ADD COLUMN IF NOT EXISTS \"legalEntityId\" TEXT\`);\n};`;
const schemaReplacement = `  await prisma.$executeRawUnsafe(\`ALTER TABLE \"TimeAttendanceAudit\" ADD COLUMN IF NOT EXISTS \"legalEntityId\" TEXT\`);\n  await ensureTimeAttendancePayrollLockSchema(prisma);\n};`;
if (!source.includes('await ensureTimeAttendancePayrollLockSchema(prisma);')) {
  if (!source.includes(schemaAnchor)) throw new Error('Payroll lock installer could not find time-attendance schema anchor');
  source = source.replace(schemaAnchor, schemaReplacement);
}

const registrarAnchor = `  const admin = requireRoles(UserRole.ADMINISTRATOR, UserRole.PROGRAM_MANAGER, UserRole.HR_MANAGER, UserRole.SCHEDULER, UserRole.CEO, UserRole.COO);`;
const registrarStatement = `  registerTimeAttendancePayrollLockRoutes({ app, prisma, authOf, admin, ready });`;
if (!source.includes(registrarStatement)) {
  if (!source.includes(registrarAnchor)) throw new Error('Payroll lock installer could not find time-attendance admin middleware anchor');
  source = source.replace(registrarAnchor, `${registrarAnchor}\n  ${registrarStatement.trim()}`);
}

await writeFile(routesPath, source, 'utf8');
console.log('Payroll time-attendance lockouts installed with immutable locked clock entries, clock-correction guards, deterministic payroll snapshots, reopen audit, and export gating.');
