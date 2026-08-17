import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stationRuntimePath = path.join(root, 'assets', 'spire-client-station.js');
const stationHtmlPath = path.join(root, 'spire', 'client-station.html');
const marker = 'SPIRE_UNIFIED_FULLSCREEN_SHELL_V7';
const stationVersion = '20260817-unified-fullscreen-shell-v7-1';

let source = await readFile(stationRuntimePath, 'utf8');

if (!source.includes(marker)) {
  const current = `  function navigateSpire(url) {\n    if (!document.fullscreenElement) {\n      location.assign(url);\n      return;\n    }\n    let frame = document.getElementById('spireFullscreenRouteFrame');\n    if (!frame) {\n      frame = document.createElement('iframe');\n      frame.id = 'spireFullscreenRouteFrame';\n      frame.title = 'S.P.I.R.E. workspace';\n      frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff;z-index:2147483000';\n      document.body.appendChild(frame);\n    }\n    frame.src = url;\n  }\n`;

  if (!source.includes(current)) {
    throw new Error('Spire unified fullscreen shell v7 could not find the canonical Client Station navigation block');
  }

  const replacement = `  // ${marker}: Client Station remains the one top-level Spire document.\n  // Patient charts and Secure Chat always navigate inside this shell so browser\n  // fullscreen belongs to one continuous app session instead of separate pages.\n  function closeSpireWorkspace() {\n    const frame = document.getElementById('spireFullscreenRouteFrame');\n    if (frame) frame.remove();\n    window.SpireUserPreferences?.syncFullscreenButtons?.();\n  }\n\n  function getSpireWorkspaceFrame() {\n    let frame = document.getElementById('spireFullscreenRouteFrame');\n    if (frame) return frame;\n\n    frame = document.createElement('iframe');\n    frame.id = 'spireFullscreenRouteFrame';\n    frame.name = 'spireWorkspaceFrame';\n    frame.title = 'Spire clinical workspace';\n    frame.allowFullscreen = true;\n    frame.setAttribute('allow', 'fullscreen');\n    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:#081427;z-index:2147483000';\n    frame.addEventListener('load', () => {\n      try {\n        const childPath = frame.contentWindow?.location?.pathname || '';\n        // Chart-side Client Station navigation returns to the existing parent shell\n        // instead of creating a nested Client Station inside the workspace frame.\n        if (/\\/spire\\/client-station\\.html$/i.test(childPath)) {\n          closeSpireWorkspace();\n        }\n      } catch {}\n    });\n    document.body.appendChild(frame);\n    return frame;\n  }\n\n  function navigateSpire(url) {\n    const frame = getSpireWorkspaceFrame();\n    frame.src = url;\n  }\n\n  window.SpireClientStationShell = Object.freeze({\n    marker: '${marker}',\n    open: navigateSpire,\n    close: closeSpireWorkspace,\n    active: () => Boolean(document.getElementById('spireFullscreenRouteFrame'))\n  });\n`;

  source = source.replace(current, replacement);
}

for (const required of [
  marker,
  'getSpireWorkspaceFrame',
  'closeSpireWorkspace',
  'SpireClientStationShell',
  "frame.setAttribute('allow', 'fullscreen')",
  "frame.src = url",
  '/\\/spire\\/client-station\\.html$/i',
]) {
  if (!source.includes(required)) throw new Error(`Spire unified fullscreen shell v7 verification failed: missing ${required}`);
}

if (source.includes("if (!document.fullscreenElement) {\n      location.assign(url);")) {
  throw new Error('Spire unified fullscreen shell v7 verification failed: top-level chart navigation fallback still exists');
}

await writeFile(stationRuntimePath, source, 'utf8');
const syntax = spawnSync(process.execPath, ['--check', stationRuntimePath], { encoding: 'utf8' });
if (syntax.status !== 0) {
  throw new Error(`Spire unified fullscreen shell v7 syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);
}

let stationHtml = await readFile(stationHtmlPath, 'utf8');
const stationScriptPattern = /<script src="\/assets\/spire-client-station\.js(?:\?v=[^"]+)?"><\/script>/;
if (!stationScriptPattern.test(stationHtml)) {
  throw new Error('Spire unified fullscreen shell v7 could not find the Client Station runtime tag for cache publication');
}
stationHtml = stationHtml.replace(
  stationScriptPattern,
  `<script src="/assets/spire-client-station.js?v=${stationVersion}"></script>`
);
await writeFile(stationHtmlPath, stationHtml, 'utf8');

const verifiedHtml = await readFile(stationHtmlPath, 'utf8');
if (!verifiedHtml.includes(`/assets/spire-client-station.js?v=${stationVersion}`)) {
  throw new Error('Spire unified fullscreen shell v7 cache version was not published to Client Station');
}

console.log('Spire unified fullscreen shell v7 installed: Client Station remains the top-level fullscreen owner while chart and chat navigation stay inside one continuous Spire shell.');
