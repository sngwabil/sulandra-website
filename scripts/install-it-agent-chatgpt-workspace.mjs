import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const marker='IT_AGENT_CHATGPT_WORKSPACE_V1';
const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let workbench=await readFile(workbenchPath,'utf8');

if(!workbench.includes(marker)){
  const routeAnchor="  app.get('/api/it-solutions/agent/status',gate,async(_req,res,next)=>";
  if(!workbench.includes(routeAnchor))throw new Error('IT Agent workspace route anchor changed');
  const routes=`  /* ${marker}: read-only conversation history for the Administrator chat workspace. */\n  app.get('/api/it-solutions/agent/conversations',gate,async(_req,res,next)=>{try{await ready();const auth=authOf(res);const rows=await prisma.$queryRawUnsafe<Array<{id:string;title:string;status:string;createdAt:Date|string;updatedAt:Date|string;lastMessage:string|null;messageCount:number}>>(\`SELECT c."id",c."title",c."status",c."createdAt",c."updatedAt",(SELECT m."content" FROM "ITAgentMessage" m WHERE m."organizationId"=c."organizationId" AND m."conversationId"=c."id" ORDER BY m."createdAt" DESC LIMIT 1) AS "lastMessage",(SELECT COUNT(*)::int FROM "ITAgentMessage" m WHERE m."organizationId"=c."organizationId" AND m."conversationId"=c."id") AS "messageCount" FROM "ITAgentConversation" c WHERE c."organizationId"=$1 AND c."userId"=$2 ORDER BY c."updatedAt" DESC LIMIT 50\`,auth.organizationId,auth.userId);res.json({data:{conversations:rows}})}catch(error){next(error)}});\n\n  app.get('/api/it-solutions/agent/conversations/:conversationId/messages',gate,async(req,res,next)=>{try{await ready();const auth=authOf(res);const conversation=await ownedConversation(auth,clean(req.params.conversationId,120));if(!conversation)return void res.status(404).json({error:'IT Agent conversation was not found'});const messages=await prisma.$queryRawUnsafe<Array<{id:string;role:string;content:string;model:string|null;createdAt:Date|string}>>(\`SELECT "id","role","content","model","createdAt" FROM "ITAgentMessage" WHERE "organizationId"=$1 AND "conversationId"=$2 ORDER BY "createdAt" ASC LIMIT 250\`,auth.organizationId,conversation.id);res.json({data:{conversation:{id:conversation.id,title:conversation.title,status:conversation.status,createdAt:conversation.createdAt,updatedAt:conversation.updatedAt},messages}})}catch(error){next(error)}});\n\n`;
  workbench=workbench.replace(routeAnchor,`${routes}${routeAnchor}`);
}
await writeFile(workbenchPath,workbench,'utf8');

const cssTag='<link rel="stylesheet" href="/assets/it-agent-chatgpt-workspace.css?v=20260829-workspace-1"><style>body.it-chatgpt-workspace .itws-activity-toggle{display:block!important}body.it-chatgpt-workspace #agent .agent-status{right:108px!important}</style>';
const jsTag='<script src="/assets/it-agent-chatgpt-workspace.js?v=20260829-workspace-1"></script>';
const liveActivityTag='<script src="/assets/it-agent-conversational-ui.js?v=20260829-live-activity-3"></script>';
const actionCenterTabTag='<script src="/assets/it-agent-action-center-tab.js?v=20260829-action-tab-1"></script>';
for(const relative of ['it-solutions.html',path.join('dist-web','it-solutions.html')]){
  const file=path.join(root,relative);try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  let html=await readFile(file,'utf8');
  if(!html.includes('/assets/it-agent-chatgpt-workspace.css')){if(!html.includes('</head>'))throw new Error(`${relative} workspace head anchor changed`);html=html.replace('</head>',`${cssTag}</head>`)}
  html=html.replace(/\s*<script src="\/assets\/it-agent-conversational-ui\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
  html=html.replace(/\s*<script src="\/assets\/it-agent-action-center-tab\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
  if(!html.includes('/assets/it-agent-chatgpt-workspace.js')){if(!html.includes('</body>'))throw new Error(`${relative} workspace body anchor changed`);html=html.replace('</body>',`${jsTag}</body>`)}
  if(!html.includes('</body>'))throw new Error(`${relative} live-activity body anchor changed`);
  html=html.replace('</body>',`${liveActivityTag}${actionCenterTabTag}</body>`);
  await writeFile(file,html,'utf8');
}

await import('./verify-it-agent-chatgpt-workspace.mjs');
console.log('IT Agent chat-first workspace installed: persistent recent chats, New chat, left navigation, Action Center tab, inline attachment previews, and grounded live execution activity use the existing safe agent backend.');
