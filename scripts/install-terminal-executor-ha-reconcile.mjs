import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-terminal-executor-ha-reconcile.mjs <server.mjs>');

let source = await readFile(target, 'utf8');
const marker = 'TERMINAL_EXECUTOR_HA_RECONCILE_V1';
if (source.includes(marker)) {
  console.log('Terminal executor HA reconciliation already installed.');
  process.exit(0);
}

const oldResolvers = `const getWorkspace = (req, workspaceId) => {
  const workspace = workspaces.get(workspaceId);
  return workspace && workspace.owner === ownerOf(req) ? workspace : null;
};
const getSession = (req, sessionId) => {
  const session = sessions.get(sessionId);
  return session && session.owner === ownerOf(req) ? session : null;
};`;

const newResolvers = `/* ${marker}
   executor-a and executor-b share /state, /workspaces and the Docker socket but
   keep their JavaScript Maps independently. Caddy is allowed to fail over from
   one executor to the other, so a request may legitimately land on a process
   that did not create the workspace/session. Rehydrate only on a local miss;
   the normal hot path remains an in-memory lookup. */
const resolveWorkspace = async (workspaceId, owner) => {
  let workspace = workspaces.get(workspaceId);
  if (!workspace) {
    await loadWorkspaces();
    workspace = workspaces.get(workspaceId);
  }
  return workspace && workspace.owner === owner ? workspace : null;
};
const resolveSession = async (sessionId, owner) => {
  let session = sessions.get(sessionId);
  if (!session) {
    await reconcileSessions();
    session = sessions.get(sessionId);
  }
  return session && session.owner === owner ? session : null;
};
const getWorkspace = (req, workspaceId) => resolveWorkspace(workspaceId, ownerOf(req));
const getSession = (req, sessionId) => resolveSession(sessionId, ownerOf(req));`;

if (!source.includes(oldResolvers)) throw new Error('Terminal executor resolver anchor changed');
source = source.replace(oldResolvers, newResolvers);

const oldCreateWorkspace = `const createWorkspace = async owner => {
  const owned = [...workspaces.values()].filter(item => item.owner === owner);`;
const newCreateWorkspace = `const createWorkspace = async owner => {
  // Refresh the shared workspace metadata before enforcing an owner-wide cap.
  await loadWorkspaces();
  const owned = [...workspaces.values()].filter(item => item.owner === owner);`;
if (!source.includes(oldCreateWorkspace)) throw new Error('Terminal workspace creation anchor changed');
source = source.replace(oldCreateWorkspace, newCreateWorkspace);

const oldCreateSession = `const createSession = async (workspace, owner, cols, rows) => {
  const active = [...sessions.values()].filter(item => item.workspaceId === workspace.id);`;
const newCreateSession = `const createSession = async (workspace, owner, cols, rows) => {
  // Include sessions created by the peer executor before enforcing the limit.
  await reconcileSessions();
  const active = [...sessions.values()].filter(item => item.workspaceId === workspace.id);`;
if (!source.includes(oldCreateSession)) throw new Error('Terminal session creation anchor changed');
source = source.replace(oldCreateSession, newCreateSession);

const oldDestroyWorkspace = `const destroyWorkspace = async workspace => {
  for (const session of [...sessions.values()]) {`;
const newDestroyWorkspace = `const destroyWorkspace = async workspace => {
  // A workspace may own containers created through the peer executor.
  await reconcileSessions();
  for (const session of [...sessions.values()]) {`;
if (!source.includes(oldDestroyWorkspace)) throw new Error('Terminal workspace destruction anchor changed');
source = source.replace(oldDestroyWorkspace, newDestroyWorkspace);

const oldWorkspaceGet = `app.get('/v1/workspaces/:workspaceId', (req, res) => {
  const workspace = getWorkspace(req, req.params.workspaceId);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  workspace.lastUsedAt = now(); void saveWorkspace(workspace);
  const activeSessions = [...sessions.values()].filter(item => item.workspaceId === workspace.id).length;
  res.json({ workspaceId: workspace.id, cwd: '/workspace', activeSessions, isolated: true, isolationProvider: 'docker' });
});`;
const newWorkspaceGet = `app.get('/v1/workspaces/:workspaceId', async (req, res, next) => {
  try {
    const workspace = await getWorkspace(req, req.params.workspaceId);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    workspace.lastUsedAt = now(); void saveWorkspace(workspace);
    await reconcileSessions();
    const activeSessions = [...sessions.values()].filter(item => item.workspaceId === workspace.id).length;
    res.json({ workspaceId: workspace.id, cwd: '/workspace', activeSessions, isolated: true, isolationProvider: 'docker' });
  } catch (error) { next(error); }
});`;
if (!source.includes(oldWorkspaceGet)) throw new Error('Terminal workspace GET anchor changed');
source = source.replace(oldWorkspaceGet, newWorkspaceGet);

source = source.replaceAll(
  `const workspace = getWorkspace(req, req.params.workspaceId);`,
  `const workspace = await getWorkspace(req, req.params.workspaceId);`,
);
source = source.replaceAll(
  `const session = getSession(req, req.params.sessionId);`,
  `const session = await getSession(req, req.params.sessionId);`,
);

const oldWsResolver = `  const session = sessions.get(match[1]);
  if (!session || session.owner !== owner) {`;
const newWsResolver = `  const session = await resolveSession(match[1], owner);
  if (!session) {`;
if (!source.includes(oldWsResolver)) throw new Error('Terminal execution WebSocket resolver anchor changed');
source = source.replace(oldWsResolver, newWsResolver);

for (const required of [
  marker,
  'await loadWorkspaces();',
  'await reconcileSessions();',
  'await getWorkspace(req, req.params.workspaceId)',
  'await getSession(req, req.params.sessionId)',
  'await resolveSession(match[1], owner)',
]) {
  if (!source.includes(required)) throw new Error(`Terminal executor HA reconciliation missing ${required}`);
}

await writeFile(target, source, 'utf8');
console.log('Installed terminal executor HA workspace/session reconciliation for Caddy failover.');
