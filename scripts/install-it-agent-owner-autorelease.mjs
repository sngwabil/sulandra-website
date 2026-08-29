import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const must=(condition,message)=>{if(!condition)throw new Error(message)};

// Administrator IT Agent: authenticated owner request can satisfy approval, but
// the trusted coding worker remains PR-only and release still requires green gates
// plus exact production-commit verification on all three Railway services.
const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let workbench=await readFile(workbenchPath,'utf8');
const ownerImport="import { ownerAutoExecutionEnabled, queueITAgentOwnerRelease, startITAgentOwnerReleaseWorker } from './it-agent-owner-release.js';";
if(!workbench.includes(ownerImport)){
  const anchor="import { getITSpecialistKnowledgeContext } from './it-specialist-knowledge.js';";
  must(workbench.includes(anchor),'Owner auto-release workbench import anchor changed');
  workbench=workbench.replace(anchor,`${anchor}\n${ownerImport}`);
}

const oldKnowledgeType="type KnowledgeContext={repository?:string;baseBranch?:string;headSha?:string;areas?:Record<string,number>;services?:unknown[];fileMatches?:unknown[];approvedWorkMatches?:unknown[];approvedEvidenceCount?:number;refreshedAt?:Date|string|null;error?:string};";
const newKnowledgeType="type KnowledgeContext={repository?:string;baseBranch?:string;headSha?:string;fileCount?:number;areas?:Record<string,number>;extensionCounts?:Record<string,number>;topLevelCounts?:Record<string,number>;services?:unknown[];fileMatches?:unknown[];sourceMatches?:unknown[];approvedWorkMatches?:unknown[];approvedEvidenceCount?:number;refreshedAt?:Date|string|null;error?:string};";
if(workbench.includes(oldKnowledgeType))workbench=workbench.replace(oldKnowledgeType,newKnowledgeType);
else must(workbench.includes('sourceMatches?:unknown[]'),'Owner auto-release KnowledgeContext anchor changed');

const oldToolReason="reason:{type:'string'},changeClass:{type:'string',enum:['ESTABLISHED_OPERATION_REPAIR','NEW_SYSTEM_CHANGE']}";
const newToolReason="reason:{type:'string'},resumeRequest:{type:'string'},changeClass:{type:'string',enum:['ESTABLISHED_OPERATION_REPAIR','NEW_SYSTEM_CHANGE']}";
if(workbench.includes(oldToolReason))workbench=workbench.replace(oldToolReason,newToolReason);
else must(workbench.includes("resumeRequest:{type:'string'}"),'Owner auto-release resumeRequest tool property anchor changed');
const oldRequired="required:['summary','request','target','reason','changeClass','risk']";
const newRequired="required:['summary','request','target','reason','resumeRequest','changeClass','risk']";
if(workbench.includes(oldRequired))workbench=workbench.replace(oldRequired,newRequired);
else must(workbench.includes(newRequired),'Owner auto-release request_code_change required-list anchor changed');

workbench=workbench.replace(
  'Verified established repairs can be dispatched automatically to the PR-only coding worker; new/material changes wait for the administrator to press Execute. Never claim a code change happened until trusted worker evidence says it did.',
  'Verified established repairs can be dispatched automatically to the PR-only coding worker. When owner auto-execution is enabled, an explicit request from the authenticated Administrator/CEO is itself the owner authorization for new/material code work; it still must use the PR-only worker, pass required GitHub gates, merge to the approved release line, and verify the exact commit on all three production services. For non-owner sessions or when owner auto-execution is disabled, new/material changes wait for Execute. Set resumeRequest to the earlier blocked read-only request that should be retried after a capability-enabling deployment, or an empty string when there is nothing to retry. Never claim a code change happened until trusted execution evidence says it did.'
);
workbench=workbench.replace(
  'New/material changes stop at an approval card; pressing Execute is the administrator\'s approval and must start the coding worker rather than create another dead-end record.',
  'When owner auto-execution is enabled and the authenticated requester is the Administrator/CEO, the owner\'s explicit request itself satisfies the approval boundary for new/material code work. The change must still remain PR-only until required gates pass, then merge to release/sulandra-1.0 and verify the exact commit on all three production services. Other authorized IT roles or disabled owner auto-execution still stop at the approval card, where Execute supplies approval.'
);

