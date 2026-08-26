import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routes = await readFile(path.join(root, 'api', 'src', 'sia-routes.ts'), 'utf8');
const map = await readFile(path.join(root, 'api', 'src', 'sia-system-map.ts'), 'utf8');

for (const marker of [
  '/employee-login.html',
  '/employee-portal.html',
  '/admin-login.html',
  '/admin.html',
  '/sia.html',
  '/scheduling.html',
  '/spire.html',
]) {
  if (!map.includes(marker)) throw new Error(`SIA canonical system map missing ${marker}`);
}
if (!routes.includes('SULANDRA_CANONICAL_SYSTEM_MAP')) {
  throw new Error('SIA route handler is not consuming the canonical Sulandra system map.');
}
if (!map.includes('admin sign in') || !map.includes('/admin-login.html, not /sia.html')) {
  throw new Error('SIA administrator sign-in disambiguation contract is missing.');
}
console.log('SIA canonical route map and admin sign-in disambiguation contract verified.');
