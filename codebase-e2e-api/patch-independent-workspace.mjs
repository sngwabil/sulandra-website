import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node patch-independent-workspace.mjs <server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'CODEBASE_API_INDEPENDENT_WORKSPACE_V1';
if (source.includes(marker)) {
  console.log('Codebase API independent workspace patch already installed.');
  process.exit(0);
}

const replace = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Codebase API independence patch failed: ${label}`);
  source = source.replace(from, to);
};

replace(
  `const repository = String(process.env.CODEBASE_GIT_REPOSITORY || process.env.SULANDRA_GITHUB_REPOSITORY || 'https://github.com/sngwabil/sulandra-website.git').trim();\nconst gitBranch = String(process.env.CODEBASE_GIT_BRANCH || process.env.IT_AGENT_GITHUB_BASE_BRANCH || 'release/sulandra-1.0').trim();\nconst githubToken = String(process.env.GITHUB_TOKEN || process.env.SULANDRA_GITHUB_TOKEN || '').trim();`,
  `/* ${marker}\n * Standalone Codebase is not the Sulandra Health engineering environment.\n * It starts unlinked and may only use an explicitly configured project repo.\n * The Sulandra Health repository is rejected even if a legacy Railway variable\n * still points at it. Engineering Terminal owns that repository integration. */\nconst configuredRepository = String(process.env.CODEBASE_GIT_REPOSITORY || '').trim();\nconst normalizeRepository = value => String(value || '')\n  .trim()\n  .replace(/^git@github\\.com:/i, 'https://github.com/')\n  .replace(/\\.git$/i, '')\n  .replace(/\\/+$/, '')\n  .toLowerCase();\nconst isSulandraHealthRepository = value => normalizeRepository(value) === 'https://github.com/sngwabil/sulandra-website';\nconst repository = isSulandraHealthRepository(configuredRepository) ? '' : configuredRepository;\nconst gitBranch = String(process.env.CODEBASE_GIT_BRANCH || 'main').trim() || 'main';\nconst githubToken = String(process.env.GITHUB_TOKEN || '').trim();`,
  'remove Sulandra Health Git fallbacks',
);

replace(
  `if (authMode === 'jwt' && !jwtSecret) throw new Error('JWT_SECRET is required when CODEBASE_AUTH_MODE=jwt');`,
  `if (authMode === 'jwt' && !jwtSecret) throw new Error('JWT_SECRET is required when CODEBASE_AUTH_MODE=jwt');\nif (configuredRepository && !repository) {\n  console.warn('[codebase-e2e-api] Ignoring legacy Sulandra Health repository binding; standalone Codebase starts unlinked.');\n}`,
  'report ignored legacy repository binding',
);

replace(
  `const ensureWorkspace = async () => {\n  await mkdir(path.dirname(workspaceDir), { recursive: true });\n  const gitDir = path.join(workspaceDir, '.git');\n  let hasGit = false;\n  try { hasGit = (await lstat(gitDir)).isDirectory(); } catch {}\n  if (!hasGit) {\n    await rm(workspaceDir, { recursive: true, force: true });\n    await mkdir(path.dirname(workspaceDir), { recursive: true });\n    const parentGit = gitFor(path.dirname(workspaceDir));\n    await parentGit.clone(repository, workspaceDir, ['--branch', gitBranch, '--single-branch']);\n  }\n  const git = gitFor(workspaceDir);\n  await git.addConfig('user.name', process.env.CODEBASE_GIT_USER_NAME || 'Sulandra Codebase');\n  await git.addConfig('user.email', process.env.CODEBASE_GIT_USER_EMAIL || 'admin@sulandrahealth.com');\n  const current = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();\n  if (current !== gitBranch) await git.checkout(gitBranch);\n  return git;\n};\n\nlet git = await ensureWorkspace();`,
  `const ensureWorkspace = async () => {\n  await mkdir(workspaceDir, { recursive: true, mode: 0o700 });\n  const gitDir = path.join(workspaceDir, '.git');\n  let hasGit = false;\n  try { hasGit = (await lstat(gitDir)).isDirectory(); } catch {}\n\n  if (!repository) {\n    if (hasGit) {\n      const existingGit = gitFor(workspaceDir);\n      const remotes = await existingGit.getRemotes(true).catch(() => []);\n      const origin = remotes.find(item => item.name === 'origin');\n      const originUrl = origin?.refs?.fetch || origin?.refs?.push || '';\n      if (isSulandraHealthRepository(originUrl)) {\n        await rm(workspaceDir, { recursive: true, force: true });\n        await mkdir(workspaceDir, { recursive: true, mode: 0o700 });\n      }\n    }\n    return null;\n  }\n\n  if (!hasGit) {\n    await rm(workspaceDir, { recursive: true, force: true });\n    await mkdir(path.dirname(workspaceDir), { recursive: true });\n    const parentGit = gitFor(path.dirname(workspaceDir));\n    await parentGit.clone(repository, workspaceDir, ['--branch', gitBranch, '--single-branch']);\n  }\n  const git = gitFor(workspaceDir);\n  const remotes = await git.getRemotes(true);\n  const origin = remotes.find(item => item.name === 'origin');\n  if (isSulandraHealthRepository(origin?.refs?.fetch || origin?.refs?.push || '')) {\n    await rm(workspaceDir, { recursive: true, force: true });\n    await mkdir(workspaceDir, { recursive: true, mode: 0o700 });\n    return null;\n  }\n  await git.addConfig('user.name', process.env.CODEBASE_GIT_USER_NAME || 'Sulandra Codebase');\n  await git.addConfig('user.email', process.env.CODEBASE_GIT_USER_EMAIL || 'codebase@local');\n  const current = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();\n  if (current !== gitBranch) await git.checkout(gitBranch);\n  return git;\n};\n\nlet git = await ensureWorkspace();`,
  'make Git optional and reject the Sulandra Health repository',
);

replace(
  `res.status(db === 'unreachable' ? 503 : 200).json({ ok: db !== 'unreachable', service: 'codebase-e2e-api', workspace: workspaceDir, branch: gitBranch, database: db });`,
  `res.status(db === 'unreachable' ? 503 : 200).json({\n    ok: db !== 'unreachable',\n    service: 'codebase-e2e-api',\n    workspace: workspaceDir,\n    branch: repository ? gitBranch : null,\n    gitBacked: Boolean(repository),\n    workspaceKind: 'independent',\n    database: db,\n  });`,
  'health endpoint must disclose standalone workspace state',
);

replace(
  `    const message = String(req.body?.message || '').trim();\n    if (!message || message.length > 240) return res.status(400).json({ error: 'Commit message must be 1-240 characters' });\n    git = await ensureWorkspace();\n    await git.add(['-A']);`,
  `    const message = String(req.body?.message || '').trim();\n    if (!message || message.length > 240) return res.status(400).json({ error: 'Commit message must be 1-240 characters' });\n    if (!repository) return res.status(409).json({ error: 'No project Git repository is linked to this independent Codebase workspace.' });\n    git = await ensureWorkspace();\n    if (!git) return res.status(409).json({ error: 'The configured project repository is not available to Codebase.' });\n    await git.add(['-A']);`,
  'prevent commits to an implicit Sulandra repository',
);

replace(
  `console.log(\`Sulandra Codebase API listening on 0.0.0.0:\${port} workspace=\${workspaceDir} branch=\${gitBranch}\`);`,
  `console.log(\`Sulandra Codebase API listening on 0.0.0.0:\${port} workspace=\${workspaceDir} git=\${repository ? gitBranch : 'unlinked'} kind=independent\`);`,
  'startup identity',
);

for (const required of [
  marker,
  "const configuredRepository = String(process.env.CODEBASE_GIT_REPOSITORY || '').trim();",
  "workspaceKind: 'independent'",
  "gitBacked: Boolean(repository)",
  "No project Git repository is linked to this independent Codebase workspace.",
  "isSulandraHealthRepository",
]) {
  if (!source.includes(required)) throw new Error(`Codebase API independence verification missing: ${required}`);
}

for (const forbidden of [
  "process.env.SULANDRA_GITHUB_REPOSITORY",
  "process.env.SULANDRA_GITHUB_TOKEN",
  "process.env.IT_AGENT_GITHUB_BASE_BRANCH",
  "'https://github.com/sngwabil/sulandra-website.git'",
  "'admin@sulandrahealth.com'",
]) {
  if (source.includes(forbidden)) throw new Error(`Codebase API still contains forbidden Sulandra Health Git coupling: ${forbidden}`);
}

fs.writeFileSync(target, source);
console.log('Installed standalone Codebase API workspace boundary.');
