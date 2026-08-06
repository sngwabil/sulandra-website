import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api/src/onboarding-bootstrap.ts');
const careersImport = "import { registerCareersRoutes } from './careers-routes.js';";
const permissionsImport = "import { registerEmployee360Permissions } from './employee-360-permissions.js';";
const employeeImport = "import { registerEmployeeManagementRoutes } from './employee-management-routes.js';";
const selfServiceImport = "import { registerEmployeeSelfServiceRoutes } from './employee-self-service-routes.js';";
const complianceImport = "import { registerEmployeeComplianceRoutes } from './employee-compliance-routes.js';";
const collaborationImport = "import { registerEmployeeCollaborationRoutes } from './employee-collaboration-routes.js';";
const performanceImport = "import { registerEmployeePerformanceRoutes } from './employee-performance-routes.js';";
const compensationImport = "import { registerEmployeeCompensationRoutes } from './employee-compensation-routes.js';";
const leaveOffboardingImport = "import { registerEmployeeLeaveOffboardingRoutes } from './employee-leave-offboarding-routes.js';";
const assetsAccessImport = "import { registerEmployeeAssetsAccessRoutes } from './employee-assets-access-routes.js';";
const analyticsImport = "import { registerEmployeeAnalyticsReportsRoutes } from './employee-analytics-reports-routes.js';";
const careersRegister = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const permissionsRegister = 'registerEmployee360Permissions({ app, prisma, authOf, requireRoles, audit });';
const employeeRegister = 'registerEmployeeManagementRoutes({ app, prisma, authOf, requireRoles, audit });';
const selfServiceRegister = 'registerEmployeeSelfServiceRoutes({ app, prisma, authOf, requireRoles, audit });';
const complianceRegister = 'registerEmployeeComplianceRoutes({ app, prisma, authOf, requireRoles, audit });';
const collaborationRegister = 'registerEmployeeCollaborationRoutes({ app, prisma, authOf, requireRoles, audit });';
const performanceRegister = 'registerEmployeePerformanceRoutes({ app, prisma, authOf, requireRoles, audit });';
const compensationRegister = 'registerEmployeeCompensationRoutes({ app, prisma, authOf, requireRoles, audit });';
const leaveOffboardingRegister = 'registerEmployeeLeaveOffboardingRoutes({ app, prisma, authOf, requireRoles, audit });';
const assetsAccessRegister = 'registerEmployeeAssetsAccessRoutes({ app, prisma, authOf, requireRoles, audit });';
const analyticsRegister = 'registerEmployeeAnalyticsReportsRoutes({ app, prisma, authOf, requireRoles, audit });';

let bootstrap = await readFile(bootstrapPath, 'utf8');
if (!bootstrap.includes(careersImport)) throw new Error('Unable to locate the careers import anchor for Employee 360');
for (const importLine of [permissionsImport, employeeImport, selfServiceImport, complianceImport, collaborationImport, performanceImport, compensationImport, leaveOffboardingImport, assetsAccessImport, analyticsImport]) {
  if (!bootstrap.includes(importLine)) bootstrap = bootstrap.replace(careersImport, `${careersImport}\n${importLine}`);
}
for (const registerLine of [permissionsRegister, employeeRegister, selfServiceRegister, complianceRegister, collaborationRegister, performanceRegister, compensationRegister, leaveOffboardingRegister, assetsAccessRegister, analyticsRegister]) {
  bootstrap = bootstrap.replace(new RegExp(`\\n?${registerLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g'), '\n');
}
if (!bootstrap.includes(careersRegister)) throw new Error('Unable to locate the careers registration anchor for Employee 360');
bootstrap = bootstrap.replace(careersRegister, `${permissionsRegister}\n${employeeRegister}\n${selfServiceRegister}\n${complianceRegister}\n${collaborationRegister}\n${performanceRegister}\n${compensationRegister}\n${leaveOffboardingRegister}\n${assetsAccessRegister}\n${analyticsRegister}\n\n${careersRegister}`);
await writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('Employee 360 permissions, management, self-service, compliance, collaboration, performance, compensation, payroll, benefits, leave, accommodations, separation, offboarding, assets, facilities, equipment, badges, keys, access, analytics, reporting, and executive insight routes are installed.');
