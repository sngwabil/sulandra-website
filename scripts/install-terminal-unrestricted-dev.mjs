import fs from 'node:fs';

const target = process.argv[2];
const mode = process.argv[3];
if (!target || !mode) throw new Error('Usage: node install-terminal-unrestricted-dev.mjs <target> <executor|session|entrypoint>');
let source = fs.readFileSync(target, 'utf8');

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Unrestricted dev patch failed (${mode}): ${label}`);
  source = source.replace(from, to);
};

if (mode === 'executor') {
  replace(
    "const pidsLimit = Math.max(64, Number(process.env.TERMINAL_PIDS_LIMIT || 256));",
    `const pidsLimit = Math.max(64, Number(process.env.TERMINAL_PIDS_LIMIT || 256));
const requestedTmpfsBytes = Number(process.env.TERMINAL_TMPFS_BYTES || 1_073_741_824);
const terminalTmpfsCeiling = Math.max(67_108_864, Math.floor(memoryBytes / 2));
const terminalTmpfsBytes = Math.min(
  terminalTmpfsCeiling,
  Math.max(
    134_217_728,
    Number.isFinite(requestedTmpfsBytes) ? Math.floor(requestedTmpfsBytes) : 1_073_741_824,
  ),
);`,
    'configurable session temporary filesystem capacity',
  );

  replace(
    "const createSession = async (workspace, owner, cols, rows) => {\n  const active = [...sessions.values()].filter(item => item.workspaceId === workspace.id);",
    `const ensureDeveloperPaths = async workspace => {
  const projectsPath = path.join(workspace.cwd, '.sulandra-projects');
  const homePath = path.join(workspace.cwd, '.sulandra-home');
  await Promise.all([
    mkdir(projectsPath, { recursive: true, mode: 0o700 }),
    mkdir(homePath, { recursive: true, mode: 0o700 }),
  ]);
  const excludePath = path.join(workspace.cwd, '.git', 'info', 'exclude');
  const markers = ['.sulandra-projects/', '.sulandra-home/'];
  let current = await readFile(excludePath, 'utf8').catch(() => '');
  const lines = new Set(current.split(/\\r?\\n/).map(line => line.trim()));
  for (const marker of markers) {
    if (lines.has(marker)) continue;
    if (current && !current.endsWith('\\n')) current += '\\n';
    current += \`\${marker}\\n\`;
    lines.add(marker);
  }
  await writeFile(excludePath, current, { mode: 0o600 });
  return { projectsPath, homePath };
};

const createSession = async (workspace, owner, cols, rows) => {
  const active = [...sessions.values()].filter(item => item.workspaceId === workspace.id);`,
    'persistent project and home directories',
  );

  replace(
    "  const sessionId = id('term');\n  const sessionToken = crypto.randomBytes(32).toString('base64url');",
    "  await ensureDeveloperPaths(workspace);\n  const sessionId = id('term');\n  const sessionToken = crypto.randomBytes(32).toString('base64url');",
    'ensure persistent developer directories before container create',
  );

  replace(
    "      `SULANDRA_BASE_BRANCH=${gitBaseBranch}` ,".replace('` ,', '`,'),
    "      `SULANDRA_BASE_BRANCH=${gitBaseBranch}`,\n      'SULANDRA_TERMINAL_CWD=/projects',",
    'terminal cwd environment',
  );

  replace(
    "    WorkingDir: '/workspace',",
    "    WorkingDir: '/projects',",
    'container working directory',
  );

  replace(
    `      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      NetworkMode: networkName,
      Binds: [\`\${workspace.hostCwd}:/workspace:rw\`],`,
    `      Privileged: false,
      ReadonlyRootfs: false,
      NetworkMode: networkName,
      Binds: [
        \`\${workspace.hostCwd}:/workspace:ro\`,
        \`\${workspace.hostCwd}/.sulandra-projects:/projects:rw\`,
        \`\${workspace.hostCwd}/.sulandra-home:/home/terminal:rw\`,
      ],`,
    'mutable projects, persistent home, and protected source checkout',
  );

  replace(
    "        '/tmp': 'rw,noexec,nosuid,nodev,size=64m,mode=1777',",
    "        '/tmp': `rw,noexec,nosuid,nodev,size=${terminalTmpfsBytes},mode=1777`,",
    'developer temporary filesystem capacity',
  );

  replace(
    "        '/home/terminal': 'rw,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=700',\n",
    '',
    'persistent home replaces ephemeral tmpfs home',
  );

  replace(
    "      cgroups: { interactive: { memoryBytes, nanoCpus, pidsLimit }, build: { memoryBytes: buildMemoryBytes, nanoCpus: buildNanoCpus, pidsLimit: buildPidsLimit } },",
    "      cgroups: { interactive: { memoryBytes, nanoCpus, pidsLimit, tmpfsBytes: terminalTmpfsBytes }, build: { memoryBytes: buildMemoryBytes, nanoCpus: buildNanoCpus, pidsLimit: buildPidsLimit, tmpfsBytes: terminalTmpfsBytes } },",
    'temporary filesystem health telemetry',
  );
} else if (mode === 'session') {
  replace(
    "const initialRows = Math.max(12, Math.min(80, Number(process.env.TERMINAL_ROWS || 32)));",
    "const initialRows = Math.max(12, Math.min(80, Number(process.env.TERMINAL_ROWS || 32)));\nconst terminalCwd = String(process.env.SULANDRA_TERMINAL_CWD || '/projects').trim() || '/projects';",
    'terminal cwd setting',
  );

  replace(
    "const historyDir = path.join('/workspace', '.sulandra-terminal-history');",
    "const historyDir = path.join('/home/terminal', '.local', 'state', 'sulandra-terminal', 'history');",
    'history stored in persistent home',
  );

  replace(
    "  HISTFILE: '/workspace/.bash_history',",
    "  HISTFILE: '/home/terminal/.bash_history',",
    'Bash history stored in persistent home',
  );

  replace(
    "    cwd: '/workspace',",
    '    cwd: terminalCwd,',
    'PTY starts in clean project root',
  );

  replace(
    "spawnBridge();\npushOutput('\\x1b[1;36mSulandra isolated Docker terminal ready.\\x1b[0m\\r\\n');",
    "spawnBridge();\npushOutput(`\\x1b[1;36mSulandra developer terminal ready in ${terminalCwd}. Protected source checkout: /workspace.\\x1b[0m\\r\\n`);",
    'startup message',
  );

  replace(
    `const ensureBridge = () => {
  if (!alive || !proc) spawnBridge();
};`,
    `const ensureBridge = () => {
  if (!alive || !proc) spawnBridge();
};

/* TERMINAL_AGENT_DETERMINISTIC_READINESS_V1
   PTY output is not a reliable readiness signal. A healthy interactive shell can
   legitimately produce no bytes while tmux is already accepting input. Confirm
   the tmux session directly so executor startup cannot spend tens of seconds
   polling a false-negative /health response and surface a generic fetch error. */
const confirmBridgeReady = async () => {
  if (!alive || !proc) return false;
  if (bridgeReady) return true;
  try {
    await execFileAsync('tmux', [
      '-f', tmuxConfigPath,
      'has-session', '-t', tmuxSession,
    ], { encoding: 'utf8', env: shellEnv, timeout: 1_000 });
    bridgeReady = true;
    return true;
  } catch {
    return false;
  }
};`,
    'deterministic tmux readiness',
  );

  replace(
    `app.get('/health', authorize, async (_req, res) => {
  await historyWrite;
  const info = await stat(historyPath).catch(() => ({ size: 0 }));
  if (!alive || !bridgeReady) {
    return res.status(503).json({ ok: false, pty: true, tmux: true, workspaceId, alive, ready: false, transcriptBytes: Number(info.size) || 0 });
  }
  res.json({ ok: true, pty: true, tmux: true, workspaceId, alive, ready: true, transcriptBytes: Number(info.size) || 0 });
});`,
    `app.get('/health', authorize, async (_req, res) => {
  await historyWrite;
  const info = await stat(historyPath).catch(() => ({ size: 0 }));
  const ready = await confirmBridgeReady();
  if (!alive || !ready) {
    return res.status(503).json({ ok: false, pty: true, tmux: true, workspaceId, alive, ready: false, transcriptBytes: Number(info.size) || 0 });
  }
  res.json({ ok: true, pty: true, tmux: true, workspaceId, alive, ready: true, transcriptBytes: Number(info.size) || 0 });
});`,
    'authenticated health readiness',
  );
} else if (mode === 'entrypoint') {
  const oldValue = '  /workspace >/tmp/sulandra-code-server.log 2>&1 &';
  const newValue = '  "${TERMINAL_CWD}" >/tmp/sulandra-code-server.log 2>&1 &';
  if (source.includes(oldValue)) source = source.replace(oldValue, newValue);
  if (!source.includes(newValue)) throw new Error('Unrestricted dev patch failed (entrypoint): IDE opens clean project root');
} else {
  throw new Error(`Unknown mode: ${mode}`);
}

fs.writeFileSync(target, source);
console.log(`Applied unrestricted developer workspace patch (${mode}) to ${target}`);
