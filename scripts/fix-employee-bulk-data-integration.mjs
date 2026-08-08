import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

// Historical versions of this script rewrote verifier source by replacing
// registerEmployeeDocumentsESignRoutes with a synthetic pipe-delimited token.
// Because typecheck/build run these repair scripts before validation, that made
// a clean verifier fail only after the build mutated it. Verification code is
// now immutable during builds; integration is checked against the real route
// module and generated backend bootstrap instead.
const routePath=path.join(root,'api/src/employee-bulk-data-routes.ts');
await access(routePath);
const routeSource=await readFile(routePath,'utf8');
if(!routeSource.includes('registerEmployeeBulkDataRoutes')) throw new Error('Employee bulk-data route module is missing its registration export.');

const bootstrapPath=path.join(root,'api/src/onboarding-bootstrap.ts');
const bootstrap=await readFile(bootstrapPath,'utf8');
if(!bootstrap.includes('registerEmployeeBulkDataRoutes({ app, prisma')) throw new Error('Employee bulk-data routes are not registered in the backend bootstrap.');

console.log('Employee 360 bulk data integration is build-safe; verifier source is no longer rewritten during compilation.');
