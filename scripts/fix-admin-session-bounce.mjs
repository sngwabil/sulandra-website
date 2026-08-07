import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['admin-railway.js'];
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';
const staleApi = 'https://sulandra-website-production.up.railway.app';

for (const relative of files) {
  const target = path.join(root, relative);
  let source = await readFile(target, 'utf8');
  source = source.replaceAll(staleApi, canonicalApi);

  // A single protected feature returning 401 must not erase the user's entire
  // Sulandra SSO session and throw them back to login. Keep the token/session;
  // surface the authorization error in the module instead. Explicit Sign Out,
  // missing credentials, or expiry handled by the login/session shell still ends
  // the session normally.
  source = source.replace(
    '    if (response.status === 401) signOut();\n',
    '    if (response.status === 401) { throw new Error(payload.error || payload.message || "This module could not authorize the current Sulandra session."); }\n',
  );

  if (source.includes('if (response.status === 401) signOut();')) {
    throw new Error(`${relative} still destroys the global Sulandra session on a feature-level 401.`);
  }
  if (!source.includes(canonicalApi)) throw new Error(`${relative} is not using the canonical Railway API.`);
  await writeFile(target, source, 'utf8');
}

console.log('Admin session bounce removed: feature-level authorization failures no longer clear the authenticated Sulandra login.');
