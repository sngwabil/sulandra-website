import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-web');
const port = Number(process.env.PORT || 8080);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

function safePath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.resolve(root, `.${requested}`);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function cacheControlFor(file) {
  const extension = path.extname(file).toLowerCase();
  // Admin/application runtimes change frequently and must revalidate so a
  // newly deployed UI fix cannot be masked for an hour by a stale JS bundle.
  if (extension === '.html' || extension === '.js' || extension === '.css') return 'no-cache, no-store, must-revalidate';
  return 'public, max-age=3600';
}

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method Not Allowed');
    return;
  }

  const requestUrl = request.url || '/';
  const requestPathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const target = safePath(requestUrl);
  if (!target) {
    response.writeHead(400);
    response.end('Bad Request');
    return;
  }

  try {
    const info = await stat(target);
    const file = info.isDirectory() ? path.join(target, 'index.html') : target;
    const fileInfo = info.isDirectory() ? await stat(file) : info;
    const headers = {
      'Content-Type': contentTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
      'Content-Length': fileInfo.size,
      'Cache-Control': cacheControlFor(file),
      'X-Content-Type-Options': 'nosniff',
    };

    // The old Admin launcher was previously served with a one-hour asset cache.
    // Clearing only the browser cache (not cookies/storage) on the canonical
    // Admin document makes the corrected launcher take effect immediately.
    if (requestPathname === '/admin.html') headers['Clear-Site-Data'] = '"cache"';

    response.writeHead(200, headers);
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('404 Not Found');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Sulandra static website listening on 0.0.0.0:${port}`);
});
