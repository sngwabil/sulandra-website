import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checks = [];
const exists = async relativePath => { try { await access(path.join(root, relativePath)); return true; } catch { return false; } };
const read = relativePath => readFile(path.join(root, relativePath), 'utf8');
const expect = (label, condition) => { checks.push(label); if (!condition) failures.push(label); };

const backendPath = 'api/src/employee-collaboration-routes.ts';
expect('collaboration backend exists', await exists(backendPath));
if (await exists(backendPath)) {
  const source = await read(backendPath);
  expect('all request types supported', ['PROFILE_CHANGE','TIME_OFF','SCHEDULE_CHANGE','DOCUMENT_CORRECTION','TRAINING_SUPPORT','HR_SUPPORT','GENERAL_REQUEST'].every(value => source.includes(value)));
  expect('configurable workflow definitions', source.includes('EmployeeWorkflowDefinition') && source.includes('approvalStepSchema') && source.includes('/workflows/:requestType'));
  expect('sequential approval engine', source.includes('currentSequence') && source.includes('advanceRequest') && source.includes("approvalMode === 'ANY'"));
  expect('approver resolution groups', ['SUPERVISOR','LOCATION_MANAGER','HR','ADMINISTRATOR','OWNER','SPECIFIC_USER'].every(value => source.includes(value)));
  expect('employee request submission and cancellation', source.includes('/api/employee/me/collaboration/requests') && source.includes('/cancel'));
  expect('employee request comments', source.includes('EMPLOYEE_COMMENT_ADDED') && source.includes('/comments'));
  expect('manager approval decisions', source.includes('/decision') && source.includes('EMPLOYEE_REQUEST_'));
  expect('profile change application', source.includes('applyApprovedRequest') && source.includes('EmployeeManagementProfile') && source.includes("request.requestType === 'PROFILE_CHANGE'"));
  expect('time attendance request integration', source.includes('TimeAttendanceRequest') && source.includes("request.requestType === 'TIME_OFF'"));
  expect('document correction integration', source.includes('EmployeeDocument') && source.includes("request.requestType === 'DOCUMENT_CORRECTION'"));
  expect('location scoped manager access', source.includes('scopedEmployeeIds') && source.includes('TimeAttendanceLocationAssignment'));
  expect('house manager restriction', source.includes('UserRole.HOUSE_MANAGER') && source.includes('actor."isManager"=TRUE'));
  expect('owner profile protection', source.includes('The Enterprise Owner profile cannot be changed by another user'));
  expect('auditor read only control', source.includes('Auditor access is read only'));
  expect('feedback and check-in tools', source.includes('EmployeeTeamFeedback') && source.includes('/feedback'));
  expect('feedback confidentiality', ['EMPLOYEE_VISIBLE','MANAGEMENT_ONLY','HR_CONFIDENTIAL'].every(value => source.includes(value)));
  expect('employee feedback acknowledgment', source.includes('/acknowledge') && source.includes('acknowledgedAt'));
  expect('recognition tools', source.includes('EmployeeRecognition') && source.includes('/recognition'));
  expect('in-app notifications', source.includes('EmployeeNotification') && source.includes('/notifications'));
  expect('notification email delivery', source.includes('Sulandra Health Human Resources Department') && source.includes('createTransport'));
  expect('notification deduplication', source.includes('dedupeKey') && source.includes('EmployeeNotification_dedupe_unique'));
  expect('request audit events', source.includes('EmployeeWorkflowEvent') && source.includes('logEvent'));
  expect('team dashboard connects risk systems', ['EmployeeComplianceAssignment','EducationAssignment','EmployeeDocument','TimeAttendanceShift'].every(value => source.includes(value)));
  expect('manager permissions returned to frontend', source.includes('managerPermissions') && source.includes('canManageWorkflows') && source.includes('canAddFeedback'));
}

const migrationPath = 'prisma/migrations/20260806143000_employee_collaboration_workflows/migration.sql';
expect('collaboration migration exists', await exists(migrationPath));
if (await exists(migrationPath)) {
  const migration = await read(migrationPath);
  expect('all collaboration tables migrated', ['EmployeeWorkflowDefinition','EmployeeWorkflowRequest','EmployeeWorkflowApproval','EmployeeWorkflowComment','EmployeeWorkflowEvent','EmployeeTeamFeedback','EmployeeRecognition','EmployeeNotification'].every(value => migration.includes(value)));
  expect('workflow request constraints', migration.includes('EmployeeWorkflowRequest_type_check') && migration.includes('EmployeeWorkflowRequest_status_check'));
  expect('approval constraints and indexes', migration.includes('EmployeeWorkflowApproval_mode_check') && migration.includes('EmployeeWorkflowApproval_actor_idx'));
  expect('notification dedupe index', migration.includes('EmployeeNotification_dedupe_unique'));
  expect('feedback acknowledgment index', migration.includes('EmployeeTeamFeedback_ack_idx'));
  expect('recognition visibility controls', migration.includes('EmployeeRecognition_visibility_check'));
}

