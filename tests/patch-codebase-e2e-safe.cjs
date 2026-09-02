const fs = require('node:fs');
const file = '/e2e/codebase-railway-e2e-safe.mjs';
let source = fs.readFileSync(file, 'utf8');
source = source.replace(
  "pageErrors.push(String(error?.message || error))",
  "pageErrors.push(String(error?.stack || error?.message || error))",
);
source = source.replace(
  "  const page = await context.newPage();",
  `  const page = await context.newPage();
  const parseFailureDetails = [];
  const cdp = await context.newCDPSession(page);
  await Promise.all([cdp.send('Runtime.enable'), cdp.send('Debugger.enable')]);
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: detail }) => {
    const payload = {
      text: detail?.text || '',
      url: detail?.url || '',
      lineNumber: detail?.lineNumber ?? null,
      columnNumber: detail?.columnNumber ?? null,
      description: detail?.exception?.description || '',
    };
    if (payload.url && /SyntaxError/.test(payload.description)) parseFailureDetails.push(payload);
    console.error('[CDP EXCEPTION] ' + JSON.stringify(payload));
  });
  cdp.on('Debugger.scriptFailedToParse', (detail) => {
    console.error('[CDP PARSE FAIL] ' + JSON.stringify({
      url: detail?.url || '',
      startLine: detail?.startLine ?? null,
      startColumn: detail?.startColumn ?? null,
      endLine: detail?.endLine ?? null,
      endColumn: detail?.endColumn ?? null,
      isModule: Boolean(detail?.isModule),
    }));
  });`,
);
source = source.replace(
  "    assert(response && response.ok(), `IT Solutions returned ${response?.status()}`);",
  `    assert(response && response.ok(), \`IT Solutions returned \${response?.status()}\`);
    for (const failure of parseFailureDetails) {
      try {
        const assetResponse = await context.request.get(failure.url, { timeout: 15_000 });
        const assetText = await assetResponse.text();
        const lines = assetText.split('\\n');
        const center = Math.max(0, Number(failure.lineNumber) || 0);
        const start = Math.max(0, center - 4);
        const end = Math.min(lines.length, center + 5);
        const excerpt = lines.slice(start, end).map((line, index) => \`${'${'}start + index + 1}: ${'${'}line}\`).join('\\n');
        console.error('[PARSE SOURCE] ' + failure.url + '\\n' + excerpt);
      } catch (error) {
        console.error('[PARSE SOURCE FAILED] ' + String(error?.message || error));
      }
    }`,
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
  "  await step('Verify colorful syntax, line numbers, and stable Explorer/tab DNA', async () => {",
  `  await step('Keep Ask SIA visible above full-screen Codebase', async () => {
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
      };
    });
    assert(/Ask SIA/i.test(layers.label), \`Ask SIA launcher label missing: \${JSON.stringify(layers)}\`);
    assert(layers.rootZ > layers.codebaseZ && layers.launcherZ > layers.codebaseZ, \`Ask SIA is still behind Codebase: \${JSON.stringify(layers)}\`);
    return layers;
  });

  await step('Verify colorful syntax, line numbers, and stable Explorer/tab DNA', async () => {`,
);
fs.writeFileSync(file, source, 'utf8');
