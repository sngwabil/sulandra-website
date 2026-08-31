import crypto from 'node:crypto';
import { createServer } from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

const port = Number(process.env.PORT || 8080);
const authToken = String(process.env.TERMINAL_AUTH_TOKEN || '').trim();
const executionBaseUrl = String(process.env.TERMINAL_EXECUTION_BASE_URL || '').trim().replace(/\/$/, '');
const executionToken = String(process.env.TERMINAL_EXECUTION_TOKEN || '').trim();
const executionRequestTimeoutMs = Math.max(2_000, Number(process.env.TERMINAL_EXECUTION_TIMEOUT_MS || 20_000));
const wsBytesPerSecond = Math.max(16_384, Number(process.env.TERMINAL_WS_BYTES_PER_SECOND || 262_144));
const wsBurstBytes = Math.max(wsBytesPerSecond, Number(process.env.TERMINAL_WS_BURST_BYTES || 524_288));
const wsAuthProvider = String(process.env.TERMINAL_WS_AUTH_PROVIDER || 'sulandra').trim().toLowerCase();
const jwtSecret = String(process.env.JWT_SECRET || '').trim();
const firebaseProjectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
const firebaseCheckRevoked = String(process.env.TERMINAL_FIREBASE_CHECK_REVOKED || 'false').trim().toLowerCase() === 'true';
const allowedRoles = new Set(['ADMINISTRATOR', 'CEO', 'COO']);
let wsUpgradeSequence = 0;

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
if (!authToken) throw new Error('TERMINAL_AUTH_TOKEN is required');
if (!executionBaseUrl || !/^https:\/\//i.test(executionBaseUrl)) {
  throw new Error('TERMINAL_EXECUTION_BASE_URL must be an https:// URL');
}
if (!executionToken || executionToken.length < 32) throw new Error('TERMINAL_EXECUTION_TOKEN must be at least 32 characters');
if (!['sulandra', 'firebase'].includes(wsAuthProvider)) throw new Error('TERMINAL_WS_AUTH_PROVIDER must be sulandra or firebase');
if (wsAuthProvider === 'sulandra' && !jwtSecret) throw new Error('JWT_SECRET is required for Sulandra WebSocket authentication');
if (wsAuthProvider === 'firebase' && !firebaseProjectId) throw new Error('FIREBASE_PROJECT_ID is required for Firebase WebSocket authentication');
if (wsAuthProvider === 'firebase' && !getApps().length) initializeApp({ projectId: firebaseProjectId });

