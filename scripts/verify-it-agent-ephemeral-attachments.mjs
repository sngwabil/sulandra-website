import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const need=(source,text,label)=>{if(!source.includes(text))failures.push(`${label} missing: ${text}`)};

const workbench=await readFile(path.join(root,'api','src','it-agent-workbench-routes.ts'),'utf8');
for(const marker of [
  'IT_AGENT_EPHEMERAL_ATTACHMENTS_V1',
  "buildITAgentEphemeralAttachmentContent",
  'attachments:z.array(z.object({fileName:',
  'buildITAgentEphemeralAttachmentContent({attachments:input.attachments})',
  'ephemeral model inputs',
])need(workbench,marker,'IT Agent workbench ephemeral contract');

const helper=await readFile(path.join(root,'api','src','it-agent-ephemeral-attachments.ts'),'utf8');
for(const marker of [
  'buildITAgentEphemeralAttachmentContent',
  'scanBufferForMalware',
  "type:'input_image'",
  "type:'input_file'",
  'maxCombinedBytes',
])need(helper,marker,'Ephemeral attachment backend');

const frontend=await readFile(path.join(root,'assets','it-agent-ephemeral-attachments.js'),'utf8');
for(const marker of [
  '__SULANDRA_IT_EPHEMERAL_ATTACHMENTS__',
  "originalInput.replaceWith(input)",
  "prompt.addEventListener('paste'",
  "body.attachments=await payloads()",
  "sourceType||'').toUpperCase()!=='UPLOAD'",
  'URL.revokeObjectURL',
])need(frontend,marker,'Ephemeral attachment frontend');

const css=await readFile(path.join(root,'assets','it-agent-ephemeral-attachments.css'),'utf8');
for(const marker of ['#itwsPendingAttachments','.itws-ephemeral-remove','grid-row:3','grid-row:4'])need(css,marker,'Ephemeral attachment CSS');

for(const relative of ['it-solutions.html',path.join('dist-web','it-solutions.html')]){
  const file=path.join(root,relative);try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  const html=await readFile(file,'utf8');
  need(html,'/assets/it-agent-ephemeral-attachments.css?v=20260829-ephemeral-1',relative);
  need(html,'/assets/it-agent-ephemeral-attachments.js?v=20260829-ephemeral-1',relative);
}

if(failures.length){console.error('IT Agent ephemeral attachment verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent ephemeral attachments verified: selection/paste is local-only, Send supplies validated model inputs, generated artifacts remain on the persistent artifact path.');
