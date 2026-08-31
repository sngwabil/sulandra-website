import fs from 'node:fs';

const target = process.argv[2] || '/app/server.mjs';
let source = fs.readFileSync(target, 'utf8');

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Terminal hardening patch failed: ${label}`);
  source = source.replace(from, to);
};

replace(
  "import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';\nimport path from 'node:path';",
  "import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';\nimport { readFileSync } from 'node:fs';\nimport { spawn } from 'node:child_process';\nimport path from 'node:path';",
  'imports',
);

replace(
  "const agentPort = Math.max(1, Number(process.env.TERMINAL_AGENT_PORT || 9000));",
  `const agentPort = Math.max(1, Number(process.env.TERMINAL_AGENT_PORT || 9000));
const gitRepository = String(process.env.TERMINAL_GIT_REPOSITORY || 'https://github.com/sngwabil/sulandra-website.git').trim();
const gitBaseBranch = String(process.env.TERMINAL_GIT_BASE_BRANCH || 'release/sulandra-1.0').trim();
const egressProxyUrl = String(process.env.TERMINAL_EGRESS_PROXY_URL || '').trim();
const buildMemoryBytes = Math.max(memoryBytes, Number(process.env.TERMINAL_BUILD_MEMORY_BYTES || 2_147_483_648));
const buildNanoCpus = Math.max(nanoCpus, Number(process.env.TERMINAL_BUILD_NANO_CPUS || 2_000_000_000));
const buildPidsLimit = Math.max(pidsLimit, Number(process.env.TERMINAL_BUILD_PIDS_LIMIT || 768));
const buildScanMs = Math.max(1_000, Number(process.env.TERMINAL_BUILD_SCAN_MS || 2_000));
const buildCooldownMs = Math.max(2_000, Number(process.env.TERMINAL_BUILD_COOLDOWN_SECONDS || 20) * 1_000);
const buildProcessPattern = /(?:npm|pnpm|yarn|npx|node|bun).{0,100}\\b(?:build|tsc|vite|vitest|playwright|webpack|esbuild|rollup|next\\s+build)\\b|\\b(?:pytest|pip(?:3)?\\s+wheel|cargo\\s+build|go\\s+build|gradle|mvn)\\b/i;`,
  'execution settings',
);

replace(
  "const workspaceMetaPath = workspaceId => path.join(stateRoot, `workspace-${workspaceId}.json`);",
  `const workspaceMetaPath = workspaceId => path.join(stateRoot, \`workspace-\${workspaceId}.json\`);
const sessionMetaPath = sessionId => path.join(stateRoot, \`session-\${sessionId}.json\`);`,
  'session metadata path',
);

replace(
  `    lastUsedAt: workspace.lastUsedAt,
  }), { mode: 0o600 });
};`,
  `    lastUsedAt: workspace.lastUsedAt,
    branch: workspace.branch || '',
    repository: workspace.repository || gitRepository,
  }), { mode: 0o600 });
};

const saveSession = async session => {
  session.lastPersistedAt = now();
  await writeFile(sessionMetaPath(session.id), JSON.stringify({
    id: session.id,
    workspaceId: session.workspaceId,
    owner: session.owner,
    containerId: session.containerId,
    agentToken: session.agentToken,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    disconnectedAt: session.disconnectedAt,
    leaseUntil: session.leaseUntil || 0,
    resourceProfile: session.resourceProfile || 'interactive',
    buildLastSeenAt: session.buildLastSeenAt || 0,
  }), { mode: 0o600 });
};

const persistSessionSoon = session => {
  if (!session || now() - Number(session.lastPersistedAt || 0) < 5_000) return;
  void saveSession(session).catch(error => console.warn('[terminal-executor] session metadata persist failed', error.message));
};`,
  'metadata persistence',
);

