import fs from 'node:fs';

const target = process.argv[2] || '/app/server.mjs';
let source = fs.readFileSync(target, 'utf8');

const replaceOnce = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Terminal security audit patch failed: ${label}`);
  source = source.replace(from, to);
};

replaceOnce(
  "import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';",
  "import { appendFile, mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';",
  'fs imports',
);

replaceOnce(
  "const stateRoot = path.resolve(process.env.TERMINAL_STATE_ROOT || '/state');",
  `const stateRoot = path.resolve(process.env.TERMINAL_STATE_ROOT || '/state');
const auditRoot = path.resolve(process.env.TERMINAL_AUDIT_ROOT || path.join(stateRoot, 'audit'));
const auditRetentionDays = Math.max(30, Number(process.env.TERMINAL_AUDIT_RETENTION_DAYS || 2190));`,
  'audit settings',
);

replaceOnce(
  "await mkdir(stateRoot, { recursive: true });",
  `await mkdir(stateRoot, { recursive: true });
await mkdir(auditRoot, { recursive: true, mode: 0o700 });`,
  'audit directory',
);

replaceOnce(
  "const now = () => Date.now();",
  `const now = () => Date.now();
const auditNode = String(process.env.HOSTNAME || 'executor').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
const auditDate = timestamp => new Date(timestamp).toISOString().slice(0, 10);
const auditFile = timestamp => path.join(auditRoot, \`terminal-audit-\${auditDate(timestamp)}-\${auditNode}.ndjson\`);
const appendSecurityAudit = async (event, fields = {}) => {
  const timestamp = now();
  const record = {
    timestamp: new Date(timestamp).toISOString(),
    event: String(event || 'unknown'),
    node: auditNode,
    ...fields,
  };
  // Never record authorization headers, executor/session tokens, request bodies,
  // terminal keystrokes, output, environment values, or container addresses.
  const canonical = JSON.stringify(record);
  const integrity = crypto.createHmac('sha256', executionToken).update(canonical).digest('hex');
  await appendFile(auditFile(timestamp), JSON.stringify({ ...record, integrity }) + '\\n', { mode: 0o600 });
};
const pruneSecurityAudit = async () => {
  const cutoff = now() - auditRetentionDays * 86_400_000;
  for (const name of await readdir(auditRoot).catch(() => [])) {
    const match = /^terminal-audit-(\\d{4}-\\d{2}-\\d{2})-[A-Za-z0-9_.-]+\\.ndjson$/.exec(name);
    if (!match) continue;
    const dated = Date.parse(match[1] + 'T00:00:00Z');
    if (Number.isFinite(dated) && dated < cutoff) await unlink(path.join(auditRoot, name)).catch(() => {});
  }
};
await pruneSecurityAudit();
const auditRetentionTimer = setInterval(() => void pruneSecurityAudit(), 6 * 60 * 60 * 1000);
auditRetentionTimer.unref?.();`,
  'audit writer',
);

replaceOnce(
  "app.use(authorize);",
  `app.use(authorize);
app.use((req, res, next) => {
  if (req.path === '/healthz') return next();
  const started = process.hrtime.bigint();
  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const workspaceId = /\\/workspaces\\/([A-Za-z0-9_-]+)/.exec(req.path || '')?.[1] || null;
    const sessionId = /\\/sessions\\/([A-Za-z0-9_-]+)/.exec(req.path || '')?.[1] || null;
    void appendSecurityAudit('http_request', {
      owner: ownerOf(req) || null,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      workspaceId,
      sessionId,
    }).catch(error => console.warn('[terminal-audit] append failed', error.message));
  });
  next();
});`,
  'request audit middleware',
);

replaceOnce(
  "  req.sulandraSession = session;\n  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));",
  `  req.sulandraSession = session;
  void appendSecurityAudit('websocket_authorized', {
    owner,
    path: url.pathname,
    workspaceId: session.workspaceId,
    sessionId: session.id,
  }).catch(error => console.warn('[terminal-audit] websocket append failed', error.message));
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));`,
  'websocket authorization audit',
);

replaceOnce(
  "  leaseTimer.unref?.();\n\n  const pendingFrames = [];",
  `  leaseTimer.unref?.();
  void appendSecurityAudit('websocket_connected', {
    owner: session.owner,
    workspaceId: session.workspaceId,
    sessionId: session.id,
  }).catch(error => console.warn('[terminal-audit] websocket connect append failed', error.message));

  const pendingFrames = [];`,
  'websocket connected audit',
);

replaceOnce(
  `    session.connections = Math.max(0, session.connections - 1);
    if (session.connections === 0) {
      session.disconnectedAt = now();
      session.leaseUntil = 0;
    }
    void saveSession(session).catch(() => {});
  });`,
  `    session.connections = Math.max(0, session.connections - 1);
    if (session.connections === 0) {
      session.disconnectedAt = now();
      session.leaseUntil = 0;
    }
    void saveSession(session).catch(() => {});
    void appendSecurityAudit('websocket_disconnected', {
      owner: session.owner,
      workspaceId: session.workspaceId,
      sessionId: session.id,
      remainingConnections: session.connections,
    }).catch(error => console.warn('[terminal-audit] websocket disconnect append failed', error.message));
  });`,
  'websocket disconnected audit',
);

fs.writeFileSync(target, source);
console.log(`Terminal security audit retention installed into ${target}`);
