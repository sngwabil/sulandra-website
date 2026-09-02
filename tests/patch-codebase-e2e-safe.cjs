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
fs.writeFileSync(file, source, 'utf8');
