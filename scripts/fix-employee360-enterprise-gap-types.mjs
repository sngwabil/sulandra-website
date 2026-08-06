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
await writeFile(target,source,'utf8');
console.log('Employee 360 audit-ledger default decision typing is build-safe.');
