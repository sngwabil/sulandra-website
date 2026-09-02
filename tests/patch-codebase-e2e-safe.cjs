const fs = require('node:fs');
const file = '/e2e/codebase-railway-e2e-safe.mjs';
let source = fs.readFileSync(file, 'utf8');

source = source.replace(
  "pageErrors.push(String(error?.message || error))",
  "pageErrors.push(String(error?.stack || error?.message || error))",
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
    assert(/Ask SIA/i.test(layers.label), \`Ask SIA launcher label missing: \${JSON.stringify(layers)}\`);
    assert(layers.rootPresent && layers.rootZ > layers.codebaseZ && layers.launcherZ > layers.codebaseZ, \`Ask SIA is behind Codebase: \${JSON.stringify(layers)}\`);
    return layers;
  });

  await step('Verify colorful syntax, line numbers, and stable Explorer/tab DNA', async () => {`,
);

fs.writeFileSync(file, source, 'utf8');
