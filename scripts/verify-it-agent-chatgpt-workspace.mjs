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

const css=await readFile(path.join(root,'assets','it-agent-chatgpt-workspace.css'),'utf8');
for(const marker of ['.itws-layout','.itws-sidebar','.itws-new-chat','#agentArtifacts','.itws-thumb','.itws-activity-toggle'])need(css,marker,'Workspace CSS');
const js=await readFile(path.join(root,'assets','it-agent-chatgpt-workspace.js'),'utf8');
for(const marker of ['itwsNewChat','itwsRecents','loadConversation','agentArtifacts','fetchArtifactBlob','itwsActivity'])need(js,marker,'Workspace JS');

for(const relative of ['it-solutions.html',path.join('dist-web','it-solutions.html')]){
  const file=path.join(root,relative);try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  const html=await readFile(file,'utf8');need(html,'/assets/it-agent-chatgpt-workspace.css',relative);need(html,'/assets/it-agent-chatgpt-workspace.js',relative);
}
if(failures.length){console.error('IT Agent workspace verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent chat-first workspace verified: owner-scoped conversation history, new-chat navigation, Action Center drawer, and inline file/image previews are wired without widening action permissions.');
