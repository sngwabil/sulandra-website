import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node fix-codebase-project-session-recovery.mjs <execution-server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'CODEBASE_PROJECT_SESSION_RECOVERY_V1';
if (source.includes(marker)) {
  console.log('Codebase project session recovery already installed.');
  process.exit(0);
}
if (!source.includes('CODEBASE_PROJECT_CONTROL_V1')) throw new Error('Codebase project control must be installed first');
if (!source.includes('TERMINAL_SESSION_CRASH_RECOVERY_V1')) throw new Error('Terminal session crash recovery must be installed first');

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Codebase project session recovery patch failed: ${label}`);
  source = source.replace(from, to);
};

replace(
`const newestCodebaseSession = workspace => [...sessions.values()]
  .filter(item => item.workspaceId === workspace.id && item.owner === workspace.owner)
  .sort((a, b) => Number(b.lastUsedAt || b.createdAt || 0) - Number(a.lastUsedAt || a.createdAt || 0))[0] || null;`,
`/* ${marker}
   Project actions must never bind themselves to a terminal container that is
   stopped, paused, or in Docker's restart loop. Prefer the newest healthy
   session; if none exists, create a fresh owner-scoped Codebase session using
   the same durable /projects and /home/terminal mounts. */
const codebaseSessionCandidates = workspace => [...sessions.values()]
  .filter(item => item.workspaceId === workspace.id && item.owner === workspace.owner)
  .sort((a, b) => Number(b.lastUsedAt || b.createdAt || 0) - Number(a.lastUsedAt || a.createdAt || 0));
const newestCodebaseSession = async workspace => {
  for (const session of codebaseSessionCandidates(workspace)) {
    try {
      const inspect = await docker.getContainer(session.containerId).inspect();
      if (inspect.State?.Running && !inspect.State?.Paused && !inspect.State?.Restarting) return session;
    } catch {}
  }
  return null;
};
const resetCodebaseSessionCwds = async workspace => {
  await Promise.allSettled(codebaseSessionCandidates(workspace).map(async session => {
    try {
      const container = docker.getContainer(session.containerId);
      const inspect = await container.inspect();
      if (!inspect.State?.Running || inspect.State?.Paused || inspect.State?.Restarting) return;
      await agentRequest(session, '/input', {
        method: 'POST',
        body: { data: 'cd -- /projects\\r' },
        timeoutMs: 5_000,
      });
    } catch {}
  }));
};`,
'health-aware Codebase session selection',
);

replace(
`  const session = newestCodebaseSession(workspace);
  if (!session) throw codebaseHttpError(409, 'Start a Codebase terminal before using GitHub or Railway project actions.');`,
`  let session = await newestCodebaseSession(workspace);
  if (!session) {
    session = await createSession(workspace, workspace.owner, 120, 32);
  }`,
'auto-recover project action session',
);

replace(
`    const project = normalizeCodebaseProjectName(req.params.project);
    await rm(codebaseProjectRoot(workspace, project), { recursive: true, force: true });
    if (workspace.activeProject === project) workspace.activeProject = '';
    await saveWorkspace(workspace);
    res.json({ ok: true, removed: project, activeProject: workspace.activeProject || '' });`,
`    const project = normalizeCodebaseProjectName(req.params.project);
    // Disconnect first so newly-created terminals can never inherit a path that
    // is about to disappear. Move every healthy live PTY back to /projects before
    // removing the directory; stopped/restarting sessions recover safely through
    // the session bootstrap fallback in sulandra-codebase-setup.
    if (workspace.activeProject === project) {
      workspace.activeProject = '';
      workspace.lastUsedAt = now();
      await saveWorkspace(workspace);
    }
    await resetCodebaseSessionCwds(workspace);
    await rm(codebaseProjectRoot(workspace, project), { recursive: true, force: true });
    await saveWorkspace(workspace);
    res.json({ ok: true, removed: project, activeProject: workspace.activeProject || '' });`,
'safe project removal ordering',
);

for (const required of [
  marker,
  'codebaseSessionCandidates',
  'inspect.State?.Restarting',
  "session = await createSession(workspace, workspace.owner, 120, 32)",
  'resetCodebaseSessionCwds(workspace)',
  "body: { data: 'cd -- /projects\\r' }",
]) {
  if (!source.includes(required)) throw new Error(`Codebase project session recovery verification missing: ${required}`);
}

fs.writeFileSync(target, source);
console.log('Installed healthy-session selection, safe project removal, and automatic Codebase project action recovery.');
