import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_ORDERS_MEDICATION_NAME_V7';

let source = await readFile(masterPath, 'utf8');

for (const required of ['SPIRE_MAR_SINGLE_OWNER_V5', 'SPIRE_ORDERS_WORKSPACE_RECOVERY_V6']) {
  if (!source.includes(required)) throw new Error(`SPIRE Orders medication-name v7 requires ${required} first`);
}

if (!source.includes(marker)) {
  const ordersAnchor = '  // SPIRE_ORDERS_WORKSPACE_RECOVERY_V6: Orders must never remain on its static template while live data is loading.';
  if (!source.includes(ordersAnchor)) throw new Error('SPIRE Orders v7 could not find the Orders v6 loader anchor');
  source = source.replace(
    ordersAnchor,
    `  // ${marker}: Orders resolves medication display names locally and never depends on the retired MAR helper.\n${ordersAnchor}`
  );

  const retiredDependency = 'esc(medicationName(m))';
  const localMedicationName = "esc(m?.medicationName || m?.name || m?.displayName || m?.order?.medicationName || m?.order?.name || 'Medication')";
  if (!source.includes(retiredDependency)) throw new Error('SPIRE Orders v7 could not find the retired medicationName dependency');
  source = source.replace(retiredDependency, localMedicationName);
}

for (const required of [
  marker,
  "m?.medicationName || m?.name || m?.displayName || m?.order?.medicationName || m?.order?.name || 'Medication'",
  'data-spire-orders-loading="true"',
  'data-spire-orders-live="true"',
  "if (viewId === 'mar-view') return Promise.resolve(false)",
]) {
  if (!source.includes(required)) throw new Error(`SPIRE Orders medication-name v7 verification failed: missing ${required}`);
}
if (source.includes('esc(medicationName(m))')) {
  throw new Error('SPIRE Orders medication-name v7 verification failed: Orders still depends on the removed MAR medicationName helper');
}

await writeFile(masterPath, source, 'utf8');
console.log('SPIRE Orders medication-name v7 installed: Orders renders medication names independently of the retired MAR helper.');
