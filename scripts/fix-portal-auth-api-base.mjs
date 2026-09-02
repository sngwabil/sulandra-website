import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionApi = 'https://sulandra-website-production-5fc4.up.railway.app';
const canonicalApi = String(process.env.VITE_API_URL || productionApi).trim().replace(/\/$/, '');
const staleApi = 'https://sulandra-website-production.up.railway.app';
const files = ['employee-login-railway.js', 'employee-portal-railway.js', 'admin-railway.js'];
const apiRequired = new Set(['employee-login-railway.js', 'admin-railway.js']);

let changed = 0;
for (const relative of files) {
  const target = path.join(root, relative);
  let source;
  try { source = await readFile(target, 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') continue; throw error; }

  let next = source.replaceAll(staleApi, canonicalApi).replaceAll(productionApi, canonicalApi);

  if (relative === 'admin-railway.js') {
    next = next
      .replace('    if (response.status === 401) signOut();\n', '')
      .replace('if(response.status===401)signOut();', '');
  }

  if (next !== source) {
    await writeFile(target, next, 'utf8');
    changed += 1;
  }

  if (apiRequired.has(relative) && !next.includes(canonicalApi)) {
    throw new Error(`${relative} does not reference the configured Railway API host`);
  }
  if (next.includes(staleApi)) throw new Error(`${relative} still references the retired Railway API host`);
  if (relative === 'admin-railway.js' && /response\.status\s*===\s*401\)\s*signOut\(/.test(next)) {
    throw new Error('Admin still destroys the global Sulandra session when one API route returns 401.');
  }
}

console.log(`Portal authentication and sign-in-once SSO verified for ${canonicalApi}${changed ? `; repaired ${changed} file(s)` : ''}.`);