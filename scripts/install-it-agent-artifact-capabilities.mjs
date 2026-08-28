import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const marker='IT_AGENT_ARTIFACT_CAPABILITIES_V1';

const workbenchPath=path.join(root,'api','src','it-agent-workbench-routes.ts');
let workbench=await readFile(workbenchPath,'utf8');

const artifactImport="import { buildITAgentAttachmentContent } from './it-agent-artifact-routes.js';";
if(!workbench.includes(artifactImport)){
  const anchor="import { getITSpecialistKnowledgeContext } from './it-specialist-knowledge.js';";
  if(!workbench.includes(anchor))throw new Error('IT Agent artifact import anchor changed');
  workbench=workbench.replace(anchor,`${anchor}\n${artifactImport}`);
}

if(!workbench.includes("'SEND_EXTERNAL_EMAIL'")){
  workbench=workbench.replace(/type AgentActionType=([^;]+);/,(_,union)=>`type AgentActionType=${union}|'SEND_EXTERNAL_EMAIL'|'CREATE_PDF'|'GENERATE_IMAGE';`);
}

const oldChatSchema="const chatSchema=z.object({conversationId:z.string().uuid().optional(),message:z.string().trim().min(1).max(12000)});";
const newChatSchema="const chatSchema=z.object({conversationId:z.string().uuid().optional(),message:z.string().trim().min(1).max(12000),attachmentIds:z.array(z.string().uuid()).max(8).optional().default([])});";
if(workbench.includes(oldChatSchema))workbench=workbench.replace(oldChatSchema,newChatSchema);
else if(!workbench.includes('attachmentIds:z.array(z.string().uuid()).max(8)'))throw new Error('IT Agent attachment chat-schema anchor changed');

if(!workbench.includes("name==='send_external_email'")){
  const policyAnchor="const actionPolicy=(name:string,args:Record<string,unknown>,knowledge:KnowledgeContext)=>{\n";
  if(!workbench.includes(policyAnchor))throw new Error('IT Agent action-policy anchor changed');
  const policies=[
    "  if(name==='send_external_email')return{actionType:'SEND_EXTERNAL_EMAIL' as AgentActionType,risk:'MEDIUM',changeClass:'ADMIN_COMMUNICATION',approvalRequired:false,summary:`Send external email: ${clean(args.subject,180)}`,evidenceCount:0,safetyEscalated:false};",
    "  if(name==='create_pdf')return{actionType:'CREATE_PDF' as AgentActionType,risk:'LOW',changeClass:'CONTENT_GENERATION',approvalRequired:false,summary:`Create PDF: ${clean(args.title||args.fileName,180)}`,evidenceCount:0,safetyEscalated:false};",
    "  if(name==='generate_image')return{actionType:'GENERATE_IMAGE' as AgentActionType,risk:'LOW',changeClass:'CONTENT_GENERATION',approvalRequired:false,summary:`Create image: ${clean(args.fileName||args.prompt,180)}`,evidenceCount:0,safetyEscalated:false};",
  ].join('\n');
  workbench=workbench.replace(policyAnchor,`${policyAnchor}${policies}\n`);
}

if(!workbench.includes("name:'send_external_email'")){
  const toolAnchor="  {type:'function',name:'request_code_change'";
  if(!workbench.includes(toolAnchor))throw new Error('IT Agent artifact tool anchor changed');
  const tools=[
    "  {type:'function',name:'send_external_email',description:'Send an email through Sulandra SMTP to external email addresses explicitly supplied by the authenticated administrator. Never guess recipient addresses or substitute employee-directory recipients. External messages are rate-limited and audited.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{recipients:{type:'array',items:{type:'string'},minItems:1,maxItems:50},subject:{type:'string'},message:{type:'string'}},required:['recipients','subject','message']}},",
    "  {type:'function',name:'create_pdf',description:'Create a downloadable PDF artifact in the current Administrator IT Agent conversation. Use when the administrator asks for a PDF, printable document, memo, checklist, handout, report, or similar file. This creates the file but does not publish or email it unless separately requested.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{title:{type:'string'},fileName:{type:'string'},content:{type:'string'}},required:['title','fileName','content']}},",
    "  {type:'function',name:'generate_image',description:'Create a standalone original image artifact in the current Administrator IT Agent conversation with GPT Image 2. Use for posters, internal graphics, illustrations, draft visual assets, and images that should be reviewed/downloaded rather than immediately published.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{prompt:{type:'string'},fileName:{type:'string'},size:{type:'string',enum:['1024x1024','1536x1024','1024x1536']}},required:['prompt','fileName','size']}},",
  ].join('\n');
  workbench=workbench.replace(toolAnchor,`${tools}\n${toolAnchor}`);
}

