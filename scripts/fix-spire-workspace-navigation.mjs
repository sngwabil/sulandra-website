import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stationPath = path.join(root, 'assets', 'spire-client-station.js');
const masterPath = path.join(root, 'spire', 'master.html');
const routerPath = path.join(root, 'assets', 'spire-workspace-navigation.js');
const routeMarker = 'SPIRE_DURABLE_TOP_LEVEL_ROUTE_V2';
const legacyRouteMarker = 'SPIRE_DURABLE_TOP_LEVEL_ROUTE_V1';
const tabMarker = 'SPIRE_DURABLE_TAB_ROUTER_V1';
const scriptTag = `<script src="/assets/spire-workspace-navigation.js?v=20260816-durable-navigation-1" data-spire-navigation="${tabMarker}"></script>`;

let station = await readFile(stationPath, 'utf8');

if (!station.includes(routeMarker)) {
  const legacyNavigate = /  function navigateSpire\(url\) \{[\s\S]*?\n  \}\n\n  function openChart/;
  const generatedV1Navigate = /  \/\/ SPIRE_DURABLE_TOP_LEVEL_ROUTE_V1[\s\S]*?  async function navigateSpire\(url\) \{[\s\S]*?\n  \}\n\n  function openChart/;
  const replacement = `  // ${routeMarker}\n  // The authenticated SPIRE shell owns browser-native fullscreen. Internal Client\n  // Station → chart/chat navigation changes only the iframe route, so explicitly\n  // exiting fullscreen here would cause the inconsistent station-to-station collapse.\n  // Standalone top-level navigation may still leave native fullscreen by browser rule.\n  async function navigateSpire(url) {\n    const destination = String(url || '').trim();\n    if (!destination) return;\n    location.assign(destination);\n  }\n\n  function openChart`;

  if (generatedV1Navigate.test(station)) {
    station = station.replace(generatedV1Navigate, replacement);
  } else if (legacyNavigate.test(station)) {
    station = station.replace(legacyNavigate, replacement);
  } else {
    throw new Error('Spire Client Station navigation contract changed: navigateSpire implementation was not found');
  }

  station = station.replace(
    'Fullscreen chart/chat navigation is kept\n  // inside the active document so browser fullscreen does not collapse on route changes.',
    'Chart/chat navigation uses durable shell-owned routes so authenticated fullscreen\n  // remains stable while the selected clinical workspace changes.'
  );
  station = station.replace(
    'Chart/chat navigation uses durable top-level routes so browser refresh preserves\n  // the active clinical workspace and selected patient route.',
    'Chart/chat navigation uses durable shell-owned routes so browser refresh preserves\n  // the active clinical workspace without explicitly collapsing fullscreen.'
  );
  await writeFile(stationPath, station, 'utf8');
}

station = await readFile(stationPath, 'utf8');
for (const required of [routeMarker, 'location.assign(destination)']) {
  if (!station.includes(required)) throw new Error(`Spire durable top-level navigation verification failed: missing ${required}`);
}
for (const forbidden of ['spireFullscreenRouteFrame', 'document.exitFullscreen', legacyRouteMarker]) {
  if (station.includes(forbidden)) throw new Error(`Spire durable top-level navigation verification failed: stale fullscreen navigation remains: ${forbidden}`);
}

const router = await readFile(routerPath, 'utf8');
for (const required of [tabMarker, 'window.activateView', "sessionStorage.setItem('spire:active-view'", "document.addEventListener('click'"]) {
  if (!router.includes(required)) throw new Error(`Spire durable tab router verification failed: missing ${required}`);
}
const syntax = spawnSync(process.execPath, ['--check', routerPath], { encoding: 'utf8' });
if (syntax.status !== 0) {
  throw new Error(`Spire durable tab router syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);
}

let master = await readFile(masterPath, 'utf8');
if (!master.includes('/assets/spire-workspace-navigation.js')) {
  if (!master.includes('</body>')) throw new Error('Spire master chart does not contain </body> for durable tab router publication');
  master = master.replace('</body>', `  ${scriptTag}\n</body>`);
  await writeFile(masterPath, master, 'utf8');
}

master = await readFile(masterPath, 'utf8');
if (!master.includes('/assets/spire-workspace-navigation.js') || !master.includes(tabMarker)) {
  throw new Error('Spire durable tab router was not published to the master chart');
}

console.log('Spire durable navigation v2 installed: chart tabs use a capture-safe router and shell-owned fullscreen remains stable across Client Station → chart/chat navigation.');
