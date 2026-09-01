import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { appendFile, mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
import pty from 'node-pty';
import { WebSocket, WebSocketServer } from 'ws';

const execFileAsync = promisify(execFile);
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

const port = Number(process.env.PORT || 9000);
const sessionToken = String(process.env.SESSION_TOKEN || '').trim();
const workspaceId = String(process.env.WORKSPACE_ID || '').trim();
const tmuxSession = String(process.env.TMUX_SESSION || 'sulandra').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
const tmuxConfigPath = '/home/terminal/.tmux.conf';
const initialCols = Math.max(40, Math.min(240, Number(process.env.TERMINAL_COLS || 120)));
const initialRows = Math.max(12, Math.min(80, Number(process.env.TERMINAL_ROWS || 32)));
const liveOutputLimit = Math.max(250_000, Number(process.env.TERMINAL_OUTPUT_LIMIT || 2_000_000));
const wsBytesPerSecond = Math.max(16_384, Number(process.env.TERMINAL_WS_BYTES_PER_SECOND || 262_144));
const wsBurstBytes = Math.max(wsBytesPerSecond, Number(process.env.TERMINAL_WS_BURST_BYTES || 524_288));
const historyDir = path.join('/workspace', '.sulandra-terminal-history');
const historyPath = path.join(historyDir, `${tmuxSession}.log`);
const historyPageDefault = 256 * 1024;
const historyPageMax = 1024 * 1024;

if (!sessionToken || sessionToken.length < 32) throw new Error('SESSION_TOKEN is required');
if (!workspaceId) throw new Error('WORKSPACE_ID is required');

await mkdir(historyDir, { recursive: true, mode: 0o700 });

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
let bridgeReady = false;
let exitCode = null;
let cursor = 0;
let bufferedChars = 0;
let currentCols = initialCols;
let currentRows = initialRows;
let reconcileBytes = 0;
let reconcileLines = 0;
const chunks = [];
const sockets = new Set();
let historyWrite = Promise.resolve();
let reconcileTimer = null;
let reconcileRunning = false;

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
  HISTCONTROL: '',
  HISTSIZE: '-1',
  HISTFILESIZE: '-1',
  EDITOR: 'vim',
  VISUAL: 'vim',
  PAGER: 'less',
  LESS: '-R',
  SULANDRA_TERMINAL_ISOLATED: '1',
  SULANDRA_TERMINAL_WORKSPACE: workspaceId,
  SULANDRA_TERMINAL_HISTORY_FILE: historyPath,
};

const broadcast = data => {
  const bytes = Buffer.from(String(data || ''), 'utf8');
  for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(bytes, { binary: true });
};

const normalizePaneSnapshot = raw => {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\r\n');
};

const capturePaneSnapshot = async () => {
  if (!alive || !proc) return '';
  try {
    const { stdout } = await execFileAsync('tmux', [
      '-f', tmuxConfigPath,
      'capture-pane', '-p', '-e', '-J', '-S', '-',
      '-t', `${tmuxSession}:0.0`,
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: shellEnv });
    return normalizePaneSnapshot(stdout);
  } catch (error) {
    console.error('[Sulandra Terminal] tmux capture-pane failed', error?.message || error);
    return '';
  }
};

const paneCommand = async () => {
  try {
    const { stdout } = await execFileAsync('tmux', ['-f', tmuxConfigPath, 'display-message', '-p', '-t', `${tmuxSession}:0.0`, '#{pane_current_command}'], { encoding: 'utf8', env: shellEnv });
    return String(stdout || '').trim().toLowerCase();
  } catch { return ''; }
};

const canonicalPayload = snapshot => Buffer.from(`\x1bc\x1b[?25h${snapshot}`, 'utf8');

const broadcastAuthoritativeSnapshot = async () => {
  if (reconcileRunning || !sockets.size || !alive) return;
  reconcileRunning = true;
  try {
    const command = await paneCommand();
    if (command && !['bash', 'sh', 'zsh', 'dash'].includes(command)) return;
    const snapshot = await capturePaneSnapshot();
    if (!snapshot) return;
    const payload = canonicalPayload(snapshot);
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.send(payload, { binary: true });
    reconcileBytes = 0;
    reconcileLines = 0;
  } finally {
    reconcileRunning = false;
  }
};

const scheduleAuthoritativeSnapshot = (force = false) => {
  if (!force && reconcileBytes < 32 * 1024 && reconcileLines < 120) return;
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void broadcastAuthoritativeSnapshot();
  }, 180);
  reconcileTimer.unref?.();
};

const persistOutput = text => {
  historyWrite = historyWrite
    .then(() => appendFile(historyPath, text, { encoding: 'utf8', mode: 0o600 }))
    .catch(error => console.error('[Sulandra Terminal] transcript append failed', error));
};

const pushOutput = data => {
  const text = String(data || '');
  if (!text) return;
  persistOutput(text);
  const start = cursor;
  cursor += text.length;
  chunks.push({ start, end: cursor, data: text });
  bufferedChars += text.length;
  reconcileBytes += Buffer.byteLength(text);
  reconcileLines += (text.match(/\n/g) || []).length;
  while (bufferedChars > liveOutputLimit && chunks.length > 1) {
    const removed = chunks.shift();
    bufferedChars -= removed.data.length;
  }
  broadcast(text);
  scheduleAuthoritativeSnapshot();
};

