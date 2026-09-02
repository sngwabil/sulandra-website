import { chromium } from 'playwright';

const WEB = String(process.env.E2E_WEB_URL || '').replace(/\/$/, '');
const API = String(process.env.E2E_API_URL || '').replace(/\/$/, '');
const EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@sulandrahealth.com';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';
const stamp = Date.now();
const existingPath = 'DEVELOPMENT_WORKFLOW.md';
const createdPath = `.validation/codebase-browser-e2e-${stamp}.txt`;
const results = [];
const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];

function assert(value, message) {
  if (!value) throw new Error(message);
}
function requireEnv(value, name) {
  if (!value) throw new Error(`${name} is required`);
}
async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    const safeDetail = detail === undefined ? undefined : detail;
    results.push({ name, status: 'PASS', ms: Date.now() - started, ...(safeDetail === undefined ? {} : { detail: safeDetail }) });
    console.log(`[E2E PASS] ${name}${safeDetail === undefined ? '' : ` :: ${JSON.stringify(safeDetail)}`}`);
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
  if (!response.ok) throw new Error(`Admin login failed (${response.status}): ${payload.error || payload.message || 'unknown error'}`);
  const session = payload.session || payload.data || payload;
  const token = session.accessToken || session.bearerToken || session.token;
  assert(token, 'Admin login did not return a bearer token');
  return { token, session };
}
async function terminalOutput(token, sessionId) {
  const response = await fetch(`${API}/api/it-solutions/terminal/sessions/${encodeURIComponent(sessionId)}/output?cursor=0`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Terminal output failed (${response.status}): ${payload.error || payload.message || 'unknown error'}`);
  const data = payload.data ?? payload;
  return String(data.data || '');
}
async function waitForTerminal(token, sessionId, marker, timeout = 35_000) {
  const end = Date.now() + timeout;
  let last = '';
  while (Date.now() < end) {
    last = await terminalOutput(token, sessionId);
    if (last.includes(marker)) return last;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for terminal marker ${marker}; tail=${JSON.stringify(last.slice(-700))}`);
}
async function drag(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  assert(box, 'Resize handle is not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}
async function installApiProxy(context) {
  await context.route(`${API}/**`, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': WEB,
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type,accept,x-sulandra-company-id,x-sulandra-legal-entity-id,x-sulandra-department-id',
          vary: 'Origin',
        },
        body: '',
      });
      return;
    }
    const upstream = await route.fetch();
    const headers = { ...upstream.headers() };
    headers['access-control-allow-origin'] = WEB;
    headers['access-control-allow-credentials'] = 'true';
    headers.vary = 'Origin';
    await route.fulfill({ response: upstream, headers });
  });
}

requireEnv(WEB, 'E2E_WEB_URL');
requireEnv(API, 'E2E_API_URL');
requireEnv(PASSWORD, 'E2E_ADMIN_PASSWORD');

