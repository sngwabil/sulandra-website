import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];const checks=[];
const exists=async p=>{try{await access(path.join(root,p));return true}catch{return false}};
const read=p=>readFile(path.join(root,p),'utf8');
const expect=(label,condition)=>{checks.push(label);if(!condition)failures.push(label)};

const backend='api/src/employee-leave-offboarding-routes.ts';
expect('leave backend exists',await exists(backend));
if(await exists(backend)){
  const s=await read(backend);
  expect('leave policy catalog',s.includes('EmployeeLeavePolicy')&&s.includes('accrualMethod')&&s.includes('carryoverLimit'));
  expect('leave balances',s.includes('EmployeeLeaveBalance')&&s.includes('pendingHours')&&s.includes('usedHours'));
  expect('employee leave requests',s.includes('/api/employee/me/leave-requests')&&s.includes('documentationProvided'));
  expect('manager leave decisions',s.includes('/decision')&&s.includes('LEAVE_REQUEST_DECIDED'));
  expect('accommodations',s.includes('EmployeeAccommodation')&&s.includes('confidentialNotes'));
  expect('offboarding cases',s.includes('EmployeeOffboardingCase')&&s.includes('separationType'));
  expect('automatic offboarding tasks',s.includes('EmployeeOffboardingTask')&&s.includes('Recover company property'));
  expect('exit interviews',s.includes('EmployeeExitInterview')&&s.includes('/exit-interview'));
  expect('completion enforcement',s.includes('required offboarding task(s) remain incomplete'));
  expect('employment status and access shutdown',s.includes("employmentStatus\"='TERMINATED'")&&s.includes('lockedUntil'));
  expect('owner protection',s.includes('The Enterprise Owner leave and offboarding record cannot be changed by another user'));
  expect('auditor read only',s.includes('Auditor leave and offboarding access is read only'));
  expect('organization isolation',s.includes('auth.organizationId')&&s.includes('"organizationId"=$1'));
  expect('audit events',s.includes('EmployeeLeaveOffboardingEvent')&&s.includes('audit?.'));
  expect('employee leave dashboard',s.includes('/api/employee/me/leave'));
  expect('admin leave dashboard',s.includes('/api/admin/employee-leave/dashboard'));
}

const migration='prisma/migrations/20260806173000_employee_leave_offboarding/migration.sql';
expect('leave migration exists',await exists(migration));
if(await exists(migration)){
  const s=await read(migration);
  expect('all leave and offboarding tables', ['EmployeeLeavePolicy','EmployeeLeaveBalance','EmployeeLeaveRequest','EmployeeAccommodation','EmployeeOffboardingCase','EmployeeOffboardingTask','EmployeeExitInterview','EmployeeLeaveOffboardingEvent'].every(x=>s.includes(x)));
  expect('leave request constraints',s.includes('EmployeeLeaveRequest_status_check')&&s.includes('EmployeeLeaveRequest_dates_check'));
  expect('active offboarding uniqueness',s.includes('EmployeeOffboardingCase_active_employee_unique'));
  expect('offboarding task constraints',s.includes('EmployeeOffboardingTask_status_check')&&s.includes('EmployeeOffboardingTask_category_check'));
  expect('event JSON constraint',s.includes('EmployeeLeaveOffboardingEvent_details_object_check'));
}

const installer=await read('scripts/install-employee-management-platform.mjs');
expect('leave routes registered',installer.includes('registerEmployeeLeaveOffboardingRoutes'));
const bootstrap=await read('api/src/onboarding-bootstrap.ts');
const leaveAt=bootstrap.indexOf('registerEmployeeLeaveOffboardingRoutes({ app, prisma');
const careersAt=bootstrap.lastIndexOf('registerCareersRoutes(app, prisma');
expect('leave routes registered before careers',leaveAt>=0&&careersAt>leaveAt);

const employeeAsset=await read('assets/employee-leave-self-service.js');
expect('My Leave employee frontend',employeeAsset.includes('My Leave')&&employeeAsset.includes('/api/employee/me/leave'));
expect('employee leave request UI',employeeAsset.includes('Request Leave')&&employeeAsset.includes('/api/employee/me/leave-requests'));
expect('employee mobile UI',employeeAsset.includes('@media(max-width:480px)'));

const adminAsset=await read('assets/admin-employee-leave-offboarding.js');
expect('Leave and Offboarding Center frontend',adminAsset.includes('Employee 360 Leave & Offboarding Center'));
expect('leave decision UI',adminAsset.includes('data-approve')&&adminAsset.includes('data-reject'));
expect('policy and balance UI',adminAsset.includes('Create Leave Policy')&&adminAsset.includes('Set Employee Leave Balance'));
expect('accommodation UI',adminAsset.includes('Create Accommodation Record'));
expect('offboarding UI',adminAsset.includes('Start Employee Offboarding')&&adminAsset.includes('Record Exit Interview'));
expect('task completion and finalization UI',adminAsset.includes('completeTask')&&adminAsset.includes('completeOffboarding'));
expect('admin mobile UI',adminAsset.includes('@media(max-width:900px)'));

const selfInstaller=await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee leave asset published',selfInstaller.includes('/assets/employee-leave-self-service.js'));
const adminInstaller=await read('scripts/install-employee-management-frontend.mjs');
expect('admin leave asset published',adminInstaller.includes('/assets/admin-employee-leave-offboarding.js'));

if(failures.length){console.error(`Employee 360 leave/offboarding verification failed (${failures.length}/${checks.length}):`);failures.forEach(x=>console.error(` - ${x}`));process.exit(1)}
console.log(`Employee 360 leave/offboarding verification passed (${checks.length} checks).`);
