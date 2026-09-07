import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node fix-codebase-project-session-recovery.mjs <execution-server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'CODEBASE_PROJECT_SESSION_RECOVERY_V1';
const rootMarker = 'CODEBASE_PROJECT_ROOT_NORMALIZATION_V1';
if (source.includes(marker) && source.includes(rootMarker)) {
  console.log('Codebase project session recovery and project-root normalization already installed.');
  process.exit(0);
}
if (!source.includes('CODEBASE_PROJECT_CONTROL_V1')) throw new Error('Codebase project control must be installed first');
if (!source.includes('TERMINAL_SESSION_CRASH_RECOVERY_V1')) throw new Error('Terminal session crash recovery must be installed first');

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Codebase project session recovery patch failed: ${label}`);
  source = source.replace(from, to);
};

if (!source.includes(marker)) {
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
}

if (!source.includes(rootMarker)) {
  replace(
`const normalizeCodebaseProjectName = raw => {
  const value = String(raw || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value) || value === '.' || value === '..') {`,
`const normalizeCodebaseProjectName = raw => {
  const value = String(raw || '').trim();
  if (value.toLowerCase() === 'projects') {
    throw codebaseHttpError(400, 'Project name "projects" is reserved because /projects is the Codebase project mount root.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value) || value === '.' || value === '..') {`,
  'reserve the /projects mount-root alias',
  );

  replace(
`const listCodebaseProjects = async workspace => {
  const root = codebaseProjectsRoot(workspace);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const entries = await readdir(root, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(entry.name));
  directories.sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(directories.map(entry => codebaseProjectMetadata(workspace, entry.name)));
};`,
String.raw`/* ${rootMarker}
   A historical Codebase root regression could persist the mount name itself as
   a project, producing /projects/projects/<real-project>. Treat "projects" as a
   reserved alias, recover recognized child projects one level up without
   deleting the legacy source, and move healthy PTYs to the corrected project. */
const codebaseProjectMarkerFiles = [
  'package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml',
  'composer.json', 'Gemfile', 'server.js', 'index.html',
];
const codebaseFileExists = async target => readFile(target).then(() => true).catch(() => false);
const codebaseLooksLikeStandaloneProject = async root => {
  if (await codebaseExists(path.join(root, '.git'))) return true;
  for (const markerFile of codebaseProjectMarkerFiles) {
    if (await codebaseFileExists(path.join(root, markerFile))) return true;
  }
  return false;
};
const syncCodebaseSessionCwdsToActiveProject = async workspace => {
  const cwd = workspace.activeProject ? '/projects/' + workspace.activeProject : '/projects';
  await Promise.allSettled(codebaseSessionCandidates(workspace).map(async session => {
    try {
      const container = docker.getContainer(session.containerId);
      const inspect = await container.inspect();
      if (!inspect.State?.Running || inspect.State?.Paused || inspect.State?.Restarting) return;
      await agentRequest(session, '/input', {
        method: 'POST',
        body: { data: 'cd -- ' + cwd + '\r' },
        timeoutMs: 5_000,
      });
    } catch {}
  }));
};
const repairNestedCodebaseProjectsAlias = async workspace => {
  if (String(workspace.activeProject || '').toLowerCase() !== 'projects') return { repaired: false, moved: [] };
  const root = codebaseProjectsRoot(workspace);
  const nestedRoot = path.join(root, 'projects');
  const nestedEntries = await readdir(nestedRoot, { withFileTypes: true }).catch(() => []);
  if (!nestedEntries.length) return { repaired: false, moved: [] };
  if (await codebaseLooksLikeStandaloneProject(nestedRoot)) return { repaired: false, moved: [] };
  const candidates = [];
  for (const entry of nestedEntries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(entry.name) || entry.name.toLowerCase() === 'projects') continue;
    const childRoot = path.join(nestedRoot, entry.name);
    if (await codebaseLooksLikeStandaloneProject(childRoot)) candidates.push(entry.name);
  }
  if (!candidates.length) return { repaired: false, moved: [] };

  const moved = [];
  for (const childName of candidates) {
    const sourcePath = path.join(nestedRoot, childName);
    let destinationName = childName;
    let attempt = 0;
    while (await codebaseExists(path.join(root, destinationName))) {
      attempt += 1;
      const suffix = '__recovered_nested_' + attempt;
      destinationName = childName.slice(0, Math.max(1, 80 - suffix.length)) + suffix;
      if (attempt > 100) throw codebaseHttpError(409, 'Unable to recover nested Codebase project without a name collision.');
    }
    await cp(sourcePath, path.join(root, destinationName), {
      recursive: true,
      force: false,
      errorOnExist: true,
      preserveTimestamps: true,
    });
    moved.push({ from: 'projects/' + childName, to: destinationName });
  }

  workspace.activeProject = moved.length === 1 ? moved[0].to : '';
  workspace.lastUsedAt = now();
  await writeFile(path.join(workspace.cwd, '.sulandra-project-root-repair.json'), JSON.stringify({
    version: 1,
    repairedAt: now(),
    sourceRetained: true,
    previousActiveProject: 'projects',
    activeProject: workspace.activeProject,
    moved,
  }), { mode: 0o600 });
  await saveWorkspace(workspace);
  await syncCodebaseSessionCwdsToActiveProject(workspace);
  return { repaired: true, moved, activeProject: workspace.activeProject };
};
const listCodebaseProjects = async workspace => {
  const root = codebaseProjectsRoot(workspace);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await repairNestedCodebaseProjectsAlias(workspace);
  const entries = await readdir(root, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && entry.name.toLowerCase() !== 'projects' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(entry.name));
  directories.sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(directories.map(entry => codebaseProjectMetadata(workspace, entry.name)));
};`,
  'repair nested /projects/projects project roots',
  );
}

for (const required of [
  marker,
  rootMarker,
  'codebaseSessionCandidates',
  'inspect.State?.Restarting',
  "session = await createSession(workspace, workspace.owner, 120, 32)",
  'resetCodebaseSessionCwds(workspace)',
  "body: { data: 'cd -- /projects\\r' }",
  'repairNestedCodebaseProjectsAlias(workspace)',
  'syncCodebaseSessionCwdsToActiveProject(workspace)',
  '.sulandra-project-root-repair.json',
  "entry.name.toLowerCase() !== 'projects'",
  'Project name "projects" is reserved because /projects is the Codebase project mount root.',
]) {
  if (!source.includes(required)) throw new Error(`Codebase project recovery verification missing: ${required}`);
}

fs.writeFileSync(target, source);
console.log('Installed healthy-session selection, safe project removal, automatic project action recovery, and nested /projects root normalization.');
