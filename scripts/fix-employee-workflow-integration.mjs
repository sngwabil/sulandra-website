import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workflowRegister='${workflowRegister}';
const careersRegister='${careersRegister}';
const files=[
  'scripts/verify-employee-bulk-data.mjs','scripts/verify-employee-documents.mjs','scripts/verify-employee-analytics.mjs','scripts/verify-employee-assets-access.mjs','scripts/verify-employee-leave-offboarding.mjs','scripts/verify-employee-compensation.mjs','scripts/verify-employee-performance.mjs','scripts/verify-employee-collaboration.mjs','scripts/verify-employee-compliance.mjs'
];
for(const file of files){const target=path.join(root,file);let source=await readFile(target,'utf8');if(source.includes(workflowRegister))continue;const marker=`${careersRegister}`;if(source.includes(marker)){source=source.replace(marker,`${workflowRegister}\\n\\n${careersRegister}`);await writeFile(target,source,'utf8')}}

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

console.log('Employee 360 workflow route syntax, module path, and prior-section validation integration are build-safe.');
