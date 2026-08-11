import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api/src/client-intake-routes.ts');
const marker = 'CLIENT_INTAKE_DISPOSITION_V1';
let source = await readFile(target, 'utf8');

if (!source.includes(marker)) {
  const anchor = "  app.get('/api/admin/client-intakes/:caseId/duplicate-candidates'";
  if (!source.includes(anchor)) throw new Error('Client Intake disposition route anchor was not found');
  const routes = `  /* ${marker}: retain rejected/archived intake records while removing them from active work queues. */\n` +
`  app.post('/api/admin/client-intakes/:caseId/disposition',async(req,res,next)=>{try{const a=authOf(res);const action=String(req.body?.action||'').trim().toUpperCase(),reason=clean(req.body?.reason,6000);if(!['ARCHIVE','REJECT'].includes(action))throw httpError(400,'Choose ARCHIVE or REJECT');const caseRow=await requireCase(prisma,a,req.params.caseId),status=String(caseRow.status||'');if(action==='REJECT'){ensureReview(a);if(!['DRAFT','IN_PROGRESS','REVIEW_REQUIRED'].includes(status))throw httpError(409,'Only a draft or intake returned for changes can be rejected here');if(!reason)throw httpError(400,'Enter the reason this intake is being rejected');await prisma.$executeRawUnsafe(\`UPDATE "ClientIntakeCase" SET "status"='REJECTED',"reviewNotes"=$1,"reviewedAt"=NOW(),"reviewedById"=$2,"closedAt"=NOW(),"closedById"=$2,"metadata"=COALESCE("metadata",'{}'::jsonb)||$3::jsonb,"updatedAt"=NOW() WHERE "organizationId"=$4 AND "legalEntityId"=$5 AND "id"=$6\`,reason,a.userId,JSON.stringify({disposition:'REJECTED_DRAFT',dispositionReason:reason,disposedAt:new Date().toISOString(),disposedById:a.userId}),a.organizationId,selectedEntity(a),req.params.caseId);await event(prisma,a,req.params.caseId,'INTAKE_DRAFT_REJECTED',{reason});await audit?.(a,'REJECT_CLIENT_INTAKE_DRAFT','ClientIntakeCase',req.params.caseId,{legalEntityId:selectedEntity(a),reason});return void res.json({data:{status:'REJECTED'}});}ensureWrite(a);if(['APPROVED','CLOSED'].includes(status))throw httpError(409,'Approved or closed admissions cannot be archived from the intake work queue');if(status==='WITHDRAWN')return void res.json({data:{status:'WITHDRAWN'}});await prisma.$executeRawUnsafe(\`UPDATE "ClientIntakeCase" SET "status"='WITHDRAWN',"closedAt"=COALESCE("closedAt",NOW()),"closedById"=COALESCE("closedById",$1),"metadata"=COALESCE("metadata",'{}'::jsonb)||$2::jsonb,"updatedAt"=NOW() WHERE "organizationId"=$3 AND "legalEntityId"=$4 AND "id"=$5\`,a.userId,JSON.stringify({disposition:'ARCHIVED',dispositionReason:reason||null,archivedAt:new Date().toISOString(),archivedById:a.userId}),a.organizationId,selectedEntity(a),req.params.caseId);await event(prisma,a,req.params.caseId,'INTAKE_ARCHIVED',{reason:reason||null,previousStatus:status});await audit?.(a,'ARCHIVE_CLIENT_INTAKE','ClientIntakeCase',req.params.caseId,{legalEntityId:selectedEntity(a),reason:reason||null,previousStatus:status});res.json({data:{status:'WITHDRAWN'}});}catch(e){next(e);}});\n\n`;
  source = source.replace(anchor, routes + anchor);
  await writeFile(target, source, 'utf8');
}

console.log('Client Intake disposition backend installed: draft rejection and retained archive lifecycle are available.');