const contextOld="repositoryKnowledge:{repository:knowledge.repository,baseBranch:knowledge.baseBranch,headSha:knowledge.headSha,approvedEvidenceCount:knowledge.approvedEvidenceCount||0,approvedWorkMatches:(knowledge.approvedWorkMatches||[]).slice(0,15),fileMatches:(knowledge.fileMatches||[]).slice(0,50),services:knowledge.services||[],error:knowledge.error||''}";
const contextNew="repositoryKnowledge:{repository:knowledge.repository,baseBranch:knowledge.baseBranch,headSha:knowledge.headSha,fileCount:knowledge.fileCount||0,extensionCounts:knowledge.extensionCounts||{},topLevelCounts:knowledge.topLevelCounts||{},approvedEvidenceCount:knowledge.approvedEvidenceCount||0,approvedWorkMatches:(knowledge.approvedWorkMatches||[]).slice(0,25),fileMatches:(knowledge.fileMatches||[]).slice(0,100),sourceMatches:(knowledge.sourceMatches||[]).slice(0,12),services:knowledge.services||[],error:knowledge.error||''}";
if(workbench.includes(contextOld))workbench=workbench.replace(contextOld,contextNew);
else must(workbench.includes('sourceMatches:(knowledge.sourceMatches||[])'),'Owner auto-release repository context anchor changed');
workbench=workbench.replace('}),45000)};','}),95000)};');

const readyClose="  })().catch(error=>{init=null;throw error});";
if(workbench.includes(readyClose)&&!workbench.includes('await startITAgentOwnerReleaseWorker(prisma);'))workbench=workbench.replace(readyClose,`    await startITAgentOwnerReleaseWorker(prisma);\n${readyClose}`);
must(workbench.includes('startITAgentOwnerReleaseWorker(prisma)'),'Owner auto-release worker startup anchor changed');

const oldRun="try{const worker=await runApprovedITCodingWorker(prisma,{organizationId:auth.organizationId,approvalId:ids.approvalId,actorUserId:auth.userId});return{status:'PR_OPEN',result:{...ids,approvalRequired:false,codingWorker:worker,message:`Trusted coding worker opened PR #${worker.prNumber}. No production deployment was fabricated or bypassed.`}}}";
const newRun="try{const worker=await runApprovedITCodingWorker(prisma,{organizationId:auth.organizationId,approvalId:ids.approvalId,actorUserId:auth.userId});const actionPayload=obj(action.payload);const release=ownerAutoExecutionEnabled(auth)?await queueITAgentOwnerRelease(prisma,{auth,actionId:action.id,conversationId:action.conversationId,summary:action.summary,resumeRequest:clean(actionPayload.resumeRequest,12000),worker}):null;return{status:release?'WAITING_CI':'PR_OPEN',result:{...ids,approvalRequired:false,codingWorker:worker,...(release?{release}:{}),message:release?`Trusted coding worker opened PR #${worker.prNumber}. Owner-authorized release orchestration is checking CI before merge and production verification.`:`Trusted coding worker opened PR #${worker.prNumber}. No production deployment was fabricated or bypassed.`}}}";
if(workbench.includes(oldRun))workbench=workbench.replace(oldRun,newRun);
else must(workbench.includes('queueITAgentOwnerRelease(prisma'),'Owner auto-release runCodeAction anchor changed');

