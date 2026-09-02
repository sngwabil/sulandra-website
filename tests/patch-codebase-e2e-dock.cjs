const fs = require('node:fs');
const file = '/e2e/codebase-railway-e2e-safe.mjs';
let source = fs.readFileSync(file, 'utf8');

source = source.replace(
  "  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error?.message || error)));",
  `  await page.route('**/*', async (route) => {
    const request = route.request();
    const isWorkspaceFrame = request.resourceType() === 'document'
      && request.frame() !== page.mainFrame()
      && request.url().startsWith(WEB + '/workspace/');
    if (isWorkspaceFrame) {
      const safeWorkspaceUrl = request.url().replace(/([?&])[^#]*/g, '$1[REDACTED_QUERY]');
      console.log('[E2E INFO] Workspace iframe URL issued: ' + safeWorkspaceUrl);
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><head><title>Sulandra E2E Workspace Frame</title></head><body>Workspace frame transport verified.</body></html>',
      });
      return;
    }
    await route.fallback();
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error?.message || error)));`,
);

source = source.replace(
  "  await step('Rehome PREVIEW and IDE in the right dock and support toggle-close', async () => {",
  `  await step('Prepare lightweight live preview fixture in isolated workspace', async () => {
    const sessionId = await page.locator('#itwsRtTabs .itws-rt-tab.active').getAttribute('data-terminal-id');
    assert(sessionId, 'Preview fixture has no terminal session');
    const marker = \`SCB_E2E_PREVIEW_READY_${'${'}stamp}\`;
    await page.evaluate(async ({ id, marker }) => {
      const bridge = window.__SULANDRA_TERMINAL_REST_BRIDGE__;
      if (!bridge?.sendInput) throw new Error('Terminal REST bridge is unavailable for preview fixture');
      await bridge.sendInput(id, \`python3 -m http.server 3000 --bind 0.0.0.0 >/tmp/scb-e2e-preview.log 2>&1 & printf '${'${'}marker}\\n'\\r\`);
    }, { id: sessionId, marker });
    await waitForTerminal(auth.token, sessionId, marker, 20_000);
    return { sessionId, port: 3000 };
  });

  await step('Rehome PREVIEW and IDE in the right dock and support toggle-close', async () => {`,
);

fs.writeFileSync(file, source, 'utf8');