import crypto from 'node:crypto';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import express from 'express';
import pty from 'node-pty';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

const port = Number(process.env.PORT || 8080);
const authToken = String(process.env.TERMINAL_AUTH_TOKEN || '').trim();
const seedPath = path.resolve(process.env.TERMINAL_SEED_PATH || '/seed');
const workspaceRoot = path.resolve(process.env.TERMINAL_WORKSPACE_ROOT || '/workspaces');
const maxWorkspaces = Math.max(1, Math.min(12, Number(process.env.TERMINAL_MAX_WORKSPACES || 6)));
const maxSessionsPerWorkspace = Math.max(1, Math.min(12, Number(process.env.TERMINAL_MAX_SESSIONS_PER_WORKSPACE || 6)));
const idleMinutes = Math.max(15, Math.min(720, Number(process.env.TERMINAL_IDLE_MINUTES || 120)));
const outputLimit = Math.max(256_000, Math.min(8_000_000, Number(process.env.TERMINAL_OUTPUT_LIMIT || 2_000_000)));

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
if (!authToken) throw new Error('TERMINAL_AUTH_TOKEN is required');
await mkdir(workspaceRoot, { recursive: true });
await stat(seedPath);

const workspaces = new Map();
const sessions = new Map();

const now = () => Date.now();
const id = prefix => `${prefix}_${crypto.randomUUID()}`;
const ownerOf = req => String(req.header('x-sulandra-terminal-owner') || '').trim();
const safeEquals = (a, b) => {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
};

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'sulandra-coding-terminal-worker',
    isolation: 'dedicated-worker',
    workspaces: workspaces.size,
    sessions: sessions.size,
  });
});

app.use((req, res, next) => {
  if (!safeEquals(req.header('x-sulandra-terminal-token'), authToken)) {
    res.status(401).json({ error: 'Worker authentication required' });
    return;
  }
  if (!ownerOf(req)) {
    res.status(400).json({ error: 'Terminal owner context is required' });
    return;
  }
  next();
});

const getWorkspace = (req, workspaceId) => {
  const workspace = workspaces.get(workspaceId);
  if (!workspace || workspace.owner !== ownerOf(req)) return null;
  workspace.lastUsedAt = now();
  return workspace;
};

const getSession = (req, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session || session.owner !== ownerOf(req)) return null;
  session.lastUsedAt = now();
  const workspace = workspaces.get(session.workspaceId);
  if (workspace) workspace.lastUsedAt = now();
  return session;
};

const git = (cwd, args) => spawnSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: 'ignore',
  env: {
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: cwd,
    LANG: 'C.UTF-8',
  },
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
  const workspace = {
    id: workspaceId,
    owner,
    cwd,
    createdAt: now(),
    lastUsedAt: now(),
  };
  workspaces.set(workspaceId, workspace);
  return workspace;
};

const shellEnv = workspace => ({
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: workspace.cwd,
  SHELL: '/bin/bash',
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  FORCE_COLOR: '1',
  npm_config_color: 'always',
  SULANDRA_TERMINAL_ISOLATED: '1',
  SULANDRA_TERMINAL_WORKSPACE: workspace.id,
});

const createSession = (workspace, owner, cols = 120, rows = 32) => {
  const workspaceSessions = [...sessions.values()].filter(session => session.workspaceId === workspace.id && session.alive);
  if (workspaceSessions.length >= maxSessionsPerWorkspace) {
    throw Object.assign(new Error(`Terminal limit reached (${maxSessionsPerWorkspace})`), { status: 429 });
  }
  const sessionId = id('term');
  const process = pty.spawn('/bin/bash', ['--noprofile', '--norc'], {
    name: 'xterm-256color',
    cols: Math.max(40, Math.min(240, Number(cols) || 120)),
    rows: Math.max(12, Math.min(80, Number(rows) || 32)),
    cwd: workspace.cwd,
    env: shellEnv(workspace),
  });
  const session = {
    id: sessionId,
    workspaceId: workspace.id,
    owner,
    process,
    alive: true,
    exitCode: null,
    createdAt: now(),
    lastUsedAt: now(),
    cursor: 0,
    bufferedChars: 0,
    chunks: [],
  };
  const push = data => {
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
  };
  process.onData(push);
  process.onExit(event => {
    session.alive = false;
    session.exitCode = event.exitCode;
    push(`\r\n[terminal exited with code ${event.exitCode}]\r\n`);
  });
  sessions.set(sessionId, session);
  process.write("printf '\\033[1;36mSulandra isolated coding terminal ready.\\033[0m\\r\\n'\r");
  process.write("printf 'Workspace: %s\\r\\n' \"$PWD\"\r");
  return session;
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
  return {
    data,
    cursor: session.cursor,
    reset,
    alive: session.alive,
    exitCode: session.exitCode,
  };
};

