import { access, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const portalPath=path.join(root,'it-solutions.html');
const cssPath=path.join(root,'assets','it-agent-conversational-ui.css');
const jsPath=path.join(root,'assets','it-agent-conversational-ui.js');
const actionCenterPath=path.join(root,'assets','it-agent-action-center-tab.js');
const repairCssPath=path.join(root,'assets','it-agent-ui-regression-repair.css');
const repairJsPath=path.join(root,'assets','it-agent-ui-regression-repair.js');
const statusBoardSplitCssPath=path.join(root,'assets','it-agent-status-board-split.css');
const statusBoardFinalizerPath=path.join(root,'assets','it-agent-status-board-finalizer.js');

await Promise.all([access(portalPath),access(cssPath),access(jsPath),access(actionCenterPath),access(repairCssPath),access(repairJsPath),access(statusBoardSplitCssPath),access(statusBoardFinalizerPath)]);
let html=await readFile(portalPath,'utf8');
const cssTag='<link rel="stylesheet" href="/assets/it-agent-conversational-ui.css?v=20260829-chat-1">';
const jsTag='<script src="/assets/it-agent-conversational-ui.js?v=20260829-chat-1"></script>';
const repairCssTag='<link rel="stylesheet" href="/assets/it-agent-ui-regression-repair.css?v=20260829-regression-2">';
const repairJsTag='<script src="/assets/it-agent-ui-regression-repair.js?v=20260829-regression-3"></script>';
const statusBoardSplitCssTag='<link rel="stylesheet" href="/assets/it-agent-status-board-split.css?v=20260829-status-board-split-3">';
const statusBoardFinalizerTag='<script src="/assets/it-agent-status-board-finalizer.js?v=20260829-status-board-4"></script>';

if(!html.includes('/assets/it-agent-conversational-ui.css')){
  if(!html.includes('</head>'))throw new Error('IT Agent conversational UI head anchor changed');
  html=html.replace('</head>',`${cssTag}</head>`);
}
if(!html.includes('/assets/it-agent-conversational-ui.js')){
  if(!html.includes('</body>'))throw new Error('IT Agent conversational UI body anchor changed');
  html=html.replace('</body>',`${jsTag}</body>`);
}

// Final presentation layers: Action Center remains a separate Operations view.
// The main chat retains its working/countdown card. Status Board is a dedicated
// persistent rail of authenticated per-request repository/system/action progress.
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-ui-regression-repair\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-status-board-split\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-ui-regression-repair\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-status-board-finalizer\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
if(!html.includes('</head>')||!html.includes('</body>'))throw new Error('IT Agent final publication anchors changed');
html=html.replace('</head>',`${repairCssTag}${statusBoardSplitCssTag}</head>`);
html=html.replace('</body>',`${repairJsTag}${statusBoardFinalizerTag}</body>`);

for(const marker of ['Sulandra IT Agent','Ask IT Agent','/assets/it-agent-chatgpt-workspace.css','/assets/it-agent-chatgpt-workspace.js','/assets/it-agent-conversational-ui.css','/assets/it-agent-conversational-ui.js','/assets/it-agent-action-center-tab.js','/assets/it-agent-ui-regression-repair.css','/assets/it-agent-ui-regression-repair.js','/assets/it-agent-status-board-split.css','/assets/it-agent-status-board-finalizer.js']){
  if(!html.includes(marker))throw new Error(`IT Agent current chat-first UI missing ${marker}`);
}
const [actionCenter,repairCss,repairJs,statusBoardSplitCss,statusBoardFinalizer]=await Promise.all([readFile(actionCenterPath,'utf8'),readFile(repairCssPath,'utf8'),readFile(repairJsPath,'utf8'),readFile(statusBoardSplitCssPath,'utf8'),readFile(statusBoardFinalizerPath,'utf8')]);
for(const marker of ['IT_AGENT_ACTION_CENTER_TAB_V2','Action Center','data-itws-view="overview"','itwsActionCenterView']){
  if(!actionCenter.includes(marker))throw new Error(`Separate Action Center missing ${marker}`);
}
for(const marker of ['IT_AGENT_UI_REGRESSION_REPAIR_V2','#agentArtifacts','itws-inline-artifact','itws-composer-clearance','Generating image']){
  if(!repairCss.includes(marker)&&!repairJs.includes(marker))throw new Error(`IT Agent regression repair missing ${marker}`);
}
if(repairJs.includes('restoreStatusBoard')||repairJs.includes('itws-action-center-panel'))throw new Error('Regression repair must not repurpose Action Center as Status Board');
for(const marker of ['IT_AGENT_STATUS_BOARD_SPLIT_V3','itws-status-board-open','--itws-status-board-width','itws-status-event','data-itws-status-board-ready','Main chat retains the normal Sulandra working/countdown presentation']){
  if(!statusBoardSplitCss.includes(marker))throw new Error(`IT Agent Status Board split layout missing ${marker}`);
}
for(const marker of ['IT_AGENT_STATUS_BOARD_FINALIZER_V4','itwsStatusBoardFeed','/api/it-solutions/agent/progress/','requestId','Verified work steps for this chat, in real time.','Private model chain-of-thought is not displayed.','Status Board']){
  if(!statusBoardFinalizer.includes(marker))throw new Error(`IT Agent Status Board finalizer missing ${marker}`);
}
if(statusBoardFinalizer.includes('agentActions')||statusBoardFinalizer.includes('itws-action-center-panel'))throw new Error('Status Board must not reuse Action Center action-card DOM');
const repairSyntax=spawnSync(process.execPath,['--check',repairJsPath],{encoding:'utf8'});
if(repairSyntax.status!==0)throw new Error(`IT Agent regression repair JavaScript syntax failed: ${String(repairSyntax.stderr||repairSyntax.stdout||'unknown syntax error').trim()}`);
const actionCenterSyntax=spawnSync(process.execPath,['--check',actionCenterPath],{encoding:'utf8'});
if(actionCenterSyntax.status!==0)throw new Error(`IT Agent Action Center JavaScript syntax failed: ${String(actionCenterSyntax.stderr||actionCenterSyntax.stdout||'unknown syntax error').trim()}`);
const finalizerSyntax=spawnSync(process.execPath,['--check',statusBoardFinalizerPath],{encoding:'utf8'});
if(finalizerSyntax.status!==0)throw new Error(`IT Agent Status Board finalizer JavaScript syntax failed: ${String(finalizerSyntax.stderr||finalizerSyntax.stdout||'unknown syntax error').trim()}`);
await writeFile(portalPath,html,'utf8');
console.log('IT Agent current chat-first workspace preserved: main chat keeps working/countdown feedback; Status Board shows real authenticated per-request work events; Action Center remains separate under Operations.');
