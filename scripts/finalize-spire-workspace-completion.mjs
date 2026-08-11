// finalize-spire-workspace-completion
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const htmlPath=path.join(dist,'spire.html');
const corePath=path.join(dist,'assets','spire-app-v2.js');
const version='20260810-spire-workspaces-1';
const observerVersion='20260811-workspace-observer-suppression-2';

for(const relative of [
  'assets/spire-workspace-completion.css',
  'assets/spire-workspace-completion.js',
  'assets/spire-workspace-stability.js',
  'assets/spire-workspace-polish.js',
  'assets/spire-note-cosigner-polish.js',
  'assets/spire-results-workspace.js',
  'assets/spire-workspace-loop-guard.js',
  'assets/spire-workspace-loop-restore.js',
]){
  await stat(path.join(dist,relative));
}

let html=await readFile(htmlPath,'utf8');
html=html
  .replace(/\s*<link rel="stylesheet" href="\/assets\/spire-workspace-completion\.css(?:\?v=[^"']+)?">\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-workspace-loop-guard\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-workspace-loop-restore\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-workspace-completion\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-workspace-stability\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-workspace-polish\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'')
  .replace(/\s*<script src="\/assets\/spire-note-cosigner-polish\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'');
html=html.replace('</head>',`<link rel="stylesheet" href="/assets/spire-workspace-completion.css?v=${version}"></head>`);
html=html.replace('</body>',`<script src="/assets/spire-workspace-loop-guard.js?v=${observerVersion}"></script><script src="/assets/spire-workspace-completion.js?v=${version}"></script><script src="/assets/spire-workspace-loop-restore.js?v=${observerVersion}"></script><script src="/assets/spire-workspace-stability.js?v=${version}"></script><script src="/assets/spire-workspace-polish.js?v=${version}"></script><script src="/assets/spire-note-cosigner-polish.js?v=${version}"></script></body>`);
await writeFile(htmlPath,html,'utf8');

let core=await readFile(corePath,'utf8');
core=core.replace('This workspace is part of the Spire clinical architecture and will be expanded in its implementation phase.','Loading the complete SPIRE workspace…');
await writeFile(corePath,core,'utf8');

const finalHtml=await readFile(htmlPath,'utf8');
for(const marker of [
  `/assets/spire-workspace-completion.css?v=${version}`,
  `/assets/spire-workspace-loop-guard.js?v=${observerVersion}`,
  `/assets/spire-workspace-completion.js?v=${version}`,
  `/assets/spire-workspace-loop-restore.js?v=${observerVersion}`,
  `/assets/spire-workspace-stability.js?v=${version}`,
  `/assets/spire-workspace-polish.js?v=${version}`,
  `/assets/spire-note-cosigner-polish.js?v=${version}`,
]){
  if(!finalHtml.includes(marker))throw new Error(`Final SPIRE publication is missing ${marker}`);
}
for(const asset of [
  'spire-workspace-loop-guard.js',
  'spire-workspace-completion.js',
  'spire-workspace-loop-restore.js',
  'spire-workspace-stability.js',
  'spire-workspace-polish.js',
  'spire-note-cosigner-polish.js',
]){
  if((finalHtml.match(new RegExp(asset.replaceAll('.','\\.'),'g'))||[]).length!==1)throw new Error(`${asset} must be published exactly once`);
}
const guardIndex=finalHtml.indexOf(`/assets/spire-workspace-loop-guard.js?v=${observerVersion}`);
const completionIndex=finalHtml.indexOf(`/assets/spire-workspace-completion.js?v=${version}`);
const restoreIndex=finalHtml.indexOf(`/assets/spire-workspace-loop-restore.js?v=${observerVersion}`);
const stabilityIndex=finalHtml.indexOf(`/assets/spire-workspace-stability.js?v=${version}`);
if(!(guardIndex>=0&&guardIndex<completionIndex&&completionIndex<restoreIndex&&restoreIndex<stabilityIndex)){
  throw new Error('SPIRE workspace observer safety order regressed: guard must wrap completion before stability');
}
if(core.includes('will be expanded in its implementation phase'))throw new Error('Legacy unfinished SPIRE workspace copy remains in production output');

await import('./verify-spire-workspace-completion.mjs');
console.log('Final SPIRE static output pins complete workspaces with the observer guard wrapped around workspace-completion, then restores native observers before stability/polish modules.');