const killSession = session => {
  if (!session) return;
  if (session.alive) {
    try { session.process.kill(); } catch {}
  }
  session.alive = false;
  sessions.delete(session.id);
};

const deleteWorkspace = async workspace => {
  for (const session of [...sessions.values()]) {
    if (session.workspaceId === workspace.id) killSession(session);
  }
  workspaces.delete(workspace.id);
  await rm(workspace.cwd, { recursive: true, force: true });
};

app.post('/workspaces', async (req, res, next) => {
  try {
    const workspace = await createWorkspace(ownerOf(req));
    res.status(201).json({
      workspaceId: workspace.id,
      cwd: workspace.cwd,
      isolated: true,
      branch: 'workbench',
    });
  } catch (error) { next(error); }
});

app.get('/workspaces/:workspaceId', (req, res) => {
  const workspace = getWorkspace(req, req.params.workspaceId);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  const activeSessions = [...sessions.values()].filter(session => session.workspaceId === workspace.id && session.alive).length;
  res.json({ workspaceId: workspace.id, cwd: workspace.cwd, activeSessions, isolated: true });
});

app.delete('/workspaces/:workspaceId', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    await deleteWorkspace(workspace);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/workspaces/:workspaceId/sessions', (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const session = createSession(workspace, ownerOf(req), req.body?.cols, req.body?.rows);
    res.status(201).json({
      sessionId: session.id,
      workspaceId: workspace.id,
      alive: true,
    });
  } catch (error) { next(error); }
});

app.get('/sessions/:sessionId/output', (req, res) => {
  const session = getSession(req, req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Terminal session not found' });
    return;
  }
  res.json(sessionOutput(session, req.query.cursor));
});

app.post('/sessions/:sessionId/input', (req, res) => {
  const session = getSession(req, req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Terminal session not found' });
    return;
  }
  if (!session.alive) {
    res.status(409).json({ error: 'Terminal session has exited' });
    return;
  }
  const data = typeof req.body?.data === 'string' ? req.body.data : '';
  if (!data || data.length > 65_536) {
    res.status(400).json({ error: 'Terminal input must be between 1 and 65536 characters' });
    return;
  }
  session.process.write(data);
  res.json({ ok: true, cursor: session.cursor });
});

app.post('/sessions/:sessionId/resize', (req, res) => {
  const session = getSession(req, req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Terminal session not found' });
    return;
  }
  const cols = Math.max(40, Math.min(240, Number(req.body?.cols) || 120));
  const rows = Math.max(12, Math.min(80, Number(req.body?.rows) || 32));
  try { session.process.resize(cols, rows); } catch {}
  res.json({ ok: true, cols, rows });
});

app.delete('/sessions/:sessionId', (req, res) => {
  const session = getSession(req, req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: 'Terminal session not found' });
    return;
  }
  killSession(session);
  res.json({ ok: true });
});

app.use((error, _req, res, _next) => {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error('[terminal-worker]', error);
  res.status(status).json({ error: String(error?.message || 'Terminal worker error') });
});

setInterval(async () => {
  const cutoff = now() - idleMinutes * 60_000;
  for (const session of [...sessions.values()]) {
    if (session.lastUsedAt < cutoff) killSession(session);
  }
  for (const workspace of [...workspaces.values()]) {
    const active = [...sessions.values()].some(session => session.workspaceId === workspace.id && session.alive);
    if (!active && workspace.lastUsedAt < cutoff) {
      try { await deleteWorkspace(workspace); } catch (error) { console.warn('[terminal-worker] cleanup failed', error); }
    }
  }
}, 60_000).unref();

app.listen(port, '0.0.0.0', () => {
  console.log(`Sulandra coding terminal worker listening on 0.0.0.0:${port}`);
});
