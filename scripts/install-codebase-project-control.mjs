import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-codebase-project-control.mjs <execution-server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'CODEBASE_PROJECT_CONTROL_V1';
if (source.includes(marker)) {
  console.log('Codebase project control already installed.');
  process.exit(0);
}
if (!source.includes('CODEBASE_INDEPENDENT_WORKSPACE_V1')) throw new Error('Codebase independence patch must run before project control');
if (!source.includes('CODEBASE_WORKSPACE_REUSE_V1')) throw new Error('Codebase workspace reuse patch must run before project control');

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Codebase project control patch failed: ${label}`);
  source = source.replace(from, to);
};

replace(
  "    repository: workspace.repository || '',\n    workspaceKind: workspace.workspaceKind || (workspace.owner?.startsWith('codebase:') ? 'codebase' : 'engineering'),",
  "    repository: workspace.repository || '',\n    workspaceKind: workspace.workspaceKind || (workspace.owner?.startsWith('codebase:') ? 'codebase' : 'engineering'),\n    activeProject: workspace.activeProject || '',",
  'persist active project',
);

replace(
  "      'SULANDRA_TERMINAL_CWD=/projects',",
  "      `SULANDRA_TERMINAL_CWD=${workspace.activeProject ? '/projects/' + workspace.activeProject : '/projects'}` ,",
  'new terminals start in the active project',
);

const anchor = "app.post('/v1/workspaces/:workspaceId/sessions', async (req, res, next) => {";
if (!source.includes(anchor)) throw new Error('Codebase project route anchor changed');

const projectControl = String.raw`
/* CODEBASE_PROJECT_CONTROL_V1
   Standalone Codebase project manager. /projects is backed by the durable
   .sulandra-projects directory belonging to the owner-scoped Codebase workspace.
   Explorer, editor, Git operations and Railway CLI operations all target this
   same directory that terminal sessions mount read/write at /projects. */
const CODEBASE_PROJECT_EXCLUDED = new Set(['.git', 'node_modules', '.next', 'dist', 'dist-web', 'build', 'coverage', '.cache']);
const CODEBASE_PROJECT_MAX_TREE_ITEMS = Math.max(500, Number(process.env.CODEBASE_PROJECT_MAX_TREE_ITEMS || 6000));
const CODEBASE_PROJECT_MAX_FILE_BYTES = Math.max(64 * 1024, Number(process.env.CODEBASE_PROJECT_MAX_FILE_BYTES || 4 * 1024 * 1024));

const codebaseHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};
const normalizeCodebaseProjectName = raw => {
  const value = String(raw || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value) || value === '.' || value === '..') {
    throw codebaseHttpError(400, 'Project name must use letters, numbers, dots, dashes or underscores.');
  }
  return value;
};
const normalizeCodebaseRelativePath = raw => {
  let value = String(raw || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = value.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '.' || part === '..' || part === '.git')) {
    throw codebaseHttpError(400, 'Invalid project path.');
  }
  return parts.join('/');
};
const codebaseProjectsRoot = workspace => path.join(workspace.cwd, '.sulandra-projects');
const codebaseProjectRoot = (workspace, projectName) => path.join(codebaseProjectsRoot(workspace), normalizeCodebaseProjectName(projectName));
const codebasePath = (workspace, projectName, relativePath) => {
  const root = codebaseProjectRoot(workspace, projectName);
  const relative = normalizeCodebaseRelativePath(relativePath);
  const target = path.resolve(root, ...relative.split('/'));
  if (!target.startsWith(root + path.sep)) throw codebaseHttpError(400, 'Project path escapes the project root.');
  return { root, relative, target };
};
const codebaseExists = async target => {
  try { await readdir(target); return true; } catch (error) { if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false; throw error; }
};
const codebaseGitMetadata = async root => {
  if (!await codebaseExists(path.join(root, '.git'))) return { gitBacked: false, branch: '', remote: '' };
  const branch = await runCommand('git', ['-C', root, 'branch', '--show-current'], { timeoutMs: 10_000 }).then(v => v.stdout.trim()).catch(() => '');
  const remote = await runCommand('git', ['-C', root, 'remote', 'get-url', 'origin'], { timeoutMs: 10_000 }).then(v => v.stdout.trim()).catch(() => '');
  return { gitBacked: true, branch, remote };
};
const codebaseProjectMetadata = async (workspace, name) => {
  const root = codebaseProjectRoot(workspace, name);
  const git = await codebaseGitMetadata(root);
  return { name, path: '/projects/' + name, active: workspace.activeProject === name, ...git };
};
const listCodebaseProjects = async workspace => {
  const root = codebaseProjectsRoot(workspace);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const entries = await readdir(root, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(entry.name));
  directories.sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(directories.map(entry => codebaseProjectMetadata(workspace, entry.name)));
};
const codebaseTree = async (root, directory = root, parent = '', counter = { count: 0 }) => {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const result = [];
  for (const entry of entries) {
    if (counter.count >= CODEBASE_PROJECT_MAX_TREE_ITEMS) break;
    if (entry.isSymbolicLink() || CODEBASE_PROJECT_EXCLUDED.has(entry.name)) continue;
    counter.count += 1;
    const relative = parent ? parent + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      result.push({ id: relative, name: entry.name, type: 'folder', isDirectory: true, children: await codebaseTree(root, path.join(directory, entry.name), relative, counter) });
    } else if (entry.isFile()) {
      result.push({ id: relative, name: entry.name, type: 'file', isDirectory: false });
    }
  }
  return result;
};
const newestCodebaseSession = workspace => [...sessions.values()]
  .filter(item => item.workspaceId === workspace.id && item.owner === workspace.owner)
  .sort((a, b) => Number(b.lastUsedAt || b.createdAt || 0) - Number(a.lastUsedAt || a.createdAt || 0))[0] || null;
