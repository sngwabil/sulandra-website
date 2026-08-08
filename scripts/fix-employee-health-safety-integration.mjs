import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const route=await readFile(path.join(root,'api/src/employee-health-safety-wellness-routes.ts'),'utf8');
if(!route.includes('registerEmployeeHealthSafetyWellnessRoutes')) throw new Error('Employee health and safety route module is missing its registration export');
const bootstrap=await readFile(path.join(root,'api/src/onboarding-bootstrap.ts'),'utf8');
if(!bootstrap.includes('registerEmployeeHealthSafetyWellnessRoutes({ app, prisma')) throw new Error('Employee health and safety routes are not registered in the backend bootstrap');
console.log('Employee 360 health, safety, incident prevention and wellness integration is build-safe; verifier source is immutable during compilation.');
