import crypto from 'node:crypto';
import path from 'node:path';
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { simpleGit } from 'simple-git';

const { Pool } = pg;
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '3mb' }));

const port = Number(process.env.PORT || 4000);
const workspaceDir = path.resolve(process.env.WORKSPACE_DIR || './workspace');
const repository = String(process.env.CODEBASE_GIT_REPOSITORY || process.env.SULANDRA_GITHUB_REPOSITORY || 'https://github.com/sngwabil/sulandra-website.git').trim();
const gitBranch = String(process.env.CODEBASE_GIT_BRANCH || process.env.IT_AGENT_GITHUB_BASE_BRANCH || 'release/sulandra-1.0').trim();
const githubToken = String(process.env.GITHUB_TOKEN || process.env.SULANDRA_GITHUB_TOKEN || '').trim();
const jwtSecret = String(process.env.JWT_SECRET || '').trim();
const authMode = String(process.env.CODEBASE_AUTH_MODE || 'jwt').trim().toLowerCase();
const allowedRoles = new Set(String(process.env.CODEBASE_ALLOWED_ROLES || 'ADMINISTRATOR,CEO,COO').split(',').map(v => v.trim()).filter(Boolean));
const fileLimitBytes = Math.max(64 * 1024, Number(process.env.CODEBASE_MAX_FILE_BYTES || 2 * 1024 * 1024));
const corsOrigins = String(process.env.CORS_ORIGIN || 'https://sulandrahealth.com,https://www.sulandrahealth.com').split(',').map(v => v.trim()).filter(Boolean);
const openAiKey = String(process.env.OPENAI_API_KEY || '').trim();
const siaModel = String(process.env.SIA_OPENAI_MODEL || 'gpt-5-mini').trim();
const databaseUrl = String(process.env.DATABASE_URL || '').trim();

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port');
if (!['jwt', 'permissive'].includes(authMode)) throw new Error('CODEBASE_AUTH_MODE must be jwt or permissive');
if (authMode === 'jwt' && !jwtSecret) throw new Error('JWT_SECRET is required when CODEBASE_AUTH_MODE=jwt');

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by Codebase CORS policy'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Sulandra-Company-Id', 'X-Sulandra-Legal-Entity-Id'],
  credentials: false,
  maxAge: 86400,
}));
app.options('*', cors());

const bearer = req => {
  const value = String(req.headers.authorization || '').trim();
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, '').trim() : '';
};

const authenticate = (req, res, next) => {
  const token = bearer(req);
  if (!token) {
    if (authMode === 'permissive') { req.codebaseAuth = { mode: 'permissive', sub: 'anonymous' }; return next(); }
    return res.status(401).json({ error: 'Bearer token required' });
  }
  if (!jwtSecret) {
    if (authMode === 'permissive') { req.codebaseAuth = { mode: 'permissive', sub: 'token-present' }; return next(); }
    return res.status(503).json({ error: 'JWT validation is not configured' });
  }
  try {
    const claims = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (typeof claims === 'string') throw new Error('Invalid token claims');
    const role = String(claims.role || '');
    if (allowedRoles.size && role && !allowedRoles.has(role)) return res.status(403).json({ error: 'Codebase access is not allowed for this role' });
    req.codebaseAuth = claims;
    next();
  } catch (error) {
    if (authMode === 'permissive') { req.codebaseAuth = { mode: 'permissive', sub: 'invalid-token' }; return next(); }
    return res.status(401).json({ error: 'Invalid or expired bearer token' });
  }
};

const gitEnvironment = () => {
  if (!githubToken) return process.env;
  const basic = Buffer.from(`x-access-token:${githubToken}`, 'utf8').toString('base64');
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    GIT_TERMINAL_PROMPT: '0',
  };
};

const gitFor = baseDir => simpleGit({ baseDir, maxConcurrentProcesses: 1 }).env(gitEnvironment());

