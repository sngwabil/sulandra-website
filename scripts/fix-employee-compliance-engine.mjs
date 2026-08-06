import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routePath = path.join(root, 'api', 'src', 'employee-compliance-routes.ts');
let source = await readFile(routePath, 'utf8');

const runIndexAnchor = '    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeComplianceRun_org_idx" ON "EmployeeComplianceRun"("organizationId","startedAt" DESC)`);';
if (!source.includes('EmployeeComplianceLease')) {
  if (!source.includes(runIndexAnchor)) throw new Error('Unable to locate compliance run schema anchor');
  source = source.replace(
    runIndexAnchor,
    `${runIndexAnchor}
    await prisma.$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS "EmployeeComplianceLease" (
      "organizationId" TEXT PRIMARY KEY,
      "token" TEXT NOT NULL,
      "lockedUntil" TIMESTAMPTZ NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )\`);
    await prisma.$executeRawUnsafe(\`CREATE INDEX IF NOT EXISTS "EmployeeComplianceLease_expiration_idx" ON "EmployeeComplianceLease"("lockedUntil")\`);`,
  );
}

const advisoryLockBlock = `    const lockName = \`employee-compliance:\${organizationId}\`;
    const lockRows = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(\`SELECT pg_try_advisory_lock(hashtext($1)) AS "locked"\`, lockName);
    if (!lockRows[0]?.locked) return { status: 'SKIPPED', reason: 'Another compliance run is already active' };
    const runId = randomUUID();`;
const leaseLockBlock = `    const leaseToken = randomUUID();
    const leaseRows = await prisma.$queryRawUnsafe<Array<{ token: string }>>(
      \`INSERT INTO "EmployeeComplianceLease" ("organizationId","token","lockedUntil","updatedAt")
       VALUES ($1,$2,NOW()+INTERVAL '6 hours',NOW())
       ON CONFLICT ("organizationId") DO UPDATE SET "token"=EXCLUDED."token","lockedUntil"=EXCLUDED."lockedUntil","updatedAt"=NOW()
       WHERE "EmployeeComplianceLease"."lockedUntil"<NOW()
       RETURNING "token"\`,
      organizationId,
      leaseToken,
    );
    if (leaseRows[0]?.token !== leaseToken) return { status: 'SKIPPED', reason: 'Another compliance run is already active' };
    const runId = randomUUID();`;
if (source.includes(advisoryLockBlock)) source = source.replace(advisoryLockBlock, leaseLockBlock);

const advisoryUnlockBlock = `    } finally {
      await prisma.$queryRawUnsafe(\`SELECT pg_advisory_unlock(hashtext($1))\`, lockName).catch(() => undefined);
    }`;
const leaseUnlockBlock = `    } finally {
      await prisma.$executeRawUnsafe(
        \`DELETE FROM "EmployeeComplianceLease" WHERE "organizationId"=$1 AND "token"=$2\`,
        organizationId,
        leaseToken,
      ).catch(() => undefined);
    }`;
if (source.includes(advisoryUnlockBlock)) source = source.replace(advisoryUnlockBlock, leaseUnlockBlock);

source = source.replace(
  `      actorId || employee.id,
    ).catch(() => undefined);`,
  `      actorId,
    ).catch(() => undefined);`,
);

source = source.replace(
  `        compliancePercent: filtered.length ? Math.round(filtered.filter((row) => row.status === 'COMPLIANT' || row.status === 'EXEMPT').length / filtered.length * 100) : 100,`,
  `        compliancePercent: filtered.length ? Math.round(filtered.filter((row) => ['COMPLIANT', 'DUE_SOON', 'EXEMPT'].includes(row.status)).length / filtered.length * 100) : 100,`,
);

const employeeSummaryAnchor = `      const summary = {
        total: rows.length,
        compliant: rows.filter((row) => row.status === 'COMPLIANT').length,
        dueSoon: rows.filter((row) => row.status === 'DUE_SOON').length,
        overdue: rows.filter((row) => row.status === 'OVERDUE').length,
        actionRequired: rows.filter((row) => ['MISSING', 'NOT_STARTED', 'IN_PROGRESS', 'DUE_SOON', 'OVERDUE'].includes(row.status)).length,
      };`;
const employeeSummaryReplacement = `      const summary = {
        total: rows.length,
        compliant: rows.filter((row) => row.status === 'COMPLIANT').length,
        currentlyCompliant: rows.filter((row) => ['COMPLIANT', 'DUE_SOON', 'EXEMPT'].includes(row.status)).length,
        dueSoon: rows.filter((row) => row.status === 'DUE_SOON').length,
        overdue: rows.filter((row) => row.status === 'OVERDUE').length,
        actionRequired: rows.filter((row) => ['MISSING', 'NOT_STARTED', 'IN_PROGRESS', 'DUE_SOON', 'OVERDUE'].includes(row.status)).length,
      };`;
if (source.includes(employeeSummaryAnchor)) source = source.replace(employeeSummaryAnchor, employeeSummaryReplacement);

const communicationInsertAnchor = `      if (await tableExists('EmployeeCommunication')) {
        await prisma.$executeRawUnsafe(`;
