import fs from 'node:fs';

const target = process.argv[2] || '/gateway/server.mjs';
let source = fs.readFileSync(target, 'utf8');

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Terminal gateway HA patch failed: ${label}`);
  source = source.replace(from, to);
};

replace(
  `  res.status(executionHealthy ? 200 : 503).json({
    ok: executionHealthy,`,
  `  // Liveness is intentionally independent of the execution plane. A brief
  // upstream interruption must not make Railway recycle every healthy gateway
  // replica and amplify WebSocket churn. The payload still exposes readiness.
  res.status(200).json({
    ok: true,
    ready: executionHealthy,`,
  'liveness/readiness split',
);

replace(
  `server.listen(port, '0.0.0.0', () => {
  console.log(\`Sulandra terminal gateway listening on 0.0.0.0:\${port}\`);
});`,
  `let shuttingDown = false;
const shutdown = signal => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(\`[terminal-gateway] graceful shutdown requested by \${signal}\`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.close(1012, 'Gateway replica restarting'); } catch {}
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 25_000).unref?.();
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

server.listen(port, '0.0.0.0', () => {
  console.log(\`Sulandra terminal gateway listening on 0.0.0.0:\${port}\`);
});`,
  'graceful shutdown',
);

fs.writeFileSync(target, source);
console.log(`Installed terminal gateway HA hardening into ${target}`);
