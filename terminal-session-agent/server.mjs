import crypto from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import pty from 'node-pty';
import { WebSocket, WebSocketServer } from 'ws';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

const port = Number(process.env.PORT || 9000);
const sessionToken = String(process.env.SESSION_TOKEN || '').trim();
const workspaceId = String(process.env.WORKSPACE_ID || '').trim();
const tmuxSession = String(process.env.TMUX_SESSION || 'sulandra').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
const initialCols = Math.max(40, Math.min(240, Number(process.env.TERMINAL_COLS || 120)));
const initialRows = Math.max(12, Math.min(80, Number(process.env.TERMINAL_ROWS || 32)));
const outputLimit = Math.max(250_000, Number(process.env.TERMINAL_OUTPUT_LIMIT || 2_000_000));
const wsBytesPerSecond = Math.max(16_384, Number(process.env.TERMINAL_WS_BYTES_PER_SECOND || 262_144));
const wsBurstBytes = Math.max(wsBytesPerSecond, Number(process.env.TERMINAL_WS_BURST_BYTES || 524_288));

if (!sessionToken || sessionToken.length < 32) throw new Error('SESSION_TOKEN is required');
if (!workspaceId) throw new Error('WORKSPACE_ID is required');

const secureEquals = (provided, configured) => {
  if (!provided || !configured) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(configured));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const authorize = (req, res, next) => {
  if (!secureEquals(req.header('x-sulandra-session-token'), sessionToken)) return res.status(401).json({ error: 'Unauthorized session-agent request' });
  next();
};

let proc = null;
let alive = false;
let exitCode = null;
let cursor = 0;
let bufferedChars = 0;
const chunks = [];
const sockets = new Set();

const shellEnv = {
  ...process.env,
  HOME: '/home/terminal',
  SHELL: '/bin/bash',
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  FORCE_COLOR: '1',
  npm_config_color: 'always',
  HISTFILE: '/workspace/.bash_history',
  HISTCONTROL: 'ignoredups:erasedups',
  HISTSIZE: '5000',
  HISTFILESIZE: '10000',
  EDITOR: 'vim',
  VISUAL: 'vim',
  PAGER: 'less',
  LESS: '-R',
  SULANDRA_TERMINAL_ISOLATED: '1',
  SULANDRA_TERMINAL_WORKSPACE: workspaceId,
};

const broadcast = data => {
  const bytes = Buffer.from(String(data || ''), 'utf8');
  for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(bytes, { binary: true });
};
const pushOutput = data => {
  const text = String(data || '');
  if (!text) return;
  const start = cursor;
  cursor += text.length;
  chunks.push({ start, end: cursor, data: text });
  bufferedChars += text.length;
  while (bufferedChars > outputLimit && chunks.length > 1) {
    const removed = chunks.shift();
    bufferedChars -= removed.data.length;
  }
  broadcast(text);
};

const spawnBridge = (cols = initialCols, rows = initialRows) => {
  const args = ['new-session', '-A', '-s', tmuxSession, '/bin/bash', '--noprofile', '--norc', '-i'];
  proc = pty.spawn('tmux', args, {
    name: 'xterm-256color',
    cols: Math.max(40, Math.min(240, Number(cols) || initialCols)),
    rows: Math.max(12, Math.min(80, Number(rows) || initialRows)),
    cwd: '/workspace',
    env: shellEnv,
  });
  alive = true;
  exitCode = null;
  proc.onData(pushOutput);
  proc.onExit(event => {
    alive = false;
    exitCode = event.exitCode;
    pushOutput(`\r\n[terminal bridge exited with code ${event.exitCode}; tmux session retained]\r\n`);
  });
};

const ensureBridge = () => {
  if (!alive || !proc) spawnBridge();
};

const outputFrom = cursorValue => {
  const requested = Math.max(0, Number(cursorValue) || 0);
  const first = chunks[0];
  const reset = Boolean(first && requested < first.start);
  const effective = reset ? first.start : requested;
  let data = '';
  for (const chunk of chunks) {
    if (chunk.end <= effective) continue;
    data += effective > chunk.start ? chunk.data.slice(effective - chunk.start) : chunk.data;
  }
  return { data, cursor, reset, alive, exitCode };
};

spawnBridge();
pushOutput('\x1b[1;36mSulandra isolated Docker terminal ready.\x1b[0m\r\n');

app.get('/health', authorize, (_req, res) => res.json({ ok: true, pty: true, tmux: true, workspaceId, alive }));
app.get('/output', authorize, (req, res) => res.json(outputFrom(req.query.cursor)));
app.post('/input', authorize, (req, res) => {
  const data = typeof req.body?.data === 'string' ? req.body.data : '';
  if (!data || Buffer.byteLength(data) > 65_536) return res.status(400).json({ error: 'Terminal input must be between 1 and 65536 bytes' });
  ensureBridge();
  proc.write(data);
  res.json({ ok: true, cursor });
});
app.post('/resize', authorize, (req, res) => {
  ensureBridge();
  const cols = Math.max(40, Math.min(240, Number(req.body?.cols) || initialCols));
  const rows = Math.max(12, Math.min(80, Number(req.body?.rows) || initialRows));
  proc.resize(cols, rows);
  res.json({ ok: true, cols, rows });
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });
const makeBucket = () => ({ tokens: wsBurstBytes, updatedAt: Date.now() });
const consume = (bucket, bytes) => {
  const at = Date.now();
  const elapsed = Math.max(0, at - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(wsBurstBytes, bucket.tokens + elapsed * wsBytesPerSecond);
  bucket.updatedAt = at;
  if (bytes > bucket.tokens) return false;
  bucket.tokens -= bytes;
  return true;
};

server.on('upgrade', (req, socket, head) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch { socket.destroy(); return; }
  if (url.pathname !== '/ws' || !secureEquals(req.headers['x-sulandra-session-token'], sessionToken)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
});

wss.on('connection', socket => {
  const bucket = makeBucket();
  sockets.add(socket);
  ensureBridge();
  const snapshot = outputFrom(0);
  if (snapshot.data) socket.send(Buffer.from(snapshot.data, 'utf8'), { binary: true });
  socket.on('message', (data, isBinary) => {
    const bytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data));
    if (!consume(bucket, bytes)) {
      socket.close(1008, 'Terminal input rate limit exceeded');
      return;
    }
    ensureBridge();
    if (isBinary) {
      proc.write(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
      return;
    }
    try {
      const message = JSON.parse(String(data));
      if (message.type === 'resize') {
        const cols = Math.max(40, Math.min(240, Number(message.cols) || initialCols));
        const rows = Math.max(12, Math.min(80, Number(message.rows) || initialRows));
        proc.resize(cols, rows);
        socket.send(JSON.stringify({ type: 'resized', cols, rows }));
      }
    } catch {}
  });
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => sockets.delete(socket));
});

const heartbeat = setInterval(() => {
  for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) {
    try { socket.ping(); } catch {}
  }
}, 30_000);
heartbeat.unref?.();

server.listen(port, '0.0.0.0', () => {
  console.log(`Sulandra terminal session agent listening on 0.0.0.0:${port}`);
});
