import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-codebase-explorer-file-management.mjs <server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const executorMarker = 'CODEBASE_EXPLORER_FILE_OPERATIONS_V1';
const gatewayMarker = 'CODEBASE_EXPLORER_FILE_OPERATIONS_GATEWAY_V1';
const uploadExecutorMarker = 'CODEBASE_EXPLORER_BINARY_UPLOAD_V2';
const uploadGatewayMarker = 'CODEBASE_EXPLORER_BINARY_UPLOAD_GATEWAY_V2';
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

if (source.includes('CODEBASE_PROJECT_CONTROL_V1') && !source.includes(uploadExecutorMarker)) {
  const anchor = "app.get('/v1/workspaces/:workspaceId/codebase/projects/:project/git/status', async (req, res, next) => {";
  if (!source.includes(anchor)) throw new Error('Codebase Explorer upload anchor changed in execution server');
  const block = String.raw`
/* CODEBASE_EXPLORER_BINARY_UPLOAD_V2
   Arbitrary-format Explorer uploads are streamed as bounded base64 chunks so
   the existing 128kb authenticated JSON transport never needs a larger body
   parser. Exact bytes are written to a private temp file and atomically moved
   into the selected project only after the final size check succeeds. */
const {
  lstat: codebaseUploadLstat,
  open: codebaseUploadOpen,
  rename: codebaseUploadRename,
  rm: codebaseUploadRm,
} = await import('node:fs/promises');
const CODEBASE_PROJECT_MAX_UPLOAD_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.CODEBASE_PROJECT_MAX_UPLOAD_BYTES || 2 * 1024 * 1024 * 1024),
);
const CODEBASE_PROJECT_UPLOAD_CHUNK_BYTES = 64 * 1024;
const CODEBASE_PROJECT_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
const codebaseUploads = new Map();
const codebaseUploadEntry = async target => {
  try { return await codebaseUploadLstat(target); }
  catch (error) { if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null; throw error; }
};
const codebaseUploadMime = raw => {
  const value = String(raw || 'application/octet-stream').trim().toLowerCase().slice(0, 160);
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+*-]+(?:\s*;\s*[a-z0-9._-]+=[a-z0-9._-]+)*$/i.test(value)
    ? value
    : 'application/octet-stream';
};
const codebaseUploadCategory = (relative, mimeType) => {
  const lower = String(relative || '').toLowerCase();
  const ext = path.extname(lower).slice(1);
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (['doc','docx','odt','rtf'].includes(ext)) return 'document';
  if (['xls','xlsx','ods','csv'].includes(ext)) return 'spreadsheet';
  if (['ppt','pptx','odp'].includes(ext)) return 'presentation';
  if (['zip','tar','gz','tgz','bz2','xz','7z','rar'].includes(ext)) return 'archive';
  if (['ttf','otf','woff','woff2','eot'].includes(ext)) return 'font';
  if (['exe','msi','dll','so','dylib','bin','dat','wasm','jar','apk','aab','ipa','dmg','pkg','iso'].includes(ext)) return 'binary';
  return ext || 'file';
};
const cleanupCodebaseUploads = async () => {
  const cutoff = Date.now() - CODEBASE_PROJECT_UPLOAD_TTL_MS;
  const stale = [...codebaseUploads.entries()].filter(([, record]) => record.createdAt < cutoff);
  for (const [uploadId, record] of stale) {
    codebaseUploads.delete(uploadId);
    await codebaseUploadRm(record.temp, { force: true }).catch(() => {});
  }
};
const requireCodebaseUpload = (req, workspace, project) => {
  const uploadId = String(req.body?.uploadId || '').trim();
  const record = codebaseUploads.get(uploadId);
  if (!record || record.workspaceId !== workspace.id || record.project !== project) {
    throw codebaseHttpError(404, 'Upload session not found or expired.');
  }
  record.lastUsedAt = Date.now();
  return { uploadId, record };
};

app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/upload/start', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const targetInfo = codebasePath(workspace, project, req.body?.path);
    const size = Number(req.body?.size);
    if (!Number.isSafeInteger(size) || size < 0) throw codebaseHttpError(400, 'Upload size must be a non-negative integer.');
    if (size > CODEBASE_PROJECT_MAX_UPLOAD_BYTES) {
      throw codebaseHttpError(413, 'File exceeds the configured Codebase upload limit.');
    }
    const overwrite = req.body?.overwrite === true;
    const existing = await codebaseUploadEntry(targetInfo.target);
    if (existing && !overwrite) return res.status(409).json({ error: 'A file or folder already exists at the destination.' });
    if (existing && (existing.isDirectory() || existing.isSymbolicLink())) {
      return res.status(409).json({ error: 'Upload cannot replace a folder or symbolic link.' });
    }

    await cleanupCodebaseUploads();
    const uploadId = 'cbu_' + crypto.randomUUID();
    const tempRoot = path.join(codebaseProjectsRoot(workspace), '.sulandra-upload-tmp', project);
    await mkdir(tempRoot, { recursive: true, mode: 0o700 });
    const temp = path.join(tempRoot, uploadId + '.part');
    const handle = await codebaseUploadOpen(temp, 'wx', 0o600);
    await handle.close();

    const mimeType = codebaseUploadMime(req.body?.mimeType);
    const nowMs = Date.now();
    codebaseUploads.set(uploadId, {
      workspaceId: workspace.id,
      project,
      relative: targetInfo.relative,
      target: targetInfo.target,
      temp,
      size,
      received: 0,
      overwrite,
      mimeType,
      lastModified: Number(req.body?.lastModified || 0) || 0,
      createdAt: nowMs,
      lastUsedAt: nowMs,
    });
    res.status(201).json({
      ok: true,
      uploadId,
      project,
      path: targetInfo.relative,
      size,
      mimeType,
      category: codebaseUploadCategory(targetInfo.relative, mimeType),
      chunkSize: CODEBASE_PROJECT_UPLOAD_CHUNK_BYTES,
      maxUploadBytes: CODEBASE_PROJECT_MAX_UPLOAD_BYTES,
    });
  } catch (error) { next(error); }
});

app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/upload/chunk', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const { uploadId, record } = requireCodebaseUpload(req, workspace, project);
    const offset = Number(req.body?.offset);
    if (!Number.isSafeInteger(offset) || offset !== record.received) {
      throw codebaseHttpError(409, 'Upload chunk offset is out of sequence.');
    }
    const encoded = String(req.body?.data || '');
    if (!encoded || encoded.length > 96 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw codebaseHttpError(400, 'Upload chunk encoding is invalid.');
    }
    const chunk = Buffer.from(encoded, 'base64');
    if (!chunk.length || chunk.length > CODEBASE_PROJECT_UPLOAD_CHUNK_BYTES) {
      throw codebaseHttpError(413, 'Upload chunk exceeds the Codebase chunk limit.');
    }
    if (record.received + chunk.length > record.size) {
      throw codebaseHttpError(400, 'Upload would exceed the declared file size.');
    }
    const handle = await codebaseUploadOpen(record.temp, 'r+');
    try { await handle.write(chunk, 0, chunk.length, record.received); }
    finally { await handle.close(); }
    record.received += chunk.length;
    res.json({ ok: true, uploadId, received: record.received, size: record.size });
  } catch (error) { next(error); }
});

app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/upload/finish', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const { uploadId, record } = requireCodebaseUpload(req, workspace, project);
    if (record.received !== record.size) {
      throw codebaseHttpError(409, 'Upload is incomplete. Continue sending chunks before finishing.');
    }
    const existing = await codebaseUploadEntry(record.target);
    if (existing) {
      if (!record.overwrite) throw codebaseHttpError(409, 'A file or folder already exists at the destination.');
      if (existing.isDirectory() || existing.isSymbolicLink()) throw codebaseHttpError(409, 'Upload cannot replace a folder or symbolic link.');
      await codebaseUploadRm(record.target, { force: true });
    }
    await mkdir(path.dirname(record.target), { recursive: true, mode: 0o700 });
    await codebaseUploadRename(record.temp, record.target);
    codebaseUploads.delete(uploadId);
    res.json({
      ok: true,
      uploaded: true,
      project,
      path: record.relative,
      size: record.size,
      mimeType: record.mimeType,
      category: codebaseUploadCategory(record.relative, record.mimeType),
    });
  } catch (error) { next(error); }
});

app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/upload/abort', async (req, res, next) => {
  try {
    const workspace = getWorkspace(req, req.params.workspaceId);
    if (!workspace || workspace.workspaceKind !== 'codebase') return res.status(404).json({ error: 'Codebase workspace not found' });
    const project = normalizeCodebaseProjectName(req.params.project);
    const { uploadId, record } = requireCodebaseUpload(req, workspace, project);
    codebaseUploads.delete(uploadId);
    await codebaseUploadRm(record.temp, { force: true }).catch(() => {});
    res.json({ ok: true, aborted: true, uploadId });
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

if (source.includes('CODEBASE_PROJECT_GATEWAY_V1') && !source.includes(uploadGatewayMarker)) {
  const anchor = "app.get('/codebase/projects/:project/git/status', async (req, res, next) => {";
  if (!source.includes(anchor)) throw new Error('Codebase Explorer upload anchor changed in gateway server');
  const block = String.raw`
/* CODEBASE_EXPLORER_BINARY_UPLOAD_GATEWAY_V2 */
app.post('/codebase/projects/:project/upload/start', async (req, res, next) => {
  try { res.status(201).json(await codebaseBrowserRequest(req, projectSuffix(req) + '/upload/start', { method: 'POST', body: req.body || {}, timeoutMs: 30_000 })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/upload/chunk', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/upload/chunk', { method: 'POST', body: req.body || {}, timeoutMs: 120_000 })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/upload/finish', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/upload/finish', { method: 'POST', body: req.body || {}, timeoutMs: 60_000 })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/upload/abort', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/upload/abort', { method: 'POST', body: req.body || {}, timeoutMs: 30_000 })); }
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
  console.log('Codebase Explorer file management and uploads already installed.');
  process.exit(0);
}
if (source.includes('CODEBASE_PROJECT_CONTROL_V1')) {
  for (const required of [
    executorMarker,
    "app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/move'",
    'codebaseRename(sourceInfo.target, targetInfo.target)',
    'A folder cannot be moved or copied inside itself.',
    uploadExecutorMarker,
    "app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/upload/start'",
    "app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/upload/chunk'",
    "app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/upload/finish'",
    "app.post('/v1/workspaces/:workspaceId/codebase/projects/:project/upload/abort'",
    'CODEBASE_PROJECT_UPLOAD_CHUNK_BYTES = 64 * 1024',
    "path.join(codebaseProjectsRoot(workspace), '.sulandra-upload-tmp', project)",
  ]) {
    if (!source.includes(required)) throw new Error(`Codebase Explorer executor verification missing: ${required}`);
  }
}
if (source.includes('CODEBASE_PROJECT_GATEWAY_V1')) {
  for (const required of [
    gatewayMarker,
    "app.post('/codebase/projects/:project/move'",
    "projectSuffix(req) + '/move'",
    uploadGatewayMarker,
    "app.post('/codebase/projects/:project/upload/start'",
    "app.post('/codebase/projects/:project/upload/chunk'",
    "app.post('/codebase/projects/:project/upload/finish'",
    "app.post('/codebase/projects/:project/upload/abort'",
  ]) {
    if (!source.includes(required)) throw new Error(`Codebase Explorer gateway verification missing: ${required}`);
  }
}
fs.writeFileSync(target, source);
console.log('Installed Codebase Explorer rename/move/copy plus binary-safe chunked uploads.');
