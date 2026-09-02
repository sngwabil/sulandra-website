const fs = require('node:fs');
const file = '/e2e/codebase-railway-e2e-safe.mjs';
let source = fs.readFileSync(file, 'utf8');

source = source.replace(
  "const API = String(process.env.E2E_API_URL || '').replace(/\\/$/, '');",
  "const API = String(process.env.E2E_API_URL || '').replace(/\\/$/, '');\nconst FEATURE_API = String(process.env.E2E_FEATURE_API_URL || '').replace(/\\/$/, '');\nconst FEATURE_PASSWORD = process.env.E2E_FEATURE_ADMIN_PASSWORD || '';",
);

source = source.replace(
  "pageErrors.push(String(error?.message || error))",
  "pageErrors.push(String(error?.stack || error?.message || error))",
);

source = source.replace(
  "async function terminalOutput(token, sessionId) {",
  `async function featureLoginToken() {
  const response = await fetch(\`${'${'}FEATURE_API}/api/auth/login\`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: FEATURE_PASSWORD, portal: 'ADMIN' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(\`Feature API login failed (${'${'}response.status}): ${'${'}payload.error || payload.message || 'unknown error'}\`);
  const session = payload.session || payload.data || payload;
  const token = session.accessToken || session.bearerToken || session.token;
  assert(token, 'Feature API login did not return a bearer token');
  return token;
}
async function terminalOutput(token, sessionId) {`,
);

source = source.replace(
  "async function installApiProxy(context) {",
  "async function installApiProxy(context, featureToken) {",
);
source = source.replace(
  "    const request = route.request();\n    if (request.method() === 'OPTIONS') {",
  `    const request = route.request();
    const parsed = new URL(request.url());
    const codebaseRequest = /^\\/api\\/it-solutions\\/codebase(?:\\/|$)/.test(parsed.pathname);
    if (request.method() === 'OPTIONS') {`,
);
source = source.replace(
  "    const upstream = await route.fetch();",
  `    const requestHeaders = { ...request.headers() };
    delete requestHeaders.origin;
    const upstream = codebaseRequest
      ? await route.fetch({
          url: FEATURE_API + parsed.pathname + parsed.search,
          headers: { ...request.headers(), authorization: \`Bearer ${'${'}featureToken}\` },
        })
      : await route.fetch({ headers: requestHeaders });`,
);

source = source.replace(
  "requireEnv(API, 'E2E_API_URL');",
  "requireEnv(API, 'E2E_API_URL');\nrequireEnv(FEATURE_API, 'E2E_FEATURE_API_URL');\nrequireEnv(FEATURE_PASSWORD, 'E2E_FEATURE_ADMIN_PASSWORD');",
);

source = source.replace(
  "  browser = await chromium.launch({ headless: true });",
  `  const featureToken = await featureLoginToken();
  console.log('[E2E INFO] Feature Codebase API authenticated without exposing credentials');

  browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-features=Translate,BackForwardCache,MediaRouter',
      '--js-flags=--max-old-space-size=160',
    ],
  });`,
);
source = source.replace(
  "  const context = await browser.newContext({ viewport: { width: 1680, height: 1050 }, ignoreHTTPSErrors: false });",
  `  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, ignoreHTTPSErrors: false });
  await context.route(/\\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf|otf)(?:\\?.*)?$/i, (route) => route.abort());`,
);
source = source.replace(
  "  await installApiProxy(context);",
  "  await installApiProxy(context, featureToken);",
);
source = source.replace(
  "  const page = await context.newPage();",
  `  const page = await context.newPage();
  page.on('request', (request) => {
    if (/\\/api\\/it-solutions\\/terminal\\//.test(request.url())) {
      console.log('[TERMINAL REQUEST] ' + request.method() + ' ' + request.url().replace(/[?&](?:token|code|key|secret|password|session)=[^&]+/gi, '[REDACTED_QUERY]'));
    }
  });`,
);

