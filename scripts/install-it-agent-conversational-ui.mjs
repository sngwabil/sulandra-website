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
const ipadGuardCssPath=path.join(root,'assets','it-agent-ipad-load-guard.css');
const ipadGuardJsPath=path.join(root,'assets','it-agent-ipad-load-guard.js');
const enterpriseShellCssPath=path.join(root,'assets','it-agent-enterprise-shell.css');
const enterpriseShellJsPath=path.join(root,'assets','it-agent-enterprise-shell.js');

await Promise.all([access(portalPath),access(cssPath),access(jsPath),access(actionCenterPath),access(repairCssPath),access(repairJsPath),access(statusBoardSplitCssPath),access(statusBoardFinalizerPath),access(ipadGuardCssPath),access(ipadGuardJsPath),access(enterpriseShellCssPath),access(enterpriseShellJsPath)]);
let html=await readFile(portalPath,'utf8');
const cssTag='<link rel="stylesheet" href="/assets/it-agent-conversational-ui.css?v=20260829-chat-1">';
const jsTag='<script src="/assets/it-agent-conversational-ui.js?v=20260829-chat-1"></script>';
const repairCssTag='<link rel="stylesheet" href="/assets/it-agent-ui-regression-repair.css?v=20260829-regression-2">';
const repairJsTag='<script src="/assets/it-agent-ui-regression-repair.js?v=20260829-regression-3"></script>';
const statusBoardSplitCssTag='<link rel="stylesheet" href="/assets/it-agent-status-board-split.css?v=20260829-status-board-split-3">';
const statusBoardFinalizerTag='<script src="/assets/it-agent-status-board-finalizer.js?v=20260829-status-board-5"></script>';
const ipadGuardCssTag='<link rel="stylesheet" href="/assets/it-agent-ipad-load-guard.css?v=20260829-ipad-1">';
const ipadGuardJsTag='<script src="/assets/it-agent-ipad-load-guard.js?v=20260829-ipad-1"></script>';
const enterpriseShellCssTag='<link rel="stylesheet" href="/assets/it-agent-enterprise-shell.css?v=20260830-engineering-shell-2">';
const enterpriseShellJsTag='<script src="/assets/it-agent-enterprise-shell.js?v=20260830-engineering-shell-2"></script>';
const ipadPreboot='<style id="itws-preboot-critical">html.itws-preboot body>header,html.itws-preboot body>main.shell{opacity:0!important;visibility:hidden!important;pointer-events:none!important}html.itws-preboot::before{content:"Loading Sulandra IT…";position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#fff;color:#53616d;font:600 15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}html.itws-preboot.itws-boot-failed::before{display:none!important}</style><script id="itws-preboot-script">document.documentElement.classList.add("itws-preboot")</script>';

if(!html.includes('/assets/it-agent-conversational-ui.css')){
  if(!html.includes('</head>'))throw new Error('IT Agent conversational UI head anchor changed');
  html=html.replace('</head>',`${cssTag}</head>`);
}
if(!html.includes('/assets/it-agent-conversational-ui.js')){
  if(!html.includes('</body>'))throw new Error('IT Agent conversational UI body anchor changed');
  html=html.replace('</body>',`${jsTag}</body>`);
}

// Final presentation layers: Action Center remains separate from Status Board.
// The main chat keeps its normal working/countdown feedback. The iPad preboot guard
// prevents legacy markup from painting while the canonical workspace is built.
// The final enterprise layer now makes IT Solutions a dedicated engineering surface:
// global Sulandra platform identity + one Return to Admin Portal action + controlled
// terminal-style coding requests, without duplicating Admin module navigation.
html=html.replace(/\s*<style id="itws-preboot-critical">[\s\S]*?<\/style>\s*<script id="itws-preboot-script">[\s\S]*?<\/script>\s*/g,'\n');
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-ui-regression-repair\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-status-board-split\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-ipad-load-guard\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-enterprise-shell\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-ui-regression-repair\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-status-board-finalizer\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-ipad-load-guard\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-enterprise-shell\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
if(!html.includes('</head>')||!html.includes('</body>'))throw new Error('IT Agent final publication anchors changed');
html=html.replace('</head>',`${ipadPreboot}${repairCssTag}${statusBoardSplitCssTag}${ipadGuardCssTag}${enterpriseShellCssTag}</head>`);
html=html.replace('</body>',`${repairJsTag}${statusBoardFinalizerTag}${ipadGuardJsTag}${enterpriseShellJsTag}</body>`);

