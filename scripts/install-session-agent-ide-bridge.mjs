import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-session-agent-ide-bridge.mjs <server.mjs>');
let source = await readFile(target, 'utf8');

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Session IDE bridge installer anchor changed: ${label}`);
  source = source.slice(0, index) + to + source.slice(index + from.length);
};

replaceOnce(
  "import { createServer } from 'node:http';",
  "import { createServer } from 'node:http';\nimport { Readable } from 'node:stream';",
  'stream import',
);

replaceOnce(
  "const app = express();\napp.disable('x-powered-by');\napp.use(express.json({ limit: '128kb' }));",
  String.raw`const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (/^\/ide(?:\/|\?|$)/.test(req.url || '')) { void proxyIdeRequest(req, res, next); return; }
  next();
});
app.use(express.json({ limit: '128kb' }));`,
  'raw IDE middleware',
);

replaceOnce(
  "const port = Number(process.env.PORT || 9000);",
  "const port = Number(process.env.PORT || 9000);\nconst idePort = Math.max(1024, Math.min(65535, Number(process.env.SULANDRA_IDE_PORT || 13337)));",
  'IDE port',
);

const ideBridge = String.raw`
const ideHopHeaders = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
const copyIdeRequestHeaders = headers => {
  const output = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = String(key).toLowerCase();
    if (ideHopHeaders.has(lower) || lower === 'host' || lower === 'authorization' || lower === 'x-sulandra-session-token') continue;
    if (value !== undefined) output[key] = value;
  }
  return output;
};
const copyIdeResponseHeaders = (upstream, res) => {
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (ideHopHeaders.has(lower) || lower === 'content-length' || lower === 'set-cookie') continue;
    res.setHeader(key, value);
  }
  const cookies = upstream.headers.getSetCookie?.() || [];
  if (cookies.length) res.setHeader('set-cookie', cookies);
};
const proxyIdeRequest = async (req, res, next) => {
  try {
    if (!secureEquals(req.header('x-sulandra-session-token'), sessionToken)) return res.status(401).json({ error: 'Unauthorized session IDE request' });
    const parsed = new URL(req.url || '/ide/', 'http://localhost');
    const rest = parsed.pathname.slice(4) || '/';
    const controller = new AbortController();
    req.once('aborted', () => controller.abort());
    const headers = copyIdeRequestHeaders(req.headers);
    const init = { method: req.method, headers, redirect: 'manual', signal: controller.signal };
    if (!['GET','HEAD'].includes(String(req.method || 'GET').toUpperCase())) { init.body = req; init.duplex = 'half'; }
    const upstream = await fetch('http://127.0.0.1:' + idePort + rest + parsed.search, init);
    res.statusCode = upstream.status;
    copyIdeResponseHeaders(upstream, res);
    if (!upstream.body || req.method === 'HEAD') return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    next(error);
  }
};
const bridgeIdeSockets = (browser, upstream) => {
  const pending = [];
  const close = (socket, code = 1011, reason = 'Workspace IDE proxy closed') => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      try { socket.close(code >= 1000 && code <= 4999 ? code : 1011, String(reason || '').slice(0, 120)); } catch {}
    }
  };
  browser.on('message', (data, binary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary });
    else if (upstream.readyState === WebSocket.CONNECTING && pending.length < 64) pending.push([data, binary]);
  });
  upstream.on('open', () => {
    for (const [data, binary] of pending.splice(0)) if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary });
  });
  upstream.on('message', (data, binary) => { if (browser.readyState === WebSocket.OPEN) browser.send(data, { binary }); });
  browser.on('close', (code, reason) => close(upstream, code, reason));
  upstream.on('close', (code, reason) => close(browser, code, reason));
  browser.on('error', () => close(upstream, 1011, 'Workspace IDE browser socket failed'));
  upstream.on('error', () => close(browser, 1011, 'Workspace IDE upstream socket failed'));
};
`;

const startupAnchor = "spawnBridge();\npushOutput('\\x1b[1;36mSulandra isolated Docker terminal ready.\\x1b[0m\\r\\n');";
replaceOnce(startupAnchor, `${ideBridge}\n${startupAnchor}`, 'IDE HTTP bridge');

replaceOnce(
  "const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });",
  "const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });\nconst ideWss = new WebSocketServer({ noServer: true, maxPayload: 8_388_608 });",
  'IDE websocket server',
);

const oldUpgrade = String.raw`server.on('upgrade', (req, socket, head) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch { socket.destroy(); return; }
  if (url.pathname !== '/ws' || !secureEquals(req.headers['x-sulandra-session-token'], sessionToken)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});`;

const newUpgrade = String.raw`server.on('upgrade', (req, socket, head) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch { socket.destroy(); return; }
  if (!secureEquals(req.headers['x-sulandra-session-token'], sessionToken)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  if (/^\/ide(?:\/|$)/.test(url.pathname)) {
    const rest = url.pathname.slice(4) || '/';
    req.sulandraIdeUpstream = 'ws://127.0.0.1:' + idePort + rest + url.search;
    ideWss.handleUpgrade(req, socket, head, ws => ideWss.emit('connection', ws, req));
    return;
  }
  if (url.pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
    return;
  }
  socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
  socket.destroy();
});`;
replaceOnce(oldUpgrade, newUpgrade, 'IDE websocket upgrade');

const ideConnection = String.raw`ideWss.on('connection', (browser, req) => {
  const requested = String(req.headers['sec-websocket-protocol'] || '').split(',').map(value => value.trim()).filter(Boolean);
  const upstream = new WebSocket(req.sulandraIdeUpstream, requested.length ? requested : undefined, {
    headers: {
      'user-agent': String(req.headers['user-agent'] || 'Sulandra-Session-IDE-Bridge'),
      origin: 'http://127.0.0.1:' + idePort,
    },
  });
  bridgeIdeSockets(browser, upstream);
});

`;
replaceOnce("wss.on('connection', socket => {", `${ideConnection}wss.on('connection', socket => {`, 'IDE websocket bridge');

await writeFile(target, source, 'utf8');
console.log(`Session-agent IDE bridge installed into ${target}`);