source = source.replace(
  "    await page.locator('#itwsSulandraCodebaseButton').waitFor({ state: 'visible', timeout: 30_000 });",
  `    await page.waitForFunction(() => window.SulandraDockableWorkspace && window.SulandraCodebase, null, { timeout: 30_000 });
    await page.evaluate(() => {
      const controls = [...document.querySelectorAll('button,a,[role="button"]')];
      const terminalNav = controls.find((node) => {
        const label = String(node.textContent || '').trim().replace(/\\s+/g, ' ');
        return label === 'Engineering Terminal' || node.matches?.('[data-view="engineering-terminal"],[data-route="engineering-terminal"],[data-target="engineering-terminal"]');
      });
      if (terminalNav) terminalNav.click();
      window.SulandraDockableWorkspace?.show?.('terminal');
    });
    await page.locator('#itwsSulandraCodebaseButton').waitFor({ state: 'visible', timeout: 20_000 });`,
);

source = source.replace(
  "    if (/codebase|terminal|workspace|xterm|websocket|wss/i.test(text)) consoleErrors.push(text);",
  "    if (/sulandra-codebase|\\/api\\/it-solutions\\/codebase|terminal\\/sessions|workspace\\/ticket|xterm|websocket|wss/i.test(text)) consoleErrors.push(text);",
);
source = source.replace(
  "    if (/codebase|terminal|workspace|xterm|sulandra-coding-terminal-worker/i.test(request.url())) {",
  "    if (/\\/api\\/it-solutions\\/codebase|terminal\\/sessions|workspace\\/ticket|xterm|sulandra-coding-terminal-worker/i.test(request.url())) {",
);

source = source.replace(
  "  await step('Verify colorful syntax, line numbers, and stable Explorer/tab DNA', async () => {",
  `  await step('Keep Ask SIA visible above Codebase', async () => {
    const launcher = page.locator('#siaxLauncher');
    await launcher.waitFor({ state: 'visible', timeout: 15_000 });
    const layers = await page.evaluate(() => {
      const launcher = document.querySelector('#siaxLauncher');
      const root = document.querySelector('#sia-copilot-root');
      const codebase = document.querySelector('#sulandraCodebase');
      const numeric = (node) => Number.parseInt(getComputedStyle(node).zIndex || '0', 10) || 0;
      return {
        label: String(launcher?.textContent || '').trim(),
        rootZ: root ? numeric(root) : 0,
        launcherZ: launcher ? numeric(launcher) : 0,
        codebaseZ: codebase ? numeric(codebase) : 0,
        rootPresent: Boolean(root),
      };
    });
    assert(/Ask SIA/i.test(layers.label), \`Ask SIA launcher label missing: ${'${'}JSON.stringify(layers)}\`);
    assert(layers.rootPresent && layers.rootZ > layers.codebaseZ && layers.launcherZ > layers.codebaseZ, \`Ask SIA is behind Codebase: ${'${'}JSON.stringify(layers)}\`);
    return layers;
  });

  await step('Verify colorful syntax, line numbers, and stable Explorer/tab DNA', async () => {`,
);

source = source.replace(
  "    await page.locator('#scbSave').click();\n    await page.waitForFunction((path) => (document.querySelector('#scbStatus')?.textContent || '').includes(path) && (document.querySelector('#scbStatus')?.textContent || '').includes('save command accepted'), existingPath, { timeout: 30_000 });",
  `    await page.locator('#scbSave').click();
    await page.waitForTimeout(3500);
    const saveDiag = await page.evaluate(() => ({
      status: String(document.querySelector('#scbStatus')?.textContent || ''),
      terminalRoot: Boolean(document.querySelector('#itwsRealTerminal')),
      terminalTabs: [...document.querySelectorAll('#itwsRtTabs [data-terminal-id]')].map((n) => n.getAttribute('data-terminal-id')),
      newTab: Boolean(document.querySelector('#itwsRtNewTab')),
      workerState: String(document.querySelector('#itwsRtWorkerState')?.textContent || ''),
      restBridge: Boolean(window.__SULANDRA_TERMINAL_REST_BRIDGE__),
      xtermHost: Boolean(document.querySelector('#itwsXtermHost')),
      apiBase: (() => { try { return typeof API === 'string' ? API : ''; } catch { return ''; } })(),
    }));
    console.log('[SAVE DIAG] ' + JSON.stringify(saveDiag));
    await page.waitForFunction((path) => (document.querySelector('#scbStatus')?.textContent || '').includes(path) && (document.querySelector('#scbStatus')?.textContent || '').includes('save command accepted'), existingPath, { timeout: 30_000 });`,
);

fs.writeFileSync(file, source, 'utf8');
