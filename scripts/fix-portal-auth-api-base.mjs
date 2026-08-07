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

  let next = source.replaceAll(staleApi, canonicalApi);

  // A protected feature endpoint returning 401 must not destroy the global
  // Sulandra login. Login establishes the session once; individual API routes
  // enforce role/permission access and surface their own authorization errors.
  if (relative === 'admin-railway.js') {
    next = next
      .replace('    if (response.status === 401) signOut();\n', '')
      .replace('if(response.status===401)signOut();', '');
  }

  if (next !== source) {
    await writeFile(target, next, 'utf8');
    changed += 1;
  }

  if (!next.includes(canonicalApi)) {
    throw new Error(`${relative} does not reference the canonical Railway API host`);
  }
  if (relative === 'admin-railway.js' && /response\.status\s*===\s*401\)\s*signOut\(/.test(next)) {
    throw new Error('Admin still destroys the global Sulandra session when one API route returns 401.');
  }
}

console.log(`Portal authentication API base and session stability verified${changed ? `; repaired ${changed} file(s)` : ''}.`);
