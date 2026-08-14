import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = '20260814-chart-photos-mar-fix-1';
const MAR_ASSET = `/assets/spire-mar-timeline.js?v=${BUILD}`;
const MAR_STYLE = `/assets/spire-mar-epic-v5.css?v=${BUILD}`;
const PROFILE_ASSET = `/assets/spire-chart-profile-images.js?v=${BUILD}`;
const STATION_ASSET = `/assets/spire-client-station.js?v=${BUILD}`;
const LOGIN_ASSET = `/assets/spire-login.js?v=${BUILD}`;
const MARKER = 'SPIRE_MAR_PUBLICATION_CACHE_BUST_V2';
const RUNTIME_MARKER = 'SPIRE_MAR_OBSERVER_LOOP_FIX_V1';
const STYLE_MARKER = 'SPIRE_MAR_EPIC_V5';
const PROFILE_MARKER = 'SPIRE_CHART_PROFILE_IMAGES_V1';

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

const marStyle = await readFile(path.join(root, 'assets/spire-mar-epic-v5.css'), 'utf8');
requireContains(marStyle, STYLE_MARKER, 'SPIRE MAR Epic V5 stylesheet');
requireContains(marStyle, '[data-mar-command="report"]::before', 'SPIRE MAR Epic V5 stylesheet');
requireContains(marStyle, '.spire-mar-hour-cell.due .spire-mar-cell-label', 'SPIRE MAR Epic V5 stylesheet');
requireContains(marStyle, '.spire-mar-status[data-mar-status="GIVEN"]', 'SPIRE MAR Epic V5 stylesheet');

const profileRuntime = await readFile(path.join(root, 'assets/spire-chart-profile-images.js'), 'utf8');
requireContains(profileRuntime, PROFILE_MARKER, 'SPIRE chart profile image runtime');
requireContains(profileRuntime, '/documents?category=', 'SPIRE chart profile image runtime');
requireContains(profileRuntime, '/versions', 'SPIRE chart profile image runtime');
requireContains(profileRuntime, 'patient-scoped secure clinical documents', 'SPIRE chart profile image runtime');

// Keep the MAR runtime idempotent, remove the obsolete browser-local PCP-photo
// installer, and repair the medication-order variable used by the live action dialog.
const marRuntime = await edit('assets/spire-mar-timeline.js', (source) => {
  let next = source;
  const oldPhotoRender = `    if (image) {\n      image.src = stored;\n      image.hidden = !stored;\n    }\n    if (initials) {\n      initials.textContent = pcpInitials();\n      initials.hidden = Boolean(stored);\n    }\n    if (name) name.textContent = clean(document.querySelector('#displayPCP')?.textContent) || 'Primary Care Provider';`;
  const newPhotoRender = `    if (image) {\n      if (stored) {\n        if (image.getAttribute('src') !== stored) image.setAttribute('src', stored);\n      } else if (image.hasAttribute('src')) {\n        image.removeAttribute('src');\n      }\n      const shouldHideImage = !stored;\n      if (image.hidden !== shouldHideImage) image.hidden = shouldHideImage;\n    }\n    if (initials) {\n      const nextInitials = pcpInitials();\n      if (initials.textContent !== nextInitials) initials.textContent = nextInitials;\n      const shouldHideInitials = Boolean(stored);\n      if (initials.hidden !== shouldHideInitials) initials.hidden = shouldHideInitials;\n    }\n    if (name) {\n      const nextName = clean(document.querySelector('#displayPCP')?.textContent) || 'Primary Care Provider';\n      if (name.textContent !== nextName) name.textContent = nextName;\n    }`;

  if (next.includes(oldPhotoRender)) next = next.replace(oldPhotoRender, newPhotoRender);
  next = next.replace(
    "mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });",
    "mutationObserver.observe(document.body, { childList: true, subtree: true });",
  );

  // The function parameter is medicationId. Using the undeclared shorthand
  // medicationOrderId caused the live dialog error shown after Record Given.
  next = next.replace(
    /\n\s*medicationOrderId,\n\s*scheduledFor:/,
    `\n            medicationOrderId: medicationId,\n            scheduledFor:`,
  );

  // PCP photos are now patient-scoped secure clinical documents. Prevent the MAR
  // presentation enhancer from recreating its old localStorage/template row.
  next = next.replaceAll('installPcpPhoto();', 'void 0; // PCP photo handled by SPIRE_CHART_PROFILE_IMAGES_V1');

  if (!next.includes(RUNTIME_MARKER)) {
    next = next.replace('// SPIRE_MAR_TIMELINE_V4', `// SPIRE_MAR_TIMELINE_V4\n  // ${RUNTIME_MARKER}`);
  }

  if (!next.includes('if (initials.textContent !== nextInitials) initials.textContent = nextInitials;')) {
    throw new Error('SPIRE MAR PCP renderer could not be made idempotent');
  }
  if (!next.includes("mutationObserver.observe(document.body, { childList: true, subtree: true });")) {
    throw new Error('SPIRE MAR mutation observer could not be narrowed');
  }
  if (!next.includes('medicationOrderId: medicationId')) {
    throw new Error('SPIRE MAR medicationOrderId action bug was not repaired');
  }
  if (next.includes('installPcpPhoto();')) {
    throw new Error('Legacy browser-local PCP photo installer is still active');
  }
  return next;
});
requireContains(marRuntime, RUNTIME_MARKER, 'SPIRE MAR runtime');
requireContains(marRuntime, 'medicationOrderId: medicationId', 'SPIRE MAR runtime');

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
    next = next.replace(anchor, `has(data.master, ['<html','<body','S.P.I.R.E.','21. Client Station Classic','title="Secure Chat"','/assets/spire-user-preferences.js?v=20260813-exact-workflow-1','/assets/spire-screen-controls.js?v=20260813-live-controls-2','/assets/spire-master-navigation.js?v=20260813-client-station-2','/assets/spire-medication-order-entry.js','${MAR_ASSET}','${MAR_STYLE}'], 'SPIRE master chart');`);
  } else if (!next.includes(MAR_STYLE)) {
    next = next.replace(`'${MAR_ASSET}'`, `'${MAR_ASSET}','${MAR_STYLE}'`);
  }
  if (!next.includes(LOGIN_ASSET)) throw new Error('SPIRE foundation login asset anchor is missing');
  if (!next.includes(MAR_ASSET)) throw new Error('SPIRE foundation MAR asset anchor is missing');
  if (!next.includes(MAR_STYLE)) throw new Error('SPIRE foundation MAR style anchor is missing');
  return next;
});
requireContains(foundationVerifier, LOGIN_ASSET, 'SPIRE foundation verifier');
requireContains(foundationVerifier, MAR_ASSET, 'SPIRE foundation verifier');
requireContains(foundationVerifier, MAR_STYLE, 'SPIRE foundation verifier');

