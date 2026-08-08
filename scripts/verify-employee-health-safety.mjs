import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>readFile(path.join(root,file),'utf8');
const checks=[];
const expect=(name,condition)=>{checks.push({name,condition});if(!condition)throw new Error(`Employee health and safety verification failed: ${name}`)};

const backend=await read('api/src/employee-health-safety-wellness-routes.ts');
expect('backend route exists',backend.includes('registerEmployeeHealthSafetyWellnessRoutes'));
expect('incident reporting endpoint',backend.includes('/api/employee/me/health-safety/incidents'));
expect('admin dashboard endpoint',backend.includes('/api/admin/employee-health-safety/dashboard'));
expect('corrective actions endpoint',backend.includes('/incidents/:incidentId/actions'));
expect('wellness programs endpoint',backend.includes('/wellness-programs'));
expect('injury type',backend.includes("'INJURY'"));
expect('exposure type',backend.includes("'EXPOSURE'"));
expect('near miss type',backend.includes("'NEAR_MISS'"));
expect('violence type',backend.includes("'VIOLENCE'"));
expect('harassment type',backend.includes("'HARASSMENT'"));
expect('critical severity',backend.includes("'CRITICAL'"));
expect('medical attention tracking',backend.includes('medicalAttention'));
expect('lost time tracking',backend.includes('lostTime'));
expect('reportable tracking',backend.includes('reportable'));
expect('overdue action metrics',backend.includes('overdueActions'));
expect('owner protection',backend.includes('Enterprise Owner health and safety record'));
expect('auditor read only',backend.includes('Auditor health and safety access is read only'));
expect('organization isolation',backend.includes('"organizationId"=$1'));
expect('audit integration',backend.includes('CREATE_EMPLOYEE_SAFETY_INCIDENT'));

const migration=await read('prisma/migrations/20260806225000_employee_health_safety_wellness/migration.sql');
expect('incident table migration',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeSafetyIncident"'));
expect('action table migration',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeSafetyAction"'));
expect('wellness table migration',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeWellnessProgram"'));
expect('event table migration',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeHealthSafetyEvent"'));
expect('partial table hardening',migration.includes('ADD COLUMN IF NOT EXISTS "reportable"'));

const installer=await read('scripts/install-employee-management-platform.mjs');
expect('route import installed',installer.includes('registerEmployeeHealthSafetyWellnessRoutes'));
const bootstrap=await read('api/src/onboarding-bootstrap.ts');
const healthAt=bootstrap.indexOf('registerEmployeeHealthSafetyWellnessRoutes({ app, prisma');
const careersAt=bootstrap.lastIndexOf('registerCareersRoutes(app, prisma');
expect('route registered before careers',healthAt>=0&&careersAt>healthAt);

const admin=await read('assets/admin-employee-health-safety.js');
expect('admin explicit API base',admin.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('admin bearer auth',admin.includes('Authorization:`Bearer ${token()}`'));
expect('admin health safety center',admin.includes('Health, Safety, Incident Prevention & Wellness'));
expect('admin creates incidents',admin.includes('/api/admin/employee-health-safety/incidents'));
expect('admin safety actions',admin.includes('data-add-action'));
expect('admin wellness programs',admin.includes('hs-wellness-form'));
expect('admin mobile responsive',admin.includes('@media(max-width:520px)'));

const employee=await read('assets/employee-health-safety-self-service.js');
expect('employee explicit API base',employee.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('employee bearer auth',employee.includes('Authorization:`Bearer ${token()}`'));
expect('employee self-service center',employee.includes('My Health, Safety & Wellness'));
expect('employee incident report',employee.includes('/api/employee/me/health-safety/incidents'));
expect('employee wellness resources',employee.includes('Wellness resources'));

const adminInstaller=await read('scripts/install-employee-management-frontend.mjs');
expect('admin asset installed',adminInstaller.includes('admin-employee-health-safety.js'));
const employeeInstaller=await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee asset installed',employeeInstaller.includes('employee-health-safety-self-service.js'));

await access(path.join(root,'assets/admin-employee-health-safety.js'));
await access(path.join(root,'assets/employee-health-safety-self-service.js'));
console.log(`Employee 360 health, safety, incident prevention, and wellness verification passed (${checks.length} checks).`);
