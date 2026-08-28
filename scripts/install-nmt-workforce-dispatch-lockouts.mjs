import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dispatchPath=path.join(root,'api','src','nmt-dispatch-routes.ts');
const bootstrapPath=path.join(root,'api','src','onboarding-bootstrap.ts');

let dispatch=await readFile(dispatchPath,'utf8');
const zodImport="import { z } from 'zod';";
const eligibilityImport="import { assertNmtDriverEligible } from './nmt-driver-qualification.js';";
if(!dispatch.includes(eligibilityImport)){
  if(!dispatch.includes(zodImport))throw new Error('NMT dispatch zod import anchor is missing');
  dispatch=dispatch.replace(zodImport,`${zodImport}\n${eligibilityImport}`);
}

const oldDriverGate=/if\(i\.driverId\)\{const d=await prisma\.\$queryRawUnsafe<Array<\{id:string\}>>\(`SELECT "id" FROM "NmtDriverProfile"[\s\S]*?if\(!d\[0\]\)throw httpError\(404,'Active NMT driver was not found'\);\}/;
const newDriverGate="if(i.driverId){await assertNmtDriverEligible(prisma,{organizationId:a.organizationId,legalEntityId:entity(a),driverId:i.driverId,serviceDate:new Date(i.scheduledPickupAt),actorUserId:a.userId,orderId:req.params.orderId});}";
if(!dispatch.includes(newDriverGate)){
  if(!oldDriverGate.test(dispatch))throw new Error('NMT dispatch active-driver gate anchor is missing');
  dispatch=dispatch.replace(oldDriverGate,newDriverGate);
}
await writeFile(dispatchPath,dispatch,'utf8');

let bootstrap=await readFile(bootstrapPath,'utf8');
const careersImport="import { registerCareersRoutes } from './careers-routes.js';";
const qualificationImport="import { registerNmtDriverQualificationRoutes } from './nmt-driver-qualification.js';";
const dispatchImport="import { registerNmtDispatchRoutes } from './nmt-dispatch-routes.js';";
if(!bootstrap.includes(qualificationImport)||!bootstrap.includes(dispatchImport)){
  if(!bootstrap.includes(careersImport))throw new Error('Careers import anchor is missing for NMT workforce routes');
  const additions=[qualificationImport,dispatchImport].filter((line)=>!bootstrap.includes(line));
  bootstrap=bootstrap.replace(careersImport,`${additions.join('\n')}\n${careersImport}`);
}

const careersRegister='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const qualificationRegister='registerNmtDriverQualificationRoutes(app, prisma, { authOf });';
const dispatchRegister='registerNmtDispatchRoutes(app, prisma, { authOf });';
if(!bootstrap.includes(qualificationRegister)||!bootstrap.includes(dispatchRegister)){
  if(!bootstrap.includes(careersRegister))throw new Error('Careers route registration anchor is missing for NMT workforce routes');
  const registrations=[qualificationRegister,dispatchRegister].filter((line)=>!bootstrap.includes(line));
  bootstrap=bootstrap.replace(careersRegister,`${registrations.join('\n')}\n\n${careersRegister}`);
}
await writeFile(bootstrapPath,bootstrap,'utf8');

console.log('DODD NMT workforce and dispatch lockouts installed on the canonical 1.0 NmtDriverProfile model.');