const oldApprovalBranch="        if(policy.approvalRequired){const ids=await ensureCodeRemediation(action,auth,false);";
const newApprovalBranch="        if(policy.approvalRequired&&!ownerAutoExecutionEnabled(auth)){const ids=await ensureCodeRemediation(action,auth,false);";
if(workbench.includes(oldApprovalBranch))workbench=workbench.replace(oldApprovalBranch,newApprovalBranch);
else must(workbench.includes('policy.approvalRequired&&!ownerAutoExecutionEnabled(auth)'),'Owner auto-release approval branch anchor changed');
const oldRunCall="const execution=await runCodeAction(action,auth,'Policy-approved established-operation repair backed by trusted release evidence');";
const newRunCall="const execution=await runCodeAction(action,auth,policy.approvalRequired?'Authenticated owner request supplied approval at submission':'Policy-approved established-operation repair backed by trusted release evidence');";
if(workbench.includes(oldRunCall))workbench=workbench.replace(oldRunCall,newRunCall);
else must(workbench.includes('Authenticated owner request supplied approval at submission'),'Owner auto-release execution-note anchor changed');

const replyFallback="if(!reply)reply='I reviewed the request but did not create an executable action. Tell me the exact Sulandra target and desired result.';";
if(workbench.includes(replyFallback)&&!workbench.includes('const deferFinal=proposals.some'))workbench=workbench.replace(replyFallback,`${replyFallback}const deferFinal=proposals.some(item=>['WAITING_CI','DEPLOYING'].includes(String(item?.status||'').toUpperCase()));if(deferFinal)reply='';`);
must(workbench.includes('const deferFinal=proposals.some'),'Owner auto-release deferred-final anchor changed');
const assistantInsert="    await prisma.$executeRawUnsafe(`INSERT INTO \"ITAgentMessage\" (\"id\",\"organizationId\",\"conversationId\",\"userId\",\"role\",\"content\",\"model\") VALUES ($1,$2,$3,$4,'assistant',$5,$6)`,randomUUID(),auth.organizationId,conversationId,auth.userId,reply,model());";
if(workbench.includes(assistantInsert))workbench=workbench.replace(assistantInsert,`    if(!deferFinal)await prisma.$executeRawUnsafe(\`INSERT INTO \"ITAgentMessage\" (\"id\",\"organizationId\",\"conversationId\",\"userId\",\"role\",\"content\",\"model\") VALUES ($1,$2,$3,$4,'assistant',$5,$6)\`,randomUUID(),auth.organizationId,conversationId,auth.userId,reply,model());`);
else must(workbench.includes('if(!deferFinal)await prisma.$executeRawUnsafe'),'Owner auto-release deferred assistant insert anchor changed');
const responseOld="res.json({data:{conversationId,reply,proposals,model:model()}})";
const responseNew="res.json({data:{conversationId,reply,proposals,model:model(),deferred:deferFinal}})";
if(workbench.includes(responseOld))workbench=workbench.replace(responseOld,responseNew);
else must(workbench.includes('deferred:deferFinal'),'Owner auto-release deferred response anchor changed');
await writeFile(workbenchPath,workbench,'utf8');