const secureEquals = (provided, configured) => {
  if (!provided || !configured) return false;
  const left = Buffer.from(String(provided));
  const right = Buffer.from(String(configured));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const ownerOf = req => String(req.header('x-sulandra-terminal-owner') || '').trim();
const authenticateInternal = (req, res, next) => {
  if (!secureEquals(req.header('x-sulandra-terminal-token'), authToken)) {
    res.status(401).json({ error: 'Unauthorized terminal gateway request' });
    return;
  }
  if (!ownerOf(req)) {
    res.status(400).json({ error: 'Terminal owner is required' });
    return;
  }
  next();
};

const executionUrl = pathname => new URL(pathname, executionBaseUrl + '/').toString();
const executionWsUrl = pathname => {
  const url = new URL(pathname, executionBaseUrl + '/');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

const executionRequest = async (req, pathname, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(2_000, options.timeoutMs ?? executionRequestTimeoutMs));
  try {
    const response = await fetch(executionUrl(pathname), {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${executionToken}`,
        'x-sulandra-terminal-owner': ownerOf(req),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 2_000) }; }
    }
    if (!response.ok) {
      const error = new Error(typeof payload.error === 'string' ? payload.error : `Execution plane request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeout = new Error('Terminal execution plane timed out');
      timeout.status = 504;
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

app.get('/health', async (_req, res) => {
  let executionHealthy = false;
  let executionStatus = 'unreachable';
  try {
    const response = await fetch(executionUrl('/healthz'), {
      headers: { Authorization: `Bearer ${executionToken}` },
      signal: AbortSignal.timeout(2_500),
    });
    executionHealthy = response.ok;
    executionStatus = response.ok ? 'ready' : `http-${response.status}`;
  } catch {}
  res.status(executionHealthy ? 200 : 503).json({
    ok: executionHealthy,
    gateway: true,
    websocket: true,
    websocketAuthProvider: wsAuthProvider,
    browserJwtConfigured: wsAuthProvider === 'sulandra' ? Boolean(jwtSecret) : undefined,
    firebaseCheckRevoked: wsAuthProvider === 'firebase' ? firebaseCheckRevoked : undefined,
    executionPlane: { configured: true, healthy: executionHealthy, status: executionStatus },
    rateLimit: { bytesPerSecond: wsBytesPerSecond, burstBytes: wsBurstBytes },
  });
});

app.use(authenticateInternal);

app.post('/workspaces', async (req, res, next) => {
  try {
    const data = await executionRequest(req, '/v1/workspaces', { method: 'POST', body: {} });
    res.status(201).json(data);
  } catch (error) { next(error); }
});
app.get('/workspaces/:workspaceId', async (req, res, next) => {
  try {
    res.json(await executionRequest(req, `/v1/workspaces/${encodeURIComponent(req.params.workspaceId)}`));
  } catch (error) { next(error); }
});
app.delete('/workspaces/:workspaceId', async (req, res, next) => {
  try {
    res.json(await executionRequest(req, `/v1/workspaces/${encodeURIComponent(req.params.workspaceId)}`, { method: 'DELETE' }));
  } catch (error) { next(error); }
});
app.post('/workspaces/:workspaceId/sessions', async (req, res, next) => {
  try {
    const body = {
      cols: Math.max(40, Math.min(240, Number(req.body?.cols) || 120)),
      rows: Math.max(12, Math.min(80, Number(req.body?.rows) || 32)),
    };
    const data = await executionRequest(req, `/v1/workspaces/${encodeURIComponent(req.params.workspaceId)}/sessions`, {
      method: 'POST', body, timeoutMs: 60_000,
    });
    res.status(201).json(data);
  } catch (error) { next(error); }
});
app.get('/sessions/:sessionId/output', async (req, res, next) => {
  try {
    const cursor = Math.max(0, Math.trunc(Number(req.query.cursor) || 0));
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    const data = await executionRequest(req, `/v1/sessions/${encodeURIComponent(req.params.sessionId)}/output?cursor=${cursor}`);
    if (cursor === 0) {
      console.info(`[terminal-gateway] REST output session=${req.params.sessionId} requestCursor=0 responseCursor=${Number(data?.cursor) || 0} bytes=${Buffer.byteLength(String(data?.data || ''))} alive=${data?.alive !== false} reset=${Boolean(data?.reset)}`);
    }
    res.json(data);
  } catch (error) { next(error); }
});
app.post('/sessions/:sessionId/input', async (req, res, next) => {
  try {
    const data = typeof req.body?.data === 'string' ? req.body.data : '';
    if (!data || Buffer.byteLength(data) > 65_536) return res.status(400).json({ error: 'Terminal input must be between 1 and 65536 bytes' });
    res.json(await executionRequest(req, `/v1/sessions/${encodeURIComponent(req.params.sessionId)}/input`, { method: 'POST', body: { data } }));
  } catch (error) { next(error); }
});
app.post('/sessions/:sessionId/resize', async (req, res, next) => {
  try {
    const body = {
      cols: Math.max(40, Math.min(240, Number(req.body?.cols) || 120)),
      rows: Math.max(12, Math.min(80, Number(req.body?.rows) || 32)),
    };
    res.json(await executionRequest(req, `/v1/sessions/${encodeURIComponent(req.params.sessionId)}/resize`, { method: 'POST', body }));
  } catch (error) { next(error); }
});
app.delete('/sessions/:sessionId', async (req, res, next) => {
  try {
    res.json(await executionRequest(req, `/v1/sessions/${encodeURIComponent(req.params.sessionId)}`, { method: 'DELETE' }));
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error('[terminal-gateway]', error);
  res.status(status).json({ error: error?.message || 'Terminal gateway failure' });
});

const decodeBase64Url = value => Buffer.from(String(value || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const wsTokenFromProtocols = header => {
  for (const part of String(header || '').split(',').map(value => value.trim()).filter(Boolean)) {
    if (part.startsWith('auth.')) {
      try { return decodeBase64Url(part.slice(5)); } catch { return ''; }
    }
  }
  return '';
};

const verifyBrowserToken = async token => {
  if (!token) return { auth: null, reason: 'token-missing' };
  if (wsAuthProvider === 'firebase') {
    try {
      const claims = await getAuth().verifyIdToken(token, firebaseCheckRevoked);
      const organizationId = typeof claims.organizationId === 'string' ? claims.organizationId : typeof claims.orgId === 'string' ? claims.orgId : '';
      const role = typeof claims.role === 'string' ? claims.role : '';
      if (!claims.uid) return { auth: null, reason: 'subject-missing' };
      if (!organizationId) return { auth: null, reason: 'organization-missing' };
      if (!allowedRoles.has(role)) return { auth: null, reason: 'role-rejected' };
      return { auth: { userId: claims.uid, organizationId, role }, reason: '' };
    } catch (error) {
      const reason = error?.code === 'auth/id-token-expired' ? 'token-expired' : 'token-verification-failed';
      return { auth: null, reason };
    }
  }
  try {
    const claims = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
    if (typeof claims === 'string') return { auth: null, reason: 'claims-invalid' };
    const userId = typeof claims.sub === 'string' ? claims.sub : '';
    const organizationId = typeof claims.organizationId === 'string' ? claims.organizationId : '';
    const role = typeof claims.role === 'string' ? claims.role : '';
    if (!userId) return { auth: null, reason: 'subject-missing' };
    if (!organizationId) return { auth: null, reason: 'organization-missing' };
    if (!allowedRoles.has(role)) return { auth: null, reason: 'role-rejected' };
    return { auth: { userId, organizationId, role }, reason: '' };
  } catch (error) {
    const reason = error?.name === 'TokenExpiredError'
      ? 'token-expired'
      : error?.name === 'JsonWebTokenError'
        ? 'token-invalid'
        : 'token-verification-failed';
    return { auth: null, reason };
  }
};

const makeBucket = () => ({ tokens: wsBurstBytes, updatedAt: Date.now() });
const consume = (bucket, bytes) => {
  const at = Date.now();
  const elapsed = Math.max(0, at - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(wsBurstBytes, bucket.tokens + elapsed * wsBytesPerSecond);
  bucket.updatedAt = at;
  if (bytes > bucket.tokens) return false;
  bucket.tokens -= bytes;
  return true;
};

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1_048_576 });

server.on('upgrade', async (req, socket, head) => {
  const upgradeId = ++wsUpgradeSequence;
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch {
    console.warn(`[terminal-gateway] browser WSS rejected id=${upgradeId} reason=url-invalid`);
    socket.destroy();
    return;
  }
  const match = url.pathname.match(/^\/ws\/sessions\/([A-Za-z0-9_-]+)$/);
  if (!match) {
    console.warn(`[terminal-gateway] browser WSS rejected id=${upgradeId} reason=path-invalid`);
    socket.destroy();
    return;
  }
  const verification = await verifyBrowserToken(wsTokenFromProtocols(req.headers['sec-websocket-protocol']));
  if (!verification.auth) {
    console.warn(`[terminal-gateway] browser WSS rejected id=${upgradeId} session=${match[1]} reason=${verification.reason}`);
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n');
    socket.destroy();
    return;
  }
  req.sulandraTerminal = { auth: verification.auth, sessionId: match[1], upgradeId };
  console.info(`[terminal-gateway] browser WSS authorized id=${upgradeId} session=${match[1]}`);
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', (browser, req) => {
  const { auth, sessionId, upgradeId } = req.sulandraTerminal;
  const owner = `${auth.organizationId}:${auth.userId}`;
  const bucket = makeBucket();
  const pendingFrames = [];
  let pendingBytes = 0;
  const maxPendingBytes = 65_536;
  const upstream = new WebSocket(executionWsUrl(`/v1/ws/sessions/${encodeURIComponent(sessionId)}`), ['sulandra-executor.v1'], {
    headers: {
      Authorization: `Bearer ${executionToken}`,
      'x-sulandra-terminal-owner': owner,
    },
    handshakeTimeout: 10_000,
    maxPayload: 1_048_576,
  });
  upstream.binaryType = 'arraybuffer';

  const closeBoth = (code = 1011, reason = 'Terminal proxy closed') => {
    if (browser.readyState === WebSocket.OPEN || browser.readyState === WebSocket.CONNECTING) {
      try { browser.close(code, reason); } catch {}
    }
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
      try { upstream.close(code, reason); } catch {}
    }
  };

  upstream.on('open', () => {
    console.info(`[terminal-gateway] execution WSS open id=${upgradeId} session=${sessionId}`);
    for (const frame of pendingFrames.splice(0)) upstream.send(frame.data, { binary: frame.isBinary });
    pendingBytes = 0;
  });
  upstream.on('message', (data, isBinary) => {
    if (browser.readyState !== WebSocket.OPEN) return;
    browser.send(data, { binary: isBinary });
  });
  upstream.on('close', (code, reason) => {
    console.warn(`[terminal-gateway] execution WSS closed id=${upgradeId} session=${sessionId} code=${code} reason=${reason.toString().slice(0, 120)}`);
    if (browser.readyState === WebSocket.OPEN) browser.close(code >= 1000 && code <= 4999 ? code : 1011, reason.toString().slice(0, 120));
  });
  upstream.on('error', error => {
    console.error('[terminal-gateway] execution WSS error', error.message);
    closeBoth(1011, 'Execution plane unavailable');
  });

  browser.on('message', (data, isBinary) => {
    const bytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data));
    if (!consume(bucket, bytes)) {
      closeBoth(1008, 'Terminal input rate limit exceeded');
      return;
    }
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
      return;
    }
    if (pendingBytes + bytes > maxPendingBytes) {
      closeBoth(1008, 'Terminal startup input buffer exceeded');
      return;
    }
    pendingFrames.push({ data: isBinary ? Buffer.from(data) : String(data), isBinary });
    pendingBytes += bytes;
  });
  browser.on('close', (code, reason) => {
    console.info(`[terminal-gateway] browser WSS closed id=${upgradeId} session=${sessionId} code=${code} reason=${reason.toString().slice(0, 120)}`);
    pendingFrames.length = 0;
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close(1000, 'Browser disconnected');
  });
  browser.on('error', () => closeBoth(1011, 'Browser WSS error'));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.ping(); } catch {}
    }
  }
}, 30_000);
heartbeat.unref?.();

server.listen(port, '0.0.0.0', () => {
  console.log(`Sulandra terminal gateway listening on 0.0.0.0:${port}`);
});
