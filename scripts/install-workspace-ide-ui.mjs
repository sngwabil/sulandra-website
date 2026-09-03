import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.argv[2]||'it-solutions.html';
const portalPath=path.resolve(root,requested);
const assets={
 workspaceCss:path.join(root,'assets','it-agent-workspace-preview.css'),
 workspaceJs:path.join(root,'assets','it-agent-workspace-preview.js'),
 resizeJs:path.join(root,'assets','it-agent-dock-resize.js'),
 statusCss:path.join(root,'assets','it-agent-status-board.css'),
 statusJs:path.join(root,'assets','it-agent-status-board.js'),
 codebaseCss:path.join(root,'assets','sulandra-codebase.css'),
 codebaseJs:path.join(root,'assets','sulandra-codebase.js'),
 codebaseNavJs:path.join(root,'assets','sulandra-codebase-nav-entry.js'),
 nativeGridCss:path.join(root,'assets','sulandra-codebase-native-grid-v3.css'),
 rightDockCss:path.join(root,'assets','sulandra-codebase-right-dock-full-height.css'),
 nativeGridJs:path.join(root,'assets','sulandra-codebase-native-grid-v3.js'),
 apiBridge:path.join(root,'assets','sulandra-codebase-api-bridge.js'),
 siaBridge:path.join(root,'assets','sulandra-codebase-sia-bridge.js'),
 siaCss:path.join(root,'assets','sia-copilot.css'),
 siaJs:path.join(root,'assets','sia-copilot.js'),
};
await Promise.all([access(portalPath),...Object.values(assets).map(file=>access(file))]);
let html=await readFile(portalPath,'utf8');
if(!html.includes('</head>')||!html.includes('</body>'))throw new Error('IT Solutions publication anchors changed');

const tags={
 workspaceCss:'<link rel="stylesheet" href="/assets/it-agent-workspace-preview.css?v=20260901-dockable-workspace-3">',
 workspaceJs:'<script src="/assets/it-agent-workspace-preview.js?v=20260901-dockable-workspace-4"></script>',
 resizeJs:'<script src="/assets/it-agent-dock-resize.js?v=20260901-dock-resize-6"></script>',
 statusCss:'<link rel="stylesheet" href="/assets/it-agent-status-board.css?v=20260903-status-board-1">',
 statusJs:'<script src="/assets/it-agent-status-board.js?v=20260903-status-board-1"></script>',
 codebaseCss:'<link rel="stylesheet" href="/assets/sulandra-codebase.css?v=20260902-codebase-4-terminal-flex">',
 nativeGridCss:'<link rel="stylesheet" href="/assets/sulandra-codebase-native-grid-v3.css?v=20260903-prototype-v19-nav-2">',
 rightDockCss:'<link rel="stylesheet" href="/assets/sulandra-codebase-right-dock-full-height.css?v=20260903-right-dock-fullheight-1">',
 codebaseJs:'<script src="/assets/sulandra-codebase.js?v=20260902-codebase-4-terminal-flex"></script>',
 codebaseNavJs:'<script src="/assets/sulandra-codebase-nav-entry.js?v=20260903-top-level-nav-3"></script>',
 nativeGridJs:'<script src="/assets/sulandra-codebase-native-grid-v3.js?v=20260903-prototype-v19-nav-2"></script>',
 apiBridge:'<script src="/assets/sulandra-codebase-api-bridge.js?v=20260902-codebase-api-1"></script>',
 siaBridge:'<script src="/assets/sulandra-codebase-sia-bridge.js?v=20260902-codebase-sia-fullscreen-2"></script>',
};
const siaMarker='data-sia-global-copilot="20260827-sia-intelligence-router-1"';
const siaCssTag=`<link rel="stylesheet" href="/assets/sia-copilot.css?v=20260827-sia-intelligence-router-1" ${siaMarker} />`;
const siaJsTag=`<script src="/assets/sia-copilot.js?v=20260827-sia-intelligence-router-1" ${siaMarker}></script>`;
const dockRail='<style data-scb-dock-rail="20260903-prototype-v19-nav-2">.scb-shell[data-prototype="v19"].scb-dock-closed .scb-right-splitter{visibility:visible!important;pointer-events:auto!important}</style>';