// Repository knowledge: maintain exact inventory counts and include bounded source
// content for the files most relevant to the Administrator's current question.
const knowledgePath=path.join(root,'api','src','it-specialist-knowledge.ts');
let knowledge=await readFile(knowledgePath,'utf8');
const cacheOld="if(!force&&Date.now()-refreshed<6*60*60*1000){";
const cacheNew="if(!force&&Date.now()-refreshed<6*60*60*1000&&JSON.stringify(existing[0]?.payload||{}).includes('extensionCounts')){";
if(knowledge.includes(cacheOld))knowledge=knowledge.replace(cacheOld,cacheNew);
else must(knowledge.includes(cacheNew),'Repository inventory cache anchor changed');
const areasOld="  const areas:Record<string,number>={};for(const file of files)areas[file.area]=(areas[file.area]||0)+1;";
const areasNew="  const areas:Record<string,number>={},extensionCounts:Record<string,number>={},topLevelCounts:Record<string,number>={};for(const file of files){areas[file.area]=(areas[file.area]||0)+1;const match=file.path.match(/(\\.[^./]+)$/);const extension=(match?.[1]||'[no-extension]').toLowerCase();extensionCounts[extension]=(extensionCounts[extension]||0)+1;const top=file.path.includes('/')?file.path.split('/')[0]:'[root]';topLevelCounts[top]=(topLevelCounts[top]||0)+1;}";
if(knowledge.includes(areasOld))knowledge=knowledge.replace(areasOld,areasNew);
else must(knowledge.includes('extensionCounts:Record<string,number>'),'Repository extension-count anchor changed');
knowledge=knowledge.replace('JSON.stringify({files,areas,services})','JSON.stringify({files,areas,services,extensionCounts,topLevelCounts})');
const contextFn="export async function getITSpecialistKnowledgeContext(prisma:PrismaClient,query:string){";
const sourceHelper=`const sourceInspectable=(file:any)=>{const p=String(file?.path||'').toLowerCase();return Boolean(file?.sha)&&/\\.(?:ts|tsx|js|mjs|cjs|json|html|css|md|sql|prisma|yml|yaml|toml|txt)$/i.test(p)&&!p.includes('node_modules/')&&!p.startsWith('dist-web/')&&!p.startsWith('api/dist/')&&!p.includes('.env')&&!p.includes('credential')&&!p.includes('secret')&&!p.endsWith('.pem')&&!p.endsWith('.key');};\nasync function loadSourceMatches(files:any[]){const matches=[] as any[];let total=0;for(const file of files.filter(sourceInspectable).slice(0,12)){try{const blob=await itSpecialistGithub(\`/git/blobs/\${encodeURIComponent(String(file.sha))}\`);if(blob?.encoding!=='base64'||typeof blob?.content!=='string')continue;const content=Buffer.from(blob.content.replace(/\\n/g,''),'base64').toString('utf8');if(!content||content.length>180000||total+content.length>180000)continue;total+=content.length;matches.push({path:file.path,sha:file.sha,size:file.size||content.length,area:file.area,content:content.slice(0,60000)})}catch{}}return matches;}\n\n${contextFn}`;
if(knowledge.includes(contextFn)&&!knowledge.includes('async function loadSourceMatches'))knowledge=knowledge.replace(contextFn,sourceHelper);
must(knowledge.includes('async function loadSourceMatches'),'Repository source-inspection helper anchor changed');
const fileMatchesLine="  const fileMatches=(Array.isArray(map.files)?map.files:[]).map((file:any)=>{const hay=`${file.path} ${file.area}`.toLowerCase();let score=0;for(const term of terms)if(hay.includes(term))score+=8;if(['IT_SUPPORT','FRONTEND','BACKEND','BUILD_TOOLING','CI_GOVERNANCE'].includes(file.area))score+=1;return{...file,score}}).sort((a:any,b:any)=>b.score-a.score||String(a.path).localeCompare(String(b.path))).slice(0,140);";
if(knowledge.includes(fileMatchesLine)&&!knowledge.includes('const sourceMatches=await loadSourceMatches'))knowledge=knowledge.replace(fileMatchesLine,`${fileMatchesLine}\n  const sourceMatches=await loadSourceMatches(fileMatches.filter((file:any)=>file.score>0));`);
must(knowledge.includes('const sourceMatches=await loadSourceMatches'),'Repository sourceMatches anchor changed');
const returnOld="return{repository:repoName(),baseBranch:baseBranch(),headSha:mapRow?.headSha||'',areas:map.areas||{},services:map.services||[],fileMatches,approvedWorkMatches:workMatches,approvedEvidenceCount:workMatches.length,refreshedAt:mapRow?.refreshedAt||null};";
const returnNew="return{repository:repoName(),baseBranch:baseBranch(),headSha:mapRow?.headSha||'',fileCount:Array.isArray(map.files)?map.files.length:0,areas:map.areas||{},extensionCounts:map.extensionCounts||{},topLevelCounts:map.topLevelCounts||{},services:map.services||[],fileMatches,sourceMatches,approvedWorkMatches:workMatches,approvedEvidenceCount:workMatches.length,refreshedAt:mapRow?.refreshedAt||null};";
if(knowledge.includes(returnOld))knowledge=knowledge.replace(returnOld,returnNew);
else must(knowledge.includes('extensionCounts:map.extensionCounts||{}'),'Repository enriched-context return anchor changed');
await writeFile(knowledgePath,knowledge,'utf8');

