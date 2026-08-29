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
const statusBoardSplitCssPath=path.join(root,'assets','it-agent-status-board-split.css');
const statusBoardFinalizerPath=path.join(root,'assets','it-agent-status-board-finalizer.js');

await Promise.all([access(portalPath),access(cssPath),access(jsPath),access(repairCssPath),access(repairJsPath),access(statusBoardSplitCssPath),access(statusBoardFinalizerPath)]);
let html=await readFile(portalPath,'utf8');
const cssTag='<link rel="stylesheet" href="/assets/it-agent-conversational-ui.css?v=20260829-chat-1">';
const jsTag='<script src="/assets/it-agent-conversational-ui.js?v=20260829-chat-1"></script>';
const repairCssTag='<link rel="stylesheet" href="/assets/it-agent-ui-regression-repair.css?v=20260829-regression-2">';
const repairJsTag='<script src="/assets/it-agent-ui-regression-repair.js?v=20260829-regression-2"></script>';
const statusBoardSplitCssTag='<link rel="stylesheet" href="/assets/it-agent-status-board-split.css?v=20260829-status-board-split-1">';
const statusBoardFinalizerTag='<script src="/assets/it-agent-status-board-finalizer.js?v=20260829-status-board-2"></script>';

if(!html.includes('/assets/it-agent-conversational-ui.css')){
  if(!html.includes('</head>'))throw new Error('IT Agent conversational UI head anchor changed');
  html=html.replace('</head>',`${cssTag}</head>`);
}
if(!html.includes('/assets/it-agent-conversational-ui.js')){
  if(!html.includes('</body>'))throw new Error('IT Agent conversational UI body anchor changed');
  html=html.replace('</body>',`${jsTag}</body>`);
}

// These are deliberately the final frontend layers on top of the current
// chat-first workspace. They do not restore the old dashboard or the PR #252
// Action Center navigation view. They restore the requested Status Board as a
// docked split-screen right rail, inline generated artifacts, visible working
// state, and iPad composer clearance.
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-ui-regression-repair\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-status-board-split\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-ui-regression-repair\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-status-board-finalizer\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
if(!html.includes('</head>')||!html.includes('</body>'))throw new Error('IT Agent regression repair publication anchors changed');
html=html.replace('</head>',`${repairCssTag}${statusBoardSplitCssTag}</head>`);
html=html.replace('</body>',`${repairJsTag}${statusBoardFinalizerTag}</body>`);

for(const marker of ['Sulandra IT Agent','Ask IT Agent','/assets/it-agent-chatgpt-workspace.css','/assets/it-agent-chatgpt-workspace.js','/assets/it-agent-conversational-ui.css','/assets/it-agent-conversational-ui.js','/assets/it-agent-ui-regression-repair.css','/assets/it-agent-ui-regression-repair.js','/assets/it-agent-status-board-split.css','/assets/it-agent-status-board-finalizer.js']){
  if(!html.includes(marker))throw new Error(`IT Agent current chat-first UI missing ${marker}`);
}
const [repairCss,repairJs,statusBoardSplitCss,statusBoardFinalizer]=await Promise.all([readFile(repairCssPath,'utf8'),readFile(repairJsPath,'utf8'),readFile(statusBoardSplitCssPath,'utf8'),readFile(statusBoardFinalizerPath,'utf8')]);
for(const marker of ['IT_AGENT_UI_REGRESSION_REPAIR_V1','#agentArtifacts','itws-status-board-drawer','Status Board','data-itws-view="action-center"','itws-inline-artifact','itws-composer-clearance']){
  if(!repairCss.includes(marker)&&!repairJs.includes(marker))throw new Error(`IT Agent regression repair missing ${marker}`);
}
if(!repairJs.includes("qsa('[data-itws-view=\"action-center\"]')")&&!repairJs.includes('data-itws-view="action-center"'))throw new Error('IT Agent regression repair must remove the legacy Action Center navigation entry');
for(const marker of ['IT_AGENT_STATUS_BOARD_SPLIT_V1','itws-status-board-open','--itws-status-board-width','grid-template-columns','itws-status-board-drawer.itws-open']){
  if(!statusBoardSplitCss.includes(marker))throw new Error(`IT Agent Status Board split layout missing ${marker}`);
}
for(const marker of ['IT_AGENT_STATUS_BOARD_FINALIZER_V2','itws-action-center-tab-style','itwsStatusBoardReady','itws-status-board-open','hasActiveWork','Status Board']){
  if(!statusBoardFinalizer.includes(marker))throw new Error(`IT Agent Status Board finalizer missing ${marker}`);
}
const syntax=spawnSync(process.execPath,['--check',repairJsPath],{encoding:'utf8'});
if(syntax.status!==0)throw new Error(`IT Agent regression repair JavaScript syntax failed: ${String(syntax.stderr||syntax.stdout||'unknown syntax error').trim()}`);
const finalizerSyntax=spawnSync(process.execPath,['--check',statusBoardFinalizerPath],{encoding:'utf8'});
if(finalizerSyntax.status!==0)throw new Error(`IT Agent Status Board finalizer JavaScript syntax failed: ${String(finalizerSyntax.stderr||finalizerSyntax.stdout||'unknown syntax error').trim()}`);
await writeFile(portalPath,html,'utf8');
console.log('IT Agent current chat-first workspace preserved: grounded activity plus docked split-screen Status Board, inline generated-artifact, compact-suggestion, and iPad composer regression repairs.');
