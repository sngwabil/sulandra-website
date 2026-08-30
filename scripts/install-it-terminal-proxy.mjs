import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const marker = 'IT_SOLUTIONS_TERMINAL_PROXY_V1';
const anchor = 'registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });';

let source = await readFile(target, 'utf8');
if (source.includes(marker)) {
  console.log('IT Solutions terminal proxy routes are already installed.');
  process.exit(0);
}
if (!source.includes(anchor)) throw new Error('IT terminal proxy anchor changed');

const block = `
/* ${marker}
   Browser terminal requests are authenticated by the normal Sulandra API first,
   then proxied to a dedicated isolated coding worker over Railway private networking.
   The worker token is never returned to the browser and the worker receives no
   production database, SMTP, clinical, or deployment credentials. */
const terminalWorkerBaseUrl = process.env.IT_TERMINAL_WORKER_URL?.trim().replace(/\\/$/, '') || '';
const terminalWorkerToken = process.env.IT_TERMINAL_WORKER_TOKEN?.trim() || '';
const terminalIdentifierSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const terminalInputSchema = z.object({ data: z.string().min(1).max(65_536) });
const terminalResizeSchema = z.object({
  cols: z.coerce.number().int().min(40).max(240).optional(),
  rows: z.coerce.number().int().min(12).max(80).optional(),
});
const terminalSessionSchema = terminalResizeSchema;
const terminalAdminRoles = requireRoles(UserRole.ADMINISTRATOR, UserRole.CEO, UserRole.COO);

const terminalOwnerKey = (res: express.Response) => {
  const auth = authOf(res);
  return [auth.organizationId, auth.userId].filter(Boolean).join(':');
};

const terminalWorkerRequest = async (
  res: express.Response,
  workerPath: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
) => {
  if (!terminalWorkerBaseUrl || !terminalWorkerToken) {
    throw Object.assign(new Error('The isolated coding terminal worker is not configured'), { status: 503 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2_000, options.timeoutMs ?? 20_000));
  try {
    const response = await fetch(\`${'${terminalWorkerBaseUrl}'}\${workerPath}\`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-sulandra-terminal-token': terminalWorkerToken,
        'x-sulandra-terminal-owner': terminalOwnerKey(res),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try { payload = JSON.parse(text) as Record<string, unknown>; }
      catch { payload = { error: text.slice(0, 2_000) }; }
    }
    if (!response.ok) {
      throw Object.assign(
        new Error(typeof payload.error === 'string' ? payload.error : \`Terminal worker request failed (\${response.status})\`),
        { status: response.status },
      );
    }
    return payload;
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') {
      throw Object.assign(new Error('The coding terminal worker timed out'), { status: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

app.get('/api/it-solutions/terminal/health', terminalAdminRoles, async (_req, res, next) => {
  try {
    const data = await terminalWorkerRequest(res, '/health', { timeoutMs: 5_000 });
    res.json({ data: { ...data, proxied: true } });
  } catch (error) { next(error); }
});

app.post('/api/it-solutions/terminal/workspaces', terminalAdminRoles, async (_req, res, next) => {
  try {
    const auth = authOf(res);
    const data = await terminalWorkerRequest(res, '/workspaces', { method: 'POST', body: {}, timeoutMs: 60_000 });
    await audit(auth, 'CREATE_ISOLATED_CODING_WORKSPACE', 'ItTerminalWorkspace', String(data.workspaceId || ''), {
      isolated: true,
      worker: 'Sulandra Coding Terminal Worker',
    });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

app.get('/api/it-solutions/terminal/workspaces/:workspaceId', terminalAdminRoles, async (req, res, next) => {
  try {
    const workspaceId = terminalIdentifierSchema.parse(req.params.workspaceId);
    const data = await terminalWorkerRequest(res, \`/workspaces/\${encodeURIComponent(workspaceId)}\`);
    res.json({ data });
  } catch (error) { next(error); }
});

app.delete('/api/it-solutions/terminal/workspaces/:workspaceId', terminalAdminRoles, async (req, res, next) => {
  try {
    const auth = authOf(res);
    const workspaceId = terminalIdentifierSchema.parse(req.params.workspaceId);
    const data = await terminalWorkerRequest(res, \`/workspaces/\${encodeURIComponent(workspaceId)}\`, { method: 'DELETE' });
    await audit(auth, 'DELETE_ISOLATED_CODING_WORKSPACE', 'ItTerminalWorkspace', workspaceId, { isolated: true });
    res.json({ data });
  } catch (error) { next(error); }
});

app.post('/api/it-solutions/terminal/workspaces/:workspaceId/sessions', terminalAdminRoles, async (req, res, next) => {
  try {
    const auth = authOf(res);
    const workspaceId = terminalIdentifierSchema.parse(req.params.workspaceId);
    const dimensions = terminalSessionSchema.parse(req.body || {});
    const data = await terminalWorkerRequest(
      res,
      \`/workspaces/\${encodeURIComponent(workspaceId)}/sessions\`,
      { method: 'POST', body: dimensions },
    );
    await audit(auth, 'OPEN_ISOLATED_TERMINAL_SESSION', 'ItTerminalSession', String(data.sessionId || ''), { workspaceId });
    res.status(201).json({ data });
  } catch (error) { next(error); }
});

app.get('/api/it-solutions/terminal/sessions/:sessionId/output', terminalAdminRoles, async (req, res, next) => {
  try {
    const sessionId = terminalIdentifierSchema.parse(req.params.sessionId);
    const cursor = Math.max(0, Math.trunc(Number(req.query.cursor) || 0));
    const data = await terminalWorkerRequest(
      res,
      \`/sessions/\${encodeURIComponent(sessionId)}/output?cursor=\${encodeURIComponent(String(cursor))}\`,
      { timeoutMs: 10_000 },
    );
    res.json({ data });
  } catch (error) { next(error); }
});

app.post('/api/it-solutions/terminal/sessions/:sessionId/input', terminalAdminRoles, async (req, res, next) => {
  try {
    const sessionId = terminalIdentifierSchema.parse(req.params.sessionId);
    const input = terminalInputSchema.parse(req.body || {});
    const data = await terminalWorkerRequest(
      res,
      \`/sessions/\${encodeURIComponent(sessionId)}/input\`,
      { method: 'POST', body: input },
    );
    res.json({ data });
  } catch (error) { next(error); }
});

app.post('/api/it-solutions/terminal/sessions/:sessionId/resize', terminalAdminRoles, async (req, res, next) => {
  try {
    const sessionId = terminalIdentifierSchema.parse(req.params.sessionId);
    const dimensions = terminalResizeSchema.parse(req.body || {});
    const data = await terminalWorkerRequest(
      res,
      \`/sessions/\${encodeURIComponent(sessionId)}/resize\`,
      { method: 'POST', body: dimensions },
    );
    res.json({ data });
  } catch (error) { next(error); }
});

app.delete('/api/it-solutions/terminal/sessions/:sessionId', terminalAdminRoles, async (req, res, next) => {
  try {
    const auth = authOf(res);
    const sessionId = terminalIdentifierSchema.parse(req.params.sessionId);
    const data = await terminalWorkerRequest(res, \`/sessions/\${encodeURIComponent(sessionId)}\`, { method: 'DELETE' });
    await audit(auth, 'CLOSE_ISOLATED_TERMINAL_SESSION', 'ItTerminalSession', sessionId, { isolated: true });
    res.json({ data });
  } catch (error) { next(error); }
});

`;

source = source.replace(anchor, `${block}${anchor}`);
await writeFile(target, source, 'utf8');
console.log('Installed authenticated IT Solutions coding-terminal proxy routes.');
