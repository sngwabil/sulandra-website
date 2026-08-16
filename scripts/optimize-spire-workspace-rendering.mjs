import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_STABLE_WORKSPACE_UX_V1';

let source = await readFile(targetPath, 'utf8');

function replaceOnce(label, pattern, replacement) {
  if (!pattern.test(source)) throw new Error(`Spire stable workspace optimizer could not find ${label}`);
  source = source.replace(pattern, replacement);
}

if (!source.includes(marker)) {
  replaceOnce(
    'utility anchor',
    /  const cleanText = \(value\) => String\(value \?\? ''\)\.trim\(\);/,
    `  const cleanText = (value) => String(value ?? '').trim();

  // ${marker}: preserve a cohesive EHR workspace while live data refreshes in the background.
  const VIEW_REVISIT_TTL_MS = 30 * 1000;
  const CHART_SNAPSHOT_TTL_MS = 90 * 1000;
  const viewLoadState = new Map();
  let chartLoadPromise = null;
  let chartLoadPatientId = '';

  function selectedEntityId() {
    return String(state.entity?.id || window.SulandraEntityContext?.get?.()?.selectedEntityId || 'default');
  }

  function activeViewId() {
    return $('.chart-tab.active')?.dataset.view || 'summary-view';
  }

  function selectViewShell(viewId) {
    const target = document.getElementById(viewId);
    if (!target) return false;
    $$('.chart-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === viewId));
    $$('.workspace-view').forEach(view => view.classList.toggle('active', view.id === viewId));
    return true;
  }

  function viewStateKey(viewId) {
    return selectedEntityId() + ':' + String(state.patientId || 'none') + ':' + String(viewId || 'summary-view');
  }

  function stableLoadingMarkup(label='Loading chart…') {
    return '<div class="spire-stable-skeleton" aria-hidden="true">' +
      '<div class="spire-stable-skeleton-head"><span></span><span></span></div>' +
      '<div class="spire-stable-skeleton-card"></div>' +
      '<div class="spire-stable-skeleton-card short"></div>' +
      '<div class="spire-stable-skeleton-card"></div>' +
      '<div class="spire-stable-skeleton-label">' + esc(label) + '</div>' +
    '</div>';
  }

  function installStableWorkspaceStyles() {
    if (document.getElementById('spire-stable-workspace-ux-style')) return;
    const style = document.createElement('style');
    style.id = 'spire-stable-workspace-ux-style';
    style.textContent = [
      '.workspace-view{position:relative}',
      '.spire-stable-refresh-indicator{position:absolute;top:8px;right:10px;z-index:50;background:rgba(15,23,42,.9);color:#fff;border-radius:999px;padding:4px 9px;font:700 10px/1.2 Segoe UI,Arial,sans-serif;box-shadow:0 2px 8px rgba(15,23,42,.2);pointer-events:none}',
      '.spire-stable-skeleton{min-height:360px;padding:12px;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:min-content;gap:10px;background:#f8fafc;border:1px solid #dbe4ee;border-radius:6px;overflow:hidden}',
      '.spire-stable-skeleton-head{grid-column:1/-1;height:34px;display:flex;gap:12px;align-items:center}',
      '.spire-stable-skeleton-head span{display:block;height:12px;border-radius:999px;background:#dbe4ee}',
      '.spire-stable-skeleton-head span:first-child{width:220px}.spire-stable-skeleton-head span:last-child{width:120px}',
      '.spire-stable-skeleton-card{height:118px;border-radius:6px;background:linear-gradient(100deg,#eef2f6 20%,#f8fafc 45%,#eef2f6 70%);background-size:220% 100%;animation:spireStablePulse 1.4s ease-in-out infinite}',
      '.spire-stable-skeleton-card.short{height:82px}',
      '.spire-stable-skeleton-label{grid-column:1/-1;color:#64748b;font-weight:700;padding-top:2px}',
      '@keyframes spireStablePulse{0%{background-position:100% 0}100%{background-position:-100% 0}}',
      '@media(max-width:900px){.spire-stable-skeleton{grid-template-columns:1fr}.spire-stable-skeleton-card,.spire-stable-skeleton-head,.spire-stable-skeleton-label{grid-column:1}}'
    ].join('');
    document.head.appendChild(style);
  }

  function hasLiveViewContent(host) {
    return Boolean(host && host.dataset.spireLive === 'true' && host.dataset.spirePatientId === String(state.patientId || ''));
  }

  function setViewBusy(host, label='Refreshing live data…') {
    if (!host) return;
    host.setAttribute('aria-busy', 'true');
    let indicator = host.querySelector(':scope > .spire-stable-refresh-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'spire-stable-refresh-indicator';
      host.appendChild(indicator);
    }
    indicator.textContent = label;
    if (!hasLiveViewContent(host)) {
      const substantive = [...host.children].some(child => !child.classList.contains('spire-stable-refresh-indicator') && !child.classList.contains('spire-stable-skeleton'));
      if (!substantive && !host.querySelector(':scope > .spire-stable-skeleton')) {
        host.insertAdjacentHTML('afterbegin', stableLoadingMarkup(label));
      }
    }
  }

  function clearViewBusy(host) {
    if (!host) return;
    host.removeAttribute('aria-busy');
    host.querySelector(':scope > .spire-stable-refresh-indicator')?.remove();
    if (hasLiveViewContent(host)) host.querySelector(':scope > .spire-stable-skeleton')?.remove();
  }

  function markViewLive(viewId, fresh=true) {
    const host = document.getElementById(viewId);
    if (!host) return;
    host.dataset.spireLive = 'true';
    host.dataset.spirePatientId = String(state.patientId || '');
    clearViewBusy(host);
    if (fresh) viewLoadState.set(viewStateKey(viewId), { at: Date.now(), promise: null });
  }

  function viewIsFresh(viewId) {
    const entry = viewLoadState.get(viewStateKey(viewId));
    return Boolean(entry?.at && Date.now() - entry.at < VIEW_REVISIT_TTL_MS);
  }

  function resetPatientViewState() {
    viewLoadState.clear();
    for (const host of $$('.workspace-view')) {
      host.dataset.spireLive = 'false';
      host.dataset.spirePatientId = String(state.patientId || '');
      host.removeAttribute('aria-busy');
      host.querySelector(':scope > .spire-stable-refresh-indicator')?.remove();
    }
    state.chartReview = [];
    state.timeline = [];
    state.flowsheet = null;
    state.flowColumns = [];
    state.emar = null;
  }

  function chartSnapshotKey(patientId) {
    return 'spire:chart-snapshot:v1:' + selectedEntityId() + ':' + String(patientId || '');
  }

  function minimalAdmissionSnapshot() {
    const latest = asArray(state.admissionHistory?.admissions)[0];
    if (!latest) return { admissions: [] };
    const attachments = asArray(latest.attachments).map(file => {
      if (!file || typeof file !== 'object') return file;
      const copy = { ...file };
      delete copy.content;
      delete copy.contentBase64;
      return copy;
    });
    return { admissions: [{ ...latest, attachments }] };
  }

  function saveChartSnapshot() {
    if (!state.patientId || !state.storyboard) return;
    try {
      const snapshot = {
        version: 1,
        savedAt: Date.now(),
        patientId: String(state.patientId),
        entityId: selectedEntityId(),
        storyboard: state.storyboard,
        admissionHistory: minimalAdmissionSnapshot(),
      };
      const serialized = JSON.stringify(snapshot);
      if (serialized.length <= 900000) sessionStorage.setItem(chartSnapshotKey(state.patientId), serialized);
    } catch (error) {
      console.warn('[Spire UX] chart snapshot was not cached', error);
    }
  }

  function restoreChartSnapshot(patientId) {
    try {
      const raw = sessionStorage.getItem(chartSnapshotKey(patientId));
      if (!raw) return false;
      const snapshot = JSON.parse(raw);
      if (snapshot?.version !== 1 || String(snapshot.patientId) !== String(patientId) || snapshot.entityId !== selectedEntityId()) return false;
      if (!snapshot.savedAt || Date.now() - Number(snapshot.savedAt) > CHART_SNAPSHOT_TTL_MS) {
        sessionStorage.removeItem(chartSnapshotKey(patientId));
        return false;
      }
      if (!snapshot.storyboard) return false;
      state.storyboard = snapshot.storyboard;
      state.admissionHistory = snapshot.admissionHistory || { admissions: [] };
      renderPatientSidebar();
      renderSummary();
      updateHeaderIdentity();
      markViewLive('summary-view', false);
      showBanner('Restored the recent chart view while live data refreshes…', 'info');
      return true;
    } catch (error) {
      console.warn('[Spire UX] cached chart snapshot could not be restored', error);
      return false;
    }
  }

  function clearChartSnapshots() {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index) || '';
      if (key.startsWith('spire:chart-snapshot:v1:') || key === 'spire:active-view') sessionStorage.removeItem(key);
    }
  }`
  );

  replaceOnce(
    'activateView implementation',
    /  function activateView\(viewId\) \{[\s\S]*?\n  \}\n\n  function wireTabs/,
    `  function activateView(viewId, options={}) {
    const target = document.getElementById(viewId);
    if (!target) return Promise.resolve();
    const force = options?.force === true;
    selectViewShell(viewId);
    sessionStorage.setItem('spire:active-view', viewId);
    if (!loaders[viewId]) return Promise.resolve();
    if (!force && viewIsFresh(viewId) && hasLiveViewContent(target)) return Promise.resolve();

    const key = viewStateKey(viewId);
    const pending = viewLoadState.get(key)?.promise;
    if (pending) return pending;

    const hadLiveContent = hasLiveViewContent(target);
    setViewBusy(target, hadLiveContent ? 'Refreshing live data…' : 'Loading chart…');
    const promise = Promise.resolve(loaders[viewId]?.())
      .then(() => {
        markViewLive(viewId, true);
      })
      .catch(error => {
        clearViewBusy(target);
        if (hadLiveContent) showBanner(error?.message || 'Unable to refresh this chart view.', 'error');
        else showError(target, error);
      })
      .finally(() => {
        const current = viewLoadState.get(key);
        if (current?.promise === promise) viewLoadState.set(key, { at: current.at || 0, promise: null });
      });
    viewLoadState.set(key, { at: viewLoadState.get(key)?.at || 0, promise });
    return promise;
  }

  function wireTabs`
  );

  replaceOnce(
    'openPatient implementation',
    /  async function openPatient\(patientId\) \{[\s\S]*?\n  \}\n\n  async function loadPatientChart/,
    `  async function openPatient(patientId) {
    if (!patientId) return;
    const nextPatientId = String(patientId);
    const changedPatient = Boolean(state.patientId && state.patientId !== nextPatientId);
    state.patientId = nextPatientId;
    if (changedPatient) resetPatientViewState();
    sessionStorage.setItem('spire:patientId', state.patientId);
    const query = new URLSearchParams(location.search);
    query.delete('intake');
    query.delete('caseId');
    history.replaceState(null,'',\`${'${location.pathname}'}${'${query.toString()?`?${query}`:``}'}#patient=${'${encodeURIComponent(state.patientId)}'}\`);
    restoreChartSnapshot(state.patientId);
    await loadPatientChart(state.patientId);
  }

  async function loadPatientChart`
  );

  replaceOnce(
    'loadPatientChart implementation',
    /  async function loadPatientChart\(patientId\) \{[\s\S]*?\n  \}\n\n  function patientName/,
    `  async function loadPatientChart(patientId) {
    const requestedPatientId = String(patientId || '');
    if (!requestedPatientId) return;
    if (chartLoadPromise && chartLoadPatientId === requestedPatientId) return chartLoadPromise;

    const refreshingExistingChart = Boolean(state.storyboard && String(state.patientId) === requestedPatientId);
    showBanner(refreshingExistingChart ? 'Refreshing live client chart…' : 'Loading authorized client chart…');
    chartLoadPatientId = requestedPatientId;
    chartLoadPromise = (async () => {
      const [storyboard, admission] = await Promise.all([
        api(\`/api/spire/patients/${'${encodeURIComponent(requestedPatientId)}'}/storyboard\`),
        api(\`/api/spire/patients/${'${encodeURIComponent(requestedPatientId)}'}/admission-history\`).catch(() => ({admissions:[]})),
      ]);
      if (String(state.patientId) !== requestedPatientId) return;

      // Assign both core payloads before touching the DOM. Browser paint occurs after this synchronous commit,
      // so the patient banner/sidebar/summary update together rather than piece-by-piece.
      state.storyboard = storyboard;
      state.admissionHistory = admission;
      renderPatientSidebar();
      renderSummary();
      updateHeaderIdentity();
      markViewLive('summary-view', true);
      saveChartSnapshot();

      const active = activeViewId();
      if (active !== 'summary-view') await activateView(active, { force: true });
      showBanner('Client chart loaded. Documentation is live and audit-tracked.','success');
    })().finally(() => {
      if (chartLoadPatientId === requestedPatientId) {
        chartLoadPromise = null;
        chartLoadPatientId = '';
      }
    });
    return chartLoadPromise;
  }

  function patientName`
  );

  replaceOnce(
    'bootstrap chart hydration',
    /      await loadWorkspace\(\);\n      state\.patientId=currentPatientId\(\);\n      if\(state\.patientId\)\{\n        sessionStorage\.setItem\('spire:patientId',state\.patientId\);\n        await loadPatientChart\(state\.patientId\);\n      \}else\{\n        renderClientPicker\(\);\n      \}/,
    `      await loadWorkspace();
      state.patientId=currentPatientId();
      if(state.patientId){
        sessionStorage.setItem('spire:patientId',state.patientId);
        const rememberedView=sessionStorage.getItem('spire:active-view');
        if(rememberedView && document.getElementById(rememberedView)) selectViewShell(rememberedView);
        restoreChartSnapshot(state.patientId);
        await loadPatientChart(state.patientId);
      }else{
        renderClientPicker();
      }`
  );

  replaceOnce(
    'bootstrap stable style installation',
    /  async function bootstrap\(\) \{\n    if\(!requireSession\(\)\)return;/,
    `  async function bootstrap() {
    if(!requireSession())return;
    installStableWorkspaceStyles();`
  );

  replaceOnce(
    'admission history reuse',
    /    state\.admissionHistory=await api\(`\/api\/spire\/patients\/\$\{encodeURIComponent\(state\.patientId\)\}\/admission-history`\);/,
    `    if(!state.admissionHistory) state.admissionHistory=await api(\`/api/spire/patients/${'${encodeURIComponent(state.patientId)}'}/admission-history\`);`
  );

  for (const [label, text] of [
    ['chart history', 'Loading chart history…'],
    ['continuous flowsheet', 'Loading continuous flowsheet…'],
    ['medication administration record', 'Loading medication administration record…'],
  ]) {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    replaceOnce(
      `${label} non-destructive loading`,
      new RegExp(`    host\\.innerHTML = '<div class="spire-empty">${escaped}<\\/div>';`),
      `    if(!hasLiveViewContent(host)) host.innerHTML = stableLoadingMarkup('${text}');`
    );
  }

  replaceOnce(
    'logout snapshot cleanup',
    /else if\(label\.includes\('log out'\)\)\{node\.style\.cursor='pointer';node\.onclick=\(\)=>\{TOKEN_KEYS\.forEach\(key=>\{sessionStorage\.removeItem\(key\);localStorage\.removeItem\(key\)\}\);location\.href='\/employee-login\.html';\};\}/,
    `else if(label.includes('log out')){node.style.cursor='pointer';node.onclick=()=>{clearChartSnapshots();TOKEN_KEYS.forEach(key=>{sessionStorage.removeItem(key);localStorage.removeItem(key)});location.href='/employee-login.html';};}`
  );

  await writeFile(targetPath, source, 'utf8');
}

const verified = await readFile(targetPath, 'utf8');
for (const required of [marker, 'VIEW_REVISIT_TTL_MS', 'CHART_SNAPSHOT_TTL_MS', 'restoreChartSnapshot', 'Refreshing live data', 'stableLoadingMarkup']) {
  if (!verified.includes(required)) throw new Error(`Spire stable workspace optimizer verification failed: missing ${required}`);
}

console.log('Spire stable workspace UX installed: atomic chart hydration, short-lived refresh snapshot, non-destructive tab refresh, and revisit caching are active.');
