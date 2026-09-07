import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve(process.argv[2] || 'Codebase.html');
const runtime = path.resolve('assets/codebase-project-manager.js');
const explorerBridge = path.resolve('assets/codebase-explorer-global-bridge.js');
const explorerRuntime = path.resolve('assets/codebase-explorer-file-management.js');
const removalGuard = path.resolve('assets/codebase-project-removal-guard.js');
const manageRuntime = path.resolve('assets/codebase-project-manage-tab.js');
await access(target);
await access(runtime);
await access(explorerBridge);
await access(explorerRuntime);
await access(removalGuard);
await access(manageRuntime);
const source = await readFile(runtime, 'utf8');
const bridgeSource = await readFile(explorerBridge, 'utf8');
let explorerSource = await readFile(explorerRuntime, 'utf8');
const guardSource = await readFile(removalGuard, 'utf8');
const manageSource = await readFile(manageRuntime, 'utf8');
for (const marker of [
  'CODEBASE_PROJECT_MANAGER_UI_V1',
  "'/codebase'+path",
  "'/projects/clone'",
  "'/git/commit'",
  "'/railway/deploy'",
  'sulandra:codebase:active-project:v1',
  'Deploy as New Railway Project',
  'Connect Existing + Deploy',
]) {
  if (!source.includes(marker)) throw new Error(`Codebase project manager runtime missing ${marker}`);
}
for (const marker of [
  'CODEBASE_EXPLORER_GLOBAL_BRIDGE_V1',
  'CODEBASE_EXPLORER_FILTER_V2',
  "expose('openTabs'",
  "expose('activeEditors'",
  "get:()=>renderWorkspace",
  '__CODEBASE_EXPLORER_FILTER_EVENTS_V2__',
  "style.setProperty('display','none','important')",
]) {
  if (!bridgeSource.includes(marker)) throw new Error(`Codebase Explorer bridge missing ${marker}`);
}
for (const marker of [
  'CODEBASE_EXPLORER_FILE_MANAGEMENT_V2',
  'Move to Folder…',
  'Search folders…',
  'Upload Files…',
  'Upload Files Here…',
  'ensureExplorerToolbar',
  "projectApi('/upload/start'",
  "projectApi('/upload/chunk'",
  "projectApi('/upload/finish'",
  "addEventListener('contextmenu'",
  "addEventListener('dragstart'",
  "projectApi('/move'",
]) {
  if (!explorerSource.includes(marker)) throw new Error(`Codebase Explorer file management runtime missing ${marker}`);
}
if (!guardSource.includes('CODEBASE_PROJECT_REMOVAL_GUARD_V1')) {
  throw new Error('Codebase project removal guard marker is missing');
}
for (const marker of [
  'CODEBASE_PROJECT_MANAGE_TAB_V1',
  'CODEBASE_PROJECT_MANAGE_NATIVE_V3',
  '__CODEBASE_PROJECT_MANAGE_TAB_V3__',
  '__CODEBASE_PROJECT_MANAGE_CAPTURE_V3__',
  'codebase-header-definition-lines-v3',
  'sidebar-manage',
  'PROJECTS & FOLDERS',
  'ALL PROJECTS',
  "setAttribute('onclick'",
  "document.addEventListener('pointerup',captureManage,true)",
]) {
  if (!manageSource.includes(marker)) throw new Error(`Codebase Manage runtime missing ${marker}`);
}

// The permanent Explorer header delegates to these public runtime actions.
// Expose create-file/create-folder in the published artifact alongside the
// existing upload/move operations. Existing cached V2 runtimes remain safe
// because ensureExplorerToolbar already binds all four actions directly.
const explorerApiOld = 'window.SulandraCodebaseExplorerFiles={refresh:refreshExplorer,move:movePath,rename:renamePath,duplicate:duplicatePath,remove:deletePath,moveToFolder:showFolderPicker,upload:uploadFiles};';
const explorerApiNew = 'window.SulandraCodebaseExplorerFiles={createFile,createFolder,refresh:refreshExplorer,move:movePath,rename:renamePath,duplicate:duplicatePath,remove:deletePath,moveToFolder:showFolderPicker,upload:uploadFiles};';
if (explorerSource.includes(explorerApiOld)) {
  explorerSource = explorerSource.replace(explorerApiOld, explorerApiNew);
  await writeFile(explorerRuntime, explorerSource, 'utf8');
}
if (!explorerSource.includes(explorerApiNew)) throw new Error('Codebase Explorer public create/upload action surface is missing');

let html = await readFile(target, 'utf8');

// Publish the four Explorer controls in the canonical HTML itself so they are
// visible immediately and cannot disappear merely because a late runtime did
// not repaint the sidebar header. Match the header after backend-adapter
// publication too (its New Folder handler is intentionally rewritten there).
const explorerHeaderPattern = /<div class="sidebar-header" id="sidebar-title-text" style="display: flex; gap: 8px; align-items: center;">\s*EXPLORER\s*<div style="display: flex; gap: 8px; color: var\(--cb-blue\);">[\s\S]*?<\/div>\s*<\/div>/;
const nativeExplorerHeader = `<div class="sidebar-header" id="sidebar-title-text" style="display: flex; gap: 8px; align-items: center;">
        EXPLORER
        <div id="codebase-explorer-actions" style="display:flex;gap:8px;align-items:center;margin-left:auto;color:var(--cb-blue);">
          <span style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-width:16px;" title="New File" onclick="window.SulandraCodebaseExplorerFiles?.createFile?.('')">📄</span>
          <span style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-width:16px;" title="New Folder" onclick="window.SulandraCodebaseExplorerFiles?.createFolder?.('')">📁</span>
          <span style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-width:16px;" title="Upload Files" onclick="window.SulandraCodebaseExplorerFiles?.upload?.('')">⇧</span>
          <span style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-width:16px;" title="Refresh" onclick="window.SulandraCodebaseExplorerFiles?.refresh?.()">⟳</span>
        </div>
      </div>`;
