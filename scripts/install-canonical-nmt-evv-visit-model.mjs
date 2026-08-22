import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','src','nmt-trip-routes.ts');
let source=await readFile(target,'utf8');

const replaceOnce=(from,to,label)=>{
  if(source.includes(to))return;
  if(!source.includes(from))throw new Error(`Canonical NMT EVV installer could not find ${label}`);
  source=source.replace(from,to);
};

const zodImport="import { z } from 'zod';";
const evvImport="import { createCanonicalNmtEvvVisit, ensureCanonicalNmtEvvSchema } from './spire-nmt-evv-canonical.js';";
if(!source.includes(evvImport)){
  replaceOnce(zodImport,`${zodImport}\n${evvImport}`,'NMT route import anchor');
}

const oldTransition="const transitionSchema=z.object({status:z.enum(['SCHEDULED','DISPATCHED','EN_ROUTE','ARRIVED_PICKUP','RIDER_ON_BOARD','DEPARTED_PICKUP','ARRIVED_DROPOFF','COMPLETED','NO_SHOW','CANCELLED']),odometer:z.number().min(0).max(9999999).optional().nullable(),driverNotes:z.string().trim().max(5000).optional().nullable(),reason:z.string().trim().max(5000).optional().nullable()});";
const newTransition="const nmtEvvCompletionSchema=z.object({providerMedicaidId:z.string().trim().min(1).max(80),patientOtherId:z.string().trim().max(120).optional().nullable(),patientMedicaidId:z.string().trim().min(1).max(80),payer:z.string().trim().min(1).max(120),payerProgram:z.string().trim().min(1).max(120),procedureCode:z.string().trim().min(1).max(120),driverSignature:z.string().trim().min(2).max(500000),driverSignatureMethod:z.enum(['DRAWN','TYPED','ELECTRONIC','PIN']).default('ELECTRONIC'),otherPersonsPresent:z.array(z.string().trim().min(1).max(200)).max(30).default([]),timeZone:z.string().trim().min(1).max(80).default('US/Eastern')});\nconst transitionSchema=z.object({status:z.enum(['SCHEDULED','DISPATCHED','EN_ROUTE','ARRIVED_PICKUP','RIDER_ON_BOARD','DEPARTED_PICKUP','ARRIVED_DROPOFF','COMPLETED','NO_SHOW','CANCELLED']),odometer:z.number().min(0).max(9999999).optional().nullable(),driverNotes:z.string().trim().max(5000).optional().nullable(),reason:z.string().trim().max(5000).optional().nullable(),evv:nmtEvvCompletionSchema.optional()});";
replaceOnce(oldTransition,newTransition,'trip transition schema');

const reasonAnchor="if(['NO_SHOW','CANCELLED'].includes(to)&&!i.reason)throw httpError(400,`${to==='NO_SHOW'?'No-show':'Cancellation'} reason is required`);const timeColumn";
const evvRequirement="if(['NO_SHOW','CANCELLED'].includes(to)&&!i.reason)throw httpError(400,`${to==='NO_SHOW'?'No-show':'Cancellation'} reason is required`);const evvEvidence=to==='COMPLETED'&&!training?i.evv:null;if(to==='COMPLETED'&&!training&&!evvEvidence)throw httpError(400,'Canonical NMT EVV evidence and driver signature are required before trip completion');if(evvEvidence)await ensureCanonicalNmtEvvSchema(prisma);const timeColumn";
replaceOnce(reasonAnchor,evvRequirement,'pre-completion EVV requirement');

const oldExecute="const q=`UPDATE \"NmtTrip\" SET ${sets.join(',')} WHERE \"organizationId\"=$${idx++} AND \"legalEntityId\"=$${idx++} AND \"id\"=$${idx++}`;await prisma.$executeRawUnsafe(q,...values);const refreshed=await trip(prisma,a,req.params.tripId);await event(prisma,a,refreshed,actorType(a),'STATUS_CHANGED',from,to,{odometer:i.odometer??null,reason:i.reason??null,driverNotes:i.driverNotes??null},req);res.json({data:refreshed});";
const newExecute="const q=`UPDATE \"NmtTrip\" SET ${sets.join(',')} WHERE \"organizationId\"=$${idx++} AND \"legalEntityId\"=$${idx++} AND \"id\"=$${idx++}`;let canonicalEvvVisit:Record<string,unknown>|null=null;if(evvEvidence){await prisma.$transaction(async(tx)=>{await tx.$executeRawUnsafe(q,...values);canonicalEvvVisit=await createCanonicalNmtEvvVisit(tx,{organizationId:a.organizationId,legalEntityId:selectedEntity(a),tripId:req.params.tripId,actorUserId:a.userId,evidence:evvEvidence});});}else{await prisma.$executeRawUnsafe(q,...values);}const refreshed=await trip(prisma,a,req.params.tripId);await event(prisma,a,refreshed,actorType(a),'STATUS_CHANGED',from,to,{odometer:i.odometer??null,reason:i.reason??null,driverNotes:i.driverNotes??null,evvVisitId:canonicalEvvVisit?String(canonicalEvvVisit.id||''):null},req);res.json({data:refreshed,evvVisit:canonicalEvvVisit});";
replaceOnce(oldExecute,newExecute,'atomic NMT completion update');

await writeFile(target,source,'utf8');
console.log('Canonical NMT EVV visit completion installed: operational trip completion is atomic with immutable route, vehicle, persons-present and driver-signature evidence.');
