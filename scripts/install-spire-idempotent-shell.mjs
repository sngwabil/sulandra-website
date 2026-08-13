import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = path.join(root, 'spire.html');
const loginPath = path.join(root, 'spire', 'login.html');
const stationPath = path.join(root, 'spire', 'client-station.html');
const masterPath = path.join(root, 'spire', 'master.html');
const contract = 'SPIRE_MASTER_CLIENT_STATION_CHART_CONTRACT_V3';

async function requireFile(filePath, label) {
  try { await access(filePath); }
  catch { throw new Error(`${label} is missing: ${filePath}`); }
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

async function verifyAndNormalize() {
  await Promise.all([
    requireFile(entryPath, 'Canonical S.P.I.R.E. entry page'),
    requireFile(loginPath, 'S.P.I.R.E. authentication/fullscreen shell'),
    requireFile(stationPath, 'S.P.I.R.E. Client Station'),
    requireFile(masterPath, 'Standalone S.P.I.R.E. chart master'),
  ]);

  const [entry, login, station, originalMaster] = await Promise.all([
    readFile(entryPath, 'utf8'),
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
  console.log('S.P.I.R.E. source architecture verified: authenticated shell → Client Station → explicit client chart; no duplicate company/home gateway.');
}

try { await verifyAndNormalize(); }
catch (error) {
  console.error('Standalone S.P.I.R.E. verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}

await import('./fix-spire-accessibility-suite.mjs');
await import('./fix-spire-flowsheet-friendly-actor.mjs');
