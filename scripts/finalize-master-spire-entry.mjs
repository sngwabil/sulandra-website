import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'spire', 'master.html');
const publishedPath = path.join(root, 'dist-web', 'spire.html');

const master = await readFile(sourcePath, 'utf8');

for (const marker of [
  'S.P.I.R.E. STANDALONE MASTER',
  'S.P.I.R.E. Enterprise - Master Client Chart & Intake',
  'sulandra-entity-context.js',
]) {
  if (!master.includes(marker)) {
    throw new Error(`Master SPIRE publication aborted: spire/master.html is missing ${marker}`);
  }
}

for (const legacy of [
  'spire-home-care-redesign-loader.js',
  'spire-clinical-workstation.css',
  'spire-app-v2.js',
]) {
  if (master.includes(legacy)) {
    throw new Error(`Master SPIRE publication aborted: standalone master unexpectedly references legacy shell asset ${legacy}`);
  }
}

await writeFile(publishedPath, master, 'utf8');
console.log('Canonical live SPIRE finalized: dist-web/spire.html is an exact publication of spire/master.html; legacy shell assets are not loaded by the live workstation.');
