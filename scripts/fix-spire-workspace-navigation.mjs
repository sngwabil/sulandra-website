import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stationPath = path.join(root, 'assets', 'spire-client-station.js');
const masterPath = path.join(root, 'spire', 'master.html');
const routerPath = path.join(root, 'assets', 'spire-workspace-navigation.js');
const routeMarker = 'SPIRE_DURABLE_TOP_LEVEL_ROUTE_V1';
const tabMarker = 'SPIRE_DURABLE_TAB_ROUTER_V1';
const scriptTag = `<script src="/assets/spire-workspace-navigation.js?v=20260816-durable-navigation-1" data-spire-navigation="${tabMarker}"></script>`;

let station = await readFile(stationPath, 'utf8');

if (!station.includes(routeMarker)) {
  const legacyNavigate = /  function navigateSpire\(url\) \{[\s\S]*?\n  \}\n\n  function openChart/;
  if (!legacyNavigate.test(station)) {
    throw new Error('Spire Client Station navigation contract changed: legacy navigateSpire implementation was not found');
  }
  station = station.replace(
    legacyNavigate,
    `  // ${routeMarker}\n  // The browser URL must always represent the active clinical workspace. A chart\n  // opened inside a transient fullscreen iframe disappears on browser refresh and\n  // returns the user to Client Station, so chart/chat navigation is always top-level.\n  async function navigateSpire(url) {\n    const destination = String(url || '').trim();\n    if (!destination) return;\n    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {\n      try {\n        await document.exitFullscreen();\n      } catch (error) {\n        console.warn('[Spire Client Station] Unable to leave fullscreen before route navigation.', error);\n      }\n    }\n    location.assign(destination);\n  }\n\n  function openChart`
  );

  station = station.replace(
    'Fullscreen chart/chat navigation is kept\n  // inside the active document so browser fullscreen does not collapse on route changes.',
    'Chart/chat navigation uses durable top-level routes so browser refresh preserves\n  // the active clinical workspace and selected patient route.'
  );
  await writeFile(stationPath, station, 'utf8');
}

station = await readFile(stationPath, 'utf8');
for (const required of [routeMarker, 'document.exitFullscreen', 'location.assign(destination)']) {
  if (!station.includes(required)) throw new Error(`Spire durable top-level navigation verification failed: missing ${required}`);
}
if (station.includes('spireFullscreenRouteFrame')) {
  throw new Error('Spire durable top-level navigation verification failed: transient fullscreen route iframe is still present');
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

console.log('Spire durable navigation installed: chart tabs use a capture-safe router and Client Station opens chart/chat as refresh-safe top-level routes.');
