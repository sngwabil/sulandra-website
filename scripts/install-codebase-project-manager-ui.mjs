import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve(process.argv[2] || 'Codebase.html');
const runtime = path.resolve('assets/codebase-project-manager.js');
const explorerRuntime = path.resolve('assets/codebase-explorer-file-management.js');
const removalGuard = path.resolve('assets/codebase-project-removal-guard.js');
const manageRuntime = path.resolve('assets/codebase-project-manage-tab.js');
await access(target);
await access(runtime);
await access(explorerRuntime);
await access(removalGuard);
await access(manageRuntime);
const source = await readFile(runtime, 'utf8');
const explorerSource = await readFile(explorerRuntime, 'utf8');
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
  'CODEBASE_EXPLORER_FILE_MANAGEMENT_V1',
  'Move to Folder…',
  'Search folders…',
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

let html = await readFile(target, 'utf8');
const tag = '<script src="/assets/codebase-project-manager.js?v=20260905-project-manager-1"></script>';
const explorerTag = '<script src="/assets/codebase-explorer-file-management.js?v=20260906-explorer-files-1"></script>';
const guardTag = '<script src="/assets/codebase-project-removal-guard.js?v=20260905-remove-reclone-1"></script>';
const manageTag = '<script src="/assets/codebase-project-manage-tab.js?v=20260906-manage-projects-3"></script>';
html = html.replace(/\s*<script src="\/assets\/codebase-project-manager\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-explorer-file-management\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-project-removal-guard\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-project-manage-tab\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
const durabilityPattern = /<script src="\/assets\/codebase-terminal-session-durability\.js(?:\?v=[^\"]*)?"><\/script>/;
const match = html.match(durabilityPattern);
if (!match) throw new Error('Codebase terminal durability runtime must be present before project manager publication');
html = html.replace(durabilityPattern, `${tag}\n${explorerTag}\n${guardTag}\n${manageTag}\n${match[0]}`);

const tagIndex = html.indexOf(tag);
const explorerIndex = html.indexOf(explorerTag, tagIndex + tag.length);
const guardIndex = html.indexOf(guardTag, explorerIndex + explorerTag.length);
const manageIndex = html.indexOf(manageTag, guardIndex + guardTag.length);
const durabilityIndex = html.indexOf(match[0], manageIndex + manageTag.length);
const bodyIndex = html.toLowerCase().lastIndexOf('</body>');
if (tagIndex < 0 || explorerIndex <= tagIndex || guardIndex <= explorerIndex || manageIndex <= guardIndex || durabilityIndex <= manageIndex || bodyIndex <= durabilityIndex) {
  throw new Error('Codebase project manager publication order is invalid');
}
if (html.indexOf(tag, tagIndex + tag.length) !== -1) throw new Error('Codebase project manager must be published exactly once');
if (html.indexOf(explorerTag, explorerIndex + explorerTag.length) !== -1) throw new Error('Codebase Explorer file management must be published exactly once');
if (html.indexOf(guardTag, guardIndex + guardTag.length) !== -1) throw new Error('Codebase project removal guard must be published exactly once');
if (html.indexOf(manageTag, manageIndex + manageTag.length) !== -1) throw new Error('Codebase Manage runtime must be published exactly once');
await writeFile(target, html, 'utf8');
console.log(`Published Codebase project manager, Explorer file management, removal guard, and Manage tab before terminal durability runtime in ${target}`);
