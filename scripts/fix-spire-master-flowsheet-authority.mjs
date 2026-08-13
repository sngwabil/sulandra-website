import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const masterPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1';

let html = await readFile(masterPath, 'utf8');

if (!html.includes(marker)) {
  const startToken = '  async function loadFlowsheetsView(groupOverride) {';
  const endToken = '  function renderFlowsheet(host) {';
  const start = html.indexOf(startToken);
  const end = html.indexOf(endToken, start);

  if (start < 0 || end < 0 || end <= start) {
    throw new Error('SPIRE master legacy flowsheet loader boundary could not be located.');
  }

  const replacement = `  // ${marker}\n  // The DSP Daily Documentation grid in /assets/spire-master-flowsheet-grid.js\n  // is the only authoritative Flowsheets renderer in the standalone master.\n  // Keep this compatibility function because existing master actions call it,\n  // but never let it replace #flowsheets-view with the retired continuous grid.\n  async function loadFlowsheetsView(groupOverride) {\n    const host = $('#flowsheets-view');\n    if (!host) return;\n    if (!state.patientId) return showError(host,'Select a client first.');\n\n    if (typeof groupOverride === 'string' && groupOverride) {\n      state.flowGroup = groupOverride;\n      sessionStorage.setItem('spire:flowsheet:preferred-group', groupOverride);\n    }\n\n    const grid = window.SpireMasterFlowsheetGrid;\n    if (grid?.refresh) return grid.refresh();\n\n    // The external first-party grid script is loaded immediately after the\n    // master runtime. If an early bootstrap call reaches this function first,\n    // do not fall back to the retired renderer. Wait one task and try again.\n    host.dataset.spireDspGrid = 'true';\n    host.innerHTML = '<div class="spire-empty">Preparing DSP Daily Documentation…</div>';\n    await new Promise(resolve => setTimeout(resolve, 0));\n\n    if (window.SpireMasterFlowsheetGrid?.refresh) {\n      return window.SpireMasterFlowsheetGrid.refresh();\n    }\n\n    throw new Error('DSP Daily Documentation runtime is unavailable. Refresh the S.P.I.R.E. workstation.');\n  }\n\n`;

  html = html.slice(0, start) + replacement + html.slice(end);
}

if (!html.includes(marker)) {
  throw new Error('SPIRE master flowsheet authority marker was not installed.');
}

const loaderStart = html.indexOf('  async function loadFlowsheetsView(groupOverride) {');
const rendererStart = html.indexOf('  function renderFlowsheet(host) {', loaderStart);
const loaderSource = loaderStart >= 0 && rendererStart > loaderStart
  ? html.slice(loaderStart, rendererStart)
  : '';

for (const forbidden of [
  'Loading continuous flowsheet',
  'renderFlowsheet(host);',
  'state.flowColumns = keys.slice(-8)',
]) {
  if (loaderSource.includes(forbidden)) {
    throw new Error(`SPIRE master canonical flowsheet loader still contains retired behavior: ${forbidden}`);
  }
}

for (const required of [
  'window.SpireMasterFlowsheetGrid',
  'grid?.refresh',
  'DSP Daily Documentation',
]) {
  if (!loaderSource.includes(required)) {
    throw new Error(`SPIRE master canonical flowsheet loader is missing: ${required}`);
  }
}

await writeFile(masterPath, html, 'utf8');
console.log('SPIRE master flowsheet authority fixed: all master Flowsheets navigation delegates to the server-backed DSP Daily Documentation grid; the retired continuous renderer can no longer replace the view.');
