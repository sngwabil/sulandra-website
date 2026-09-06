import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node fix-codebase-async-pty-startup.mjs <gateway-server.mjs>');

let source = await readFile(target, 'utf8');
const marker = 'CODEBASE_ASYNC_PTY_STARTUP_V1';
if (source.includes(marker)) {
  console.log('Codebase asynchronous PTY startup is already installed.');
  process.exit(0);
}
if (!source.includes('CODEBASE_PTY_COMPAT_V1') || !source.includes('CODEBASE_PTY_SESSION_RESUME_V1')) {
  throw new Error('Codebase PTY compatibility and session-resume patches must run before asynchronous startup');
}

const replaceSpan = (startNeedle, endNeedle, replacement, label) => {
  const start = source.indexOf(startNeedle);
  if (start < 0) throw new Error('Codebase asynchronous PTY startup anchor changed: ' + label + ' start');
  const end = source.indexOf(endNeedle, start);
  if (end < 0) throw new Error('Codebase asynchronous PTY startup anchor changed: ' + label + ' end');
  source = source.slice(0, start) + replacement + source.slice(end);
};

const insertBefore = (needle, value, label) => {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error('Codebase asynchronous PTY startup anchor changed: ' + label);
  source = source.slice(0, index) + value + source.slice(index);
};

const resolver = [
  '/* ' + marker,
  '   Railway and browser WebSocket proxies have a finite upgrade window. A',
  '   reused Codebase workspace can take longer than that to provision a fresh',
  '   isolated container, so resolve/resume the terminal only after the browser',
  '   socket is accepted. This keeps the independent /projects workspace intact',
  '   and lets the UI report a real startup state instead of a blank terminal. */',
  'const resolveCodebaseAsyncPty = async (owner, options = {}) => {',
  '  const requestedSessionId = String(options.sessionId || \'\').trim();',
  '  const requestedWorkspaceId = String(options.workspaceId || \'\').trim();',
  '  if (requestedSessionId) {',
  '    if (!/^[A-Za-z0-9_-]+$/.test(requestedSessionId)) throw new Error(\'Invalid Codebase terminal sessionId\');',
  '    if (requestedWorkspaceId && !/^[A-Za-z0-9_-]+$/.test(requestedWorkspaceId)) throw new Error(\'Invalid Codebase terminal workspaceId\');',
  '    cancelCodebaseCompatSessionCleanup(requestedSessionId);',
  '    const probe = await probeCodebaseCompatResume(owner, requestedSessionId, requestedWorkspaceId);',
  '    if (probe.sessionAlive) {',
  '      if (requestedWorkspaceId && probe.workspaceAlive) codebaseCompatWorkspaces.set(owner, requestedWorkspaceId);',
  '      return {',
  '        workspaceId: requestedWorkspaceId || codebaseCompatWorkspaces.get(owner) || \'\',',
  '        sessionId: requestedSessionId,',
  '        resumed: true,',
  '        recovered: false,',
  '      };',
  '    }',
  '    if (requestedWorkspaceId && probe.workspaceAlive) {',
  '      codebaseCompatWorkspaces.set(owner, requestedWorkspaceId);',
  '    } else if (requestedWorkspaceId && codebaseCompatWorkspaces.get(owner) === requestedWorkspaceId) {',
  '      codebaseCompatWorkspaces.delete(owner);',
  '    }',
  '    console.warn(\'[terminal-gateway] Codebase stale PTY resume recovered session=\' + requestedSessionId + \' workspace=\' + (requestedWorkspaceId || \'unknown\'));',
  '    const recovered = await createCodebaseCompatSession(owner, options.cols, options.rows);',
  '    if (!recovered.sessionId) throw new Error(\'Terminal execution plane did not return a sessionId\');',
  '    return { ...recovered, resumed: false, recovered: true };',
  '  }',
  '  const created = await createCodebaseCompatSession(owner, options.cols, options.rows);',
  '  if (!created.sessionId) throw new Error(\'Terminal execution plane did not return a sessionId\');',
  '  return { ...created, resumed: false, recovered: false };',
  '};',
  '',
].join('\n');
insertBefore("server.on('upgrade', async (req, socket, head) => {", resolver, 'asynchronous PTY resolver');

