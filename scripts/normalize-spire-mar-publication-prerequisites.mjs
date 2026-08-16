import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifierPath = path.join(root, 'scripts', 'verify-spire-foundation.mjs');
const MAR_ASSET = '/assets/spire-mar-timeline.js?v=20260814-chart-photo-db-2';
const MAR_STYLE = '/assets/spire-mar-epic-v5.css?v=20260814-chart-photo-db-2';

let source = await readFile(verifierPath, 'utf8');
const original = source;

// Later static-publication passes intentionally cache-bust the MAR asset. The canonical
// build runs build:web more than once, so normalize the verifier back to the input contract
// expected by fix-spire-mar-publication before each pass. This changes only verifier URLs;
// it does not downgrade or republish the browser runtime itself.
source = source
  .replace(/\/assets\/spire-mar-timeline\.js(?:\?v=[^'"\s,\]]+)?/g, MAR_ASSET)
  .replace(/\/assets\/spire-mar-epic-v5\.css(?:\?v=[^'"\s,\]]+)?/g, MAR_STYLE);

if (!source.includes(MAR_ASSET)) throw new Error('Unable to normalize SPIRE foundation MAR verifier asset');
if (!source.includes(MAR_STYLE)) {
  const marker = `'${MAR_ASSET}'`;
  if (!source.includes(marker)) throw new Error('Unable to locate normalized SPIRE MAR verifier marker');
  source = source.replace(marker, `${marker},'${MAR_STYLE}'`);
}

if (source !== original) await writeFile(verifierPath, source, 'utf8');
console.log('SPIRE MAR publication prerequisites normalized for repeatable build:web execution.');
