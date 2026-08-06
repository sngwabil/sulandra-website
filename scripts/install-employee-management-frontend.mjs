import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'dist-web', 'admin.html');
const version = '20260806-employee360-1';
let html = await readFile(adminPath, 'utf8');
html = html.replace(/\s*<script src="\/assets\/admin-employee-management\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
if (!html.includes('</body>')) throw new Error('dist-web/admin.html is missing a closing body tag');
html = html.replace('</body>', `  <script src="/assets/admin-employee-management.js?v=${version}"></script>\n</body>`);
await writeFile(adminPath, html, 'utf8');
console.log('Employee 360 admin workspace added to the static frontend.');
