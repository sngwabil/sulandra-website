import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import express from 'express';
import jwt from 'jsonwebtoken';
import pty from 'node-pty';
import Docker from 'dockerode';
import { WebSocket, WebSocketServer } from 'ws';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

const port = Number(process.env.PORT || 8080);
const authToken = String(process.env.TERMINAL_AUTH_TOKEN || '').trim();
const seedPath = path.resolve(process.env.TERMINAL_SEED_PATH || '/seed');
const workspaceRoot = path.resolve(process.env.TERMINAL_WORKSPACE_ROOT || '/workspaces');
const outputLimit = Math.max(250_000, Number(process.env.TERMINAL_OUTPUT_LIMIT || 2_000_000));
const maxWorkspaces = Math.max(1, Number(process.env.TERMINAL_MAX_WORKSPACES_PER_OWNER || 4));
const maxSessionsPerWorkspace = Math.max(1, Number(process.env.TERMINAL_MAX_SESSIONS_PER_WORKSPACE || 6));
const idleMinutes = Math.max(1, Number(process.env.TERMINAL_IDLE_MINUTES || 15));
const idleMs = idleMinutes * 60_000;
const wsBytesPerSecond = Math.max(16_384, Number(process.env.TERMINAL_WS_BYTES_PER_SECOND || 262_144));
const wsBurstBytes = Math.max(wsBytesPerSecond, Number(process.env.TERMINAL_WS_BURST_BYTES || 524_288));
const wsAuthProvider = String(process.env.TERMINAL_WS_AUTH_PROVIDER || 'sulandra').trim().toLowerCase();
const jwtSecret = String(process.env.JWT_SECRET || '').trim();
const firebaseProjectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const isolationProvider = String(process.env.TERMINAL_ISOLATION_PROVIDER || 'railway').trim().toLowerCase();
const dockerSocketPath = String(process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock').trim();

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
if (!authToken) throw new Error('TERMINAL_AUTH_TOKEN is required');
if (!['sulandra', 'firebase'].includes(wsAuthProvider)) throw new Error('TERMINAL_WS_AUTH_PROVIDER must be sulandra or firebase');
if (wsAuthProvider === 'sulandra' && !jwtSecret) throw new Error('JWT_SECRET is required for Sulandra WebSocket authentication');
if (wsAuthProvider === 'firebase' && !firebaseProjectId) throw new Error('FIREBASE_PROJECT_ID is required for Firebase WebSocket authentication');
if (!['railway', 'docker'].includes(isolationProvider)) throw new Error('TERMINAL_ISOLATION_PROVIDER must be railway or docker');

const workspaces = new Map();
const sessions = new Map();
const now = () => Date.now();
const id = prefix => `${prefix}_${crypto.randomUUID()}`;
const safeTmuxName = value => `sulandra_${String(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}`;
const allowedRoles = new Set(['ADMINISTRATOR', 'CEO', 'COO']);

let dockerReady = false;
let dockerError = '';
const docker = isolationProvider === 'docker' ? new Docker({ socketPath: dockerSocketPath }) : null;
if (docker) {
  try {
    await docker.ping();
    dockerReady = true;
  } catch (error) {
    dockerError = error instanceof Error ? error.message : String(error);
  }
  if (!dockerReady) {
    throw new Error(`Docker isolation was requested but no usable Docker daemon is available at ${dockerSocketPath}: ${dockerError}`);
  }
}

if (wsAuthProvider === 'firebase' && !getApps().length) initializeApp({ projectId: firebaseProjectId });

const secureEquals = (provided, configured) => {
  if (!provided || !configured) return false;
  const left = Buffer.from(String(provided));
  const right = Buffer.from(String(configured));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const ownerOf = req => String(req.header('x-sulandra-terminal-owner') || '').trim();
const authenticateInternal = (req, res, next) => {
  if (!secureEquals(req.header('x-sulandra-terminal-token'), authToken)) {
    res.status(401).json({ error: 'Unauthorized terminal worker request' });
    return;
  }
  if (!ownerOf(req)) {
    res.status(400).json({ error: 'Terminal owner is required' });
    return;
  }
  next();
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    isolated: true,
    isolationProvider,
    dockerReady,
    websocket: true,
    websocketAuthProvider: wsAuthProvider,
    tmux: true,
    idleMinutes,
    rateLimit: { bytesPerSecond: wsBytesPerSecond, burstBytes: wsBurstBytes },
  });
});
app.use(authenticateInternal);

const getWorkspace = (req, workspaceId) => {
  const workspace = workspaces.get(workspaceId);
  return workspace && workspace.owner === ownerOf(req) ? workspace : null;
};
const getSession = (req, sessionId) => {
  const session = sessions.get(sessionId);
  return session && session.owner === ownerOf(req) ? session : null;
};