const spawnBridge = (cols = initialCols, rows = initialRows) => {
  const args = ['-f', tmuxConfigPath, 'new-session', '-A', '-s', tmuxSession, '/bin/bash', '--noprofile', '--rcfile', '/agent/bashrc', '-i'];
  bridgeReady = false;
  currentCols = Math.max(40, Math.min(240, Number(cols) || initialCols));
  currentRows = Math.max(12, Math.min(80, Number(rows) || initialRows));
  proc = pty.spawn('tmux', args, {
    name: 'xterm-256color',
    cols: currentCols,
    rows: currentRows,
    cwd: '/workspace',
    env: shellEnv,
  });
  alive = true;
  exitCode = null;
  proc.onData(data => {
    bridgeReady = true;
    pushOutput(data);
  });
  proc.onExit(event => {
    alive = false;
    bridgeReady = false;
    exitCode = event.exitCode;
    pushOutput(`\r\n[terminal bridge exited with code ${event.exitCode}; tmux session retained]\r\n`);
  });
};

const ensureBridge = () => {
  if (!alive || !proc) spawnBridge();
};

const resizeBridge = (colsValue, rowsValue) => {
  const cols = Math.max(40, Math.min(240, Number(colsValue) || initialCols));
  const rows = Math.max(12, Math.min(80, Number(rowsValue) || initialRows));
  if (cols === currentCols && rows === currentRows) return { cols, rows, changed: false };
  currentCols = cols;
  currentRows = rows;
  proc.resize(cols, rows);
  scheduleAuthoritativeSnapshot(true);
  return { cols, rows, changed: true };
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

const historyPage = async (beforeValue, limitValue) => {
  await historyWrite;
  const info = await stat(historyPath).catch(() => ({ size: 0 }));
  const size = Math.max(0, Number(info.size) || 0);
  const requestedBefore = beforeValue === undefined || beforeValue === null || beforeValue === '' ? size : Number(beforeValue);
  const end = Math.max(0, Math.min(size, Number.isFinite(requestedBefore) ? requestedBefore : size));
  const requestedLimit = Number(limitValue);
  const limit = Math.max(4096, Math.min(historyPageMax, Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : historyPageDefault));
  const start = Math.max(0, end - limit);
  if (end <= start) return { data: '', start, end, size, hasMore: start > 0 };
  const handle = await open(historyPath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(end - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    return { data: buffer.subarray(0, bytesRead).toString('utf8'), start, end: start + bytesRead, size, hasMore: start > 0 };
  } finally {
    await handle.close();
  }
};

spawnBridge();
pushOutput('\x1b[1;36mSulandra isolated Docker terminal ready.\x1b[0m\r\n');

app.get('/health', authorize, async (_req, res) => {
  await historyWrite;
  const info = await stat(historyPath).catch(() => ({ size: 0 }));
  if (!alive || !bridgeReady) {
    return res.status(503).json({ ok: false, pty: true, tmux: true, workspaceId, alive, ready: false, transcriptBytes: Number(info.size) || 0 });
  }
  res.json({ ok: true, pty: true, tmux: true, workspaceId, alive, ready: true, transcriptBytes: Number(info.size) || 0 });
});
app.get('/output', authorize, (req, res) => res.json(outputFrom(req.query.cursor)));
app.get('/snapshot', authorize, async (_req, res, next) => {
  try { res.json({ data: await capturePaneSnapshot(), alive, exitCode, cols: currentCols, rows: currentRows }); }
  catch (error) { next(error); }
});
app.get('/history', authorize, async (req, res, next) => {
  try {
    res.json(await historyPage(req.query.before, req.query.limit));
  } catch (error) { next(error); }
});
app.post('/input', authorize, (req, res) => {
  const data = typeof req.body?.data === 'string' ? req.body.data : '';
  if (!data || Buffer.byteLength(data) > 65_536) return res.status(400).json({ error: 'Terminal input must be between 1 and 65536 bytes' });
  ensureBridge();
  if (!bridgeReady) return res.status(503).json({ error: 'Terminal PTY is still starting' });
  proc.write(data);
  res.json({ ok: true, cursor });
});
app.post('/resize', authorize, (req, res) => {
  ensureBridge();
  if (!bridgeReady) return res.status(503).json({ error: 'Terminal PTY is still starting' });
  const result = resizeBridge(req.body?.cols, req.body?.rows);
  res.json({ ok: true, ...result });
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
  socket.on('message', (data, isBinary) => {
    const bytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data));
    if (!consume(bucket, bytes)) {
      socket.close(1008, 'Terminal input rate limit exceeded');
      return;
    }
    ensureBridge();
    if (!bridgeReady) {
      socket.close(1013, 'Terminal PTY is still starting');
      return;
    }
    if (isBinary) {
      proc.write(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
      return;
    }
    try {
      const message = JSON.parse(String(data));
      if (message.type === 'resize') {
        const result = resizeBridge(message.cols, message.rows);
        socket.send(JSON.stringify({ type: 'resized', ...result }));
      }
    } catch {}
  });
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => sockets.delete(socket));
  void (async () => {
    const snapshot = await capturePaneSnapshot();
    if (socket.readyState === WebSocket.OPEN && snapshot) socket.send(canonicalPayload(snapshot), { binary: true });
  })();
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