import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node fix-codebase-preview-owner-namespace.mjs <gateway-server.mjs>');
let source = await readFile(target, 'utf8');

if (source.includes('CODEBASE_PREVIEW_OWNER_NAMESPACE_V1')) {
  console.log('Codebase preview owner namespace already repaired.');
  process.exit(0);
}

const before = `  const auth = verification.auth;\n  const owner = auth.organizationId + ':' + auth.userId;\n  const ticket = jwt.sign({ purpose: 'workspace-ide', sessionId, owner, role: auth.role }, workspaceTicketSecret, { algorithm: 'HS256', expiresIn: workspaceTicketSeconds, subject: auth.userId });`;
const after = `  const auth = verification.auth;\n  const surface = String(req.body?.surface || 'workspace').trim().toLowerCase();\n  if (!['workspace', 'codebase'].includes(surface)) return res.status(400).json({ error: 'Invalid workspace surface' });\n  // CODEBASE_PREVIEW_OWNER_NAMESPACE_V1: Codebase terminal sessions intentionally\n  // live in the codebase:<organization>:<user> owner namespace so they remain\n  // separate from Engineering Workspace while sharing the same execution plane.\n  const owner = (surface === 'codebase' ? 'codebase:' : '') + auth.organizationId + ':' + auth.userId;\n  const ticket = jwt.sign({ purpose: 'workspace-ide', sessionId, owner, role: auth.role, surface }, workspaceTicketSecret, { algorithm: 'HS256', expiresIn: workspaceTicketSeconds, subject: auth.userId });`;

const index = source.indexOf(before);
if (index < 0) throw new Error('Codebase preview owner namespace anchor changed');
source = source.slice(0, index) + after + source.slice(index + before.length);

if (!source.includes('CODEBASE_PREVIEW_OWNER_NAMESPACE_V1')) throw new Error('Codebase preview namespace marker missing');
if (!source.includes("surface === 'codebase' ? 'codebase:' : ''")) throw new Error('Codebase preview owner prefix is not installed');
if (!source.includes("['workspace', 'codebase'].includes(surface)")) throw new Error('Codebase preview surface validation is not installed');

await writeFile(target, source, 'utf8');
console.log(`Codebase preview owner namespace repaired in ${target}`);
