import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_STABLE_WORKSPACE_SELECTOR_FIX_V1';

let source = await readFile(masterPath, 'utf8');

if (!source.includes('SPIRE_STABLE_WORKSPACE_UX_V1')) {
  throw new Error('Spire stable workspace selector guard requires the stable workspace optimizer to run first');
}

// String.prototype.replace interprets $$ inside replacement strings as one literal $.
// Several build-time chart transforms legitimately emit calls to the repository's $$
// querySelectorAll helper. After those transforms, the published chart could therefore
// contain $(...).forEach, which calls forEach on a single Element and aborts chart tab
// activation and remembered-view restoration. Normalize those generated selector loops
// to native querySelectorAll so the published browser runtime is independent of replacement
// string semantics and of the $/$$ convenience helpers.
const selectorRepairs = [
  ["$$('.chart-tab').forEach", "document.querySelectorAll('.chart-tab').forEach"],
  ["$('.chart-tab').forEach", "document.querySelectorAll('.chart-tab').forEach"],
  ["$$('.workspace-view').forEach", "document.querySelectorAll('.workspace-view').forEach"],
  ["$('.workspace-view').forEach", "document.querySelectorAll('.workspace-view').forEach"],
  ["for (const host of $$('.workspace-view'))", "for (const host of document.querySelectorAll('.workspace-view'))"],
  ["for (const host of $('.workspace-view'))", "for (const host of document.querySelectorAll('.workspace-view'))"],
];

for (const [broken, repaired] of selectorRepairs) {
  source = source.replaceAll(broken, repaired);
}

if (!source.includes(marker)) {
  const anchor = '  const VIEW_REVISIT_TTL_MS = 30 * 1000;';
  if (!source.includes(anchor)) throw new Error('Spire stable workspace selector marker anchor is missing');
  source = source.replace(anchor, `  // ${marker}: published chart selector loops are native NodeList iterations.\n${anchor}`);
}

const required = [
  marker,
  "document.querySelectorAll('.chart-tab').forEach",
  "document.querySelectorAll('.workspace-view').forEach",
  "for (const host of document.querySelectorAll('.workspace-view'))",
];
for (const needle of required) {
  if (!source.includes(needle)) throw new Error(`Spire stable workspace selector verification failed: missing ${needle}`);
}

const forbidden = [
  "$$('.chart-tab').forEach",
  "$('.chart-tab').forEach",
  "$$('.workspace-view').forEach",
  "$('.workspace-view').forEach",
  "for (const host of $$('.workspace-view'))",
  "for (const host of $('.workspace-view'))",
];
for (const needle of forbidden) {
  if (source.includes(needle)) throw new Error(`Spire stable workspace selector verification failed: generated singular selector loop remains: ${needle}`);
}

await writeFile(masterPath, source, 'utf8');

console.log('Spire stable workspace selector guard installed: chart tabs and remembered-view restoration use native querySelectorAll iteration without $(...).forEach publication errors.');
