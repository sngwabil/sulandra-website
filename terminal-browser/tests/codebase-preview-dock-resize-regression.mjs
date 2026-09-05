import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const codebasePath = path.join(repo, 'Codebase.html');
if (!fs.existsSync(codebasePath)) throw new Error(`Missing standalone Codebase source: ${codebasePath}`);

const codebaseHtml = fs.readFileSync(codebasePath, 'utf8');
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url?.startsWith('/Codebase.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(codebaseHtml);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Codebase dock fixture did not bind');

const scriptStub = `
  window.CodeMirror=window.CodeMirror||{fromTextArea:textarea=>({getValue:()=>textarea.value,setValue:value=>{textarea.value=value},focus(){},on(){},replaceSelection(){},execCommand(){}})};
  window.Terminal=window.Terminal||class { constructor(){this.cols=120;this.rows=32;this.element=document.createElement('div')} loadAddon(){} open(host){host.appendChild(this.element)} write(){} writeln(){} onData(){} focus(){} dispose(){} };
  window.FitAddon=window.FitAddon||{FitAddon:class { fit(){} }};
  window.AttachAddon=window.AttachAddon||{AttachAddon:class {}};
`;

let browser;
try {
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    window.__codebaseLayoutEvents = 0;
    window.addEventListener('sulandra:workspace-layout-resized', () => { window.__codebaseLayoutEvents += 1; });
    window.fetch = async () => new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(`http://127.0.0.1:${address.port}/`)) return route.continue();
    if (/\.(?:js)(?:\?|$)/i.test(url)) return route.fulfill({ contentType: 'application/javascript', body: scriptStub });
    if (/\.css(?:\?|$)/i.test(url)) return route.fulfill({ contentType: 'text/css', body: '' });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body></body></html>' });
  });

  await page.goto(`http://127.0.0.1:${address.port}/Codebase.html`);
  await page.locator('#resizer-right').waitFor({ state: 'visible' });
  await page.evaluate(() => switchRightPanel('preview'));
  await page.waitForTimeout(40);

  const initial = await page.evaluate(() => ({
    panel: document.querySelector('#sidebar-right')?.getBoundingClientRect().width || 0,
    max: Math.floor(document.querySelector('.main-area')?.getBoundingClientRect().width * 0.25 || 0),
  }));
  if (initial.panel < 100 || initial.panel > initial.max + 1) throw new Error(`Preview dock was not capped to one quarter of the workspace: ${JSON.stringify(initial)}`);

  let box = await page.locator('#resizer-right').boundingBox();
  if (!box) throw new Error('Preview dock resize handle is missing');
  await page.mouse.move(box.x + 2, box.y + 120);
  await page.mouse.down();
  const activeDrag = await page.evaluate(() => ({
    resizing: document.querySelector('#codebase-app')?.classList.contains('codebase-panel-resizing'),
    iframePointerEvents: getComputedStyle(document.querySelector('#railway-preview-iframe')).pointerEvents,
  }));
  if (!activeDrag.resizing || activeDrag.iframePointerEvents !== 'none') throw new Error(`Preview iframe can still interrupt its splitter drag: ${JSON.stringify(activeDrag)}`);
  await page.mouse.move(box.x + 100, box.y + 120, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(30);
  const reduced = await page.evaluate(() => ({
    panel: document.querySelector('#sidebar-right')?.getBoundingClientRect().width || 0,
    resizing: document.querySelector('#codebase-app')?.classList.contains('codebase-panel-resizing'),
    iframePointerEvents: getComputedStyle(document.querySelector('#railway-preview-iframe')).pointerEvents,
  }));
  if (reduced.panel > initial.panel - 70 || reduced.resizing || reduced.iframePointerEvents === 'none') {
    throw new Error(`Dragging from the Preview splitter did not reduce and clean up the dock: ${JSON.stringify({ initial, reduced })}`);
  }

  box = await page.locator('#resizer-right').boundingBox();
  if (!box) throw new Error('Preview dock resize handle disappeared after dragging');
  await page.mouse.move(box.x + 2, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x - 800, box.y + 120, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(30);
  const expanded = await page.evaluate(() => ({
    panel: document.querySelector('#sidebar-right')?.getBoundingClientRect().width || 0,
    max: Math.floor(document.querySelector('.main-area')?.getBoundingClientRect().width * 0.25 || 0),
    layoutEvents: window.__codebaseLayoutEvents,
  }));
  if (expanded.panel < expanded.max - 2 || expanded.panel > expanded.max + 1 || expanded.layoutEvents < 2) {
    throw new Error(`Preview dock did not grow to, and stop at, its one-quarter limit: ${JSON.stringify(expanded)}`);
  }

  await page.evaluate(() => closeRightPanel());
  await page.evaluate(() => switchRightPanel('preview'));
  const reopened = await page.evaluate(() => ({
    panel: document.querySelector('#sidebar-right')?.getBoundingClientRect().width || 0,
    max: Math.floor(document.querySelector('.main-area')?.getBoundingClientRect().width * 0.25 || 0),
  }));
  if (reopened.panel < 100 || reopened.panel > reopened.max + 1) throw new Error(`Preview tab did not reopen within its safe width: ${JSON.stringify(reopened)}`);

  console.log('Standalone Codebase Preview dock regression passed: pointer-captured splitter drag works across the iframe, cleans up, emits layout updates, and stays capped at one quarter of the workspace.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