const ensureWorkspace = async () => {
  await mkdir(path.dirname(workspaceDir), { recursive: true });
  const gitDir = path.join(workspaceDir, '.git');
  let hasGit = false;
  try { hasGit = (await lstat(gitDir)).isDirectory(); } catch {}
  if (!hasGit) {
    await rm(workspaceDir, { recursive: true, force: true });
    await mkdir(path.dirname(workspaceDir), { recursive: true });
    const parentGit = gitFor(path.dirname(workspaceDir));
    await parentGit.clone(repository, workspaceDir, ['--branch', gitBranch, '--single-branch']);
  }
  const git = gitFor(workspaceDir);
  await git.addConfig('user.name', process.env.CODEBASE_GIT_USER_NAME || 'Sulandra Codebase');
  await git.addConfig('user.email', process.env.CODEBASE_GIT_USER_EMAIL || 'admin@sulandrahealth.com');
  const current = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
  if (current !== gitBranch) await git.checkout(gitBranch);
  return git;
};

let git = await ensureWorkspace();

const excludedNames = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db', 'dist-web', 'coverage']);
const isPrivateName = name => /^\.env(?:\.|$)/i.test(name) || /(?:credential|secret|private[-_]?key)/i.test(name);
const normalizeRelative = raw => {
  let value = String(raw || '');
  try { value = decodeURIComponent(value); } catch {}
  value = value.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = value.split('/').filter(Boolean);
  if (!segments.length || segments.some(segment => segment === '.' || segment === '..' || excludedNames.has(segment) || isPrivateName(segment))) {
    const error = new Error('Invalid or restricted workspace path');
    error.status = 400;
    throw error;
  }
  return segments.join('/');
};
const resolveWorkspacePath = raw => {
  const relative = normalizeRelative(raw);
  const target = path.resolve(workspaceDir, ...relative.split('/'));
  if (target !== workspaceDir && !target.startsWith(workspaceDir + path.sep)) {
    const error = new Error('Workspace path escapes the allowed root');
    error.status = 400;
    throw error;
  }
  return { relative, target };
};