replace(
  `const getWorkspace = (req, workspaceId) => {
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
    const error = new Error(\`Workspace limit reached (\${maxWorkspacesPerOwner})\`);
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
};`,
  `const loadWorkspaceSync = workspaceId => {
  try {
    const data = JSON.parse(readFileSync(workspaceMetaPath(workspaceId), 'utf8'));
    if (data?.id && data?.owner && data?.cwd && data?.hostCwd) {
      workspaces.set(data.id, data);
      return data;
    }
  } catch {}
  return null;
};
const loadSessionSync = sessionId => {
  try {
    const data = JSON.parse(readFileSync(sessionMetaPath(sessionId), 'utf8'));
    if (data?.id && data?.workspaceId && data?.owner && data?.containerId && data?.agentToken) {
      const session = { connections: 0, lastPersistedAt: 0, ...data };
      sessions.set(data.id, session);
      return session;
    }
  } catch {}
  return null;
};
const getWorkspace = (req, workspaceId) => {
  const workspace = workspaces.get(workspaceId) || loadWorkspaceSync(workspaceId);
  return workspace && workspace.owner === ownerOf(req) ? workspace : null;
};
const getSession = (req, sessionId) => {
  const session = sessions.get(sessionId) || loadSessionSync(sessionId);
  return session && session.owner === ownerOf(req) ? session : null;
};

const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    reject(new Error(\`\${command} timed out\`));
  }, Math.max(5_000, Number(options.timeoutMs || 120_000)));
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('close', code => {
    clearTimeout(timer);
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(\`\${command} exited \${code}: \${stderr.slice(-2_000)}\`));
  });
});

const gitEnvironment = () => ({
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  ...(egressProxyUrl ? {
    HTTP_PROXY: egressProxyUrl,
    HTTPS_PROXY: egressProxyUrl,
    http_proxy: egressProxyUrl,
    https_proxy: egressProxyUrl,
  } : {}),
});

const createWorkspace = async owner => {
  await loadWorkspaces();
  const owned = [...workspaces.values()].filter(item => item.owner === owner);
  if (owned.length >= maxWorkspacesPerOwner) {
    const error = new Error(\`Workspace limit reached (\${maxWorkspacesPerOwner})\`);
    error.status = 429;
    throw error;
  }
  const workspaceId = id('ws');
  const cwd = path.join(workspaceRoot, workspaceId);
  const hostCwd = path.join(workspaceHostRoot, workspaceId);
  await rm(cwd, { recursive: true, force: true });
  await mkdir(workspaceRoot, { recursive: true, mode: 0o700 });
  try {
    await runCommand('git', ['clone', '--origin', 'origin', '--single-branch', '--branch', gitBaseBranch, gitRepository, cwd], {
      env: gitEnvironment(),
      timeoutMs: 180_000,
    });
    const branch = \`workbench/\${workspaceId.replace(/^ws_/, '').slice(0, 36)}\`;
    await runCommand('git', ['-C', cwd, 'config', 'user.name', 'Sulandra Terminal']);
    await runCommand('git', ['-C', cwd, 'config', 'user.email', 'terminal@sulandra.local']);
    await runCommand('git', ['-C', cwd, 'switch', '-c', branch]);
    const workspace = {
      id: workspaceId,
      owner,
      cwd,
      hostCwd,
      branch,
      repository: gitRepository,
      createdAt: now(),
      lastUsedAt: now(),
    };
    workspaces.set(workspaceId, workspace);
    await saveWorkspace(workspace);
    return workspace;
  } catch (error) {
    await rm(cwd, { recursive: true, force: true });
    throw error;
  }
};`,
  'real Git workspace creation',
);

replace(
  "      `PORT=${agentPort}`,\n    ],",
  `      \`PORT=\${agentPort}\`,
      \`SULANDRA_REPOSITORY=\${gitRepository}\`,
      \`SULANDRA_BASE_BRANCH=\${gitBaseBranch}\`,
      ...(egressProxyUrl ? [
        \`HTTP_PROXY=\${egressProxyUrl}\`,
        \`HTTPS_PROXY=\${egressProxyUrl}\`,
        \`http_proxy=\${egressProxyUrl}\`,
        \`https_proxy=\${egressProxyUrl}\`,
        'NO_PROXY=localhost,127.0.0.1',
        'no_proxy=localhost,127.0.0.1',
      ] : []),
    ],`,
  'session egress environment',
);

replace(
  `    connections: 0,
  };
  sessions.set(sessionId, session);
  try {
    await container.start();
    await waitForAgent(session);`,
  `    connections: 0,
    leaseUntil: 0,
    resourceProfile: 'interactive',
    buildLastSeenAt: 0,
    lastPersistedAt: 0,
  };
  sessions.set(sessionId, session);
  try {
    await container.start();
    await waitForAgent(session);
    await saveSession(session);`,
  'session persistence after startup',
);

replace(
  `  sessions.delete(session.id);
  try { await docker.getContainer(session.containerId).remove({ force: true }); } catch {}
};`,
  `  sessions.delete(session.id);
  try { await docker.getContainer(session.containerId).remove({ force: true }); } catch {}
  await rm(sessionMetaPath(session.id), { force: true }).catch(() => {});
};`,
  'session metadata cleanup',
);

replace(
  "      cgroups: { memoryBytes, nanoCpus, pidsLimit },",
  "      cgroups: { interactive: { memoryBytes, nanoCpus, pidsLimit }, build: { memoryBytes: buildMemoryBytes, nanoCpus: buildNanoCpus, pidsLimit: buildPidsLimit } },",
  'health resource profiles',
);

replace(
  "    res.status(201).json({ workspaceId: workspace.id, cwd: '/workspace', isolated: true, branch: 'workbench', isolationProvider: 'docker' });",
  "    res.status(201).json({ workspaceId: workspace.id, cwd: '/workspace', isolated: true, branch: workspace.branch, repository: workspace.repository, gitBacked: true, isolationProvider: 'docker' });",
  'workspace create response',
);

replace(
  "  res.json({ workspaceId: workspace.id, cwd: '/workspace', activeSessions, isolated: true, isolationProvider: 'docker' });",
  "  res.json({ workspaceId: workspace.id, cwd: '/workspace', activeSessions, isolated: true, branch: workspace.branch, repository: workspace.repository, gitBacked: true, isolationProvider: 'docker' });",
  'workspace get response',
);

