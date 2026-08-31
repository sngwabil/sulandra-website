import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-workspace-ide-live-preview.mjs <server.mjs>');
let source = await readFile(target, 'utf8');

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Workspace IDE installer anchor changed: ${label}`);
  source = source.slice(0, index) + to + source.slice(index + from.length);
};

const proxyHeaderHelpers = `
const workspaceHopHeaders = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
const copyWorkspaceRequestHeaders = headers => {
  const output = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = String(key).toLowerCase();
    if (workspaceHopHeaders.has(lower) || lower === 'host' || lower === 'authorization' || lower.startsWith('x-sulandra-terminal-')) continue;
    if (value !== undefined) output[key] = value;
  }
  return output;
};
const copyWorkspaceResponseHeaders = (upstream, res, { embeddable = false } = {}) => {
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (workspaceHopHeaders.has(lower) || lower === 'content-length' || lower === 'x-frame-options' || lower === 'content-security-policy' || lower === 'set-cookie') continue;
    res.setHeader(key, value);
  }
  const cookies = upstream.headers.getSetCookie?.() || [];
  if (cookies.length) res.setHeader('set-cookie', cookies);
  if (embeddable) {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://www.sulandrahealth.com https://sulandrahealth.com");
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
};
const bridgeWorkspaceSockets = (left, right) => {
  const close = (socket, code = 1011, reason = 'Workspace proxy closed') => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      try { socket.close(normalizeWsCloseCode(code), closeReason(reason)); } catch {}
    }
  };
  left.on('message', (data, binary) => { if (right.readyState === WebSocket.OPEN) right.send(data, { binary }); });
  right.on('message', (data, binary) => { if (left.readyState === WebSocket.OPEN) left.send(data, { binary }); });
  left.on('close', (code, reason) => close(right, code, reason));
  right.on('close', (code, reason) => close(left, code, reason));
  left.on('error', () => close(right, 1011, 'Workspace browser socket failed'));
  right.on('error', () => close(left, 1011, 'Workspace upstream socket failed'));
};
`;

if (source.includes("const docker = new Docker")) {
  replaceOnce("import { createServer } from 'node:http';", "import { createServer } from 'node:http';\nimport { Readable } from 'node:stream';", 'executor stream import');
  replaceOnce("const app = express();\napp.disable('x-powered-by');\napp.use(express.json({ limit: '128kb' }));", String.raw`const app = express();\napp.disable('x-powered-by');\napp.use((req, res, next) => {\n  if (/^\\/v1\\/ide\\//.test(req.url || '')) { void proxyWorkspaceIdeRequest(req, res, next); return; }\n  next();\n});\napp.use(express.json({ limit: '128kb' }));`, 'executor raw IDE middleware');
  source = source.replace('Number(process.env.TERMINAL_MEMORY_BYTES || 536_870_912)', 'Number(process.env.TERMINAL_MEMORY_BYTES || 4_294_967_296)');
  source = source.replace('Number(process.env.TERMINAL_NANO_CPUS || 500_000_000)', 'Number(process.env.TERMINAL_NANO_CPUS || 2_000_000_000)');
  replaceOnce("const agentPort = Math.max(1, Number(process.env.TERMINAL_AGENT_PORT || 9000));", "const agentPort = Math.max(1, Number(process.env.TERMINAL_AGENT_PORT || 9000));\nconst idePort = Math.max(1024, Math.min(65535, Number(process.env.TERMINAL_IDE_PORT || 13337)));", 'executor IDE port');
  replaceOnce("      `PORT=${agentPort}`,", "      `PORT=${agentPort}`,\n      `SULANDRA_IDE_PORT=${idePort}`,", 'executor IDE environment');
  replaceOnce("    ExposedPorts: { [`${agentPort}/tcp`]: {} },", "    ExposedPorts: { [`${agentPort}/tcp`]: {}, [`${idePort}/tcp`]: {} },", 'executor exposed IDE port');
  replaceOnce("const agentUrl = async (session, pathname = '') => {\n  const container = docker.getContainer(session.containerId);\n  const address = await findContainerAddress(container);\n  return `http://${address}:${agentPort}${pathname}`;\n};", `const agentUrl = async (session, pathname = '') => {\n  const container = docker.getContainer(session.containerId);\n  const address = await findContainerAddress(container);\n  return 'http://' + address + ':' + agentPort + pathname;\n};\n\nconst workspaceIdeUrl = async (session, pathname = '/') => {\n  const address = await findContainerAddress(docker.getContainer(session.containerId));\n  return 'http://' + address + ':' + idePort + pathname;\n};`, 'executor IDE URL');

  const executorProxy = String.raw`${proxyHeaderHelpers}
const proxyWorkspaceIdeRequest = async (req, res, next) => {
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    const match = parsed.pathname.match(/^\/v1\/ide\/([A-Za-z0-9_-]+)(\/.*)?$/);
    const token = bearer(req);
    const owner = ownerOf(req);
    if (!match || !secureEquals(token, executionToken) || !owner) return res.status(401).json({ error: 'Unauthorized workspace proxy request' });
    const session = sessions.get(match[1]);
    if (!session || session.owner !== owner) return res.status(404).json({ error: 'Terminal session not found' });
    const rest = match[2] || '/';
    const blocked = rest.match(/^\/(?:abs)?proxy\/(\d+)(?:\/|$)/);
    if (blocked && [agentPort, idePort].includes(Number(blocked[1]))) return res.status(403).json({ error: 'Reserved terminal service port' });
    session.lastUsedAt = now();
    const controller = new AbortController();
    req.once('close', () => controller.abort());
    const init = { method: req.method, headers: copyWorkspaceRequestHeaders(req.headers), redirect: 'manual', signal: controller.signal };
    if (!['GET','HEAD'].includes(String(req.method || 'GET').toUpperCase())) { init.body = req; init.duplex = 'half'; }
    const upstream = await fetch(await workspaceIdeUrl(session, rest + parsed.search), init);
    res.statusCode = upstream.status;
    copyWorkspaceResponseHeaders(upstream, res);
    if (!upstream.body || req.method === 'HEAD') return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    next(error);
  }
};
`;
  replaceOnce("app.use(authorize);", `${executorProxy}\napp.use(authorize);`, 'executor proxy helpers');
  replaceOnce("const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });", "const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });\nconst ideWss = new WebSocketServer({ noServer: true, maxPayload: 8_388_608 });", 'executor IDE WSS');
  replaceOnce("  const match = url.pathname.match(/^\\/v1\\/ws\\/sessions\\/([A-Za-z0-9_-]+)$/);\n  const token = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '').trim();\n  const owner = String(req.headers['x-sulandra-terminal-owner'] || '').trim();", String.raw`  const ideMatch = url.pathname.match(/^\\/v1\\/ide\\/([A-Za-z0-9_-]+)(\\/.*)?$/);\n  const token = String(req.headers.authorization || '').replace(/^Bearer\\s+/i, '').trim();\n  const owner = String(req.headers['x-sulandra-terminal-owner'] || '').trim();\n  if (ideMatch) {\n    if (!secureEquals(token, executionToken) || !owner) { socket.write('HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n'); socket.destroy(); return; }\n    const session = sessions.get(ideMatch[1]);\n    if (!session || session.owner !== owner) { socket.write('HTTP/1.1 404 Not Found\\r\\nConnection: close\\r\\n\\r\\n'); socket.destroy(); return; }\n    const rest = ideMatch[2] || '/';\n    const blocked = rest.match(/^\\/(?:abs)?proxy\\/(\\d+)(?:\\/|$)/);\n    if (blocked && [agentPort, idePort].includes(Number(blocked[1]))) { socket.write('HTTP/1.1 403 Forbidden\\r\\nConnection: close\\r\\n\\r\\n'); socket.destroy(); return; }\n    const address = await findContainerAddress(docker.getContainer(session.containerId));\n    req.sulandraIde = { session, upstream: 'ws://' + address + ':' + idePort + rest + url.search };\n    ideWss.handleUpgrade(req, socket, head, ws => ideWss.emit('connection', ws, req));\n    return;\n  }\n  const match = url.pathname.match(/^\\/v1\\/ws\\/sessions\\/([A-Za-z0-9_-]+)$/);`, 'executor IDE upgrade branch');
  replaceOnce("wss.on('connection', (gateway, req) => {", `ideWss.on('connection', (browser, req) => {\n  const session = req.sulandraIde.session;\n  session.lastUsedAt = now();\n  const requested = String(req.headers['sec-websocket-protocol'] || '').split(',').map(value => value.trim()).filter(Boolean);\n  const upstream = new WebSocket(req.sulandraIde.upstream, requested.length ? requested : undefined, {\n    headers: { 'user-agent': String(req.headers['user-agent'] || 'Sulandra-Workspace-Proxy') },\n  });\n  bridgeWorkspaceSockets(browser, upstream);\n});\n\nwss.on('connection', (gateway, req) => {`, 'executor IDE WSS bridge');
  replaceOnce("cgroups: { memoryBytes, nanoCpus, pidsLimit },", "cgroups: { memoryBytes, nanoCpus, pidsLimit },\n      workspaceIde: { enabled: true, port: idePort, embeddedAuth: 'gateway-ticket' },", 'executor health IDE marker');
} else if (source.includes('const executionBaseUrl')) {
  replaceOnce("import { createServer } from 'node:http';", "import { createServer } from 'node:http';\nimport { Readable } from 'node:stream';", 'gateway stream import');
  replaceOnce("const app = express();\napp.disable('x-powered-by');\napp.use(express.json({ limit: '128kb' }));", String.raw`const app = express();\napp.disable('x-powered-by');\napp.use((req, res, next) => {\n  if (/^\\/workspace\\//.test(req.url || '') && !/^\\/workspace\\/ticket(?:\\?|$)/.test(req.url || '')) { void proxyBrowserWorkspace(req, res, next); return; }\n  next();\n});\napp.use(express.json({ limit: '128kb' }));`, 'gateway raw workspace middleware');
  replaceOnce("const allowedRoles = new Set(['ADMINISTRATOR', 'CEO', 'COO']);", "const allowedRoles = new Set(['ADMINISTRATOR', 'CEO', 'COO']);\nconst workspaceTicketSecret = crypto.createHash('sha256').update('sulandra-workspace-ticket:' + authToken).digest('hex');\nconst workspaceTicketSeconds = Math.max(60, Math.min(900, Number(process.env.TERMINAL_WORKSPACE_TICKET_SECONDS || 300)));", 'gateway ticket secret');

  const gatewayProxy = String.raw`${proxyHeaderHelpers}
const browserBearer = req => {
  const value = String(req.headers.authorization || '').trim();
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
};
const ticketCookie = req => {
  const raw = String(req.headers.cookie || '');
  for (const item of raw.split(';')) {
    const [name, ...rest] = item.trim().split('=');
    if (name === 'sulandra_workspace_ticket') return decodeURIComponent(rest.join('=') || '');
  }
  return '';
};
const verifyWorkspaceTicket = (token, sessionId) => {
  try {
    const claims = jwt.verify(String(token || ''), workspaceTicketSecret, { algorithms: ['HS256'] });
    if (typeof claims === 'string' || claims.purpose !== 'workspace-ide' || claims.sessionId !== sessionId || typeof claims.owner !== 'string') return null;
    return claims;
  } catch { return null; }
};
const workspaceTicketFromUrl = (req, parsed) => String(parsed.searchParams.get('ticket') || ticketCookie(req) || '');
const validateWorkspaceProxyPath = rest => {
  const portMatch = String(rest || '/').match(/^\/(?:abs)?proxy\/(\d+)(?:\/|$)/);
  if (!portMatch) return true;
  const previewPort = Number(portMatch[1]);
  return Number.isInteger(previewPort) && previewPort >= 1024 && previewPort <= 65535 && ![9000, 13337].includes(previewPort);
};
const proxyBrowserWorkspace = async (req, res, next) => {
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    const match = parsed.pathname.match(/^\/workspace\/([A-Za-z0-9_-]+)\/ide(\/.*)?$/);
    if (!match) return next();
    const sessionId = match[1];
    const rest = match[2] || '/';
    if (!validateWorkspaceProxyPath(rest)) return res.status(403).json({ error: 'Preview port is not allowed' });
    const ticket = workspaceTicketFromUrl(req, parsed);
    const claims = verifyWorkspaceTicket(ticket, sessionId);
    if (!claims) return res.status(401).json({ error: 'Workspace access expired. Reopen IDE or Preview.' });
    if (parsed.searchParams.has('ticket')) parsed.searchParams.delete('ticket');
    const cookiePath = '/workspace/' + encodeURIComponent(sessionId) + '/ide';
    res.setHeader('Set-Cookie', 'sulandra_workspace_ticket=' + encodeURIComponent(ticket) + '; Path=' + cookiePath + '; Max-Age=' + workspaceTicketSeconds + '; HttpOnly; Secure; SameSite=None');
    const controller = new AbortController();
    req.once('close', () => controller.abort());
    const headers = copyWorkspaceRequestHeaders(req.headers);
    headers.Authorization = 'Bearer ' + executionToken;
    headers['x-sulandra-terminal-owner'] = claims.owner;
    headers['x-forwarded-proto'] = 'https';
    headers['x-forwarded-host'] = String(req.headers.host || '');
    const init = { method: req.method, headers, redirect: 'manual', signal: controller.signal };
    if (!['GET','HEAD'].includes(String(req.method || 'GET').toUpperCase())) { init.body = req; init.duplex = 'half'; }
    const upstreamPath = '/v1/ide/' + encodeURIComponent(sessionId) + rest + parsed.search;
    const upstream = await fetch(executionUrl(upstreamPath), init);
    res.statusCode = upstream.status;
    copyWorkspaceResponseHeaders(upstream, res, { embeddable: true });
    if (!upstream.body || req.method === 'HEAD') return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    next(error);
  }
};

app.post('/workspace/ticket', async (req, res) => {
  const verification = await verifyBrowserToken(browserBearer(req));
  if (!verification.auth) return res.status(401).json({ error: 'Administrator authentication required', reason: verification.reason });
  const sessionId = String(req.body?.sessionId || '').trim();
  const requestedPort = req.body?.port === undefined || req.body?.port === null || req.body?.port === '' ? null : Number(req.body.port);
  if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return res.status(400).json({ error: 'Valid terminal sessionId is required' });
  if (requestedPort !== null && (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535 || [9000, 13337].includes(requestedPort))) return res.status(400).json({ error: 'Preview port must be 1024-65535 and not a reserved terminal port' });
  const auth = verification.auth;
  const owner = auth.organizationId + ':' + auth.userId;
  const ticket = jwt.sign({ purpose: 'workspace-ide', sessionId, owner, role: auth.role }, workspaceTicketSecret, { algorithm: 'HS256', expiresIn: workspaceTicketSeconds, subject: auth.userId });
  const base = '/workspace/' + encodeURIComponent(sessionId) + '/ide';
  const targetPath = requestedPort === null ? base + '/' : base + '/proxy/' + requestedPort + '/';
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, sessionId, port: requestedPort, expiresIn: workspaceTicketSeconds, url: targetPath + '?ticket=' + encodeURIComponent(ticket) });
});
`;
  replaceOnce("app.use(authenticateInternal);", `${gatewayProxy}\napp.use(authenticateInternal);`, 'gateway browser workspace proxy');
  replaceOnce("const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });", "const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });\nconst workspaceWss = new WebSocketServer({ noServer: true, maxPayload: 8_388_608 });", 'gateway workspace WSS');
  replaceOnce("  const match = url.pathname.match(/^\\/ws\\/sessions\\/([A-Za-z0-9_-]+)$/);\n  if (!match) {", String.raw`  const workspaceMatch = url.pathname.match(/^\\/workspace\\/([A-Za-z0-9_-]+)\\/ide(\\/.*)?$/);\n  if (workspaceMatch) {\n    const sessionId = workspaceMatch[1];\n    const rest = workspaceMatch[2] || '/';\n    if (!validateWorkspaceProxyPath(rest)) { socket.write('HTTP/1.1 403 Forbidden\\r\\nConnection: close\\r\\n\\r\\n'); socket.destroy(); return; }\n    const claims = verifyWorkspaceTicket(workspaceTicketFromUrl(req, url), sessionId);\n    if (!claims) { socket.write('HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\nCache-Control: no-store\\r\\n\\r\\n'); socket.destroy(); return; }\n    url.searchParams.delete('ticket');\n    req.sulandraWorkspace = { sessionId, owner: claims.owner, path: '/v1/ide/' + encodeURIComponent(sessionId) + rest + url.search };\n    workspaceWss.handleUpgrade(req, socket, head, ws => workspaceWss.emit('connection', ws, req));\n    return;\n  }\n  const match = url.pathname.match(/^\\/ws\\/sessions\\/([A-Za-z0-9_-]+)$/);\n  if (!match) {`, 'gateway workspace upgrade branch');
  replaceOnce("wss.on('connection', (browser, req) => {", `workspaceWss.on('connection', (browser, req) => {\n  const requested = String(req.headers['sec-websocket-protocol'] || '').split(',').map(value => value.trim()).filter(Boolean);\n  const upstream = new WebSocket(executionWsUrl(req.sulandraWorkspace.path), requested.length ? requested : undefined, {\n    headers: { Authorization: 'Bearer ' + executionToken, 'x-sulandra-terminal-owner': req.sulandraWorkspace.owner },\n  });\n  bridgeWorkspaceSockets(browser, upstream);\n});\n\nwss.on('connection', (browser, req) => {`, 'gateway workspace WSS bridge');
  replaceOnce("rateLimit: { bytesPerSecond: wsBytesPerSecond, burstBytes: wsBurstBytes },", "rateLimit: { bytesPerSecond: wsBytesPerSecond, burstBytes: wsBurstBytes },\n    workspaceIde: { enabled: true, ticketSeconds: workspaceTicketSeconds, previewProxy: true },", 'gateway health workspace marker');
} else {
  throw new Error('Workspace IDE installer does not recognize target server');
}

for (const marker of ['workspaceIde','workspace']) {
  if (!source.includes(marker)) throw new Error(`Workspace IDE installer failed marker ${marker}`);
}
await writeFile(target, source, 'utf8');
console.log(`Workspace IDE/live preview proxy installed into ${target}`);