const git = (cwd, args) => spawnSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: 'ignore',
  env: { ...process.env, HOME: cwd, LANG: 'C.UTF-8' },
});
const initializeLocalGit = cwd => {
  git(cwd, ['init', '-b', 'workbench']);
  git(cwd, ['config', 'user.name', 'Sulandra Terminal']);
  git(cwd, ['config', 'user.email', 'terminal@sulandra.local']);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', 'Isolated terminal workspace baseline', '--no-gpg-sign']);
};

const createWorkspace = async owner => {
  const owned = [...workspaces.values()].filter(workspace => workspace.owner === owner);
  if (owned.length >= maxWorkspaces) throw Object.assign(new Error(`Workspace limit reached (${maxWorkspaces})`), { status: 429 });
  const workspaceId = id('ws');
  const cwd = path.join(workspaceRoot, workspaceId);
  await mkdir(cwd, { recursive: true });
  await cp(seedPath, cwd, {
    recursive: true,
    force: true,
    filter(source) {
      const relative = path.relative(seedPath, source);
      if (!relative) return true;
      const parts = relative.split(path.sep);
      return !parts.some(part => part === 'node_modules' || part === '.git' || part === 'dist-web' || part === 'coverage');
    },
  });
  initializeLocalGit(cwd);
  const workspace = { id: workspaceId, owner, cwd, createdAt: now(), lastUsedAt: now() };
  workspaces.set(workspaceId, workspace);
  return workspace;
};

const shellEnv = workspace => ({
  ...process.env,
  HOME: workspace.cwd,
  SHELL: '/bin/bash',
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  FORCE_COLOR: '1',
  npm_config_color: 'always',
  PS1: '\\[\\033[1;32m\\]sulandra\\[\\033[0m\\]:\\w\\$ ',
  HISTFILE: path.join(workspace.cwd, '.bash_history'),
  HISTCONTROL: 'ignoredups:erasedups',
  HISTSIZE: '5000',
  HISTFILESIZE: '10000',
  EDITOR: 'vim',
  VISUAL: 'vim',
  PAGER: 'less',
  LESS: '-R',
  SULANDRA_TERMINAL_ISOLATED: '1',
  SULANDRA_TERMINAL_WORKSPACE: workspace.id,
});

const broadcast = (session, text) => {
  const bytes = Buffer.from(String(text || ''), 'utf8');
  for (const socket of session.connections) {
    if (socket.readyState === WebSocket.OPEN) socket.send(bytes, { binary: true });
  }
};
const pushOutput = (session, data) => {
  const text = String(data || '');
  if (!text) return;
  const start = session.cursor;
  session.cursor += text.length;
  session.chunks.push({ start, end: session.cursor, data: text });
  session.bufferedChars += text.length;
  while (session.bufferedChars > outputLimit && session.chunks.length > 1) {
    const removed = session.chunks.shift();
    session.bufferedChars -= removed.data.length;
  }
  session.lastUsedAt = now();
  broadcast(session, text);
};

const spawnBridge = (session, workspace, cols = 120, rows = 32) => {
  const args = ['new-session', '-A', '-s', session.tmuxName, '/bin/bash', '--noprofile', '--norc', '-i'];
  const proc = pty.spawn('tmux', args, {
    name: 'xterm-256color',
    cols: Math.max(40, Math.min(240, Number(cols) || 120)),
    rows: Math.max(12, Math.min(80, Number(rows) || 32)),
    cwd: workspace.cwd,
    env: shellEnv(workspace),
  });
  session.process = proc;
  session.alive = true;
  session.exitCode = null;
  proc.onData(data => pushOutput(session, data));
  proc.onExit(event => {
    session.alive = false;
    session.exitCode = event.exitCode;
    pushOutput(session, `\r\n[terminal bridge exited with code ${event.exitCode}; tmux session retained for reconnect]\r\n`);
  });
};

const createSession = (workspace, owner, cols = 120, rows = 32) => {
  const active = [...sessions.values()].filter(session => session.workspaceId === workspace.id);
  if (active.length >= maxSessionsPerWorkspace) throw Object.assign(new Error(`Terminal limit reached (${maxSessionsPerWorkspace})`), { status: 429 });
  const sessionId = id('term');
  const session = {
    id: sessionId,
    workspaceId: workspace.id,
    owner,
    tmuxName: safeTmuxName(sessionId),
    process: null,
    alive: false,
    exitCode: null,
    createdAt: now(),
    lastUsedAt: now(),
    disconnectedAt: now(),
    cursor: 0,
    bufferedChars: 0,
    chunks: [],
    connections: new Set(),
  };
  sessions.set(sessionId, session);
  spawnBridge(session, workspace, cols, rows);
  pushOutput(session, '\x1b[1;36mSulandra isolated coding terminal ready.\x1b[0m\r\n');
  pushOutput(session, `Workspace: ${workspace.cwd}\r\n`);
  return session;
};

