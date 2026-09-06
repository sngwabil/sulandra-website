import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node harden-codebase-project-persistence.mjs <execution-server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'CODEBASE_PROJECT_PERSISTENCE_V2';
if (source.includes(marker)) {
  console.log('Codebase project persistence hardening already installed.');
  process.exit(0);
}
if (!source.includes('CODEBASE_INDEPENDENT_WORKSPACE_V1')) throw new Error('Independent Codebase workspace patch must run before project persistence hardening');
if (!source.includes('CODEBASE_WORKSPACE_REUSE_V1')) throw new Error('Codebase workspace reuse patch must run before project persistence hardening');

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Codebase project persistence patch failed: ${label}`);
  source = source.replace(from, to);
};

const createAnchor = 'const createWorkspace = async owner => {';
const helpers = String.raw`
/* ${marker}
   Codebase project directories must survive gateway/executor restarts and older
   owner workspace generations. The owner hash marker lets the executor rebuild
   a lost workspace registry without exposing the raw owner identifier. Multiple
   historical Codebase workspaces are reconciled into the newest reusable one by
   copying projects only; the older copies are intentionally retained as a safe
   rollback source. */
const codebaseOwnerHash = owner => crypto.createHash('sha256').update(String(owner || '')).digest('hex');
const codebaseOwnerMarkerPath = workspace => path.join(workspace.cwd, '.sulandra-codebase-owner.json');
const codebaseRecoveryManifestPath = workspace => path.join(workspace.cwd, '.sulandra-codebase-recovery.json');
const stampCodebaseWorkspace = async workspace => {
  if (!workspace?.owner?.startsWith('codebase:')) return;
  await writeFile(codebaseOwnerMarkerPath(workspace), JSON.stringify({
    ownerHash: codebaseOwnerHash(workspace.owner),
    workspaceId: workspace.id,
    createdAt: Number(workspace.createdAt || now()),
    lastUsedAt: Number(workspace.lastUsedAt || now()),
  }), { mode: 0o600 });
};
const restoreCodebaseWorkspaceRegistry = async owner => {
  if (!String(owner || '').startsWith('codebase:')) return;
  const ownerHash = codebaseOwnerHash(owner);

  for (const session of sessions.values()) {
    if (session.owner !== owner || !session.workspaceId || workspaces.has(session.workspaceId)) continue;
    const cwd = path.join(workspaceRoot, session.workspaceId);
    const exists = await readdir(cwd).then(() => true).catch(() => false);
    if (!exists) continue;
    const workspace = {
      id: session.workspaceId,
      owner,
      cwd,
      hostCwd: path.join(workspaceHostRoot, session.workspaceId),
      branch: '',
      repository: '',
      workspaceKind: 'codebase',
      createdAt: Number(session.createdAt || now()),
      lastUsedAt: Number(session.lastUsedAt || now()),
    };
    workspaces.set(workspace.id, workspace);
    await stampCodebaseWorkspace(workspace);
    await saveWorkspace(workspace);
  }

  for (const entry of await readdir(workspaceRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^ws_[A-Za-z0-9_-]+$/.test(entry.name) || workspaces.has(entry.name)) continue;
    const cwd = path.join(workspaceRoot, entry.name);
    let stamped = null;
    try { stamped = JSON.parse(await readFile(path.join(cwd, '.sulandra-codebase-owner.json'), 'utf8')); } catch {}
    if (!stamped || stamped.ownerHash !== ownerHash) continue;
    const workspace = {
      id: entry.name,
      owner,
      cwd,
      hostCwd: path.join(workspaceHostRoot, entry.name),
      branch: '',
      repository: '',
      workspaceKind: 'codebase',
      createdAt: Number(stamped.createdAt || now()),
      lastUsedAt: Number(stamped.lastUsedAt || stamped.createdAt || now()),
    };
    workspaces.set(workspace.id, workspace);
    await saveWorkspace(workspace);
  }
};
const consolidateCodebaseProjects = async (targetWorkspace, reusableWorkspaces) => {
  if (!targetWorkspace?.owner?.startsWith('codebase:')) return;
  const targetProjects = path.join(targetWorkspace.cwd, '.sulandra-projects');
  await mkdir(targetProjects, { recursive: true, mode: 0o700 });
  let manifest = { version: 1, processedWorkspaceIds: [] };
  try {
    const parsed = JSON.parse(await readFile(codebaseRecoveryManifestPath(targetWorkspace), 'utf8'));
    if (Array.isArray(parsed?.processedWorkspaceIds)) manifest = { version: 1, processedWorkspaceIds: parsed.processedWorkspaceIds.map(String) };
  } catch {}
  const processed = new Set(manifest.processedWorkspaceIds);
  const targetNames = new Set(await readdir(targetProjects).catch(() => []));

  for (const candidate of reusableWorkspaces) {
    await stampCodebaseWorkspace(candidate);
    if (!candidate || candidate.id === targetWorkspace.id || processed.has(candidate.id)) continue;
    const sourceProjects = path.join(candidate.cwd, '.sulandra-projects');
    const entries = await readdir(sourceProjects, { withFileTypes: true }).catch(() => []);
    try {
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(entry.name)) continue;
        let destinationName = entry.name;
        if (targetNames.has(destinationName)) {
          const suffix = '__recovered_' + String(candidate.id || 'legacy').replace(/^ws_/, '').slice(0, 8);
          destinationName = entry.name.slice(0, Math.max(1, 80 - suffix.length)) + suffix;
        }
        if (targetNames.has(destinationName)) continue;
        const sourcePath = path.join(sourceProjects, entry.name);
        const destinationPath = path.join(targetProjects, destinationName);
        try {
          await cp(sourcePath, destinationPath, { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true });
          targetNames.add(destinationName);
        } catch (error) {
          if (error?.code !== 'EEXIST') throw error;
        }
      }
      processed.add(candidate.id);
      await writeFile(codebaseRecoveryManifestPath(targetWorkspace), JSON.stringify({ version: 1, processedWorkspaceIds: [...processed] }), { mode: 0o600 });
    } catch (error) {
      console.warn('Codebase project recovery skipped workspace', candidate.id, String(error?.message || error).slice(0, 240));
    }
  }
};