const tree = async (directory = workspaceDir, parent = '') => {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const output = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || excludedNames.has(entry.name) || isPrivateName(entry.name)) continue;
    const relative = parent ? `${parent}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      output.push({ id: relative, name: entry.name, type: 'folder', isDirectory: true, children: await tree(path.join(directory, entry.name), relative) });
    } else if (entry.isFile()) {
      output.push({ id: relative, name: entry.name, type: 'file', isDirectory: false });
    }
  }
  return output;
};

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl, max: 3, ssl: String(process.env.DATABASE_SSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined }) : null;

app.get('/health', async (_req, res) => {
  let db = 'not-configured';
  if (pool) {
    try { await pool.query('select 1'); db = 'ready'; } catch { db = 'unreachable'; }
  }
  res.status(db === 'unreachable' ? 503 : 200).json({ ok: db !== 'unreachable', service: 'codebase-e2e-api', workspace: workspaceDir, branch: gitBranch, database: db });
});

app.use('/api', authenticate);

app.get('/api/files', async (_req, res, next) => {
  try { res.json(await tree()); } catch (error) { next(error); }
});

app.get('/api/files/*', async (req, res, next) => {
  try {
    const { target } = resolveWorkspacePath(req.params[0]);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) return res.status(404).json({ error: 'File not found' });
    if (info.size > fileLimitBytes) return res.status(413).json({ error: 'File is too large for inline editing' });
    res.set('Cache-Control', 'no-store');
    res.json({ content: await readFile(target, 'utf8') });
  } catch (error) {
    if (error?.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    next(error);
  }
});

app.put('/api/files/*', async (req, res, next) => {
  try {
    if (typeof req.body?.content !== 'string') return res.status(400).json({ error: 'content must be a string' });
    if (Buffer.byteLength(req.body.content, 'utf8') > fileLimitBytes) return res.status(413).json({ error: 'File content is too large' });
    const { target, relative } = resolveWorkspacePath(req.params[0]);
    await mkdir(path.dirname(target), { recursive: true });
    const existing = await lstat(target).catch(() => null);
    if (existing?.isSymbolicLink()) return res.status(400).json({ error: 'Symbolic-link targets are not editable' });
    await writeFile(target, req.body.content, 'utf8');
    res.json({ success: true, path: relative });
  } catch (error) { next(error); }
});

app.post('/api/files', async (req, res, next) => {
  try {
    const { target, relative } = resolveWorkspacePath(req.body?.path);
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (Buffer.byteLength(content, 'utf8') > fileLimitBytes) return res.status(413).json({ error: 'File content is too large' });
    await mkdir(path.dirname(target), { recursive: true });
    const existing = await lstat(target).catch(() => null);
    if (existing) return res.status(409).json({ error: 'File or folder already exists' });
    await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
    res.status(201).json({ success: true, id: relative, name: path.basename(relative), isDirectory: false });
  } catch (error) { next(error); }
});

app.post('/api/folders', async (req, res, next) => {
  try {
    const { target, relative } = resolveWorkspacePath(req.body?.path);
    const existing = await lstat(target).catch(() => null);
    if (existing) return res.status(409).json({ error: 'File or folder already exists' });
    await mkdir(target, { recursive: true });
    res.status(201).json({ success: true, id: relative, name: path.basename(relative), isDirectory: true });
  } catch (error) { next(error); }
});

app.delete('/api/files/*', async (req, res, next) => {
  try {
    const { target, relative } = resolveWorkspacePath(req.params[0]);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) return res.status(400).json({ error: 'Target is not a regular file' });
    await rm(target, { force: true });
    res.json({ success: true, path: relative });
  } catch (error) { if (error?.code === 'ENOENT') return res.status(404).json({ error: 'File not found' }); next(error); }
});

app.post('/api/commit', async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message || message.length > 240) return res.status(400).json({ error: 'Commit message must be 1-240 characters' });
    git = await ensureWorkspace();
    await git.add(['-A']);
    const status = await git.status();
    if (!status.files.length) return res.json({ success: true, pushed: false, message: 'No changes to commit', branch: gitBranch });
    const commit = await git.commit(message);
    await git.push('origin', gitBranch);
    const sha = String(commit.commit || (await git.revparse(['HEAD']))).trim();
    res.json({ success: true, pushed: true, branch: gitBranch, commit: sha });
  } catch (error) { next(error); }
});

app.get('/api/db/schema', async (_req, res, next) => {
  if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured' });
  try {
    const { rows } = await pool.query(`
      SELECT t.table_name,
             c.column_name,
             c.data_type,
             c.udt_name,
             c.is_nullable,
             c.column_default,
             c.ordinal_position
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name, c.ordinal_position
    `);
    const tables = {};
    for (const row of rows) {
      if (!tables[row.table_name]) tables[row.table_name] = { name: row.table_name, schema: 'public', columns: [] };
      tables[row.table_name].columns.push({
        name: row.column_name,
        dataType: row.data_type,
        udtName: row.udt_name,
        nullable: row.is_nullable === 'YES',
        default: row.column_default,
        ordinal: Number(row.ordinal_position),
      });
    }
    res.json({ schema: 'public', tables: Object.values(tables) });
  } catch (error) { next(error); }
});

const responseText = payload => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      const text = content?.text || content?.value;
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.join('\n').trim();
};

app.post('/api/sia/chat', async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    if (!openAiKey) return res.status(503).json({ error: 'SIA model provider is not configured' });
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const instructions = [
      'You are SIA (Sulandra Intelligent Assistant), the engineering assistant inside Sulandra Codebase.',
      'Help with software design, debugging, code review, tests, database work, and safe operational changes.',
      'Respect the supplied active-file and selection context. Do not claim a file was changed unless the user explicitly asks and the surrounding application performs that write.',
      'Prefer concise, production-grade guidance and preserve Sulandra security boundaries.',
    ].join(' ');
    const modelInput = `${prompt}\n\nCodebase context:\n${JSON.stringify(context).slice(0, 12000)}`;
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({ model: siaModel, instructions, input: modelInput }),
      signal: AbortSignal.timeout(90_000),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const error = new Error(payload?.error?.message || `SIA provider returned ${upstream.status}`);
      error.status = upstream.status >= 500 ? 502 : 400;
      throw error;
    }
    const text = responseText(payload);
    if (!text) throw new Error('SIA provider returned an empty response');
    res.json({ response: text, model: siaModel });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  const status = Number(error?.status) || (error?.type === 'entity.parse.failed' ? 400 : 500);
  const token = githubToken;
  const safeMessage = token ? String(error?.message || 'Codebase API failure').split(token).join('[redacted]') : String(error?.message || 'Codebase API failure');
  if (status >= 500) console.error('[codebase-e2e-api]', safeMessage);
  res.status(status).json({ error: safeMessage });
});

const shutdown = async () => { try { await pool?.end(); } catch {} process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.listen(port, '0.0.0.0', () => {
  console.log(`Sulandra Codebase API listening on 0.0.0.0:${port} workspace=${workspaceDir} branch=${gitBranch}`);
});
