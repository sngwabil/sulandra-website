import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-codebase-explorer-file-management.mjs <server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const executorMarker = 'CODEBASE_EXPLORER_FILE_OPERATIONS_V1';
const gatewayMarker = 'CODEBASE_EXPLORER_FILE_OPERATIONS_GATEWAY_V1';
let changed = false;

if (source.includes('CODEBASE_PROJECT_CONTROL_V1') && !source.includes(executorMarker)) {
  const anchor = "app.get('/v1/workspaces/:workspaceId/codebase/projects/:project/git/status', async (req, res, next) => {";
  if (!source.includes(anchor)) throw new Error('Codebase Explorer operation anchor changed in execution server');
  const block = String.raw`
/* CODEBASE_EXPLORER_FILE_OPERATIONS_V1
   Safe Explorer rename/move/duplicate operations for files and folders. */
const { lstat: codebaseLstat, rename: codebaseRename } = await import('node:fs/promises');
const codebaseExplorerEntry = async target => {
  try { return await codebaseLstat(target); }
  catch (error) { if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null; throw error; }
};
app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/move', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const sourceInfo = codebasePath(workspace, project, req.body?.source);
    const targetInfo = codebasePath(workspace, project, req.body?.target);
    const copy = req.body?.copy === true;
    if (sourceInfo.relative === targetInfo.relative) return res.json({ ok: true, copied: false, moved: false, project, source: sourceInfo.relative, path: targetInfo.relative });
    const sourceStat = await codebaseExplorerEntry(sourceInfo.target);
    if (!sourceStat) return res.status(404).json({ error: 'Source file or folder not found.' });
    if (sourceStat.isSymbolicLink()) return res.status(400).json({ error: 'Explorer operations do not follow symbolic links.' });
    const existingTarget = await codebaseExplorerEntry(targetInfo.target);
    if (existingTarget) return res.status(409).json({ error: 'A file or folder already exists at the destination.' });
    if (sourceStat.isDirectory() && targetInfo.target.startsWith(sourceInfo.target + path.sep)) {
      return res.status(400).json({ error: 'A folder cannot be moved or copied inside itself.' });
    }
    await mkdir(path.dirname(targetInfo.target), { recursive: true, mode: 0o700 });
    if (copy) {
      await cp(sourceInfo.target, targetInfo.target, { recursive: sourceStat.isDirectory(), force: false, errorOnExist: true, dereference: false });
    } else {
      await codebaseRename(sourceInfo.target, targetInfo.target);
    }
    res.json({ ok: true, copied: copy, moved: !copy, isDirectory: sourceStat.isDirectory(), project, source: sourceInfo.relative, path: targetInfo.relative });
  } catch (error) { next(error); }
});

`;
  source = source.replace(anchor, block + anchor);
  changed = true;
}

if (source.includes('CODEBASE_PROJECT_GATEWAY_V1') && !source.includes(gatewayMarker)) {
  const anchor = "app.get('/codebase/projects/:project/git/status', async (req, res, next) => {";
  if (!source.includes(anchor)) throw new Error('Codebase Explorer operation anchor changed in gateway server');
  const block = String.raw`
/* CODEBASE_EXPLORER_FILE_OPERATIONS_GATEWAY_V1 */
app.post('/codebase/projects/:project/move', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/move', { method: 'POST', body: req.body || {}, timeoutMs: 60_000 })); }
  catch (error) { next(error); }
});

`;
  source = source.replace(anchor, block + anchor);
  changed = true;
}

if (!source.includes('CODEBASE_PROJECT_CONTROL_V1') && !source.includes('CODEBASE_PROJECT_GATEWAY_V1')) {
  throw new Error('Codebase project control or gateway must be installed before Explorer file management');
}
if (!changed) {
  console.log('Codebase Explorer file management already installed.');
  process.exit(0);
}
if (source.includes('CODEBASE_PROJECT_CONTROL_V1')) {
  for (const required of [executorMarker, "app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/move'", 'codebaseRename(sourceInfo.target, targetInfo.target)', 'A folder cannot be moved or copied inside itself.']) {
    if (!source.includes(required)) throw new Error(`Codebase Explorer executor verification missing: ${required}`);
  }
}
if (source.includes('CODEBASE_PROJECT_GATEWAY_V1')) {
  for (const required of [gatewayMarker, "app.post('/codebase/projects/:project/move'", "projectSuffix(req) + '/move'"]) {
    if (!source.includes(required)) throw new Error(`Codebase Explorer gateway verification missing: ${required}`);
  }
}
fs.writeFileSync(target, source);
console.log('Installed Codebase Explorer rename/move/copy filesystem operations.');
