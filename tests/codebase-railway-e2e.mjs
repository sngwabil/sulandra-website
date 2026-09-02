import { chromium } from 'playwright';

const WEB = String(process.env.E2E_WEB_URL || '').replace(/\/$/, '');
const API = String(process.env.E2E_API_URL || '').replace(/\/$/, '');
const PROD_API = 'https://sulandra-website-production-5fc4.up.railway.app';
const EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@sulandrahealth.com';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
const stamp = Date.now();
const createdPath = `.validation/codebase-browser-e2e-${stamp}.txt`;
const existingPath = 'DEVELOPMENT_WORKFLOW.md';
const results = [];
const relevantConsoleErrors = [];
const relevantRequestFailures = [];
const pageErrors = [];

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: 'PASS', ms: Date.now() - started, ...(detail === undefined ? {} : { detail }) });
    console.log(`[E2E PASS] ${name}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
    return detail;
  } catch (error) {
    results.push({ name, status: 'FAIL', ms: Date.now() - started, error: String(error?.message || error) });
    console.error(`[E2E FAIL] ${name} :: ${error?.stack || error}`);
    throw error;
  }
}
async function login() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, portal: 'ADMIN' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Canary admin login failed (${response.status}): ${payload.error || payload.message || 'unknown error'}`);
  const session = payload.session || payload.data || payload;
  const token = session.accessToken || session.bearerToken || session.token;
  assert(token, 'Canary admin login did not return a bearer token');
  return { token, session };
}
async function terminalOutput(token, sessionId) {
  const response = await fetch(`${API}/api/it-solutions/terminal/sessions/${encodeURIComponent(sessionId)}/output?cursor=0`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Terminal output failed for ${sessionId} (${response.status}): ${body.error || body.message || 'unknown error'}`);
  const data = body.data ?? body;
  return String(data.data || '');
}
async function waitTerminalOutput(token, sessionId, marker, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let last = '';
  while (Date.now() < deadline) {
    last = await terminalOutput(token, sessionId);
    if (last.includes(marker)) return last;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for terminal ${sessionId} output marker ${marker}; tail=${JSON.stringify(last.slice(-800))}`);
}
async function drag(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  assert(box, `Cannot drag hidden element ${await locator.getAttribute('class') || ''}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 7 });
  await page.mouse.up();
}

required(WEB, 'E2E_WEB_URL');
required(API, 'E2E_API_URL');
required(PASSWORD, 'E2E_ADMIN_PASSWORD');

let browser;
let token = '';
try {
  const auth = await step('Authenticate against Railway canary API', login);
  token = auth.token;
  const session = auth.session;

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1050 }, ignoreHTTPSErrors: false });
  await context.route(`${PROD_API}/**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    await route.continue({ url: `${API}${requestUrl.pathname}${requestUrl.search}` });
  });
  await context.addInitScript(({ token: initToken, session: initSession }) => {
    const encoded = JSON.stringify({ ...initSession, portalContext: 'ADMIN' });
    sessionStorage.setItem('sulandra:admin:access-token', initToken);
    sessionStorage.setItem('sulandra:admin:session', encoded);
    sessionStorage.setItem('sulandra:employee:access-token', initToken);
    sessionStorage.setItem('sulandra:employee:session', encoded);
  }, { token, session });

  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/codebase|terminal|workspace|xterm|websocket|wss/i.test(text)) relevantConsoleErrors.push(text);
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (/codebase|terminal|workspace|xterm|sulandra-coding-terminal-worker/i.test(url)) {
      relevantRequestFailures.push(`${request.method()} ${url} :: ${request.failure()?.errorText || 'failed'}`);
    }
  });

  await step('Open IT Solutions canary and launch Codebase in-place', async () => {
    const response = await page.goto(`${WEB}/it-solutions.html`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert(response && response.ok(), `IT Solutions returned ${response?.status()}`);
    await page.locator('#itwsSulandraCodebaseButton').waitFor({ state: 'visible', timeout: 30_000 });
    const before = page.url();
    await page.locator('#itwsSulandraCodebaseButton').click();
    await page.locator('#sulandraCodebase').waitFor({ state: 'visible', timeout: 15_000 });
    assert(page.url() === before, `Codebase launch navigated away: ${before} -> ${page.url()}`);
    return { url: page.url() };
  });

  await step('Render colorful source, line numbers, and deterministic file DNA', async () => {
    const row = page.locator('.scb-tree-row[data-path="package.json"]');
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    await row.click();
    await page.waitForFunction(() => document.querySelector('#scbBreadcrumb')?.textContent === 'package.json', null, { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll('#scbCode .scb-line-no').length > 3, null, { timeout: 20_000 });
    const lineCount = await page.locator('#scbCode .scb-line-no').count();
    const syntaxCount = await page.locator('#scbCode .tok-string').count();
    assert(syntaxCount > 0, 'package.json did not receive syntax coloring');
    const dna = await page.evaluate(() => {
      const explorer = document.querySelector('.scb-tree-row[data-path="package.json"]');
      const tab = document.querySelector('.scb-tab[data-path="package.json"]');
      if (!explorer || !tab) return null;
      const e = getComputedStyle(explorer);
      const t = getComputedStyle(tab);
      return {
        explorer: e.getPropertyValue('--dna').trim(),
        tab: t.getPropertyValue('--dna').trim(),
        explorerWeight: e.getPropertyValue('--dna-weight').trim(),
        tabWeight: t.getPropertyValue('--dna-weight').trim(),
        explorerSize: e.getPropertyValue('--dna-size').trim(),
        tabSize: t.getPropertyValue('--dna-size').trim(),
      };
    });
    assert(dna?.explorer && dna.explorer === dna.tab, `DNA color mismatch: ${JSON.stringify(dna)}`);
    assert(dna.explorerWeight === dna.tabWeight && dna.explorerSize === dna.tabSize, `DNA typography mismatch: ${JSON.stringify(dna)}`);
    return { lineCount, syntaxTokens: syntaxCount, dna };
  });

  await step('Edit and save an existing repository file into isolated workspace', async () => {
    const row = page.locator(`.scb-tree-row[data-path="${existingPath}"]`);
    await row.waitFor({ state: 'visible', timeout: 20_000 });
    await row.click();
    await page.waitForFunction((p) => document.querySelector('#scbBreadcrumb')?.textContent === p, existingPath, { timeout: 20_000 });
    await page.locator('#scbEdit').click();
    const editor = page.locator('#scbEditorInput');
    await editor.waitFor({ state: 'visible', timeout: 10_000 });
    const original = await editor.inputValue();
    const marker = `SCB_E2E_EXISTING_${stamp}`;
    await editor.fill(`${original.replace(/\s*$/, '')}\n\n<!-- ${marker} -->\n`);
    await page.locator('#scbSave').click();
    await page.waitForFunction((p) => (document.querySelector('#scbStatus')?.textContent || '').includes(p) && (document.querySelector('#scbStatus')?.textContent || '').includes('save command accepted'), existingPath, { timeout: 30_000 });
    const sessionId = await page.locator('#itwsRtTabs .itws-rt-tab.active').getAttribute('data-terminal-id');
    assert(sessionId, 'Save did not start a real terminal session');
    await waitTerminalOutput(token, sessionId, `[Codebase] saved ${existingPath}`);
    return { path: existingPath, terminalSession: sessionId };
  });

  await step('Create and save a new file from Codebase', async () => {
    await page.locator('#scbNewFile').click();
    await page.locator('#scbNewFilePath').fill(createdPath);
    await page.locator('#scbCreateFile').click();
    await page.waitForFunction((p) => document.querySelector('#scbBreadcrumb')?.textContent === p, createdPath, { timeout: 15_000 });
    const editor = page.locator('#scbEditorInput');
    await editor.waitFor({ state: 'visible', timeout: 10_000 });
    const marker = `SCB_E2E_CREATED_${stamp}`;
    await editor.fill(`${marker}\ncreated from Sulandra Codebase Railway browser E2E\n`);
    await page.locator('#scbSave').click();
    await page.waitForFunction((p) => (document.querySelector('#scbStatus')?.textContent || '').includes(p) && (document.querySelector('#scbStatus')?.textContent || '').includes('save command accepted'), createdPath, { timeout: 30_000 });
    const sessionId = await page.locator('#itwsRtTabs .itws-rt-tab.active').getAttribute('data-terminal-id');
    assert(sessionId, 'New-file save has no terminal session');
    await waitTerminalOutput(token, sessionId, `[Codebase] saved ${createdPath}`);
    return { path: createdPath, terminalSession: sessionId };
  });

  await step('Commit Codebase edits in disposable isolated Git workspace', async () => {
    const commitMessage = `test: Sulandra Codebase Railway E2E ${stamp}`;
    await page.locator('#scbCommit').click();
    await page.locator('#scbCommitMessage').fill(commitMessage);
    await page.locator('#scbCommitNow').click();
    await page.waitForFunction(() => (document.querySelector('#scbStatus')?.textContent || '').includes('Commit command sent for'), null, { timeout: 15_000 });
    const sessionId = await page.locator('#itwsRtTabs .itws-rt-tab.active').getAttribute('data-terminal-id');
    assert(sessionId, 'Commit has no terminal session');
    const output = await waitTerminalOutput(token, sessionId, '[Codebase] commit complete', 35_000);
    assert(output.includes(commitMessage) || output.includes('files changed') || output.includes('file changed'), 'Git commit completed but terminal output did not show a commit summary');
    return { terminalSession: sessionId, message: commitMessage };
  });

  await step('Rehome Preview and IDE inside Codebase dock; active tab toggles closed', async () => {
    const baseUrl = page.url();
    for (const mode of ['preview', 'ide']) {
      const tab = page.locator(`.scb-dock-tab[data-dock="${mode}"]`);
      await tab.click();
      await page.waitForFunction((m) => document.querySelector(`.scb-dock-tab[data-dock="${m}"]`)?.classList.contains('active'), mode, { timeout: 12_000 });
      const panel = page.locator('#scbDockMount .scb-embedded-workspace-panel');
      await panel.waitFor({ state: 'visible', timeout: 20_000 });
      const iframe = panel.locator('iframe');
      await iframe.waitFor({ state: 'attached', timeout: 20_000 });
      assert(page.url() === baseUrl, `${mode} navigated the top-level Codebase page`);
    }
    await page.locator('.scb-dock-tab[data-dock="ide"]').click();
    await page.waitForFunction(() => document.querySelector('#sulandraCodebase')?.classList.contains('scb-dock-closed'), null, { timeout: 8_000 });
    assert(await page.locator('.scb-dock-tab.active').count() === 0, 'Dock closed but a dock tab remained highlighted');
    await page.locator('.scb-dock-tab[data-dock="inspector"]').click();
    await page.waitForFunction(() => !document.querySelector('#sulandraCodebase')?.classList.contains('scb-dock-closed') && document.querySelector('.scb-dock-tab[data-dock="inspector"]')?.classList.contains('active'), null, { timeout: 8_000 });
    return { urlStayed: baseUrl, toggleClose: true };
  });

  await step('Terminal button stays inside Codebase and exposes 1/2/3/4 layouts', async () => {
    const baseUrl = page.url();
    if (!await page.locator('#sulandraCodebase').evaluate((n) => n.classList.contains('scb-terminal-open'))) {
      await page.locator('#scbOpenTerminal').click();
    }
    await page.waitForFunction(() => document.querySelector('#sulandraCodebase')?.classList.contains('scb-terminal-open'), null, { timeout: 30_000 });
    assert(page.url() === baseUrl, `Terminal routed away from Codebase: ${baseUrl} -> ${page.url()}`);
    for (const count of [1, 2, 3, 4]) {
      await page.locator(`[data-terminal-layout="${count}"]`).click();
      await page.waitForFunction((n) => {
        const host = document.querySelector('#itwsXtermHost');
        return host?.dataset.scbLayout === String(n) && host.querySelectorAll('.itws-xterm-pane.scb-split-visible').length === n;
      }, count, { timeout: 45_000 });
    }
    const ids = await page.locator('#itwsXtermHost .itws-xterm-pane.scb-split-visible').evaluateAll((panes) => panes.map((pane) => pane.dataset.sessionId || '').filter(Boolean));
    assert(ids.length === 4 && new Set(ids).size === 4, `Expected four distinct live xterm sessions, got ${JSON.stringify(ids)}`);
    await page.waitForFunction((sessionIds) => {
      const ready = window.__SULANDRA_XTERM_WSS_READY_SESSIONS__;
      return ready && typeof ready.has === 'function' && sessionIds.every((id) => ready.has(id));
    }, ids, { timeout: 35_000 });
    return { layouts: [1, 2, 3, 4], sessionIds: ids, topLevelUrlStayed: baseUrl };
  });

  const fourIds = await page.locator('#itwsXtermHost .itws-xterm-pane.scb-split-visible').evaluateAll((panes) => panes.map((pane) => pane.dataset.sessionId || '').filter(Boolean));
  await step('Execute isolated commands in all four live xterm sessions', async () => {
    const markers = fourIds.map((_, index) => `SCB_E2E_PANE_${index + 1}_${stamp}`);
    await page.evaluate(async ({ ids, markers: values }) => {
      const bridge = window.__SULANDRA_TERMINAL_REST_BRIDGE__;
      if (!bridge?.sendInput) throw new Error('REST terminal bridge is unavailable');
      for (let index = 0; index < ids.length; index += 1) {
        await bridge.sendInput(ids[index], `printf '${values[index]}\\n'\r`);
      }
    }, { ids: fourIds, markers });
    const outputs = [];
    for (let index = 0; index < fourIds.length; index += 1) {
      const output = await waitTerminalOutput(token, fourIds[index], markers[index], 30_000);
      outputs.push(output);
      for (let other = 0; other < markers.length; other += 1) {
        if (other !== index) assert(!output.includes(markers[other]), `Terminal ${index + 1} leaked marker from terminal ${other + 1}`);
      }
    }
    return { isolated: true, markers };
  });

  await step('Resize terminal deck and split dividers; panes remain interactive', async () => {
    const deck = page.locator('#scbTerminalMount');
    const beforeDeck = await deck.boundingBox();
    await drag(page, page.locator('#scbTerminalResize'), 0, -90);
    const afterDeck = await deck.boundingBox();
    assert(beforeDeck && afterDeck && Math.abs(afterDeck.height - beforeDeck.height) > 40, `Terminal deck did not resize enough: ${beforeDeck?.height} -> ${afterDeck?.height}`);
    const beforeVars = await page.locator('#itwsXtermHost').evaluate((host) => ({ col: getComputedStyle(host).getPropertyValue('--scb-term-col').trim(), row: getComputedStyle(host).getPropertyValue('--scb-term-row').trim() }));
    await drag(page, page.locator('.scb-term-divider-v'), 70, 0);
    await drag(page, page.locator('.scb-term-divider-h'), 0, 55);
    const afterVars = await page.locator('#itwsXtermHost').evaluate((host) => ({ col: getComputedStyle(host).getPropertyValue('--scb-term-col').trim(), row: getComputedStyle(host).getPropertyValue('--scb-term-row').trim() }));
    assert(beforeVars.col !== afterVars.col, `Vertical split did not change: ${beforeVars.col}`);
    assert(beforeVars.row !== afterVars.row, `Horizontal split did not change: ${beforeVars.row}`);
    assert(await page.locator('#itwsXtermHost .itws-xterm-pane.scb-split-visible').count() === 4, 'Resizing lost one or more xterm panes');
    const marker = `SCB_E2E_AFTER_RESIZE_${stamp}`;
    await page.evaluate(async ({ id, marker: value }) => window.__SULANDRA_TERMINAL_REST_BRIDGE__.sendInput(id, `printf '${value}\\n'\r`), { id: fourIds[0], marker });
    await waitTerminalOutput(token, fourIds[0], marker, 25_000);
    return { deckHeight: { before: beforeDeck.height, after: afterDeck.height }, split: { before: beforeVars, after: afterVars }, interactiveAfterResize: true };
  });

  await step('No relevant browser runtime errors or failed Codebase/terminal/workspace requests', async () => {
    await page.waitForTimeout(1200);
    assert(pageErrors.length === 0, `Page errors: ${JSON.stringify(pageErrors)}`);
    assert(relevantConsoleErrors.length === 0, `Relevant console errors: ${JSON.stringify(relevantConsoleErrors)}`);
    assert(relevantRequestFailures.length === 0, `Relevant request failures: ${JSON.stringify(relevantRequestFailures)}`);
    return { pageErrors: 0, consoleErrors: 0, requestFailures: 0 };
  });

  const summary = { status: 'PASS', web: WEB, api: API, createdPath, existingPath, results, relevantConsoleErrors, relevantRequestFailures, pageErrors };
  console.log(`E2E_RESULT=${JSON.stringify(summary)}`);
} catch (error) {
  const summary = { status: 'FAIL', web: WEB, api: API, createdPath, existingPath, results, relevantConsoleErrors, relevantRequestFailures, pageErrors, error: String(error?.stack || error) };
  console.error(`E2E_RESULT=${JSON.stringify(summary)}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
