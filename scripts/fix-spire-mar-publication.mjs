import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const BUILD = '20260817-spire-mar-publication-1';
const MARKER = 'SPIRE_MAR_PUBLICATION_FIX_V1';
const MAR_ASSET = `/assets/spire-mar-timeline.js?v=${BUILD}`;
const MAR_STYLE = `/assets/spire-mar-timeline.css?v=${BUILD}`;
const LOGIN_ASSET = `/assets/spire-login.js?v=${BUILD}`;
const STATION_ASSET = `/assets/spire-client-station.js?v=${BUILD}`;
const PROFILE_ASSET = `/assets/spire-chart-profile-images.js?v=${BUILD}`;
const PROFILE_MARKER = 'SPIRE_CHART_PROFILE_IMAGES_V2';
const PROFILE_RUNTIME_MARKER = 'SPIRE_CHART_PROFILE_IMAGES_PATIENT_CONTEXT_V1';
const PROFILE_RESTORE_MARKER = 'SPIRE_CHART_PROFILE_IMAGES_RESTORE_V1';

async function read(relative) {
  return fs.readFile(path.join(ROOT, relative), 'utf8');
}
async function edit(relative, transform) {
  const file = path.join(ROOT, relative);
  const source = await fs.readFile(file, 'utf8');
  const next = transform(source);
  if (next !== source) await fs.writeFile(file, next, 'utf8');
  return next;
}
function requireContains(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label} is missing ${needle}`);
}
function requireNotContains(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label} still contains ${needle}`);
}

