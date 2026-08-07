import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const failures = [];

async function mustRead(relative) {
  try { return await readFile(path.join(dist, relative), 'utf8'); }
  catch { failures.push(`Missing published file: ${relative}`); return ''; }
}

const adminHtml = await mustRead('admin.html');
const adminJs = await mustRead('admin-railway.js');
const liveJs = await mustRead('assets/admin-live-dashboard.js');

if (!adminHtml.includes('/assets/admin-live-dashboard.js')) failures.push('Admin page does not load the live dashboard asset');
if (!adminJs.includes('sulandra:admin:active-module')) failures.push('Admin module persistence key is missing');
if (!adminJs.includes('history.replaceState')) failures.push('Admin module URL/hash persistence is missing');
if (!adminJs.includes('https://sulandra-website-production-5fc4.up.railway.app')) failures.push('Admin runtime is not using canonical Railway API');
if (adminJs.includes('https://sulandra-website-production.up.railway.app')) failures.push('Admin runtime still contains the retired Railway API hostname');
if (!liveJs.includes('Sulandra Health Command Center')) failures.push('Live command center is missing');
if (!liveJs.includes('api.open-meteo.com')) failures.push('Weather card is not wired to live weather data');
if (!liveJs.includes('right-panel-toggle')) failures.push('Right slide-out toggle is missing');
if (!liveJs.includes('body .taskbar-toggle{left:0!important')) failures.push('Left slide-out toggle is not flush with the viewport edge');
if (!liveJs.includes('/api/admin/dashboard')) failures.push('Live dashboard is not connected to admin dashboard data');

if (failures.length) {
  console.error('Admin command-center verification failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Admin command center verified: live dashboard, weather, persistent module refresh behavior, canonical API, and dual slide-out panels are published.');