// Live UI: keep the working trace alive through CI/merge/deploy and only render
// the final assistant bubble after production-green evidence arrives.
const uiPath=path.join(root,'assets','it-agent-conversational-ui.js');
let ui=await readFile(uiPath,'utf8');
const resultDetailOld="    if(worker.prNumber){\n      const branch=clean(worker.branch,180),commit=clean(worker.commitSha,80);\n      return `PR #${worker.prNumber}${branch?` · ${branch}`:''}${commit?` · commit ${commit.slice(0,12)}`:''}`;\n    }";
const resultDetailNew="    if(result.release&&typeof result.release==='object'){const release=result.release;const pr=release.prNumber?`PR #${release.prNumber}`:'';const merge=release.mergeSha?` · merge ${clean(release.mergeSha,80).slice(0,12)}`:'';return `${pr}${merge}`.trim()}\n${resultDetailOld}";
if(ui.includes(resultDetailOld)&&!ui.includes("result.release&&typeof result.release==='object'"))ui=ui.replace(resultDetailOld,resultDetailNew);

const renderAnchor="  function processAction(activity,action){";
const renderHelper=`  function renderDeferredFinal(activity,text){const value=clean(text,12000);if(!activity||!value||activity.finalRendered)return;const container=chat();if(!container)return;const bubble=document.createElement('div');bubble.className='bubble agent';bubble.dataset.itOwnerReleaseFinal='1';bubble.textContent=value;container.appendChild(bubble);activity.finalRendered=true;scrollToWork(bubble);}\n\n${renderAnchor}`;
if(ui.includes(renderAnchor)&&!ui.includes('function renderDeferredFinal'))ui=ui.replace(renderAnchor,renderHelper);
must(ui.includes('function renderDeferredFinal'),'Live owner-release final renderer anchor changed');

