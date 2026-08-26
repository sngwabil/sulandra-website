import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asset = '/assets/admin-cross-workspace-launcher.js?v=20260825-portal-separation-1';

for (const relative of ['admin.html', 'admin-operations.html']) {
  const target = path.join(root, relative);
  let html = await readFile(target, 'utf8');
  html = html.replace(/\s*<script src="\/assets\/admin-cross-workspace-launcher\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  if (!html.includes('</body>')) throw new Error(`${relative} has no body close for cross-workspace launcher`);
  html = html.replace('</body>', `<script src="${asset}"></script>\n</body>`);
  if (!html.includes(asset)) throw new Error(`${relative} did not receive the Admin → Employee launcher`);
  await writeFile(target, html, 'utf8');
}

console.log('Admin → Employee separate-tab launcher published to admin.html and admin-operations.html.');
