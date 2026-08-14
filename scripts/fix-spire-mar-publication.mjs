import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = '20260814-mar-v4-live-2';
const MAR_ASSET = `/assets/spire-mar-timeline.js?v=${BUILD}`;
const STATION_ASSET = `/assets/spire-client-station.js?v=${BUILD}`;
const LOGIN_ASSET = `/assets/spire-login.js?v=${BUILD}`;
const MARKER = 'SPIRE_MAR_PUBLICATION_CACHE_BUST_V2';

async function edit(relative, transform) {
  const file = path.join(root, relative);
  const original = await readFile(file, 'utf8');
  const next = transform(original);
  if (next !== original) await writeFile(file, next, 'utf8');
  return next;
}

function requireContains(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label} is missing ${needle}`);
}

const accessibilitySuite = await edit('scripts/fix-spire-accessibility-suite.mjs', (source) => {
  const next = source.replace(
    /const marAsset = ['"]\/assets\/spire-mar-timeline\.js\?v=[^'"]+['"];/,
    `const marAsset = '${MAR_ASSET}';`,
  );
  if (!next.includes(`const marAsset = '${MAR_ASSET}';`)) throw new Error('SPIRE accessibility MAR asset anchor is missing');
  return next;
});
requireContains(accessibilitySuite, MAR_ASSET, 'SPIRE accessibility publication pass');

const finalizer = await edit('scripts/finalize-spire-client-station-publication.mjs', (source) => {
  const next = source
    .replace(/const marTimelineUrl = ['"]\/assets\/spire-mar-timeline\.js\?v=[^'"]+['"];/, `const marTimelineUrl = '${MAR_ASSET}';`)
    .replaceAll('/assets/spire-login.js?v=20260813-exact-workflow-1', LOGIN_ASSET);
  if (!next.includes(`const marTimelineUrl = '${MAR_ASSET}';`)) throw new Error('SPIRE final publication MAR URL anchor is missing');
  if (!next.includes(LOGIN_ASSET)) throw new Error('SPIRE final publication login URL anchor is missing');
  return next;
});
requireContains(finalizer, MAR_ASSET, 'SPIRE final publication pass');
requireContains(finalizer, LOGIN_ASSET, 'SPIRE final publication pass');

const platformContractFixer = await edit('scripts/fix-platform-integration-spire-contract.mjs', (source) => {
  const next = source.replaceAll('/assets/spire-login.js?v=20260813-exact-workflow-1', LOGIN_ASSET);
  if (!next.includes(LOGIN_ASSET)) throw new Error('Platform SPIRE contract login asset anchor is missing');
  return next;
});
requireContains(platformContractFixer, LOGIN_ASSET, 'Platform SPIRE contract normalizer');

const foundationVerifier = await edit('scripts/verify-spire-foundation.mjs', (source) => {
  let next = source.replaceAll('/assets/spire-login.js?v=20260813-exact-workflow-1', LOGIN_ASSET);
  if (!next.includes(MAR_ASSET)) {
    const anchor = "has(data.master, ['<html','<body','S.P.I.R.E.','21. Client Station Classic','title=\"Secure Chat\"','/assets/spire-user-preferences.js?v=20260813-exact-workflow-1','/assets/spire-screen-controls.js?v=20260813-live-controls-2','/assets/spire-master-navigation.js?v=20260813-client-station-2','/assets/spire-medication-order-entry.js','/assets/spire-mar-timeline.js'], 'SPIRE master chart');";
    if (!next.includes(anchor)) throw new Error('SPIRE foundation master marker anchor is missing');
    next = next.replace(anchor, `has(data.master, ['<html','<body','S.P.I.R.E.','21. Client Station Classic','title="Secure Chat"','/assets/spire-user-preferences.js?v=20260813-exact-workflow-1','/assets/spire-screen-controls.js?v=20260813-live-controls-2','/assets/spire-master-navigation.js?v=20260813-client-station-2','/assets/spire-medication-order-entry.js','${MAR_ASSET}'], 'SPIRE master chart');`);
  }
  if (!next.includes(LOGIN_ASSET)) throw new Error('SPIRE foundation login asset anchor is missing');
  if (!next.includes(MAR_ASSET)) throw new Error('SPIRE foundation MAR asset anchor is missing');
  return next;
});
requireContains(foundationVerifier, LOGIN_ASSET, 'SPIRE foundation verifier');
requireContains(foundationVerifier, MAR_ASSET, 'SPIRE foundation verifier');

const businessVerifier = await edit('scripts/verify-production-business-uat.mjs', (source) => {
  const next = source.replaceAll('/assets/spire-login.js?v=20260813-exact-workflow-1', LOGIN_ASSET);
  if (!next.includes(LOGIN_ASSET)) throw new Error('Production business UAT SPIRE login asset anchor is missing');
  return next;
});
requireContains(businessVerifier, LOGIN_ASSET, 'Production business UAT verifier');

const master = await edit('spire/master.html', (source) => {
  let next = source.replace(/\s*<script\s+src=["']\/assets\/spire-mar-timeline\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
  if (!next.includes('</body>')) throw new Error('SPIRE master body close is missing');
  next = next.replace('</body>', `  <!-- ${MARKER} -->\n  <script src="${MAR_ASSET}"></script>\n</body>`);
  return next;
});
requireContains(master, MARKER, 'SPIRE master');
requireContains(master, MAR_ASSET, 'SPIRE master');

const stationRuntime = await edit('assets/spire-client-station.js', (source) => {
  let next = source.replace(/\n\s*query\.set\('workspaceBuild',\s*'[^']*'\);/g, '');
  const anchor = "    const query = new URLSearchParams({ patientId: clientId(client), spireHome: state.homeId, company: state.companyId });\n    return `/spire/master.html?${query}`;";
  if (!next.includes(anchor)) throw new Error('Client Station chartUrl anchor is missing');
  next = next.replace(anchor, `    const query = new URLSearchParams({ patientId: clientId(client), spireHome: state.homeId, company: state.companyId });\n    query.set('workspaceBuild', '${BUILD}');\n    return \`/spire/master.html?\${query}\`;`);
  if (!next.includes(MARKER)) next = next.replace('// SPIRE_CLIENT_STATION_LISTS_V3', `// SPIRE_CLIENT_STATION_LISTS_V3\n  // ${MARKER}`);
  return next;
});
requireContains(stationRuntime, `query.set('workspaceBuild', '${BUILD}')`, 'Client Station runtime');

