import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node fix-codebase-independent-workspace.mjs <execution-server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'CODEBASE_INDEPENDENT_WORKSPACE_V1';
if (source.includes(marker)) {
  console.log('Independent Codebase workspace patch already installed.');
  process.exit(0);
}

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Independent Codebase workspace patch failed: ${label}`);
  source = source.replace(from, to);
};

replace(
  `    branch: workspace.branch || '',
    repository: workspace.repository || gitRepository,
  }), { mode: 0o600 });`,
  `    branch: workspace.branch || '',
    repository: workspace.repository || '',
    workspaceKind: workspace.workspaceKind || (workspace.owner?.startsWith('codebase:') ? 'codebase' : 'engineering'),
  }), { mode: 0o600 });`,
  'workspace metadata must not inherit the Sulandra engineering repository',
);

replace(
  `  if (owner.startsWith('codebase:') && owned.length) {
    const workspace = owned
      .slice()
      .sort((left, right) => Number(right.lastUsedAt || right.createdAt || 0) - Number(left.lastUsedAt || left.createdAt || 0))[0];
    workspace.lastUsedAt = now();
    workspaces.set(workspace.id, workspace);
    await saveWorkspace(workspace);
    return workspace;
  }

  if (owned.length >= maxWorkspacesPerOwner) {`,
  `  /* ${marker}
     Codebase is a standalone development application. It must never inherit,
     clone, expose, or reopen the Sulandra Health engineering repository.
     Legacy Codebase workspaces created before this fix remain on disk for safe
     recovery, but are deliberately not reused because they are Git-backed. */
  const reusableCodebase = owner.startsWith('codebase:')
    ? owned.filter(item => item.workspaceKind === 'codebase' || !String(item.repository || '').trim())
    : [];
  if (reusableCodebase.length) {
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
  }

  const quotaOwned = owner.startsWith('codebase:') ? reusableCodebase : owned;
  if (quotaOwned.length >= maxWorkspacesPerOwner) {`,
  'Codebase reuse must ignore legacy engineering-backed workspaces',
);

replace(
  `  const workspaceId = id('ws');
  const cwd = path.join(workspaceRoot, workspaceId);
  const hostCwd = path.join(workspaceHostRoot, workspaceId);
  await rm(cwd, { recursive: true, force: true });
  await mkdir(workspaceRoot, { recursive: true, mode: 0o700 });
  try {
    await runCommand('git', ['clone', '--origin', 'origin', '--single-branch', '--branch', gitBaseBranch, gitRepository, cwd], {`,
  `  const workspaceId = id('ws');
  const cwd = path.join(workspaceRoot, workspaceId);
  const hostCwd = path.join(workspaceHostRoot, workspaceId);

  if (owner.startsWith('codebase:')) {
    await rm(cwd, { recursive: true, force: true });
    await mkdir(cwd, { recursive: true, mode: 0o700 });
    const workspace = {
      id: workspaceId,
      owner,
      cwd,
      hostCwd,
      branch: '',
      repository: '',
      workspaceKind: 'codebase',
      createdAt: now(),
      lastUsedAt: now(),
    };
    workspaces.set(workspaceId, workspace);
    await saveWorkspace(workspace);
    return workspace;
  }

  await rm(cwd, { recursive: true, force: true });
  await mkdir(workspaceRoot, { recursive: true, mode: 0o700 });
  try {
    await runCommand('git', ['clone', '--origin', 'origin', '--single-branch', '--branch', gitBaseBranch, gitRepository, cwd], {`,
  'Codebase workspace creation must be empty instead of cloning Sulandra Health',
);

replace(
  `      branch,
      repository: gitRepository,
      createdAt: now(),`,
  `      branch,
      repository: gitRepository,
      workspaceKind: 'engineering',
      createdAt: now(),`,
  'engineering workspace classification',
);

replace(
  `      \`SULANDRA_REPOSITORY=\${gitRepository}\`,
      \`SULANDRA_BASE_BRANCH=\${gitBaseBranch}\`,
      'SULANDRA_TERMINAL_CWD=/projects',`,
  `      ...(workspace.repository ? [
        \`SULANDRA_REPOSITORY=\${workspace.repository}\`,
        \`SULANDRA_BASE_BRANCH=\${gitBaseBranch}\`,
      ] : []),
      'SULANDRA_TERMINAL_CWD=/projects',`,
  'Codebase sessions must not receive Sulandra engineering Git metadata',
);

replace(
  `  await writeFile(excludePath, current, { mode: 0o600 });
  return { projectsPath, homePath };`,
  `  const hasProtectedGitCheckout = await readFile(path.join(workspace.cwd, '.git', 'HEAD'), 'utf8')
    .then(() => true)
    .catch(() => false);
  if (hasProtectedGitCheckout) await writeFile(excludePath, current, { mode: 0o600 });
  return { projectsPath, homePath };`,
  'empty Codebase workspaces must not require a protected Git checkout',
);

source = source.replaceAll('gitBacked: true', 'gitBacked: Boolean(workspace.repository)');

for (const required of [
  marker,
  "workspaceKind: 'codebase'",
  "workspaceKind: 'engineering'",
  "repository: ''",
  "gitBacked: Boolean(workspace.repository)",
  "...(workspace.repository ? [",
  'hasProtectedGitCheckout',
]) {
  if (!source.includes(required)) throw new Error(`Independent Codebase workspace verification missing: ${required}`);
}

fs.writeFileSync(target, source);
console.log('Separated standalone Codebase workspaces from the Sulandra Health engineering repository.');
