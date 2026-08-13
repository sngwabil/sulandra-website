import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','src','spire-workspace-completion-routes.ts');
let source=await readFile(target,'utf8');
const replacements=[
  [
    ');const out=[];for(const row of rows){const patientId=',
    ');const out:Array<Record<string,unknown>>=[];for(const row of rows){const patientId=',
  ],
  [
    ')]);const out=[];for(const row of [...orders,...meds]){const patientId=',
    ')]);const out:Array<Record<string,unknown>>=[];for(const row of [...orders,...meds]){const patientId=',
  ],
];
let changed=false;
for(const [before,after] of replacements){
  if(source.includes(before)){source=source.replace(before,after);changed=true;}
}
for(const required of [
  'const out:Array<Record<string,unknown>>=[];for(const row of rows)',
  'const out:Array<Record<string,unknown>>=[];for(const row of [...orders,...meds])',
]){
  if(!source.includes(required))throw new Error(`SPIRE workspace TypeScript repair invariant missing: ${required}`);
}
if(changed)await writeFile(target,source,'utf8');
console.log(changed?'SPIRE workspace task/order row arrays now preserve Record<string, unknown> typing.':'SPIRE workspace task/order row arrays are already build-safe.');

// Keep the medication-order raw SQL aligned with PostgreSQL's DATE columns.
// Prisma binds the ISO YYYY-MM-DD values as text for $executeRawUnsafe, so the
// INSERT must cast those parameters explicitly rather than relying on an
// implicit text-to-date conversion.
const clinicalTarget=path.join(root,'api','src','clinical-routes.ts');
let clinicalSource=await readFile(clinicalTarget,'utf8');
const medicationOrderBefore=`VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,'ACTIVE',$12,$12,NOW(),NOW())`;
const medicationOrderAfter=`VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::date,$10::date,$11,'ACTIVE',$12,$12,NOW(),NOW())`;
let medicationOrderChanged=false;
if(clinicalSource.includes(medicationOrderBefore)){
  clinicalSource=clinicalSource.replace(medicationOrderBefore,medicationOrderAfter);
  medicationOrderChanged=true;
}else if(!clinicalSource.includes(medicationOrderAfter)){
  throw new Error('SPIRE medication-order INSERT SQL marker not found; refusing to patch an unknown route shape.');
}
if(medicationOrderChanged)await writeFile(clinicalTarget,clinicalSource,'utf8');
console.log(medicationOrderChanged?'SPIRE medication order startDate/endDate SQL parameters now cast to date.':'SPIRE medication order date casts are already build-safe.');
