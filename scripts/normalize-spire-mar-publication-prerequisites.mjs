import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifierPath = path.join(root, 'scripts', 'verify-spire-foundation.mjs');
const continuityPath = path.join(root, 'assets', 'spire-mar-continuity.js');
const MAR_ASSET = '/assets/spire-mar-timeline.js?v=20260814-chart-photo-db-2';
const MAR_STYLE = '/assets/spire-mar-epic-v5.css?v=20260814-chart-photo-db-2';

let source = await readFile(verifierPath, 'utf8');
const original = source;

// Later static-publication passes intentionally cache-bust the MAR asset. The canonical
// build runs build:web more than once, so normalize the verifier back to the input contract
// expected by fix-spire-mar-publication before each pass. This changes only verifier URLs;
// it does not downgrade or republish the browser runtime itself.
source = source
  .replace(/\/assets\/spire-mar-timeline\.js(?:\?v=[^'"\s,\]]+)?/g, MAR_ASSET)
  .replace(/\/assets\/spire-mar-epic-v5\.css(?:\?v=[^'"\s,\]]+)?/g, MAR_STYLE);

if (!source.includes(MAR_ASSET)) throw new Error('Unable to normalize SPIRE foundation MAR verifier asset');
if (!source.includes(MAR_STYLE)) {
  const marker = `'${MAR_ASSET}'`;
  if (!source.includes(marker)) throw new Error('Unable to locate normalized SPIRE MAR verifier marker');
  source = source.replace(marker, `${marker},'${MAR_STYLE}'`);
}

if (source !== original) await writeFile(verifierPath, source, 'utf8');

// finalize-platform-navigation applies the Due/Overdue continuity patch after static
// publication. A later build:web in the same CI checkout must be able to apply that patch
// again. Restore only the patcher's loadOverdue entry shape; the patcher immediately
// reinstalls the Overdue-only gate and verifies the clinical contract. This prevents a
// second publication pass from failing on its own already-installed gate.
let continuity = await readFile(continuityPath, 'utf8');
const continuityOriginal = continuity;
const installedGate = `  async function loadOverdue(host) {\n    const overdueFilterActive = Boolean(host.querySelector('[data-mar-filter="overdue"].active'));\n    if (selectedDate(host) !== localDateInput() || !overdueFilterActive) {`;
const patchInput = `  async function loadOverdue(host) {\n    if (selectedDate(host) !== localDateInput()) {`;
if (continuity.includes(installedGate)) continuity = continuity.replace(installedGate, patchInput);
if (!continuity.includes(patchInput)) throw new Error('Unable to normalize SPIRE MAR continuity Due/Overdue publication entry');
if (continuity !== continuityOriginal) await writeFile(continuityPath, continuity, 'utf8');

console.log('SPIRE MAR publication prerequisites normalized for repeatable build:web execution.');
