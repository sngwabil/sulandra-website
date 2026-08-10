import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const checks = [];
const exists = async relativePath => { try { await access(path.join(root, relativePath)); return true; } catch { return false; } };
const read = relativePath => readFile(path.join(root, relativePath), 'utf8');
const expect = (label, condition) => { checks.push(label); if (!condition) failures.push(label); };

const backendPath = 'api/src/employee-performance-routes.ts';
expect('performance backend exists', await exists(backendPath));
if (await exists(backendPath)) {
  const source = await read(backendPath);
  expect('performance templates and rating scales', source.includes('EmployeePerformanceTemplate') && source.includes('competencySchema') && source.includes('ratingScaleSchema'));
  expect('review cycle management', source.includes('EmployeePerformanceCycle') && source.includes('/cycles/:cycleId/launch') && source.includes('/cycles/:cycleId/close'));
  expect('automatic review assignment', source.includes('launchCycle') && source.includes('applicabilityMatches') && source.includes('EmployeePerformanceReview_cycle_employee_unique'));
  expect('review workflow states', ['EMPLOYEE_INPUT','MANAGER_REVIEW','CALIBRATION','ACKNOWLEDGMENT','COMPLETED','CANCELLED'].every(value => source.includes(value)));
  expect('employee self assessment', source.includes('/self-assessment') && source.includes("assessorType\",\"responses") && source.includes("'EMPLOYEE'"));
  expect('manager assessment', source.includes('/manager-assessment') && source.includes("'MANAGER'"));
  expect('rating calibration', source.includes('/calibrate') && source.includes('calibrationRating'));
  expect('review finalization and acknowledgment', source.includes('/finalize') && source.includes('/acknowledge') && source.includes('acknowledgmentComments'));
  expect('weighted scoring', source.includes('goalWeight') && source.includes('competencyWeight') && source.includes('recomputeReview'));
  expect('performance goal management', source.includes('EmployeePerformanceGoal') && source.includes('/goals') && source.includes('/progress'));
  expect('employee proposed goals require approval', source.includes("status: 'PENDING_APPROVAL'") && source.includes('goal-approval'));
  expect('goal update history', source.includes('EmployeePerformanceGoalUpdate') && source.includes('GOAL_PROGRESS_UPDATED'));
  expect('development plan management', source.includes('EmployeeDevelopmentPlan') && source.includes('/development-plans'));
  expect('development actions support education links', source.includes('courseCode') && source.includes('evidenceUrl'));
  expect('formal performance action plans', source.includes('EmployeePerformanceActionPlan') && source.includes('PERFORMANCE_IMPROVEMENT_PLAN'));
  expect('action-plan checkpoint tracking', source.includes('EmployeePerformanceCheckpoint') && source.includes('/checkpoints'));
  expect('action-plan resolution controls', source.includes('/status') && source.includes('SUCCESSFULLY_COMPLETED') && source.includes('UNSUCCESSFUL'));
  expect('owner action-plan protection', source.includes('The Enterprise Owner cannot be placed on a performance action plan by another user'));
  expect('auditor read only enforcement', source.includes('Auditor performance access is read only'));
  expect('location scoped performance access', source.includes('scopedEmployeeIds') && source.includes('TimeAttendanceLocationAssignment') && source.includes('actor."isManager"=TRUE'));
  expect('HR confidential visibility separation', source.includes('HR_CONFIDENTIAL') && source.includes('employeeVisibilityFilter'));
  expect('performance audit trail', source.includes('EmployeePerformanceEvent') && source.includes('eventType'));
  expect('performance notifications and email', source.includes('EmployeeNotification') && source.includes('Sulandra Health Human Resources Department') && source.includes('createTransport'));
  expect('printable review report', source.includes('/report') && source.includes('Print or Save as PDF'));
  expect('organization isolation on routes', source.includes('auth.organizationId') && source.includes('"organizationId"=$1'));
  expect('employee performance dashboard', source.includes('/api/employee/me/performance'));
  expect('manager performance dashboard', source.includes('/api/admin/employee-performance/dashboard'));
  expect('per employee performance profile', source.includes('/api/admin/employees/:employeeId/performance'));
}

const migrationPath = 'prisma/migrations/20260806160000_employee_performance_management/migration.sql';
expect('performance migration exists', await exists(migrationPath));
if (await exists(migrationPath)) {
  const migration = await read(migrationPath);
  expect('all performance tables migrated', ['EmployeePerformanceTemplate','EmployeePerformanceCycle','EmployeePerformanceReview','EmployeePerformanceAssessment','EmployeePerformanceGoal','EmployeePerformanceGoalUpdate','EmployeeDevelopmentPlan','EmployeePerformanceActionPlan','EmployeePerformanceCheckpoint','EmployeePerformanceEvent'].every(value => migration.includes(value)));
  expect('review uniqueness protects duplicate assignment', migration.includes('EmployeePerformanceReview_cycle_employee_unique'));
  expect('template weight constraint', migration.includes('EmployeePerformanceTemplate_weights_check'));
  expect('review status constraint', migration.includes('EmployeePerformanceReview_status_check'));
  expect('goal progress and visibility constraints', migration.includes('EmployeePerformanceGoal_progress_check') && migration.includes('EmployeePerformanceGoal_visibility_check'));
  expect('development actions JSON constraint', migration.includes('EmployeeDevelopmentPlan_actions_array_check'));
  expect('formal action-plan constraints', migration.includes('EmployeePerformanceActionPlan_severity_check') && migration.includes('EmployeePerformanceActionPlan_confidentiality_check'));
  expect('checkpoint due index', migration.includes('EmployeePerformanceCheckpoint_due_idx'));
  expect('performance audit resource index', migration.includes('EmployeePerformanceEvent_resource_idx'));
}