for(const re of [
 /\s*<link rel="stylesheet" href="\/assets\/it-agent-workspace-preview\.css(?:\?v=[^"']+)?">\s*/g,
 /\s*<script src="\/assets\/it-agent-workspace-preview\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<script src="\/assets\/it-agent-dock-resize\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<link rel="stylesheet" href="\/assets\/it-agent-status-board\.css(?:\?v=[^"']+)?">\s*/g,
 /\s*<script src="\/assets\/it-agent-status-board\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<link rel="stylesheet" href="\/assets\/sulandra-codebase(?:-native-grid-v3)?\.css(?:\?v=[^"']+)?">\s*/g,
 /\s*<link rel="stylesheet" href="\/assets\/sulandra-codebase-right-dock-full-height\.css(?:\?v=[^"']+)?">\s*/g,
 /\s*<script src="\/assets\/sulandra-codebase(?:-native-grid-v3|-nav-entry)?\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<script src="\/assets\/sulandra-codebase-api-bridge\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<script src="\/assets\/sulandra-codebase-sia-bridge\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<style data-scb-dock-rail=["'][^"']+["']>[\s\S]*?<\/style>\s*/g,
 /\s*<style data-scb-terminal-sizing=["'][^"']+["']>[\s\S]*?<\/style>\s*/g,
 /\s*<link[^>]+href=["']\/assets\/sia-copilot\.css(?:\?v=[^"']*)?["'][^>]*>\s*/gi,
 /\s*<script[^>]+src=["']\/assets\/sia-copilot\.js(?:\?v=[^"']*)?["'][^>]*><\/script>\s*/gi,
]) html=html.replace(re,'\n');

html=html
 .replace('</head>',`${siaCssTag}${tags.workspaceCss}${tags.statusCss}${tags.codebaseCss}${tags.nativeGridCss}${tags.rightDockCss}${dockRail}</head>`)
 .replace('</body>',`${tags.workspaceJs}${tags.statusJs}${tags.codebaseJs}${tags.codebaseNavJs}${tags.nativeGridJs}${tags.apiBridge}${tags.resizeJs}${siaJsTag}${tags.siaBridge}</body>`);

const source=Object.fromEntries(await Promise.all(Object.entries(assets).map(async([k,p])=>[k,await readFile(p,'utf8')])));
for(const marker of ['SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V3','itws-dock-workspace','itws-dock-panel','itws-dock-splitter'])if(!source.workspaceCss.includes(marker))throw new Error(`Dockable workspace CSS missing ${marker}`);
for(const marker of ['SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V3','itwsWorkspaceIdeButton','itwsWorkspacePreviewButton','SulandraDockableWorkspace','/workspace/ticket'])if(!source.workspaceJs.includes(marker))throw new Error(`Dockable workspace JavaScript missing ${marker}`);
for(const marker of ['SULANDRA_DOCK_RESIZE_CAPTURE_V6','pointerdown','pointermove','pointerup'])if(!source.resizeJs.includes(marker))throw new Error(`Dock resize runtime missing ${marker}`);
for(const marker of ['SULANDRA_IT_STATUS_BOARD_V1','it-status-board','it-status-layout','#agent .examples'])if(!source.statusCss.includes(marker))throw new Error(`IT Agent Status Board CSS missing ${marker}`);
for(const marker of ['SULANDRA_IT_STATUS_BOARD_V1','itAgentStatusBoard','itStatusBoardToggle','Action Center','Operations','private model reasoning is never displayed'])if(!source.statusJs.includes(marker))throw new Error(`IT Agent Status Board JavaScript missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_V2','scb-shell','scb-workspace','scb-editor-input'])if(!source.codebaseCss.includes(marker))throw new Error(`Sulandra Codebase CSS missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_V2','release/sulandra-1.0','openIntegratedTerminal','/api/it-solutions/codebase/file'])if(!source.codebaseJs.includes(marker))throw new Error(`Sulandra Codebase JavaScript missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_TOP_LEVEL_NAV_V1','Engineering Terminal','itwsSulandraCodebaseNav','SulandraCodebase?.open'])if(!source.codebaseNavJs.includes(marker))throw new Error(`Codebase top-level navigation runtime missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_NATIVE_GRID_V3','PROTOTYPE_V19_PARITY','PROTOTYPE_V19_NAVIGATION','scb-native-grid','scb-native-tab','scb-grid-resizer','scb-status-resizer','--scb-native-right'])if(!source.nativeGridCss.includes(marker))throw new Error(`Native Codebase grid CSS missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_RIGHT_DOCK_FULL_HEIGHT_V1','scb-right-dock','scb-dock-mount','scb-embedded-workspace-panel','itws-dock-panel-body','itws-workspace-frame'])if(!source.rightDockCss.includes(marker))throw new Error(`Codebase right-dock full-height CSS missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_NATIVE_GRID_V3','PROTOTYPE_V19_PARITY','PROTOTYPE_V19_NAVIGATION','sulandra:codebase:native-grid-v3','data-terminal-id','SulandraCodebaseNativeGrid','draggable=true','order.slice(0,count())','data-grid-mode','stack-2-1','stack-1-2','scb-status-resizer','scb-sidebar-nav'])if(!source.nativeGridJs.includes(marker))throw new Error(`Native Codebase grid JavaScript missing ${marker}`);
if(source.nativeGridJs.includes('Engineering Workspace</')||source.nativeGridJs.includes('Engineering Workspace`'))throw new Error('Codebase native grid must not render the Engineering Workspace product UI');
for(const marker of ['SULANDRA_CODEBASE_API_BRIDGE_V1','CODEBASE_PATH','Authorization'])if(!source.apiBridge.includes(marker))throw new Error(`Codebase API bridge missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1','fullscreenchange'])if(!source.siaBridge.includes(marker))throw new Error(`Codebase SIA bridge missing ${marker}`);
for(const marker of ['SIA_GLOBAL_COPILOT_V1','Ask SIA'])if(!source.siaJs.includes(marker))throw new Error(`Ask SIA runtime missing ${marker}`);
if(/api\.github\.com|\/git\/trees\/|\/git\/blobs\//.test(source.codebaseJs+source.apiBridge+source.nativeGridJs+source.codebaseNavJs))throw new Error('Browser Codebase runtime must use authenticated Sulandra APIs, not direct GitHub APIs');
if(/localStorage\.setItem\([^\n]*(?:ticket|url|src)/i.test(source.workspaceJs+source.resizeJs+source.statusJs+source.codebaseJs+source.apiBridge+source.nativeGridJs+source.codebaseNavJs))throw new Error('Engineering tools must not persist access tickets or frame URLs');
for(const required of [tags.workspaceCss,tags.statusCss,tags.codebaseCss,tags.nativeGridCss,tags.rightDockCss,dockRail,tags.workspaceJs,tags.statusJs,tags.codebaseJs,tags.codebaseNavJs,tags.nativeGridJs,tags.apiBridge,tags.resizeJs,siaCssTag,siaJsTag,tags.siaBridge])if(!html.includes(required))throw new Error(`IT Solutions final publication tag missing: ${required}`);
const siaScriptCount=(html.match(/<script[^>]+src=["']\/assets\/sia-copilot\.js(?:\?v=[^"']*)?["'][^>]*><\/script>/gi)||[]).length;
if(siaScriptCount!==1)throw new Error(`IT Solutions must publish exactly one executable Ask SIA runtime; found ${siaScriptCount}`);
if(/sia-copilot\.js[^>]*\bdefer\b/i.test(html))throw new Error('IT Solutions final Ask SIA runtime must not be deferred');
await writeFile(portalPath,html,'utf8');
console.log(`Dockable Engineering Workspace, persistent IT Agent Status Board, permanent top-level Codebase navigation, separate Sulandra Codebase Prototype v19 navigation, and full-height right dock published into ${requested}`);
