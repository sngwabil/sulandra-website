import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-codebase-pty-session-resume.mjs <gateway-server.mjs>');
let source = await readFile(target, 'utf8');

const marker = 'CODEBASE_PTY_SESSION_RESUME_V1';
if (source.includes(marker)) {
  console.log('Codebase PTY session resume already installed.');
  process.exit(0);
}
if (!source.includes('CODEBASE_PTY_COMPAT_V1')) throw new Error('Codebase PTY compatibility must be installed before session resume');

const replaceOnce = (needle, replacement, label) => {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Codebase PTY session-resume anchor changed: ${label}`);
  source = source.slice(0, index) + replacement + source.slice(index + needle.length);
};

replaceOnce(
  'const codebaseCompatWorkspaceLocks = new Map();',
  `const codebaseCompatWorkspaceLocks = new Map();\n/* ${marker}\n   Refreshes and transient browser/network disconnects must not destroy a live\n   Codebase PTY immediately. Explicit terminal-tab closes still destroy at once.\n   A browser may retain a session id after that session was removed or after the\n   execution plane recycled it, so every requested resume is verified before the\n   browser WebSocket is accepted. Stale resumes transparently create a new PTY\n   in the same surviving Codebase workspace (or a new workspace when necessary). */\nconst codebaseCompatSessionCleanupTimers = new Map();\nconst CODEBASE_SESSION_RECONNECT_GRACE_MS = Math.max(60_000, Number(process.env.CODEBASE_SESSION_RECONNECT_GRACE_MS || 30 * 60_000));\nconst cancelCodebaseCompatSessionCleanup = sessionId => {\n  const timer = codebaseCompatSessionCleanupTimers.get(sessionId);\n  if (timer) clearTimeout(timer);\n  codebaseCompatSessionCleanupTimers.delete(sessionId);\n};\nconst scheduleCodebaseCompatSessionCleanup = (owner, sessionId) => {\n  cancelCodebaseCompatSessionCleanup(sessionId);\n  const timer = setTimeout(() => {\n    codebaseCompatSessionCleanupTimers.delete(sessionId);\n    void destroyCodebaseCompatSession(owner, sessionId);\n  }, CODEBASE_SESSION_RECONNECT_GRACE_MS);\n  timer.unref?.();\n  codebaseCompatSessionCleanupTimers.set(sessionId, timer);\n};\nconst probeCodebaseCompatResume = async (owner, sessionId, workspaceId) => {\n  const req = codebaseOwnerRequest(owner);\n  let workspaceAlive = false;\n  if (workspaceId) {\n    try {\n      await executionRequest(req, '/v1/workspaces/' + encodeURIComponent(workspaceId), { timeoutMs: 5_000 });\n      workspaceAlive = true;\n    } catch (error) {\n      if (Number(error?.status) !== 404) throw error;\n    }\n  }\n  try {\n    await executionRequest(req, '/v1/sessions/' + encodeURIComponent(sessionId) + '/output?cursor=0', { timeoutMs: 5_000 });\n    return { sessionAlive: true, workspaceAlive };\n  } catch (error) {\n    if (Number(error?.status) === 404) return { sessionAlive: false, workspaceAlive };\n    throw error;\n  }\n};`,
  'cleanup map and stale-resume probe',
);

const oldCreate = `      const created = await createCodebaseCompatSession(owner, url.searchParams.get('cols'), url.searchParams.get('rows'));
      if (!created.sessionId) throw new Error('Terminal execution plane did not return a sessionId');
      req.sulandraCodebasePty = { owner, workspaceId: created.workspaceId, sessionId: created.sessionId };
      codebasePtyWss.handleUpgrade(req, socket, head, ws => codebasePtyWss.emit('connection', ws, req));`;
const newCreate = `      const requestedSessionId = String(url.searchParams.get('sessionId') || '').trim();
      const requestedWorkspaceId = String(url.searchParams.get('workspaceId') || '').trim();
      let created;
      if (requestedSessionId) {
        if (!/^[A-Za-z0-9_-]+$/.test(requestedSessionId)) throw new Error('Invalid Codebase terminal sessionId');
        if (requestedWorkspaceId && !/^[A-Za-z0-9_-]+$/.test(requestedWorkspaceId)) throw new Error('Invalid Codebase terminal workspaceId');
        cancelCodebaseCompatSessionCleanup(requestedSessionId);
        const probe = await probeCodebaseCompatResume(owner, requestedSessionId, requestedWorkspaceId);
        if (probe.sessionAlive) {
          if (requestedWorkspaceId && probe.workspaceAlive) codebaseCompatWorkspaces.set(owner, requestedWorkspaceId);
          created = {
            workspaceId: requestedWorkspaceId || codebaseCompatWorkspaces.get(owner) || '',
            sessionId: requestedSessionId,
            resumed: true,
          };
        } else {
          if (requestedWorkspaceId && probe.workspaceAlive) {
            codebaseCompatWorkspaces.set(owner, requestedWorkspaceId);
          } else if (requestedWorkspaceId && codebaseCompatWorkspaces.get(owner) === requestedWorkspaceId) {
            codebaseCompatWorkspaces.delete(owner);
          }
          console.warn('[terminal-gateway] Codebase stale PTY resume recovered session=' + requestedSessionId + ' workspace=' + (requestedWorkspaceId || 'unknown'));
          created = await createCodebaseCompatSession(owner, url.searchParams.get('cols'), url.searchParams.get('rows'));
          created.resumed = false;
          created.recovered = true;
        }
      } else {
        created = await createCodebaseCompatSession(owner, url.searchParams.get('cols'), url.searchParams.get('rows'));
      }
      if (!created.sessionId) throw new Error('Terminal execution plane did not return a sessionId');
      req.sulandraCodebasePty = { owner, workspaceId: created.workspaceId, sessionId: created.sessionId, resumed: Boolean(created.resumed), recovered: Boolean(created.recovered) };
      codebasePtyWss.handleUpgrade(req, socket, head, ws => codebasePtyWss.emit('connection', ws, req));`;
replaceOnce(oldCreate, newCreate, 'PTY create/resume branch');

replaceOnce(
  `codebasePtyWss.on('connection', (browser, req) => {
  const { owner, workspaceId, sessionId } = req.sulandraCodebasePty;`,
  `codebasePtyWss.on('connection', (browser, req) => {
  const { owner, workspaceId, sessionId, resumed, recovered } = req.sulandraCodebasePty;
  cancelCodebaseCompatSessionCleanup(sessionId);`,
  'connection cleanup cancellation',
);

replaceOnce(
  `  browser.send(JSON.stringify({ type: 'session', sessionId, workspaceId }));`,
  `  browser.send(JSON.stringify({ type: 'session', sessionId, workspaceId, resumed: Boolean(resumed), recovered: Boolean(recovered) }));`,
  'session control frame',
);

const oldClose = `  browser.on('close', () => {
    if (closed) return;
    closed = true;
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) { try { upstream.close(1000, 'Browser disconnected'); } catch {} }
    setTimeout(() => void destroyCodebaseCompatSession(owner, sessionId), 1_000).unref?.();
  });`;
const newClose = `  browser.on('close', (code, reason) => {
    if (closed) return;
    closed = true;
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) { try { upstream.close(1000, 'Browser disconnected'); } catch {} }
    const reasonText = String(reason || '');
    const explicitTerminalClose = Number(code) === 1000 && reasonText === 'Terminal tab closed';
    if (explicitTerminalClose) {
      cancelCodebaseCompatSessionCleanup(sessionId);
      void destroyCodebaseCompatSession(owner, sessionId);
    } else {
      scheduleCodebaseCompatSessionCleanup(owner, sessionId);
    }
  });`;
replaceOnce(oldClose, newClose, 'browser close cleanup policy');

for (const required of [
  marker,
  'CODEBASE_SESSION_RECONNECT_GRACE_MS',
  'probeCodebaseCompatResume',
  "url.searchParams.get('sessionId')",
  'cancelCodebaseCompatSessionCleanup(requestedSessionId)',
  'Codebase stale PTY resume recovered',
  'scheduleCodebaseCompatSessionCleanup(owner, sessionId)',
  "reasonText === 'Terminal tab closed'",
  'resumed: Boolean(resumed)',
  'recovered: Boolean(recovered)',
]) {
  if (!source.includes(required)) throw new Error(`Codebase PTY session resume missing ${required}`);
}

await writeFile(target, source, 'utf8');
console.log('Installed durable Codebase PTY refresh/reconnect session handling.');