const installer = await read('scripts/install-employee-management-platform.mjs');
expect('performance route registered', installer.includes('registerEmployeePerformanceRoutes'));
const bootstrap = await read('api/src/onboarding-bootstrap.ts');
const performanceAt = bootstrap.indexOf('registerEmployeePerformanceRoutes({ app, prisma');
const careersAt = bootstrap.lastIndexOf('registerCareersRoutes(app, prisma');
expect('performance route registered before careers', performanceAt >= 0 && careersAt > performanceAt);

const employeeAsset = await read('assets/employee-performance-self-service.js');
expect('My Performance employee frontend', employeeAsset.includes('My Performance') && employeeAsset.includes('/api/employee/me/performance'));
expect('employee self assessment UI', employeeAsset.includes('Employee Self-Assessment') && employeeAsset.includes('submitSelfAssessment'));
expect('employee goal proposal and progress UI', employeeAsset.includes('Propose Goal') && employeeAsset.includes('updateGoal'));
expect('employee development plan UI', employeeAsset.includes('Development Plans') && employeeAsset.includes('ack-development'));
expect('employee action plan acknowledgment UI', employeeAsset.includes('Action Plans') && employeeAsset.includes('ack-action'));
expect('employee review acknowledgment UI', employeeAsset.includes('Acknowledge Review') && employeeAsset.includes('acknowledgeReview'));
expect('employee mobile performance UI', employeeAsset.includes('@media(max-width:620px)'));

const adminAsset = await read('assets/admin-employee-performance.js');
expect('Performance Center admin frontend', adminAsset.includes('Employee 360 Performance Center') && adminAsset.includes('Performance Center'));
expect('manager review work queue', adminAsset.includes('Review Work Queue') && adminAsset.includes('pendingManagerReviewCount'));
expect('manager assessment UI', adminAsset.includes('Manager Assessment') && adminAsset.includes('submitManagerAssessment'));
expect('calibration and finalization UI', adminAsset.includes('calibrateReview') && adminAsset.includes('finalizeReview'));
expect('print or save PDF UI', adminAsset.includes('Print / Save PDF') && adminAsset.includes('printReview'));
expect('team performance risk dashboard', adminAsset.includes('goalsAtRiskCount') && adminAsset.includes('activeActionPlanCount'));
expect('goal management UI', adminAsset.includes('Assign Goal') && adminAsset.includes('goalForm'));
expect('development planning UI', adminAsset.includes('Create Development Plan') && adminAsset.includes('developmentForm'));
expect('formal action plan UI', adminAsset.includes('Create Formal Performance Action Plan') && adminAsset.includes('checkpointForm'));
expect('review cycle management UI', adminAsset.includes('Create Review Cycle') && adminAsset.includes('launchCycle'));
expect('performance template editor UI', adminAsset.includes('Performance Template') && adminAsset.includes('templateForm'));
expect('per employee performance entrypoint', adminAsset.includes('openProfilePerformance') && adminAsset.includes('openEmployee'));
expect('bounded admin mutation observer', adminAsset.includes('requestAnimationFrame') && adminAsset.includes('installScheduled'));
expect('admin mobile performance UI', adminAsset.includes('@media(max-width:780px)'));

const selfInstaller = await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee performance asset published', selfInstaller.includes('/assets/employee-performance-self-service.js'));
const adminInstaller = await read('scripts/install-employee-management-frontend.mjs');
expect('admin performance asset retained as compatibility publisher', adminInstaller.includes('/assets/admin-employee-performance.js'));

const canonicalBootstrap = await read('assets/admin-company-context.js');
const managementAt = canonicalBootstrap.indexOf("'admin-employee-management'");
const collaborationAt = canonicalBootstrap.indexOf("'admin-employee-collaboration'");
const performanceAtInBootstrap = canonicalBootstrap.indexOf("'admin-employee-performance'");
expect('canonical Admin bootstrap loads performance after collaboration', managementAt >= 0 && collaborationAt > managementAt && performanceAtInBootstrap > collaborationAt);
expect('canonical Admin bootstrap lazy-loads Employee 360 suite', canonicalBootstrap.includes('function loadEmployeeSuite()') && canonicalBootstrap.includes('employeeSuitePromise'));

const distEmployeePath = 'dist-web/employee-portal.html';
if (await exists(distEmployeePath)) {
  const html = await read(distEmployeePath);
  const collaborationAtInPortal = html.indexOf('/assets/employee-collaboration-self-service.js');
  const performanceAtInPortal = html.indexOf('/assets/employee-performance-self-service.js');
  expect('generated employee portal loads performance after collaboration', collaborationAtInPortal >= 0 && performanceAtInPortal > collaborationAtInPortal);
}

if (failures.length) {
  console.error(`Employee 360 performance verification failed (${failures.length}/${checks.length}):`);
  failures.forEach(failure => console.error(` - ${failure}`));
  process.exit(1);
}
console.log(`Employee 360 performance verification passed (${checks.length} checks) using canonical Admin bootstrap ownership.`);
