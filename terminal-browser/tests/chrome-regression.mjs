import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const runtime = path.join(repo, 'terminal-browser/dist/sulandra-terminal-runtime.js');
const xtermCss = path.join(repo, 'terminal-browser/node_modules/@xterm/xterm/css/xterm.css');
const emulatorCss = path.join(repo, 'assets/it-agent-xterm-emulator.css');
const productionStack = path.join(repo, 'assets/it-agent-xterm-production-stack.js');
const caretClock = path.join(repo, 'assets/it-agent-terminal-caret-clock.js');

for (const required of [runtime, xtermCss, emulatorCss, productionStack, caretClock]) {
  if (!fs.existsSync(required)) throw new Error(`Missing browser regression dependency: ${required}`);
}

const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Sulandra Terminal Chrome Regression</title></head>
<body>
  <button id="outside">Outside control</button>
  <div id="itwsRealTerminal" class="itws-rt-direct-mode" style="width:1000px;height:520px;display:block">
    <div id="itwsRtShell"></div>
    <div id="itwsRtTabs">
      <button class="itws-rt-tab active" data-terminal-id="term-chrome-1">Terminal 1</button>
    </div>
    <div class="itws-rt-input-switch"></div>
    <div class="itws-rt-terminal-surface" style="width:1000px;height:430px"></div>
    <span id="itwsRtInputHint"></span>
  </div>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url !== '/') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(html);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Chrome regression HTTP fixture did not bind');
const fixtureUrl = `http://127.0.0.1:${address.port}/`;