const ptyUpgrade = [
  "  if (url.pathname === '/pty') {",
  "    const verification = await verifyBrowserToken(String(url.searchParams.get('token') || ''));",
  '    if (!verification.auth) {',
  "      console.warn('[terminal-gateway] Codebase /pty rejected reason=' + verification.reason);",
  "      socket.write('HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\nCache-Control: no-store\\r\\n\\r\\n');",
  '      socket.destroy();',
  '      return;',
  '    }',
  '    // Codebase is a separate product from Engineering Workspace. Accept the',
  '    // browser socket before creating a session so a slow-but-valid container',
  '    // start cannot exceed an intermediary WebSocket upgrade deadline.',
  "    const owner = 'codebase:' + verification.auth.organizationId + ':' + verification.auth.userId; // CODEBASE_OWNER_NAMESPACE_V2",
  '    req.sulandraCodebasePty = {',
  '      owner,',
  "      cols: url.searchParams.get('cols'),",
  "      rows: url.searchParams.get('rows'),",
  "      requestedSessionId: String(url.searchParams.get('sessionId') || '').trim(),",
  "      requestedWorkspaceId: String(url.searchParams.get('workspaceId') || '').trim(),",
  '    };',
  "    codebasePtyWss.handleUpgrade(req, socket, head, ws => codebasePtyWss.emit('connection', ws, req));",
  '    return;',
  '  }',
  '',
].join('\n');
replaceSpan(
  "  if (url.pathname === '/pty') {",
  "  const match = url.pathname.match(/^\\/ws\\/sessions\\/([A-Za-z0-9_-]+)$/);",
  ptyUpgrade,
  'PTY upgrade',
);

