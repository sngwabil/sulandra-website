import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = path.join(root, 'spire.html');
const portalPath = path.join(root, 'spire', 'portal.html');
const masterPath = path.join(root, 'spire', 'master.html');
const portalContractMarker = 'SPIRE_MASTER_PORTAL_CHART_CONTRACT_V1';

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
  if (masterHtml.includes('window.selectPresetTheme=applyTheme;')) return masterHtml.replace('window.selectPresetTheme=applyTheme;', 'window.selectPresetTheme=applyPresetTheme;');
  if (!masterHtml.includes('window.selectPresetTheme=applyPresetTheme;')) throw new Error('Standalone SPIRE master preset-theme compatibility alias could not be located.');
  return masterHtml;
}

function normalizeMasterPortalContract(masterHtml) {
  let next = masterHtml;

  const patientPattern = /  function currentPatientId\(\) \{[\s\S]*?\n  \}\n\n  function requireSession/;
  if (!patientPattern.test(next)) throw new Error('SPIRE master currentPatientId() boundary was not found');
  next = next.replace(patientPattern, `  function currentPatientId() {
    // ${portalContractMarker}: a chart may open only from Patient Station.
    // Never resurrect the last viewed patient from sessionStorage.
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/,''));
    const query = new URLSearchParams(location.search);
    return hash.get('patient') || query.get('patientId') || '';
  }

  function requireSession`);

  const loaderPattern = /  async function loadFlowsheetsView\(groupOverride\) \{[\s\S]*?\n  \}\n\n  function renderFlowsheet\(host\) \{/;
  if (!loaderPattern.test(next)) throw new Error('SPIRE master legacy flowsheet-loader boundary was not found');
  next = next.replace(loaderPattern, `  async function loadFlowsheetsView(groupOverride) {
    // ${portalContractMarker}: the external master grid is the only renderer.
    const host = $('#flowsheets-view');
    if (!host) return;
    if (!state.patientId) return showError(host,'Open a client from Patient Station first.');
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

  const patientStart = next.indexOf('  function currentPatientId() {');
  const patientEnd = next.indexOf('  function requireSession', patientStart);
  const patientSource = next.slice(patientStart, patientEnd);
  if (patientSource.includes("sessionStorage.getItem('spire:patientId')")) throw new Error('SPIRE master still auto-selects a patient from sessionStorage');

  const loaderStart = next.indexOf('  async function loadFlowsheetsView(groupOverride) {');
  const rendererStart = next.indexOf('  function renderFlowsheet(host) {', loaderStart);
  const loaderSource = next.slice(loaderStart, rendererStart);
  if (!loaderSource.includes('window.SpireMasterFlowsheetGrid')) throw new Error('SPIRE master flowsheet loader does not delegate to SpireMasterFlowsheetGrid');
  for (const forbidden of ['Loading continuous flowsheet', 'renderFlowsheet(host);', 'state.flowColumns = keys.slice(-8)']) {
    if (loaderSource.includes(forbidden)) throw new Error(`Retired continuous flowsheet behavior is still reachable: ${forbidden}`);
  }
  return next;
}

async function verifyAndNormalize() {
  await Promise.all([
    requireFile(entryPath, 'Canonical S.P.I.R.E. entry page'),
    requireFile(portalPath, 'S.P.I.R.E. Clinical Access Portal'),
    requireFile(masterPath, 'Standalone S.P.I.R.E. chart master'),
  ]);
  const [entry, portal, originalMaster] = await Promise.all([
    readFile(entryPath, 'utf8'),
    readFile(portalPath, 'utf8'),
    readFile(masterPath, 'utf8'),
  ]);

  if (!entry.includes('/spire/portal.html') || !entry.includes('window.location.search') || !entry.includes('window.location.hash')) {
    throw new Error('/spire.html must launch /spire/portal.html while preserving query/hash context.');
  }
  if (!portal.includes('SPIRE_PORTAL_WORKFLOW_V1') || !portal.includes('Patient Station')) {
    throw new Error('/spire/portal.html is not the canonical company/home/Patient Station gateway.');
  }
  if (!/<html[\s>]/i.test(originalMaster) || !/<body[\s>]/i.test(originalMaster) || !/<\/html>/i.test(originalMaster)) {
    throw new Error('/spire/master.html does not appear to be a complete chart application.');
  }
  for (const legacy of ['spire-app-v2.js', 'spire-canonical-bootstrap.js', 'spire-shell-resilience.js', 'spire-chart-ready.js', 'spire-deep-link.js']) {
    if (entry.includes(legacy)) throw new Error(`/spire.html still references legacy SPIRE runtime ${legacy}`);
  }

  let master = normalizeMasterPortalContract(originalMaster);
  master = normalizeAccessibilityRuntime(master);
  master = normalizeThemeCompatibilityAlias(master);
  if (master.includes('window.selectPresetTheme=applyTheme;')) throw new Error('SPIRE master still contains the bootstrap-breaking applyTheme compatibility alias.');
  if (master !== originalMaster) await writeFile(masterPath, master, 'utf8');

  console.log('S.P.I.R.E. source architecture verified: portal-only entry, explicit Patient Station chart selection, no stale-patient fallback, and one authoritative Flowsheets renderer.');
}

try { await verifyAndNormalize(); }
catch (error) {
  console.error('Standalone S.P.I.R.E. verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}

// Preserve the existing accessibility/theme repair pass. It is independent of
// clinical routing, patient scope and flowsheet persistence.
await import('./fix-spire-accessibility-suite.mjs');
