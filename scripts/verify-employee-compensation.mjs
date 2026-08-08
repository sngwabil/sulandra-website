import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];const checks=[];
const exists=async p=>{try{await access(path.join(root,p));return true}catch{return false}};
const read=p=>readFile(path.join(root,p),'utf8');
const expect=(label,condition)=>{checks.push(label);if(!condition)failures.push(label)};

const backend='api/src/employee-compensation-routes.ts';
expect('compensation backend exists',await exists(backend));
if(await exists(backend)){
  const source=await read(backend);
  expect('effective dated compensation history',source.includes('EmployeeCompensationHistory')&&source.includes('effectiveDate')&&source.includes('endDate'));
  expect('hourly salary stipend contract pay types',['HOURLY','SALARY','STIPEND','CONTRACT'].every(v=>source.includes(v)));
  expect('overtime calculations',source.includes('overtimeEligible')&&source.includes('overtimeMultiplier')&&source.includes('overtimeEarnings'));
  expect('payroll profile and masked banking',source.includes('EmployeePayrollProfile')&&source.includes('accountLast4')&&source.includes('routingLast4'));
  expect('tax withholding fields',source.includes('taxFilingStatus')&&source.includes('additionalFederalWithholding')&&source.includes('additionalStateWithholding'));
  expect('deductions and garnishments',source.includes('EmployeePayrollDeduction')&&source.includes('GARNISHMENT')&&source.includes('PRE_TAX')&&source.includes('POST_TAX'));
  expect('benefit plan catalog',source.includes('EmployeeBenefitPlan')&&source.includes('MEDICAL')&&source.includes('RETIREMENT')&&source.includes('HSA'));
  expect('benefit enrollments',source.includes('EmployeeBenefitEnrollment')&&source.includes('coverageTier')&&source.includes('dependentCount'));
  expect('pay run lifecycle',source.includes('EmployeePayRun')&&['DRAFT','PROCESSING','APPROVED','PAID','VOID'].every(v=>source.includes(v)));
  expect('payroll item calculations',source.includes('EmployeePayrollItem')&&source.includes('grossPay')&&source.includes('netPay')&&source.includes('reimbursement'));
  expect('employee statements only approved or paid',source.includes("r.\"status\" IN ('APPROVED','PAID')"));
  expect('compensation audit events',source.includes('EmployeeCompensationEvent')&&source.includes('eventType'));
  expect('auditor read only',source.includes('Auditor compensation access is read only'));
  expect('owner compensation protection',source.includes('The Enterprise Owner compensation profile cannot be changed by another user'));
  expect('employee self service endpoint',source.includes('/api/employee/me/compensation'));
  expect('admin dashboard endpoint',source.includes('/api/admin/employee-compensation/dashboard'));
  expect('per employee compensation endpoint',source.includes('/api/admin/employees/:employeeId/compensation'));
  expect('pay run approval endpoint',source.includes('/pay-runs/:payRunId/status'));
  expect('organization isolation',source.includes('auth.organizationId')&&source.includes('"organizationId"=$1'));
}

const migration='prisma/migrations/20260806173000_employee_compensation_payroll_benefits/migration.sql';
expect('compensation migration exists',await exists(migration));
if(await exists(migration)){
  const sql=await read(migration);
  expect('all compensation tables migrated',['EmployeeCompensationHistory','EmployeePayrollProfile','EmployeePayrollDeduction','EmployeeBenefitPlan','EmployeeBenefitEnrollment','EmployeePayRun','EmployeePayrollItem','EmployeeCompensationEvent'].every(v=>sql.includes(v)));
  expect('compensation type constraints',sql.includes('EmployeeCompensationHistory_pay_type_check'));
  expect('payroll profile constraints',sql.includes('EmployeePayrollProfile_frequency_check')&&sql.includes('EmployeePayrollProfile_last4_check'));
  expect('deduction constraints',sql.includes('EmployeePayrollDeduction_category_check'));
  expect('benefit constraints',sql.includes('EmployeeBenefitPlan_type_check')&&sql.includes('EmployeeBenefitEnrollment_tier_check'));
  expect('active enrollment uniqueness',sql.includes('EmployeeBenefitEnrollment_active_unique'));
  expect('pay run lifecycle constraint',sql.includes('EmployeePayRun_status_check'));
  expect('payroll item nonnegative constraint',sql.includes('EmployeePayrollItem_nonnegative_check'));
  expect('compensation audit indexes',sql.includes('EmployeeCompensationEvent_employee_idx'));
}

