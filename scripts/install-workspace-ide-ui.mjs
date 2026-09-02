import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.argv[2]||'it-solutions.html';
const portalPath=path.resolve(root,requested);
const cssPath=path.join(root,'assets','it-agent-workspace-preview.css');
const jsPath=path.join(root,'assets','it-agent-workspace-preview.js');
const resizePath=path.join(root,'assets','it-agent-dock-resize.js');
const codebaseCssPath=path.join(root,'assets','sulandra-codebase.css');
const codebaseJsPath=path.join(root,'assets','sulandra-codebase.js');
const codebaseApiBridgePath=path.join(root,'assets','sulandra-codebase-api-bridge.js');
const codebaseSiaBridgePath=path.join(root,'assets','sulandra-codebase-sia-bridge.js');
const siaCssPath=path.join(root,'assets','sia-copilot.css');
const siaJsPath=path.join(root,'assets','sia-copilot.js');
await Promise.all([access(portalPath),access(cssPath),access(jsPath),access(resizePath),access(codebaseCssPath),access(codebaseJsPath),access(codebaseApiBridgePath),access(codebaseSiaBridgePath),access(siaCssPath),access(siaJsPath)]);
let html=await readFile(portalPath,'utf8');
const cssTag='<link rel="stylesheet" href="/assets/it-agent-workspace-preview.css?v=20260901-dockable-workspace-3">';
const jsTag='<script src="/assets/it-agent-workspace-preview.js?v=20260901-dockable-workspace-4"></script>';
const resizeTag='<script src="/assets/it-agent-dock-resize.js?v=20260901-dock-resize-6"></script>';
const codebaseCssTag='<link rel="stylesheet" href="/assets/sulandra-codebase.css?v=20260902-codebase-4-terminal-flex">';
const codebaseDockRailStyle='<style data-scb-dock-rail="20260902-1">.scb-shell.scb-dock-closed .scb-workspace{grid-template-columns:var(--scb-left) 5px minmax(0,1fr) 0 168px!important}.scb-shell.scb-dock-closed .scb-right-dock{visibility:visible!important;pointer-events:auto!important;grid-template-rows:36px 0 minmax(0,0)!important}.scb-shell.scb-dock-closed .scb-right-splitter{visibility:hidden!important;pointer-events:none!important}.scb-shell.scb-dock-closed .scb-dock-subhead,.scb-shell.scb-dock-closed .scb-dock-mount{display:none!important}</style>';
const codebaseTerminalSizingStyle='<style data-scb-terminal-sizing="20260902-1">#scbTerminalMount>.scb-terminal-integrated{display:flex!important;flex-direction:column!important;align-items:stretch!important;height:100%!important;min-height:0!important}#scbTerminalMount>.scb-terminal-integrated>#itwsRtShell{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;height:auto!important;min-height:0!important;overflow:hidden!important}#scbTerminalMount>.scb-terminal-integrated>#itwsRtShell>#itwsXtermHost{flex:1 1 auto!important;align-self:stretch!important;height:auto!important;min-height:120px!important}</style>';
const codebaseJsTag='<script src="/assets/sulandra-codebase.js?v=20260902-codebase-4-terminal-flex"></script>';
const codebaseApiBridgeTag='<script src="/assets/sulandra-codebase-api-bridge.js?v=20260902-codebase-api-3-env-aware"></script>';
const codebaseSiaBridgeTag='<script src="/assets/sulandra-codebase-sia-bridge.js?v=20260902-codebase-sia-fullscreen-2"></script>';
const siaMarker='data-sia-global-copilot="20260827-sia-intelligence-router-1"';
const siaCssTag=`<link rel="stylesheet" href="/assets/sia-copilot.css?v=20260827-sia-intelligence-router-1" ${siaMarker} />`;
// Keep the canonical runtime synchronous at the true end of body. IT Solutions
// has a large legacy publication stack; deferring SIA allowed the fullscreen
// bridge and late normalizers to race the copilot bootstrap. A single classic
// script here executes deterministically before the bridge.
const siaJsTag=`<script src="/assets/sia-copilot.js?v=20260827-sia-intelligence-router-1" ${siaMarker}></script>`;
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/it-agent-workspace-preview\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-workspace-preview\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/it-agent-dock-resize\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
html=html.replace(/\s*<link rel="stylesheet" href="\/assets\/sulandra-codebase\.css(?:\?v=[^"']+)?">\s*/g,'\n');
html=html.replace(/\s*<style data-scb-dock-rail=["'][^"']+["']>[\s\S]*?<\/style>\s*/g,'\n');
html=html.replace(/\s*<style data-scb-terminal-sizing=["'][^"']+["']>[\s\S]*?<\/style>\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/sulandra-codebase\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/sulandra-codebase-api-bridge\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
html=html.replace(/\s*<script src="\/assets\/sulandra-codebase-sia-bridge\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
// IT Solutions is rewritten after the global publication pass. Remove every
// earlier SIA publication before adding one canonical copy below.
html=html.replace(/\s*<link[^>]+href=["']\/assets\/sia-copilot\.css(?:\?v=[^"']*)?["'][^>]*>\s*/gi,'\n');
html=html.replace(/\s*<script[^>]+src=["']\/assets\/sia-copilot\.js(?:\?v=[^"']*)?["'][^>]*><\/script>\s*/gi,'\n');
if(!html.includes('</head>')||!html.includes('</body>'))throw new Error('IT Solutions publication anchors changed');
html=html.replace('</head>',`${siaCssTag}${cssTag}${codebaseCssTag}${codebaseDockRailStyle}${codebaseTerminalSizingStyle}</head>`).replace('</body>',`${jsTag}${codebaseJsTag}${codebaseApiBridgeTag}${resizeTag}${siaJsTag}${codebaseSiaBridgeTag}</body>`);
const css=await readFile(cssPath,'utf8');
const js=await readFile(jsPath,'utf8');
const resize=await readFile(resizePath,'utf8');
const codebaseCss=await readFile(codebaseCssPath,'utf8');
const codebaseJs=await readFile(codebaseJsPath,'utf8');
const codebaseApiBridge=await readFile(codebaseApiBridgePath,'utf8');
const codebaseSiaBridge=await readFile(codebaseSiaBridgePath,'utf8');
const siaCss=await readFile(siaCssPath,'utf8');
const siaJs=await readFile(siaJsPath,'utf8');
for(const marker of ['SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V3','itws-dock-workspace','itws-dock-panel','itws-dock-splitter','itws-panel-maximized','itws-native-fullscreen-panel'])if(!css.includes(marker))throw new Error(`Dockable workspace CSS missing ${marker}`);
for(const marker of ['SULANDRA_DOCKABLE_ENGINEERING_WORKSPACE_V3','itwsWorkspaceIdeButton','itwsWorkspacePreviewButton','/workspace/ticket','SulandraDockableWorkspace','SulandraWorkspacePreview','itws-dock-splitter','maximizePanel','restorePanel','reopenFromNavigation','document.body.appendChild','9000','13337'])if(!js.includes(marker))throw new Error(`Dockable workspace JavaScript missing ${marker}`);
for(const marker of ['SULANDRA_DOCK_RESIZE_CAPTURE_V6','itws-dock-drag-shield','pointerdown','pointermove','pointerup','itws-dock-resizing'])if(!resize.includes(marker))throw new Error(`Dock resize runtime missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_V2','scb-shell','scb-workspace','scb-terminal-deck','scb-dock-tabs','scb-term-divider','scb-editor-input'])if(!codebaseCss.includes(marker))throw new Error(`Sulandra Codebase CSS missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_V2','release/sulandra-1.0','itwsSulandraCodebaseButton','requestFullscreen','openCodebaseFromGesture','SulandraDockableWorkspace','MAX_FILE_BYTES','blockedPath','/api/it-solutions/codebase/tree','/api/it-solutions/codebase/file','terminalLayout','openIntegratedTerminal','saveCurrentToWorkspace','commitWorkspace','activateDock'])if(!codebaseJs.includes(marker))throw new Error(`Sulandra Codebase JavaScript missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_API_BRIDGE_V3_ENV_AWARE','API_ORIGIN','CODEBASE_PATH','Authorization','Bearer ${bearer}','SulandraCompanyContext',"credentials:'omit'"])if(!codebaseApiBridge.includes(marker))throw new Error(`Sulandra Codebase API bridge missing ${marker}`);
for(const marker of ['SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1','fullscreenchange','sia-copilot-root','sulandraCodebase'])if(!codebaseSiaBridge.includes(marker))throw new Error(`Codebase Ask SIA fullscreen bridge missing ${marker}`);
for(const marker of ['SIA_GLOBAL_COPILOT_V1','Ask SIA','siaxLauncher'])if(!siaJs.includes(marker))throw new Error(`Ask SIA runtime missing ${marker}`);
for(const marker of ['SIA_GLOBAL_COPILOT_V1','.siax-launcher'])if(!siaCss.includes(marker))throw new Error(`Ask SIA styles missing ${marker}`);
if(/api\.github\.com|\/git\/trees\/|\/git\/blobs\//.test(codebaseJs+codebaseApiBridge))throw new Error('Sulandra Codebase browser runtime must use the authenticated Sulandra API instead of direct GitHub API calls');
if(!codebaseApiBridge.includes("parsed.origin!==window.location.origin")||!codebaseApiBridge.includes("CODEBASE_PATH"))throw new Error('Sulandra Codebase API bridge must remain narrowly scoped to same-origin Codebase tree/file requests');
if(/localStorage\.setItem\([^\n]*(?:ticket|url|src)/i.test(js+resize+codebaseJs+codebaseApiBridge))throw new Error('Engineering workspace must not persist access tickets or frame URLs');
for(const required of [codebaseCssTag,codebaseDockRailStyle,codebaseTerminalSizingStyle,codebaseJsTag,codebaseApiBridgeTag,codebaseSiaBridgeTag,siaCssTag,siaJsTag])if(!html.includes(required))throw new Error(`IT Solutions final publication tag is missing: ${required}`);
const siaScriptCount=(html.match(/<script[^>]+src=["']\/assets\/sia-copilot\.js(?:\?v=[^"']*)?["'][^>]*><\/script>/gi)||[]).length;
if(siaScriptCount!==1)throw new Error(`IT Solutions must publish exactly one executable Ask SIA runtime; found ${siaScriptCount}`);
if(/sia-copilot\.js[^>]*\bdefer\b/i.test(html))throw new Error('IT Solutions final Ask SIA runtime must not be deferred');
await writeFile(portalPath,html,'utf8');
console.log(`Dockable Engineering Workspace, Sulandra Codebase persistent dock rail, stretched integrated terminal shell, synchronous global Ask SIA, and fullscreen SIA continuity published into ${requested}`);