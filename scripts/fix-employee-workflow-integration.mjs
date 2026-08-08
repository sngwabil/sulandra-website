import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

// Verification source is immutable during builds. Historical versions inserted
// synthetic registration anchors into prior verifier files, which made a clean
// checkout validate differently after typecheck/build had mutated it.
const routePath=path.join(root,'api/src/employee-workflows-automation-routes.ts');
await access(routePath);
let routeSource=await readFile(routePath,'utf8');
const malformed=".length}})}catch(e){next(e)}});\n}";
const corrected=".length}}});}catch(e){next(e)}});\n}";
if(routeSource.includes(malformed)){
  routeSource=routeSource.replace(malformed,corrected);
  await writeFile(routePath,routeSource,'utf8');
  console.log('Employee workflow self-service response closure repaired.');
}else if(!routeSource.includes(corrected)){
  throw new Error('Unable to verify Employee workflow self-service response closure');
}

const bootstrapPath=path.join(root,'api/src/onboarding-bootstrap.ts');
let bootstrap=await readFile(bootstrapPath,'utf8');
const obsoleteImport="import { registerEmployeeWorkflowAutomationRoutes } from './employee-workflow-automation-routes.js';";
const correctImport="import { registerEmployeeWorkflowAutomationRoutes } from './employee-workflows-automation-routes.js';";
if(bootstrap.includes(obsoleteImport)){
  bootstrap=bootstrap.replaceAll(obsoleteImport,correctImport);
  await writeFile(bootstrapPath,bootstrap,'utf8');
  console.log('Employee workflow backend import path repaired.');
}
if(!bootstrap.includes(correctImport))throw new Error('Employee workflow backend import is missing or points to the wrong module');
if(!bootstrap.includes('registerEmployeeWorkflowAutomationRoutes({ app, prisma')) throw new Error('Employee workflow routes are not registered in the backend bootstrap');

console.log('Employee 360 workflow route syntax and module path are build-safe; verifier source is no longer rewritten during compilation.');
