import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','src','onboarding-bootstrap.ts');
const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let source=await readFile(target,'utf8');
const agentImport="import { registerITAgentWorkbenchRoutes } from './it-agent-workbench-routes.js';";
const workerImport="import { registerITCodingWorkerRoutes } from './it-coding-worker.js';";
const agentRegister='registerITAgentWorkbenchRoutes({ app, prisma, authOf, requireRoles });';
const workerRegister='registerITCodingWorkerRoutes({ app, prisma, authOf, requireRoles, adminRoles: [UserRole.ADMINISTRATOR, UserRole.CEO, UserRole.DOO, UserRole.COO, UserRole.HR_MANAGER] });';
if(!source.includes(workerImport)){
  if(!source.includes(agentImport))throw new Error('IT Agent import anchor missing for trusted coding worker');
  source=source.replace(agentImport,`${agentImport}\n${workerImport}`);
}
source=source.replace(new RegExp(`\\n?${workerRegister.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
if(!source.includes(agentRegister))throw new Error('IT Agent registration anchor missing for trusted coding worker');
source=source.replace(agentRegister,`${agentRegister}\n${workerRegister}`);
await writeFile(target,source,'utf8');

let workbench=await readFile(workbenchPath,'utf8');
workbench=workbench.replaceAll(
  'codingWorkerConnected:Boolean(process.env.SULANDRA_GITHUB_TOKEN||process.env.GITHUB_TOKEN)',
  "codingWorkerConnected:String(process.env.IT_AGENT_CODING_WORKER_ENABLED||'').toLowerCase()==='true'&&Boolean(process.env.SULANDRA_GITHUB_TOKEN||process.env.GITHUB_TOKEN)",
);
await writeFile(workbenchPath,workbench,'utf8');
await import('./verify-it-coding-worker.mjs');
console.log('Trusted PR-only IT coding worker registered after the privileged IT Agent.');
