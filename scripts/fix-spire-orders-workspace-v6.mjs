import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_ORDERS_WORKSPACE_RECOVERY_V6';

let source = await readFile(masterPath, 'utf8');

for (const required of ['SPIRE_STABLE_WORKSPACE_UX_V1', 'SPIRE_WORKSPACE_PERFORMANCE_V3', 'SPIRE_WORKSTATION_V4', 'SPIRE_MAR_SINGLE_OWNER_V5']) {
  if (!source.includes(required)) throw new Error(`SPIRE Orders v6 requires ${required} first`);
}

if (!source.includes(marker)) {
  const ordersPattern = /  async function loadOrdersView\(\) \{[\s\S]*?\n  \}\n\n  async function loadWorkListView/;
  if (!ordersPattern.test(source)) throw new Error('SPIRE Orders v6 could not find loadOrdersView boundary');
  source = source.replace(ordersPattern, `  // ${marker}: Orders must never remain on its static template while live data is loading.\n  async function loadOrdersView() {\n    const host = $('#manage-orders-view');\n    if (!host) return;\n    if (!state.patientId) return showError(host,'Select a client first.');\n    if (!host.querySelector('[data-spire-orders-live="true"]')) {\n      host.innerHTML = '<section class="epic-section-card" data-spire-orders-loading="true"><div class="epic-section-header header-history"><span>Medication Orders</span><span class="spire-pill">Loading current orders…</span></div><div class="epic-section-body"><div class="spire-empty">Opening the current medication record…</div></div></section>';\n    }\n    const [meds,orders] = await Promise.all([\n      api(\`/api/spire/patients/${'${encodeURIComponent(state.patientId)}'}/medications/active\`).catch(()=>[]),\n      api(\`/api/spire/patients/${'${encodeURIComponent(state.patientId)}'}/chart-review-v2?category=orders\`).catch(()=>({items:[]})),\n    ]);\n    const medications = asArray(meds.items || meds.medications || meds);\n    const orderItems = asArray(orders.items || orders);\n    host.innerHTML=\`<div data-spire-orders-live="true"><div class="spire-section-title"><div><h3>eMAR / Orders</h3><p>Active medication orders and other current orders from the live chart.</p></div></div>\n    <div class="spire-card-grid">\n      <div class="spire-kv-card"><h4>Active Medication Orders</h4>${'${medications.length?medications.map(m=>`<p><b>${esc(medicationName(m))}</b><br>${esc([m.dose,m.route,m.frequency].filter(Boolean).join(\' • \'))}</p>`).join(\'<hr style="border:0;border-top:1px solid #e2e8f0;margin:7px 0">\'):\'<p>No active medication orders.</p>\'}'}</div>\n      <div class="spire-kv-card"><h4>Other Orders</h4>${'${orderItems.length?orderItems.map(o=>`<p><b>${esc(o.description||o.title||\'Order\')}</b><br><span class="spire-muted">${esc(o.status||\'\')} • ${esc(fmtDateTime(o.date||o.orderedAt))}</span></p>`).join(\'<hr style="border:0;border-top:1px solid #e2e8f0;margin:7px 0">\'):\'<p>No active orders found in chart review.</p>\'}'}</div>\n    </div></div>\`;\n  }\n\n  async function loadWorkListView`);

  const gate = `    if (!force && hasLiveViewContent(target) && target.dataset.spireRestored !== 'true') return Promise.resolve();`;
  const gatePatched = `    const staleOrdersTemplate = viewId === 'manage-orders-view'\n      && !target.querySelector('[data-spire-orders-live="true"],[data-spire-orders-loading="true"]')\n      && /eMAR\\s*&\\s*Medication Management/i.test(target.textContent || '');\n    if (staleOrdersTemplate) {\n      target.dataset.spireLive = 'false';\n      target.dataset.spireStale = 'true';\n      viewLoadState.delete(viewStateKey(viewId));\n    }\n    if (!force && !staleOrdersTemplate && hasLiveViewContent(target) && target.dataset.spireRestored !== 'true') return Promise.resolve();`;
  if (!source.includes(gate)) throw new Error('SPIRE Orders v6 could not find persistent revisit gate');
  source = source.replace(gate, gatePatched);

  const prewarmList = `['flowsheets-view','notes-view']`;
  if (!source.includes(prewarmList)) throw new Error('SPIRE Orders v6 could not find canonical idle prewarm list');
  source = source.replaceAll(prewarmList, `['flowsheets-view','notes-view','manage-orders-view']`);
}

for (const required of [
  marker,
  'data-spire-orders-loading="true"',
  'data-spire-orders-live="true"',
  'staleOrdersTemplate',
  "['flowsheets-view','notes-view','manage-orders-view']",
  "if (viewId === 'mar-view') return Promise.resolve(false)",
]) {
  if (!source.includes(required)) throw new Error(`SPIRE Orders v6 verification failed: missing ${required}`);
}
if (source.includes("['flowsheets-view','mar-view','notes-view']")) {
  throw new Error('SPIRE Orders v6 verification failed: MAR returned to the generic prewarm list');
}

await writeFile(masterPath, source, 'utf8');
console.log('SPIRE Orders v6 installed: Orders hydrates immediately, stale placeholders self-recover, and current medication orders prewarm without touching canonical MAR ownership.');
