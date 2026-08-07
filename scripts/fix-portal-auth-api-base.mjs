import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';
const staleApi = 'https://sulandra-website-production.up.railway.app';
const files = ['employee-login-railway.js', 'employee-portal-railway.js', 'admin-railway.js'];

let changed = 0;
for (const relative of files) {
  const target = path.join(root, relative);
  let source;
  try { source = await readFile(target, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') continue; throw error; }

  const next = source.replaceAll(staleApi, canonicalApi);
  if (next !== source) {
    await writeFile(target, next, 'utf8');
    changed += 1;
  }

  const finalSource = next;
  if (!finalSource.includes(canonicalApi)) {
    throw new Error(`${relative} does not reference the canonical Railway API host`);
  }
}

console.log(`Portal authentication API base verified${changed ? `; repaired ${changed} file(s)` : ''}.`);