const instructionAnchor='For employee training/education, never use request_code_change merely because a new training item is being created.';
const artifactInstruction='Uploaded files and images selected by the Administrator are trusted conversation-scoped attachments after Sulandra authorization/storage checks. Inspect supplied image/file inputs when they are attached to the current turn. Use send_external_email only for explicit external addresses, create_pdf for downloadable PDFs, and generate_image for standalone image artifacts. Never invent an attachment, recipient, PDF, or image result; wait for trusted execution evidence.';
if(!workbench.includes('Uploaded files and images selected by the Administrator')){
  const target=workbench.includes(instructionAnchor)?instructionAnchor:'For code/system work, reason explicitly about whether this is an ESTABLISHED_OPERATION_REPAIR or a NEW_SYSTEM_CHANGE.';
  if(!workbench.includes(target))throw new Error('IT Agent artifact reasoning-instruction anchor changed');
  workbench=workbench.replace(target,`${artifactInstruction}\\n\\n${target}`);
}

const oldAsk="async function askOpenAI(history:Array<{role:string;content:string}>,context:string){";
const newAsk="async function askOpenAI(history:Array<{role:string;content:string}>,context:string,attachmentParts:Array<Record<string,unknown>>=[]){";
if(workbench.includes(oldAsk))workbench=workbench.replace(oldAsk,newAsk);
else if(!workbench.includes('attachmentParts:Array<Record<string,unknown>>=[]'))throw new Error('IT Agent attachment askOpenAI signature anchor changed');

const fixedHistory="input:history.map(item=>({role:item.role,content:[{type:item.role==='assistant'?'output_text':'input_text',text:redact(item.content)}]})),";
const attachmentHistory="input:history.map((item,index)=>({role:item.role,content:[{type:item.role==='assistant'?'output_text':'input_text',text:redact(item.content)},...(index===history.length-1&&item.role==='user'?attachmentParts:[])]})),";
if(workbench.includes(fixedHistory))workbench=workbench.replace(fixedHistory,attachmentHistory);
else if(!workbench.includes('index===history.length-1&&item.role===\'user\'?attachmentParts'))throw new Error('IT Agent multimodal-history anchor changed');

const knowledgeCall="const knowledge=await knowledgeFor(input.message);const payload=await askOpenAI(history,await context(auth,knowledge));";
const attachmentCall="const attachmentParts=await buildITAgentAttachmentContent(prisma,{organizationId:auth.organizationId,conversationId:conversationId as string,artifactIds:input.attachmentIds});const knowledge=await knowledgeFor(input.message);const payload=await askOpenAI(history,await context(auth,knowledge),attachmentParts);";
if(workbench.includes(knowledgeCall))workbench=workbench.replace(knowledgeCall,attachmentCall);
else if(!workbench.includes('buildITAgentAttachmentContent(prisma'))throw new Error('IT Agent attachment reasoning-call anchor changed');

if(!workbench.includes('externalEmail:true')){
  const capAnchor='email:Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS),';
  if(!workbench.includes(capAnchor))throw new Error('IT Agent capability-status anchor changed');
  workbench=workbench.replace(capAnchor,`${capAnchor}externalEmail:Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS),fileUpload:true,pdfCreation:true,imageCreation:Boolean(openAIKey()),`);
}

if(!workbench.includes(`/* ${marker} */`))workbench=workbench.replace('export function registerITAgentWorkbenchRoutes',`/* ${marker} */\nexport function registerITAgentWorkbenchRoutes`);
await writeFile(workbenchPath,workbench,'utf8');