const ensureBridge = session => {
  if (session.alive) return;
  const workspace = workspaces.get(session.workspaceId);
  if (!workspace) throw new Error('Terminal workspace no longer exists');
  spawnBridge(session, workspace);
};

const sessionOutput = (session, cursorValue) => {
  const cursor = Math.max(0, Number(cursorValue) || 0);
  const first = session.chunks[0];
  const reset = Boolean(first && cursor < first.start);
  const effectiveCursor = reset ? first.start : cursor;
  let data = '';
  for (const chunk of session.chunks) {
    if (chunk.end <= effectiveCursor) continue;
    if (effectiveCursor > chunk.start) data += chunk.data.slice(effectiveCursor - chunk.start);
    else data += chunk.data;
  }
  return { data, cursor: session.cursor, reset, alive: session.alive, exitCode: session.exitCode };
};

const killSession = session => {
  if (!session) return;
  for (const socket of session.connections) {
    try { socket.close(1001, 'Terminal session closed'); } catch {}
  }
  session.connections.clear();
  if (session.process) {
    try { session.process.kill(); } catch {}
  }
  spawnSync('tmux', ['kill-session', '-t', session.tmuxName], { stdio: 'ignore' });
  sessions.delete(session.id);
};
const deleteWorkspace = async workspace => {
  for (const session of [...sessions.values()]) if (session.workspaceId === workspace.id) killSession(session);
  workspaces.delete(workspace.id);
  await rm(workspace.cwd, { recursive: true, force: true });
};

app.post('/workspaces', async (req, res, next) => {
  try {
    const workspace = await createWorkspace(ownerOf(req));
    res.status(201).json({ workspaceId: workspace.id, cwd: workspace.cwd, isolated: true, branch: 'workbench', isolationProvider });
  } catch (error) { next(error); }
});
app.get('/workspaces/:workspaceId', (req, res) => {
  const workspace = getWorkspace(req, req.params.workspaceId);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  workspace.lastUsedAt = now();
  const activeSessions = [...sessions.values()].filter(session => session.workspaceId === workspace.id).length;
  res.json({ workspaceId: workspace.id, cwd: workspace.cwd, activeSessions, isolated: true, isolationProvider });
});
app.delete('/workspaces/:workspaceId', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    await deleteWorkspace(workspace);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.post('/workspaces/:workspaceId/sessions', (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    workspace.lastUsedAt = now();
    const session = createSession(workspace, ownerOf(req), req.body?.cols, req.body?.rows);
    res.status(201).json({ sessionId: session.id, workspaceId: workspace.id, alive: true, websocketPath: `/ws/sessions/${session.id}` });
  } catch (error) { next(error); }
});
app.get('/sessions/:sessionId/output', (req, res) => {
  const session = getSession(req, req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Terminal session not found' });
  session.lastUsedAt = now();
  res.json(sessionOutput(session, req.query.cursor));
});
app.post('/sessions/:sessionId/input', (req, res) => {
  const session = getSession(req, req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Terminal session not found' });
  const data = typeof req.body?.data === 'string' ? req.body.data : '';
  if (!data || Buffer.byteLength(data) > 65_536) return res.status(400).json({ error: 'Terminal input must be between 1 and 65536 bytes' });
  ensureBridge(session);
  session.process.write(data);
  session.lastUsedAt = now();
  res.json({ ok: true, cursor: session.cursor });
});
app.post('/sessions/:sessionId/resize', (req, res) => {
  const session = getSession(req, req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Terminal session not found' });
  ensureBridge(session);
  const cols = Math.max(40, Math.min(240, Number(req.body?.cols) || 120));
  const rows = Math.max(12, Math.min(80, Number(req.body?.rows) || 32));
  try { session.process.resize(cols, rows); } catch {}
  session.lastUsedAt = now();
  res.json({ ok: true, cols, rows, sigwinch: true });
});
app.delete('/sessions/:sessionId', (req, res) => {
  const session = getSession(req, req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Terminal session not found' });
  killSession(session);
  res.json({ ok: true });
});

app.use((error, _req, res, _next) => {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: error instanceof Error ? error.message : 'Terminal worker error' });
});

const decodeProtocolToken = value => {
  const protocol = String(value || '').split(',').map(item => item.trim()).find(item => item.startsWith('auth.'));
  if (!protocol) return '';
  try { return Buffer.from(protocol.slice(5), 'base64url').toString('utf8'); } catch { return ''; }
};
const authenticatePublicToken = async token => {
  if (!token) return null;
  if (wsAuthProvider === 'firebase') {
    try {
      const decoded = await getAuth().verifyIdToken(token, true);
      const role = String(decoded.role || '');
      const organizationId = String(decoded.organizationId || '');
      if (!decoded.uid || !organizationId || !allowedRoles.has(role)) return null;
      return { userId: decoded.uid, organizationId, role, owner: `${organizationId}:${decoded.uid}` };
    } catch { return null; }
  }
  try {
    const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') return null;
    const userId = String(decoded.sub || '');
    const organizationId = String(decoded.organizationId || '');
    const role = String(decoded.role || '');
    if (!userId || !organizationId || !allowedRoles.has(role)) return null;
    return { userId, organizationId, role, owner: `${organizationId}:${userId}` };
  } catch { return null; }
};

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: Math.max(wsBurstBytes, 1_048_576) });
const tokenBucket = () => ({ tokens: wsBurstBytes, updatedAt: now() });
const consumeTokens = (bucket, size) => {
  const current = now();
  const elapsed = Math.max(0, current - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(wsBurstBytes, bucket.tokens + elapsed * wsBytesPerSecond);
  bucket.updatedAt = current;
  if (size > bucket.tokens) return false;
  bucket.tokens -= size;
  return true;
};

wss.on('connection', (socket, request, context) => {
  const { session } = context;
  const bucket = tokenBucket();
  session.connections.add(socket);
  session.disconnectedAt = null;
  session.lastUsedAt = now();
  ensureBridge(session);

  socket.binaryType = 'arraybuffer';
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', (payload, isBinary) => {
    const size = Buffer.byteLength(payload);
    if (!consumeTokens(bucket, size)) {
      socket.close(1008, 'Terminal input rate limit exceeded');
      return;
    }
    session.lastUsedAt = now();
    if (isBinary) {
      ensureBridge(session);
      session.process.write(Buffer.from(payload).toString('utf8'));
      return;
    }
    let message;
    try { message = JSON.parse(Buffer.from(payload).toString('utf8')); } catch { return; }
    if (message?.type === 'resize') {
      const cols = Math.max(40, Math.min(240, Number(message.cols) || 120));
      const rows = Math.max(12, Math.min(80, Number(message.rows) || 32));
      ensureBridge(session);
      try { session.process.resize(cols, rows); } catch {}
      socket.send(JSON.stringify({ type: 'resized', cols, rows, sigwinch: true }));
    } else if (message?.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', at: now() }));
    }
  });
  socket.on('close', () => {
    session.connections.delete(socket);
    if (!session.connections.size) session.disconnectedAt = now();
  });
  socket.on('error', () => {});
});