let browser;
let auth;
try {
  await step('Authenticate against Railway API without exposing credentials', async () => {
    auth = await login();
    return { authenticated: true, principal: EMAIL, role: auth.session?.role || auth.session?.user?.role || 'admin' };
  });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1050 }, ignoreHTTPSErrors: false });
  await installApiProxy(context);
  await context.addInitScript(({ token, session }) => {
    const encoded = JSON.stringify({ ...session, portalContext: 'ADMIN' });
    sessionStorage.setItem('sulandra:admin:access-token', token);
    sessionStorage.setItem('sulandra:admin:session', encoded);
    sessionStorage.setItem('sulandra:employee:access-token', token);
    sessionStorage.setItem('sulandra:employee:session', encoded);
  }, { token: auth.token, session: auth.session });

  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/codebase|terminal|workspace|xterm|websocket|wss/i.test(text)) consoleErrors.push(text);
  });
  page.on('requestfailed', (request) => {
    if (/codebase|terminal|workspace|xterm|sulandra-coding-terminal-worker/i.test(request.url())) {
      requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
    }
  });

  await step('Open canary IT Solutions and launch Codebase without navigation', async () => {
    const response = await page.goto(`${WEB}/it-solutions.html`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    assert(response?.ok(), `IT Solutions returned ${response?.status()}`);
    await page.locator('#itwsSulandraCodebaseButton').waitFor({ state: 'visible', timeout: 30_000 });
    const before = page.url();
    await page.locator('#itwsSulandraCodebaseButton').click();
    await page.locator('#sulandraCodebase').waitFor({ state: 'visible', timeout: 20_000 });
    assert(page.url() === before, `Codebase navigated away: ${before} -> ${page.url()}`);
    return { urlStayed: before };
  });

  await step('Verify colorful syntax, line numbers, and stable Explorer/tab DNA', async () => {
    const row = page.locator('.scb-tree-row[data-path="package.json"]');
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    await row.click();
    await page.waitForFunction(() => document.querySelector('#scbBreadcrumb')?.textContent === 'package.json', null, { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll('#scbCode .scb-line-no').length > 3, null, { timeout: 20_000 });
    const lineCount = await page.locator('#scbCode .scb-line-no').count();
    const syntaxCount = await page.locator('#scbCode [class*="tok-"]').count();
    assert(syntaxCount > 0, 'No syntax-highlight token spans were rendered');
    const dna = await page.evaluate(() => {
      const explorer = document.querySelector('.scb-tree-row[data-path="package.json"]');
      const tab = document.querySelector('.scb-tab[data-path="package.json"]');
      if (!explorer || !tab) return null;
      const a = getComputedStyle(explorer);
      const b = getComputedStyle(tab);
      return {
        explorerColor: a.getPropertyValue('--dna').trim(), tabColor: b.getPropertyValue('--dna').trim(),
        explorerWeight: a.getPropertyValue('--dna-weight').trim(), tabWeight: b.getPropertyValue('--dna-weight').trim(),
        explorerSize: a.getPropertyValue('--dna-size').trim(), tabSize: b.getPropertyValue('--dna-size').trim(),
      };
    });
    assert(dna?.explorerColor && dna.explorerColor === dna.tabColor, `DNA color mismatch ${JSON.stringify(dna)}`);
    assert(dna.explorerWeight === dna.tabWeight && dna.explorerSize === dna.tabSize, `DNA typography mismatch ${JSON.stringify(dna)}`);
    return { lineCount, syntaxTokens: syntaxCount, dna };
  });

  await step('Edit and save an existing file in the isolated coding workspace', async () => {
    const row = page.locator(`.scb-tree-row[data-path="${existingPath}"]`);
    await row.waitFor({ state: 'visible', timeout: 20_000 });
    await row.click();
    await page.waitForFunction((path) => document.querySelector('#scbBreadcrumb')?.textContent === path, existingPath, { timeout: 20_000 });
    await page.locator('#scbEdit').click();
    const editor = page.locator('#scbEditorInput');
    await editor.waitFor({ state: 'visible', timeout: 10_000 });
    const original = await editor.inputValue();
    await editor.fill(`${original.replace(/\s*$/, '')}\n\n<!-- SCB_E2E_EXISTING_${stamp} -->\n`);
    await page.locator('#scbSave').click();
    await page.waitForFunction((path) => (document.querySelector('#scbStatus')?.textContent || '').includes(path) && (document.querySelector('#scbStatus')?.textContent || '').includes('save command accepted'), existingPath, { timeout: 30_000 });
    const sessionId = await page.locator('#itwsRtTabs .itws-rt-tab.active').getAttribute('data-terminal-id');
    assert(sessionId, 'Save did not start a real terminal session');
    await waitForTerminal(auth.token, sessionId, `[Codebase] saved ${existingPath}`);
    return { path: existingPath, sessionId };
  });

  await step('Create and save a new file from Codebase', async () => {
    await page.locator('#scbNewFile').click();
    await page.locator('#scbNewFilePath').fill(createdPath);
    await page.locator('#scbCreateFile').click();
    await page.waitForFunction((path) => document.querySelector('#scbBreadcrumb')?.textContent === path, createdPath, { timeout: 15_000 });
    const editor = page.locator('#scbEditorInput');
    await editor.waitFor({ state: 'visible', timeout: 10_000 });
    await editor.fill(`SCB_E2E_CREATED_${stamp}\ncreated from Railway Chromium E2E\n`);
    await page.locator('#scbSave').click();
    await page.waitForFunction((path) => (document.querySelector('#scbStatus')?.textContent || '').includes(path) && (document.querySelector('#scbStatus')?.textContent || '').includes('save command accepted'), createdPath, { timeout: 30_000 });
    const sessionId = await page.locator('#itwsRtTabs .itws-rt-tab.active').getAttribute('data-terminal-id');
    assert(sessionId, 'New-file save has no terminal session');
    await waitForTerminal(auth.token, sessionId, `[Codebase] saved ${createdPath}`);
    return { path: createdPath, sessionId };
  });

  await step('Commit edits inside disposable isolated Git workspace', async () => {
    const message = `test: Sulandra Codebase Railway E2E ${stamp}`;
    await page.locator('#scbCommit').click();
    await page.locator('#scbCommitMessage').fill(message);
    await page.locator('#scbCommitNow').click();
    await page.waitForFunction(() => (document.querySelector('#scbStatus')?.textContent || '').includes('Commit command sent for'), null, { timeout: 15_000 });
    const sessionId = await page.locator('#itwsRtTabs .itws-rt-tab.active').getAttribute('data-terminal-id');
    assert(sessionId, 'Commit has no terminal session');
    await waitForTerminal(auth.token, sessionId, '[Codebase] commit complete', 40_000);
    return { committed: true, sessionId };
  });

  await step('Rehome PREVIEW and IDE in the right dock and support toggle-close', async () => {
    const topUrl = page.url();
    for (const mode of ['preview', 'ide']) {
      await page.locator(`.scb-dock-tab[data-dock="${mode}"]`).click();
      await page.waitForFunction((name) => document.querySelector(`.scb-dock-tab[data-dock="${name}"]`)?.classList.contains('active'), mode, { timeout: 12_000 });
      const panel = page.locator('#scbDockMount .scb-embedded-workspace-panel');
      await panel.waitFor({ state: 'visible', timeout: 20_000 });
      await panel.locator('iframe').waitFor({ state: 'attached', timeout: 20_000 });
      assert(page.url() === topUrl, `${mode} navigated away from Codebase`);
    }
    await page.locator('.scb-dock-tab[data-dock="ide"]').click();
    await page.waitForFunction(() => document.querySelector('#sulandraCodebase')?.classList.contains('scb-dock-closed'), null, { timeout: 8_000 });
    assert(await page.locator('.scb-dock-tab.active').count() === 0, 'Active dock tab stayed highlighted after close');
    await page.locator('.scb-dock-tab[data-dock="inspector"]').click();
    await page.waitForFunction(() => document.querySelector('.scb-dock-tab[data-dock="inspector"]')?.classList.contains('active') && !document.querySelector('#sulandraCodebase')?.classList.contains('scb-dock-closed'), null, { timeout: 8_000 });
    return { topLevelUrlStayed: topUrl, toggleClose: true };
  });

  let fourIds = [];
  await step('Keep Terminal inside Codebase and verify live 1/2/3/4 layouts', async () => {
    const topUrl = page.url();
    const root = page.locator('#sulandraCodebase');
    if (!await root.evaluate((node) => node.classList.contains('scb-terminal-open'))) await page.locator('#scbOpenTerminal').click();
    await page.waitForFunction(() => document.querySelector('#sulandraCodebase')?.classList.contains('scb-terminal-open'), null, { timeout: 30_000 });
    assert(page.url() === topUrl, 'Terminal routed away from Codebase');
    for (const count of [1, 2, 3, 4]) {
      await page.locator(`[data-terminal-layout="${count}"]`).click();
      await page.waitForFunction((expected) => {
        const host = document.querySelector('#itwsXtermHost');
        return host?.dataset.scbLayout === String(expected) && host.querySelectorAll('.itws-xterm-pane.scb-split-visible').length === expected;
      }, count, { timeout: 45_000 });
    }
    fourIds = await page.locator('#itwsXtermHost .itws-xterm-pane.scb-split-visible').evaluateAll((panes) => panes.map((pane) => pane.dataset.sessionId || '').filter(Boolean));
    assert(fourIds.length === 4 && new Set(fourIds).size === 4, `Expected four distinct sessions, got ${JSON.stringify(fourIds)}`);
    await page.waitForFunction((ids) => {
      const ready = window.__SULANDRA_XTERM_WSS_READY_SESSIONS__;
      return ready && typeof ready.has === 'function' && ids.every((id) => ready.has(id));
    }, fourIds, { timeout: 40_000 });
    return { layouts: [1, 2, 3, 4], sessionIds: fourIds, topLevelUrlStayed: topUrl };
  });

  await step('Run distinct commands in all four xterm panes with isolated history', async () => {
    const markers = fourIds.map((_, index) => `SCB_E2E_PANE_${index + 1}_${stamp}`);
    await page.evaluate(async ({ ids, markers }) => {
      const bridge = window.__SULANDRA_TERMINAL_REST_BRIDGE__;
      if (!bridge?.sendInput) throw new Error('Terminal REST bridge is unavailable');
      for (let i = 0; i < ids.length; i += 1) await bridge.sendInput(ids[i], `printf '${markers[i]}\\n'\r`);
    }, { ids: fourIds, markers });
    const outputs = [];
    for (let i = 0; i < fourIds.length; i += 1) outputs.push(await waitForTerminal(auth.token, fourIds[i], markers[i], 30_000));
    for (let i = 0; i < outputs.length; i += 1) {
      for (let j = 0; j < markers.length; j += 1) if (i !== j) assert(!outputs[i].includes(markers[j]), `Terminal ${i + 1} contains Terminal ${j + 1} marker`);
    }
    return { isolated: true, markers };
  });

  await step('Resize terminal deck and 4-way split; all panes refit and stay interactive', async () => {
    const mount = page.locator('#scbTerminalMount');
    const beforeDeck = await mount.boundingBox();
    await drag(page, page.locator('#scbTerminalResize'), 0, -90);
    const afterDeck = await mount.boundingBox();
    assert(beforeDeck && afterDeck && Math.abs(afterDeck.height - beforeDeck.height) > 35, `Terminal deck did not resize enough: ${beforeDeck?.height} -> ${afterDeck?.height}`);
    const beforeSplit = await page.locator('#itwsXtermHost').evaluate((host) => ({ col: getComputedStyle(host).getPropertyValue('--scb-term-col').trim(), row: getComputedStyle(host).getPropertyValue('--scb-term-row').trim() }));
    await drag(page, page.locator('.scb-term-divider-v'), 70, 0);
    await drag(page, page.locator('.scb-term-divider-h'), 0, 55);
    const afterSplit = await page.locator('#itwsXtermHost').evaluate((host) => ({ col: getComputedStyle(host).getPropertyValue('--scb-term-col').trim(), row: getComputedStyle(host).getPropertyValue('--scb-term-row').trim() }));
    assert(beforeSplit.col !== afterSplit.col, `Vertical split did not move (${beforeSplit.col})`);
    assert(beforeSplit.row !== afterSplit.row, `Horizontal split did not move (${beforeSplit.row})`);
    assert(await page.locator('#itwsXtermHost .itws-xterm-pane.scb-split-visible').count() === 4, 'A terminal pane disappeared after resize');
    const marker = `SCB_E2E_AFTER_RESIZE_${stamp}`;
    await page.evaluate(async ({ id, marker }) => window.__SULANDRA_TERMINAL_REST_BRIDGE__.sendInput(id, `printf '${marker}\\n'\r`), { id: fourIds[0], marker });
    await waitForTerminal(auth.token, fourIds[0], marker, 25_000);
    return { deckBefore: beforeDeck.height, deckAfter: afterDeck.height, splitBefore: beforeSplit, splitAfter: afterSplit, interactiveAfterResize: true };
  });

  await step('Finish without Codebase/terminal/workspace browser runtime failures', async () => {
    await page.waitForTimeout(1200);
    assert(pageErrors.length === 0, `Page errors: ${JSON.stringify(pageErrors)}`);
    assert(consoleErrors.length === 0, `Relevant console errors: ${JSON.stringify(consoleErrors)}`);
    assert(requestFailures.length === 0, `Relevant request failures: ${JSON.stringify(requestFailures)}`);
    return { pageErrors: 0, consoleErrors: 0, requestFailures: 0 };
  });

  console.log(`E2E_RESULT=${JSON.stringify({ status: 'PASS', web: WEB, api: API, existingPath, createdPath, results })}`);
} catch (error) {
  console.error(`E2E_RESULT=${JSON.stringify({ status: 'FAIL', web: WEB, api: API, existingPath, createdPath, results, pageErrors, consoleErrors, requestFailures, error: String(error?.message || error) })}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
}