const connectionHandler = [
  "codebasePtyWss.on('connection', (browser, req) => {",
  '  const { owner, cols, rows, requestedSessionId, requestedWorkspaceId } = req.sulandraCodebasePty;',
  "  let workspaceId = ''; ",
  "  let sessionId = ''; ",
  '  let upstream = null;',
  '  let closed = false;',
  '  let closeCode = 1000;',
  "  let closeReasonText = ''; ",
  '  let pendingResize = null;',
  '  const pendingFrames = [];',
  '  let pendingBytes = 0;',
  '  const maxPendingBytes = 65_536;',
  '  const closeBoth = (code = 1011, reason = \'Codebase PTY proxy closed\') => {',
  '    const safeCode = normalizeWsCloseCode(code);',
  '    const safeReason = closeReason(reason);',
  '    if (browser.readyState === WebSocket.OPEN || browser.readyState === WebSocket.CONNECTING) { try { browser.close(safeCode, safeReason); } catch {} }',
  '    if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) { try { upstream.close(safeCode, safeReason); } catch {} }',
  '  };',
  '  const cleanupAfterBrowserClose = () => {',
  '    if (!sessionId) return;',
  "    const explicitTerminalClose = Number(closeCode) === 1000 && closeReasonText === 'Terminal tab closed';",
  '    if (explicitTerminalClose) {',
  '      cancelCodebaseCompatSessionCleanup(sessionId);',
  '      void destroyCodebaseCompatSession(owner, sessionId);',
  '    } else {',
  '      scheduleCodebaseCompatSessionCleanup(owner, sessionId);',
  '    }',
  '  };',
  '  const startupFailure = error => {',
  "    const detail = String(error?.message || error || 'unknown').replace(/\\s+/g, ' ').slice(0, 180);",
  "    const status = Number(error?.status) || 503;",
  "    const code = String(error?.cause?.code || error?.code || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) || 'unknown';",
  "    console.error('[terminal-gateway] Codebase PTY provisioning failed status=' + status + ' code=' + code + ' detail=' + detail);",
  '    if (browser.readyState === WebSocket.OPEN) {',
  "      try { browser.send(JSON.stringify({ type: 'terminal-error', code: 'startup-failed', message: 'Terminal startup did not complete. Retrying automatically.' })); } catch {} ",
  "      try { browser.close(1011, 'Terminal startup failed'); } catch {} ",
  '    }',
  '  };',
  "  if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify({ type: 'terminal-starting' }));",
  '  browser.on(\'message\', (data, isBinary) => {',
  '    if (!isBinary) {',
  '      const text = String(data || \'\');',
  '      if (text.startsWith(\'{\')) {',
  '        try {',
  '          const control = JSON.parse(text);',
  "          if (control?.type === 'resize') {",
  '            pendingResize = {',
  '              cols: Math.max(40, Math.min(240, Number(control.cols) || 120)),',
  '              rows: Math.max(12, Math.min(80, Number(control.rows) || 32)),',
  '            };',
  '            if (sessionId) {',
  "              void executionRequest(codebaseOwnerRequest(owner), '/v1/sessions/' + encodeURIComponent(sessionId) + '/resize', { method: 'POST', body: pendingResize }).catch(() => {}); ",
  '            }',
  '            return;',
  '          }',
  '        } catch {}',
  '      }',
  '    }',
  '    const bytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data));',
  '    if (upstream?.readyState === WebSocket.OPEN) {',
  '      upstream.send(data, { binary: isBinary });',
  '      return;',
  '    }',
  '    if (pendingBytes + bytes > maxPendingBytes) {',
  "      closeBoth(1008, 'Codebase terminal startup input buffer exceeded');",
  '      return;',
  '    }',
  '    pendingFrames.push({ data: isBinary ? Buffer.from(data) : String(data), isBinary });',
  '    pendingBytes += bytes;',
  '  });',
  "  browser.on('close', (code, reason) => {",
  '    if (closed) return;',
  '    closed = true;',
  '    closeCode = code;',
  '    closeReasonText = String(reason || \'\');',
  "    if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) { try { upstream.close(1000, 'Browser disconnected'); } catch {} } ",
  '    cleanupAfterBrowserClose();',
  '    pendingFrames.length = 0;',
  '    pendingBytes = 0;',
  '  });',
  "  browser.on('error', () => closeBoth(1011, 'Browser PTY socket failed')); ",
  '  void (async () => {',
  '    try {',
  '      const created = await resolveCodebaseAsyncPty(owner, {',
  '        cols,',
  '        rows,',
  '        sessionId: requestedSessionId,',
  '        workspaceId: requestedWorkspaceId,',
  '      });',
  '      workspaceId = String(created.workspaceId || \'\');',
  '      sessionId = String(created.sessionId || \'\');',
  '      if (!sessionId) throw new Error(\'Terminal execution plane did not return a sessionId\');',
  '      if (closed) {',
  '        cleanupAfterBrowserClose();',
  '        return;',
  '      }',
  '      cancelCodebaseCompatSessionCleanup(sessionId);',
  '      browser.send(JSON.stringify({ type: \'session\', sessionId, workspaceId, resumed: Boolean(created.resumed), recovered: Boolean(created.recovered) }));',
  '      if (pendingResize) {',
  "        void executionRequest(codebaseOwnerRequest(owner), '/v1/sessions/' + encodeURIComponent(sessionId) + '/resize', { method: 'POST', body: pendingResize }).catch(() => {}); ",
  '      }',
  "      upstream = new WebSocket(executionWsUrl('/v1/ws/sessions/' + encodeURIComponent(sessionId)), ['sulandra-executor.v1'], {",
  '        ...executionWebSocketOptions,',
  "        headers: { Authorization: 'Bearer ' + executionToken, 'x-sulandra-terminal-owner': owner },",
  '        handshakeTimeout: 10_000,',
  '        maxPayload: 1_048_576,',
  '      });',
  "      upstream.on('open', () => {",
  '        for (const frame of pendingFrames.splice(0)) {',
  '          if (upstream.readyState !== WebSocket.OPEN) break;',
  '          upstream.send(frame.data, { binary: frame.isBinary });',
  '        }',
  '        pendingBytes = 0;',
  '      });',
  "      upstream.on('message', (data, isBinary) => { if (browser.readyState === WebSocket.OPEN) browser.send(data, { binary: isBinary }); });",
  "      upstream.on('close', (code, reason) => { if (browser.readyState === WebSocket.OPEN) browser.close(normalizeWsCloseCode(code), closeReason(reason)); });",
  "      upstream.on('error', () => closeBoth(1011, 'Execution plane unavailable')); ",
  '    } catch (error) {',
  '      startupFailure(error);',
  '    }',
  '  })();',
  '});',
  '',
  '',
].join('\n');
replaceSpan(
  "codebasePtyWss.on('connection', (browser, req) => {",
  "\nwss.on('connection', (browser, req) => {",
  connectionHandler,
  'PTY connection',
);

for (const required of [
  marker,
  'resolveCodebaseAsyncPty',
  "type: 'terminal-starting'",
  "type: 'terminal-error'",
  'Codebase PTY provisioning failed status=',
  'cleanupAfterBrowserClose',
  'Codebase terminal startup input buffer exceeded',
]) {
  if (!source.includes(required)) throw new Error('Codebase asynchronous PTY startup verification missing: ' + required);
}

await writeFile(target, source, 'utf8');
console.log('Installed asynchronous Codebase PTY provisioning with durable resume handling.');
