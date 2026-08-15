import { cp, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const ORDER_REL = 'assets/spire-medication-order-entry.js';
const SAFETY_REL = 'assets/spire-mar-safety-verifier.js';
const ORDER_URL = '/assets/spire-medication-order-entry.js?v=20260815-med-order-v2';
const SAFETY_URL = '/assets/spire-mar-safety-verifier.js?v=20260815-mar-safety-v2';

await cp(path.join(root, ORDER_REL), path.join(dist, ORDER_REL));
await cp(path.join(root, SAFETY_REL), path.join(dist, SAFETY_REL));
await stat(path.join(dist, ORDER_REL));
await stat(path.join(dist, SAFETY_REL));

async function publish(masterPath) {
  let html = await readFile(masterPath, 'utf8');
  html = html
    .replace(/\s*<script\s+src=["']\/assets\/spire-medication-order-entry\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n')
    .replace(/\s*<script\s+src=["']\/assets\/spire-mar-safety-verifier\.js(?:\?v=[^"']*)?["']><\/script>\s*/gi, '\n');
  if (!html.includes('</body>')) throw new Error(`SPIRE medication UI publication could not find </body> in ${path.relative(root, masterPath)}`);
  html = html.replace('</body>', `  <script src="${ORDER_URL}"></script>\n  <script src="${SAFETY_URL}"></script>\n</body>`);
  await writeFile(masterPath, html, 'utf8');
}

await publish(path.join(root, 'spire', 'master.html'));
await publish(path.join(dist, 'spire', 'master.html'));

const finalMaster = await readFile(path.join(dist, 'spire', 'master.html'), 'utf8');
if (!finalMaster.includes(ORDER_URL) || !finalMaster.includes(SAFETY_URL)) throw new Error('Final SPIRE master did not retain medication V2 assets');
console.log(`SPIRE medication ordering V2 and non-destructive MAR safety verifier published: ${ORDER_URL}, ${SAFETY_URL}.`);
