import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const adminPath = path.join(dist, 'admin.html');
const dashboardPath = path.join(dist, 'assets', 'admin-live-dashboard.js');

let admin = await readFile(adminPath, 'utf8');
admin = admin.replace(/\s*<style id="admin-fullscreen-layout">[\s\S]*?<\/style>\s*/g, '\n');
const fullScreenCss = `
<style id="admin-fullscreen-layout">
html,body{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important;overflow-x:hidden!important}
body{min-height:100vh!important}
header,.alert-bar,.main-nav,main{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}
.top-nav,.nav-links,.container{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}
.top-nav{padding-left:clamp(12px,1.4vw,28px)!important;padding-right:clamp(12px,1.4vw,28px)!important}
.nav-links{padding-left:clamp(8px,1vw,20px)!important;padding-right:clamp(8px,1vw,20px)!important;overscroll-behavior-x:contain}
.container{padding-left:clamp(12px,1.25vw,26px)!important;padding-right:clamp(12px,1.25vw,26px)!important;margin-top:22px!important;margin-bottom:70px!important}
.grid{width:100%!important;max-width:none!important}
.module{width:100%!important;max-width:none!important}
@media(max-width:800px){.container{padding-left:10px!important;padding-right:10px!important}.top-nav{padding-left:10px!important;padding-right:10px!important}.nav-links{padding-left:6px!important;padding-right:6px!important}}
</style>`;
admin = admin.replace('</head>', `${fullScreenCss}\n</head>`);
await writeFile(adminPath, admin, 'utf8');

let dashboard = await readFile(dashboardPath, 'utf8');
// Make collapsed controls long vertically while leaving only a slim grab strip in the workspace.
dashboard = dashboard
  .replace(/\.edge-toggle\{position:fixed;z-index:1855;width:28px;height:40px;/, '.edge-toggle{position:fixed;z-index:1855;width:24px;height:104px;')
  .replace(/\.edge-toggle\.left\{left:0;border-radius:0 9px 9px 0\}/, '.edge-toggle.left{left:-18px;border-radius:0 10px 10px 0}')
  .replace(/\.edge-toggle\.right\{right:0;border-radius:9px 0 0 9px\}/, '.edge-toggle.right{right:-18px;border-radius:10px 0 0 10px}')
  .replace(/\.edge-toggle\.open\.left\{left:298px\}/, '.edge-toggle.open.left{left:280px}')
  .replace(/\.edge-toggle\.open\.right\{right:298px\}/, '.edge-toggle.open.right{right:280px}')
  .replace(/font-size:18px;font-weight:900;display:grid;place-items:center;top:52%/, 'font-size:15px;font-weight:900;display:grid;place-items:center;top:52%');
await writeFile(dashboardPath, dashboard, 'utf8');

console.log('Admin full-viewport layout finalized with slim long edge handles.');