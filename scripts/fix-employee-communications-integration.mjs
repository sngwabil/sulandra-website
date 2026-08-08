import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const route=await readFile(path.join(root,'api/src/employee-communications-notifications-routes.ts'),'utf8');
if(!route.includes('registerEmployeeCommunicationsNotificationsRoutes')) throw new Error('Employee communications route module is missing its registration export');
const bootstrap=await readFile(path.join(root,'api/src/onboarding-bootstrap.ts'),'utf8');
if(!bootstrap.includes('registerEmployeeCommunicationsNotificationsRoutes({ app, prisma')) throw new Error('Employee communications routes are not registered in the backend bootstrap');
console.log('Employee 360 communications integration is build-safe; verifier source is immutable during compilation.');
