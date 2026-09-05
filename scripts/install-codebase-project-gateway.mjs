import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-codebase-project-gateway.mjs <gateway-server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'CODEBASE_PROJECT_GATEWAY_V1';
if (source.includes(marker)) {
  console.log('Codebase project gateway already installed.');
  process.exit(0);
}
if (!source.includes('CODEBASE_PTY_COMPAT_V1') || !source.includes('CODEBASE_OWNER_NAMESPACE_V2')) {
  throw new Error('Codebase PTY compatibility must be installed before the project gateway');
}

const anchor = 'app.use(authenticateInternal);';
if (!source.includes(anchor)) throw new Error('Codebase project gateway auth anchor changed');

const gateway = String.raw`
/* CODEBASE_PROJECT_GATEWAY_V1
   Browser-authenticated project management routes for standalone Codebase.
   They deliberately use the codebase:<org>:<user> namespace and therefore can
   never address the Sulandra IT / Engineering workspace owner namespace. */
const codebaseAllowedOrigins = new Set([
  'https://sulandrahealth.com',
  'https://www.sulandrahealth.com',
  'https://portal.sulandrahealth.com',
]);
app.use('/codebase', (req, res, next) => {
  const origin = String(req.headers.origin || '');
  if (origin && codebaseAllowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.status(origin && codebaseAllowedOrigins.has(origin) ? 204 : 403).end();
  next();
});
const authenticateCodebaseBrowser = async (req, res, next) => {
  const authorization = String(req.headers.authorization || '').trim();
  const token = /^Bearer\s+/i.test(authorization) ? authorization.replace(/^Bearer\s+/i, '').trim() : '';
  const verification = await verifyBrowserToken(token);
  if (!verification.auth) return res.status(401).json({ error: 'Codebase authentication failed: ' + verification.reason });
  req.sulandraCodebaseAuth = verification.auth;
  next();
};
const codebaseBrowserOwner = req => {
  const auth = req.sulandraCodebaseAuth;
  return 'codebase:' + auth.organizationId + ':' + auth.userId;
};
const codebaseBrowserRequest = async (req, suffix, options = {}) => {
  const owner = codebaseBrowserOwner(req);
  const workspaceId = await ensureCodebaseCompatWorkspace(owner);
  const ownerReq = codebaseOwnerRequest(owner);
  const pathname = '/v1/workspaces/' + encodeURIComponent(workspaceId) + '/codebase' + suffix;
  return executionRequest(ownerReq, pathname, options);
};
const encodeProject = value => encodeURIComponent(String(value || ''));
const projectSuffix = req => '/projects/' + encodeProject(req.params.project);
const withQueryPath = req => {
  const value = String(req.query.path || '');
  return value ? '?path=' + encodeURIComponent(value) : '';
};

app.use('/codebase', authenticateCodebaseBrowser);
app.get('/codebase/projects', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, '/projects')); }
  catch (error) { next(error); }
});
app.post('/codebase/projects', async (req, res, next) => {
  try { res.status(201).json(await codebaseBrowserRequest(req, '/projects', { method: 'POST', body: req.body || {} })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/clone', async (req, res, next) => {
  try { res.status(201).json(await codebaseBrowserRequest(req, '/projects/clone', { method: 'POST', body: req.body || {}, timeoutMs: 260_000 })); }
  catch (error) { next(error); }
});
app.post('/codebase/active', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, '/active', { method: 'POST', body: req.body || {} })); }
  catch (error) { next(error); }
});
app.delete('/codebase/projects/:project', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req), { method: 'DELETE' })); }
  catch (error) { next(error); }
});
app.get('/codebase/projects/:project/tree', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/tree')); }
  catch (error) { next(error); }
});
app.get('/codebase/projects/:project/file', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/file' + withQueryPath(req))); }
  catch (error) { next(error); }
});
app.put('/codebase/projects/:project/file', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/file', { method: 'PUT', body: req.body || {} })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/file', async (req, res, next) => {
  try { res.status(201).json(await codebaseBrowserRequest(req, projectSuffix(req) + '/file', { method: 'POST', body: req.body || {} })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/folder', async (req, res, next) => {
  try { res.status(201).json(await codebaseBrowserRequest(req, projectSuffix(req) + '/folder', { method: 'POST', body: req.body || {} })); }
  catch (error) { next(error); }
});
app.delete('/codebase/projects/:project/file', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/file' + withQueryPath(req), { method: 'DELETE' })); }
  catch (error) { next(error); }
});
app.get('/codebase/projects/:project/git/status', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/git/status')); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/git/commit', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/git/commit', { method: 'POST', body: req.body || {}, timeoutMs: 160_000 })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/git/push', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/git/push', { method: 'POST', body: {}, timeoutMs: 140_000 })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/git/pull', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/git/pull', { method: 'POST', body: {}, timeoutMs: 140_000 })); }
  catch (error) { next(error); }
});
app.get('/codebase/projects/:project/railway/status', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/railway/status', { timeoutMs: 40_000 })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/railway/link', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/railway/link', { method: 'POST', body: req.body || {}, timeoutMs: 80_000 })); }
  catch (error) { next(error); }
});
app.post('/codebase/projects/:project/railway/deploy', async (req, res, next) => {
  try { res.json(await codebaseBrowserRequest(req, projectSuffix(req) + '/railway/deploy', { method: 'POST', body: req.body || {}, timeoutMs: 320_000 })); }
  catch (error) { next(error); }
});

`;

source = source.replace(anchor, gateway + anchor);
for (const required of [
  marker,
  "app.get('/codebase/projects'",
  "app.post('/codebase/projects/clone'",
  "app.post('/codebase/active'",
  "app.put('/codebase/projects/:project/file'",
  "app.post('/codebase/projects/:project/git/commit'",
  "app.post('/codebase/projects/:project/railway/deploy'",
  "'codebase:' + auth.organizationId + ':' + auth.userId",
  'ensureCodebaseCompatWorkspace(owner)',
  'codebaseAllowedOrigins',
]) {
  if (!source.includes(required)) throw new Error(`Codebase project gateway verification missing: ${required}`);
}
fs.writeFileSync(target, source);
console.log('Installed authenticated standalone Codebase project gateway.');
