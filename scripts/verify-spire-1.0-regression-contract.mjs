import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'config/spire-1.0-regression-contract.json');
const IMMUTABLE_SPIRE_1_0_BASELINE = '704f6ab2d4913bb20594c1b8be8f1519b4f5d548';
const failures = [];
const passes = [];
const sourceCache = new Map();

const runGit = (args, options = {}) => spawnSync('git', args, {
  cwd: root,
  encoding: 'utf8',
  ...options,
});

const fail = (message) => failures.push(message);
const pass = (message) => passes.push(message);

async function loadManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    fail(`Unable to load Step 4 contract manifest: ${error?.message || error}`);
    return null;
  }
}

async function source(relativePath) {
  if (sourceCache.has(relativePath)) return sourceCache.get(relativePath);
  const absolute = path.join(root, relativePath);
  try {
    const value = await readFile(absolute, 'utf8');
    sourceCache.set(relativePath, value);
    return value;
  } catch (error) {
    fail(`Missing required contract file ${relativePath}: ${error?.message || error}`);
    sourceCache.set(relativePath, '');
    return '';
  }
}

function verifyGitRepository(manifest) {
  const inside = runGit(['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    fail('SPIRE 1.0 regression contract must run inside the Git repository.');
    return;
  }

  if (manifest.baselineSha !== IMMUTABLE_SPIRE_1_0_BASELINE) {
    fail(`Contract baseline changed. Expected immutable SPIRE 1.0 SHA ${IMMUTABLE_SPIRE_1_0_BASELINE}, found ${manifest.baselineSha || '<missing>'}.`);
    return;
  }

  const baseline = runGit(['cat-file', '-e', `${IMMUTABLE_SPIRE_1_0_BASELINE}^{commit}`]);
  if (baseline.status !== 0) {
    fail(`Frozen SPIRE 1.0 baseline ${IMMUTABLE_SPIRE_1_0_BASELINE} is not available in this checkout. Use a full-history checkout/fetch.`);
  } else {
    pass(`Frozen baseline exists: ${IMMUTABLE_SPIRE_1_0_BASELINE}`);
  }

  const headResult = runGit(['rev-parse', 'HEAD']);
  const head = headResult.status === 0 ? headResult.stdout.trim() : '';
  if (!head) {
    fail('Unable to resolve current HEAD.');
  } else {
    pass(`Current head: ${head}`);
  }

  if (baseline.status === 0 && head) {
    const ancestor = runGit(['merge-base', '--is-ancestor', IMMUTABLE_SPIRE_1_0_BASELINE, head]);
    if (ancestor.status !== 0) {
      fail(`Current HEAD ${head} is not descended from frozen SPIRE 1.0 baseline ${IMMUTABLE_SPIRE_1_0_BASELINE}.`);
    } else {
      pass('SPIRE 1.1 remains descended from the frozen SPIRE 1.0 baseline.');
    }
  }

  const releaseRefs = [
    `refs/remotes/origin/${manifest.releaseBranch}`,
    `refs/heads/${manifest.releaseBranch}`,
  ];
  let releaseSha = '';
  let releaseRef = '';
  for (const ref of releaseRefs) {
    const result = runGit(['rev-parse', '--verify', ref]);
    if (result.status === 0) {
      releaseSha = result.stdout.trim();
      releaseRef = ref;
      break;
    }
  }
  if (!releaseSha) {
    fail(`Immutable release ref ${manifest.releaseBranch} is unavailable. CI must fetch it before running the contract.`);
  } else if (releaseSha !== IMMUTABLE_SPIRE_1_0_BASELINE) {
    fail(`Immutable release ref moved: ${releaseRef} resolves to ${releaseSha}, expected ${IMMUTABLE_SPIRE_1_0_BASELINE}.`);
  } else {
    pass(`${manifest.releaseBranch} still points to the frozen SPIRE 1.0 baseline.`);
  }

  if (baseline.status === 0 && Array.isArray(manifest.protectedDeploymentFiles) && manifest.protectedDeploymentFiles.length) {
    const diff = runGit(['diff', '--quiet', IMMUTABLE_SPIRE_1_0_BASELINE, '--', ...manifest.protectedDeploymentFiles]);
    if (diff.status === 1) {
      const names = runGit(['diff', '--name-only', IMMUTABLE_SPIRE_1_0_BASELINE, '--', ...manifest.protectedDeploymentFiles]);
      fail(`Railway deployment architecture changed from SPIRE 1.0 baseline: ${(names.stdout || '').trim() || 'protected deployment files differ'}`);
    } else if (diff.status !== 0) {
      fail(`Unable to compare Railway deployment files with SPIRE 1.0 baseline: ${(diff.stderr || diff.stdout || '').trim()}`);
    } else {
      pass('Railway deployment architecture files are byte-for-byte unchanged from SPIRE 1.0.');
    }
  }
}

async function verifyCheck(groupId, check) {
  const relative = String(check.path || '').trim();
  if (!relative) {
    fail(`${groupId}: contract check has no path.`);
    return;
  }

  const absolute = path.join(root, relative);
  try {
    await access(absolute);
  } catch {
    fail(`${groupId}: missing ${relative}`);
    return;
  }

  const needsText = (check.mustContain?.length || check.mustContainAny?.length || check.mustNotContain?.length || check.syntaxCheck);
  const text = needsText ? await source(relative) : '';

  for (const marker of check.mustContain || []) {
    if (!text.includes(marker)) fail(`${groupId}: ${relative} missing required marker ${JSON.stringify(marker)}`);
  }

  if (Array.isArray(check.mustContainAny) && check.mustContainAny.length) {
    if (!check.mustContainAny.some((marker) => text.includes(marker))) {
      fail(`${groupId}: ${relative} missing every accepted marker: ${check.mustContainAny.map((marker) => JSON.stringify(marker)).join(', ')}`);
    }
  }

  for (const marker of check.mustNotContain || []) {
    if (text.includes(marker)) fail(`${groupId}: ${relative} contains forbidden regression marker ${JSON.stringify(marker)}`);
  }

  if (check.syntaxCheck) {
    const syntax = spawnSync(process.execPath, ['--check', absolute], { cwd: root, encoding: 'utf8' });
    if (syntax.status !== 0) {
      fail(`${groupId}: ${relative} JavaScript syntax check failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);
    }
  }
}

async function verifyGroups(title, groups) {
  console.log(`\n${title}`);
  for (const group of groups || []) {
    const before = failures.length;
    for (const check of group.checks || []) await verifyCheck(group.id, check);
    if (failures.length === before) {
      pass(`${group.id}: ${group.description}`);
      console.log(`  PASS ${group.id}`);
    } else {
      console.log(`  FAIL ${group.id}`);
    }
  }
}

const manifest = await loadManifest();
if (manifest) {
  console.log(`${manifest.name} v${manifest.version}`);
  verifyGitRepository(manifest);
  await verifyGroups('SPIRE 1.0 production invariants', manifest.invariants);
  await verifyGroups('SPIRE 1.1 regulatory acceptance foundations', manifest.regulatoryAcceptance);
}

if (failures.length) {
  console.error(`\nSPIRE 1.0 regression contract FAILED (${failures.length} violation${failures.length === 1 ? '' : 's'}):`);
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`\nSPIRE 1.0 regression contract PASSED (${passes.length} assertions/groups).`);
console.log(`Frozen baseline: ${IMMUTABLE_SPIRE_1_0_BASELINE}`);
console.log('Client Station/fullscreen/chart/chat/theme/header/clinical/home-scope invariants remain present; Railway deployment files are unchanged; Steps 1-3 regulatory foundations remain wired.');
