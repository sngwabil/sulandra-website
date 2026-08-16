import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Historical compatibility shim only.
// The dense replacement MAR introduced on 2026-08-16 is intentionally disabled.
// SPIRE's authoritative MAR/TAR is the classic actionable renderer already present
// in spire/master.html. This file must never rewrite that renderer again.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const master = await readFile(masterPath, 'utf8');

for (const required of [
  'function renderMar(host,date)',
  'function renderMedicationCard(',
  'data-mar-admin',
  'normalizeScheduledFor(date,time)',
]) {
  if (!master.includes(required)) {
    throw new Error(`Classic SPIRE MAR/TAR source is missing ${required}`);
  }
}

if (master.includes('SPIRE_CANONICAL_MAR_GRID_V3')) {
  throw new Error('Dense replacement MAR marker found in canonical SPIRE source; classic MAR/TAR must remain authoritative.');
}

console.log('SPIRE classic actionable MAR/TAR retained; dense replacement MAR publisher is disabled and cannot rewrite the chart.');
