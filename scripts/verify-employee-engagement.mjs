import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>readFile(path.join(root,file),'utf8');
const checks=[];
const expect=(name,condition)=>{checks.push({name,condition});if(!condition)throw new Error(`Employee engagement verification failed: ${name}`)};

const backend=await read('api/src/employee-engagement-feedback-routes.ts');
expect('backend route exists',backend.includes('registerEmployeeEngagementFeedbackRoutes'));
expect('survey table supported',backend.includes('EmployeeEngagementSurvey'));
expect('response table supported',backend.includes('EmployeeEngagementResponse'));
expect('recognition table supported',backend.includes('EmployeeRecognition'));
expect('engagement events supported',backend.includes('EmployeeEngagementEvent'));
expect('admin dashboard endpoint',backend.includes('/api/admin/employee-engagement/dashboard'));
expect('survey creation endpoint',backend.includes('/api/admin/employee-engagement/surveys'));
expect('employee engagement endpoint',backend.includes('/api/employee/me/engagement'));
expect('survey response endpoint',backend.includes('/api/employee/me/engagement/surveys/:surveyId/respond'));
expect('recognition endpoint',backend.includes('/api/employee/me/engagement/recognition'));
expect('anonymous response support',backend.includes('survey.anonymous?null:auth.userId'));
expect('auditor read only',backend.includes('Auditor engagement access is read only'));
expect('organization isolation',backend.includes('"organizationId"=$1'));
expect('survey opening schedule',backend.includes('"opensAt"<=NOW()'));
expect('survey closing schedule',backend.includes('"closesAt">NOW()'));
expect('custom recipients',backend.includes('"recipientUserIds" ? $2'));
expect('recognition categories',backend.includes("'CLIENT_CARE'"));
expect('recognition visibility',backend.includes("'COMPANY'"));
expect('audit integration',backend.includes('CREATE_EMPLOYEE_ENGAGEMENT_SURVEY'));

const migration=await read('prisma/migrations/20260806212000_employee_engagement_feedback/migration.sql');
expect('migration survey table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeEngagementSurvey"'));
expect('migration response table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeEngagementResponse"'));
expect('migration recognition table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeRecognition"'));
expect('migration event table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeEngagementEvent"'));
expect('migration partial table protection',migration.includes('ADD COLUMN IF NOT EXISTS "active"'));
expect('migration audience constraint',migration.includes('EmployeeEngagementSurvey_audience_chk'));
expect('migration recognition constraints',migration.includes('EmployeeRecognition_visibility_chk'));

const installer=await read('scripts/install-employee-management-platform.mjs');
expect('engagement import installed',installer.includes('registerEmployeeEngagementFeedbackRoutes'));
expect('engagement registered before careers',installer.indexOf('registerEmployeeEngagementFeedbackRoutes({ app, prisma')<installer.indexOf('registerCareersRoutes(app, prisma'));

const admin=await read('assets/admin-employee-engagement.js');
expect('admin explicit API base',admin.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('admin bearer auth',admin.includes('Authorization:`Bearer ${token()}`'));
expect('admin engagement center',admin.includes('Engagement, Surveys, Feedback & Recognition'));
expect('admin survey creation',admin.includes('Create survey'));
expect('admin mobile responsive',admin.includes('@media(max-width:760px)'));

const employee=await read('assets/employee-engagement-self-service.js');
expect('employee explicit API base',employee.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('employee bearer auth',employee.includes('Authorization:`Bearer ${token()}`'));
expect('employee engagement center',employee.includes('Engagement & Recognition'));
expect('employee survey submission',employee.includes('/respond'));
expect('employee recognition submission',employee.includes('/engagement/recognition'));
expect('employee mobile responsive',employee.includes('@media(max-width:760px)'));

const adminInstaller=await read('scripts/install-employee-management-frontend.mjs');
expect('admin asset installed',adminInstaller.includes('admin-employee-engagement.js'));
const employeeInstaller=await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee asset installed',employeeInstaller.includes('employee-engagement-self-service.js'));

await access(path.join(root,'assets/admin-employee-engagement.js'));
await access(path.join(root,'assets/employee-engagement-self-service.js'));
console.log(`Employee 360 engagement verification passed (${checks.length} checks).`);
