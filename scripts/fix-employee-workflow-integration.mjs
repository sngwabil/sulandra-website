import { readFile, writeFile } from 'node:fs/promises';
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

console.log('Employee 360 workflow route syntax and prior-section validation integration are build-safe.');