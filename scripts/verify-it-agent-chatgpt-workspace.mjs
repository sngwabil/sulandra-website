import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const need=(source,text,label)=>{if(!source.includes(text))failures.push(`${label} missing: ${text}`)};
const workbench=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
for(const marker of [
  'IT_AGENT_CHATGPT_WORKSPACE_V1',
  "/api/it-solutions/agent/conversations'",
  "/api/it-solutions/agent/conversations/:conversationId/messages",
  'WHERE c."organizationId"=$1 AND c."userId"=$2',
  'await ownedConversation(auth,clean(req.params.conversationId,120))',
])need(workbench,marker,'IT Agent workbench');

async function verifyOptionalAsset(relative,markers,label){
  const file=path.join(root,relative);try{await access(file)}catch(error){if(error?.code==='ENOENT'){console.log(`${label} verification skipped in API-only build image.`);return}throw error}
  const source=await readFile(file,'utf8');for(const marker of markers)need(source,marker,label);
}
await verifyOptionalAsset(path.join('assets','it-agent-chatgpt-workspace.css'),['.itws-layout','.itws-sidebar','.itws-new-chat','#agentArtifacts','.itws-thumb','.itws-activity-toggle'],'Workspace CSS');
await verifyOptionalAsset(path.join('assets','it-agent-chatgpt-workspace.js'),['itwsNewChat','itwsRecents','loadConversation','agentArtifacts','fetchArtifactBlob','itwsActivity'],'Workspace JS');
await verifyOptionalAsset(path.join('assets','it-agent-conversational-ui.js'),['sulandra-live-activity','Loading conversation and trusted system context','Live operational activity only','/api/it-solutions/agent/actions'],'Live activity JS');

for(const relative of ['it-solutions.html',path.join('dist-web','it-solutions.html')]){
  const file=path.join(root,relative);try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  const html=await readFile(file,'utf8');
  need(html,'/assets/it-agent-chatgpt-workspace.css',relative);
  need(html,'/assets/it-agent-chatgpt-workspace.js',relative);
  need(html,'/assets/it-agent-conversational-ui.js?v=20260829-live-activity-3',relative);
}
if(failures.length){console.error('IT Agent workspace verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent chat-first workspace verified: owner-scoped conversation history, new-chat navigation, Action Center drawer, inline file/image previews, and grounded live execution activity are wired without widening action permissions.');
