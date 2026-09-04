import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-codebase-workspace-reuse.mjs <execution-server.mjs>');

let source = await readFile(target, 'utf8');
const marker = 'CODEBASE_WORKSPACE_REUSE_V1';
if (source.includes(marker)) {
  console.log('Codebase workspace reuse already installed.');
  process.exit(0);
}

const oldCreateStart = `const createWorkspace = async owner => {
  await loadWorkspaces();
  const owned = [...workspaces.values()].filter(item => item.owner === owner);
  if (owned.length >= maxWorkspacesPerOwner) {`;

const newCreateStart = `const createWorkspace = async owner => {
  await loadWorkspaces();
  const owned = [...workspaces.values()].filter(item => item.owner === owner);

  /* ${marker}
     Standalone Codebase intentionally uses one durable workspace per owner.
     The terminal gateway runs in multiple Railway regions and its in-memory
     owner -> workspace cache disappears on deploy/restart. Reusing the newest
     persisted Codebase workspace here makes POST /v1/workspaces idempotent for
     Codebase owners, so a gateway restart cannot consume all workspace slots or
     fail /pty with "Workspace limit reached". Engineering Workspace owners keep
     the normal multi-workspace quota behavior unchanged. */
  if (owner.startsWith('codebase:') && owned.length) {
    const workspace = owned
      .slice()
      .sort((left, right) => Number(right.lastUsedAt || right.createdAt || 0) - Number(left.lastUsedAt || left.createdAt || 0))[0];
    workspace.lastUsedAt = now();
    workspaces.set(workspace.id, workspace);
    await saveWorkspace(workspace);
    return workspace;
  }

  if (owned.length >= maxWorkspacesPerOwner) {`;

if (!source.includes(oldCreateStart)) {
  throw new Error('Post-hardening terminal createWorkspace anchor changed');
}
source = source.replace(oldCreateStart, newCreateStart);

for (const required of [
  marker,
  "owner.startsWith('codebase:')",
  'await loadWorkspaces();',
  '.sort((left, right) => Number(right.lastUsedAt || right.createdAt || 0)',
  'await saveWorkspace(workspace);',
  'if (owned.length >= maxWorkspacesPerOwner)',
]) {
  if (!source.includes(required)) throw new Error(`Codebase workspace reuse missing ${required}`);
}

await writeFile(target, source, 'utf8');
console.log('Installed durable Codebase workspace reuse ahead of the generic workspace quota gate.');