const installer=await read('scripts/install-employee-management-platform.mjs');
expect('compensation route registered',installer.includes('registerEmployeeCompensationRoutes'));
const bootstrap=await read('api/src/onboarding-bootstrap.ts');
const compensationAt=bootstrap.indexOf('registerEmployeeCompensationRoutes({ app, prisma');
const careersAt=bootstrap.lastIndexOf('registerCareersRoutes(app, prisma');
expect('compensation route registered before careers',compensationAt>=0&&careersAt>compensationAt);

const employeeAsset=await read('assets/employee-compensation-self-service.js');
expect('My Pay and Benefits frontend',employeeAsset.includes('My Pay & Benefits')&&employeeAsset.includes('/api/employee/me/compensation'));
expect('employee compensation history UI',employeeAsset.includes('Compensation')&&employeeAsset.includes('compensationHistory'));
expect('employee payroll profile UI',employeeAsset.includes('Payroll Profile')&&employeeAsset.includes('directDepositEnabled'));
expect('employee benefits UI',employeeAsset.includes('Benefits')&&employeeAsset.includes('coverageTier'));
expect('employee statements UI',employeeAsset.includes('Pay Statements')&&employeeAsset.includes('payStatements'));
expect('employee mobile pay UI',employeeAsset.includes('@media(max-width:760px)'));

const adminAsset=await read('assets/admin-employee-compensation.js');
expect('admin compensation center',adminAsset.includes('Employee 360 Compensation, Payroll & Benefits'));
expect('admin readiness dashboard',adminAsset.includes('Payroll Readiness')&&adminAsset.includes('missingCompensationCount'));
expect('admin compensation change tool',adminAsset.includes('Add Effective-Dated Compensation Change')&&adminAsset.includes('compForm'));
expect('admin payroll profile tool',adminAsset.includes('Payroll Profile')&&adminAsset.includes('payrollProfileForm'));
expect('admin deductions tool',adminAsset.includes('Add Payroll Deduction')&&adminAsset.includes('deductionForm'));
expect('admin benefit plan tool',adminAsset.includes('Create Benefit Plan')&&adminAsset.includes('benefitForm'));
expect('admin enrollment tool',adminAsset.includes('Add Benefit Enrollment')&&adminAsset.includes('enrollmentForm'));
expect('admin pay run tool',adminAsset.includes('Create Pay Run')&&adminAsset.includes('openPayRun'));
expect('admin payroll item calculator',adminAsset.includes('Calculate and Save')&&adminAsset.includes('payrollItemForm'));
expect('admin pay run approvals',adminAsset.includes('Approve Payroll')&&adminAsset.includes('Mark Paid')&&adminAsset.includes('Void Run'));
expect('per employee pay entrypoint',adminAsset.includes('openProfileCompensation')&&adminAsset.includes('openEmployee'));
expect('bounded mutation observer',adminAsset.includes('requestAnimationFrame')&&adminAsset.includes('installScheduled'));
expect('admin mobile pay UI',adminAsset.includes('@media(max-width:780px)'));

const selfInstaller=await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee compensation asset published',selfInstaller.includes('/assets/employee-compensation-self-service.js'));
const adminInstaller=await read('scripts/install-employee-management-frontend.mjs');
expect('admin compensation asset published',adminInstaller.includes('/assets/admin-employee-compensation.js'));
const packageJson=await read('package.json');
expect('compensation integration in build',packageJson.includes('fix-employee-compensation-integration.mjs'));

if(failures.length){console.error(`Employee 360 compensation verification failed (${failures.length}/${checks.length}):`);failures.forEach(f=>console.error(` - ${f}`));process.exit(1)}
console.log(`Employee 360 compensation verification passed (${checks.length} checks).`);
