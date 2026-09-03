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
  ['Codebase visible navigation',codebaseNav,'SULANDRA_CODEBASE_IT_VISIBLE_NAV_V7'],
]){
  if(!source.includes(marker))throw new Error(`${label} missing ${marker}`);
}
for(const marker of ['timeout-fail-open','pageshow','visibility-fail-open','itwsIpadReady']){
  if(!ipadJs.includes(marker))throw new Error(`iPad fail-open runtime missing ${marker}`);
}

// V7 treats Codebase as a separate browser application. Sulandra IT contains
// only a launcher; it must never create or host the Codebase iframe/workspace.
for(const marker of [
  'SULANDRA_CODEBASE_STANDALONE_LAUNCHER_V1',
  'itwsSulandraCodebaseVisibleNav',
  '.itws-sidebar .itws-nav',
  "CODEBASE_URL='/Codebase.html?v=20260903-standalone-2'",
  "WINDOW_NAME='sulandra-codebase'",
  'openStandalone',
  'window.open',
  'suppressEmbeddedCodebase',
]){
  if(!codebaseNav.includes(marker))throw new Error(`Codebase standalone launcher missing ${marker}`);
}
if(codebaseNav.includes("document.createElement('iframe')")||codebaseNav.includes('openInsideIt')){
  throw new Error('Codebase launcher must not embed Codebase inside Sulandra IT');
}
if(codebaseNav.includes("dataset.scbNavSource='engineering'"))throw new Error('Codebase must not publish an Engineering-sourced navigation item');

const cssHref='/assets/it-agent-ipad-load-guard.css?v=20260903-ipad-fail-open-3';
const jsSrc='/assets/it-agent-ipad-load-guard.js?v=20260903-ipad-fail-open-3';
const navSrc='/assets/sulandra-codebase-nav-entry.js?v=20260903-standalone-launcher-7';
const preboot=`<style id="itws-preboot-critical">html.itws-preboot::before{content:"Loading Sulandra IT…";position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#fff;color:#53616d;font:600 15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;pointer-events:auto}html.itws-preboot.itws-boot-failed::before{display:none!important}</style><script id="itws-preboot-script">document.documentElement.classList.add("itws-preboot");clearTimeout(window.__sulandraItPrebootFailOpen);window.__sulandraItPrebootFailOpen=setTimeout(function(){document.documentElement.classList.remove("itws-preboot","itws-boot-failed")},3200)</script>`;

html=html.replace(/\s*<style id="itws-preboot-critical">[\s\S]*?<\/style>\s*<script id="itws-preboot-script">[\s\S]*?<\/script>\s*/g,'\n');
if(!html.includes('</head>'))throw new Error('Sulandra IT head anchor changed');
if(!html.includes('</body>'))throw new Error('Sulandra IT body anchor changed');
html=html.replace('</head>',`${preboot}</head>`);

html=html
  .replace(/\/assets\/it-agent-ipad-load-guard\.css(?:\?v=[^"']*)?/g,cssHref)
  .replace(/\/assets\/it-agent-ipad-load-guard\.js(?:\?v=[^"']*)?/g,jsSrc)
  .replace(/\/assets\/sulandra-codebase-nav-entry\.js(?:\?v=[^"']*)?/g,navSrc);

// The installer must also work independently in CI and repair a partially
// published document, not only when an earlier installer already added tags.
if(!html.includes(cssHref))html=html.replace('</head>',`<link rel="stylesheet" href="${cssHref}"></head>`);
if(!html.includes(jsSrc))html=html.replace('</body>',`<script src="${jsSrc}"></script></body>`);
if(!html.includes(navSrc))html=html.replace('</body>',`<script src="${navSrc}"></script></body>`);

for(const required of [cssHref,jsSrc,navSrc,'itws-preboot-critical','__sulandraItPrebootFailOpen']){
  if(!html.includes(required))throw new Error(`Sulandra IT hotfix publication missing ${required}`);
}
if(/html\.itws-preboot body>header|html\.itws-preboot body>main\.shell/.test(html)){
  throw new Error('Sulandra IT preboot must not hide the application document');
}
if(/id=["']itwsSulandraCodebaseFrame["']/.test(html))throw new Error('Sulandra IT publication must not contain an embedded Codebase iframe');

await writeFile(portalPath,html,'utf8');
console.log(`Sulandra IT iPad fail-open boot guard and standalone Codebase launcher V7 published into ${requested}`);