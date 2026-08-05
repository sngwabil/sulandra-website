import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-web');
const port = Number(process.env.PORT || 8080);
const host = '0.0.0.0';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const redirects = new Map([
  ['/Careers.html', '/careers.html'],
  ['/Careers', '/careers.html'],
  ['/careers', '/careers.html'],
]);

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (requestUrl.pathname === '/health') {
      response.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end('ok');
      return;
    }

    const redirectTarget = redirects.get(requestUrl.pathname);
    if (redirectTarget) {
      response.writeHead(302, { Location: redirectTarget, 'Cache-Control': 'no-store' });
      response.end();
      return;
    }

    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === '/') pathname = '/index.html';

    const relativePath = pathname.replace(/^\/+/, '');
    const filePathCandidate = path.resolve(root, relativePath);

    if (filePathCandidate !== root && !filePathCandidate.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    let filePath = filePathCandidate;
    try {
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) filePath = path.join(filePath, 'index.html');
      await access(filePath);
    } catch {
      response.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end('404 Not Found');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-store, max-age=0' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    };
    if (extension === '.html') headers['Content-Disposition'] = 'inline';

    response.writeHead(200, headers);

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Internal Server Error');
  }
});

server.listen(port, host, () => {
  console.log(`Static website listening on ${host}:${port}`);
});
