import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const target = path.resolve(process.argv[2] || 'Codebase.html');
const runtime = path.resolve('assets/codebase-project-manager.js');
const removalGuard = path.resolve('assets/codebase-project-removal-guard.js');
await access(target);
await access(runtime);
await access(removalGuard);
const source = await readFile(runtime, 'utf8');
const guardSource = await readFile(removalGuard, 'utf8');
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
if (!guardSource.includes('CODEBASE_PROJECT_REMOVAL_GUARD_V1')) {
  throw new Error('Codebase project removal guard marker is missing');
}

let html = await readFile(target, 'utf8');
const tag = '<script src="/assets/codebase-project-manager.js?v=20260905-project-manager-1"></script>';
const guardTag = '<script src="/assets/codebase-project-removal-guard.js?v=20260905-remove-reclone-1"></script>';
html = html.replace(/\s*<script src="\/assets\/codebase-project-manager\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
html = html.replace(/\s*<script src="\/assets\/codebase-project-removal-guard\.js(?:\?v=[^\"]*)?"><\/script>\s*/g, '\n');
const durabilityPattern = /<script src="\/assets\/codebase-terminal-session-durability\.js(?:\?v=[^\"]*)?"><\/script>/;
const match = html.match(durabilityPattern);
if (!match) throw new Error('Codebase terminal durability runtime must be present before project manager publication');
html = html.replace(durabilityPattern, `${tag}\n${guardTag}\n${match[0]}`);

const tagIndex = html.indexOf(tag);
const guardIndex = html.indexOf(guardTag, tagIndex + tag.length);
const durabilityIndex = html.indexOf(match[0], guardIndex + guardTag.length);
const bodyIndex = html.toLowerCase().lastIndexOf('</body>');
if (tagIndex < 0 || guardIndex <= tagIndex || durabilityIndex <= guardIndex || bodyIndex <= durabilityIndex) {
  throw new Error('Codebase project manager publication order is invalid');
}
if (html.indexOf(tag, tagIndex + tag.length) !== -1) throw new Error('Codebase project manager must be published exactly once');
if (html.indexOf(guardTag, guardIndex + guardTag.length) !== -1) throw new Error('Codebase project removal guard must be published exactly once');
await writeFile(target, html, 'utf8');
console.log(`Published Codebase project manager and removal guard before terminal durability runtime in ${target}`);
