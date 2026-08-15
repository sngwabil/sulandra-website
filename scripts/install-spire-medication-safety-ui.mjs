import { cp, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const ORDER_REL = 'assets/spire-medication-order-entry.js';
const SAFETY_REL = 'assets/spire-mar-safety-verifier.js';
const ORDER_URL = '/assets/spire-medication-order-entry.js?v=20260815-med-order-v2';
const SAFETY_URL = '/assets/spire-mar-safety-verifier.js?v=20260815-mar-safety-v2';

const orderRuntime = await readFile(path.join(root, ORDER_REL), 'utf8');
if (!orderRuntime.includes('SPIRE_MEDICATION_ORDER_ENTRY_V2')) throw new Error('Medication order V2 runtime marker is missing');
if (!orderRuntime.includes('frequencyCode')) throw new Error('Medication order V2 runtime is missing structured frequency logic');
if (!orderRuntime.includes('data-scale-toggle')) throw new Error('Medication order V2 runtime is missing sliding-scale editor');
if (!orderRuntime.includes('Manage Orders')) throw new Error('Medication order V2 runtime is missing medication management');
new Function(orderRuntime);

const safetyRuntime = await readFile(path.join(root, SAFETY_REL), 'utf8');
if (!safetyRuntime.includes('SPIRE_MAR_SAFETY_VERIFIER_V2')) throw new Error('MAR safety verifier V2 marker is missing');
if (!safetyRuntime.includes('/api/spire/medication-safety/check')) throw new Error('MAR safety verifier is not connected to the safety API');
if (!safetyRuntime.includes('data-spire-bg')) throw new Error('MAR safety verifier is missing sliding-scale glucose verification');
if (!safetyRuntime.includes("target.closest('[data-mar-med]')")) throw new Error('MAR safety verifier cannot capture the medication-order context');
if (!safetyRuntime.includes('bloodGlucose')) throw new Error('MAR safety verifier does not forward glucose to the eMAR write');
new Function(safetyRuntime);

// Do not rewrite the established MAR or medication-order engines during publication.
// Publish the validated V2 assets over the already-copied static files and load the
// verifier as a final non-destructive layer.
await cp(path.join(root, ORDER_REL), path.join(dist, ORDER_REL));
await cp(path.join(root, SAFETY_REL), path.join(dist, SAFETY_REL));
await stat(path.join(dist, ORDER_REL));
await stat(path.join(dist, SAFETY_REL));

async function publishMaster(masterPath) {
  let html = await readFile(masterPath, 'utf8');
  if (!html.includes('/assets/spire-medication-order-entry.js')) throw new Error(`SPIRE medication-order entry script is missing from ${path.relative(root, masterPath)}`);
  html = html.replace(/\/assets\/spire-medication-order-entry\.js(?:\?v=[^"']*)?/g, ORDER_URL);
  html = html.replace(/\s*<script\s+src=["']\/assets\/spire-mar-safety-verifier\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
  if (!html.includes('</body>')) throw new Error(`SPIRE medication safety publication could not find </body> in ${path.relative(root, masterPath)}`);
  html = html.replace('</body>', `  <script src="${SAFETY_URL}"></script>\n</body>`);
  const orderCount = (html.match(/\/assets\/spire-medication-order-entry\.js\?v=/g) || []).length;
  const safetyCount = (html.match(/\/assets\/spire-mar-safety-verifier\.js\?v=/g) || []).length;
  if (orderCount !== 1) throw new Error(`Medication order V2 must publish exactly once in ${path.relative(root, masterPath)}; found ${orderCount}`);
  if (safetyCount !== 1) throw new Error(`MAR safety verifier V2 must publish exactly once in ${path.relative(root, masterPath)}; found ${safetyCount}`);
  await writeFile(masterPath, html, 'utf8');
}

await publishMaster(path.join(root, 'spire', 'master.html'));
await publishMaster(path.join(dist, 'spire', 'master.html'));

const finalMaster = await readFile(path.join(dist, 'spire', 'master.html'), 'utf8');
for (const required of [ORDER_URL, SAFETY_URL, 'data-view="mar-view"', 'data-view="manage-orders-view"']) {
  if (!finalMaster.includes(required)) throw new Error(`Final SPIRE medication safety publication is missing ${required}`);
}
const finalSafety = await readFile(path.join(dist, SAFETY_REL), 'utf8');
if (!finalSafety.includes('SPIRE_MAR_SAFETY_VERIFIER_V2')) throw new Error('Published MAR safety verifier is stale');

console.log(`SPIRE medication ordering V2 published via ${ORDER_URL}; non-destructive MAR second-verifier V2 published via ${SAFETY_URL}.`);
