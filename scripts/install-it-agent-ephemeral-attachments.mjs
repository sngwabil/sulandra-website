import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const marker='IT_AGENT_EPHEMERAL_ATTACHMENTS_V1';
const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let workbench=await readFile(workbenchPath,'utf8');

const helperImport="import { buildITAgentEphemeralAttachmentContent } from './it-agent-ephemeral-attachments.js';";
if(!workbench.includes(helperImport)){
  const anchor="import { buildITAgentAttachmentContent } from './it-agent-artifact-routes.js';";
  if(!workbench.includes(anchor))throw new Error('Ephemeral attachment helper import anchor changed');
  workbench=workbench.replace(anchor,`${anchor}\n${helperImport}`);
}

const artifactSchema="const chatSchema=z.object({conversationId:z.string().uuid().optional(),message:z.string().trim().min(1).max(12000),attachmentIds:z.array(z.string().uuid()).max(8).optional().default([])});";
const ephemeralSchema="const chatSchema=z.object({conversationId:z.string().uuid().optional(),message:z.string().trim().min(1).max(12000),attachmentIds:z.array(z.string().uuid()).max(8).optional().default([]),attachments:z.array(z.object({fileName:z.string().trim().min(1).max(220),mimeType:z.string().trim().min(1).max(160),fileDataBase64:z.string().min(1).max(22000000)})).max(8).optional().default([])});";
if(workbench.includes(artifactSchema))workbench=workbench.replace(artifactSchema,ephemeralSchema);
else if(!workbench.includes('attachments:z.array(z.object({fileName:'))throw new Error('Ephemeral chat-schema anchor changed');

const artifactCall="const attachmentParts=await buildITAgentAttachmentContent(prisma,{organizationId:auth.organizationId,conversationId:conversationId as string,artifactIds:input.attachmentIds});const knowledge=await knowledgeFor(input.message);const payload=await askOpenAI(history,await context(auth,knowledge),attachmentParts);";
const ephemeralCall="const [storedAttachmentParts,ephemeralAttachmentParts]=await Promise.all([buildITAgentAttachmentContent(prisma,{organizationId:auth.organizationId,conversationId:conversationId as string,artifactIds:input.attachmentIds}),buildITAgentEphemeralAttachmentContent({attachments:input.attachments})]);const attachmentParts=[...storedAttachmentParts,...ephemeralAttachmentParts];const knowledge=await knowledgeFor(input.message);const payload=await askOpenAI(history,await context(auth,knowledge),attachmentParts);";
if(workbench.includes(artifactCall))workbench=workbench.replace(artifactCall,ephemeralCall);
else if(!workbench.includes('buildITAgentEphemeralAttachmentContent({attachments:input.attachments})'))throw new Error('Ephemeral reasoning-call anchor changed');

const oldInstruction='Uploaded files and images selected by the Administrator are trusted conversation-scoped attachments after Sulandra authorization/storage checks. Inspect supplied image/file inputs when they are attached to the current turn.';
const newInstruction='Administrator-supplied files and images for the current chat turn are ephemeral model inputs: validate and inspect them for that request without claiming they were stored as Sulandra artifacts. Persist only artifacts Sulandra itself generates or content the administrator explicitly asks to save. Inspect supplied image/file inputs when they are attached to the current turn.';
if(workbench.includes(oldInstruction))workbench=workbench.replace(oldInstruction,newInstruction);
else if(!workbench.includes('Administrator-supplied files and images for the current chat turn are ephemeral model inputs'))throw new Error('Ephemeral attachment reasoning instruction anchor changed');

if(!workbench.includes(marker))workbench=workbench.replace('export function registerITAgentWorkbenchRoutes',`/* ${marker} */\nexport function registerITAgentWorkbenchRoutes`);
await writeFile(workbenchPath,workbench,'utf8');

const cssTag='<link rel="stylesheet" href="/assets/it-agent-ephemeral-attachments.css?v=20260829-ephemeral-1">';
const jsTag='<script src="/assets/it-agent-ephemeral-attachments.js?v=20260829-ephemeral-1"></script>';
for(const relative of ['it-solutions.html',path.join('dist-web','it-solutions.html')]){
  const file=path.join(root,relative);try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  let html=await readFile(file,'utf8');
  html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-ephemeral-attachments\.css(?:\?v=[^"']+)?">\s*/g,'\n');
  html=html.replace(/\s*<script src="\/assets\/it-agent-ephemeral-attachments\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
  if(!html.includes('</head>')||!html.includes('</body>'))throw new Error(`${relative} ephemeral attachment publication anchors changed`);
  html=html.replace('</head>',`${cssTag}</head>`);
  html=html.replace('</body>',`${jsTag}</body>`);
  await writeFile(file,html,'utf8');
}

await import('./verify-it-agent-ephemeral-attachments.mjs');
console.log('IT Agent ephemeral attachments installed: file picker and clipboard images stay local until Send, enter one model request, and do not create persistent upload artifacts.');