`;
replace(createAnchor, helpers + createAnchor, 'install owner-stamped registry recovery helpers');

replace(
  `const createWorkspace = async owner => {
  await loadWorkspaces();
  const owned = [...workspaces.values()].filter(item => item.owner === owner);`,
  `const createWorkspace = async owner => {
  await loadWorkspaces();
  if (owner.startsWith('codebase:')) await restoreCodebaseWorkspaceRegistry(owner);
  const owned = [...workspaces.values()].filter(item => item.owner === owner);`,
  'restore owner workspace registry before selecting the Codebase workspace',
);

replace(
  `  if (reusableCodebase.length) {
    const workspace = reusableCodebase
      .slice()
      .sort((left, right) => Number(right.lastUsedAt || right.createdAt || 0) - Number(left.lastUsedAt || left.createdAt || 0))[0];
    workspace.workspaceKind = 'codebase';
    workspace.repository = '';
    workspace.branch = '';
    workspace.lastUsedAt = now();
    workspaces.set(workspace.id, workspace);
    await saveWorkspace(workspace);
    return workspace;
  }`,
  `  if (reusableCodebase.length) {
    const workspace = reusableCodebase
      .slice()
      .sort((left, right) => Number(right.lastUsedAt || right.createdAt || 0) - Number(left.lastUsedAt || left.createdAt || 0))[0];
    workspace.workspaceKind = 'codebase';
    workspace.repository = '';
    workspace.branch = '';
    workspace.lastUsedAt = now();
    await consolidateCodebaseProjects(workspace, reusableCodebase);
    await stampCodebaseWorkspace(workspace);
    workspaces.set(workspace.id, workspace);
    await saveWorkspace(workspace);
    return workspace;
  }`,
  'consolidate historical Codebase project folders into the active workspace',
);

replace(
  `      workspaceKind: 'codebase',
      createdAt: now(),
      lastUsedAt: now(),
    };
    workspaces.set(workspaceId, workspace);
    await saveWorkspace(workspace);
    return workspace;`,
  `      workspaceKind: 'codebase',
      createdAt: now(),
      lastUsedAt: now(),
    };
    workspaces.set(workspaceId, workspace);
    await stampCodebaseWorkspace(workspace);
    await saveWorkspace(workspace);
    return workspace;`,
  'stamp newly created Codebase workspaces for registry reconstruction',
);

for (const required of [
  marker,
  'restoreCodebaseWorkspaceRegistry(owner)',
  'consolidateCodebaseProjects(workspace, reusableCodebase)',
  '.sulandra-codebase-owner.json',
  '.sulandra-codebase-recovery.json',
  '__recovered_',
  'await stampCodebaseWorkspace(workspace)',
]) {
  if (!source.includes(required)) throw new Error(`Codebase project persistence verification missing: ${required}`);
}

fs.writeFileSync(target, source);
console.log('Installed owner-stamped Codebase project persistence and historical workspace recovery.');
