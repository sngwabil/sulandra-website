import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPath = path.join(root, 'spire.html');
const stationPath = path.join(root, 'spire', 'client-station.html');
const masterPath = path.join(root, 'spire', 'master.html');
const contract = 'SPIRE_MASTER_CLIENT_STATION_CHART_CONTRACT_V2';

async function requireFile(filePath, label) {
  try { await access(filePath); }
  catch { throw new Error(`${label} is missing: ${filePath}`); }
}

function normalizeClientSelection(masterHtml) {
  const pattern = /  function currentPatientId\(\) \{[\s\S]*?\n  \}\n\n  function requireSession/;
  if (!pattern.test(masterHtml)) throw new Error('SPIRE master currentPatientId() boundary was not found');
  return masterHtml.replace(pattern, `  function currentPatientId() {
    // ${contract}: a chart opens only after explicit Client Station selection.
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/,''));
    const query = new URLSearchParams(location.search);
    return hash.get('patient') || query.get('patientId') || '';
  }

  function requireSession`);
}

function normalizeFlowsheetAuthority(masterHtml) {
  const pattern = /  async function loadFlowsheetsView\(groupOverride\) \{[\s\S]*?\n  \}\n\n  function renderFlowsheet\(host\) \{/;
  if (!pattern.test(masterHtml)) throw new Error('SPIRE master loadFlowsheetsView() boundary was not found');
  return masterHtml.replace(pattern, `  async function loadFlowsheetsView(groupOverride) {
    // ${contract}: assets/spire-master-flowsheet-grid.js is the one live renderer.
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
}

async function verifyAndNormalize() {
  await Promise.all([
    requireFile(entryPath, 'Canonical S.P.I.R.E. entry page'),
    requireFile(stationPath, 'S.P.I.R.E. Client Station'),
    requireFile(masterPath, 'Standalone S.P.I.R.E. chart master'),
  ]);

  const [entry, station, originalMaster] = await Promise.all([
    readFile(entryPath, 'utf8'),
    readFile(stationPath, 'utf8'),
    readFile(masterPath, 'utf8'),
  ]);

  if (!entry.includes('SPIRE_CANONICAL_CLIENT_STATION_ENTRY_V2') || !entry.includes('/spire/client-station.html')) {
    throw new Error('/spire.html is not the canonical Client Station entry.');
  }
  if (!entry.includes('window.location.search') || !entry.includes('window.location.hash')) {
    throw new Error('/spire.html must preserve query/hash context.');
  }
  if (!station.includes('SPIRE_CLIENT_STATION_LISTS_V2') || !station.includes('Client Station') || !station.includes('Available Homes')) {
    throw new Error('/spire/client-station.html is not the remembered-home Client Station.');
  }
  if (!/<html[\s>]/i.test(originalMaster) || !/<body[\s>]/i.test(originalMaster) || !/<\/html>/i.test(originalMaster)) {
    throw new Error('/spire/master.html is not a complete chart application.');
  }

  let master = normalizeClientSelection(originalMaster);
  master = normalizeFlowsheetAuthority(master);
  if (master !== originalMaster) await writeFile(masterPath, master, 'utf8');

  const normalized = await readFile(masterPath, 'utf8');
  const patientStart = normalized.indexOf('  function currentPatientId() {');
  const patientEnd = normalized.indexOf('  function requireSession', patientStart);
  if (normalized.slice(patientStart, patientEnd).includes("sessionStorage.getItem('spire:patientId')")) {
    throw new Error('SPIRE chart can still resurrect a stale client from sessionStorage.');
  }
  const loaderStart = normalized.indexOf('  async function loadFlowsheetsView(groupOverride) {');
  const rendererStart = normalized.indexOf('  function renderFlowsheet(host) {', loaderStart);
  if (!normalized.slice(loaderStart, rendererStart).includes('window.SpireMasterFlowsheetGrid')) {
    throw new Error('SPIRE chart does not delegate Flowsheets to the master grid runtime.');
  }

  console.log('S.P.I.R.E. source architecture verified: Client Station entry, explicit client chart selection, and one Flowsheets renderer.');
}

try { await verifyAndNormalize(); }
catch (error) {
  console.error('S.P.I.R.E. source verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}

// Existing, previously proven master repairs remain responsible for the profile
// and 20 accessibility themes. The shared runtime persists them across surfaces.
await import('./fix-spire-accessibility-suite.mjs');
// The flowsheet publication may show a friendly name/email, never a raw user ID.
await import('./fix-spire-flowsheet-friendly-actor.mjs');