const stationHtml = await edit('spire/client-station.html', (source) => source.replace(
  /\/assets\/spire-client-station\.js\?v=[^"']+/g,
  STATION_ASSET,
));
requireContains(stationHtml, STATION_ASSET, 'Client Station HTML');

const loginRuntime = await edit('assets/spire-login.js', (source) => {
  let next = source.replace(/\n\s*query\.set\('spireBuild',\s*'[^']*'\);/g, '');
  const anchor = "    query.set('spireShell', '1');\n    return `/spire/client-station.html?${query}`;";
  if (!next.includes(anchor)) throw new Error('SPIRE login stationUrl anchor is missing');
  next = next.replace(anchor, `    query.set('spireShell', '1');\n    query.set('spireBuild', '${BUILD}');\n    return \`/spire/client-station.html?\${query}\`;`);
  if (!next.includes(MARKER)) next = next.replace('// SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1', `// SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1\n  // ${MARKER}`);
  return next;
});
requireContains(loginRuntime, `query.set('spireBuild', '${BUILD}')`, 'SPIRE login runtime');

const loginHtml = await edit('spire/login.html', (source) => source.replace(
  /\/assets\/spire-login\.js\?v=[^"']+/g,
  LOGIN_ASSET,
));
requireContains(loginHtml, LOGIN_ASSET, 'SPIRE login HTML');

await edit('scripts/build-static-site.mjs', (source) => {
  const next = source
    .replaceAll('/assets/spire-client-station.js?v=20260813-client-station-2', STATION_ASSET)
    .replace("for (const marker of ['<html','<head','<body','</html>',\"window.SULANDRA_API_BASE='https://sulandra-website-production-5fc4.up.railway.app'\",'/assets/sulandra-entity-context.js','SPIRE_MASTER_DEFECT_FIXES_V1'])", `for (const marker of ['<html','<head','<body','</html>',\"window.SULANDRA_API_BASE='https://sulandra-website-production-5fc4.up.railway.app'\",'/assets/sulandra-entity-context.js','SPIRE_MASTER_DEFECT_FIXES_V1','${MARKER}','${MAR_ASSET}'])`);
  if (!next.includes(MAR_ASSET)) throw new Error('Static build verification could not be upgraded to the MAR V4 publication contract');
  return next;
});

await edit('scripts/verify-published-spire-syntax.mjs', (source) => {
  let next = source
    .replaceAll('/assets/spire-login.js?v=20260813-exact-workflow-1', LOGIN_ASSET)
    .replaceAll('/assets/spire-client-station.js?v=20260813-client-station-2', STATION_ASSET);
  const assetAnchor = "  ['assets/spire-client-station.js', 'Client Station runtime'],";
  if (!next.includes("['assets/spire-mar-timeline.js', 'SPIRE MAR V4 runtime']")) {
    if (!next.includes(assetAnchor)) throw new Error('Published SPIRE browser-assets anchor is missing');
    next = next.replace(assetAnchor, `${assetAnchor}\n  ['assets/spire-mar-timeline.js', 'SPIRE MAR V4 runtime'],`);
  }
  const stationMarker = "  '/api/spire/inbasket-v2?status=OPEN', '/spire/secure-chat.html', 'localStorage.setItem(HOME_ID_KEY',";
  if (!next.includes(`'${MARKER}'`)) {
    if (!next.includes(stationMarker)) throw new Error('Published SPIRE station marker anchor is missing');
    next = next.replace(stationMarker, `${stationMarker}\n  '${MARKER}', \"query.set('workspaceBuild', '${BUILD}')\",`);
  }
  return next;
});

console.log(`SPIRE MAR publication fixed end-to-end: master and final dist-web publisher use ${MAR_ASSET}; login, platform/foundation/business verification, and Client Station use ${BUILD}; stale chart HTML cannot survive a reopen; syntax verification checks the MAR runtime.`);
