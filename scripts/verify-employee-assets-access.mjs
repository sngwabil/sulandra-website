import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];const checks=[];
const exists=async p=>{try{await access(path.join(root,p));return true}catch{return false}};
const read=p=>readFile(path.join(root,p),'utf8');
const expect=(label,condition)=>{checks.push(label);if(!condition)failures.push(label)};

const backend='api/src/employee-assets-access-routes.ts';
expect('assets backend exists',await exists(backend));
if(await exists(backend)){
  const source=await read(backend);
  expect('asset inventory categories', ['COMPUTER','PHONE','TABLET','VEHICLE','BADGE','KEY','UNIFORM','MEDICAL_DEVICE','FURNITURE','TOOL','OTHER'].every(v=>source.includes(v)));
  expect('asset lifecycle statuses', ['AVAILABLE','ASSIGNED','IN_REPAIR','LOST','STOLEN','RETIRED','DISPOSED'].every(v=>source.includes(v)));
  expect('asset assignment workflow', source.includes('EmployeeAssetAssignment')&&source.includes('/assign')&&source.includes('/return'));
  expect('employee acknowledgment workflow', source.includes('/acknowledge')&&source.includes('acknowledgmentRequired')&&source.includes('acknowledgedAt'));
  expect('access grants and revocation', source.includes("'/api/admin/employees/:employeeId/access-grants'")&&source.includes("'/api/admin/employee-access-grants/:grantId'")&&source.includes("'REVOKED'"));
  expect('least privilege justification', source.includes('leastPrivilegeJustification'));
  expect('maintenance and inspections', source.includes('EmployeeAssetMaintenance')&&source.includes('/maintenance'));
  expect('facility management', source.includes('EmployeeFacility')&&source.includes("'/api/admin/employee-facilities'"));
  expect('asset and security incidents', source.includes('EmployeeAssetIncident')&&source.includes("'/api/admin/employee-asset-incidents'"));
  expect('employee self service endpoint', source.includes('/api/employee/me/assets-access'));
  expect('admin dashboard endpoint', source.includes('/api/admin/employee-assets/dashboard'));
  expect('per employee endpoint', source.includes('/api/admin/employees/:employeeId/assets-access'));
  expect('owner protection', source.includes('The Enterprise Owner asset and access record cannot be changed by another user'));
  expect('auditor read only', source.includes('Auditor asset and access management is read only'));
  expect('elevated security access control', source.includes('Only the Enterprise Owner, Human Resources, or an Administrator may manage security-sensitive access'));
  expect('organization isolation', source.includes('auth.organizationId')&&source.includes('"organizationId"=$1'));
  expect('audit events', source.includes('EmployeeAssetAccessEvent')&&source.includes('eventType'));
}

const migration='prisma/migrations/20260806174500_employee_assets_access_management/migration.sql';
expect('assets migration exists',await exists(migration));
if(await exists(migration)){
  const sql=await read(migration);
  expect('all section seven tables migrated',['EmployeeAsset','EmployeeAssetAssignment','EmployeeAccessGrant','EmployeeAssetMaintenance','EmployeeFacility','EmployeeAssetIncident','EmployeeAssetAccessEvent'].every(v=>sql.includes(v)));
  expect('unique asset tags',sql.includes('EmployeeAsset_asset_tag_unique'));
  expect('one active assignment per asset',sql.includes('EmployeeAssetAssignment_active_asset_unique'));
  expect('acknowledgment index',sql.includes('EmployeeAssetAssignment_ack_idx'));
  expect('access expiry index',sql.includes('EmployeeAccessGrant_expiry_idx'));
  expect('maintenance due index',sql.includes('EmployeeAssetMaintenance_due_idx'));
  expect('incident link constraint',sql.includes('EmployeeAssetIncident_link_check'));
  expect('asset event resource index',sql.includes('EmployeeAssetAccessEvent_resource_idx'));
}