const statusOld="    if(status==='IN_PROGRESS'){\n      upsertStep(activity,`state:${id}`,type==='REQUEST_CODE_CHANGE'?'Trusted coding worker is running':`Executing ${actionName(type)}`,'running',type==='REQUEST_CODE_CHANGE'?'The approved PR-only worker is operating against release/sulandra-1.0.':'Sulandra has not returned final execution evidence yet.');\n    }else if(status==='PR_OPEN'){\n      upsertStep(activity,`state:${id}`,'Trusted coding worker opened a pull request','done',resultDetail(action)||'PR evidence was returned by the coding worker.');\n    }else if(status==='EXECUTED'||status==='DONE'){\n      upsertStep(activity,`state:${id}`,`${actionName(type)} execution completed`,'done',resultDetail(action)||'The action record contains completed execution evidence.');";
const statusNew="    if(status==='IN_PROGRESS'){\n      upsertStep(activity,`state:${id}`,type==='REQUEST_CODE_CHANGE'?'Trusted coding worker is running':`Executing ${actionName(type)}`,'running',type==='REQUEST_CODE_CHANGE'?'The approved PR-only worker is operating against release/sulandra-1.0.':'Sulandra has not returned final execution evidence yet.');\n    }else if(status==='PR_OPEN'){\n      upsertStep(activity,`state:${id}`,'Trusted coding worker opened a pull request','done',resultDetail(action)||'PR evidence was returned by the coding worker.');\n    }else if(status==='WAITING_CI'){\n      const release=action?.result?.release||{};upsertStep(activity,`pr:${id}`,'Trusted coding worker opened a pull request','done',resultDetail(action)||'The PR is open on release/sulandra-1.0.');upsertStep(activity,`gates:${id}`,'Checking required GitHub gates','running',clean(release.gateReason||release.message,700)||'CI, Disaster Recovery, Production Role UAT, and triggered section gates must pass before merge.');\n    }else if(status==='DEPLOYING'){\n      const release=action?.result?.release||{};upsertStep(activity,`gates:${id}`,'Required GitHub gates passed','done',clean(release.gateReason,700)||'Validation is green.');upsertStep(activity,`merge:${id}`,'Merged into release/sulandra-1.0','done',release.mergeSha?`Merge commit ${clean(release.mergeSha,80).slice(0,12)}`:'The approved release merge completed.');upsertStep(activity,`deploy:${id}`,'Railway is deploying and being verified','running','Sulandra is waiting for the Static Website and both APIs to report the exact merged commit.');\n    }else if(status==='EXECUTED'||status==='DONE'){\n      const release=action?.result?.release||{};if(type==='REQUEST_CODE_CHANGE'&&String(release.phase||'')==='PRODUCTION_GREEN'){upsertStep(activity,`deploy:${id}`,'All three Railway production services are green','done',release.mergeSha?`Verified exact commit ${clean(release.mergeSha,80).slice(0,12)} on Static Website + both APIs.`:'Exact production evidence is green.');renderDeferredFinal(activity,action?.result?.finalReply||'');setTimeout(()=>finishActivity(activity,'Sulandra IT Agent finished'),50)}else upsertStep(activity,`state:${id}`,`${actionName(type)} execution completed`,'done',resultDetail(action)||'The action record contains completed execution evidence.');";
if(ui.includes(statusOld))ui=ui.replace(statusOld,statusNew);
else must(ui.includes("status==='WAITING_CI'"),'Live owner-release state display anchor changed');

const processData="    const data=payload?.data??payload??{};";
if(ui.includes(processData)&&!ui.includes('activity.deferred=Boolean(data.deferred)'))ui=ui.replace(processData,`${processData}\n    activity.deferred=Boolean(data.deferred);`);
const resultStep="    upsertStep(activity,'result','Final result returned by Sulandra','done',activity.kind==='execute'?'Action Center received the execution result.':'The completed response is being added to the conversation.');";
if(ui.includes(resultStep))ui=ui.replace(resultStep,`    if(activity.deferred){upsertStep(activity,'result','Release workflow continues','running','The final assistant response is deferred until CI, merge, Railway deployment, and exact production verification succeed.');return;}\n${resultStep}`);
const finishOld="          if(executeRequest)finishActivity(activity,'Execution activity complete');\n          else setTimeout(()=>{if(activity&&!activity.finished)finishActivity(activity,'Sulandra IT Agent finished')},4000);";
const finishNew="          if(executeRequest&&!activity.deferred)finishActivity(activity,'Execution activity complete');\n          else if(!activity.deferred)setTimeout(()=>{if(activity&&!activity.finished)finishActivity(activity,'Sulandra IT Agent finished')},4000);";
if(ui.includes(finishOld))ui=ui.replace(finishOld,finishNew);
else must(ui.includes("else if(!activity.deferred)setTimeout"),'Live owner-release deferred finish anchor changed');
await writeFile(uiPath,ui,'utf8');

await import('./verify-it-agent-owner-autorelease.mjs');
console.log('IT Agent owner auto-release installed: authenticated owner requests can authorize PR-only work, live activity follows CI -> merge -> Railway exact-commit verification, and repository context includes exact inventory plus bounded source reads.');
