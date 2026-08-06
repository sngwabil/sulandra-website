import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=async file=>readFile(path.join(root,file),'utf8');
const checks=[];
const expect=(name,condition)=>{checks.push({name,condition});if(!condition)throw new Error(`Employee communications verification failed: ${name}`)};

const backend=await read('api/src/employee-communications-notifications-routes.ts');
expect('backend route exists',backend.includes('registerEmployeeCommunicationsNotificationsRoutes'));
expect('announcement table',backend.includes('EmployeeAnnouncement'));
expect('acknowledgment table',backend.includes('EmployeeAnnouncementAcknowledgment'));
expect('notification table',backend.includes('EmployeeNotification'));
expect('event table',backend.includes('EmployeeCommunicationEvent'));
expect('admin dashboard endpoint',backend.includes('/api/admin/employee-communications/dashboard'));
expect('announcement create endpoint',backend.includes('/api/admin/employee-communications/announcements'));
expect('notification create endpoint',backend.includes('/api/admin/employee-communications/notifications'));
expect('employee inbox endpoint',backend.includes('/api/employee/me/communications'));
expect('acknowledgment endpoint',backend.includes('/acknowledge'));
expect('notification read dismiss endpoint',backend.includes('/notifications/:notificationId'));
expect('auditor read only',backend.includes('Auditor communications access is read only'));
expect('organization isolation',backend.includes('"organizationId"=$1'));
expect('custom recipient support',backend.includes('recipientUserIds'));
expect('scheduled publishing support',backend.includes('publishAt'));
expect('expiration support',backend.includes('expiresAt'));
expect('priority support',backend.includes("'URGENT'"));
expect('audit integration',backend.includes('CREATE_EMPLOYEE_ANNOUNCEMENT'));

const migration=await read('prisma/migrations/20260806210000_employee_communications_notifications/migration.sql');
expect('migration announcement table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeAnnouncement"'));
expect('migration acknowledgment unique index',migration.includes('EmployeeAnnouncementAcknowledgment_unique'));
expect('migration notification table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeNotification"'));
expect('migration event table',migration.includes('CREATE TABLE IF NOT EXISTS "EmployeeCommunicationEvent"'));
expect('migration partial-table hardening',migration.includes('ADD COLUMN IF NOT EXISTS "active"'));

const installer=await read('scripts/install-employee-management-platform.mjs');
expect('communications import installed',installer.includes('registerEmployeeCommunicationsNotificationsRoutes'));
expect('communications registered before careers',installer.indexOf('registerEmployeeCommunicationsNotificationsRoutes({ app, prisma')<installer.indexOf('registerCareersRoutes(app, prisma'));

const admin=await read('assets/admin-employee-communications.js');
expect('admin explicit API base',admin.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('admin bearer auth',admin.includes('Authorization:`Bearer ${token()}`'));
expect('admin communications center',admin.includes('Communications & Notifications'));
expect('admin creates announcement',admin.includes('comm-announcement'));
expect('admin sends notification',admin.includes('comm-notification'));
expect('admin mobile responsive',admin.includes('@media(max-width:850px)'));

const employee=await read('assets/employee-communications-self-service.js');
expect('employee explicit API base',employee.includes('sulandra-website-production-5fc4.up.railway.app'));
expect('employee bearer auth',employee.includes('Authorization:`Bearer ${token()}`'));
expect('employee communications inbox',employee.includes('Communications'));
expect('employee acknowledges announcements',employee.includes('data-ack'));
expect('employee marks notifications read',employee.includes('data-read'));
expect('employee dismisses notifications',employee.includes('data-dismiss'));
expect('employee mobile responsive',employee.includes('@media(max-width:760px)'));

const adminInstaller=await read('scripts/install-employee-management-frontend.mjs');
expect('admin asset installed',adminInstaller.includes('admin-employee-communications.js'));
const employeeInstaller=await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee asset installed',employeeInstaller.includes('employee-communications-self-service.js'));

await access(path.join(root,'assets/admin-employee-communications.js'));
await access(path.join(root,'assets/employee-communications-self-service.js'));
console.log(`Employee 360 communications verification passed (${checks.length} checks).`);
