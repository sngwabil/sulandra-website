import { access, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const portalPath=path.join(root,'it-solutions.html');
const cssPath=path.join(root,'assets','it-agent-conversational-ui.css');
const jsPath=path.join(root,'assets','it-agent-conversational-ui.js');
const repairCssPath=path.join(root,'assets','it-agent-ui-regression-repair.css');
const repairJsPath=path.join(root,'assets','it-agent-ui-regression-repair.js');

await Promise.all([access(portalPath),access(cssPath),access(jsPath),access(repairCssPath),access(repairJsPath)]);
let html=await readFile(portalPath,'utf8');
const cssTag='<link rel="stylesheet" href="/assets/it-agent-conversational-ui.css?v=20260829-chat-1">';
const jsTag='<script src="/assets/it-agent-conversational-ui.js?v=20260829-chat-1"></script>';
const repairCssTag='<link rel="stylesheet" href="/assets/it-agent-ui-regression-repair.css?v=20260829-regression-1">';
const repairJsTag='<script src="/assets/it-agent-ui-regression-repair.js?v=20260829-regression-1"></script>';

if(!html.includes('/assets/it-agent-conversational-ui.css')){
  if(!html.includes('</head>'))throw new Error('IT Agent conversational UI head anchor changed');
  html=html.replace('</head>',`${cssTag}</head>`);
}
if(!html.includes('/assets/it-agent-conversational-ui.js')){
  if(!html.includes('</body>'))throw new Error('IT Agent conversational UI body anchor changed');
  html=html.replace('</body>',`${jsTag}</body>`);
}

// This is deliberately the final frontend layer. Earlier canonical installers
// retain their existing verification contracts; this browser-only repair then
// restores the requested right drawer, inline generated artifacts, visible
// working state, and iPad composer clearance without changing backend safety.
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-ui-regression-repair\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-ui-regression-repair\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
if(!html.includes('</head>')||!html.includes('</body>'))throw new Error('IT Agent regression repair publication anchors changed');
html=html.replace('</head>',`${repairCssTag}</head>`);
html=html.replace('</body>',`${repairJsTag}</body>`);

for(const marker of ['Sulandra IT Agent','Action Center','Ask IT Agent','/assets/it-agent-conversational-ui.css','/assets/it-agent-conversational-ui.js','/assets/it-agent-ui-regression-repair.css','/assets/it-agent-ui-regression-repair.js']){
  if(!html.includes(marker))throw new Error(`IT Agent conversational UI missing ${marker}`);
}
const [repairCss,repairJs]=await Promise.all([readFile(repairCssPath,'utf8'),readFile(repairJsPath,'utf8')]);
for(const marker of ['IT_AGENT_UI_REGRESSION_REPAIR_V1','#agentArtifacts','itws-status-board-drawer','itws-inline-artifact','itws-composer-clearance']){
  if(!repairCss.includes(marker)&&!repairJs.includes(marker))throw new Error(`IT Agent regression repair missing ${marker}`);
}
const syntax=spawnSync(process.execPath,['--check',repairJsPath],{encoding:'utf8'});
if(syntax.status!==0)throw new Error(`IT Agent regression repair JavaScript syntax failed: ${String(syntax.stderr||syntax.stdout||'unknown syntax error').trim()}`);
await writeFile(portalPath,html,'utf8');
console.log('IT Agent conversational UI installed after canonical augmentation: grounded activity plus final Status Board, inline generated-artifact, compact-suggestion, and iPad composer regression repairs.');
