import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>readFile(path.join(root,file),'utf8');
const checks=[];
const expect=(name,condition)=>{checks.push({name,condition});if(!condition)throw new Error(`Employee workflow verification failed: ${name}`)};

const backend=await read('api/src/employee-workflows-automation-routes.ts');
expect('backend route exists',backend.includes('registerEmployeeWorkflowAutomationRoutes'));
expect('workflow definitions supported',backend.includes('EmployeeWorkflowDefinition'));
expect('workflow instances supported',backend.includes('EmployeeWorkflowInstance'));
expect('workflow steps supported',backend.includes('EmployeeWorkflowStep'));
expect('workflow events supported',backend.includes('EmployeeWorkflowEvent'));
expect('definition creation endpoint',backend.includes("/api/admin/employee-workflows/definitions"));
expect('workflow start endpoint',backend.includes("/api/admin/employee-workflows/definitions/:definitionId/start"));
expect('step update endpoint',backend.includes("/api/admin/employee-workflows/steps/:stepId"));
expect('employee workflow endpoint',backend.includes("/api/employee/me/workflows"));
expect('owner protection',backend.includes('Enterprise Owner workflow record'));
expect('auditor read only',backend.includes('Auditor workflow access is read only'));
expect('organization isolation',backend.includes('"organizationId"=$1'));
expect('required step completion enforcement',backend.includes('"required"=TRUE'));
expect('automatic instance completion',backend.includes('if(open===0)')&&backend.includes('UPDATE "EmployeeWorkflowInstance" SET "status"=\'COMPLETED\'')&&backend.includes('"completedAt"=NOW()'));
expect('onboarding workflow type',backend.includes("'ONBOARDING'"));
expect('offboarding workflow type',backend.includes("'OFFBOARDING'"));
expect('document signature workflow type',backend.includes("'DOCUMENT_SIGNATURE'"));
expect('event trigger support',backend.includes("'EVENT'"));
expect('scheduled trigger support',backend.includes("'SCHEDULED'"));
expect('due offsets supported',backend.includes('dueOffsetHours'));
expect('blocked step support',backend.includes("'BLOCKED'"));
expect('audit integration',backend.includes('START_EMPLOYEE_WORKFLOW'));

const migration=await read('prisma/migrations/20260806203500_employee_workflow_automation/migration.sql');
expect('migration definition table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeWorkflowDefinition"'));
expect('migration instance table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeWorkflowInstance"'));
expect('migration step table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeWorkflowStep"'));
expect('migration event table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeWorkflowEvent"'));
expect('migration status constraints',migration.includes('EmployeeWorkflowStep_status_chk'));
expect('migration unique step order',migration.includes('EmployeeWorkflowStep_order_unique'));

const installer=await read('scripts/install-employee-management-platform.mjs');
expect('installer knows correct workflow module',installer.includes("./employee-workflows-automation-routes.js"));
const bootstrap=await read('api/src/onboarding-bootstrap.ts');
expect('generated backend uses correct workflow import',bootstrap.includes("import { registerEmployeeWorkflowAutomationRoutes } from './employee-workflows-automation-routes.js';"));
expect('generated backend obsolete workflow import absent',!bootstrap.includes("from './employee-workflow-automation-routes.js';"));
const workflowAt=bootstrap.indexOf('registerEmployeeWorkflowAutomationRoutes({ app, prisma');
const careersAt=bootstrap.lastIndexOf('registerCareersRoutes(app, prisma');
expect('workflow registered before careers',workflowAt>=0&&careersAt>workflowAt);

const admin=await read('assets/admin-employee-workflows.js');
expect('admin explicit API base',admin.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('admin bearer auth',admin.includes('Authorization:`Bearer ${token()}`'));
expect('admin workflow dashboard',admin.includes('Workflow Automation & Task Orchestration'));
expect('admin create workflow',admin.includes('Create workflow'));
expect('admin starts workflows',admin.includes('data-start'));
expect('admin updates steps',admin.includes('data-step'));
expect('admin mobile responsive',admin.includes('@media(max-width:560px)'));

const employee=await read('assets/employee-workflows-self-service.js');
expect('employee explicit API base',employee.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('employee bearer auth',employee.includes('Authorization:`Bearer ${token()}`'));
expect('employee My Workflows',employee.includes('My Workflows'));
expect('employee displays overdue metric',employee.includes('data.metrics.overdue'));
expect('employee displays steps',employee.includes('i.steps'));

const adminInstaller=await read('scripts/install-employee-management-frontend.mjs');
expect('admin asset installed',adminInstaller.includes('admin-employee-workflows.js'));
const employeeInstaller=await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee asset installed',employeeInstaller.includes('employee-workflows-self-service.js'));

await access(path.join(root,'assets/admin-employee-workflows.js'));
await access(path.join(root,'assets/employee-workflows-self-service.js'));
console.log(`Employee 360 workflow automation verification passed (${checks.length} checks).`);
