import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-codebase-pty-compat.mjs <gateway-server.mjs>');
let source = await readFile(target, 'utf8');

if (source.includes('CODEBASE_PTY_COMPAT_V1')) {
  console.log('Codebase PTY compatibility already installed.');
  process.exit(0);
}

const replaceOnce = (needle, replacement, label) => {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Codebase PTY installer anchor changed: ${label}`);
  source = source.slice(0, index) + replacement + source.slice(index + needle.length);
};

replaceOnce(
  "const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });",
  "const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });\nconst codebasePtyWss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 }); // CODEBASE_PTY_COMPAT_V1",
  'PTY WebSocket server',
);

const helpers = String.raw`
const codebaseCompatWorkspaces = new Map();
const codebaseCompatWorkspaceLocks = new Map();
const codebaseOwnerRequest = owner => ({
  header(name) { return String(name || '').toLowerCase() === 'x-sulandra-terminal-owner' ? owner : ''; },
});
const ensureCodebaseCompatWorkspace = async owner => {
  const known = codebaseCompatWorkspaces.get(owner);
  if (known) return known;
  if (codebaseCompatWorkspaceLocks.has(owner)) return codebaseCompatWorkspaceLocks.get(owner);
  const pending = (async () => {
    const req = codebaseOwnerRequest(owner);
    const created = await executionRequest(req, '/v1/workspaces', { method: 'POST', body: {} });
    const workspaceId = String(created?.workspaceId || '');
    if (!workspaceId) throw new Error('Terminal execution plane did not return a workspaceId');
    codebaseCompatWorkspaces.set(owner, workspaceId);
    return workspaceId;
  })().finally(() => codebaseCompatWorkspaceLocks.delete(owner));
  codebaseCompatWorkspaceLocks.set(owner, pending);
  return pending;
};
const createCodebaseCompatSession = async (owner, cols = 120, rows = 32) => {
  const req = codebaseOwnerRequest(owner);
  let workspaceId = await ensureCodebaseCompatWorkspace(owner);
  const create = async id => executionRequest(req, '/v1/workspaces/' + encodeURIComponent(id) + '/sessions', {
    method: 'POST',
    body: { cols: Math.max(40, Math.min(240, Number(cols) || 120)), rows: Math.max(12, Math.min(80, Number(rows) || 32)) },
    timeoutMs: 60_000,
  });
  try {
    const created = await create(workspaceId);
    return { workspaceId, sessionId: String(created?.sessionId || '') };
  } catch (error) {
    if (Number(error?.status) !== 404) throw error;
    codebaseCompatWorkspaces.delete(owner);
    workspaceId = await ensureCodebaseCompatWorkspace(owner);
    const created = await create(workspaceId);
    return { workspaceId, sessionId: String(created?.sessionId || '') };
  }
};
const destroyCodebaseCompatSession = async (owner, sessionId) => {
  if (!sessionId) return;
  try { await executionRequest(codebaseOwnerRequest(owner), '/v1/sessions/' + encodeURIComponent(sessionId), { method: 'DELETE' }); } catch {}
};
`;

replaceOnce(
  "server.on('upgrade', async (req, socket, head) => {",
  `${helpers}\nserver.on('upgrade', async (req, socket, head) => {`,
  'PTY helpers',
);

const upgradeAnchor = "  const match = url.pathname.match(/^\\/ws\\/sessions\\/([A-Za-z0-9_-]+)$/);";
const upgradeReplacement = String.raw`  if (url.pathname === '/pty') {
    const verification = await verifyBrowserToken(String(url.searchParams.get('token') || ''));
    if (!verification.auth) {
      console.warn('[terminal-gateway] Codebase /pty rejected reason=' + verification.reason);
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n');
      socket.destroy();
      return;
    }
    try {
      // Codebase is a separate product from Engineering Workspace. It reuses the
      // same execution engine but must not consume Engineering's workspace quota.
      const owner = 'codebase:' + verification.auth.organizationId + ':' + verification.auth.userId; // CODEBASE_OWNER_NAMESPACE_V2
      const created = await createCodebaseCompatSession(owner, url.searchParams.get('cols'), url.searchParams.get('rows'));
      if (!created.sessionId) throw new Error('Terminal execution plane did not return a sessionId');
      req.sulandraCodebasePty = { owner, workspaceId: created.workspaceId, sessionId: created.sessionId };
      codebasePtyWss.handleUpgrade(req, socket, head, ws => codebasePtyWss.emit('connection', ws, req));
    } catch (error) {
      console.error('[terminal-gateway] Codebase /pty startup failed', error?.message || error);
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n');
      socket.destroy();
    }
    return;
  }
  const match = url.pathname.match(/^\/ws\/sessions\/([A-Za-z0-9_-]+)$/);`;
replaceOnce(upgradeAnchor, upgradeReplacement, 'PTY upgrade branch');

const connectionHandler = String.raw`
codebasePtyWss.on('connection', (browser, req) => {
  const { owner, workspaceId, sessionId } = req.sulandraCodebasePty;
  const upstream = new WebSocket(executionWsUrl('/v1/ws/sessions/' + encodeURIComponent(sessionId)), ['sulandra-executor.v1'], {
    ...executionWebSocketOptions,
    headers: { Authorization: 'Bearer ' + executionToken, 'x-sulandra-terminal-owner': owner },
    handshakeTimeout: 10_000,
    maxPayload: 1_048_576,
  });
  const pendingFrames = [];
  let pendingBytes = 0;
  const maxPendingBytes = 65_536;
  let closed = false;
  const closeBoth = (code = 1011, reason = 'Codebase PTY proxy closed') => {
    const safeCode = normalizeWsCloseCode(code);
    const safeReason = closeReason(reason);
    if (browser.readyState === WebSocket.OPEN || browser.readyState === WebSocket.CONNECTING) { try { browser.close(safeCode, safeReason); } catch {} }
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) { try { upstream.close(safeCode, safeReason); } catch {} }
  };
  browser.send(JSON.stringify({ type: 'session', sessionId, workspaceId }));
  upstream.on('open', () => {
    for (const frame of pendingFrames.splice(0)) {
      if (upstream.readyState !== WebSocket.OPEN) break;
      upstream.send(frame.data, { binary: frame.isBinary });
    }
    pendingBytes = 0;
  });
  upstream.on('message', (data, isBinary) => { if (browser.readyState === WebSocket.OPEN) browser.send(data, { binary: isBinary }); });
  upstream.on('close', (code, reason) => { if (browser.readyState === WebSocket.OPEN) browser.close(normalizeWsCloseCode(code), closeReason(reason)); });
  upstream.on('error', () => closeBoth(1011, 'Execution plane unavailable'));
  browser.on('message', (data, isBinary) => {
    if (!isBinary) {
      const text = String(data || '');
      if (text.startsWith('{')) {
        try {
          const control = JSON.parse(text);
          if (control?.type === 'resize') {
            void executionRequest(codebaseOwnerRequest(owner), '/v1/sessions/' + encodeURIComponent(sessionId) + '/resize', {
              method: 'POST', body: { cols: control.cols, rows: control.rows },
            }).catch(() => {});
            return;
          }
        } catch {}
      }
    }
    const bytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data));
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
      return;
    }
    if (upstream.readyState === WebSocket.CONNECTING) {
      if (pendingBytes + bytes > maxPendingBytes) {
        closeBoth(1008, 'Codebase terminal startup input buffer exceeded');
        return;
      }
      pendingFrames.push({ data: isBinary ? Buffer.from(data) : String(data), isBinary });
      pendingBytes += bytes;
    }
  });
  browser.on('close', () => {
    if (closed) return;
    closed = true;
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) { try { upstream.close(1000, 'Browser disconnected'); } catch {} }
    setTimeout(() => void destroyCodebaseCompatSession(owner, sessionId), 1_000).unref?.();
  });
  browser.on('close', () => {
    pendingFrames.length = 0;
    pendingBytes = 0;
  });
  browser.on('error', () => closeBoth(1011, 'Browser PTY socket failed'));
});

`;
replaceOnce("wss.on('connection', (browser, req) => {", `${connectionHandler}wss.on('connection', (browser, req) => {`, 'PTY connection handler');

for (const required of [
  'CODEBASE_PTY_COMPAT_V1',
  'CODEBASE_OWNER_NAMESPACE_V2',
  "url.pathname === '/pty'",
  "type: 'session'",
  'const pendingFrames = [];',
  "upstream.on('open'",
  'Codebase terminal startup input buffer exceeded',
]) {
  if (!source.includes(required)) throw new Error(`Codebase PTY compatibility marker is missing after installation: ${required}`);
}

await writeFile(target, source, 'utf8');
console.log(`Codebase /pty compatibility installed into ${target}`);
