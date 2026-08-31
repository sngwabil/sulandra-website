import { access, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const portalPath=path.join(root,'it-solutions.html');
const paths={
  css:path.join(root,'assets','it-agent-conversational-ui.css'),
  js:path.join(root,'assets','it-agent-conversational-ui.js'),
  actionCenter:path.join(root,'assets','it-agent-action-center-tab.js'),
  repairCss:path.join(root,'assets','it-agent-ui-regression-repair.css'),
  repairJs:path.join(root,'assets','it-agent-ui-regression-repair.js'),
  statusCss:path.join(root,'assets','it-agent-status-board-split.css'),
  statusJs:path.join(root,'assets','it-agent-status-board-finalizer.js'),
  ipadCss:path.join(root,'assets','it-agent-ipad-load-guard.css'),
  ipadJs:path.join(root,'assets','it-agent-ipad-load-guard.js'),
  enterpriseCss:path.join(root,'assets','it-agent-enterprise-shell.css'),
  enterpriseJs:path.join(root,'assets','it-agent-enterprise-shell.js'),
  headerCss:path.join(root,'assets','it-agent-header-polish.css'),
  headerJs:path.join(root,'assets','it-agent-header-polish.js'),
  darkCss:path.join(root,'assets','it-agent-dark-conversation.css'),
  sidebarJs:path.join(root,'assets','it-agent-sidebar-persistence.js'),
  realTerminalCss:path.join(root,'assets','it-agent-real-terminal.css'),
  realTerminalJs:path.join(root,'assets','it-agent-real-terminal.js'),
  realTerminalUxCss:path.join(root,'assets','it-agent-real-terminal-ux-v2.css'),
  realTerminalUxJs:path.join(root,'assets','it-agent-real-terminal-ux-v2.js'),
};
await Promise.all([access(portalPath),...Object.values(paths).map(file=>access(file))]);

let html=await readFile(portalPath,'utf8');
const tags={
  css:'<link rel="stylesheet" href="/assets/it-agent-conversational-ui.css?v=20260829-chat-1">',
  js:'<script src="/assets/it-agent-conversational-ui.js?v=20260829-chat-1"></script>',
  repairCss:'<link rel="stylesheet" href="/assets/it-agent-ui-regression-repair.css?v=20260829-regression-2">',
  repairJs:'<script src="/assets/it-agent-ui-regression-repair.js?v=20260829-regression-3"></script>',
  statusCss:'<link rel="stylesheet" href="/assets/it-agent-status-board-split.css?v=20260829-status-board-split-3">',
  statusJs:'<script src="/assets/it-agent-status-board-finalizer.js?v=20260829-status-board-5"></script>',
  ipadCss:'<link rel="stylesheet" href="/assets/it-agent-ipad-load-guard.css?v=20260829-ipad-1">',
  ipadJs:'<script src="/assets/it-agent-ipad-load-guard.js?v=20260829-ipad-1"></script>',
  enterpriseCss:'<link rel="stylesheet" href="/assets/it-agent-enterprise-shell.css?v=20260830-engineering-shell-2">',
  enterpriseJs:'<script src="/assets/it-agent-enterprise-shell.js?v=20260831-engineering-shell-3"></script>',
  headerCss:'<link rel="stylesheet" href="/assets/it-agent-header-polish.css?v=20260830-header-polish-1">',
  headerJs:'<script src="/assets/it-agent-header-polish.js?v=20260830-header-polish-1"></script>',
  darkCss:'<link rel="stylesheet" href="/assets/it-agent-dark-conversation.css?v=20260830-dark-chat-1">',
  sidebarJs:'<script src="/assets/it-agent-sidebar-persistence.js?v=20260830-sidebar-persist-2"></script>',
  realTerminalCss:'<link rel="stylesheet" href="/assets/it-agent-real-terminal.css?v=20260830-real-terminal-1">',
  realTerminalJs:'<script src="/assets/it-agent-real-terminal.js?v=20260831-real-terminal-4"></script>',
  realTerminalUxCss:'<link rel="stylesheet" href="/assets/it-agent-real-terminal-ux-v2.css?v=20260830-real-terminal-ux-2">',
  realTerminalUxJs:'<script src="/assets/it-agent-real-terminal-ux-v2.js?v=20260830-real-terminal-ux-2"></script>',
};
const ipadPreboot='<style id="itws-preboot-critical">html.itws-preboot body>header,html.itws-preboot body>main.shell{opacity:0!important;visibility:hidden!important;pointer-events:none!important}html.itws-preboot::before{content:"Loading Sulandra IT…";position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#fff;color:#53616d;font:600 15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}html.itws-preboot.itws-boot-failed::before{display:none!important}</style><script id="itws-preboot-script">document.documentElement.classList.add("itws-preboot")</script>';

if(!html.includes('/assets/it-agent-conversational-ui.css')){
  if(!html.includes('</head>'))throw new Error('IT Agent conversational UI head anchor changed');
  html=html.replace('</head>',`${tags.css}</head>`);
}
if(!html.includes('/assets/it-agent-conversational-ui.js')){
  if(!html.includes('</body>'))throw new Error('IT Agent conversational UI body anchor changed');
  html=html.replace('</body>',`${tags.js}</body>`);
}

// Re-publish the final workspace layers in a deterministic order. Status Board and
// Action Center remain separate; the real terminal is an isolated coding surface
// layered on top of the existing engineering workspace, not a production shell.
html=html.replace(/\s*<style id="itws-preboot-critical">[\s\S]*?<\/style>\s*<script id="itws-preboot-script">[\s\S]*?<\/script>\s*/g,'\n');
for(const asset of ['it-agent-ui-regression-repair.css','it-agent-status-board-split.css','it-agent-ipad-load-guard.css','it-agent-enterprise-shell.css','it-agent-header-polish.css','it-agent-dark-conversation.css','it-agent-real-terminal.css','it-agent-real-terminal-ux-v2.css']){
  const escaped=asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  html=html.replace(new RegExp(`\\s*<link rel="stylesheet" href="/assets/${escaped}(?:\\?v=[^"']+)?">\\s*`,'g'),'\n');
}
for(const asset of ['it-agent-ui-regression-repair.js','it-agent-status-board-finalizer.js','it-agent-ipad-load-guard.js','it-agent-enterprise-shell.js','it-agent-header-polish.js','it-agent-sidebar-persistence.js','it-agent-real-terminal.js','it-agent-real-terminal-ux-v2.js']){
  const escaped=asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  html=html.replace(new RegExp(`\\s*<script src="/assets/${escaped}(?:\\?v=[^"']+)?"><\\/script>\\s*`,'g'),'\n');
}
if(!html.includes('</head>')||!html.includes('</body>'))throw new Error('IT Agent final publication anchors changed');
html=html.replace('</head>',`${ipadPreboot}${tags.repairCss}${tags.statusCss}${tags.ipadCss}${tags.enterpriseCss}${tags.headerCss}${tags.darkCss}${tags.realTerminalCss}${tags.realTerminalUxCss}</head>`);
html=html.replace('</body>',`${tags.repairJs}${tags.statusJs}${tags.ipadJs}${tags.enterpriseJs}${tags.headerJs}${tags.sidebarJs}${tags.realTerminalJs}${tags.realTerminalUxJs}</body>`);

for(const marker of ['Sulandra IT Agent','Ask IT Agent','/assets/it-agent-chatgpt-workspace.css','/assets/it-agent-chatgpt-workspace.js','/assets/it-agent-conversational-ui.css','/assets/it-agent-conversational-ui.js','/assets/it-agent-action-center-tab.js','/assets/it-agent-ui-regression-repair.css','/assets/it-agent-ui-regression-repair.js','/assets/it-agent-status-board-split.css','/assets/it-agent-status-board-finalizer.js','/assets/it-agent-ipad-load-guard.css','/assets/it-agent-ipad-load-guard.js','/assets/it-agent-enterprise-shell.css','/assets/it-agent-enterprise-shell.js','/assets/it-agent-header-polish.css','/assets/it-agent-header-polish.js','/assets/it-agent-dark-conversation.css','/assets/it-agent-sidebar-persistence.js','/assets/it-agent-real-terminal.css','/assets/it-agent-real-terminal.js','/assets/it-agent-real-terminal-ux-v2.css','/assets/it-agent-real-terminal-ux-v2.js','itws-preboot-critical','itws-preboot-script']){
  if(!html.includes(marker))throw new Error(`IT Agent current chat-first UI missing ${marker}`);
}

const assets={};
for(const [name,file] of Object.entries(paths))assets[name]=await readFile(file,'utf8');
const requireAny=(names,marker,label)=>{if(!names.some(name=>assets[name]?.includes(marker)))throw new Error(`${label} missing ${marker}`)};
for(const marker of ['IT_AGENT_ACTION_CENTER_TAB_V2','Action Center','data-itws-view="overview"','itwsActionCenterView'])requireAny(['actionCenter'],marker,'Separate Action Center');
for(const marker of ['IT_AGENT_UI_REGRESSION_REPAIR_V2','#agentArtifacts','itws-inline-artifact','itws-composer-clearance','Generating image'])requireAny(['repairCss','repairJs'],marker,'IT Agent regression repair');
if(assets.repairJs.includes('restoreStatusBoard')||assets.repairJs.includes('itws-action-center-panel'))throw new Error('Regression repair must not repurpose Action Center as Status Board');
for(const marker of ['IT_AGENT_STATUS_BOARD_SPLIT_V3','itws-status-board-open','--itws-status-board-width','itws-status-event','data-itws-status-board-ready','Main chat retains the normal Sulandra working/countdown presentation'])requireAny(['statusCss'],marker,'IT Agent Status Board split layout');
for(const marker of ['IT_AGENT_STATUS_BOARD_FINALIZER_V5','IT_AGENT_STATUS_BOARD_API_ORIGIN_FIX_V1','itwsStatusBoardFeed','/api/it-solutions/agent/progress/','requestId','collapseProgressEvents','supersedeActiveRun()','await waitForTerminal(run);','event.stopImmediatePropagation();','Verified work for the current request, in real time.','Private model chain-of-thought is not displayed.','Status Board'])requireAny(['statusJs'],marker,'IT Agent Status Board finalizer');
if(assets.statusJs.includes('agentActions')||assets.statusJs.includes('itws-action-center-panel'))throw new Error('Status Board must not reuse Action Center action-card DOM');
for(const marker of ['IT_AGENT_IPAD_STABLE_LOAD_V1','--itws-keyboard-inset','itws-status-board-open','max-width:1180px','itws-boot-error'])requireAny(['ipadCss','ipadJs'],marker,'IT Agent iPad stable-load guard');
for(const marker of ['it-chatgpt-workspace','.itws-layout','#agent .agent-main','itwsIpadReady','visualViewport','The old Action Center page is intentionally not shown as a fallback.'])requireAny(['ipadJs'],marker,'IT Agent iPad boot verification');
for(const marker of ['IT_SOLUTIONS_SHARED_ENTERPRISE_SHELL_V1','itwsEnterprisePlatformBar','itwsReturnToAdminPortal','itwsEngineeringTerminal','Engineering Terminal','Sulandra Health Platform','sulandra:it-solutions:active-view',"restoredView==='terminal'"])requireAny(['enterpriseCss','enterpriseJs'],marker,'IT Agent engineering shell');
if(assets.enterpriseJs.includes("['Service Homes'")||assets.enterpriseJs.includes("nav.id='itwsEnterpriseAdminTabs'")||assets.enterpriseJs.includes("className='itws-enterprise-admin-tabs'"))throw new Error('IT Solutions must not recreate Administrator module navigation');
for(const marker of ['No unrestricted host shell','controlled Sulandra coding-worker workflow','Action Center','Completed Work'])requireAny(['enterpriseJs'],marker,'IT engineering workspace safety/navigation');
for(const marker of ['IT_AGENT_HEADER_POLISH_V1','itws-agent-centered-title','itws-live-connected','itws-live-connected-pulse','itws-status-compact'])requireAny(['headerCss','headerJs'],marker,'IT Agent header polish');
for(const marker of ['IT_AGENT_DARK_CONVERSATION_V1','--itws-navy-950','--itws-chat-lane','itws-status-board-drawer','bubble.user'])requireAny(['darkCss'],marker,'IT Agent dark conversation theme');
for(const marker of ['IT_AGENT_SIDEBAR_PERSISTENCE_V2','desiredOpen','MutationObserver','itwsViewContrastStyle','sessionStorage'])requireAny(['sidebarJs'],marker,'IT Agent authoritative sidebar/contrast repair');
for(const marker of ['IT_AGENT_REAL_TERMINAL_V1','itwsRealTerminal','itwsRtNewTab','/api/it-solutions/terminal/','Tell Sulandra','Real Terminal','__SULANDRA_TERMINAL_REST_BRIDGE__','sulandra:terminal-rest-output'])requireAny(['realTerminalJs'],marker,'IT Agent real terminal');
for(const marker of ['IT_AGENT_REAL_TERMINAL_V1','.itws-real-terminal','.itws-rt-screen','itws-status-board-open'])requireAny(['realTerminalCss'],marker,'IT Agent real terminal presentation');
for(const marker of ['IT_AGENT_REAL_TERMINAL_UX_V2','Direct typing','Command box','itwsRtCopy','itwsRtLatest','postInput','selectionSnapshot'])requireAny(['realTerminalUxJs'],marker,'IT Agent direct terminal UX');
for(const marker of ['IT_AGENT_REAL_TERMINAL_UX_V2','.itws-rt-input-switch','.itws-rt-direct-mode','user-select:text','touch-action:pan-y'])requireAny(['realTerminalUxCss'],marker,'IT Agent direct terminal presentation');

for(const [label,file] of [['regression repair',paths.repairJs],['Action Center',paths.actionCenter],['Status Board finalizer',paths.statusJs],['iPad load guard',paths.ipadJs],['engineering shell',paths.enterpriseJs],['header polish',paths.headerJs],['sidebar persistence',paths.sidebarJs],['real terminal',paths.realTerminalJs],['real terminal UX',paths.realTerminalUxJs]]){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(syntax.status!==0)throw new Error(`IT Agent ${label} JavaScript syntax failed: ${String(syntax.stderr||syntax.stdout||'unknown syntax error').trim()}`);
}
await writeFile(portalPath,html,'utf8');
console.log('IT Solutions engineering workspace preserved: aligned navy chat, explicit left-rail state, separate Status Board/Action Center, Tell Sulandra workflow, isolated multi-session Real Terminal, direct terminal typing, stable scrollback, and copy controls are published together.');