import http from 'node:http';
import https from 'node:https';

const DEFAULT_WORKSPACE_GATEWAY = 'https://sulandra-coding-terminal-worker-production.up.railway.app';
const WORKSPACE_COOKIE_NAMES = new Set(['sulandra_workspace_session', 'sulandra_workspace_ticket']);
const RESPONSE_HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

const workspacePath = (requestUrl = '/') => {
  let pathname = '';
  try {
    pathname = new URL(requestUrl, 'http://localhost').pathname;
  } catch {
    return false;
  }
  return pathname === '/workspace/ticket' || /^\/workspace\/[A-Za-z0-9_-]+\/ide(?:\/|$)/.test(pathname);
};

const workspaceCookieHeader = (rawCookie = '') => String(rawCookie)
  .split(';')
  .map((item) => item.trim())
  .filter(Boolean)
  .filter((item) => WORKSPACE_COOKIE_NAMES.has(item.split('=', 1)[0]))
  .join('; ');

const forwardedFor = (request) => {
  const existing = String(request.headers['x-forwarded-for'] || '').trim();
  const remote = String(request.socket?.remoteAddress || '').trim();
  return [existing, remote].filter(Boolean).join(', ');
};

const requestHeaders = (request, upstream, { websocket = false } = {}) => {
  const headers = {};
  for (const [name, value] of Object.entries(request.headers || {})) {
    const lower = name.toLowerCase();
    if (lower === 'host' || lower === 'cookie' || lower === 'authorization' || lower === 'content-length') continue;
    if (!websocket && RESPONSE_HOP_HEADERS.has(lower)) continue;
    if (value !== undefined) headers[name] = value;
  }

  const cookie = workspaceCookieHeader(request.headers.cookie || '');
  if (cookie) headers.cookie = cookie;
  if (new URL(request.url || '/', 'http://localhost').pathname === '/workspace/ticket' && request.headers.authorization) {
    headers.authorization = request.headers.authorization;
  }

  headers.host = upstream.host;
  headers['x-forwarded-host'] = String(request.headers.host || '');
  headers['x-forwarded-proto'] = 'https';
  const xff = forwardedFor(request);
  if (xff) headers['x-forwarded-for'] = xff;
  if (websocket) {
    headers.connection = 'Upgrade';
    headers.upgrade = String(request.headers.upgrade || 'websocket');
  }
  return headers;
};

const stripCookieDomain = (value) => String(value || '').replace(/;\s*Domain=[^;]+/ig, '');

const responseHeaders = (upstreamResponse, upstream) => {
  const headers = {};
  for (const [name, value] of Object.entries(upstreamResponse.headers || {})) {
    const lower = name.toLowerCase();
    if (RESPONSE_HOP_HEADERS.has(lower) || value === undefined) continue;
    if (lower === 'set-cookie') {
      headers[name] = (Array.isArray(value) ? value : [value]).map(stripCookieDomain);
      continue;
    }
    if (lower === 'location') {
      try {
        const location = new URL(String(value), upstream);
        headers[name] = location.origin === upstream.origin ? `${location.pathname}${location.search}${location.hash}` : value;
      } catch {
        headers[name] = value;
      }
      continue;
    }
    headers[name] = value;
  }
  headers['cache-control'] = 'no-store';
  return headers;
};

const writeSocketResponse = (socket, upstreamResponse) => {
  const statusCode = upstreamResponse.statusCode || 502;
  const statusMessage = upstreamResponse.statusMessage || http.STATUS_CODES[statusCode] || 'Bad Gateway';
  socket.write(`HTTP/1.1 ${statusCode} ${statusMessage}\r\n`);
  const headers = responseHeaders(upstreamResponse, new URL('http://localhost'));
  for (const [name, value] of Object.entries(headers)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) socket.write(`${name}: ${item}\r\n`);
    }
  }
  socket.write('\r\n');
};

export function createWorkspaceSameOriginProxy({ gatewayUrl = process.env.SULANDRA_WORKSPACE_GATEWAY_URL || DEFAULT_WORKSPACE_GATEWAY } = {}) {
  const upstream = new URL(gatewayUrl);
  if (!['http:', 'https:'].includes(upstream.protocol)) throw new Error('Workspace gateway must use http or https');
  const transport = upstream.protocol === 'https:' ? https : http;

  const optionsFor = (request, { websocket = false } = {}) => ({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port || undefined,
    method: request.method || 'GET',
    path: request.url || '/',
    headers: requestHeaders(request, upstream, { websocket }),
    ...(upstream.protocol === 'https:' ? { servername: upstream.hostname } : {}),
  });

  const handleHttp = (request, response) => {
    if (!workspacePath(request.url)) return false;
    const proxyRequest = transport.request(optionsFor(request), (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders(upstreamResponse, upstream));
      upstreamResponse.pipe(response);
    });
    proxyRequest.setTimeout(120_000, () => proxyRequest.destroy(new Error('Workspace upstream timed out')));
    proxyRequest.on('error', (error) => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: 'Workspace gateway unavailable' }));
    });
    request.pipe(proxyRequest);
    return true;
  };

  const handleUpgrade = (request, socket, head) => {
    if (!workspacePath(request.url)) return false;
    const proxyRequest = transport.request(optionsFor(request, { websocket: true }));
    proxyRequest.setTimeout(30_000, () => proxyRequest.destroy(new Error('Workspace WebSocket upstream timed out')));
    proxyRequest.on('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
      const statusCode = upstreamResponse.statusCode || 101;
      const statusMessage = upstreamResponse.statusMessage || 'Switching Protocols';
      socket.write(`HTTP/1.1 ${statusCode} ${statusMessage}\r\n`);
      for (const [name, value] of Object.entries(upstreamResponse.headers || {})) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) socket.write(`${name}: ${item}\r\n`);
      }
      socket.write('\r\n');
      if (upstreamHead?.length) socket.write(upstreamHead);
      if (head?.length) upstreamSocket.write(head);
      upstreamSocket.on('error', () => socket.destroy());
      socket.on('error', () => upstreamSocket.destroy());
      socket.pipe(upstreamSocket).pipe(socket);
    });
    proxyRequest.on('response', (upstreamResponse) => {
      writeSocketResponse(socket, upstreamResponse);
      upstreamResponse.pipe(socket);
    });
    proxyRequest.on('error', () => {
      if (!socket.destroyed) {
        socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n');
        socket.destroy();
      }
    });
    proxyRequest.end();
    return true;
  };

  return { matches: workspacePath, handleHttp, handleUpgrade, upstreamOrigin: upstream.origin };
}