if (!source.includes('const communicationActorRows = await prisma.$queryRawUnsafe')) {
  source = source.replace(
    communicationInsertAnchor,
    `      if (await tableExists('EmployeeCommunication')) {
        const communicationActorRows = await prisma.$queryRawUnsafe<any[]>(
          \`SELECT "id" FROM "User" WHERE "organizationId"=$1
           ORDER BY CASE WHEN LOWER(COALESCE("email",''))=LOWER($2) THEN 0 WHEN "role"::text='HR_MANAGER' THEN 1 WHEN "role"::text='ADMINISTRATOR' THEN 2 ELSE 3 END LIMIT 1\`,
          organizationId,
          OWNER_EMAIL,
        ).catch(() => []);
        const communicationActorId = communicationActorRows[0]?.id || employee.id;
        await prisma.$executeRawUnsafe(`,
  );
  source = source.replace(
    `          assignment.employeeId,
        ).catch(() => undefined);`,
    `          communicationActorId,
        ).catch(() => undefined);`,
  );
}

const reviewRouteOld = `      const input = z.object({ status: z.enum(['APPROVED', 'REJECTED']), notes: z.string().trim().max(4_000).optional().nullable() }).parse(req.body);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        \`UPDATE "EmployeeDocument" SET "reviewStatus"=$1,"reviewedById"=$2,"reviewedAt"=NOW(),"notes"=CASE WHEN $3::text IS NULL THEN "notes" ELSE $3 END,"updatedAt"=NOW()
         WHERE "id"=$4 AND "organizationId"=$5 RETURNING "id","employeeId","reviewStatus"\`,
        input.status,
        auth.userId,
        input.notes || null,
        req.params.documentId,
        auth.organizationId,
      );
      if (!rows[0]) return void res.status(404).json({ error: 'Employee document was not found' });
      await requireEmployeeScope(auth, rows[0].employeeId);
      await audit?.(auth, \`COMPLIANCE_DOCUMENT_\${input.status}\`, 'EmployeeDocument', req.params.documentId, { employeeId: rows[0].employeeId, notes: input.notes || null });
      res.json({ data: rows[0] });`;
const reviewRouteNew = `      const input = z.object({ status: z.enum(['APPROVED', 'REJECTED']), notes: z.string().trim().max(4_000).optional().nullable() }).parse(req.body);
      const currentRows = await prisma.$queryRawUnsafe<any[]>(
        \`SELECT "id","employeeId" FROM "EmployeeDocument" WHERE "id"=$1 AND "organizationId"=$2 LIMIT 1\`,
        req.params.documentId,
        auth.organizationId,
      );
      if (!currentRows[0]) return void res.status(404).json({ error: 'Employee document was not found' });
      await requireEmployeeScope(auth, currentRows[0].employeeId);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        \`UPDATE "EmployeeDocument" SET "reviewStatus"=$1,"reviewedById"=$2,"reviewedAt"=NOW(),"notes"=CASE WHEN $3::text IS NULL THEN "notes" ELSE $3 END,"updatedAt"=NOW()
         WHERE "id"=$4 AND "organizationId"=$5 RETURNING "id","employeeId","reviewStatus"\`,
        input.status,
        auth.userId,
        input.notes || null,
        req.params.documentId,
        auth.organizationId,
      );
      await audit?.(auth, \`COMPLIANCE_DOCUMENT_\${input.status}\`, 'EmployeeDocument', req.params.documentId, { employeeId: rows[0].employeeId, notes: input.notes || null });
      await runEngine(auth.organizationId, 'MANUAL', auth.userId, false);
      res.json({ data: rows[0] });`;
if (source.includes(reviewRouteOld)) source = source.replace(reviewRouteOld, reviewRouteNew);

const createRequirementResponse = `      await audit?.(auth, 'CREATE_COMPLIANCE_REQUIREMENT', 'EmployeeComplianceRequirement', id, { code: input.code, title: input.title, requirementType: input.requirementType });
      res.status(201).json({ data: await requirementById(auth.organizationId, id) });`;
if (source.includes(createRequirementResponse) && !source.includes("CREATE_COMPLIANCE_REQUIREMENT', 'EmployeeComplianceRequirement', id, { code: input.code, title: input.title, requirementType: input.requirementType });\n      await runEngine")) {
  source = source.replace(
    createRequirementResponse,
    `      await audit?.(auth, 'CREATE_COMPLIANCE_REQUIREMENT', 'EmployeeComplianceRequirement', id, { code: input.code, title: input.title, requirementType: input.requirementType });
      await runEngine(auth.organizationId, 'MANUAL', auth.userId, false);
      res.status(201).json({ data: await requirementById(auth.organizationId, id) });`,
  );
}

const updateRequirementResponse = `      await audit?.(auth, 'UPDATE_COMPLIANCE_REQUIREMENT', 'EmployeeComplianceRequirement', req.params.id, { code: input.code, title: input.title, active: input.active });
      res.json({ data: await requirementById(auth.organizationId, req.params.id) });`;
if (source.includes(updateRequirementResponse) && !source.includes("UPDATE_COMPLIANCE_REQUIREMENT', 'EmployeeComplianceRequirement', req.params.id, { code: input.code, title: input.title, active: input.active });\n      await runEngine")) {
  source = source.replace(
    updateRequirementResponse,
    `      await audit?.(auth, 'UPDATE_COMPLIANCE_REQUIREMENT', 'EmployeeComplianceRequirement', req.params.id, { code: input.code, title: input.title, active: input.active });
      await runEngine(auth.organizationId, 'MANUAL', auth.userId, false);
      res.json({ data: await requirementById(auth.organizationId, req.params.id) });`,
  );
}

await writeFile(routePath, source, 'utf8');
console.log('Employee compliance distributed lease, scoped review, immediate reconciliation, and current-compliance metrics are hardened.');