const installer = await read('scripts/install-employee-management-platform.mjs');
expect('collaboration routes wired into backend', installer.includes('registerEmployeeCollaborationRoutes'));
const bootstrap = await read('api/src/onboarding-bootstrap.ts');
const collaborationAt = bootstrap.indexOf('registerEmployeeCollaborationRoutes({ app, prisma');
const careersAt = bootstrap.lastIndexOf('registerCareersRoutes(app, prisma');
expect('collaboration registered before careers', collaborationAt >= 0 && careersAt > collaborationAt);

const employeeAsset = await read('assets/employee-collaboration-self-service.js');
expect('employee My Workplace frontend', employeeAsset.includes('My Workplace') && employeeAsset.includes('/api/employee/me/collaboration'));
expect('employee request builder', employeeAsset.includes('Submit Employee Request') && employeeAsset.includes('payloadFromForm'));
expect('employee request timeline and comments', employeeAsset.includes('Approval Workflow') && employeeAsset.includes('addRequestComment'));
expect('employee feedback acknowledgment UI', employeeAsset.includes('acknowledgeFeedback') && employeeAsset.includes('Acknowledge'));
expect('employee recognition UI', employeeAsset.includes('Recognition') && employeeAsset.includes('nominatorName'));
expect('employee notification UI', employeeAsset.includes('Mark All Read') && employeeAsset.includes('readNotification'));
expect('employee mobile responsive design', employeeAsset.includes('@media(max-width:620px)'));

const adminAsset = await read('assets/admin-employee-collaboration.js');
expect('admin Team Hub frontend', adminAsset.includes('Employee 360 Team Hub') && adminAsset.includes('Team Dashboard'));
expect('admin approval decisions', adminAsset.includes('quickDecision') && adminAsset.includes('/decision'));
expect('admin team risk dashboard', adminAsset.includes('overdueComplianceCount') && adminAsset.includes('expiredDocumentCount') && adminAsset.includes('upcomingShiftCount'));
expect('admin feedback tools', adminAsset.includes('submitFeedback') && adminAsset.includes('requiresAcknowledgment'));
expect('admin recognition tools', adminAsset.includes('showRecognitionForm') && adminAsset.includes('Record and Notify'));
expect('admin workflow editor', adminAsset.includes('workflowEditor') && adminAsset.includes('Save Approval Workflow'));
expect('admin per-employee collaboration access', adminAsset.includes('openProfileCollaboration') && adminAsset.includes('/collaboration'));
expect('admin mobile responsive design', adminAsset.includes('@media(max-width:760px)'));
expect('bounded mutation observer scheduling', adminAsset.includes('requestAnimationFrame') && adminAsset.includes('installScheduled'));

const adminInstaller = await read('scripts/install-employee-management-frontend.mjs');
expect('admin collaboration asset published', adminInstaller.includes('/assets/admin-employee-collaboration.js'));
const selfInstaller = await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee collaboration asset published', selfInstaller.includes('/assets/employee-collaboration-self-service.js'));
const staticBuild = await read('scripts/build-static-site.mjs');
expect('direct static build runs both Employee 360 installers', staticBuild.includes("import('./install-employee-self-service-frontend.mjs')") && staticBuild.includes("import('./install-employee-management-frontend.mjs')"));

const distAdminPath = 'dist-web/admin.html';
if (await exists(distAdminPath)) {
  const html = await read(distAdminPath);
  const managementAt = html.indexOf('/assets/admin-employee-management.js');
  const complianceAt = html.indexOf('/assets/admin-employee-compliance.js');
  const collaborationAtInHtml = html.indexOf('/assets/admin-employee-collaboration.js');
  expect('generated admin collaboration script order', managementAt >= 0 && complianceAt > managementAt && collaborationAtInHtml > complianceAt);
}
const distEmployeePath = 'dist-web/employee-portal.html';
if (await exists(distEmployeePath)) {
  const html = await read(distEmployeePath);
  expect('generated employee portal includes My Workplace', html.includes('/assets/employee-collaboration-self-service.js'));
}

if (failures.length) {
  console.error(`Employee 360 collaboration verification failed (${failures.length}/${checks.length}):`);
  failures.forEach(failure => console.error(` - ${failure}`));
  process.exit(1);
}
console.log(`Employee 360 collaboration verification passed (${checks.length} checks).`);
