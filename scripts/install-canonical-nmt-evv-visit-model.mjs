import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tripPath=path.join(root,'api','src','nmt-trip-routes.ts');
const canonicalPath=path.join(root,'api','src','spire-evv-canonical.ts');
let source=await readFile(tripPath,'utf8');

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
const newExecute="const q=`UPDATE \"NmtTrip\" SET ${sets.join(',')} WHERE \"organizationId\"=$${idx++} AND \"legalEntityId\"=$${idx++} AND \"id\"=$${idx++}`;const canonicalEvvVisit=evvEvidence?await prisma.$transaction(async(tx)=>{await tx.$executeRawUnsafe(q,...values);return await createCanonicalNmtEvvVisit(tx,{organizationId:a.organizationId,legalEntityId:selectedEntity(a),tripId:req.params.tripId,actorUserId:a.userId,evidence:evvEvidence});}):(await prisma.$executeRawUnsafe(q,...values),null);const refreshed=await trip(prisma,a,req.params.tripId);await event(prisma,a,refreshed,actorType(a),'STATUS_CHANGED',from,to,{odometer:i.odometer??null,reason:i.reason??null,driverNotes:i.driverNotes??null,evvVisitId:canonicalEvvVisit?String(canonicalEvvVisit.id||''):null},req);res.json({data:refreshed,evvVisit:canonicalEvvVisit});";
replaceOnce(oldExecute,newExecute,'atomic NMT completion update');
await writeFile(tripPath,source,'utf8');

let canonical=await readFile(canonicalPath,'utf8');
const canonicalMarker="  const assignments = new Set(calls.map((call) => evvText(call.callAssignment, 40)));";
const nmtValidation=`  const sourceNmtTripId = evvText(visit.sourceNmtTripId, 160);\n  if (sourceNmtTripId) {\n    const nmtRequired: Array<[string,string]> = [\n      ['sourceNmtOrderId','NMT source order ID is required'],\n      ['nmtLegType','NMT leg type is required'],\n      ['originName','NMT origin name is required'],\n      ['originStreet','NMT origin street is required'],\n      ['originCity','NMT origin city is required'],\n      ['originState','NMT origin state is required'],\n      ['originPostalCode','NMT origin postal code is required'],\n      ['destinationName','NMT destination name is required'],\n      ['destinationStreet','NMT destination street is required'],\n      ['destinationCity','NMT destination city is required'],\n      ['destinationState','NMT destination state is required'],\n      ['destinationPostalCode','NMT destination postal code is required'],\n      ['vehicleLicensePlate','NMT vehicle license plate is required'],\n      ['driverSignature','NMT driver signature is required'],\n      ['driverSignatureSha256','NMT driver signature hash is required'],\n      ['driverSignatureMethod','NMT driver signature method is required'],\n      ['driverSignerUserId','NMT driver signer identity is required'],\n    ];\n    for (const [key,message] of nmtRequired) if (!evvText(visit[key], 500000)) errors.push(message);\n    if (!visit.driverSignedAt) errors.push('NMT driver signed timestamp is required');\n    if (!visit.immutableAt) errors.push('NMT immutable timestamp is required');\n    if (!Array.isArray(visit.personsPresent) || visit.personsPresent.length < 2) errors.push('NMT persons-present evidence is required');\n  }\n`;
if(!canonical.includes('NMT origin name is required')){
  if(!canonical.includes(canonicalMarker))throw new Error('Canonical EVV validation marker is missing');
  canonical=canonical.replace(canonicalMarker,`${nmtValidation}${canonicalMarker}`);
}
await writeFile(canonicalPath,canonical,'utf8');

console.log('Canonical NMT EVV visit completion installed: operational trip completion is atomic with immutable route, vehicle, persons-present and driver-signature evidence.');
