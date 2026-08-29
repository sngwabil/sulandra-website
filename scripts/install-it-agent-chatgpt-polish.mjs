import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cssTag='<link rel="stylesheet" href="/assets/it-agent-chatgpt-polish.css?v=20260829-polish-1">';
const jsTag='<script src="/assets/it-agent-chatgpt-polish.js?v=20260829-polish-1"></script>';

for(const relative of ['it-solutions.html',path.join('dist-web','it-solutions.html')]){
  const file=path.join(root,relative);
  try{await access(file)}catch(error){if(error?.code==='ENOENT')continue;throw error}
  let html=await readFile(file,'utf8');
  if(!html.includes('/assets/it-agent-chatgpt-polish.css')){
    if(!html.includes('</head>'))throw new Error(`${relative} chat polish head anchor changed`);
    html=html.replace('</head>',`${cssTag}</head>`);
  }
  if(!html.includes('/assets/it-agent-chatgpt-polish.js')){
    if(!html.includes('</body>'))throw new Error(`${relative} chat polish body anchor changed`);
    html=html.replace('</body>',`${jsTag}</body>`);
  }
  await writeFile(file,html,'utf8');
}

await import('./verify-it-agent-chatgpt-polish.mjs');
console.log('IT Agent chat polish installed: compact current-message attachments, viewport-right Activity drawer, cleaner empty state, and post-send attachment reset.');