const server = createServer(app);
server.on('upgrade', async (request, socket, head) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const match = url.pathname.match(/^\/ws\/sessions\/([A-Za-z0-9_-]+)$/);
    if (!match) { socket.destroy(); return; }
    const auth = await authenticatePublicToken(decodeProtocolToken(request.headers['sec-websocket-protocol']));
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const session = sessions.get(match[1]);
    if (!session || session.owner !== auth.owner) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws, request, { session, auth });
    });
  } catch {
    socket.destroy();
  }
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) { socket.terminate(); continue; }
    socket.isAlive = false;
    try { socket.ping(); } catch {}
  }
}, 30_000);
heartbeat.unref?.();

const reaper = setInterval(async () => {
  const cutoff = now() - idleMs;
  for (const session of [...sessions.values()]) {
    if (session.connections.size) continue;
    const disconnectedAt = session.disconnectedAt ?? session.lastUsedAt;
    if (disconnectedAt < cutoff) killSession(session);
  }
  for (const workspace of [...workspaces.values()]) {
    const hasSessions = [...sessions.values()].some(session => session.workspaceId === workspace.id);
    if (!hasSessions && workspace.lastUsedAt < cutoff) await deleteWorkspace(workspace);
  }
}, 60_000);
reaper.unref?.();

await mkdir(workspaceRoot, { recursive: true });
try { await stat(seedPath); } catch { throw new Error(`Terminal seed path does not exist: ${seedPath}`); }

server.listen(port, '0.0.0.0', () => {
  console.log(`Sulandra coding terminal worker listening on 0.0.0.0:${port} (WebSocket PTY, tmux persistence, ${idleMinutes}m reaper)`);
});

const shutdown = async signal => {
  console.log(`Received ${signal}; closing terminal worker.`);
  clearInterval(heartbeat);
  clearInterval(reaper);
  for (const session of [...sessions.values()]) killSession(session);
  await new Promise(resolve => server.close(resolve));
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
