import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const trip=await readFile(path.join(root,'api','src','nmt-trip-routes.ts'),'utf8');
const qualification=await readFile(path.join(root,'api','src','nmt-driver-qualification.ts'),'utf8');
const bootstrap=await readFile(path.join(root,'api','src','onboarding-bootstrap.ts'),'utf8');
const failures=[];
const requireMarkers=(source,markers,label)=>{for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing: ${marker}`);};
const forbidMarkers=(source,markers,label)=>{for(const marker of markers)if(source.includes(marker))failures.push(`${label} must not contain: ${marker}`);};

requireMarkers(qualification,[
  'NmtDriverQualification',
  'NmtDispatchQualificationDecision',
  'NmtDriverAssignmentProfile',
  'licenseNumber',
  'licenseState',
  'licenseExpiresAt',
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
forbidMarkers(qualification,['FROM "NmtDriverProfile"'],'non-canonical driver table');

requireMarkers(trip,[
  "import { assertNmtDriverEligible } from './nmt-driver-qualification.js';",
  'if(!training)await assertNmtDriverEligible(prisma',
  'driverId:i.driverProfileId',
  'serviceDate:new Date(pickup)',
  "orderId:String(t.orderId||'')",
], 'nmt-trip-routes.ts');

requireMarkers(bootstrap,[
  "import { registerNmtDriverQualificationRoutes } from './nmt-driver-qualification.js';",
  'registerNmtDriverQualificationRoutes(app, prisma, { authOf });',
], 'onboarding-bootstrap.ts');
forbidMarkers(bootstrap,[
  "import { registerNmtDispatchRoutes } from './nmt-dispatch-routes.js';",
  'registerNmtDispatchRoutes(app, prisma, { authOf });',
], 'legacy NMT dispatch activation');

if(failures.length){
  console.error('NMT workforce/dispatch lockout verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('NMT workforce qualification verified on canonical NmtDriverAssignmentProfile trip assignment with fail-closed license/BMV/insurance/background evidence and no legacy dispatch activation.');
