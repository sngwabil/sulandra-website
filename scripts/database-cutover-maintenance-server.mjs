import http from 'node:http';

const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be a valid TCP port');
}

const writeJson = (response, status, payload, extraHeaders = {}) => {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(body);
};

const server = http.createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://localhost').pathname;
  if (path === '/live') {
    writeJson(response, 200, { ok: true, service: 'spire-api', mode: 'database-cutover-maintenance' });
    return;
  }
  if (path === '/health') {
    writeJson(response, 200, {
      ok: true,
      service: 'spire-api',
      mode: 'database-cutover-maintenance',
      database: 'quiesced',
    });
    return;
  }
  writeJson(
    response,
    503,
    {
      error: 'Sulandra is completing a protected database migration. Please try again shortly.',
      code: 'DATABASE_CUTOVER_MAINTENANCE',
    },
    { 'retry-after': '120' },
  );
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[database-cutover] Maintenance server listening on 0.0.0.0:${port}; no database connection or background worker was started.`);
});

const shutdown = (signal) => {
  console.log(`[database-cutover] ${signal} received; draining maintenance server.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
