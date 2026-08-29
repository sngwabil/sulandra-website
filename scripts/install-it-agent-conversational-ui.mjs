import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const portalPath=path.join(root,'it-solutions.html');
const cssPath=path.join(root,'assets','it-agent-conversational-ui.css');
const jsPath=path.join(root,'assets','it-agent-conversational-ui.js');

await Promise.all([access(portalPath),access(cssPath),access(jsPath)]);
let html=await readFile(portalPath,'utf8');
const cssTag='<link rel="stylesheet" href="/assets/it-agent-conversational-ui.css?v=20260829-chat-1">';
const jsTag='<script src="/assets/it-agent-conversational-ui.js?v=20260829-chat-1"></script>';

if(!html.includes('/assets/it-agent-conversational-ui.css')){
  if(!html.includes('</head>'))throw new Error('IT Agent conversational UI head anchor changed');
  html=html.replace('</head>',`${cssTag}</head>`);
}
if(!html.includes('/assets/it-agent-conversational-ui.js')){
  if(!html.includes('</body>'))throw new Error('IT Agent conversational UI body anchor changed');
  html=html.replace('</body>',`${jsTag}</body>`);
}

for(const marker of ['Sulandra IT Agent','Action Center','Ask IT Agent','/assets/it-agent-conversational-ui.css','/assets/it-agent-conversational-ui.js']){
  if(!html.includes(marker))throw new Error(`IT Agent conversational UI missing ${marker}`);
}
await writeFile(portalPath,html,'utf8');
console.log('IT Agent conversational UI installed after canonical workbench augmentation: ChatGPT-style presentation plus safe live system activity.');