const installer=await read('scripts/install-employee-management-platform.mjs');
expect('assets route registered',installer.includes('registerEmployeeAssetsAccessRoutes'));
const bootstrap=await read('api/src/onboarding-bootstrap.ts');
const assetsAt=bootstrap.indexOf('registerEmployeeAssetsAccessRoutes({ app, prisma');
const careersAt=bootstrap.lastIndexOf('registerCareersRoutes(app, prisma');
expect('assets route before careers',assetsAt>=0&&careersAt>assetsAt);

const employeeAsset=await read('assets/employee-assets-self-service.js');
expect('employee My Assets frontend',employeeAsset.includes('My Assets & Access')&&employeeAsset.includes('/api/employee/me/assets-access'));
expect('employee acknowledgment UI',employeeAsset.includes('Acknowledge Receipt')&&employeeAsset.includes('ackAssignment'));
expect('employee access history UI',employeeAsset.includes('Access Grants')&&employeeAsset.includes('accessRow'));
expect('employee mobile assets UI',employeeAsset.includes('@media(max-width:620px)'));

const adminAsset=await read('assets/admin-employee-assets-access.js');
expect('admin Assets and Access Center',adminAsset.includes('Employee 360 Assets, Facilities & Access Center'));
expect('inventory UI',adminAsset.includes('Add Asset')&&adminAsset.includes('assetForm'));
expect('assignment and return UI',adminAsset.includes('Assign Asset')&&adminAsset.includes('Record Return'));
expect('maintenance UI',adminAsset.includes('Maintenance')&&adminAsset.includes('maintenanceForm'));
expect('facility UI',adminAsset.includes('Add Facility')&&adminAsset.includes('facilityForm'));
expect('access grant and revoke UI',adminAsset.includes('Grant Access')&&adminAsset.includes('revokeAccess'));
expect('incident UI',adminAsset.includes('Report Asset or Access Incident')&&adminAsset.includes('incidentForm'));
expect('team risk dashboard',adminAsset.includes('pendingAck')&&adminAsset.includes('overdue'));
expect('per employee entrypoint',adminAsset.includes('openProfileAssets')&&adminAsset.includes('openEmployee'));
expect('bounded mutation observer',adminAsset.includes('requestAnimationFrame')&&adminAsset.includes('installScheduled'));
expect('admin mobile assets UI',adminAsset.includes('@media(max-width:780px)'));

const selfInstaller=await read('scripts/install-employee-self-service-frontend.mjs');
expect('employee assets asset published',selfInstaller.includes('/assets/employee-assets-self-service.js'));
const adminInstaller=await read('scripts/install-employee-management-frontend.mjs');
expect('admin assets asset retained as compatibility publisher',adminInstaller.includes('/assets/admin-employee-assets-access.js'));

const canonicalBootstrap=await read('assets/admin-company-context.js');
const leaveAt=canonicalBootstrap.indexOf("'admin-employee-leave-offboarding'");
const assetsAtInBootstrap=canonicalBootstrap.indexOf("'admin-employee-assets-access'");
expect('canonical Admin bootstrap loads assets after leave',leaveAt>=0&&assetsAtInBootstrap>leaveAt);
expect('canonical Admin bootstrap lazy-loads Employee 360 suite',canonicalBootstrap.includes('function loadEmployeeSuite()')&&canonicalBootstrap.includes('employeeSuitePromise'));

const distEmployee='dist-web/employee-portal.html';
if(await exists(distEmployee)){
  const html=await read(distEmployee);
  expect('generated employee portal loads assets after leave',html.indexOf('/assets/employee-assets-self-service.js')>html.indexOf('/assets/employee-leave-self-service.js'));
}

if(failures.length){console.error(`Employee 360 assets and access verification failed (${failures.length}/${checks.length}):`);failures.forEach(f=>console.error(` - ${f}`));process.exit(1)}
console.log(`Employee 360 assets and access verification passed (${checks.length} checks) using canonical Admin bootstrap ownership.`);
