import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

const target=path.join(root,'api/src/employee360-enterprise-gap-routes.ts');
let source=await readFile(target,'utf8');
const schema="const auditSchema=z.object({employeeId:z.string().trim().optional().nullable(),action:z.string().trim().min(1).max(200),resourceType:z.string().trim().min(1).max(200),resourceId:z.string().trim().optional().nullable(),reason:z.string().trim().min(3).max(2000),before:z.unknown().optional(),after:z.unknown().optional(),decision:z.enum(['ALLOW','DENY']).default('ALLOW')});";
if(!source.includes('type LedgerInput=z.input<typeof auditSchema>;')){
  if(!source.includes(schema))throw new Error('Employee 360 audit schema anchor is missing');
  source=source.replace(schema,`${schema}\n\ntype LedgerInput=z.input<typeof auditSchema>;`);
}
source=source.replace('const ledger=async(auth:AuthContext,input:z.infer<typeof auditSchema>)=>{','const ledger=async(auth:AuthContext,rawInput:LedgerInput)=>{const input=auditSchema.parse(rawInput);');
if(!source.includes('rawInput:LedgerInput'))throw new Error('Employee 360 audit input typing was not repaired');

const readyEnd='  })().catch(e=>{readyPromise=null;throw e});';
const legacyColumnRepair=`    // Existing production tables may predate the current raw-SQL shape. CREATE TABLE IF NOT EXISTS\n    // does not add later columns, so repair those additive timestamp columns before dashboard queries.\n    await prisma.$executeRawUnsafe(\`ALTER TABLE IF EXISTS "EmployeeWorkAssignment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()\`);\n    await prisma.$executeRawUnsafe(\`ALTER TABLE IF EXISTS "EmployeeWorkAssignment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()\`);\n    await prisma.$executeRawUnsafe(\`ALTER TABLE IF EXISTS "EmployeeTimeCorrection" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()\`);\n    await prisma.$executeRawUnsafe(\`ALTER TABLE IF EXISTS "EmployeeUnifiedCommunication" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()\`);\n    await prisma.$executeRawUnsafe(\`ALTER TABLE IF EXISTS "EmployeeAccountSecurityEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()\`);\n    await prisma.$executeRawUnsafe(\`ALTER TABLE IF EXISTS "EmployeeAccountProfileChange" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()\`);\n    await prisma.$executeRawUnsafe(\`ALTER TABLE IF EXISTS "EmployeeAuditLedger" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()\`);\n`;
if(!source.includes('Existing production tables may predate the current raw-SQL shape.')){
  if(!source.includes(readyEnd))throw new Error('Employee 360 ready() completion anchor is missing');
  source=source.replace(readyEnd,legacyColumnRepair+readyEnd);
}
if(!source.includes('ADD COLUMN IF NOT EXISTS "createdAt"'))throw new Error('Employee 360 legacy timestamp compatibility was not installed');
await writeFile(target,source,'utf8');

const trainingPath=path.join(root,'api/src/spire-training-routes.ts');
let training=await readFile(trainingPath,'utf8');
training=training
  .replace('SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,\'ACTIVE\',$10','SELECT $1,$2,$3,$4,$5,$6,$7::date,$8,$9::jsonb,\'ACTIVE\',$10')
  .replace('VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,\'ACTIVE\',$10) RETURNING *','VALUES($1,$2,$3,$4,$5,$6,$7::date,$8,$9::jsonb,\'ACTIVE\',$10) RETURNING *');
if(!training.includes('$7::date'))throw new Error('SPIRE Training dateOfBirth PostgreSQL casts were not installed');
await writeFile(trainingPath,training,'utf8');

console.log('Employee 360 legacy timestamp compatibility and SPIRE Training date casts are build-safe.');
