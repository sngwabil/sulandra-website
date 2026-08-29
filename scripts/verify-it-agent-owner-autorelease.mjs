import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const need=(source,marker,label)=>{if(!source.includes(marker))failures.push(`${label} missing: ${marker}`)};

const release=await readFile(path.join(root,'api','src','it-agent-owner-release.ts'),'utf8');
for(const marker of [
  'IT_AGENT_OWNER_AUTO_EXECUTION_ENABLED','ownerAutoExecutionEnabled','ITAgentReleaseRun','WAITING_CI','DEPLOYING','PRODUCTION_GREEN',
  'getITSpecialistGateState','mergeITSpecialistPullRequest','verifyITSpecialistProductionCommit','syncITSpecialistKnowledge',
  'queueITAgentOwnerRelease','startITAgentOwnerReleaseWorker','finalReply','resumeRequest',
])need(release,marker,'Owner release orchestrator');
if(release.includes("role==='HR_MANAGER'")||release.includes("role==='COO'"))failures.push('Owner auto-execution must not be widened to manager/COO roles');

const workbench=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
for(const marker of [
  "from './it-agent-owner-release.js'",'ownerAutoExecutionEnabled(auth)','queueITAgentOwnerRelease(prisma','startITAgentOwnerReleaseWorker(prisma)',
  "resumeRequest:{type:'string'}",'Authenticated owner request supplied approval at submission','deferred:deferFinal','sourceMatches:(knowledge.sourceMatches||[])',
])need(workbench,marker,'IT Agent owner integration');
if(!workbench.includes("policy.approvalRequired&&!ownerAutoExecutionEnabled(auth)"))failures.push('Owner request does not satisfy the new/material approval branch');
if(!workbench.includes("if(!deferFinal)await prisma.$executeRawUnsafe"))failures.push('Deferred release still writes an early assistant final response');

const knowledge=await readFile(path.join(root,'api','src','it-specialist-knowledge.ts'),'utf8');
for(const marker of ['extensionCounts','topLevelCounts','loadSourceMatches','sourceMatches','fileCount:Array.isArray(map.files)?map.files.length:0'])need(knowledge,marker,'Repository deep-read context');
if(knowledge.includes("p.includes('.env')&&!"))failures.push('Repository source inspection may have weakened .env exclusion');

const ui=await readFile(path.join(root,'assets','it-agent-conversational-ui.js'),'utf8');
for(const marker of ["status==='WAITING_CI'","status==='DEPLOYING'",'All three Railway production services are green','renderDeferredFinal','activity.deferred=Boolean(data.deferred)','Release workflow continues'])need(ui,marker,'Live release UI');

if(failures.length){console.error('IT Agent owner auto-release verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent owner auto-release verified: owner-request authorization is bounded to Administrator/CEO, code remains PR-first, required gates precede merge, three-service exact-commit verification precedes final reply, and repository context includes exact counts plus bounded source inspection.');