const businessVerifier = await edit('scripts/verify-production-business-uat.mjs', (source) => {
  const next = source.replaceAll('/assets/spire-login.js?v=20260813-exact-workflow-1', LOGIN_ASSET);
  if (!next.includes(LOGIN_ASSET)) throw new Error('Production business UAT SPIRE login asset anchor is missing');
  return next;
});
requireContains(businessVerifier, LOGIN_ASSET, 'Production business UAT verifier');

const master = await edit('spire/master.html', (source) => {
  let next = source
    .replace(/\s*<script\s+src=["']\/assets\/spire-mar-timeline\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n')
    .replace(/\s*<script\s+src=["']\/assets\/spire-chart-profile-images\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n')
    .replace(/\s*<link\s+rel=["']stylesheet["']\s+href=["']\/assets\/spire-mar-epic-v5\.css(?:\?v=[^"']*)?["']\s*\/?>(?:\s*)/gi, '\n');
  if (!next.includes('</head>')) throw new Error('SPIRE master head close is missing');
  if (!next.includes('</body>')) throw new Error('SPIRE master body close is missing');
  next = next.replace('</head>', `  <link rel="stylesheet" href="${MAR_STYLE}">\n</head>`);
  next = next.replace('</body>', `  <!-- ${MARKER} -->\n  <script src="${MAR_ASSET}"></script>\n  <script src="${PROFILE_ASSET}"></script>\n</body>`);
  return next;
});
requireContains(master, MARKER, 'SPIRE master');
requireContains(master, MAR_ASSET, 'SPIRE master');
requireContains(master, MAR_STYLE, 'SPIRE master');
requireContains(master, PROFILE_ASSET, 'SPIRE master');

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
  let next = source.replaceAll('/assets/spire-client-station.js?v=20260813-client-station-2', STATION_ASSET);
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
    next = next.replace(anchor, `const publishedSpireProfileImages=await readFile(path.join(outputDirectory,'assets','spire-chart-profile-images.js'),'utf8');\nfor (const marker of ['${PROFILE_MARKER}','patient-scoped secure clinical documents','SPIRE_CLIENT_PROFILE_PHOTO','SPIRE_PCP_PROFILE_PHOTO']) if(!publishedSpireProfileImages.includes(marker)) throw new Error(\`Static publication regression: SPIRE chart profile images missing \${marker}\`);\n${anchor}`);
  }
  if (!next.includes(MAR_ASSET)) throw new Error('Static build verification could not be upgraded to the MAR publication contract');
  if (!next.includes(MAR_STYLE)) throw new Error('Static build verification could not be upgraded to the MAR stylesheet contract');
  if (!next.includes(PROFILE_ASSET)) throw new Error('Static build verification could not be upgraded to the chart-photo publication contract');
  if (!next.includes('assets/spire-chart-profile-images.js')) throw new Error('Static build required-file list is missing the chart profile image runtime');
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
  if (!next.includes("['assets/spire-chart-profile-images.js', 'SPIRE chart profile images']")) {
    const marAssetAnchor = "  ['assets/spire-mar-timeline.js', 'SPIRE MAR V4 runtime'],";
    if (!next.includes(marAssetAnchor)) throw new Error('Published SPIRE profile-image asset anchor is missing');
    next = next.replace(marAssetAnchor, `${marAssetAnchor}\n  ['assets/spire-chart-profile-images.js', 'SPIRE chart profile images'],`);
  }
  const stationMarker = "  '/api/spire/inbasket-v2?status=OPEN', '/spire/secure-chat.html', 'localStorage.setItem(HOME_ID_KEY',";
  if (!next.includes(`'${MARKER}'`)) {
    if (!next.includes(stationMarker)) throw new Error('Published SPIRE station marker anchor is missing');
    next = next.replace(stationMarker, `${stationMarker}\n  '${MARKER}', \"query.set('workspaceBuild', '${BUILD}')\",`);
  } else {
    next = next.replace(/query\.set\('workspaceBuild', '[^']+'\)/g, `query.set('workspaceBuild', '${BUILD}')`);
  }
  if (!next.includes("const marEpicStyle = await read('assets/spire-mar-epic-v5.css');")) {
    const preferenceAnchor = "const preferences = await read('assets/spire-user-preferences.js');";
    if (!next.includes(preferenceAnchor)) throw new Error('Published SPIRE style verification anchor is missing');
    next = next.replace(preferenceAnchor, `const marEpicStyle = await read('assets/spire-mar-epic-v5.css');\nrequireMarkers(marEpicStyle, ['${STYLE_MARKER}', '[data-mar-command=\\\"report\\\"]::before', '.spire-mar-hour-cell.due .spire-mar-cell-label'], 'SPIRE MAR Epic V5 styling');\n\n${preferenceAnchor}`);
  }
  const marRuntimeAnchor = "const chatJs = await read('assets/spire-secure-chat.js');";
  if (!next.includes("const marJs = await read('assets/spire-mar-timeline.js');")) {
    if (!next.includes(marRuntimeAnchor)) throw new Error('Published SPIRE MAR runtime verification anchor is missing');
    next = next.replace(marRuntimeAnchor, `const marJs = await read('assets/spire-mar-timeline.js');\nrequireMarkers(marJs, ['${RUNTIME_MARKER}', 'data-mar-status=\\\"GIVEN\\\"', 'administeredAt', 'medicationOrderId: medicationId'], 'SPIRE MAR V4 runtime');\n\n${marRuntimeAnchor}`);
  } else if (!next.includes('medicationOrderId: medicationId')) {
    next = next.replace("'administeredAt'", "'administeredAt', 'medicationOrderId: medicationId'");
  }
  if (!next.includes("const profileImagesJs = await read('assets/spire-chart-profile-images.js');")) {
    if (!next.includes(marRuntimeAnchor)) throw new Error('Published SPIRE profile-image verification anchor is missing');
    next = next.replace(marRuntimeAnchor, `const profileImagesJs = await read('assets/spire-chart-profile-images.js');\nrequireMarkers(profileImagesJs, ['${PROFILE_MARKER}', 'SPIRE_CLIENT_PROFILE_PHOTO', 'SPIRE_PCP_PROFILE_PHOTO', '/documents?category='], 'SPIRE chart profile image runtime');\n\n${marRuntimeAnchor}`);
  }
  return next;
});

console.log(`SPIRE chart-photo/MAR publication fixed end-to-end: client and PCP photos are patient-scoped secure clinical documents via ${PROFILE_ASSET}; duplicate legacy PCP presentation is disabled; MAR action uses the defined medication order id; classic-color MAR remains on ${MAR_STYLE}; login, Client Station, and chart URLs use ${BUILD}.`);
