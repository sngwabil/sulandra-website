// finalize-spire-workspace-completion
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const htmlPath=path.join(dist,'spire.html');
const corePath=path.join(dist,'assets','spire-app-v2.js');
const version='20260810-spire-workspaces-1';

for(const relative of ['assets/spire-workspace-completion.css','assets/spire-workspace-completion.js','assets/spire-workspace-stability.js','assets/spire-workspace-polish.js','assets/spire-note-cosigner-polish.js','assets/spire-results-workspace.js']){
  await stat(path.join(dist,relative));
}

let html=await readFile(htmlPath,'utf8');
html=html
  .replace(/\s*<link rel="stylesheet" href="\/assets\/spire-workspace-completion\.css(?:\?v=[^"']+)?">\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-workspace-completion\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-workspace-stability\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-workspace-polish\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-note-cosigner-polish\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'');
html=html.replace('</head>',`<link rel="stylesheet" href="/assets/spire-workspace-completion.css?v=${version}"></head>`);
html=html.replace('</body>',`<script src="/assets/spire-workspace-completion.js?v=${version}"></script><script src="/assets/spire-workspace-stability.js?v=${version}"></script><script src="/assets/spire-workspace-polish.js?v=${version}"></script><script src="/assets/spire-note-cosigner-polish.js?v=${version}"></script></body>`);
await writeFile(htmlPath,html,'utf8');

let core=await readFile(corePath,'utf8');
core=core.replace('This workspace is part of the Spire clinical architecture and will be expanded in its implementation phase.','Loading the complete SPIRE workspace…');
await writeFile(corePath,core,'utf8');

const finalHtml=await readFile(htmlPath,'utf8');
for(const marker of [
  `/assets/spire-workspace-completion.css?v=${version}`,
  `/assets/spire-workspace-completion.js?v=${version}`,
  `/assets/spire-workspace-stability.js?v=${version}`,
  `/assets/spire-workspace-polish.js?v=${version}`,
  `/assets/spire-note-cosigner-polish.js?v=${version}`,
]){
  if(!finalHtml.includes(marker))throw new Error(`Final SPIRE publication is missing ${marker}`);
}
if((finalHtml.match(/spire-workspace-completion\.js/g)||[]).length!==1)throw new Error('SPIRE completion runtime must be published exactly once');
if((finalHtml.match(/spire-workspace-stability\.js/g)||[]).length!==1)throw new Error('SPIRE stability runtime must be published exactly once');
if((finalHtml.match(/spire-workspace-polish\.js/g)||[]).length!==1)throw new Error('SPIRE workspace polish runtime must be published exactly once');
if((finalHtml.match(/spire-note-cosigner-polish\.js/g)||[]).length!==1)throw new Error('SPIRE note cosigner polish runtime must be published exactly once');
if(core.includes('will be expanded in its implementation phase'))throw new Error('Legacy unfinished SPIRE workspace copy remains in production output');

await import('./verify-spire-workspace-completion.mjs');
console.log('Final SPIRE static output pins complete workspaces, stability, selected-company polish and licensed note-cosigner controls after legacy clinical modules with no unfinished workspace copy.');
