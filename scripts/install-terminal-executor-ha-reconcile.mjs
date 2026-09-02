import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-terminal-executor-ha-reconcile.mjs <server.mjs>');

let source = await readFile(target, 'utf8');
const marker = 'TERMINAL_EXECUTOR_HA_RECONCILE_V1';
if (source.includes(marker)) {
  console.log('Terminal executor HA reconciliation already installed.');
  process.exit(0);
}

// This installer runs after install-terminal-industry-hardening.mjs. That
// hardening already persists session metadata into the shared /state volume and
// makes normal REST lookups fall back to loadSessionSync(). The remaining HA
// hole is the execution WebSocket upgrade path, which still reads only the
// current process's in-memory sessions Map. After Caddy fails over to the peer
// executor, that direct lookup can therefore return 404 for a live container.
const oldGetSession = `const getSession = (req, sessionId) => {
  const session = sessions.get(sessionId) || loadSessionSync(sessionId);
  return session && session.owner === ownerOf(req) ? session : null;
};`;

const newGetSession = `/* ${marker}
   executor-a and executor-b share /state, /workspaces and the Docker socket but
   keep separate JavaScript Maps. Keep the existing synchronous REST hot path,
   and provide an async resolver for WebSocket failover that can also reconcile
   a live Docker session if its shared metadata has not been observed yet. */
const getSession = (req, sessionId) => {
  const session = sessions.get(sessionId) || loadSessionSync(sessionId);
  return session && session.owner === ownerOf(req) ? session : null;
};
const resolveSessionForOwner = async (sessionId, owner) => {
  let session = sessions.get(sessionId) || loadSessionSync(sessionId);
  if (!session) {
    await reconcileSessions();
    session = sessions.get(sessionId) || loadSessionSync(sessionId);
  }
  return session && session.owner === owner ? session : null;
};`;

if (!source.includes(oldGetSession)) throw new Error('Post-hardening terminal session resolver anchor changed');
source = source.replace(oldGetSession, newGetSession);

const oldWsResolver = `  const session = sessions.get(match[1]);
  if (!session || session.owner !== owner) {`;
const newWsResolver = `  const session = await resolveSessionForOwner(match[1], owner);
  if (!session) {`;
if (!source.includes(oldWsResolver)) throw new Error('Terminal execution WebSocket resolver anchor changed');
source = source.replace(oldWsResolver, newWsResolver);

for (const required of [
  marker,
  'loadSessionSync(sessionId)',
  'await reconcileSessions();',
  'await resolveSessionForOwner(match[1], owner)',
]) {
  if (!source.includes(required)) throw new Error(`Terminal executor HA reconciliation missing ${required}`);
}

await writeFile(target, source, 'utf8');
console.log('Installed terminal executor HA WebSocket reconciliation for Caddy failover.');
