import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-web');
const port = Number(process.env.PORT || 8080);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.pdf', 'application/pdf'],
]);
const compressibleExtensions = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.webmanifest', '.xml']);

function safePath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.resolve(root, `.${requested}`);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function cacheControlFor(file) {
  const extension = path.extname(file).toLowerCase();
  // HTML must always revalidate because it defines the authenticated app shell.
  if (extension === '.html') return 'no-cache, no-store, must-revalidate';
  // Versioned JS/CSS URLs are used throughout Sulandra. Allow the browser to
  // keep a local copy but require revalidation, so repeat Admin launches can use
  // a fast 304 instead of re-downloading every runtime after each sign-in.
  if (extension === '.js' || extension === '.css') return 'no-cache, must-revalidate';
  return 'public, max-age=3600';
}

function etagFor(info) {
  return `W/\"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}\"`;
}

function isFresh(request, info, etag) {
  const ifNoneMatch = request.headers['if-none-match'];
  if (ifNoneMatch && String(ifNoneMatch).split(',').map((value) => value.trim()).includes(etag)) return true;
  const ifModifiedSince = request.headers['if-modified-since'];
  if (!ifModifiedSince) return false;
  const since = Date.parse(String(ifModifiedSince));
  return Number.isFinite(since) && Math.trunc(info.mtimeMs / 1000) <= Math.trunc(since / 1000);
}

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method Not Allowed');
    return;
  }

  const requestUrl = request.url || '/';
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
    const extension = path.extname(file).toLowerCase();
    const etag = etagFor(fileInfo);
    const commonHeaders = {
      'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
      'Cache-Control': cacheControlFor(file),
      'ETag': etag,
      'Last-Modified': fileInfo.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Accept-Encoding',
    };

    // Do not send Clear-Site-Data from /admin.html. The old header erased the
    // browser's entire Sulandra HTTP cache every time Admin opened, forcing all
    // Admin runtimes to be fetched again and producing a long post-login stall.
    if (isFresh(request, fileInfo, etag) && extension !== '.html') {
      response.writeHead(304, commonHeaders);
      response.end();
      return;
    }

    const acceptsGzip = /(?:^|,)\s*gzip\s*(?:;|,|$)/i.test(String(request.headers['accept-encoding'] || ''));
    const useGzip = request.method !== 'HEAD' && acceptsGzip && compressibleExtensions.has(extension) && fileInfo.size >= 1_024;
    const headers = {
      ...commonHeaders,
      ...(useGzip ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': fileInfo.size }),
    };

    response.writeHead(200, headers);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(file);
    if (useGzip) stream.pipe(createGzip({ level: 6 })).pipe(response);
    else stream.pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('404 Not Found');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Sulandra static website listening on 0.0.0.0:${port}`);
});
