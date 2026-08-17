import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_MAR_SINGLE_OWNER_V5';

let source = await readFile(masterPath, 'utf8');

if (!source.includes('SPIRE_WORKSTATION_V4')) {
  throw new Error('SPIRE MAR single-owner v5 requires workstation v4 first');
}

if (!source.includes(marker)) {
  // MAR must never use the generic background prewarmer. That path invokes the
  // legacy card renderer while MAR is inactive and can mark those cards as live
  // before the canonical hourly timeline gets a chance to render.
  const prewarmAnchor = `  function prewarmWorkspace(viewId) {\n    const target = document.getElementById(viewId);`;
  if (!source.includes(prewarmAnchor)) throw new Error('SPIRE MAR v5 could not find workspace prewarm helper');
  source = source.replace(
    prewarmAnchor,
    `  function prewarmWorkspace(viewId) {\n    if (viewId === 'mar-view') return Promise.resolve(false);\n    const target = document.getElementById(viewId);`
  );
  source = source.replaceAll("['flowsheets-view','mar-view','notes-view']", "['flowsheets-view','notes-view']");

  // Replace the old card-style MAR loader itself, not only the loader map. This
  // also protects direct legacy refresh calls after a medication action. The
  // canonical spire-mar-timeline runtime observes child-list changes; pulsing the
  // active host hands rendering to that one owner without creating duplicate MARs.
  const legacyMarPattern = /  async function loadMarView\(\) \{[\s\S]*?\n  \}\n\n  function renderMedicationCard/;
  if (!legacyMarPattern.test(source)) throw new Error('SPIRE MAR v5 could not find legacy loadMarView boundary');
  source = source.replace(legacyMarPattern, `  // ${marker}: the hourly timeline is the only normal MAR renderer.\n  function wakeCanonicalMarTimeline() {\n    const host = document.getElementById('mar-view');\n    if (!host || !host.classList.contains('active')) return false;\n    if (host.querySelector('.spire-mar-v4')) return true;\n    host.dataset.spireMarOwner = '${marker}';\n    const pulse = document.createElement('span');\n    pulse.hidden = true;\n    pulse.dataset.spireMarOwnerWake = '${marker}';\n    host.appendChild(pulse);\n    queueMicrotask(() => pulse.remove());\n    return true;\n  }\n\n  function loadCanonicalMarView() {\n    const host = document.getElementById('mar-view');\n    if (!host) return Promise.resolve(false);\n    if (!state.patientId) return Promise.resolve(showError(host, 'Select a client first.'));\n    if (host.querySelector('.spire-mar-v4')) return Promise.resolve(true);\n\n    // Never expose the retired medication-card MAR while the canonical timeline\n    // is starting. A small neutral placeholder is replaced by the timeline owner.\n    host.innerHTML = '<div class="spire-empty" data-spire-mar-canonical-loading>Loading hourly MAR…</div>';\n    wakeCanonicalMarTimeline();\n\n    if (!window.SpireMarTimelineContract) {\n      window.addEventListener('spire:mar-timeline:contract', () => {\n        setTimeout(wakeCanonicalMarTimeline, 0);\n      }, { once: true });\n      setTimeout(wakeCanonicalMarTimeline, 100);\n    }\n    return Promise.resolve(true);\n  }\n\n  async function loadMarView() {\n    return loadCanonicalMarView();\n  }\n\n  function renderMedicationCard`);
}

for (const required of [
  marker,
  'function loadCanonicalMarView()',
  'function wakeCanonicalMarTimeline()',
  "if (viewId === 'mar-view') return Promise.resolve(false)",
  'data-spire-mar-canonical-loading',
  'SpireMarTimelineContract',
]) {
  if (!source.includes(required)) throw new Error(`SPIRE MAR single-owner v5 verification failed: missing ${required}`);
}
if (source.includes("['flowsheets-view','mar-view','notes-view']")) {
  throw new Error('SPIRE MAR single-owner v5 verification failed: MAR remains in generic prewarm list');
}
if (/async function loadMarView\(\)[\s\S]{0,2500}Medication administration authorized/.test(source)) {
  throw new Error('SPIRE MAR single-owner v5 verification failed: legacy medication-card loader remains active');
}

await writeFile(masterPath, source, 'utf8');
console.log('SPIRE MAR single-owner v5 installed: legacy card MAR is retired from normal routing/prewarm and the canonical hourly timeline owns MAR activation.');
