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
    "const createSession = async (workspace, owner, cols, rows) => {\n  const active = [...sessions.values()].filter(item => item.workspaceId === workspace.id);",
    `const ensureProjectsPath = async workspace => {
  const projectsPath = path.join(workspace.cwd, '.sulandra-projects');
  await mkdir(projectsPath, { recursive: true, mode: 0o700 });
  const excludePath = path.join(workspace.cwd, '.git', 'info', 'exclude');
  const marker = '.sulandra-projects/';
  const current = await readFile(excludePath, 'utf8').catch(() => '');
  const lines = current.split(/\\r?\\n/).map(line => line.trim());
  if (!lines.includes(marker)) {
    const prefix = current && !current.endsWith('\\n') ? \`\${current}\\n\` : current;
    await writeFile(excludePath, \`\${prefix}\${marker}\\n\`, { mode: 0o600 });
  }
  return projectsPath;
};

const createSession = async (workspace, owner, cols, rows) => {
  const active = [...sessions.values()].filter(item => item.workspaceId === workspace.id);`,
    'persistent clean project root',
  );

  replace(
    "  const sessionId = id('term');\n  const sessionToken = crypto.randomBytes(32).toString('base64url');",
    "  await ensureProjectsPath(workspace);\n  const sessionId = id('term');\n  const sessionToken = crypto.randomBytes(32).toString('base64url');",
    'ensure project directory before container create',
  );

  replace(
    "      `SULANDRA_BASE_BRANCH=${gitBaseBranch}`,",
    "      `SULANDRA_BASE_BRANCH=${gitBaseBranch}`,\n      'SULANDRA_TERMINAL_CWD=/projects',",
    'terminal cwd environment',
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
        \`\${workspace.hostCwd}:/workspace:rw\`,
        \`\${workspace.hostCwd}/.sulandra-projects:/projects:rw\`,
      ],`,
    'mutable isolated developer container',
  );
} else if (mode === 'session') {
  replace(
    "const initialRows = Math.max(12, Math.min(80, Number(process.env.TERMINAL_ROWS || 32)));",
    "const initialRows = Math.max(12, Math.min(80, Number(process.env.TERMINAL_ROWS || 32)));\nconst terminalCwd = String(process.env.SULANDRA_TERMINAL_CWD || '/projects').trim() || '/projects';",
    'terminal cwd setting',
  );

  replace(
    "    cwd: '/workspace',",
    "    cwd: terminalCwd,",
    'PTY starts in clean project root',
  );

  replace(
    "spawnBridge();\npushOutput('\\x1b[1;36mSulandra isolated Docker terminal ready.\\x1b[0m\\r\\n');",
    "spawnBridge();\npushOutput(`\\x1b[1;36mSulandra developer terminal ready in ${terminalCwd}. Source checkout: /workspace.\\x1b[0m\\r\\n`);",
    'startup message',
  );
} else if (mode === 'entrypoint') {
  replace(
    '  /workspace >/tmp/sulandra-code-server.log 2>&1 &',
    '  "${SULANDRA_TERMINAL_CWD:-/projects}" >/tmp/sulandra-code-server.log 2>&1 &',
    'IDE opens clean project root',
  );
} else {
  throw new Error(`Unknown mode: ${mode}`);
}

fs.writeFileSync(target, source);
console.log(`Applied unrestricted developer workspace patch (${mode}) to ${target}`);
