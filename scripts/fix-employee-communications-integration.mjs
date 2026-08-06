import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const communicationsRegister='${communicationsRegister}';
const careersRegister='${careersRegister}';
const files=[
  'scripts/verify-employee-workflows.mjs','scripts/verify-employee-bulk-data.mjs','scripts/verify-employee-documents.mjs','scripts/verify-employee-analytics.mjs','scripts/verify-employee-assets-access.mjs','scripts/verify-employee-leave-offboarding.mjs','scripts/verify-employee-compensation.mjs','scripts/verify-employee-performance.mjs','scripts/verify-employee-collaboration.mjs','scripts/verify-employee-compliance.mjs'
];
for(const file of files){const target=path.join(root,file);let source=await readFile(target,'utf8');if(source.includes(communicationsRegister))continue;const marker=`${careersRegister}`;if(source.includes(marker)){source=source.replace(marker,`${communicationsRegister}\\n\\n${careersRegister}`);await writeFile(target,source,'utf8')}}
console.log('Employee 360 prior-section validations recognize communications route registration.');