if (!html.includes('id="codebase-explorer-actions"')) {
  if (!explorerHeaderPattern.test(html)) throw new Error('Legacy Explorer header changed; permanent toolbar cannot be published safely');
  html = html.replace(explorerHeaderPattern, nativeExplorerHeader);
}

// Legacy switchSidebar used innerText on the whole header, which deleted every
// Explorer action whenever the user visited another sidebar and came back.
// Update only the leading title text node and show/hide the permanent actions.
const legacySidebarTitleUpdate = "    document.getElementById('sidebar-title-text').innerText = titleMap[viewId] || 'EXPLORER';";
const durableSidebarTitleUpdate = `    const sidebarTitle = document.getElementById('sidebar-title-text');
    if (sidebarTitle) {
      const titleTextNode = [...sidebarTitle.childNodes].find(node => node.nodeType === Node.TEXT_NODE && String(node.nodeValue || '').trim());
      if (titleTextNode) titleTextNode.nodeValue = '\\n        ' + (titleMap[viewId] || 'EXPLORER') + '\\n        ';
      else sidebarTitle.prepend(document.createTextNode(titleMap[viewId] || 'EXPLORER'));
    }
    const explorerActions = document.getElementById('codebase-explorer-actions');
    if (explorerActions) explorerActions.style.display = viewId === 'explorer' ? 'flex' : 'none';`;
if (html.includes(legacySidebarTitleUpdate)) html = html.replace(legacySidebarTitleUpdate, durableSidebarTitleUpdate);

if (!html.includes('id="codebase-explorer-actions"')) throw new Error('Permanent Explorer action toolbar was not published');
if (!html.includes('title="Upload Files"')) throw new Error('Permanent Explorer Upload control was not published');
if (html.includes(legacySidebarTitleUpdate)) throw new Error('Legacy destructive Explorer title rewrite is still present');

const tag = '<script src="/assets/codebase-project-manager.js?v=20260905-project-manager-1"></script>';
const bridgeTag = '<script src="/assets/codebase-explorer-global-bridge.js?v=20260906-explorer-filter-2"></script>';
const explorerTag = '<script src="/assets/codebase-explorer-file-management.js?v=20260906-explorer-upload-2"></script>';
const guardTag = '<script src="/assets/codebase-project-removal-guard.js?v=20260905-remove-reclone-1"></script>';
const manageTag = '<script src="/assets/codebase-project-manage-tab.js?v=20260906-manage-projects-3"></script>';
html = html.replace(/\s*<script src="\/assets\/codebase-project-manager\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-explorer-global-bridge\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-explorer-file-management\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-project-removal-guard\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-project-manage-tab\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
const durabilityPattern = /<script src="\/assets\/codebase-terminal-session-durability\.js(?:\?v=[^\"]*)?"><\/script>/;
const match = html.match(durabilityPattern);
if (!match) throw new Error('Codebase terminal durability runtime must be present before project manager publication');
html = html.replace(durabilityPattern, `${tag}\n${bridgeTag}\n${explorerTag}\n${guardTag}\n${manageTag}\n${match[0]}`);

const tagIndex = html.indexOf(tag);
const bridgeIndex = html.indexOf(bridgeTag, tagIndex + tag.length);
const explorerIndex = html.indexOf(explorerTag, bridgeIndex + bridgeTag.length);
const guardIndex = html.indexOf(guardTag, explorerIndex + explorerTag.length);
const manageIndex = html.indexOf(manageTag, guardIndex + guardTag.length);
const durabilityIndex = html.indexOf(match[0], manageIndex + manageTag.length);
const bodyIndex = html.toLowerCase().lastIndexOf('</body>');
if (tagIndex < 0 || bridgeIndex <= tagIndex || explorerIndex <= bridgeIndex || guardIndex <= explorerIndex || manageIndex <= guardIndex || durabilityIndex <= manageIndex || bodyIndex <= durabilityIndex) {
  throw new Error('Codebase project manager publication order is invalid');
}
if (html.indexOf(tag, tagIndex + tag.length) !== -1) throw new Error('Codebase project manager must be published exactly once');
if (html.indexOf(bridgeTag, bridgeIndex + bridgeTag.length) !== -1) throw new Error('Codebase Explorer bridge must be published exactly once');
if (html.indexOf(explorerTag, explorerIndex + explorerTag.length) !== -1) throw new Error('Codebase Explorer file management must be published exactly once');
if (html.indexOf(guardTag, guardIndex + guardTag.length) !== -1) throw new Error('Codebase project removal guard must be published exactly once');
if (html.indexOf(manageTag, manageIndex + manageTag.length) !== -1) throw new Error('Codebase Manage runtime must be published exactly once');
await writeFile(target, html, 'utf8');
console.log(`Published Codebase project manager, permanent Explorer controls/uploads, removal guard, and Manage tab before terminal durability runtime in ${target}`);
