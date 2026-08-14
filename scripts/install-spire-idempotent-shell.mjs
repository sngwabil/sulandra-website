import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = path.join(root, 'spire.html');
const loginPath = path.join(root, 'spire', 'login.html');
const stationPath = path.join(root, 'spire', 'client-station.html');
const masterPath = path.join(root, 'spire', 'master.html');
const loginRuntimePath = path.join(root, 'assets', 'spire-login.js');
const employeePortalPath = path.join(root, 'employee-portal.html');
const employeePortalRuntimePath = path.join(root, 'employee-portal-railway.js');
const enterpriseAppsPath = path.join(root, 'enterprise-apps.html');
const spireAdminPath = path.join(root, 'spire-admin.html');
const adminPath = path.join(root, 'admin.html');
const contract = 'SPIRE_MASTER_CLIENT_STATION_CHART_CONTRACT_V3';
const fullscreenBridge = 'SPIRE_SHELL_MAXIMIZE_RESTORE_BRIDGE_V1';
const newTabContract = 'SPIRE_NEW_TAB_LAUNCH_CONTRACT_V1';

async function requireFile(filePath, label) {
  try { await access(filePath); }
  catch { throw new Error(`${label} is missing: ${filePath}`); }
}

async function writeIfChanged(filePath, original, next) {
  if (next !== original) await writeFile(filePath, next, 'utf8');
}

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`${label} anchor was not found`);
  return source.replace(needle, replacement);
}

function normalizeAccessibilityRuntime(masterHtml) {
  const startToken = 'function openAccessibilityModal';
  const endToken = 'window.openAccessibilityModal=openAccessibilityModal;';
  const startIndex = masterHtml.indexOf(startToken);
  const endStart = masterHtml.indexOf(endToken, startIndex);
  if (startIndex === -1 || endStart === -1) throw new Error('Standalone SPIRE master accessibility runtime could not be located.');
  const lineStart = masterHtml.lastIndexOf('\n', startIndex) + 1;
  const endIndex = endStart + endToken.length;
  const normalized = `  function openAccessibilityModal(){
    const modal=$('#accessibilityModal');
    if(!modal)return;
    const name=state.user?.displayName||state.user?.name||state.user?.email||'User Profile';
    const role=state.user?.role||state.user?.credentials||'';
    modal.style.display='flex';
    const nameInput=$('#inputClinicianName',modal); if(nameInput) nameInput.value=name;
    const credentialInput=$('#inputClinicianCredentials',modal); if(credentialInput) credentialInput.value=role;
    const avatar=$('#modalUserAvatarPreview',modal); if(avatar) avatar.textContent=initialFromName(name);
  }
  window.openAccessibilityModal=openAccessibilityModal;`;
  return masterHtml.slice(0, lineStart) + normalized + masterHtml.slice(endIndex);
}

function normalizeThemeCompatibilityAlias(masterHtml) {
  let next = masterHtml.replaceAll('window.selectPresetTheme=applyTheme;', 'window.selectPresetTheme=applyPresetTheme;');
  if (!next.includes('window.selectPresetTheme=applyPresetTheme;')) {
    const anchor = 'window.applyPresetTheme=applyPresetTheme;';
    if (!next.includes(anchor)) throw new Error('Standalone SPIRE master preset-theme compatibility alias could not be located.');
    next = next.replace(anchor, `${anchor}\n  window.selectPresetTheme=applyPresetTheme;`);
  }
  return next;
}

