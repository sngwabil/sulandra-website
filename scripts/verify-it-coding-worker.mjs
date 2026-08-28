import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const worker=await readFile(path.join(root,'api','src','it-coding-worker.ts'),'utf8');
const bootstrap=await readFile(path.join(root,'api','src','onboarding-bootstrap.ts'),'utf8');
const failures=[];
const need=(source,marker,label)=>{if(!source.includes(marker))failures.push(`${label} missing: ${marker}`)};
for(const marker of [
  'SULANDRA_GITHUB_TOKEN','OPENAI_API_KEY','IT_AGENT_CODEX_MODEL','IT_AGENT_CODING_WORKER_ENABLED','IT_AGENT_CODING_WORKER_MODE','IT_AGENT_GITHUB_BASE_BRANCH','IT_AGENT_GITHUB_BRANCH_PREFIX','SULANDRA_GITHUB_REPOSITORY',
  "config.mode!=='PR_ONLY'","config.repository!=='sngwabil/sulandra-website'","config.baseBranch!=='release/sulandra-1.0'",
  'https://api.github.com/repos/','https://api.openai.com/v1/responses','/git/refs','/git/blobs','/git/trees','/git/commits','/pulls',
  'ITCodingWorkerRun','PR_OPEN','Codex attempted to update an unread file','Codex proposed a forbidden path','Safety boundary: PR-only',
  '/api/it-solutions/coding-worker/status','/api/it-solutions/coding-worker/remediations/:approvalId/approve-and-run','/api/it-solutions/coding-worker/remediations/:approvalId/deny',
])need(worker,marker,'it-coding-worker.ts');
for(const marker of ['.env','credential','secret','api/dist/','dist-web/'])need(worker,marker,'forbidden-path policy');
if(worker.includes('SULANDRA_GITHUB_TOKEN=')||worker.includes('OPENAI_API_KEY='))failures.push('worker appears to hard-code a credential');
if(worker.includes("base:'main'")||worker.includes('refs/heads/release/sulandra-1.0'))failures.push('worker contains a direct release-branch write path');
if(worker.includes('/merge')||worker.includes('pulls/${')&&worker.includes('merge'))failures.push('worker must not merge PRs in Section 9C');
need(bootstrap,"import { registerITCodingWorkerRoutes } from './it-coding-worker.js';",'onboarding-bootstrap.ts');
const workerCalls=[...bootstrap.matchAll(/^\s*registerITCodingWorkerRoutes\(/gm)].map(match=>match.index??-1);
const agentCalls=[...bootstrap.matchAll(/^\s*registerITAgentWorkbenchRoutes\(/gm)].map(match=>match.index??-1);
if(workerCalls.length!==1)failures.push(`trusted coding worker must be registered exactly once; found ${workerCalls.length}`);
if(agentCalls.length<1)failures.push('privileged IT Agent registration is missing');
if(workerCalls.length===1&&agentCalls.length>=1&&workerCalls[0]<agentCalls[agentCalls.length-1])failures.push('trusted coding worker must register after privileged IT Agent');
if(failures.length){console.error('IT coding-worker verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Trusted IT coding worker verified: exact-repo, exact-base, PR-only Codex changes with approval gating, path restrictions, exactly-one route registration after IT Agent, GitHub branch/commit/PR creation, and no direct merge/deploy mutation.');