let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', message => console.log(`[chrome:${message.type()}] ${message.text()}`));
  page.on('pageerror', error => console.error(`[chrome:pageerror] ${error.stack || error.message}`));

  // Navigate to a real HTTP origin. page.setContent/about:blank has an opaque
  // origin in Chrome, which denies localStorage/sessionStorage and prevents the
  // production terminal transport from bootstrapping.
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ path: xtermCss });
  await page.addStyleTag({ path: emulatorCss });
  await page.addStyleTag({ content: `
    #itwsRealTerminal .itws-xterm-host,
    #itwsRealTerminal .itws-xterm-pane,
    #itwsRealTerminal .xterm { width: 100% !important; height: 420px !important; }
  ` });

  await page.addScriptTag({ content: `
    window.__fakeWsSent = [];
    window.__fakeWsInstances = [];
    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor(url, protocols) {
        this.url = url;
        this.protocols = protocols;
        this.readyState = FakeWebSocket.CONNECTING;
        this.binaryType = 'arraybuffer';
        window.__fakeWsInstances.push(this);
        setTimeout(() => {
          this.readyState = FakeWebSocket.OPEN;
          this.onopen?.({});
          setTimeout(() => {
            if (this.readyState !== FakeWebSocket.OPEN) return;
            const snapshot = new TextEncoder().encode('\\u001b[>c\\r\\nbash-5.2$ ');
            this.onmessage?.({ data: snapshot.buffer });
          }, 20);
        }, 20);
      }
      send(data) {
        let text = '';
        let binary = false;
        if (typeof data === 'string') text = data;
        else if (data instanceof Uint8Array) { binary = true; text = new TextDecoder().decode(data); }
        else if (data instanceof ArrayBuffer) { binary = true; text = new TextDecoder().decode(new Uint8Array(data)); }
        else text = String(data);
        window.__fakeWsSent.push({ binary, text });
      }
      close(code = 1000, reason = '') {
        if (this.readyState === FakeWebSocket.CLOSED) return;
        this.readyState = FakeWebSocket.CLOSED;
        setTimeout(() => this.onclose?.({ code, reason }), 0);
      }
    }
    window.WebSocket = FakeWebSocket;
    localStorage.setItem('sulandra:admin:access-token', 'chrome-regression-token');
    sessionStorage.setItem('sulandra:terminal:chrome-regression', '1');
    window.__SULANDRA_TERMINAL_REST_BRIDGE__ = {
      snapshot: () => null,
      hydrate: async () => ({ alive: true, data: '' }),
      sendInput: async () => ({ ok: true })
    };
  ` });
  await page.addScriptTag({ path: runtime });
  await page.addScriptTag({ path: productionStack });
  await page.addScriptTag({ path: caretClock });

  const activeCursorSelector = '.itws-xterm-pane.active .xterm-cursor-layer, .itws-xterm-pane.active .xterm-cursor';
  await page.waitForSelector(activeCursorSelector, { state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(700);

  const leakedDeviceReply = await page.evaluate(() => window.__fakeWsSent.some(item => item.binary && /276;0c|>0;[0-9]+;0c/.test(item.text)));
  if (leakedDeviceReply) throw new Error('Snapshot device-attribute reply leaked into PTY input');

  const cursorOpacity = () => page.$eval(activeCursorSelector, node => getComputedStyle(node).opacity);
  const firstPhase = await cursorOpacity();
  await page.waitForTimeout(650);
  const secondPhase = await cursorOpacity();
  if (firstPhase === secondPhase) throw new Error(`Caret did not blink after fresh Chrome load (${firstPhase} -> ${secondPhase})`);

  await page.locator('.itws-xterm-pane.active .xterm-helper-textarea').focus();
  await page.keyboard.type('echo browser-ok');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const sentInput = await page.evaluate(() => window.__fakeWsSent.filter(item => item.binary).map(item => item.text).join(''));
  if (!sentInput.includes('echo browser-ok')) throw new Error(`Native terminal keystrokes did not reach WSS: ${JSON.stringify(sentInput)}`);

  const afterTypingA = await cursorOpacity();
  await page.waitForTimeout(650);
  const afterTypingB = await cursorOpacity();
  if (afterTypingA === afterTypingB) throw new Error('Caret stopped blinking after typing');

  await page.click('#outside');
  const outsideA = await cursorOpacity();
  await page.waitForTimeout(650);
  const outsideB = await cursorOpacity();
  if (outsideA === outsideB) throw new Error('Caret stopped blinking after focus moved to another workspace control');

  await page.evaluate(() => {
    const tabs = document.querySelector('#itwsRtTabs');
    tabs.querySelector('.active')?.classList.remove('active');
    const second = document.createElement('button');
    second.className = 'itws-rt-tab active';
    second.dataset.terminalId = 'term-chrome-2';
    second.textContent = 'Terminal 2';
    tabs.appendChild(second);
  });
  await page.waitForFunction(() => document.querySelectorAll('.itws-xterm-pane').length === 2, null, { timeout: 10_000 });
  await page.waitForSelector(activeCursorSelector, { state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(700);

  const panes = await page.evaluate(() => [...document.querySelectorAll('.itws-xterm-pane')].map(pane => {
    const cursor = pane.querySelector('.xterm-cursor-layer') || pane.querySelector('.xterm-cursor');
    const style = cursor ? getComputedStyle(cursor) : null;
    return {
      id: pane.dataset.sessionId,
      active: pane.classList.contains('active'),
      hasCursor: Boolean(cursor),
      hidden: !cursor || style.display === 'none' || style.visibility === 'hidden',
    };
  }));
  const inactive = panes.find(item => item.id === 'term-chrome-1');
  const active = panes.find(item => item.id === 'term-chrome-2');
  if (!inactive || !active || inactive.active || !active.active || !inactive.hidden || !active.hasCursor || active.hidden) {
    throw new Error(`Terminal switching cursor ownership failed: ${JSON.stringify(panes)}`);
  }

  const secondTerminalA = await cursorOpacity();
  await page.waitForTimeout(650);
  const secondTerminalB = await cursorOpacity();
  if (secondTerminalA === secondTerminalB) throw new Error('Newly added active terminal caret did not keep blinking');

  console.log('Chrome regression passed: xterm DOM/canvas caret blink, typing persistence, focus changes, terminal switching, and snapshot stdin gating.');
} finally {
  await browser?.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
