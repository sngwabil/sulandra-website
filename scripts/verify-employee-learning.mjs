import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>readFile(path.join(root,file),'utf8');
const checks=[];
const expect=(name,condition)=>{checks.push({name,condition});if(!condition)throw new Error(`Employee learning verification failed: ${name}`)};

const backend=await read('api/src/employee-learning-development-routes.ts');
expect('backend route exists',backend.includes('registerEmployeeLearningDevelopmentRoutes'));
expect('course catalog supported',backend.includes('EmployeeLearningCourse'));
expect('assignments supported',backend.includes('EmployeeLearningAssignment'));
expect('development goals supported',backend.includes('EmployeeDevelopmentGoal'));
expect('learning events supported',backend.includes('EmployeeLearningEvent'));
expect('course creation endpoint',backend.includes("/api/admin/employee-learning/courses"));
expect('assignment endpoint',backend.includes("/api/admin/employee-learning/assignments"));
expect('assignment update endpoint',backend.includes("/api/admin/employee-learning/assignments/:assignmentId"));
expect('goal creation endpoint',backend.includes("/api/admin/employee-learning/goals/:employeeId"));
expect('employee learning endpoint',backend.includes("/api/employee/me/learning"));
expect('employee assignment update',backend.includes("/api/employee/me/learning/assignments/:assignmentId"));
expect('owner protection',backend.includes('Enterprise Owner learning record'));
expect('auditor read only',backend.includes('Auditor learning access is read only'));
expect('organization isolation',backend.includes('"organizationId"=$1'));
expect('renewal support',backend.includes('renewalMonths'));
expect('expiration support',backend.includes('expiresAt'));
expect('required training',backend.includes('required'));
expect('completion scores',backend.includes('score'));
expect('failed status',backend.includes("'FAILED'"));
expect('exempt status',backend.includes("'EXEMPT'"));
expect('orientation category',backend.includes("'ORIENTATION'"));
expect('clinical category',backend.includes("'CLINICAL'"));
expect('leadership category',backend.includes("'LEADERSHIP'"));
expect('audit integration',backend.includes('CREATE_EMPLOYEE_LEARNING_COURSE'));

const migration=await read('prisma/migrations/20260806212500_employee_learning_development/migration.sql');
expect('migration course table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeLearningCourse"'));
expect('migration assignment table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeLearningAssignment"'));
expect('migration goal table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeDevelopmentGoal"'));
expect('migration event table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeLearningEvent"'));
expect('migration partial-table protection',migration.includes('ADD COLUMN IF NOT EXISTS "active"'));
expect('assignment status constraint',migration.includes('EmployeeLearningAssignment_status_chk'));
expect('goal status constraint',migration.includes('EmployeeDevelopmentGoal_status_chk'));

const installer=await read('scripts/install-employee-management-platform.mjs');
expect('learning import installed',installer.includes('registerEmployeeLearningDevelopmentRoutes'));
expect('learning registered before careers',installer.indexOf('registerEmployeeLearningDevelopmentRoutes({ app, prisma')<installer.indexOf('registerCareersRoutes(app, prisma'));

const admin=await read('assets/admin-employee-learning.js');
expect('admin explicit API base',admin.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('admin bearer auth',admin.includes('Authorization:`Bearer ${token()}`'));
expect('admin learning center',admin.includes('Learning, Training & Development'));
expect('admin create course',admin.includes('Create course'));
expect('admin assign training',admin.includes('Assign training'));
expect('admin responsive',admin.includes('@media(max-width:560px)'));

const employee=await read('assets/employee-learning-self-service.js');
expect('employee explicit API base',employee.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('employee bearer auth',employee.includes('Authorization:`Bearer ${token()}`'));
expect('employee learning center',employee.includes('My Learning & Development'));
expect('employee start training',employee.includes('IN_PROGRESS'));
expect('employee complete training',employee.includes('COMPLETED'));
expect('employee goals visible',employee.includes('Development goals'));

const adminInstaller=await read('scripts/install-employee-management-frontend.mjs');
expect('admin learning asset installed',adminInstaller.includes('admin-employee-learning.js'));
const employeeInstaller=await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee learning asset installed',employeeInstaller.includes('employee-learning-self-service.js'));

await access(path.join(root,'assets/admin-employee-learning.js'));
await access(path.join(root,'assets/employee-learning-self-service.js'));
console.log(`Employee 360 learning and development verification passed (${checks.length} checks).`);
