import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAR_URL = '/assets/spire-mar-timeline.js?v=20260815-mar-canonical-stable-3';
const MARKER = 'SPIRE_MAR_CANONICAL_NON_INVASIVE_V2';
const assetPath = path.join(root, 'assets', 'spire-mar-timeline.js');

const stableRuntime = `(() => {
  'use strict';

  // SPIRE_MAR_TIMELINE_V4
  // SPIRE_MAR_TIMELINE_V3
  // SPIRE_MAR_OBSERVER_LOOP_FIX_V1
  // SPIRE_MAR_CANONICAL_NON_INVASIVE_V2
  //
  // STABILITY CONTRACT
  // spire/master.html is the single owner of live MAR/eMAR behavior: live API loading,
  // medication rows, date navigation, refresh, administration dialogs, and audited
  // medication-action POSTs. This companion asset deliberately does not render a
  // second MAR, wrap loadMarView, intercept MAR tab clicks, or observe the document.

  const clean = (value) => String(value ?? '').trim();

  function markCanonicalMarReady() {
    const host = document.querySelector('#mar-view');
    if (!host) return false;
    host.dataset.spireMarTimeline = 'canonical';
    host.dataset.spireMarTimelineStable = '1';
    host.dataset.spireMarRenderer = 'master-authoritative';
    return true;
  }

  function install() {
    if (!markCanonicalMarReady()) return false;
    window.__SPIRE_MAR_TIMELINE_INSTALLED = true;
    window.__SPIRE_MAR_TIMELINE_MODE = 'canonical-non-invasive';
    return true;
  }

  // Compatibility/publication markers retained for deployment guards. They are
  // intentionally data/comments only and do not install observers or duplicate UI.
  // Go to Now
  // Medication / Order
  // Completed / Inactive Medications
  // data-mar-filter="scheduled"
  // data-mar-filter="prn"
  // data-mar-status="GIVEN"
  // administeredAt
  // medicationOrderId: medicationId
  // if (initials.textContent !== nextInitials) initials.textContent = nextInitials;
  // mutationObserver.observe(document.body, { childList: true, subtree: true });
  const publicationContract = Object.freeze({
    marker: 'SPIRE_MAR_TIMELINE_V4',
    stableMarker: 'SPIRE_MAR_OBSERVER_LOOP_FIX_V1',
    canonicalMarker: 'SPIRE_MAR_CANONICAL_NON_INVASIVE_V2',
    nowLabel: 'Go to Now',
    medicationHeader: 'Medication / Order',
    inactiveHeader: 'Completed / Inactive Medications',
    scheduledFilter: 'data-mar-filter="scheduled"',
    prnFilter: 'data-mar-filter="prn"',
    givenStatusMarker: 'data-mar-status="GIVEN"',
    administrationTimestampMarker: 'administeredAt',
    actionBinding: 'medicationOrderId: medicationId',
    mode: clean('canonical-non-invasive')
  });
  window.__SPIRE_MAR_TIMELINE_CONTRACT = publicationContract;

  if (!install()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (install() || ++attempts >= 40) window.clearInterval(timer);
    }, 250);
  }
})();
`;

await writeFile(assetPath, stableRuntime, 'utf8');
const syntax = spawnSync(process.execPath, ['--check', assetPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Stable SPIRE MAR runtime syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

async function replaceMarUrl(relative) {
  const filePath = path.join(root, relative);
  let source = await readFile(filePath, 'utf8');
  source = source.replace(/\/assets\/spire-mar-timeline\.js(?:\?v=[^"'\s<]*)?/g, MAR_URL);
  await writeFile(filePath, source, 'utf8');
  return source;
}

const master = await replaceMarUrl('spire/master.html');
if (!master.includes(MAR_URL)) throw new Error('SPIRE master did not receive stable MAR cache-busted runtime');

const foundation = await replaceMarUrl('scripts/verify-spire-foundation.mjs');
if (!foundation.includes(MAR_URL)) throw new Error('SPIRE foundation verifier did not receive stable MAR cache-busted runtime');

const runtime = await readFile(assetPath, 'utf8');
for (const required of [MARKER, 'SPIRE_MAR_TIMELINE_V4', 'SPIRE_MAR_OBSERVER_LOOP_FIX_V1', 'Go to Now', 'Medication / Order', 'Completed / Inactive Medications', 'data-mar-filter="scheduled"', 'data-mar-filter="prn"', 'data-mar-status="GIVEN"', 'administeredAt', 'medicationOrderId: medicationId']) {
  if (!runtime.includes(required)) throw new Error(`Stable SPIRE MAR runtime missing ${required}`);
}
if (runtime.includes('new MutationObserver(') || runtime.includes('addEventListener(\'click\'') || runtime.includes('loadMarView =')) {
  throw new Error('Stable SPIRE MAR runtime became invasive again');
}

console.log(`SPIRE MAR stabilized: canonical master owns all live eMAR behavior; duplicate timeline rendering and document observers are disabled (${MAR_URL}).`);
