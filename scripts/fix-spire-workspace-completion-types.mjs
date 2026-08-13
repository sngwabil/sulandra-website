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

const createAnchor=`      const auth = authOf(res); ensureAdministrator(auth); const input = medicationOrderSchema.parse(req.body);\n      const id = randomUUID();`;
const createReplacement=`      const auth = authOf(res); ensureAdministrator(auth); const input = medicationOrderSchema.parse(req.body);\n      const normalizedDueTimes = [...new Set(input.dueTimes.map(String))].sort();\n      const duplicateRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(\n        \`SELECT \"id\" FROM \"SpireMedicationOrder\"\n         WHERE \"organizationId\"=$1 AND \"clientId\"=$2 AND \"status\"='ACTIVE'\n           AND LOWER(TRIM(\"name\"))=LOWER(TRIM($3))\n           AND LOWER(TRIM(\"dose\"))=LOWER(TRIM($4))\n           AND LOWER(TRIM(\"route\"))=LOWER(TRIM($5))\n           AND LOWER(TRIM(\"frequency\"))=LOWER(TRIM($6))\n           AND COALESCE(\"dueTimes\",'[]'::jsonb)=$7::jsonb\n           AND \"startDate\"=$8::date\n           AND COALESCE(\"endDate\"::text,'')=COALESCE($9::text,'')\n         ORDER BY \"createdAt\" DESC LIMIT 1\`,\n        auth.organizationId, input.clientId, input.name, input.dose, input.route, input.frequency,\n        JSON.stringify(normalizedDueTimes), input.startDate.toISOString().slice(0, 10),\n        input.endDate?.toISOString().slice(0, 10) ?? null,\n      );\n      if (duplicateRows[0]) {\n        await generateMarOccurrences(prisma, {\n          id: duplicateRows[0].id, organizationId: auth.organizationId, clientId: input.clientId,\n          startDate: input.startDate, endDate: input.endDate, dueTimes: normalizedDueTimes,\n        });\n        await clinicalAudit(prisma, auth, 'MEDICATION_ORDER_DUPLICATE_BLOCKED', 'SpireMedicationOrder', duplicateRows[0].id, input.clientId, undefined, input);\n        return res.status(200).json({ data: { id: duplicateRows[0].id, ...input, dueTimes: normalizedDueTimes, status: 'ACTIVE', duplicatePrevented: true } });\n      }\n      const id = randomUUID();`;
if(clinicalSource.includes(createAnchor)) clinicalSource=clinicalSource.replace(createAnchor,createReplacement);
else if(!clinicalSource.includes('MEDICATION_ORDER_DUPLICATE_BLOCKED')) throw new Error('SPIRE medication-order create anchor changed');
clinicalSource=clinicalSource.replace('JSON.stringify(input.dueTimes), input.startDate.toISOString().slice(0, 10),','JSON.stringify(normalizedDueTimes), input.startDate.toISOString().slice(0, 10),');
clinicalSource=clinicalSource.replace('endDate: input.endDate, dueTimes: input.dueTimes });','endDate: input.endDate, dueTimes: normalizedDueTimes });');
clinicalSource=clinicalSource.replace("res.status(201).json({ data: { id, ...input, status: 'ACTIVE' } });","res.status(201).json({ data: { id, ...input, dueTimes: normalizedDueTimes, status: 'ACTIVE' } });");

for(const marker of ['MEDICATION_ORDER_DUPLICATE_BLOCKED','duplicatePrevented','normalizedDueTimes']){
  if(!clinicalSource.includes(marker))throw new Error(`SPIRE medication-order dedupe invariant missing: ${marker}`);
}
if(medicationOrderChanged||clinicalSource.includes('MEDICATION_ORDER_DUPLICATE_BLOCKED'))await writeFile(clinicalTarget,clinicalSource,'utf8');
console.log('SPIRE medication order date casts, duplicate prevention, and normalized due-time schedules are build-safe.');
