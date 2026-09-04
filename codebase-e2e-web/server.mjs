import express from 'express';
import cors from 'cors';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const port = Number(process.env.PORT || 8080);
const terminalWorkerUrl = String(process.env.TERMINAL_WORKER_URL || 'https://sulandra-coding-terminal-worker-production.up.railway.app').trim().replace(/\/$/, '');
const corsOrigins = String(process.env.CORS_ORIGIN || 'https://sulandrahealth.com,https://www.sulandrahealth.com').split(',').map(v => v.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by Codebase preview CORS policy'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  credentials: false,
  maxAge: 86400,
}));

const emptyPage = (message = 'Start a Codebase terminal to preview a running application.') => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sulandra Codebase Preview</title><style>html,body{height:100%;margin:0;background:#000;color:#aeb9c7;font:14px system-ui,sans-serif;color-scheme:dark}body{display:grid;place-items:center;background:radial-gradient(circle at 16% 0%,rgba(46,204,113,.08),transparent 32%),radial-gradient(circle at 88% 12%,rgba(66,165,245,.08),transparent 28%),linear-gradient(180deg,#020407,#000)}.card{max-width:520px;padding:24px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:linear-gradient(180deg,rgba(17,24,35,.86),rgba(4,8,13,.88));box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 18px 48px rgba(0,0,0,.38);text-align:center}strong{color:#fff;display:block;margin-bottom:8px}</style></head>
<body><div class="card"><strong>Sulandra Codebase Preview</strong>${message}</div></body></html>`;

const normalizeSurface = value => {
  const surface = String(value || 'workspace').trim().toLowerCase();
  return ['workspace', 'codebase'].includes(surface) ? surface : '';
};

app.get('/health', (_req, res) => res.json({ ok: true, service: 'codebase-e2e-web', terminalWorkerUrl, codebasePreviewNamespace: true }));

app.get('/', async (req, res) => {
  const requestedPort = Number(req.query.port || 3000);
  const sessionId = String(req.query.sessionId || '').trim();
  const token = String(req.query.token || '').trim();
  const surface = normalizeSurface(req.query.surface);
  if (!surface) return res.status(400).type('html').send(emptyPage('The requested preview surface is invalid.'));
  if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535 || [9000, 13337].includes(requestedPort)) {
    return res.status(400).type('html').send(emptyPage('The requested preview port is not allowed.'));
  }
  if (!sessionId || !token) {
    return res.status(200).type('html').send(emptyPage());
  }
  try {
    const upstream = await fetch(`${terminalWorkerUrl}/workspace/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId, port: requestedPort, surface }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !payload?.url) {
      const detail = String(payload?.error || `Preview ticket request failed (${upstream.status})`).replace(/[<>]/g, '');
      return res.status(upstream.status === 401 ? 401 : 502).type('html').send(emptyPage(detail));
    }
    const target = new URL(payload.url, `${terminalWorkerUrl}/`).toString();
    res.set('Cache-Control', 'no-store');
    res.redirect(302, target);
  } catch (error) {
    res.status(502).type('html').send(emptyPage('The terminal preview gateway is temporarily unavailable.'));
  }
});

app.post('/api/preview-ticket', async (req, res) => {
  const requestedPort = Number(req.body?.port || 3000);
  const sessionId = String(req.body?.sessionId || '').trim();
  const authorization = String(req.headers.authorization || '').trim();
  const surface = normalizeSurface(req.body?.surface);
  if (!surface) return res.status(400).json({ error: 'Invalid preview surface' });
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
  if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535 || [9000, 13337].includes(requestedPort)) return res.status(400).json({ error: 'Invalid preview port' });
  if (!/^Bearer\s+/i.test(authorization)) return res.status(401).json({ error: 'Bearer token required' });
  try {
    const upstream = await fetch(`${terminalWorkerUrl}/workspace/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify({ sessionId, port: requestedPort, surface }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !payload?.url) return res.status(upstream.status || 502).json({ error: payload?.error || 'Unable to create preview ticket' });
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, url: new URL(payload.url, `${terminalWorkerUrl}/`).toString(), expiresIn: payload.expiresIn, surface });
  } catch {
    res.status(502).json({ error: 'Terminal preview gateway unavailable' });
  }
});

app.use((_req, res) => res.status(404).type('html').send(emptyPage('Preview route not found.')));

app.listen(port, '0.0.0.0', () => {
  console.log(`Sulandra Codebase preview broker listening on 0.0.0.0:${port}`);
});
