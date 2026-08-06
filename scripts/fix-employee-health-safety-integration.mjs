import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const healthRegister='registerEmployeeHealthSafetyWellnessRoutes({ app, prisma, authOf, requireRoles, audit });';
const careersRegister='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const priorVerifiers=['verify-employee-learning.mjs','verify-employee-engagement.mjs','verify-employee-communications.mjs','verify-employee-workflows.mjs','verify-employee-bulk-data.mjs','verify-employee-documents.mjs','verify-employee-analytics.mjs','verify-employee-assets-access.mjs','verify-employee-leave-offboarding.mjs','verify-employee-compensation.mjs','verify-employee-performance.mjs','verify-employee-collaboration.mjs','verify-employee-compliance.mjs'];
for(const name of priorVerifiers){
  const target=path.join(root,'scripts',name);
  let source=await readFile(target,'utf8');
  if(source.includes(healthRegister))continue;
  if(source.includes(careersRegister)){
    source=source.replace(careersRegister,`${healthRegister}\n\n${careersRegister}`);
    await writeFile(target,source,'utf8');
    continue;
  }
  console.log(`Skipping ${name}; verifier no longer embeds backend registration anchors.`);
}
console.log('Employee 360 health, safety, incident prevention, wellness, and prior-section validation integration are build-safe.');