const runInCodebaseSession = async (workspace, workingDir, command, args = [], timeoutMs = 180_000) => {
  const session = newestCodebaseSession(workspace);
  if (!session) throw codebaseHttpError(409, 'Start a Codebase terminal before using GitHub or Railway project actions.');
  const container = docker.getContainer(session.containerId);
  const exec = await container.exec({
    Cmd: [command, ...args.map(value => String(value))],
    WorkingDir: workingDir,
    User: '10001:10001',
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false, Tty: true });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { stream.destroy(new Error(command + ' timed out')); } catch {}
      reject(codebaseHttpError(504, command + ' timed out'));
    }, Math.max(5_000, Number(timeoutMs) || 180_000));
    stream.on('data', chunk => {
      output += chunk.toString('utf8');
      if (output.length > 2_000_000) output = output.slice(-2_000_000);
    });
    stream.on('error', error => { clearTimeout(timer); reject(error); });
    stream.on('end', () => { clearTimeout(timer); resolve(); });
    stream.on('close', () => { clearTimeout(timer); resolve(); });
  });
  const info = await exec.inspect();
  if (Number(info.ExitCode) !== 0) throw codebaseHttpError(422, output.trim().slice(-4000) || command + ' failed');
  session.lastUsedAt = now();
  persistSessionSoon(session);
  return output.trim();
};
const normalizeGithubRepo = raw => {
  let value = String(raw || '').trim();
  value = value.replace(/^https?:\/\/github\.com\//i, '').replace(/^git@github\.com:/i, '').replace(/\.git$/i, '').replace(/\/$/, '');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw codebaseHttpError(400, 'GitHub repository must be owner/repository.');
  return value;
};

app.get('/v1/workspaces/:workspaceId/codebase/projects', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const projects = await listCodebaseProjects(workspace);
    if (workspace.activeProject && !projects.some(item => item.name === workspace.activeProject)) {
      workspace.activeProject = '';
      await saveWorkspace(workspace);
    }
    res.json({ workspaceId: workspace.id, activeProject: workspace.activeProject || '', projects });
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/codebase/projects', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const name = normalizeCodebaseProjectName(req.body?.name);
    const root = codebaseProjectRoot(workspace, name);
    if (await codebaseExists(root)) return res.status(409).json({ error: 'A local project with that name already exists.' });
    await mkdir(root, { recursive: false, mode: 0o700 });
    if (req.body?.gitInit !== false) await runInCodebaseSession(workspace, '/projects/' + name, 'git', ['init', '-b', 'main'], 30_000);
    workspace.activeProject = name;
    workspace.lastUsedAt = now();
    await saveWorkspace(workspace);
    res.status(201).json(await codebaseProjectMetadata(workspace, name));
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/codebase/projects/clone', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const repository = normalizeGithubRepo(req.body?.repository);
    const name = normalizeCodebaseProjectName(req.body?.name || repository.split('/').pop());
    const root = codebaseProjectRoot(workspace, name);
    if (await codebaseExists(root)) return res.status(409).json({ error: 'A local project with that name already exists.' });
    const args = ['repo', 'clone', repository, name];
    const branch = String(req.body?.branch || '').trim();
    if (branch) {
      if (!/^[A-Za-z0-9._\/-]{1,120}$/.test(branch) || branch.includes('..')) throw codebaseHttpError(400, 'Invalid branch name.');
      args.push('--', '--branch', branch, '--single-branch');
    }
    await runInCodebaseSession(workspace, '/projects', 'gh', args, 240_000);
    workspace.activeProject = name;
    workspace.lastUsedAt = now();
    await saveWorkspace(workspace);
    res.status(201).json(await codebaseProjectMetadata(workspace, name));
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/codebase/active', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const requested = String(req.body?.project || '').trim();
    if (!requested) {
      workspace.activeProject = '';
      await saveWorkspace(workspace);
      return res.json({ activeProject: '' });
    }
    const project = normalizeCodebaseProjectName(requested);
    if (!await codebaseExists(codebaseProjectRoot(workspace, project))) return res.status(404).json({ error: 'Project not found' });
    workspace.activeProject = project;
    workspace.lastUsedAt = now();
    await saveWorkspace(workspace);
    res.json({ activeProject: project, path: '/projects/' + project });
  } catch (error) { next(error); }
});
app.delete('/v1/workspaces/:workspaceId/codebase/projects/:project', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    await rm(codebaseProjectRoot(workspace, project), { recursive: true, force: true });
    if (workspace.activeProject === project) workspace.activeProject = '';
    await saveWorkspace(workspace);
    res.json({ ok: true, removed: project, activeProject: workspace.activeProject || '' });
  } catch (error) { next(error); }
});
app.get('/v1/workspaces/:workspaceId/codebase/projects/:project/tree', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const root = codebaseProjectRoot(workspace, project);
    if (!await codebaseExists(root)) return res.status(404).json({ error: 'Project not found' });
    res.json({ project, tree: await codebaseTree(root) });
  } catch (error) { next(error); }
});
app.get('/v1/workspaces/:workspaceId/codebase/projects/:project/file', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const { target, relative } = codebasePath(workspace, project, req.query.path);
    const content = await readFile(target, 'utf8');
    if (Buffer.byteLength(content, 'utf8') > CODEBASE_PROJECT_MAX_FILE_BYTES) return res.status(413).json({ error: 'File is too large for inline editing.' });
    res.set('Cache-Control', 'no-store');
    res.json({ project, path: relative, content });
  } catch (error) { if (error?.code === 'ENOENT') return res.status(404).json({ error: 'File not found' }); next(error); }
});
app.put('/v1/workspaces/:workspaceId/codebase/projects/:project/file', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (Buffer.byteLength(content, 'utf8') > CODEBASE_PROJECT_MAX_FILE_BYTES) return res.status(413).json({ error: 'File is too large for inline editing.' });
    const { target, relative } = codebasePath(workspace, project, req.body?.path);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, content, 'utf8');
    res.json({ ok: true, project, path: relative });
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/file', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (Buffer.byteLength(content, 'utf8') > CODEBASE_PROJECT_MAX_FILE_BYTES) return res.status(413).json({ error: 'File is too large for inline editing.' });
    const { target, relative } = codebasePath(workspace, project, req.body?.path);
    if (await readFile(target, 'utf8').then(() => true).catch(error => error?.code === 'ENOENT' ? false : Promise.reject(error))) return res.status(409).json({ error: 'File already exists.' });
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
    res.status(201).json({ ok: true, project, path: relative });
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/folder', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const { target, relative } = codebasePath(workspace, project, req.body?.path);
    if (await codebaseExists(target)) return res.status(409).json({ error: 'File or folder already exists.' });
    await mkdir(target, { recursive: true, mode: 0o700 });
    res.status(201).json({ ok: true, project, path: relative });
  } catch (error) { next(error); }
});
app.delete('/v1/workspaces/:workspaceId/codebase/projects/:project/file', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const { target, relative } = codebasePath(workspace, project, req.query.path);
    await rm(target, { recursive: true, force: true });
    res.json({ ok: true, project, path: relative });
  } catch (error) { next(error); }
});
app.get('/v1/workspaces/:workspaceId/codebase/projects/:project/git/status', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const root = codebaseProjectRoot(workspace, project);
    const meta = await codebaseGitMetadata(root);
    if (!meta.gitBacked) return res.status(409).json({ error: 'This project is not a Git repository.' });
    const output = await runCommand('git', ['-C', root, 'status', '--short', '--branch'], { timeoutMs: 10_000 }).then(v => v.stdout.trim());
    res.json({ ...meta, status: output });
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/git/commit', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const message = String(req.body?.message || '').trim();
    if (!message || message.length > 240) return res.status(400).json({ error: 'Commit message must be 1-240 characters.' });
    const cwd = '/projects/' + project;
    const changes = await runInCodebaseSession(workspace, cwd, 'git', ['status', '--porcelain'], 20_000);
    if (!changes.trim()) return res.json({ committed: false, pushed: false, message: 'No changes to commit.' });
    await runInCodebaseSession(workspace, cwd, 'git', ['add', '-A'], 20_000);
    const commitOutput = await runInCodebaseSession(workspace, cwd, 'git', ['commit', '-m', message], 60_000);
    let pushed = false;
    let pushError = '';
    if (req.body?.push !== false) {
      try { await runInCodebaseSession(workspace, cwd, 'git', ['push'], 120_000); pushed = true; }
      catch (error) { pushError = error.message; }
    }
    const sha = await runInCodebaseSession(workspace, cwd, 'git', ['rev-parse', 'HEAD'], 20_000);
    res.json({ committed: true, pushed, commit: sha.trim(), output: commitOutput.slice(-4000), pushError });
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/git/push', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const output = await runInCodebaseSession(workspace, '/projects/' + project, 'git', ['push'], 120_000);
    res.json({ ok: true, output: output.slice(-4000) });
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/git/pull', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const output = await runInCodebaseSession(workspace, '/projects/' + project, 'git', ['pull', '--ff-only'], 120_000);
    res.json({ ok: true, output: output.slice(-4000) });
  } catch (error) { next(error); }
});
app.get('/v1/workspaces/:workspaceId/codebase/projects/:project/railway/status', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const output = await runInCodebaseSession(workspace, '/projects/' + project, 'railway', ['status', '--json'], 30_000);
    let status = {}; try { status = JSON.parse(output); } catch { status = { raw: output }; }
    res.json({ linked: true, status });
  } catch (error) {
    if (Number(error?.status) === 422) return res.json({ linked: false, status: null, message: error.message });
    next(error);
  }
});
app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/railway/link', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const projectName = normalizeCodebaseProjectName(req.params.project);
    const railwayProject = String(req.body?.project || '').trim();
    const environment = String(req.body?.environment || '').trim();
    const service = String(req.body?.service || '').trim();
    if (!railwayProject || railwayProject.length > 160) return res.status(400).json({ error: 'Railway project ID or name is required.' });
    const args = ['link', '--project', railwayProject];
    if (environment) args.push('--environment', environment);
    if (service) args.push('--service', service);
    args.push('--json');
    const output = await runInCodebaseSession(workspace, '/projects/' + projectName, 'railway', args, 60_000);
    let linked = {}; try { linked = JSON.parse(output); } catch { linked = { raw: output }; }
    res.json({ ok: true, linked });
  } catch (error) { next(error); }
});
app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/railway/deploy', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const projectName = normalizeCodebaseProjectName(req.params.project);
    const mode = String(req.body?.mode || 'linked').trim();
    const args = ['up', '--detach'];
    if (mode === 'new') {
      args.push('--new');
      const name = String(req.body?.name || projectName).trim();
      if (name) args.push('--name', name);
    } else {
      const environment = String(req.body?.environment || '').trim();
      const service = String(req.body?.service || '').trim();
      if (environment) args.push('--environment', environment);
      if (service) args.push('--service', service);
    }
    const output = await runInCodebaseSession(workspace, '/projects/' + projectName, 'railway', args, 300_000);
    res.json({ ok: true, mode, output: output.slice(-8000) });
  } catch (error) { next(error); }
});

`;

source = source.replace(anchor, projectControl + anchor);

for (const required of [
  marker,
  "path.join(workspace.cwd, '.sulandra-projects')",
  "app.get('/v1/workspaces/:workspaceId/codebase/projects'",
  "app.post('/v1/workspaces/:workspaceId/codebase/projects/clone'",
  "app.post('/v1/workspaces/:workspaceId/codebase/active'",
  "app.put('/v1/workspaces/:workspaceId/codebase/projects/:project/file'",
  "app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/git/commit'",
  "app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/railway/deploy'",
  "SULANDRA_TERMINAL_CWD=${workspace.activeProject ? '/projects/' + workspace.activeProject : '/projects'}",
  'activeProject: workspace.activeProject ||',
]) {
  if (!source.includes(required)) throw new Error(`Codebase project control verification missing: ${required}`);
}

fs.writeFileSync(target, source);
console.log('Installed durable Codebase project/files/GitHub/Railway control plane.');
