import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { createWorkspaceSameOriginProxy } from '../scripts/workspace-same-origin-proxy.mjs';

const listen = async (server) => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};

const close = async (server) => {
  if (!server.listening) return;
  server.close();
  await once(server, 'close');
};

const readBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

let ticketAuthorization = '';
let httpCookie = '';
let wsCookie = '';

const upstream = http.createServer(async (request, response) => {
  if (request.url === '/workspace/ticket' && request.method === 'POST') {
    ticketAuthorization = String(request.headers.authorization || '');
    const payload = JSON.parse(await readBody(request));
    if (payload.sessionId !== 'session-1') {
      response.writeHead(400);
      response.end('bad session');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, url: '/workspace/session-1/ide/?ticket=bootstrap' }));
    return;
  }

  if (request.url === '/workspace/session-1/ide/') {
    httpCookie = String(request.headers.cookie || '');
    response.writeHead(200, {
      'Content-Type': 'text/plain',
      'Set-Cookie': 'sulandra_workspace_session=durable; Path=/workspace/session-1/ide; Domain=worker.example; HttpOnly; Secure; SameSite=None',
    });
    response.end('IDE OK');
    return;
  }

  response.writeHead(404);
  response.end('not found');
});

upstream.on('upgrade', (request, socket) => {
  wsCookie = String(request.headers.cookie || '');
  if (request.url !== '/workspace/session-1/ide/stable-websocket') {
    socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    return;
  }
  const key = String(request.headers['sec-websocket-key'] || '');
  const accept = crypto.createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n` +
    '\r\n',
  );
  setTimeout(() => socket.end(), 80);
});

const upstreamPort = await listen(upstream);
const proxy = createWorkspaceSameOriginProxy({ gatewayUrl: `http://127.0.0.1:${upstreamPort}` });
const frontend = http.createServer((request, response) => {
  if (proxy.handleHttp(request, response)) return;
  response.writeHead(404);
  response.end('not found');
});
frontend.on('upgrade', (request, socket, head) => {
  if (proxy.handleUpgrade(request, socket, head)) return;
  socket.destroy();
});
const frontendPort = await listen(frontend);
const origin = `http://127.0.0.1:${frontendPort}`;

try {
  const ticketResponse = await fetch(`${origin}/workspace/ticket`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer admin-token',
      'Content-Type': 'application/json',
      Cookie: 'sulandra_app=do-not-forward; sulandra_workspace_session=previous',
    },
    body: JSON.stringify({ sessionId: 'session-1', port: null }),
  });
  if (!ticketResponse.ok) throw new Error(`ticket proxy returned ${ticketResponse.status}`);
  if (ticketAuthorization !== 'Bearer admin-token') throw new Error('ticket endpoint did not receive the Admin bearer token');

  const ideResponse = await fetch(`${origin}/workspace/session-1/ide/`, {
    headers: {
      Authorization: 'Bearer must-not-reach-ide',
      Cookie: 'sulandra_app=do-not-forward; sulandra_workspace_session=durable',
    },
  });
  if ((await ideResponse.text()) !== 'IDE OK') throw new Error('IDE HTTP response did not traverse the proxy');
  if (httpCookie !== 'sulandra_workspace_session=durable') throw new Error(`non-workspace cookies leaked upstream: ${httpCookie}`);
  const setCookie = String(ideResponse.headers.get('set-cookie') || '');
  if (/domain=/i.test(setCookie)) throw new Error(`worker cookie domain was not stripped: ${setCookie}`);

  await new Promise((resolve, reject) => {
    const client = net.connect(frontendPort, '127.0.0.1');
    let response = '';
    const key = crypto.randomBytes(16).toString('base64');
    const timer = setTimeout(() => reject(new Error('WebSocket proxy handshake timed out')), 3_000);
    client.on('connect', () => {
      client.write(
        'GET /workspace/session-1/ide/stable-websocket HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${frontendPort}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Key: ${key}\r\n` +
        'Sec-WebSocket-Version: 13\r\n' +
        'Cookie: sulandra_app=do-not-forward; sulandra_workspace_session=durable\r\n' +
        '\r\n',
      );
    });
    client.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (!response.includes('\r\n\r\n')) return;
      clearTimeout(timer);
      if (!response.startsWith('HTTP/1.1 101')) reject(new Error(`WebSocket proxy failed: ${response}`));
      else resolve();
      client.destroy();
    });
    client.on('error', reject);
  });

  if (wsCookie !== 'sulandra_workspace_session=durable') throw new Error(`WebSocket leaked non-workspace cookies upstream: ${wsCookie}`);
  if (proxy.matches('/api/anything')) throw new Error('workspace proxy accepted a non-workspace path');
  if (proxy.matches('/workspace/session-1/not-ide')) throw new Error('workspace proxy accepted an unapproved workspace path');

  console.log('Same-origin workspace proxy regression passed: ticket POST, IDE HTTP, first-party session cookie, and reconnect WebSocket transport are preserved without leaking unrelated Sulandra cookies.');
} finally {
  await close(frontend);
  await close(upstream);
}
