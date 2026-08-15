import { cp, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const ORDER_REL = 'assets/spire-medication-order-entry.js';
const SAFETY_REL = 'assets/spire-mar-safety-verifier.js';
const ORDER_URL = '/assets/spire-medication-order-entry.js?v=20260815-med-order-v2';
const SAFETY_URL = '/assets/spire-mar-safety-verifier.js?v=20260815-mar-safety-v1';
const MAR_MARKER = 'SPIRE_MAR_ORDER_CONTEXT_V1';
const MAR_GLUCOSE_MARKER = 'SPIRE_MAR_SAFETY_GLUCOSE_V1';
const RESUME_MARKER = 'SPIRE_MED_ORDER_RESUME_REBUILDS_SCHEDULE_V1';

let orderRuntime = await readFile(path.join(root, ORDER_REL), 'utf8');
if (!orderRuntime.includes('SPIRE_MEDICATION_ORDER_ENTRY_V2')) throw new Error('Medication order V2 runtime marker is missing');
if (!orderRuntime.includes('frequencyCode')) throw new Error('Medication order V2 runtime is missing structured frequency logic');
if (!orderRuntime.includes('data-scale-toggle')) throw new Error('Medication order V2 runtime is missing sliding-scale editor');
if (!orderRuntime.includes('Manage Orders')) throw new Error('Medication order V2 runtime is missing medication management');

// Resuming a held order makes it ACTIVE first, then re-saves the same structured order
// so the backend rebuilds only its future MAR schedule. Past administrations stay intact.
if (!orderRuntime.includes(RESUME_MARKER)) {
  const oldChange = "  async function changeStatus(order,status){const reason=prompt(`${status==='DISCONTINUED'?'Discontinue':status==='HELD'?'Hold':'Resume'} ${order.name}: enter the reason.`);if(!clean(reason))return;try{await api(`/api/spire/medication-orders-v2/${encodeURIComponent(order.id)}/status`,{method:'POST',body:JSON.stringify({status,reason:clean(reason)})});await loadOrders();renderManage(ensureManageModal());}catch(e){alert(e.message||'Unable to change medication order status.');}}";
  const newChange = `  // ${RESUME_MARKER}\n  async function changeStatus(order,status){const reason=prompt(\`${'${status===\'DISCONTINUED\'?\'Discontinue\':status===\'HELD\'?\'Hold\':\'Resume\'} ${order.name}'}: enter the reason.\`);if(!clean(reason))return;try{await api(\`/api/spire/medication-orders-v2/${'${encodeURIComponent(order.id)}'}/status\`,{method:'POST',body:JSON.stringify({status,reason:clean(reason)})});if(status==='ACTIVE'){const resumePayload=orderToPayload(order,clean(order.linkedOrderGroupId)||undefined);resumePayload.changeReason=\`Order resumed: ${'${clean(reason)}'}\`;await api(\`/api/spire/medication-orders-v2/${'${encodeURIComponent(order.id)}'}\`,{method:'PATCH',body:JSON.stringify(resumePayload)});}await loadOrders();renderManage(ensureManageModal());}catch(e){alert(e.message||'Unable to change medication order status.');}}`;
  if (!orderRuntime.includes(oldChange)) throw new Error('Medication order V2 resume scheduling anchor is missing');
  orderRuntime = orderRuntime.replace(oldChange, newChange);
  await writeFile(path.join(root, ORDER_REL), orderRuntime, 'utf8');
}
if (!orderRuntime.includes(RESUME_MARKER)) throw new Error('Medication order V2 resume scheduling guard was not installed');
new Function(orderRuntime);

const safetyRuntime = await readFile(path.join(root, SAFETY_REL), 'utf8');
if (!safetyRuntime.includes('SPIRE_MAR_SAFETY_VERIFIER_V1')) throw new Error('MAR safety verifier marker is missing');
if (!safetyRuntime.includes('/api/spire/medication-safety/check')) throw new Error('MAR safety verifier is not connected to the safety API');
if (!safetyRuntime.includes('data-spire-bg')) throw new Error('MAR safety verifier is missing sliding-scale glucose verification');
new Function(safetyRuntime);

async function patchMarRuntime(file) {
  let source = await readFile(file, 'utf8');
  if (!source.includes(MAR_MARKER)) {
    const anchor = "    dialog.dataset.status = defaultStatus;";
    if (!source.includes(anchor)) throw new Error(`MAR order-context anchor is missing in ${path.relative(root, file)}`);
    source = source.replace(anchor, `${anchor}\n    // ${MAR_MARKER}\n    dialog.dataset.medicationOrderId = medicationId;\n    dialog.dataset.scheduledFor = scheduledFor || cell.scheduledFor || '';`);
  }
  if (!source.includes(MAR_GLUCOSE_MARKER)) {
    const bodyAnchor = "            note: note || null,\n          }),";
    if (!source.includes(bodyAnchor)) throw new Error(`MAR glucose safety anchor is missing in ${path.relative(root, file)}`);
    source = source.replace(bodyAnchor, `            note: note || null,\n            // ${MAR_GLUCOSE_MARKER}\n            bloodGlucose: (() => { const value = clean(dialog.querySelector('[data-spire-bg]')?.value); return value === '' ? null : Number(value); })(),\n          }),`);
  }
  if (!source.includes(MAR_MARKER) || !source.includes('dialog.dataset.medicationOrderId = medicationId')) {
    throw new Error(`MAR medication-order context was not installed in ${path.relative(root, file)}`);
  }
  if (!source.includes(MAR_GLUCOSE_MARKER)) throw new Error(`MAR glucose safety payload was not installed in ${path.relative(root, file)}`);
  new Function(source);
  await writeFile(file, source, 'utf8');
}

await patchMarRuntime(path.join(root, 'assets', 'spire-mar-timeline.js'));
await patchMarRuntime(path.join(dist, 'assets', 'spire-mar-timeline.js'));

await cp(path.join(root, ORDER_REL), path.join(dist, ORDER_REL));
await cp(path.join(root, SAFETY_REL), path.join(dist, SAFETY_REL));
await stat(path.join(dist, ORDER_REL));
await stat(path.join(dist, SAFETY_REL));

async function publishMaster(masterPath) {
  let html = await readFile(masterPath, 'utf8');
  if (!html.includes('/assets/spire-medication-order-entry.js')) {
    throw new Error(`SPIRE medication-order entry script is missing from ${path.relative(root, masterPath)}`);
  }
  html = html.replace(/\/assets\/spire-medication-order-entry\.js(?:\?v=[^"']*)?/g, ORDER_URL);
  html = html.replace(/\s*<script\s+src=["']\/assets\/spire-mar-safety-verifier\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
  if (!html.includes('</body>')) throw new Error(`SPIRE medication safety publication could not find </body> in ${path.relative(root, masterPath)}`);
  html = html.replace('</body>', `  <script src="${SAFETY_URL}"></script>\n</body>`);
  const orderCount = (html.match(/\/assets\/spire-medication-order-entry\.js\?v=/g) || []).length;
  const safetyCount = (html.match(/\/assets\/spire-mar-safety-verifier\.js\?v=/g) || []).length;
  if (orderCount !== 1) throw new Error(`Medication order V2 must publish exactly once in ${path.relative(root, masterPath)}; found ${orderCount}`);
  if (safetyCount !== 1) throw new Error(`MAR safety verifier must publish exactly once in ${path.relative(root, masterPath)}; found ${safetyCount}`);
  await writeFile(masterPath, html, 'utf8');
}

await publishMaster(path.join(root, 'spire', 'master.html'));
await publishMaster(path.join(dist, 'spire', 'master.html'));

const finalMaster = await readFile(path.join(dist, 'spire', 'master.html'), 'utf8');
for (const required of [ORDER_URL, SAFETY_URL, 'data-view="mar-view"', 'data-view="manage-orders-view"']) {
  if (!finalMaster.includes(required)) throw new Error(`Final SPIRE medication safety publication is missing ${required}`);
}
const finalMar = await readFile(path.join(dist, 'assets', 'spire-mar-timeline.js'), 'utf8');
if (!finalMar.includes(MAR_MARKER)) throw new Error('Published MAR runtime is missing medication-order context');
if (!finalMar.includes(MAR_GLUCOSE_MARKER)) throw new Error('Published MAR runtime is missing sliding-scale glucose safety payload');
const finalOrder = await readFile(path.join(dist, ORDER_REL), 'utf8');
if (!finalOrder.includes(RESUME_MARKER)) throw new Error('Published medication order runtime is missing resume schedule reconstruction');

console.log(`SPIRE medication ordering V2 published via ${ORDER_URL}; MAR second-verifier published via ${SAFETY_URL}; held/resumed scheduling and sliding-scale glucose server verification are enforced.`);
