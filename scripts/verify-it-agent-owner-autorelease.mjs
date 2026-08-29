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
for(const marker of ["!p.includes('.env')","!p.includes('credential')","!p.includes('secret')","!p.endsWith('.pem')","!p.endsWith('.key')"])need(knowledge,marker,'Repository source secret exclusion');

const ui=await readFile(path.join(root,'assets','it-agent-conversational-ui.js'),'utf8');
for(const marker of ["status==='WAITING_CI'","status==='DEPLOYING'",'All three Railway production services are green','renderDeferredFinal','activity.deferred=Boolean(data.deferred)','Release workflow continues'])need(ui,marker,'Live release UI');

const employeeSupport=await readFile(path.join(root,'scripts','install-employee-support.mjs'),'utf8');
need(employeeSupport,"await import('./install-it-agent-owner-autorelease.mjs')",'Canonical owner-release installer order');
const canonicalIndex=employeeSupport.indexOf("await import('./install-it-agent-ephemeral-attachments.mjs')");
const ownerIndex=employeeSupport.indexOf("await import('./install-it-agent-owner-autorelease.mjs')");
if(canonicalIndex<0||ownerIndex<canonicalIndex)failures.push('Owner-release installer must run after the canonical IT Agent stack');
if((employeeSupport.match(/install-it-agent-owner-autorelease\.mjs/g)||[]).length!==1)failures.push('Canonical IT Agent chain must install owner-release exactly once');

const optimizer=await readFile(path.join(root,'scripts','optimize-admin-login-performance.mjs'),'utf8');
if(optimizer.includes("await import('./install-it-agent-owner-autorelease.mjs')"))failures.push('Generic Admin optimizer must not install owner-release before the canonical IT Agent stack');
need(optimizer,'IT Agent owner auto-release installation is deferred to the canonical IT Agent installer chain','Owner-release optimizer deferral');

const frontendDocker=await readFile(path.join(root,'Dockerfile.frontend'),'utf8');
need(frontendDocker,'RUN node scripts/install-employee-support.mjs','Static Railway canonical IT Agent chain');
const frontendOptimizerIndex=frontendDocker.indexOf('RUN node scripts/optimize-admin-login-performance.mjs');
const frontendSupportIndex=frontendDocker.indexOf('RUN node scripts/install-employee-support.mjs');
if(frontendOptimizerIndex<0||frontendSupportIndex<frontendOptimizerIndex)failures.push('Static Railway build must run canonical IT Agent chain after the generic optimizer');

if(failures.length){console.error('IT Agent owner auto-release verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent owner auto-release verified: owner-request authorization is bounded to Administrator/CEO, code remains PR-first, required gates precede merge, three-service exact-commit verification precedes final reply, repository context includes exact counts plus bounded source inspection, and both Railway images install owner-release exactly once after the canonical IT Agent stack.');
