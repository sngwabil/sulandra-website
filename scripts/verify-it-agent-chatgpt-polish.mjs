import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const need=(source,text,label)=>{if(!source.includes(text))failures.push(`${label} missing: ${text}`)};

const css=await readFile(path.join(root,'assets','it-agent-chatgpt-polish.css'),'utf8');
for(const marker of [
  '#agentArtifacts .artifact-row:not(.selected)',
  '.itws-action-drawer',
  'right:12px!important',
  'field-sizing:content',
  '#agentQuickActions{display:none!important}',
])need(css,marker,'Chat polish CSS');

const js=await readFile(path.join(root,'assets','it-agent-chatgpt-polish.js'),'utf8');
for(const marker of [
  'itws-action-drawer',
  'document.body.appendChild(drawer)',
  "if(typeof selectedArtifactIds!=='undefined')selectedArtifactIds=[]",
  'Remove from this message',
  "if(event.key!=='Escape')return",
])need(js,marker,'Chat polish JS');

for(const relative of ['it-solutions.html',path.join('dist-web','it-solutions.html')]){
  const file=path.join(root,relative);try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  const html=await readFile(file,'utf8');
  need(html,'/assets/it-agent-chatgpt-polish.css',relative);
  need(html,'/assets/it-agent-chatgpt-polish.js',relative);
}

if(failures.length){console.error('IT Agent chat polish verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('IT Agent chat polish verified: compact current-turn uploads, correct remove controls, right-edge Activity drawer, and successful-send attachment reset are present.');
