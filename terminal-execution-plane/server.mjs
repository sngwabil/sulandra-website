import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import Docker from 'dockerode';
import { WebSocket, WebSocketServer } from 'ws';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

const port = Number(process.env.PORT || 8081);
const executionToken = String(process.env.TERMINAL_EXECUTION_TOKEN || '').trim();
const dockerSocketPath = String(process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock').trim();
const sessionImage = String(process.env.TERMINAL_SESSION_IMAGE || 'sulandra-terminal-session:latest').trim();
const seedPath = path.resolve(process.env.TERMINAL_SEED_PATH || '/seed');
const workspaceRoot = path.resolve(process.env.TERMINAL_WORKSPACE_ROOT || '/workspaces');
const workspaceHostRoot = path.resolve(process.env.TERMINAL_WORKSPACE_HOST_ROOT || '/srv/sulandra-terminal/workspaces');
const stateRoot = path.resolve(process.env.TERMINAL_STATE_ROOT || '/state');
const networkName = String(process.env.TERMINAL_DOCKER_NETWORK || 'sulandra-terminal-internal').trim();
const idleMinutes = Math.max(1, Number(process.env.TERMINAL_IDLE_MINUTES || 15));
const idleMs = idleMinutes * 60_000;
const memoryBytes = Math.max(128 * 1024 * 1024, Number(process.env.TERMINAL_MEMORY_BYTES || 536_870_912));
const nanoCpus = Math.max(100_000_000, Number(process.env.TERMINAL_NANO_CPUS || 500_000_000));
const pidsLimit = Math.max(64, Number(process.env.TERMINAL_PIDS_LIMIT || 256));
const maxWorkspacesPerOwner = Math.max(1, Number(process.env.TERMINAL_MAX_WORKSPACES_PER_OWNER || 4));
const maxSessionsPerWorkspace = Math.max(1, Number(process.env.TERMINAL_MAX_SESSIONS_PER_WORKSPACE || 6));
const agentPort = Math.max(1, Number(process.env.TERMINAL_AGENT_PORT || 9000));

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
if (!executionToken || executionToken.length < 32) throw new Error('TERMINAL_EXECUTION_TOKEN must be at least 32 characters');

await mkdir(workspaceRoot, { recursive: true });
await mkdir(stateRoot, { recursive: true });

const docker = new Docker({ socketPath: dockerSocketPath });
await docker.ping();

const now = () => Date.now();
const id = prefix => `${prefix}_${crypto.randomUUID()}`;
const secureEquals = (provided, configured) => {
  if (!provided || !configured) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(configured));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const bearer = req => {
  const value = String(req.headers.authorization || '').trim();
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
};
const ownerOf = req => String(req.header('x-sulandra-terminal-owner') || '').trim();
const authorize = (req, res, next) => {
  if (!secureEquals(bearer(req), executionToken)) return res.status(401).json({ error: 'Unauthorized execution-plane request' });
  if (req.path !== '/healthz' && !ownerOf(req)) return res.status(400).json({ error: 'Terminal owner is required' });
  next();
};

const workspaces = new Map();
const sessions = new Map();
const workspaceMetaPath = workspaceId => path.join(stateRoot, `workspace-${workspaceId}.json`);

const saveWorkspace = async workspace => {
  await writeFile(workspaceMetaPath(workspace.id), JSON.stringify({
    id: workspace.id,
    owner: workspace.owner,
    cwd: workspace.cwd,
    hostCwd: workspace.hostCwd,
    createdAt: workspace.createdAt,
    lastUsedAt: workspace.lastUsedAt,
  }), { mode: 0o600 });
};

const loadWorkspaces = async () => {
  for (const name of await readdir(stateRoot).catch(() => [])) {
    if (!/^workspace-[A-Za-z0-9_-]+\.json$/.test(name)) continue;
    try {
      const data = JSON.parse(await readFile(path.join(stateRoot, name), 'utf8'));
      if (data?.id && data?.owner && data?.cwd && data?.hostCwd) workspaces.set(data.id, data);
    } catch {}
  }
};

const listTerminalContainers = async () => docker.listContainers({
  all: true,
  filters: { label: ['com.sulandra.terminal=true'] },
});

const containerEnvValue = (inspect, key) => {
  const prefix = `${key}=`;
  return (inspect.Config?.Env || []).find(value => value.startsWith(prefix))?.slice(prefix.length) || '';
};

const reconcileSessions = async () => {
  for (const item of await listTerminalContainers()) {
    const container = docker.getContainer(item.Id);
    try {
      const inspect = await container.inspect();
      const labels = inspect.Config?.Labels || {};
      const sessionId = labels['com.sulandra.session-id'];
      const workspaceId = labels['com.sulandra.workspace-id'];
      const owner = labels['com.sulandra.owner'];
      const agentToken = containerEnvValue(inspect, 'SESSION_TOKEN');
      if (!sessionId || !workspaceId || !owner || !agentToken) continue;
      sessions.set(sessionId, {
        id: sessionId,
        workspaceId,
        owner,
        containerId: item.Id,
        agentToken,
        createdAt: Number(labels['com.sulandra.created-at']) || now(),
        lastUsedAt: now(),
        disconnectedAt: now(),
        connections: 0,
      });
    } catch {}
  }
};

await loadWorkspaces();
await reconcileSessions();

const getWorkspace = (req, workspaceId) => {
  const workspace = workspaces.get(workspaceId);
  return workspace && workspace.owner === ownerOf(req) ? workspace : null;
};
const getSession = (req, sessionId) => {
  const session = sessions.get(sessionId);
  return session && session.owner === ownerOf(req) ? session : null;
};

const createWorkspace = async owner => {
  const owned = [...workspaces.values()].filter(item => item.owner === owner);
  if (owned.length >= maxWorkspacesPerOwner) {
    const error = new Error(`Workspace limit reached (${maxWorkspacesPerOwner})`);
    error.status = 429;
    throw error;
  }
  const workspaceId = id('ws');
  const cwd = path.join(workspaceRoot, workspaceId);
  const hostCwd = path.join(workspaceHostRoot, workspaceId);
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  await cp(seedPath, cwd, {
    recursive: true,
    force: true,
    filter(source) {
      const relative = path.relative(seedPath, source);
      if (!relative) return true;
      const parts = relative.split(path.sep);
      return !parts.some(part => ['.git', 'node_modules', 'dist-web', 'coverage'].includes(part));
    },
  });
  const workspace = { id: workspaceId, owner, cwd, hostCwd, createdAt: now(), lastUsedAt: now() };
  workspaces.set(workspaceId, workspace);
  await saveWorkspace(workspace);
  return workspace;
};

const findContainerAddress = async container => {
  const inspect = await container.inspect();
  const network = inspect.NetworkSettings?.Networks?.[networkName];
  const address = network?.IPAddress || '';
  if (!address) throw new Error(`Terminal session container has no address on ${networkName}`);
  return address;
};

const agentUrl = async (session, pathname = '') => {
  const container = docker.getContainer(session.containerId);
  const address = await findContainerAddress(container);
  return `http://${address}:${agentPort}${pathname}`;
};

const waitForAgent = async session => {
  let lastError = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(await agentUrl(session, '/health'), {
        headers: { 'x-sulandra-session-token': session.agentToken },
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
      lastError = new Error(`Agent health returned ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw lastError || new Error('Terminal session agent did not become ready');
};

const createSession = async (workspace, owner, cols, rows) => {
  const active = [...sessions.values()].filter(item => item.workspaceId === workspace.id);
  if (active.length >= maxSessionsPerWorkspace) {
    const error = new Error(`Terminal limit reached (${maxSessionsPerWorkspace})`);
    error.status = 429;
    throw error;
  }
  const sessionId = id('term');
  const sessionToken = crypto.randomBytes(32).toString('base64url');
  const createdAt = now();
  const container = await docker.createContainer({
    Image: sessionImage,
    name: `sulandra-${sessionId}`,
    Env: [
      `SESSION_TOKEN=${sessionToken}`,
      `WORKSPACE_ID=${workspace.id}`,
      `TMUX_SESSION=${sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}`,
      `TERMINAL_COLS=${Math.max(40, Math.min(240, Number(cols) || 120))}`,
      `TERMINAL_ROWS=${Math.max(12, Math.min(80, Number(rows) || 32))}`,
      `PORT=${agentPort}`,
    ],
    Labels: {
      'com.sulandra.terminal': 'true',
      'com.sulandra.session-id': sessionId,
      'com.sulandra.workspace-id': workspace.id,
      'com.sulandra.owner': owner,
      'com.sulandra.created-at': String(createdAt),
    },
    ExposedPorts: { [`${agentPort}/tcp`]: {} },
    WorkingDir: '/workspace',
    HostConfig: {
      Memory: memoryBytes,
      MemorySwap: memoryBytes,
      NanoCpus: nanoCpus,
      PidsLimit: pidsLimit,
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      NetworkMode: networkName,
      Binds: [`${workspace.hostCwd}:/workspace:rw`],
      Tmpfs: {
        '/tmp': 'rw,noexec,nosuid,nodev,size=64m,mode=1777',
        '/run': 'rw,noexec,nosuid,nodev,size=16m,mode=755',
        '/home/terminal': 'rw,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=700',
      },
      RestartPolicy: { Name: 'no' },
    },
  });

  const session = {
    id: sessionId,
    workspaceId: workspace.id,
    owner,
    containerId: container.id,
    agentToken: sessionToken,
    createdAt,
    lastUsedAt: createdAt,
    disconnectedAt: createdAt,
    connections: 0,
  };
  sessions.set(sessionId, session);
  try {
    await container.start();
    await waitForAgent(session);
  } catch (error) {
    sessions.delete(sessionId);
    try { await container.remove({ force: true }); } catch {}
    throw error;
  }
  return session;
};

const destroySession = async session => {
  if (!session) return;
  sessions.delete(session.id);
  try { await docker.getContainer(session.containerId).remove({ force: true }); } catch {}
};

const destroyWorkspace = async workspace => {
  for (const session of [...sessions.values()]) {
    if (session.workspaceId === workspace.id) await destroySession(session);
  }
  workspaces.delete(workspace.id);
  await rm(workspace.cwd, { recursive: true, force: true });
  await rm(workspaceMetaPath(workspace.id), { force: true });
};

const agentRequest = async (session, pathname, options = {}) => {
  const response = await fetch(await agentUrl(session, pathname), {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-sulandra-session-token': session.agentToken,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(Math.max(1_000, options.timeoutMs || 10_000)),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 2_000) }; }
  }
  if (!response.ok) {
    const error = new Error(payload.error || `Terminal session agent failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
};

app.use(authorize);
app.get('/healthz', async (_req, res) => {
  try {
    await docker.ping();
    res.json({
      ok: true,
      docker: true,
      isolation: 'container-per-session',
      sessionImage,
      cgroups: { memoryBytes, nanoCpus, pidsLimit },
      idleMinutes,
    });
  } catch (error) {
    res.status(503).json({ ok: false, docker: false, error: error.message });
  }
});
app.post('/v1/workspaces', async (req, res, next) => {
  try {
    const workspace = await createWorkspace(ownerOf(req));
    res.status(201).json({ workspaceId: workspace.id, cwd: '/workspace', isolated: true, branch: 'workbench', isolationProvider: 'docker' });
  } catch (error) { next(error); }
});
app.get('/v1/workspaces/:workspaceId', (req, res) => {
  const workspace = getWorkspace(req, req.params.workspaceId);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  workspace.lastUsedAt = now(); void saveWorkspace(workspace);
  const activeSessions = [...sessions.values()].filter(item => item.workspaceId === workspace.id).length;
  res.json({ workspaceId: workspace.id, cwd: '/workspace', activeSessions, isolated: true, isolationProvider: 'docker' });
});
app.delete('/v1/workspaces/:workspaceId', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    await destroyWorkspace(workspace);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/sessions', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    workspace.lastUsedAt = now(); void saveWorkspace(workspace);
    const session = await createSession(workspace, ownerOf(req), req.body?.cols, req.body?.rows);
    res.status(201).json({
      sessionId: session.id,
      workspaceId: workspace.id,
      alive: true,
      websocketPath: `/v1/ws/sessions/${session.id}`,
      isolationProvider: 'docker',
    });
  } catch (error) { next(error); }
});
app.get('/v1/sessions/:sessionId/output', async (req, res, next) => {
  try {
    const session = getSession(req, req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Terminal session not found' });
    session.lastUsedAt = now();
    res.json(await agentRequest(session, `/output?cursor=${Math.max(0, Math.trunc(Number(req.query.cursor) || 0))}`));
  } catch (error) { next(error); }
});
app.post('/v1/sessions/:sessionId/input', async (req, res, next) => {
  try {
    const session = getSession(req, req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Terminal session not found' });
    session.lastUsedAt = now();
    res.json(await agentRequest(session, '/input', { method: 'POST', body: { data: req.body?.data } }));
  } catch (error) { next(error); }
});
app.post('/v1/sessions/:sessionId/resize', async (req, res, next) => {
  try {
    const session = getSession(req, req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Terminal session not found' });
    session.lastUsedAt = now();
    res.json(await agentRequest(session, '/resize', { method: 'POST', body: { cols: req.body?.cols, rows: req.body?.rows } }));
  } catch (error) { next(error); }
});
app.delete('/v1/sessions/:sessionId', async (req, res, next) => {
  try {
    const session = getSession(req, req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Terminal session not found' });
    await destroySession(session);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error('[terminal-executor]', error);
  res.status(status).json({ error: error?.message || 'Terminal execution-plane failure' });
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });

server.on('upgrade', async (req, socket, head) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch { socket.destroy(); return; }
  const match = url.pathname.match(/^\/v1\/ws\/sessions\/([A-Za-z0-9_-]+)$/);
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const owner = String(req.headers['x-sulandra-terminal-owner'] || '').trim();
  if (!match || !secureEquals(token, executionToken) || !owner) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const session = sessions.get(match[1]);
  if (!session || session.owner !== owner) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  req.sulandraSession = session;
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', (gateway, req) => {
  const session = req.sulandraSession;
  session.connections += 1;
  session.disconnectedAt = null;
  session.lastUsedAt = now();

  const pendingFrames = [];
  let pendingBytes = 0;
  const maxPendingBytes = 65_536;
  let agent = null;
  let gatewayClosed = false;

  const close = (code = 1011, reason = 'Terminal session proxy closed') => {
    if (gateway.readyState === WebSocket.OPEN || gateway.readyState === WebSocket.CONNECTING) {
      try { gateway.close(code, reason); } catch {}
    }
    if (agent && (agent.readyState === WebSocket.OPEN || agent.readyState === WebSocket.CONNECTING)) {
      try { agent.close(code, reason); } catch {}
    }
  };

  gateway.on('message', (data, isBinary) => {
    session.lastUsedAt = now();
    const bytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data));
    if (agent?.readyState === WebSocket.OPEN) {
      agent.send(data, { binary: isBinary });
      return;
    }
    if (pendingBytes + bytes > maxPendingBytes) {
      close(1008, 'Terminal startup input buffer exceeded');
      return;
    }
    pendingFrames.push({ data: isBinary ? Buffer.from(data) : String(data), isBinary });
    pendingBytes += bytes;
  });

  gateway.on('error', () => close(1011, 'Gateway WSS error'));
  gateway.on('close', () => {
    gatewayClosed = true;
    pendingFrames.length = 0;
    pendingBytes = 0;
    if (agent && (agent.readyState === WebSocket.OPEN || agent.readyState === WebSocket.CONNECTING)) {
      agent.close(1000, 'Gateway disconnected');
    }
    session.connections = Math.max(0, session.connections - 1);
    if (session.connections === 0) session.disconnectedAt = now();
  });

  void (async () => {
    try {
      const url = new URL(await agentUrl(session, '/ws'));
      if (gatewayClosed || gateway.readyState !== WebSocket.OPEN) return;
      url.protocol = 'ws:';
      agent = new WebSocket(url.toString(), ['sulandra-session.v1'], {
        headers: { 'x-sulandra-session-token': session.agentToken },
        handshakeTimeout: 10_000,
        maxPayload: 1_048_576,
      });

      agent.on('open', () => {
        if (gatewayClosed || gateway.readyState !== WebSocket.OPEN) {
          try { agent.close(1000, 'Gateway disconnected before session agent opened'); } catch {}
          return;
        }
        for (const frame of pendingFrames.splice(0)) agent.send(frame.data, { binary: frame.isBinary });
        pendingBytes = 0;
      });
      agent.on('message', (data, isBinary) => {
        session.lastUsedAt = now();
        if (gateway.readyState === WebSocket.OPEN) gateway.send(data, { binary: isBinary });
      });
      agent.on('close', (code, reason) => {
        pendingFrames.length = 0;
        pendingBytes = 0;
        if (gateway.readyState === WebSocket.OPEN) {
          gateway.close(code >= 1000 && code <= 4999 ? code : 1011, reason.toString().slice(0, 120));
        }
      });
      agent.on('error', () => close(1011, 'Session agent WSS error'));
    } catch {
      close(1011, 'Session agent unavailable');
    }
  })();
});

const reaper = setInterval(async () => {
  const cutoff = now() - idleMs;
  for (const session of [...sessions.values()]) {
    if (session.connections > 0) continue;
    if (session.disconnectedAt && session.disconnectedAt <= cutoff) {
      console.log(`[terminal-executor] reaping idle session ${session.id}`);
      await destroySession(session);
    }
  }
  for (const workspace of [...workspaces.values()]) {
    const hasSessions = [...sessions.values()].some(item => item.workspaceId === workspace.id);
    if (!hasSessions && workspace.lastUsedAt <= cutoff) {
      console.log(`[terminal-executor] reaping idle workspace ${workspace.id}`);
      await destroyWorkspace(workspace);
    }
  }
}, 60_000);
reaper.unref?.();

server.listen(port, '0.0.0.0', () => {
  console.log(`Sulandra terminal execution plane listening on 0.0.0.0:${port}`);
});
