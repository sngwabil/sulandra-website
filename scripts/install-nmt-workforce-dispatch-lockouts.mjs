import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tripPath=path.join(root,'api','src','nmt-trip-routes.ts');
const bootstrapPath=path.join(root,'api','src','onboarding-bootstrap.ts');

let trip=await readFile(tripPath,'utf8');
const zodImport="import { z } from 'zod';";
const eligibilityImport="import { assertNmtDriverEligible } from './nmt-driver-qualification.js';";
if(!trip.includes(eligibilityImport)){
  if(!trip.includes(zodImport))throw new Error('Canonical NMT trip zod import anchor is missing');
  trip=trip.replace(zodImport,`${zodImport}\n${eligibilityImport}`);
}

const oldAssignmentGate="const drop=i.scheduledDropoffAt??(t.scheduledDropoffAt?new Date(String(t.scheduledDropoffAt)).toISOString():null);const conflicts=await";
const newAssignmentGate="const drop=i.scheduledDropoffAt??(t.scheduledDropoffAt?new Date(String(t.scheduledDropoffAt)).toISOString():null);if(!training)await assertNmtDriverEligible(prisma,{organizationId:a.organizationId,legalEntityId:selectedEntity(a),driverId:i.driverProfileId,serviceDate:new Date(pickup),actorUserId:a.userId,orderId:String(t.orderId||'')});const conflicts=await";
if(!trip.includes(newAssignmentGate)){
  if(!trip.includes(oldAssignmentGate))throw new Error('Canonical NMT trip assignment gate anchor is missing');
  trip=trip.replace(oldAssignmentGate,newAssignmentGate);
}
await writeFile(tripPath,trip,'utf8');

let bootstrap=await readFile(bootstrapPath,'utf8');
const careersImport="import { registerCareersRoutes } from './careers-routes.js';";
const qualificationImport="import { registerNmtDriverQualificationRoutes } from './nmt-driver-qualification.js';";
if(!bootstrap.includes(qualificationImport)){
  if(!bootstrap.includes(careersImport))throw new Error('Careers import anchor is missing for NMT qualification routes');
  bootstrap=bootstrap.replace(careersImport,`${qualificationImport}\n${careersImport}`);
}

const careersRegister='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const qualificationRegister='registerNmtDriverQualificationRoutes(app, prisma, { authOf });';
if(!bootstrap.includes(qualificationRegister)){
  if(!bootstrap.includes(careersRegister))throw new Error('Careers route registration anchor is missing for NMT qualification routes');
  bootstrap=bootstrap.replace(careersRegister,`${qualificationRegister}\n\n${careersRegister}`);
}
await writeFile(bootstrapPath,bootstrap,'utf8');

console.log('DODD NMT workforce qualification lockout installed on the canonical NmtDriverAssignmentProfile trip-assignment workflow; legacy NMT dispatch routing is not activated.');