function normalizeMasterClientStationContract(masterHtml) {
  let next = masterHtml;
  const clientPattern = /  function currentPatientId\(\) \{[\s\S]*?\n  \}\n\n  function requireSession/;
  if (!clientPattern.test(next)) throw new Error('SPIRE master current client boundary was not found');
  next = next.replace(clientPattern, `  function currentPatientId() {
    // ${contract}: chart scope comes only from explicit Client Station selection.
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/,''));
    const query = new URLSearchParams(location.search);
    return hash.get('patient') || query.get('patientId') || '';
  }

  function requireSession`);

  const loaderPattern = /  async function loadFlowsheetsView\(groupOverride\) \{[\s\S]*?\n  \}\n\n  function renderFlowsheet\(host\) \{/;
  if (!loaderPattern.test(next)) throw new Error('SPIRE master flowsheet-loader boundary was not found');
  next = next.replace(loaderPattern, `  async function loadFlowsheetsView(groupOverride) {
    // ${contract}: assets/spire-master-flowsheet-grid.js is the only live grid renderer.
    const host = $('#flowsheets-view');
    if (!host) return;
    if (!state.patientId) return showError(host,'Open a client from Client Station first.');
    if (typeof groupOverride === 'string' && groupOverride) state.flowGroup = groupOverride;
    const grid = window.SpireMasterFlowsheetGrid;
    if (!grid) {
      host.innerHTML = '<div class="spire-empty">Loading DSP Daily Documentation…</div>';
      window.setTimeout(() => window.SpireMasterFlowsheetGrid?.refresh?.(), 0);
      return;
    }
    return grid.refresh();
  }

  function renderFlowsheet(host) {`);
  return next;
}

function normalizeFullscreenShellBridge(source) {
  if (source.includes(fullscreenBridge)) return source;
  const bindAnchor = '  function bindFrameForFullscreenAndHome() {';
  const bridgeRuntime = `  // ${fullscreenBridge}: the visible chart lives inside the authenticated shell iframe.
  // The chart's legacy max button must toggle the TOP shell fullscreen state instead of
  // trying to fullscreen the already-nested iframe document. This restores maximize ↔ restore.
  function syncFrameFullscreenButton() {
    try {
      const button = frame.contentDocument?.getElementById('maxBtn');
      if (!button) return;
      const active = Boolean(document.fullscreenElement);
      button.textContent = active ? '🗗' : '🗖';
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Exit full screen' : 'Open S.P.I.R.E. full screen');
      button.setAttribute('title', active ? 'Exit full screen' : 'Maximize / Full Screen');
    } catch {}
  }

  function bindFrameFullscreenControl() {
    try {
      const button = frame.contentDocument?.getElementById('maxBtn');
      if (!button || button.dataset.spireShellFullscreenBridge === 'true') {
        syncFrameFullscreenButton();
        return;
      }
      button.dataset.spireShellFullscreenBridge = 'true';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const toggle = window.SpireUserPreferences?.toggleFullscreenPreference;
        if (typeof toggle === 'function') toggle().catch(() => {});
      }, true);
      syncFrameFullscreenButton();
    } catch {}
  }

${bindAnchor}`;
  let next = replaceRequired(source, bindAnchor, bridgeRuntime, 'SPIRE login fullscreen bridge');
  const pathAnchor = `      if (path.includes('/spire/')) {
        restoreRememberedHome();
        startHomeMirror();
        window.SpireUserPreferences?.apply?.();
      }`;
  const pathReplacement = `      if (path.includes('/spire/')) {
        restoreRememberedHome();
        startHomeMirror();
        window.SpireUserPreferences?.apply?.();
        bindFrameFullscreenControl();
      }`;
  next = replaceRequired(next, pathAnchor, pathReplacement, 'SPIRE frame fullscreen binding');
  const eventAnchor = `  document.addEventListener('keydown', refreshWorkspaceInsteadOfShell, true);`;
  next = replaceRequired(next, eventAnchor, `${eventAnchor}\n  document.addEventListener('fullscreenchange', syncFrameFullscreenButton);`, 'SPIRE fullscreen state sync');
  return next;
}

function normalizeEmployeePortalNewTab(source) {
  if (source.includes(`${newTabContract}:employee-static`)) return source;
  const anchor = '<a id="employeeStaticSpire" class="portal-link" href="/spire.html" hidden>';
  const replacement = `<a id="employeeStaticSpire" class="portal-link" href="/spire.html" hidden target="_blank" rel="noopener noreferrer" data-spire-new-tab="${newTabContract}:employee-static">`;
  return replaceRequired(source, anchor, replacement, 'Employee Portal static SPIRE new-tab link');
}

function normalizeEmployeePortalRuntimeNewTab(source) {
  if (source.includes(`${newTabContract}:employee-runtime`)) return source;
  let next = source;
  const launcherAnchor = `    if (id) a.id = id;
    return a;`;
  const launcherReplacement = `    if (id) a.id = id;
    if (href === "/spire.html") {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.dataset.spireNewTab = "${newTabContract}:employee-runtime";
    }
    return a;`;
  next = replaceRequired(next, launcherAnchor, launcherReplacement, 'Employee Portal SPIRE quick launcher');
  const navAnchor = `    a.id = id;
    a.href = href;
    a.textContent = label;
    li.appendChild(a);`;
  const navReplacement = `    a.id = id;
    a.href = href;
    a.textContent = label;
    if (href === "/spire.html") {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.dataset.spireNewTab = "${newTabContract}:employee-runtime";
    }
    li.appendChild(a);`;
  next = replaceRequired(next, navAnchor, navReplacement, 'Employee Portal SPIRE navigation launcher');
  return next;
}

function normalizeEnterpriseAppsNewTab(source) {
  if (source.includes(`${newTabContract}:enterprise-apps`)) return source;
  let next = source;
  const topAnchor = '<a href="/spire-admin.html">SPIRE Admin</a>';
  const topReplacement = `<a href="/spire-admin.html" target="_blank" rel="noopener noreferrer" data-spire-new-tab="${newTabContract}:enterprise-apps">SPIRE Admin</a>`;
  next = replaceRequired(next, topAnchor, topReplacement, 'Enterprise Apps SPIRE Admin header link');
  const cardAnchor = 'href="${esc(a.href)}"><div class="app-top">';
  const cardReplacement = `href="\${esc(a.href)}"\${a.id==='spire-live'||a.id==='spire-admin'?' target="_blank" rel="noopener noreferrer" data-spire-new-tab="${newTabContract}:enterprise-apps"':''}><div class="app-top">`;
  next = replaceRequired(next, cardAnchor, cardReplacement, 'Enterprise Apps SPIRE card launcher');
  return next;
}

function normalizeSpireAdminNewTab(source) {
  if (source.includes(`${newTabContract}:spire-admin`)) return source;
  const anchor = '<a class="btn primary" id="openSpire" href="/spire/master.html">Open Live SPIRE';
  const replacement = `<a class="btn primary" id="openSpire" href="/spire.html" target="_blank" rel="noopener noreferrer" data-spire-new-tab="${newTabContract}:spire-admin">Open Live SPIRE`;
  return replaceRequired(source, anchor, replacement, 'SPIRE Admin live SPIRE launcher');
}

function normalizeAdminSpireNewTab(source) {
  if (source.includes(`${newTabContract}:admin`)) return source;
  let next = source;
  const topAnchor = '<li><a href="spire-admin.html">Admin Spire</a></li>';
  const topReplacement = `<li><a href="spire-admin.html" target="_blank" rel="noopener noreferrer" data-spire-new-tab="${newTabContract}:admin">Admin Spire</a></li>`;
  next = replaceRequired(next, topAnchor, topReplacement, 'Admin top navigation SPIRE launcher');
  const sideAnchor = '<button class="side-btn" type="button" onclick="window.location.href=\'spire-admin.html\'">Admin Spire <small>Clinical</small></button>';
  const sideReplacement = `<button class="side-btn" type="button" data-spire-new-tab="${newTabContract}:admin" onclick="window.open('spire-admin.html','_blank','noopener,noreferrer')">Admin Spire <small>Clinical</small></button>`;
  next = replaceRequired(next, sideAnchor, sideReplacement, 'Admin side navigation SPIRE launcher');
  return next;
}

async function normalizeShellAndLaunchers() {
  const files = [
    [loginRuntimePath, normalizeFullscreenShellBridge],
    [employeePortalPath, normalizeEmployeePortalNewTab],
    [employeePortalRuntimePath, normalizeEmployeePortalRuntimeNewTab],
    [enterpriseAppsPath, normalizeEnterpriseAppsNewTab],
    [spireAdminPath, normalizeSpireAdminNewTab],
    [adminPath, normalizeAdminSpireNewTab],
  ];
  for (const [filePath, normalizer] of files) {
    const original = await readFile(filePath, 'utf8');
    const next = normalizer(original);
    await writeIfChanged(filePath, original, next);
  }

  const [loginRuntime, employeePortal, employeeRuntime, enterpriseApps, spireAdmin, admin] = await Promise.all([
    readFile(loginRuntimePath, 'utf8'), readFile(employeePortalPath, 'utf8'), readFile(employeePortalRuntimePath, 'utf8'),
    readFile(enterpriseAppsPath, 'utf8'), readFile(spireAdminPath, 'utf8'), readFile(adminPath, 'utf8'),
  ]);
  for (const [label, text, marker] of [
    ['fullscreen shell bridge', loginRuntime, fullscreenBridge],
    ['employee static SPIRE launcher', employeePortal, `${newTabContract}:employee-static`],
    ['employee runtime SPIRE launcher', employeeRuntime, `${newTabContract}:employee-runtime`],
    ['enterprise apps SPIRE launcher', enterpriseApps, `${newTabContract}:enterprise-apps`],
    ['SPIRE Admin launcher', spireAdmin, `${newTabContract}:spire-admin`],
    ['Admin SPIRE launcher', admin, `${newTabContract}:admin`],
  ]) if (!text.includes(marker)) throw new Error(`SPIRE ${label} normalization is missing ${marker}`);
}

async function verifyAndNormalize() {
  await Promise.all([
    requireFile(entryPath, 'Canonical S.P.I.R.E. entry page'),
    requireFile(loginPath, 'S.P.I.R.E. authentication/fullscreen shell'),
    requireFile(stationPath, 'S.P.I.R.E. Client Station'),
    requireFile(masterPath, 'Standalone S.P.I.R.E. chart master'),
    requireFile(loginRuntimePath, 'S.P.I.R.E. authenticated shell runtime'),
    requireFile(employeePortalPath, 'Employee Portal'),
    requireFile(employeePortalRuntimePath, 'Employee Portal runtime'),
    requireFile(enterpriseAppsPath, 'Enterprise Apps launchpad'),
    requireFile(spireAdminPath, 'S.P.I.R.E. Admin launchpad'),
    requireFile(adminPath, 'Admin portal'),
  ]);

  let entry = await readFile(entryPath, 'utf8');
  const [login, station, originalMaster] = await Promise.all([
    readFile(loginPath, 'utf8'),
    readFile(stationPath, 'utf8'),
    readFile(masterPath, 'utf8'),
  ]);

  if (!entry.includes('SPIRE_CANONICAL_LOGIN_ENTRY_V3') || !entry.includes('/spire/login.html')) {
    throw new Error('/spire.html must launch the S.P.I.R.E. authentication shell.');
  }
  if (!login.includes('SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1') || !login.includes('spireWorkspaceFrame')) {
    throw new Error('/spire/login.html is not the authenticated fullscreen S.P.I.R.E. shell.');
  }
  if (!station.includes('SPIRE_CLIENT_STATION_LISTS_V2') || !station.includes('Client Station') || !station.includes('Available Homes')) {
    throw new Error('/spire/client-station.html is not the remembered-home Client Station.');
  }
  if (!/<html[\s>]/i.test(originalMaster) || !/<body[\s>]/i.test(originalMaster) || !/<\/html>/i.test(originalMaster)) {
    throw new Error('/spire/master.html is not a complete chart application.');
  }

  let master = normalizeMasterClientStationContract(originalMaster);
  master = normalizeAccessibilityRuntime(master);
  master = normalizeThemeCompatibilityAlias(master);
  if (master !== originalMaster) await writeFile(masterPath, master, 'utf8');

  const normalized = await readFile(masterPath, 'utf8');
  const patientStart = normalized.indexOf('  function currentPatientId() {');
  const patientEnd = normalized.indexOf('  function requireSession', patientStart);
  if (normalized.slice(patientStart, patientEnd).includes("sessionStorage.getItem('spire:patientId')")) {
    throw new Error('SPIRE chart can still resurrect a stale client from sessionStorage.');
  }

  // During isolation of an older publisher a non-executable /spire/master.html
  // compatibility line was temporarily placed in the entry comment. The current
  // publisher correctly rejects that retired direct-chart target, so remove only
  // that comment line before dist-web is copied. The actual redirect remains login-first.
  const cleanedEntry = entry.replace(/^\s*\/spire\/master\.html\s*$/m, '');
  if (cleanedEntry !== entry) {
    await writeFile(entryPath, cleanedEntry, 'utf8');
    entry = cleanedEntry;
  }

  await normalizeShellAndLaunchers();
  console.log('S.P.I.R.E. source architecture verified: authenticated shell → Client Station → explicit client chart; shell maximize now restores fullscreen correctly and all primary SPIRE launchers open in a new browser tab.');
}

try { await verifyAndNormalize(); }
catch (error) {
  console.error('Standalone S.P.I.R.E. verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}

await import('./fix-spire-accessibility-suite.mjs');
await import('./fix-spire-flowsheet-friendly-actor.mjs');
