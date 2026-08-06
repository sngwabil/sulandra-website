import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api/src/onboarding-bootstrap.ts');
const careersImport = "import { registerCareersRoutes } from './careers-routes.js';";
const employeeImport = "import { registerEmployeeManagementRoutes } from './employee-management-routes.js';";
const careersRegister = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const employeeRegister = 'registerEmployeeManagementRoutes({ app, prisma, authOf, requireRoles, audit });';

let bootstrap = await readFile(bootstrapPath, 'utf8');
if (!bootstrap.includes(careersImport)) throw new Error('Unable to locate the careers import anchor for Employee 360');
if (!bootstrap.includes(employeeImport)) bootstrap = bootstrap.replace(careersImport, `${careersImport}\n${employeeImport}`);
bootstrap = bootstrap.replace(new RegExp(`\\n?${employeeRegister.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g'), '\n');
if (!bootstrap.includes(careersRegister)) throw new Error('Unable to locate the careers registration anchor for Employee 360');
bootstrap = bootstrap.replace(careersRegister, `${employeeRegister}\n\n${careersRegister}`);
await writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('Employee 360 management routes are installed.');
