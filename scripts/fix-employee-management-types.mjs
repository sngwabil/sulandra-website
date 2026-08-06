import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routePath = path.join(root, 'api', 'src', 'employee-management-routes.ts');
let source = await readFile(routePath, 'utf8');

source = source.replace(
  "personalEmail: z.string().trim().email().optional().nullable(),",
  "personalEmail: z.union([z.string().trim().email(), z.literal('')]).optional().nullable().transform((value) => value || null),",
);

source = source.replace(
  /  const manager = requireRoles\([\s\S]*?\n  \);\n\n  const tableExists/,
  `  const manager = requireRoles(\n    UserRole.ADMINISTRATOR,\n    UserRole.PROGRAM_MANAGER,\n    UserRole.HR_MANAGER,\n    UserRole.HOUSE_MANAGER,\n    UserRole.SCHEDULER,\n    UserRole.AUDITOR,\n    UserRole.ADMINISTRATIVE_ASSISTANT,\n    UserRole.BILLING_SPECIALIST,\n    UserRole.DELEGATING_NURSE,\n    UserRole.CEO,\n    UserRole.COO,\n  );\n\n  const tableExists`,
);

if (!source.includes("sensitivity: z.enum(['GENERAL'")) {
  source = source.replace(
    "  notes: z.string().trim().max(4_000).optional().default(''),\n});\n\nconst documentPatchSchema",
    "  notes: z.string().trim().max(4_000).optional().default(''),\n  sensitivity: z.enum(['GENERAL', 'HR_CONFIDENTIAL', 'MEDICAL', 'BACKGROUND', 'DISCIPLINARY', 'IDENTITY', 'COMPENSATION']).optional().default('GENERAL'),\n  employeeVisible: z.boolean().optional().default(false),\n});\n\nconst documentPatchSchema",
  );
}

if (!source.includes("employeeVisible: z.boolean().optional(),")) {
  source = source.replace(
    "  notes: z.string().trim().max(4_000).optional(),\n});\n\nconst emailSchema",
    "  notes: z.string().trim().max(4_000).optional(),\n  sensitivity: z.enum(['GENERAL', 'HR_CONFIDENTIAL', 'MEDICAL', 'BACKGROUND', 'DISCIPLINARY', 'IDENTITY', 'COMPENSATION']).optional(),\n  employeeVisible: z.boolean().optional(),\n});\n\nconst emailSchema",
  );
}

source = source.replace(
  `      "notes" TEXT NOT NULL DEFAULT '',\n      "status" TEXT NOT NULL DEFAULT 'ACTIVE',`,
  `      "notes" TEXT NOT NULL DEFAULT '',\n      "sensitivity" TEXT NOT NULL DEFAULT 'GENERAL',\n      "employeeVisible" BOOLEAN NOT NULL DEFAULT FALSE,\n      "status" TEXT NOT NULL DEFAULT 'ACTIVE',`,
);

const expirationIndexAnchor = '    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeDocument_expiration_idx" ON "EmployeeDocument"("organizationId","expirationDate")`);';
if (!source.includes('ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "sensitivity"')) {
  source = source.replace(
    expirationIndexAnchor,
    `${expirationIndexAnchor}\n    await prisma.$executeRawUnsafe(\`ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "sensitivity" TEXT NOT NULL DEFAULT 'GENERAL'\`);\n    await prisma.$executeRawUnsafe(\`ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "employeeVisible" BOOLEAN NOT NULL DEFAULT FALSE\`);\n    await prisma.$executeRawUnsafe(\`CREATE INDEX IF NOT EXISTS "EmployeeDocument_sensitivity_idx" ON "EmployeeDocument"("organizationId","employeeId","sensitivity","status")\`);`,
  );
}

source = source.replace(
  '`SELECT "id","category","title","fileName","mimeType","fileSizeBytes","issueDate","expirationDate","notes","status","createdAt","updatedAt",\n                  CASE WHEN "expirationDate" IS NULL',
  '`SELECT "id","category","title","fileName","mimeType","fileSizeBytes","issueDate","expirationDate","notes","status","createdAt","updatedAt",\n                  COALESCE("sensitivity",\'GENERAL\') AS "sensitivity",COALESCE("employeeVisible",FALSE) AS "employeeVisible",\n                  CASE WHEN "expirationDate" IS NULL',
);

source = source.replace(
  `          ("id","organizationId","employeeId","category","title","fileName","mimeType","contentBase64","fileSizeBytes","issueDate","expirationDate","notes","uploadedById")\n         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
  `          ("id","organizationId","employeeId","category","title","fileName","mimeType","contentBase64","fileSizeBytes","issueDate","expirationDate","notes","sensitivity","employeeVisible","uploadedById")\n         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
);
source = source.replace(
  `        content, buffer.length, input.issueDate ?? null, input.expirationDate ?? null, input.notes, auth.userId,`,
  `        content, buffer.length, input.issueDate ?? null, input.expirationDate ?? null, input.notes, input.sensitivity, input.employeeVisible, auth.userId,`,
);

source = source.replace(
  '`UPDATE "EmployeeDocument" SET "category"=$1,"title"=$2,"issueDate"=$3,"expirationDate"=$4,"notes"=$5,"updatedAt"=NOW()\n         WHERE "id"=$6 AND "employeeId"=$7 AND "organizationId"=$8 RETURNING "id","category","title","issueDate","expirationDate","notes","updatedAt"`,
  '`UPDATE "EmployeeDocument" SET "category"=$1,"title"=$2,"issueDate"=$3,"expirationDate"=$4,"notes"=$5,"sensitivity"=$6,"employeeVisible"=$7,"updatedAt"=NOW()\n         WHERE "id"=$8 AND "employeeId"=$9 AND "organizationId"=$10 RETURNING "id","category","title","issueDate","expirationDate","notes","sensitivity","employeeVisible","updatedAt"`,
);
source = source.replace(
  `        merged.category, merged.title, merged.issueDate ?? null, merged.expirationDate ?? null, merged.notes ?? '',\n        req.params.documentId, req.params.employeeId, auth.organizationId,`,
  `        merged.category, merged.title, merged.issueDate ?? null, merged.expirationDate ?? null, merged.notes ?? '',\n        merged.sensitivity ?? 'GENERAL', Boolean(merged.employeeVisible), req.params.documentId, req.params.employeeId, auth.organizationId,`,
);

await writeFile(routePath, source, 'utf8');
console.log('Employee 360 optional fields, scoped roles, document sensitivity, and employee visibility are build-safe.');
