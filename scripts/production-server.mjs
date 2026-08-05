import { createReadStream, existsSync, statSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticRoot = path.join(repositoryRoot, 'dist-web');
const publicPort = Number(process.env.PORT || 4000);
const apiPort = Number(process.env.INTERNAL_API_PORT || 4001);

if (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65535) {
  throw new Error('PORT must be a valid TCP port');
}
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535 || apiPort === publicPort) {
  throw new Error('INTERNAL_API_PORT must be a valid port different from PORT');
}

await access(path.join(staticRoot, 'index.html')).catch(() => {
  throw new Error('dist-web/index.html is missing. Run npm run build before npm start.');
});

const apiProcess = spawn(
  process.execPath,
  [path.join(repositoryRoot, 'api', 'dist', 'onboarding-bootstrap.js')],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PORT: String(apiPort),
    },
    stdio: 'inherit',
  },
);

apiProcess.on('exit', (code, signal) => {
  console.error(`API process exited (${signal ?? code ?? 'unknown'}).`);
  process.exit(code ?? 1);
});

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const isApiRequest = (pathname) =>
  pathname === '/api'
  || pathname.startsWith('/api/')
  || pathname === '/public'
  || pathname.startsWith('/public/');

const proxyToApi = (incoming, outgoing) => {
  const proxy = httpRequest(
    {
      hostname: '127.0.0.1',
      port: apiPort,
      method: incoming.method,
      path: incoming.url,
      headers: {
        ...incoming.headers,
        host: `127.0.0.1:${apiPort}`,
        'x-forwarded-host': incoming.headers.host ?? '',
        'x-forwarded-proto': incoming.headers['x-forwarded-proto'] ?? 'https',
      },
    },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    },
  );

  proxy.on('error', (error) => {
    console.error('API proxy error:', error);
    if (!outgoing.headersSent) {
      outgoing.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
    }
    outgoing.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
  });

  incoming.pipe(proxy);
};

const safeStaticPath = (pathname) => {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relative = decoded.replace(/^\/+/, '');
  const resolved = path.resolve(staticRoot, relative || 'index.html');
  if (resolved !== staticRoot && !resolved.startsWith(`${staticRoot}${path.sep}`)) return null;
  return resolved;
};

const serveFile = (filePath, response, method) => {
  const extension = path.extname(filePath).toLowerCase();
  const headers = {
    'content-type': contentTypes.get(extension) ?? 'application/octet-stream',
    'x-content-type-options': 'nosniff',
  };

  if (extension === '.html') {
    headers['cache-control'] = 'no-cache';
  } else {
    headers['cache-control'] = 'public, max-age=3600';
  }

  response.writeHead(200, headers);
  if (method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (isApiRequest(url.pathname)) {
      proxyToApi(request, response);
      return;
    }

    if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
      response.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
      response.end('Method Not Allowed');
      return;
    }

    let filePath = safeStaticPath(url.pathname);
    if (!filePath) {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Bad Request');
      return;
    }

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      serveFile(filePath, response, request.method);
      return;
    }

    if (!path.extname(url.pathname)) {
      serveFile(path.join(staticRoot, 'index.html'), response, request.method);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await readFile(path.join(staticRoot, 'index.html'), 'utf8'));
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    }
    response.end('Internal Server Error');
  }
});

server.listen(publicPort, '0.0.0.0', () => {
  console.log(`Sulandra website listening on 0.0.0.0:${publicPort}; API on 127.0.0.1:${apiPort}`);
});

const shutdown = (signal) => {
  console.log(`Received ${signal}; shutting down website and API.`);
  server.close(() => process.exit(0));
  apiProcess.kill(signal);
  setTimeout(() => process.exit(0), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