const executorPath=path.join(root,'api','src','it-agent-routine-executor.ts');
let executor=await readFile(executorPath,'utf8');
const artifactExecutorImport="import { executeITAgentArtifactRoutineAction, isITAgentArtifactRoutineAction } from './it-agent-artifact-routes.js';";
if(!executor.includes(artifactExecutorImport)){
  const anchor="import { putSecureObject } from './secure-object-storage.js';";
  if(!executor.includes(anchor))throw new Error('Routine executor artifact import anchor changed');
  executor=executor.replace(anchor,`${anchor}\n${artifactExecutorImport}`);
}
const oldRoutineCheck="export const isRoutineITAgentAction=(value:string)=>routineActionTypes.includes(value as RoutineActionType);";
const newRoutineCheck="export const isRoutineITAgentAction=(value:string)=>routineActionTypes.includes(value as RoutineActionType)||isITAgentArtifactRoutineAction(value);";
if(executor.includes(oldRoutineCheck))executor=executor.replace(oldRoutineCheck,newRoutineCheck);
else if(!executor.includes('||isITAgentArtifactRoutineAction(value)'))throw new Error('Routine executor artifact allowlist anchor changed');
const executeAnchor="export async function executeRoutineITAgentAction(prisma:PrismaClient,input:Input){\n  if(!isRoutineITAgentAction(input.actionType))";
const executeWithArtifact="export async function executeRoutineITAgentAction(prisma:PrismaClient,input:Input){\n  if(isITAgentArtifactRoutineAction(input.actionType))return executeITAgentArtifactRoutineAction(prisma,input);\n  if(!isRoutineITAgentAction(input.actionType))";
if(executor.includes(executeAnchor))executor=executor.replace(executeAnchor,executeWithArtifact);
else if(!executor.includes('return executeITAgentArtifactRoutineAction(prisma,input)'))throw new Error('Routine executor artifact dispatch anchor changed');
await writeFile(executorPath,executor,'utf8');

const bootstrapPath=path.join(root,'api','src','onboarding-bootstrap.ts');
let bootstrap=await readFile(bootstrapPath,'utf8');
const workbenchImport="import { registerITAgentWorkbenchRoutes } from './it-agent-workbench-routes.js';";
const artifactRouteImport="import { registerITAgentArtifactRoutes } from './it-agent-artifact-routes.js';";
if(!bootstrap.includes(artifactRouteImport)){
  if(!bootstrap.includes(workbenchImport))throw new Error('IT Agent artifact bootstrap import anchor changed');
  bootstrap=bootstrap.replace(workbenchImport,`${workbenchImport}\n${artifactRouteImport}`);
}
const workbenchRegister='registerITAgentWorkbenchRoutes({ app, prisma, authOf, requireRoles });';
const artifactRegister='registerITAgentArtifactRoutes({ app, prisma, authOf, requireRoles, adminRoles });';
bootstrap=bootstrap.replace(new RegExp(`\\n?${artifactRegister.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\n?`,'g'),'\n');
if(!bootstrap.includes(workbenchRegister))throw new Error('IT Agent artifact bootstrap registration anchor changed');
bootstrap=bootstrap.replace(workbenchRegister,`${workbenchRegister}\n${artifactRegister}`);
await writeFile(bootstrapPath,bootstrap,'utf8');

