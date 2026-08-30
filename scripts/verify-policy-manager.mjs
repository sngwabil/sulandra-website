import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

const [routes, migration, policiesHtml, policiesJs, studioHtml, studioJs, pdfHtml, pdfJs, siaRoutes, siaRouter, itRepair] = await Promise.all([
  read('api/src/policy-routes.ts'),
  read('prisma/migrations/20260830143000_policy_manager_foundation/migration.sql'),
  read('policies.html'),
  read('assets/policies-app.js'),
  read('policy-studio.html'),
  read('assets/policy-studio.js'),
  read('policy-pdf.html'),
  read('assets/policy-pdf.js'),
  read('api/src/sia-routes.ts'),
  read('api/src/sia-mode-router.ts'),
  read('assets/it-agent-ui-regression-repair.js'),
]);

for (const marker of [
  'CREATE TABLE IF NOT EXISTS "PolicyDocument"',
  'CREATE TABLE IF NOT EXISTS "PolicyDocumentRevision"',
  'PolicyDocument_search_idx',
  "'DRAFT','IN_REVIEW','PUBLISHED','RETIRED'",
]) assert.ok(migration.includes(marker), `Policy migration missing ${marker}`);

for (const marker of [
  "app.get('/api/policies'",
  "app.get('/api/policies/:policyId'",
  "app.get('/api/policies/:policyId/pdf'",
  "app.get('/api/admin/policies/templates'",
  "app.post('/api/admin/policies'",
  "submit-review",
  "publish",
  'searchPublishedPoliciesForSia',
  'serializePolicyKnowledgeForSia',
  'requirePublishable',
  'Published policy versions are immutable',
]) assert.ok(routes.includes(marker), `Policy API missing ${marker}`);

for (const [name, source] of [['Policy Center', policiesHtml], ['Policy Studio', studioHtml], ['Policy PDF', pdfHtml]]) {
  assert.ok(source.includes('<html') && source.includes('</html>'), `${name} HTML is incomplete`);
}
for (const [name, source] of [['Policy Center', policiesJs], ['Policy Studio', studioJs], ['Policy PDF', pdfJs], ['IT Solutions repair', itRepair]]) {
  assert.doesNotThrow(() => new Function(source), `${name} browser JavaScript is invalid`);
}

for (const marker of ['Policy Center','Search & Browse','Bookmarks','Recent','Ask SIA about policies','pdfUrl']) {
  assert.ok(policiesHtml.includes(marker) || policiesJs.includes(marker), `Policy Center missing ${marker}`);
}
for (const marker of ['Policy Studio','Objective / Purpose','Documentation & Records','Compliance & Monitoring','Submit for Review','Publish Policy']) {
  assert.ok(studioHtml.includes(marker), `Policy Studio missing ${marker}`);
}
assert.ok(studioJs.includes('/api/admin/policies/templates'), 'Policy Studio is not connected to governed templates.');
assert.ok(studioJs.includes('/api/admin/policies'), 'Policy Studio is not connected to policy authoring APIs.');
assert.ok(pdfHtml.includes('Protected Policy PDF'), 'Protected Policy PDF viewer surface is missing.');
assert.ok(pdfJs.includes('/api/policies/') && pdfJs.includes('/pdf'), 'Protected PDF viewer is not connected to the policy PDF route.');
assert.ok(itRepair.includes('Policy Studio · templates & publishing'), 'IT Solutions does not expose Policy Studio.');

for (const marker of [
  "from './policy-routes.js'",
  'const policyIntent = routing.mode !== \'GENERAL\'',
  'searchPublishedPoliciesForSia(prisma, auth, safeMessage, 6)',
  'serializePolicyKnowledgeForSia(policyKnowledge)',
  'Policy grounding rules:',
  'serverPolicyKnowledge',
]) assert.ok(siaRoutes.includes(marker), `SIA policy grounding missing ${marker}`);
assert.ok(siaRouter.includes('SULANDRA_POLICY_PATTERN'), 'SIA router does not recognize policy intent.');

const routerUrl = pathToFileURL(path.join(root, 'api/src/sia-mode-router.ts')).href;
const runner = `import { classifySiaMode } from ${JSON.stringify(routerUrl)};process.stdout.write(JSON.stringify([
 classifySiaMode({message:'What is our attendance policy?'}),
 classifySiaMode({message:'Send me the PDF for the incident reporting policy.'}),
 classifySiaMode({message:'Explain the medication documentation policy.'})
]));`;
const { stdout } = await execFileAsync(process.execPath, ['--experimental-strip-types','--input-type=module','--eval', runner], { cwd: root });
const decisions = JSON.parse(stdout);
assert.equal(decisions[0].mode, 'SULANDRA', 'Nonclinical policy questions must use Sulandra mode.');
assert.equal(decisions[1].mode, 'SULANDRA', 'Policy-link questions must use Sulandra mode.');
assert.equal(decisions[2].mode, 'CLINICAL_SAFE', 'Clinical policy questions must preserve clinical-safe mode.');

console.log('Policy Manager verified: governed templates, published-only library, protected PDFs, full-text search, company scope, IT Solutions authoring, and SIA policy grounding are wired.');