replace(
  `      isolationProvider: 'docker',
    });`,
  `      isolationProvider: 'docker',
      resourceProfile: session.resourceProfile,
    });`,
  'session response profile',
);

replace(
  `app.delete('/v1/sessions/:sessionId', async (req, res, next) => {`,
  `app.get('/v1/sessions/:sessionId/resources', async (req, res, next) => {
  try {
    const session = getSession(req, req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Terminal session not found' });
    const inspect = await docker.getContainer(session.containerId).inspect();
    res.json({
      sessionId: session.id,
      profile: session.resourceProfile || 'interactive',
      memoryBytes: inspect.HostConfig?.Memory || 0,
      nanoCpus: inspect.HostConfig?.NanoCpus || 0,
      pidsLimit: inspect.HostConfig?.PidsLimit || 0,
    });
  } catch (error) { next(error); }
});

app.delete('/v1/sessions/:sessionId', async (req, res, next) => {`,
  'resource status endpoint',
);

replace(
  `  session.connections += 1;
  session.disconnectedAt = null;
  session.lastUsedAt = now();`,
  `  session.connections += 1;
  session.disconnectedAt = null;
  session.lastUsedAt = now();
  session.leaseUntil = now() + 45_000;
  void saveSession(session).catch(() => {});
  const leaseTimer = setInterval(() => {
    if (gateway.readyState !== WebSocket.OPEN) return;
    session.lastUsedAt = now();
    session.leaseUntil = now() + 45_000;
    void saveSession(session).catch(() => {});
  }, 15_000);
  leaseTimer.unref?.();`,
  'cross-executor WSS lease',
);

replace(
  `  gateway.on('message', (data, isBinary) => {
    session.lastUsedAt = now();`,
  `  gateway.on('message', (data, isBinary) => {
    session.lastUsedAt = now();
    persistSessionSoon(session);`,
  'persist WSS activity',
);

replace(
  `  gateway.on('close', () => {
    gatewayClosed = true;`,
  `  gateway.on('close', () => {
    gatewayClosed = true;
    clearInterval(leaseTimer);`,
  'clear WSS lease timer',
);

replace(
  `    session.connections = Math.max(0, session.connections - 1);
    if (session.connections === 0) session.disconnectedAt = now();`,
  `    session.connections = Math.max(0, session.connections - 1);
    if (session.connections === 0) {
      session.disconnectedAt = now();
      session.leaseUntil = 0;
    }
    void saveSession(session).catch(() => {});`,
  'persist WSS disconnect',
);

replace(
  `const reaper = setInterval(async () => {`,
  `const applyResourceProfile = async (session, profile) => {
  const next = profile === 'build' ? 'build' : 'interactive';
  if (session.resourceProfile === next) return;
  const limits = next === 'build'
    ? { Memory: buildMemoryBytes, MemorySwap: buildMemoryBytes, NanoCpus: buildNanoCpus, PidsLimit: buildPidsLimit }
    : { Memory: memoryBytes, MemorySwap: memoryBytes, NanoCpus: nanoCpus, PidsLimit: pidsLimit };
  await docker.getContainer(session.containerId).update(limits);
  session.resourceProfile = next;
  if (next === 'build') session.buildLastSeenAt = now();
  await saveSession(session).catch(() => {});
  console.log(\`[terminal-executor] session \${session.id} resource profile -> \${next}\`);
};

const resourceMonitor = setInterval(async () => {
  for (const session of [...sessions.values()]) {
    try {
      const container = docker.getContainer(session.containerId);
      const top = await container.top({ ps_args: '-eo args' });
      const commandText = (top.Processes || []).map(row => row.join(' ')).join('\\n');
      if (buildProcessPattern.test(commandText)) {
        session.buildLastSeenAt = now();
        if (session.resourceProfile !== 'build') await applyResourceProfile(session, 'build');
        else persistSessionSoon(session);
      } else if (session.resourceProfile === 'build' && now() - Number(session.buildLastSeenAt || 0) >= buildCooldownMs) {
        await applyResourceProfile(session, 'interactive');
      }
    } catch {}
  }
}, buildScanMs);
resourceMonitor.unref?.();

const reaper = setInterval(async () => {`,
  'dynamic build resource monitor',
);

replace(
  `  for (const session of [...sessions.values()]) {
    if (session.connections > 0) continue;
    if (session.disconnectedAt && session.disconnectedAt <= cutoff) {`,
  `  for (const session of [...sessions.values()]) {
    if (session.connections > 0) continue;
    let persisted = null;
    try { persisted = JSON.parse(readFileSync(sessionMetaPath(session.id), 'utf8')); } catch {}
    if (Number(persisted?.leaseUntil || 0) > now()) continue;
    if (Number(persisted?.lastUsedAt || 0) > cutoff) continue;
    if (session.disconnectedAt && session.disconnectedAt <= cutoff) {`,
  'HA-safe reaper lease',
);

fs.writeFileSync(target, source);
console.log(`Installed terminal industry hardening into ${target}`);