async function patchPortal(relativePath){
  const file=path.join(root,relativePath);try{await access(file)}catch(error){if(error?.code==='ENOENT')return;throw error}
  let html=await readFile(file,'utf8');
  if(!html.includes('id="agentFileInput"')){
    const compose='<div class="agent-compose"><textarea id="agentPrompt" placeholder="Example: Create an intranet card titled \'Training Reminder\' and link it to the Education Portal…"></textarea><button id="agentSend" class="btn">Ask IT Agent</button></div>';
    const enhanced=`${compose}\n    <div class="artifact-toolbar"><button id="agentAttach" class="btn secondary" type="button">Attach files / images</button><input id="agentFileInput" type="file" multiple hidden><span id="artifactUploadStatus" class="note"></span></div><div id="agentArtifacts" class="artifact-list"><p class="note">No files attached.</p></div>`;
    if(!html.includes(compose))throw new Error(`${relativePath} artifact composer anchor changed`);
    html=html.replace(compose,enhanced);
  }
  if(!html.includes('.artifact-toolbar{'))html=html.replace('.spinner{display:inline-block',`.artifact-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:9px}.artifact-list{display:grid;gap:7px;margin-top:9px}.artifact-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid #d8e3ec;border-radius:10px;background:#fff;padding:8px 10px;font-size:12px}.artifact-row.selected{border-color:#0b6fb8;background:#f0f8ff}.artifact-row strong{max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.artifact-row .spacer{flex:1}.artifact-mini{border:1px solid #cbd9e5;border-radius:7px;background:#fff;padding:5px 8px;cursor:pointer;color:#17476e;font-weight:700}.artifact-mini.danger{color:#a22b2b}.spinner{display:inline-block`);
  if(!html.includes('External email</span><strong id="capExternalEmail"'))html=html.replace('<div class="cap"><span>GitHub code execution</span><strong id="capCode">—</strong></div>',`<div class="cap"><span>External email</span><strong id="capExternalEmail">—</strong></div><div class="cap"><span>Files &amp; image uploads</span><strong id="capUploads">—</strong></div><div class="cap"><span>PDF creation</span><strong id="capPdf">—</strong></div><div class="cap"><span>Standalone image creation</span><strong id="capGeneratedImage">—</strong></div><div class="cap"><span>GitHub code execution</span><strong id="capCode">—</strong></div>`);
  if(!html.includes('Create a downloadable PDF'))html=html.replace('<button class="example">Add a new button next to Operations in the Admin Command Center.</button>',`<button class="example">Email vendor@example.com that our administrator will follow up tomorrow.</button><button class="example">Create a downloadable PDF checklist for tomorrow’s staff meeting.</button><button class="example">Generate an original landscape image for an internal safety poster.</button><button class="example">Add a new button next to Operations in the Admin Command Center.</button>`);
  if(!html.includes('let selectedArtifactIds='))html=html.replace("let conversationId=sessionStorage.getItem('sulandra:it-agent:conversation')||'';",`let conversationId=sessionStorage.getItem('sulandra:it-agent:conversation')||'';\nlet selectedArtifactIds=[];let artifactRows=[];`);
  if(!html.includes('async function uploadArtifacts(files)')){
    const insertBefore='async function sendAgent(){';
    if(!html.includes(insertBefore))throw new Error(`${relativePath} artifact upload JS anchor changed`);
    const code=`function bytesLabel(value){const n=Number(value||0);return n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B'}\nfunction fileBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||'').split(',').pop()||'');reader.onerror=()=>reject(reader.error||new Error('Unable to read file'));reader.readAsDataURL(file)})}\nfunction renderArtifacts(){if(!agentArtifacts)return;const rows=Array.isArray(artifactRows)?artifactRows:[];if(!rows.length){agentArtifacts.innerHTML='<p class="note">No files attached.</p>';return}agentArtifacts.innerHTML=rows.map(a=>{const selected=selectedArtifactIds.includes(a.id);return \`<div class="artifact-row \${selected?'selected':''}" data-artifact="\${esc(a.id)}"><strong>\${esc(a.fileName)}</strong><span>\${esc(bytesLabel(a.sizeBytes))}</span><span class="pill">\${esc(a.sourceType||'UPLOAD')}</span><span class="pill">\${esc(a.scanStatus||'')}</span><span class="spacer"></span><button class="artifact-mini" data-select-artifact="\${esc(a.id)}">\${selected?'Attached':'Use in chat'}</button><button class="artifact-mini" data-open-artifact="\${esc(a.id)}">Open</button><button class="artifact-mini" data-download-artifact="\${esc(a.id)}">Download</button><button class="artifact-mini danger" data-delete-artifact="\${esc(a.id)}">Delete</button></div>\`}).join('');agentArtifacts.querySelectorAll('[data-select-artifact]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.selectArtifact;selectedArtifactIds=selectedArtifactIds.includes(id)?selectedArtifactIds.filter(x=>x!==id):[...selectedArtifactIds,id].slice(-8);renderArtifacts()});agentArtifacts.querySelectorAll('[data-open-artifact]').forEach(btn=>btn.onclick=()=>openArtifact(btn.dataset.openArtifact,false));agentArtifacts.querySelectorAll('[data-download-artifact]').forEach(btn=>btn.onclick=()=>openArtifact(btn.dataset.downloadArtifact,true));agentArtifacts.querySelectorAll('[data-delete-artifact]').forEach(btn=>btn.onclick=()=>deleteArtifact(btn.dataset.deleteArtifact))}\nasync function loadArtifacts(){if(!conversationId){artifactRows=[];renderArtifacts();return}try{const data=await api('/api/it-solutions/agent/artifacts?conversationId='+encodeURIComponent(conversationId));artifactRows=data.artifacts||[];selectedArtifactIds=selectedArtifactIds.filter(id=>artifactRows.some(a=>a.id===id));renderArtifacts()}catch(error){artifactUploadStatus.textContent=error.message}}\nasync function uploadArtifacts(files){const list=[...(files||[])];if(!list.length)return;agentAttach.disabled=true;artifactUploadStatus.textContent='Uploading…';try{for(const file of list){if(file.size>25*1024*1024)throw new Error(file.name+' exceeds the 25 MB upload limit.');const data=await api('/api/it-solutions/agent/artifacts/upload',{method:'POST',body:JSON.stringify({conversationId:conversationId||undefined,fileName:file.name,mimeType:file.type||'application/octet-stream',fileDataBase64:await fileBase64(file),purpose:'IT_AGENT_CHAT_ATTACHMENT'})});conversationId=data.conversationId||conversationId;if(conversationId)sessionStorage.setItem('sulandra:it-agent:conversation',conversationId);selectedArtifactIds=[...new Set([...selectedArtifactIds,data.id])].slice(-8)}await loadArtifacts();artifactUploadStatus.textContent=list.length===1?'File uploaded and attached.':list.length+' files uploaded and attached.'}catch(error){artifactUploadStatus.textContent='Upload failed: '+error.message}finally{agentAttach.disabled=false;agentFileInput.value=''}}\nasync function fetchArtifactBlob(id,download=false){const row=artifactRows.find(a=>a.id===id);if(!row)throw new Error('Artifact not found');const response=await fetch(API+(download?row.downloadUrl:row.url),{headers:{Authorization:'Bearer '+token(),...companyHeaders()}});if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||payload.message||'Artifact request failed')}return{row,blob:await response.blob()}}\nasync function openArtifact(id,download){try{const {row,blob}=await fetchArtifactBlob(id,download);const url=URL.createObjectURL(blob);if(download){const a=document.createElement('a');a.href=url;a.download=row.fileName||'download';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}else{window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)}}catch(error){artifactUploadStatus.textContent=error.message}}\nasync function deleteArtifact(id){if(!confirm('Delete this IT Agent file?'))return;try{await api('/api/it-solutions/agent/artifacts/'+encodeURIComponent(id),{method:'DELETE'});selectedArtifactIds=selectedArtifactIds.filter(x=>x!==id);await loadArtifacts();artifactUploadStatus.textContent='File deleted.'}catch(error){artifactUploadStatus.textContent='Delete failed: '+error.message}}\nagentAttach.onclick=()=>agentFileInput.click();agentFileInput.onchange=()=>uploadArtifacts(agentFileInput.files);\n`;
    html=html.replace(insertBefore,`${code}${insertBefore}`);
  }
  const oldChatBody="body:JSON.stringify({conversationId:conversationId||undefined,message})";
  const newChatBody="body:JSON.stringify({conversationId:conversationId||undefined,message,attachmentIds:selectedArtifactIds})";
  if(html.includes(oldChatBody))html=html.replace(oldChatBody,newChatBody);
  else if(!html.includes('attachmentIds:selectedArtifactIds'))throw new Error(`${relativePath} attachment chat-send anchor changed`);
  html=html.replace('await loadActions()}catch(error){bubble(\'agent\',\'IT Agent error: \'+error.message)}finally','await Promise.all([loadActions(),loadArtifacts()])}catch(error){bubble(\'agent\',\'IT Agent error: \'+error.message)}finally');
  if(!html.includes("capExternalEmail.textContent")){
    const capAnchor="capEmail.textContent=s.capabilities?.email?'REAL':'NOT CONFIGURED';capEmail.className=s.capabilities?.email?'ok':'bad';";
    if(!html.includes(capAnchor))throw new Error(`${relativePath} artifact capability UI anchor changed`);
    html=html.replace(capAnchor,`${capAnchor}capExternalEmail.textContent=s.capabilities?.externalEmail?'REAL':'NOT CONFIGURED';capExternalEmail.className=s.capabilities?.externalEmail?'ok':'bad';capUploads.textContent=s.capabilities?.fileUpload?'REAL':'UNAVAILABLE';capUploads.className=s.capabilities?.fileUpload?'ok':'bad';capPdf.textContent=s.capabilities?.pdfCreation?'REAL':'UNAVAILABLE';capPdf.className=s.capabilities?.pdfCreation?'ok':'bad';capGeneratedImage.textContent=s.capabilities?.imageCreation?'REAL':'NOT CONFIGURED';capGeneratedImage.className=s.capabilities?.imageCreation?'ok':'bad';`);
  }
  html=html.replace('else Promise.all([loadAgentStatus(),loadActions(),loadOverview()]);','else Promise.all([loadAgentStatus(),loadActions(),loadOverview(),loadArtifacts()]);');
  await writeFile(file,html,'utf8');
}
await patchPortal('it-solutions.html');
await patchPortal(path.join('dist-web','it-solutions.html'));

await import('./verify-it-agent-artifact-capabilities.mjs');
console.log('IT Agent artifact capabilities installed: explicit external email, secure file/image uploads, multimodal attachment reasoning, downloadable PDF creation, standalone image generation, artifact audit/download/delete, and existing PR-only code safety.');
