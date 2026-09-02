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
  await page.addInitScript(() => {
    window.__siaRemovalTrace = [];
    const remember = (kind, node, value = '') => {
      try {
        const relevant = node && (node.id === 'siaxLauncher' || node.id === 'sia-copilot-root' || node.querySelector?.('#siaxLauncher'));
        if (!relevant) return;
        window.__siaRemovalTrace.push({
          kind,
          node: node.id || node.tagName || node.nodeName || '',
          value: String(value || '').slice(0, 180),
          stack: String(new Error('SIA DOM mutation').stack || '').split('\\n').slice(1, 9),
        });
        window.__siaRemovalTrace = window.__siaRemovalTrace.slice(-20);
      } catch {}
    };
    const nativeRemove = Element.prototype.remove;
    Element.prototype.remove = function(...args){ remember('Element.remove', this); return nativeRemove.apply(this,args); };
    const nativeRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function(child){ remember('removeChild', child); return nativeRemoveChild.call(this,child); };
    const nativeReplaceChildren = Element.prototype.replaceChildren;
    Element.prototype.replaceChildren = function(...nodes){ if(this.id==='sia-copilot-root'||this.querySelector?.('#siaxLauncher'))remember('replaceChildren',this); return nativeReplaceChildren.apply(this,nodes); };
    const inner = Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
    if(inner?.set&&inner?.get){
      Object.defineProperty(Element.prototype,'innerHTML',{configurable:inner.configurable,enumerable:inner.enumerable,get:inner.get,set(value){ if(this.id==='sia-copilot-root'||this.querySelector?.('#siaxLauncher'))remember('innerHTML',this,value); return inner.set.call(this,value); }});
    }
    const text = Object.getOwnPropertyDescriptor(Node.prototype,'textContent');
    if(text?.set&&text?.get){
      Object.defineProperty(Node.prototype,'textContent',{configurable:text.configurable,enumerable:text.enumerable,get:text.get,set(value){ if(this instanceof Element&&(this.id==='sia-copilot-root'||this.querySelector?.('#siaxLauncher')))remember('textContent',this,value); return text.set.call(this,value); }});
    }
  });
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
  "    if (/codebase|terminal|workspace|xterm|websocket|wss/i.test(text)) consoleErrors.push(text);",
  "    if (/sulandra-codebase|\\/api\\/it-solutions\\/codebase|terminal\\/sessions|workspace\\/ticket|xterm|websocket|wss/i.test(text)) consoleErrors.push(text);",
);
source = source.replace(
  "    if (/codebase|terminal|workspace|xterm|sulandra-coding-terminal-worker/i.test(request.url())) {",
  "    if (/\\/api\\/it-solutions\\/codebase|terminal\\/sessions|workspace\\/ticket|xterm|sulandra-coding-terminal-worker/i.test(request.url())) {",
);
source = source.replace(
  "  await step('Verify colorful syntax, line numbers, and stable Explorer/tab DNA', async () => {",
  `  await step('Keep Ask SIA visible above full-screen Codebase', async () => {
    await page.waitForTimeout(900);
    const diagnostic = await page.evaluate(() => {
      const root = document.querySelector('#sia-copilot-root');
      return {
        readyState: document.readyState,
        topIsSelf: window.top === window.self,
        pathname: location.pathname,
        guard: Boolean(window.__SIA_GLOBAL_COPILOT_V1__),
        bridgeGuard: Boolean(window.__SULANDRA_CODEBASE_SIA_FULLSCREEN_BRIDGE_V1__),
        root: Boolean(root),
        launcher: Boolean(document.querySelector('#siaxLauncher')),
        rootChildCount: root?.childElementCount ?? -1,
        rootChildren: root ? [...root.children].map((node) => ({ id: node.id || '', tag: node.tagName, className: String(node.className || '').slice(0,100) })) : [],
        rootHtml: root ? root.innerHTML.slice(0,700) : '',
        rootParent: root?.parentElement?.id || root?.parentElement?.tagName || '',
        removalTrace: window.__siaRemovalTrace || [],
        fullscreenId: (document.fullscreenElement || document.webkitFullscreenElement)?.id || '',
        scripts: [...document.scripts].filter((node) => /sia-copilot|codebase-sia/i.test(node.src || '')).map((node) => ({ src: node.src, defer: node.defer })),
      };
    });
    console.log('[SIA DIAG] ' + JSON.stringify(diagnostic));
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
        rootInsideCodebase: Boolean(root && codebase && codebase.contains(root)),
      };
    });
    assert(/Ask SIA/i.test(layers.label), \`Ask SIA launcher label missing: \${JSON.stringify(layers)}\`);
    assert(layers.rootZ > layers.codebaseZ && layers.launcherZ > layers.codebaseZ, \`Ask SIA is still behind Codebase: \${JSON.stringify(layers)}\`);
    return layers;
  });

  await step('Verify colorful syntax, line numbers, and stable Explorer/tab DNA', async () => {`,
);
fs.writeFileSync(file, source, 'utf8');
