import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api/src/onboarding-bootstrap.ts');
const importLine="import { registerEmployeeSupportRoutes } from './employee-support-routes.js';";
const registerLine='registerEmployeeSupportRoutes({ app, prisma, authOf, requireRoles });';
const careersImport="import { registerCareersRoutes } from './careers-routes.js';";
const careersRegister='registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
let source=await readFile(target,'utf8');
if(!source.includes(importLine)){
  if(!source.includes(careersImport))throw new Error('Unable to locate Careers import anchor for employee support routes');
  source=source.replace(careersImport,`${careersImport}\n${importLine}`);
}
source=source.replace(new RegExp(`\\n?${registerLine.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
if(!source.includes(careersRegister))throw new Error('Unable to locate Careers registration anchor for employee support routes');
source=source.replace(careersRegister,`${registerLine}\n\n${careersRegister}`);
await writeFile(target,source,'utf8');
console.log('Employee support request routes are registered before Careers.');

await import('./install-sia-routes.mjs');
await import('./install-it-solutions-powerhouse.mjs');
await import('./install-it-agent-workbench.mjs');
await import('./install-it-coding-worker.mjs');
await import('./install-it-specialist-autonomy.mjs');
await import('./install-it-agent-training-workflow.mjs');
await import('./fix-it-agent-readonly-training-status.mjs');
await import('./install-it-agent-conversational-review-ux.mjs');
await import('./install-it-agent-training-publication.mjs');
await import('./install-it-agent-artifact-capabilities.mjs');
await import('./fix-it-agent-artifact-build-idempotency.mjs');
await import('./fix-it-agent-trusted-action-continuity.mjs');
await import('./install-it-agent-chatgpt-workspace.mjs');

// Final presentation polish keeps the Action Center as a true right-edge drawer and keeps
// only current-message attachments visible inside the compact composer.
await import('./install-it-agent-chatgpt-polish.mjs');
