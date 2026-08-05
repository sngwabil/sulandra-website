import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateRoots = [
  path.join(repositoryRoot, 'dist-web'),
  repositoryRoot,
];
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

async function resolveExistingFile(relativePath) {
  for (const root of candidateRoots) {
    const candidate = path.resolve(root, relativePath);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) continue;
    try {
      const info = await stat(candidate);
      const resolved = info.isDirectory() ? path.join(candidate, 'index.html') : candidate;
      await access(resolved);
      return resolved;
    } catch {
      // Try the next root.
    }
  }
  return null;
}

function writePlain(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Disposition': 'inline',
  });
  response.end(text);
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (requestUrl.pathname === '/health') {
      const homepage = await resolveExistingFile('index.html');
      if (!homepage) {
        writePlain(response, 503, 'index.html unavailable');
        return;
      }
      writePlain(response, 200, 'ok');
      return;
    }

    const redirectTarget = redirects.get(requestUrl.pathname);
    if (redirectTarget) {
      response.writeHead(302, {
        Location: redirectTarget,
        'Cache-Control': 'no-store',
      });
      response.end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      writePlain(response, 400, 'Bad Request');
      return;
    }

    if (pathname === '/') pathname = '/index.html';
    const relativePath = pathname.replace(/^\/+/, '');
    const filePath = await resolveExistingFile(relativePath);

    if (!filePath) {
      writePlain(response, 404, '404 Not Found');
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const isHtml = extension === '.html';
    response.writeHead(200, {
      'Content-Type': mimeTypes[extension] || 'application/octet-stream',
      'Content-Disposition': isHtml ? 'inline' : 'inline',
      'Cache-Control': isHtml ? 'no-store, max-age=0' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(filePath).on('error', (error) => {
      console.error('Static file stream failed:', error);
      if (!response.headersSent) writePlain(response, 500, 'Internal Server Error');
      else response.destroy(error);
    }).pipe(response);
  } catch (error) {
    console.error('Static website request failed:', error);
    if (!response.headersSent) writePlain(response, 500, 'Internal Server Error');
    else response.destroy(error);
  }
});

server.listen(port, host, async () => {
  const homepage = await resolveExistingFile('index.html');
  const careers = await resolveExistingFile('careers.html');
  console.log(`Static website listening on ${host}:${port}`);
  console.log(`Repository root: ${repositoryRoot}`);
  console.log(`Homepage resolved: ${homepage || 'MISSING'}`);
  console.log(`Careers page resolved: ${careers || 'MISSING'}`);
});