for(const marker of ['Sulandra IT Agent','Ask IT Agent','/assets/it-agent-chatgpt-workspace.css','/assets/it-agent-chatgpt-workspace.js','/assets/it-agent-conversational-ui.css','/assets/it-agent-conversational-ui.js','/assets/it-agent-action-center-tab.js','/assets/it-agent-ui-regression-repair.css','/assets/it-agent-ui-regression-repair.js','/assets/it-agent-status-board-split.css','/assets/it-agent-status-board-finalizer.js','/assets/it-agent-ipad-load-guard.css','/assets/it-agent-ipad-load-guard.js','/assets/it-agent-enterprise-shell.css','/assets/it-agent-enterprise-shell.js','itws-preboot-critical','itws-preboot-script']){
  if(!html.includes(marker))throw new Error(`IT Agent current chat-first UI missing ${marker}`);
}
const [actionCenter,repairCss,repairJs,statusBoardSplitCss,statusBoardFinalizer,ipadGuardCss,ipadGuardJs,enterpriseShellCss,enterpriseShellJs]=await Promise.all([readFile(actionCenterPath,'utf8'),readFile(repairCssPath,'utf8'),readFile(repairJsPath,'utf8'),readFile(statusBoardSplitCssPath,'utf8'),readFile(statusBoardFinalizerPath,'utf8'),readFile(ipadGuardCssPath,'utf8'),readFile(ipadGuardJsPath,'utf8'),readFile(enterpriseShellCssPath,'utf8'),readFile(enterpriseShellJsPath,'utf8')]);
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
for(const marker of ['IT_AGENT_STATUS_BOARD_FINALIZER_V5','IT_AGENT_STATUS_BOARD_API_ORIGIN_FIX_V1','itwsStatusBoardFeed','/api/it-solutions/agent/progress/','requestId','collapseProgressEvents','supersedeActiveRun()','await waitForTerminal(run);','event.stopImmediatePropagation();','Verified work for the current request, in real time.','Private model chain-of-thought is not displayed.','Status Board']){
  if(!statusBoardFinalizer.includes(marker))throw new Error(`IT Agent Status Board finalizer missing ${marker}`);
}
if(statusBoardFinalizer.includes('agentActions')||statusBoardFinalizer.includes('itws-action-center-panel'))throw new Error('Status Board must not reuse Action Center action-card DOM');
for(const marker of ['IT_AGENT_IPAD_STABLE_LOAD_V1','--itws-keyboard-inset','itws-status-board-open','max-width:1180px','itws-boot-error']){
  if(!ipadGuardCss.includes(marker)&&!ipadGuardJs.includes(marker))throw new Error(`IT Agent iPad stable-load guard missing ${marker}`);
}
for(const marker of ['it-chatgpt-workspace','.itws-layout','#agent .agent-main','itwsIpadReady','visualViewport','The old Action Center page is intentionally not shown as a fallback.']){
  if(!ipadGuardJs.includes(marker))throw new Error(`IT Agent iPad boot verification missing ${marker}`);
}
for(const marker of ['IT_SOLUTIONS_SHARED_ENTERPRISE_SHELL_V1','itwsEnterprisePlatformBar','itwsReturnToAdminPortal','itwsEngineeringTerminal','Engineering Terminal','Sulandra Health Platform']){
  if(!enterpriseShellCss.includes(marker)&&!enterpriseShellJs.includes(marker))throw new Error(`IT Agent engineering shell missing ${marker}`);
}
if(enterpriseShellJs.includes("['Service Homes'")||enterpriseShellJs.includes("nav.id='itwsEnterpriseAdminTabs'")||enterpriseShellJs.includes("className='itws-enterprise-admin-tabs'"))throw new Error('IT Solutions must not recreate Administrator module navigation');
for(const marker of ['No unrestricted host shell','controlled Sulandra coding-worker workflow','Action Center','Completed Work']){
  if(!enterpriseShellJs.includes(marker))throw new Error(`IT engineering workspace safety/navigation missing ${marker}`);
}
const repairSyntax=spawnSync(process.execPath,['--check',repairJsPath],{encoding:'utf8'});
if(repairSyntax.status!==0)throw new Error(`IT Agent regression repair JavaScript syntax failed: ${String(repairSyntax.stderr||repairSyntax.stdout||'unknown syntax error').trim()}`);
const actionCenterSyntax=spawnSync(process.execPath,['--check',actionCenterPath],{encoding:'utf8'});
if(actionCenterSyntax.status!==0)throw new Error(`IT Agent Action Center JavaScript syntax failed: ${String(actionCenterSyntax.stderr||actionCenterSyntax.stdout||'unknown syntax error').trim()}`);
const finalizerSyntax=spawnSync(process.execPath,['--check',statusBoardFinalizerPath],{encoding:'utf8'});
if(finalizerSyntax.status!==0)throw new Error(`IT Agent Status Board finalizer JavaScript syntax failed: ${String(finalizerSyntax.stderr||finalizerSyntax.stdout||'unknown syntax error').trim()}`);
const ipadGuardSyntax=spawnSync(process.execPath,['--check',ipadGuardJsPath],{encoding:'utf8'});
if(ipadGuardSyntax.status!==0)throw new Error(`IT Agent iPad load guard JavaScript syntax failed: ${String(ipadGuardSyntax.stderr||ipadGuardSyntax.stdout||'unknown syntax error').trim()}`);
const enterpriseShellSyntax=spawnSync(process.execPath,['--check',enterpriseShellJsPath],{encoding:'utf8'});
if(enterpriseShellSyntax.status!==0)throw new Error(`IT Agent engineering shell JavaScript syntax failed: ${String(enterpriseShellSyntax.stderr||enterpriseShellSyntax.stdout||'unknown syntax error').trim()}`);
await writeFile(portalPath,html,'utf8');
console.log('IT Solutions engineering workspace preserved: global Sulandra platform bar remains; local Admin module tabs are removed in favor of Return to Admin Portal; controlled Engineering Terminal is present; main chat retains working feedback; Status Board remains request-scoped and split; Action Center remains separate.');
