import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dispatch=await readFile(path.join(root,'api','src','nmt-dispatch-routes.ts'),'utf8');
const qualification=await readFile(path.join(root,'api','src','nmt-driver-qualification.ts'),'utf8');
const bootstrap=await readFile(path.join(root,'api','src','onboarding-bootstrap.ts'),'utf8');
const failures=[];
const requireMarkers=(source,markers,label)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing: ${marker}`);};
const forbidMarkers=(source,markers,label)=>{for(const marker of markers)if(source.includes(marker))failures.push(`${label} must not contain: ${marker}`);};

requireMarkers(qualification,[
  'NmtDriverQualification',
  'NmtDispatchQualificationDecision',
  'DRIVER_PROFILE_INACTIVE',
  'DRIVER_LICENSE_NUMBER_MISSING',
  'DRIVER_LICENSE_EXPIRED_FOR_SERVICE_DATE',
  'BMV_RECORD_CHECK_MISSING',
  'BMV_RECORD_CHECK_OUTDATED',
  'BMV_POINTS_DISQUALIFY_DRIVER',
  'DRIVER_INSURANCE_NOT_VERIFIED',
  'DRIVER_INSURANCE_EXPIRED_FOR_SERVICE_DATE',
  'DRIVER_BACKGROUND_NOT_VERIFIED',
  'POST_ACCIDENT_CLEARANCE_REQUIRED',
  'assertNmtDriverEligible',
  "decision:result.eligible?'ALLOW':'DENY'",
  '/api/admin/nmt/drivers/:driverId/qualification',
  '/api/admin/nmt/drivers/:driverId/eligibility',
], 'nmt-driver-qualification.ts');

requireMarkers(dispatch,[
  "import { assertNmtDriverEligible } from './nmt-driver-qualification.js';",
  'if(i.driverId){await assertNmtDriverEligible(prisma',
  'serviceDate:new Date(i.scheduledPickupAt)',
  'orderId:req.params.orderId',
], 'nmt-dispatch-routes.ts');
forbidMarkers(dispatch,[
  "if(!d[0])throw httpError(404,'Active NMT driver was not found');",
], 'legacy active-only NMT assignment gate');

requireMarkers(bootstrap,[
  "import { registerNmtDriverQualificationRoutes } from './nmt-driver-qualification.js';",
  "import { registerNmtDispatchRoutes } from './nmt-dispatch-routes.js';",
  'registerNmtDriverQualificationRoutes(app, prisma, { authOf });',
  'registerNmtDispatchRoutes(app, prisma, { authOf });',
], 'onboarding-bootstrap.ts');

if(failures.length){
  console.error('NMT workforce/dispatch lockout verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('NMT workforce/dispatch lockouts verified: driver assignment is fail-closed on server-side qualification evidence and decisions are auditable.');
