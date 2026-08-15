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

// Chart Review category queries are also executed individually (for example,
// category=notes). Every individual SELECT therefore has to expose the same
// canonical column names that the outer history query sorts/renders. Without
// an explicit `AS date`, a single-category Notes request exposes `createdAt`
// and PostgreSQL correctly rejects `ORDER BY date` with SQLSTATE 42703.
const chartTarget=path.join(root,'api','src','spire-chart-routes.ts');
let chartSource=await readFile(chartTarget,'utf8');
const chartCategoryRepairs=[
  [
    'notes: `SELECT n."createdAt",\'Note\',COALESCE(n."title",n."noteType"),n."status",n."authorUserId",n."id"::text FROM "SpireClinicalNote" n WHERE n."organizationId"=$1 AND n."patientId"=$2`',
    'notes: `SELECT n."createdAt" AS date,\'Note\'::text AS type,COALESCE(n."title",n."noteType") AS description,n."status" AS status,n."authorUserId" AS author,n."id"::text AS "resourceId" FROM "SpireClinicalNote" n WHERE n."organizationId"=$1 AND n."patientId"=$2`',
  ],
  [
    'labs: `SELECT r."resultedAt",COALESCE(NULLIF(r."category",\'\'),\'Lab\'),r."testName",r."status",r."source",r."id"::text FROM "SpireResult" r WHERE r."organizationId"=$1 AND r."patientId"=$2`',
    'labs: `SELECT r."resultedAt" AS date,COALESCE(NULLIF(r."category",\'\'),\'Lab\') AS type,r."testName" AS description,r."status" AS status,r."source" AS author,r."id"::text AS "resourceId" FROM "SpireResult" r WHERE r."organizationId"=$1 AND r."patientId"=$2`',
  ],
  [
    'micro: `SELECT COALESCE(m."resultedAt",m."createdAt"),\'Microbiology\',m."testName",COALESCE(m."result",\'FINAL\'),m."specimen",m."id"::text FROM "SpireMicrobiologyResult" m WHERE m."organizationId"=$1 AND m."patientId"=$2`',
    'micro: `SELECT COALESCE(m."resultedAt",m."createdAt") AS date,\'Microbiology\'::text AS type,m."testName" AS description,COALESCE(m."result",\'FINAL\') AS status,m."specimen" AS author,m."id"::text AS "resourceId" FROM "SpireMicrobiologyResult" m WHERE m."organizationId"=$1 AND m."patientId"=$2`',
  ],
  [
    'pathology: `SELECT COALESCE(p."resultedAt",p."createdAt"),\'Pathology\',COALESCE(p."diagnosis",p."specimen",\'Pathology result\'),\'FINAL\',p."specimen",p."id"::text FROM "SpirePathologyResult" p WHERE p."organizationId"=$1 AND p."patientId"=$2`',
    'pathology: `SELECT COALESCE(p."resultedAt",p."createdAt") AS date,\'Pathology\'::text AS type,COALESCE(p."diagnosis",p."specimen",\'Pathology result\') AS description,\'FINAL\'::text AS status,p."specimen" AS author,p."id"::text AS "resourceId" FROM "SpirePathologyResult" p WHERE p."organizationId"=$1 AND p."patientId"=$2`',
  ],
  [
    'imaging: `SELECT COALESCE(i."performedAt",i."createdAt"),\'Imaging\',i."description",i."status",i."modality",i."id"::text FROM "SpireImagingStudy" i WHERE i."organizationId"=$1 AND i."patientId"=$2`',
    'imaging: `SELECT COALESCE(i."performedAt",i."createdAt") AS date,\'Imaging\'::text AS type,i."description" AS description,i."status" AS status,i."modality" AS author,i."id"::text AS "resourceId" FROM "SpireImagingStudy" i WHERE i."organizationId"=$1 AND i."patientId"=$2`',
  ],
  [
    'medications: `SELECT m."createdAt",\'Medication\',m."name" || \' \' || m."dose" || \' \' || m."route",m."status",m."orderedById",m."id"::text FROM "SpireMedicationOrder" m WHERE m."organizationId"=$1 AND m."patientId"=$2`',
    'medications: `SELECT m."createdAt" AS date,\'Medication\'::text AS type,m."name" || \' \' || m."dose" || \' \' || m."route" AS description,m."status" AS status,m."orderedById" AS author,m."id"::text AS "resourceId" FROM "SpireMedicationOrder" m WHERE m."organizationId"=$1 AND m."patientId"=$2`',
  ],
  [
    'orders: `SELECT o."orderedAt",\'Order\',o."name",o."status",o."orderedById",o."id"::text FROM "SpireOrder" o WHERE o."organizationId"=$1 AND o."patientId"=$2`',
    'orders: `SELECT o."orderedAt" AS date,\'Order\'::text AS type,o."name" AS description,o."status" AS status,o."orderedById" AS author,o."id"::text AS "resourceId" FROM "SpireOrder" o WHERE o."organizationId"=$1 AND o."patientId"=$2`',
  ],
  [
    'documents: `SELECT d."createdAt",\'Document\',d."title",d."status",d."createdById",d."id"::text FROM "SpireClinicalDocument" d WHERE d."organizationId"=$1 AND d."patientId"=$2`',
    'documents: `SELECT d."createdAt" AS date,\'Document\'::text AS type,d."title" AS description,d."status" AS status,d."createdById" AS author,d."id"::text AS "resourceId" FROM "SpireClinicalDocument" d WHERE d."organizationId"=$1 AND d."patientId"=$2`',
  ],
  [
    'media: `SELECT COALESCE(m."takenAt",m."createdAt"),\'Media\',COALESCE(m."caption",m."mediaType"),m."mediaType",NULL::text,m."id"::text FROM "SpireMediaItem" m WHERE m."organizationId"=$1 AND m."patientId"=$2`',
    'media: `SELECT COALESCE(m."takenAt",m."createdAt") AS date,\'Media\'::text AS type,COALESCE(m."caption",m."mediaType") AS description,m."mediaType" AS status,NULL::text AS author,m."id"::text AS "resourceId" FROM "SpireMediaItem" m WHERE m."organizationId"=$1 AND m."patientId"=$2`',
  ],
];
let chartChanged=false;
for(const [before,after] of chartCategoryRepairs){
  if(chartSource.includes(before)){
    chartSource=chartSource.replace(before,after);
    chartChanged=true;
  }else if(!chartSource.includes(after)){
    throw new Error(`SPIRE Chart Review category SQL marker changed; refusing an unsafe repair: ${before.slice(0,48)}`);
  }
}
for(const category of ['encounters','notes','labs','micro','pathology','imaging','medications','orders','documents','media']){
  const line=chartSource.split('\n').find((candidate)=>candidate.trimStart().startsWith(`${category}: \`SELECT `));
  if(!line || !line.includes(' AS date') || !line.includes(' AS type') || !line.includes(' AS description') || !line.includes(' AS author') || !line.includes('AS "resourceId"')){
    throw new Error(`SPIRE Chart Review category ${category} does not expose the canonical history columns.`);
  }
}
if(!chartSource.includes('history ORDER BY date DESC NULLS LAST')){
  throw new Error('SPIRE Chart Review outer date ordering contract changed.');
}
if(chartChanged)await writeFile(chartTarget,chartSource,'utf8');
console.log(chartChanged?'SPIRE Chart Review category queries now expose canonical date/type/description/status/author/resourceId columns.':'SPIRE Chart Review category aliases are already build-safe.');
