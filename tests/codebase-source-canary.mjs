import http from 'node:http';
import { readCodebaseFile, readCodebaseTree } from '../api/src/it-codebase-source.ts';

const port = Number(process.env.PORT || 4000);
const E2E_MARKER = 'codebase-source-canary-v1';

const json = (res, status, body) => {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    'cache-control': 'no-store',
  });
  res.end(payload);
};

const authorized = (req) => String(req.headers['x-sulandra-e2e-source'] || '') === E2E_MARKER;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://codebase-source-canary');
  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, source: 'feature-codebase-module' });
    return;
  }
  if (!authorized(req)) {
    json(res, 401, { error: 'Unauthorized' });
    return;
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/it-solutions/codebase/tree') {
      json(res, 200, { data: await readCodebaseTree() });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/it-solutions/codebase/file') {
      json(res, 200, { data: await readCodebaseFile(url.searchParams.get('path')) });
      return;
    }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = Number(error?.status) || 500;
    json(res, status >= 400 && status < 600 ? status : 500, { error: String(error?.message || 'Codebase source error') });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Codebase source canary listening on 0.0.0.0:${port}`);
});
