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
 codebaseNavJs:path.join(root,'assets','sulandra-codebase-nav-entry.js'),
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
 codebaseNavJs:'<script src="/assets/sulandra-codebase-nav-entry.js?v=20260904-standalone-launcher-8"></script>',
};
const siaMarker='data-sia-global-copilot="20260827-sia-intelligence-router-1"';
const siaCssTag=`<link rel="stylesheet" href="/assets/sia-copilot.css?v=20260827-sia-intelligence-router-1" ${siaMarker} />`;
const siaJsTag=`<script src="/assets/sia-copilot.js?v=20260827-sia-intelligence-router-1" ${siaMarker}></script>`;

// Strip every previously published workspace/runtime tag first. Codebase is now
// a separate browser application, so only its launcher may remain in Sulandra IT.
for(const re of [
 /\s*<link rel="stylesheet" href="\/assets\/it-agent-workspace-preview\.css(?:\?v=[^"']+)?">\s*/g,
 /\s*<script src="\/assets\/it-agent-workspace-preview\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<script src="\/assets\/it-agent-dock-resize\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<link rel="stylesheet" href="\/assets\/it-agent-status-board\.css(?:\?v=[^"']+)?">\s*/g,
 /\s*<script src="\/assets\/it-agent-status-board\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<link rel="stylesheet" href="\/assets\/sulandra-codebase(?:-native-grid-v3)?\.css(?:\?v=[^"']+)?">\s*/g,
 /\s*<link rel="stylesheet" href="\/assets\/sulandra-codebase-right-dock-full-height\.css(?:\?v=[^"']+)?">\s*/g,
 /\s*<script src="\/assets\/sulandra-codebase(?:-native-grid-v3|-nav-entry|-empty-workspace-ux)?\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<script src="\/assets\/sulandra-codebase-api-bridge\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<script src="\/assets\/sulandra-codebase-sia-bridge\.js(?:\?v=[^"']+)?"><\/script>\s*/g,
 /\s*<style data-scb-dock-rail=["'][^"']+["']>[\s\S]*?<\/style>\s*/g,
 /\s*<style data-scb-terminal-sizing=["'][^"']+["']>[\s\S]*?<\/style>\s*/g,
 /\s*<link[^>]+href=["']\/assets\/sia-copilot\.css(?:\?v=[^"']*)?["'][^>]*>\s*/gi,
 /\s*<script[^>]+src=["']\/assets\/sia-copilot\.js(?:\?v=[^"']*)?["'][^>]*><\/script>\s*/gi,
]) html=html.replace(re,'\n');

html=html
 .replace('</head>',`${siaCssTag}${tags.workspaceCss}${tags.statusCss}</head>`)
 .replace('</body>',`${tags.workspaceJs}${tags.statusJs}${tags.codebaseNavJs}${tags.resizeJs}${siaJsTag}</body>`);

const source=Object.fromEntries(await Promise.all(Object.entries(assets).map(async([k,p])=>[k,await readFile(p,'utf8')])));
for(const marker of ['SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V3','itws-dock-workspace','itws-dock-panel','itws-dock-splitter'])if(!source.workspaceCss.includes(marker))throw new Error(`Dockable workspace CSS missing ${marker}`);
for(const marker of ['SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V3','itwsWorkspaceIdeButton','itwsWorkspacePreviewButton','SulandraDockableWorkspace','/workspace/ticket'])if(!source.workspaceJs.includes(marker))throw new Error(`Dockable workspace JavaScript missing ${marker}`);
for(const marker of ['SULANDRA_DOCK_RESIZE_CAPTURE_V6','pointerdown','pointermove','pointerup'])if(!source.resizeJs.includes(marker))throw new Error(`Dock resize runtime missing ${marker}`);
for(const marker of ['SULANDRA_IT_STATUS_BOARD_V1','it-status-board','it-status-layout','#agent .examples'])if(!source.statusCss.includes(marker))throw new Error(`IT Agent Status Board CSS missing ${marker}`);
for(const marker of ['SULANDRA_IT_STATUS_BOARD_V1','itAgentStatusBoard','itStatusBoardToggle','Action Center','Operations','private model reasoning is never displayed'])if(!source.statusJs.includes(marker))throw new Error(`IT Agent Status Board JavaScript missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_IT_VISIBLE_NAV_V7','SULANDRA_CODEBASE_STANDALONE_LAUNCHER_V1','Sulandra IT owns the page','itwsSulandraCodebaseVisibleNav','openStandalone','window.open','CODEBASE_URL'])if(!source.codebaseNavJs.includes(marker))throw new Error(`Codebase standalone launcher missing ${marker}`);
for(const marker of ['SIA_GLOBAL_COPILOT_V1','Ask SIA'])if(!source.siaJs.includes(marker))throw new Error(`Ask SIA runtime missing ${marker}`);
if(/api\.github\.com|\/git\/trees\/|\/git\/blobs\//.test(source.codebaseNavJs))throw new Error('Codebase launcher must not call GitHub directly');
if(/localStorage\.setItem\([^\n]*(?:ticket|url|src)/i.test(source.workspaceJs+source.resizeJs+source.statusJs+source.codebaseNavJs))throw new Error('Engineering tools must not persist access tickets or frame URLs');

for(const required of [tags.workspaceCss,tags.statusCss,tags.workspaceJs,tags.statusJs,tags.codebaseNavJs,tags.resizeJs,siaCssTag,siaJsTag])if(!html.includes(required))throw new Error(`IT Solutions final publication tag missing: ${required}`);
const forbiddenCodebaseRuntime=/<(?:script|link)[^>]+(?:src|href)=["']\/assets\/(?:sulandra-codebase\.js|sulandra-codebase\.css|sulandra-codebase-native-grid-v3\.(?:js|css)|sulandra-codebase-right-dock-full-height\.css|sulandra-codebase-empty-workspace-ux\.js|sulandra-codebase-api-bridge\.js|sulandra-codebase-sia-bridge\.js)(?:\?[^"']*)?["'][^>]*>/i;
if(forbiddenCodebaseRuntime.test(html))throw new Error('Sulandra IT must not embed Codebase application runtimes; only the standalone launcher is allowed');
if(/id=["']itwsSulandraCodebaseFrame["']/.test(html))throw new Error('Sulandra IT must not publish an embedded Codebase iframe');
const siaScriptCount=(html.match(/<script[^>]+src=["']\/assets\/sia-copilot\.js(?:\?v=[^"']*)?["'][^>]*><\/script>/gi)||[]).length;
if(siaScriptCount!==1)throw new Error(`IT Solutions must publish exactly one executable Ask SIA runtime; found ${siaScriptCount}`);
if(/sia-copilot\.js[^>]*\bdefer\b/i.test(html))throw new Error('IT Solutions final Ask SIA runtime must not be deferred');
await writeFile(portalPath,html,'utf8');
console.log(`Dockable Engineering Workspace, persistent IT Agent Status Board, and standalone Sulandra Codebase browser launcher published into ${requested}`);