await edit('assets/spire-mar-timeline.js', (source) => {
  let next = source
    .replace(/\n\s*function wrapLegacyMarActions\(\)\{[\s\S]*?\n\s*wrapLegacyMarActions\(\);/m, '')
    .replace(/\n\s*function mountDelegatedMarActions\(\)\{[\s\S]*?\n\s*mountDelegatedMarActions\(\);/m, '')
    .replace(/\n\s*function watchLegacyMarRenders\(\)\{[\s\S]*?\n\s*watchLegacyMarRenders\(\);/m, '');
  if (!next.includes(MARKER)) next = next.replace("'use strict';", `'use strict';\n  // ${MARKER}`);
  return next;
});

const master = await edit('spire/master.html', (source) => {
  let next = source
    .replace(/<link[^>]+href=["']\/assets\/spire-mar-timeline\.css(?:\?[^"']*)?["'][^>]*>\s*/gi, '')
    .replace(/<script[^>]+src=["']\/assets\/spire-mar-timeline\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/gi, '')
    .replace(/<script[^>]+src=["']\/assets\/spire-chart-profile-images\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/gi, '');
  const styleAnchor = '</head>';
  const scriptAnchor = '</body>';
  if (!next.includes(styleAnchor) || !next.includes(scriptAnchor)) throw new Error('SPIRE master publication anchors are missing');
  next = next.replace(styleAnchor, `  <link rel="stylesheet" href="${MAR_STYLE}">\n${styleAnchor}`);
  next = next.replace(scriptAnchor, `  <script src="${MAR_ASSET}"></script>\n  <script src="${PROFILE_ASSET}"></script>\n${scriptAnchor}`);
  if (!next.includes(MARKER)) next = next.replace('<body', `<body data-spire-mar-publication="${MARKER}"`);
  return next;
});
requireContains(master, MARKER, 'SPIRE master');
requireContains(master, MAR_ASSET, 'SPIRE master');
requireContains(master, MAR_STYLE, 'SPIRE master');
requireContains(master, PROFILE_ASSET, 'SPIRE master');
requireContains(master, 'avatar.dataset.spireDurableClientPhoto', 'SPIRE master durable-photo guard');
requireContains(master, 'if(!window.__SPIRE_CHART_PROFILE_IMAGES)', 'SPIRE master legacy photo-handler guard');

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
  const shellAnchor = "    query.set('spireShell', '1');";
  if (!next.includes(shellAnchor)) throw new Error('SPIRE login shell query anchor is missing');
  next = next.replace(shellAnchor, `${shellAnchor}\n    query.set('spireBuild', '${BUILD}');`);
  if (!next.includes(MARKER)) next = next.replace('// SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1', `// SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1\n  // ${MARKER}`);
  return next;
});
requireContains(loginRuntime, `query.set('spireBuild', '${BUILD}')`, 'SPIRE login runtime');
requireContains(loginRuntime, 'SPIRE_DEEP_LINK_HANDOFF_V1', 'SPIRE login deep-link runtime');
requireContains(loginRuntime, '/spire/master.html', 'SPIRE login patient chart handoff');

const loginHtml = await edit('spire/login.html', (source) => source.replace(
  /\/assets\/spire-login\.js\?v=[^"']+/g,
  LOGIN_ASSET,
));
requireContains(loginHtml, LOGIN_ASSET, 'SPIRE login HTML');

await edit('scripts/build-static-site.mjs', (source) => {
  let next = source
    .replaceAll('/assets/spire-client-station.js?v=20260813-client-station-2', STATION_ASSET)
    .replaceAll('SPIRE_CHART_PROFILE_IMAGES_V1', PROFILE_MARKER)
    .replaceAll('patient-scoped secure clinical documents', 'patient-scoped chart database records')
    .replaceAll('SPIRE_CLIENT_PROFILE_PHOTO', '/profile-images')
    .replaceAll('SPIRE_PCP_PROFILE_PHOTO', 'providerName');
  const oldMarkers = "for (const marker of ['<html','<head','<body','</html>',\"window.SULANDRA_API_BASE='https://sulandra-website-production-5fc4.up.railway.app'\",'/assets/sulandra-entity-context.js','SPIRE_MASTER_DEFECT_FIXES_V1'])";
  if (next.includes(oldMarkers)) {
    next = next.replace(oldMarkers, `for (const marker of ['<html','<head','<body','</html>',\"window.SULANDRA_API_BASE='https://sulandra-website-production-5fc4.up.railway.app'\",'/assets/sulandra-entity-context.js','SPIRE_MASTER_DEFECT_FIXES_V1','${MARKER}','${MAR_ASSET}','${MAR_STYLE}','${PROFILE_ASSET}'])`);
  } else {
    if (next.includes(MAR_ASSET) && !next.includes(MAR_STYLE)) next = next.replace(`'${MAR_ASSET}'`, `'${MAR_ASSET}','${MAR_STYLE}'`);
    if (!next.includes(PROFILE_ASSET) && next.includes(`'${MAR_STYLE}'`)) next = next.replace(`'${MAR_STYLE}'`, `'${MAR_STYLE}','${PROFILE_ASSET}'`);
  }
  if (!next.includes('assets/spire-chart-profile-images.js')) {
    next = next.replace("'assets/spire-mar-timeline.js',", "'assets/spire-mar-timeline.js','assets/spire-chart-profile-images.js',");
  }
  if (!next.includes('const publishedSpireProfileImages=')) {
    const anchor = "const publishedResultsWorkspace=await readFile(path.join(outputDirectory,'assets','spire-results-workspace.js'),'utf8');";
    if (!next.includes(anchor)) throw new Error('Static build profile-image verification anchor is missing');
    next = next.replace(anchor, `const publishedSpireProfileImages=await readFile(path.join(outputDirectory,'assets','spire-chart-profile-images.js'),'utf8');\nfor (const marker of ['${PROFILE_MARKER}','${PROFILE_RUNTIME_MARKER}','${PROFILE_RESTORE_MARKER}','patient-scoped chart database records','/profile-images','providerName']) if(!publishedSpireProfileImages.includes(marker)) throw new Error(\`Static publication regression: SPIRE chart profile images missing \${marker}\`);\n${anchor}`);
  }
  if (!next.includes('const publishedSpireMarCss=')) {
    const anchor = "const publishedSpireMar=await readFile(path.join(outputDirectory,'assets','spire-mar-timeline.js'),'utf8');";
    if (!next.includes(anchor)) throw new Error('Static build MAR CSS verification anchor is missing');
    next = next.replace(anchor, `const publishedSpireMarCss=await readFile(path.join(outputDirectory,'assets','spire-mar-timeline.css'),'utf8');\nif(!publishedSpireMarCss.includes('SPIRE_MAR_TIMELINE_CSS_V1')) throw new Error('Static publication regression: SPIRE MAR timeline CSS missing');\n${anchor}`);
  }
  return next;
});

const buildStatic = await read('scripts/build-static-site.mjs');
requireContains(buildStatic, PROFILE_ASSET, 'static build profile-image asset marker');
requireContains(buildStatic, PROFILE_MARKER, 'static build profile-image marker');
requireContains(buildStatic, PROFILE_RUNTIME_MARKER, 'static build patient-context profile marker');
requireContains(buildStatic, PROFILE_RESTORE_MARKER, 'static build profile restore marker');

console.log(`SPIRE MAR publication stabilized with ${BUILD}, Client Station/login publication cache-busting, durable chart profile images, and deep-link-aware authenticated chart handoff.`);
