import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_PATIENT_TRANSITION_GUARD_V1';

let source = await readFile(targetPath, 'utf8');

if (!source.includes('SPIRE_STABLE_WORKSPACE_UX_V1')) {
  throw new Error('Spire patient transition guard requires the stable workspace optimizer to run first');
}

if (!source.includes(marker)) {
  const resetPattern = /  function resetPatientViewState\(\) \{[\s\S]*?\n  \}\n\n  function chartSnapshotKey/;
  if (!resetPattern.test(source)) throw new Error('Spire patient transition guard could not find resetPatientViewState');
  source = source.replace(resetPattern, `  // ${marker}: never leave the previous patient's chart visible while a different patient opens.
  function showPatientTransition() {
    const center = $('.center-content');
    if (!center) return;
    center.style.position = 'relative';
    let cover = document.getElementById('spirePatientTransitionCover');
    if (!cover) {
      cover = document.createElement('div');
      cover.id = 'spirePatientTransitionCover';
      cover.setAttribute('role', 'status');
      cover.style.cssText = 'position:absolute;inset:0;z-index:80;display:grid;place-items:center;background:rgba(248,250,252,.97);border:1px solid #dbe4ee;color:#334155;font:800 13px/1.4 Segoe UI,Arial,sans-serif;text-align:center;padding:24px';
      cover.innerHTML = '<div><div style="font-size:18px;margin-bottom:8px">Opening selected client chart…</div><div style="font-weight:600;color:#64748b">The prior patient view is hidden until the new chart identity is verified and loaded.</div></div>';
      center.appendChild(cover);
    }
  }

  function clearPatientTransition() {
    document.getElementById('spirePatientTransitionCover')?.remove();
  }

  function resetPatientViewState() {
    viewLoadState.clear();
    state.storyboard = null;
    state.admissionHistory = null;
    state.chartReview = [];
    state.timeline = [];
    state.flowsheet = null;
    state.flowColumns = [];
    state.emar = null;
    for (const host of $$('.workspace-view')) {
      host.dataset.spireLive = 'false';
      host.dataset.spirePatientId = String(state.patientId || '');
      host.removeAttribute('aria-busy');
      host.querySelector(':scope > .spire-stable-refresh-indicator')?.remove();
    }
    setText('displayNameFirst', 'Opening');
    setText('displayNameLast', 'client…', '');
    for (const id of ['displayGender','displayAge','displayDOB','displayMRN','displayBed','displayCode','displayPCP','displayAllergies','displayHtWt','displayBMI','tabClientName']) setText(id, '—');
    const avatar = $('#avatarDisplay');
    if (avatar) avatar.textContent = '…';
    showPatientTransition();
  }

  function chartSnapshotKey`);

  const finallyAnchor = `    })().finally(() => {\n      if (chartLoadPatientId === requestedPatientId) {`;
  if (!source.includes(finallyAnchor)) throw new Error('Spire patient transition guard could not find chart load finalizer');
  source = source.replace(finallyAnchor, `    })().finally(() => {\n      clearPatientTransition();\n      if (chartLoadPatientId === requestedPatientId) {`);

  await writeFile(targetPath, source, 'utf8');
}

const verified = await readFile(targetPath, 'utf8');
for (const required of [marker, 'showPatientTransition', 'clearPatientTransition', 'state.storyboard = null']) {
  if (!verified.includes(required)) throw new Error(`Spire patient transition guard verification failed: missing ${required}`);
}

console.log('Spire patient transition guard installed: prior-patient chart content is obscured and cleared before a different chart opens.');
