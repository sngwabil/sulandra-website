import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminPath = path.join(root, 'dist-web', 'admin.html');
let html = await readFile(adminPath, 'utf8');

html = html.replace(/\s*<!-- modern-admin-shell:start -->[\s\S]*?<!-- modern-admin-shell:end -->\s*/g, '\n');
for (const asset of [
  'admin-live-dashboard',
  'sulandra-enterprise-owner',
  'admin-service-home-management-v2',
  'admin-platform-routing',
  'admin-dashboard-cleanup',
]) {
  html = html.replace(new RegExp(`\\s*<script[^>]+src=["']\\/assets\\/${asset}\\.js[^>]*><\\/script>\\s*`, 'g'), '\n');
}

if (!/http-equiv=["']Cache-Control["']/i.test(html)) {
  html = html.replace('</head>', '  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n  <meta http-equiv="Pragma" content="no-cache">\n  <meta http-equiv="Expires" content="0">\n</head>');
}

const shell = `
<!-- modern-admin-shell:start -->
<style id="modern-admin-shell-styles">
html,body{width:100%;max-width:none;margin:0;padding:0;overflow-x:hidden}
body{min-height:100vh}
.sulandra-platform-bar{width:100%;background:#083a67;color:#fff;border-bottom:4px solid #d4a72c;display:flex;align-items:center;gap:14px;padding:12px clamp(12px,2vw,28px);font-family:Segoe UI,Arial,sans-serif;position:relative;z-index:1250;overflow-x:auto;scrollbar-width:none}
.sulandra-platform-bar::-webkit-scrollbar{display:none}.sulandra-platform-title{font-weight:900;font-size:18px;white-space:nowrap;margin-right:auto}.sulandra-platform-link{white-space:nowrap;text-decoration:none;color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:8px 14px;font-weight:800;background:rgba(255,255,255,.05)}.sulandra-platform-link:hover{background:rgba(255,255,255,.14)}
header,.alert-bar,.main-nav,main,.top-nav,.nav-links,.container{width:100%!important;max-width:none!important;margin-left:0!important;margin-right:0!important}.container{padding-left:clamp(12px,1.3vw,26px)!important;padding-right:clamp(12px,1.3vw,26px)!important}.top-nav{padding-left:clamp(12px,1.3vw,26px)!important;padding-right:clamp(12px,1.3vw,26px)!important}
@media(max-width:720px){.sulandra-platform-bar{padding:9px 10px;gap:8px}.sulandra-platform-title{font-size:14px}.sulandra-platform-link{padding:7px 10px;font-size:12px}}
</style>
<script>
(function(){
  const mount=()=>{
    if(document.querySelector('.sulandra-platform-bar')) return;
    const bar=document.createElement('nav');
    bar.className='sulandra-platform-bar';
    bar.setAttribute('aria-label','Sulandra Health platform navigation');
    bar.innerHTML='<span class="sulandra-platform-title">Sulandra Health Platform</span><a class="sulandra-platform-link" href="/intranet.html">Intranet Portal</a><a class="sulandra-platform-link" href="/employee-portal.html">Employee Portal</a><a class="sulandra-platform-link" href="/employee360.html">Employee 360</a><a class="sulandra-platform-link" href="/education-portal.html">Education Portal</a><a class="sulandra-platform-link" href="/spire.html">Spire Clinical</a>';
    document.body.insertBefore(bar,document.body.firstChild);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
</script>
<script src="/assets/sulandra-enterprise-owner.js?v=20260808-admin-profile-owner-v1"></script>
<script src="/assets/admin-live-dashboard.js?v=20260808-admin-command-center-v4"></script>
<script src="/assets/admin-service-home-management-v2.js?v=20260808-admin-command-center-v4"></script>
<script src="/assets/admin-platform-routing.js?v=20260808-daily-scheduling-v2"></script>
<script src="/assets/admin-dashboard-cleanup.js?v=20260808-dashboard-cleanup-v1"></script>
<!-- modern-admin-shell:end -->`;

html = html.replace('</body>', `${shell}\n</body>`);
await writeFile(adminPath, html, 'utf8');
console.log('Modern Sulandra Admin is canonical in dist-web with the live Command Center, Service Homes manager, dedicated daily Scheduling board, Time & Attendance, Employee 360 Documents/Audit routing, Spire entry, profile-based enterprise-owner status, no-cache shell, and full-width layout.');
