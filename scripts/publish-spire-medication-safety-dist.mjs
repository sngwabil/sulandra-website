import { cp, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const orderRel = 'assets/spire-medication-order-entry.js';
const safetyRel = 'assets/spire-mar-safety-verifier.js';
const orderUrl = '/assets/spire-medication-order-entry.js?v=20260815-med-order-v2';
const safetyUrl = '/assets/spire-mar-safety-verifier.js?v=20260815-mar-safety-v2';

await cp(path.join(root, orderRel), path.join(dist, orderRel));
await cp(path.join(root, safetyRel), path.join(dist, safetyRel));
await stat(path.join(dist, orderRel));
await stat(path.join(dist, safetyRel));

const masterPath = path.join(dist, 'spire', 'master.html');
let html = await readFile(masterPath, 'utf8');
html = html
  .replace(/\s*<script\s+src=["']\/assets\/spire-medication-order-entry\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n')
  .replace(/\s*<script\s+src=["']\/assets\/spire-mar-safety-verifier\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
if (!html.includes('</body>')) throw new Error('Final SPIRE master is missing </body>');
html = html.replace('</body>', `  <script src="${orderUrl}"></script>\n  <script src="${safetyUrl}"></script>\n</body>`);
await writeFile(masterPath, html, 'utf8');

const published = await readFile(masterPath, 'utf8');
for (const marker of [orderUrl, safetyUrl, 'data-view="mar-view"', 'data-view="manage-orders-view"']) {
  if (!published.includes(marker)) throw new Error(`Final SPIRE medication publication is missing ${marker}`);
}
console.log(`Final SPIRE distribution publishes medication ordering V2 and MAR safety verifier V2.`);
