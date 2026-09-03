import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const requested=process.argv[2]||'it-solutions.html';
const portalPath=path.resolve(root,requested);
const ipadCssPath=path.join(root,'assets','it-agent-ipad-load-guard.css');
const ipadJsPath=path.join(root,'assets','it-agent-ipad-load-guard.js');
const codebaseNavPath=path.join(root,'assets','sulandra-codebase-nav-entry.js');

await Promise.all([access(portalPath),access(ipadCssPath),access(ipadJsPath),access(codebaseNavPath)]);
let html=await readFile(portalPath,'utf8');
const [ipadCss,ipadJs,codebaseNav]=await Promise.all([
  readFile(ipadCssPath,'utf8'),
  readFile(ipadJsPath,'utf8'),
  readFile(codebaseNavPath,'utf8'),
]);

for(const [label,source,marker] of [
  ['iPad CSS',ipadCss,'SULANDRA_IT_IPAD_FAIL_OPEN_V3'],
  ['iPad JavaScript',ipadJs,'SULANDRA_IT_IPAD_FAIL_OPEN_V3'],
  ['Codebase visible navigation',codebaseNav,'SULANDRA_CODEBASE_IT_VISIBLE_NAV_V5'],
]){
  if(!source.includes(marker))throw new Error(`${label} missing ${marker}`);
}
for(const marker of ['timeout-fail-open','pageshow','visibility-fail-open','itwsIpadReady']){
  if(!ipadJs.includes(marker))throw new Error(`iPad fail-open runtime missing ${marker}`);
}
for(const marker of ['itwsSulandraCodebaseVisibleNav','.itws-sidebar .itws-nav','contentHost','Back to IT']){
  if(!codebaseNav.includes(marker))throw new Error(`Codebase visible Sulandra IT navigation missing ${marker}`);
}
if(codebaseNav.includes("data-scb-nav-source='engineering'")||codebaseNav.includes('Engineering Terminal navigation item')){
  // The latter phrase may occur only in a source comment describing what is forbidden;
  // never allow a runtime-created Engineering-sourced Codebase navigation item.
  if(codebaseNav.includes("dataset.scbNavSource='engineering'"))throw new Error('Codebase must not publish an Engineering-sourced navigation item');
}

const preboot=`<style id="itws-preboot-critical">html.itws-preboot::before{content:"Loading Sulandra IT…";position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#fff;color:#53616d;font:600 15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;pointer-events:auto}html.itws-preboot.itws-boot-failed::before{display:none!important}</style><script id="itws-preboot-script">document.documentElement.classList.add("itws-preboot");clearTimeout(window.__sulandraItPrebootFailOpen);window.__sulandraItPrebootFailOpen=setTimeout(function(){document.documentElement.classList.remove("itws-preboot","itws-boot-failed")},3200)</script>`;

html=html.replace(/\s*<style id="itws-preboot-critical">[\s\S]*?<\/style>\s*<script id="itws-preboot-script">[\s\S]*?<\/script>\s*/g,'\n');
if(!html.includes('</head>'))throw new Error('Sulandra IT head anchor changed');
html=html.replace('</head>',`${preboot}</head>`);

html=html
  .replace(/\/assets\/it-agent-ipad-load-guard\.css(?:\?v=[^"']*)?/g,'/assets/it-agent-ipad-load-guard.css?v=20260903-ipad-fail-open-3')
  .replace(/\/assets\/it-agent-ipad-load-guard\.js(?:\?v=[^"']*)?/g,'/assets/it-agent-ipad-load-guard.js?v=20260903-ipad-fail-open-3')
  .replace(/\/assets\/sulandra-codebase-nav-entry\.js(?:\?v=[^"']*)?/g,'/assets/sulandra-codebase-nav-entry.js?v=20260903-visible-it-nav-5');

for(const required of [
  '/assets/it-agent-ipad-load-guard.css?v=20260903-ipad-fail-open-3',
  '/assets/it-agent-ipad-load-guard.js?v=20260903-ipad-fail-open-3',
  '/assets/sulandra-codebase-nav-entry.js?v=20260903-visible-it-nav-5',
  'itws-preboot-critical',
  '__sulandraItPrebootFailOpen',
]){
  if(!html.includes(required))throw new Error(`Sulandra IT hotfix publication missing ${required}`);
}
if(/html\.itws-preboot body>header|html\.itws-preboot body>main\.shell/.test(html)){
  throw new Error('Sulandra IT preboot must not hide the application document');
}

await writeFile(portalPath,html,'utf8');
console.log(`Sulandra IT iPad fail-open boot guard and visible Codebase navigation V5 published into ${requested}`);
