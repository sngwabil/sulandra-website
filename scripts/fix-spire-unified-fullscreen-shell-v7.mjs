import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellRuntimePath = path.join(root, 'assets', 'spire-unified-fullscreen-shell-v7.js');
const stationHtmlPath = path.join(root, 'spire', 'client-station.html');
const marker = 'SPIRE_UNIFIED_FULLSCREEN_SHELL_V7';
const shellVersion = '20260817-unified-fullscreen-shell-v7-3';
const shellSrc = '/assets/spire-unified-fullscreen-shell-v7.js';
const shellTag = `<script src="${shellSrc}?v=${shellVersion}" data-spire-unified-fullscreen-shell="${marker}"></script>`;

// The fullscreen shell is a standalone runtime. Do not rewrite the canonical
// Client Station JavaScript during build:web: earlier installers may transform
// that file, which made text-anchor patching brittle and caused Railway failures.
await access(shellRuntimePath);
const shellSource = await readFile(shellRuntimePath, 'utf8');
for (const required of [
  marker,
  'SpireClientStationShell',
  'spireFullscreenRouteFrame',
  "document.addEventListener('dblclick', interceptNavigation, true)",
  "document.addEventListener('click', interceptNavigation, true)",
  "document.addEventListener('keydown', interceptNavigation, true)",
  "frame.setAttribute('allow', 'fullscreen')",
  "frame.src = kind === 'chat'",
  'closeSpireWorkspace',
]) {
  if (!shellSource.includes(required)) {
    throw new Error(`Spire unified fullscreen shell v7 runtime missing ${required}`);
  }
}

const syntax = spawnSync(process.execPath, ['--check', shellRuntimePath], { encoding: 'utf8' });
if (syntax.status !== 0) {
  throw new Error(`Spire unified fullscreen shell v7 syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);
}

let stationHtml = await readFile(stationHtmlPath, 'utf8');
const stationScriptPattern = /<script src="\/assets\/spire-client-station\.js(?:\?v=[^"]+)?"><\/script>/;
if (!stationScriptPattern.test(stationHtml)) {
  throw new Error('Spire unified fullscreen shell v7 could not find the canonical Client Station runtime tag');
}

// Remove any previous publication, then mount the shell after Client Station.
stationHtml = stationHtml.replace(
  /\s*<script src="\/assets\/spire-unified-fullscreen-shell-v7\.js(?:\?v=[^"]+)?"[^>]*><\/script>\s*/g,
  '\n'
);
stationHtml = stationHtml.replace(
  stationScriptPattern,
  (match) => `${match}\n  ${shellTag}`
);
await writeFile(stationHtmlPath, stationHtml, 'utf8');

const verifiedHtml = await readFile(stationHtmlPath, 'utf8');
const stationAt = verifiedHtml.indexOf('/assets/spire-client-station.js');
const shellAt = verifiedHtml.indexOf(`${shellSrc}?v=${shellVersion}`);
if (stationAt < 0 || shellAt < 0 || shellAt <= stationAt || !verifiedHtml.includes(marker)) {
  throw new Error('Spire unified fullscreen shell v7 was not published after Client Station runtime');
}

console.log('Spire unified fullscreen shell v7 published as a standalone runtime: Client Station remains the fullscreen owner and chart/chat navigation stays inside one continuous Spire shell without build-time rewriting of Client Station JavaScript.');
