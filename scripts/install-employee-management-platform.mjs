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
const careersRegister = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const permissionsRegister = 'registerEmployee360Permissions({ app, prisma, authOf, requireRoles, audit });';
const employeeRegister = 'registerEmployeeManagementRoutes({ app, prisma, authOf, requireRoles, audit });';
const selfServiceRegister = 'registerEmployeeSelfServiceRoutes({ app, prisma, authOf, requireRoles, audit });';
const complianceRegister = 'registerEmployeeComplianceRoutes({ app, prisma, authOf, requireRoles, audit });';

let bootstrap = await readFile(bootstrapPath, 'utf8');
if (!bootstrap.includes(careersImport)) throw new Error('Unable to locate the careers import anchor for Employee 360');
for (const importLine of [permissionsImport, employeeImport, selfServiceImport, complianceImport]) {
  if (!bootstrap.includes(importLine)) bootstrap = bootstrap.replace(careersImport, `${careersImport}\n${importLine}`);
}
for (const registerLine of [permissionsRegister, employeeRegister, selfServiceRegister, complianceRegister]) {
  bootstrap = bootstrap.replace(new RegExp(`\\n?${registerLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g'), '\n');
}
if (!bootstrap.includes(careersRegister)) throw new Error('Unable to locate the careers registration anchor for Employee 360');
bootstrap = bootstrap.replace(careersRegister, `${permissionsRegister}\n${employeeRegister}\n${selfServiceRegister}\n${complianceRegister}\n\n${careersRegister}`);
await writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('Employee 360 permissions, management, self-service, compliance requirements, and automatic reminders are installed.');
