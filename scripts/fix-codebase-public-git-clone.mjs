import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node fix-codebase-public-git-clone.mjs <execution-server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'CODEBASE_PUBLIC_GIT_CLONE_V1';
if (source.includes(marker)) {
  console.log('Codebase public Git clone repair already installed.');
  process.exit(0);
}
if (!source.includes('CODEBASE_PROJECT_CONTROL_V1')) {
  throw new Error('Codebase project control must be installed before public Git clone repair');
}

const oldBlock = `    const args = ['repo', 'clone', repository, name];
    const branch = String(req.body?.branch || '').trim();
    if (branch) {
      if (!/^[A-Za-z0-9._\\/-]{1,120}$/.test(branch) || branch.includes('..')) throw codebaseHttpError(400, 'Invalid branch name.');
      args.push('--', '--branch', branch, '--single-branch');
    }
    await runInCodebaseSession(workspace, '/projects', 'gh', args, 240_000);`;

const newBlock = `    /* CODEBASE_PUBLIC_GIT_CLONE_V1
       Public repositories clone anonymously over normal HTTPS first. GitHub CLI
       is only the authenticated fallback for repositories that cannot be read
       anonymously (for example, private repositories). */
    const branch = String(req.body?.branch || '').trim();
    if (branch) {
      if (!/^[A-Za-z0-9._\\/-]{1,120}$/.test(branch) || branch.includes('..')) throw codebaseHttpError(400, 'Invalid branch name.');
    }
    const httpsUrl = 'https://github.com/' + repository + '.git';
    const gitArgs = ['clone'];
    if (branch) gitArgs.push('--branch', branch, '--single-branch');
    gitArgs.push(httpsUrl, name);
    try {
      await runInCodebaseSession(
        workspace,
        '/projects',
        'env',
        ['GIT_TERMINAL_PROMPT=0', 'git', ...gitArgs],
        240_000,
      );
    } catch (anonymousError) {
      if (await codebaseExists(root)) await rm(root, { recursive: true, force: true });
      const ghArgs = ['repo', 'clone', repository, name];
      if (branch) ghArgs.push('--', '--branch', branch, '--single-branch');
      try {
        await runInCodebaseSession(workspace, '/projects', 'gh', ghArgs, 240_000);
      } catch (authenticatedError) {
        if (await codebaseExists(root)) await rm(root, { recursive: true, force: true });
        const branchHint = branch ? ' Verify that branch "' + branch + '" exists.' : '';
        throw codebaseHttpError(
          422,
          'GitHub clone failed. Anonymous HTTPS was attempted first, so public repositories do not require GitHub CLI authentication.' +
            branchHint +
            ' If the repository is private, authenticate GitHub in Codebase with sulandra-github-login and retry; otherwise verify the owner/repository name and network access.',
        );
      }
    }`;

if (!source.includes(oldBlock)) {
  throw new Error('Codebase clone handler changed; refusing to apply public Git clone repair');
}
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(target, source);
console.log('Installed public HTTPS-first Codebase GitHub clone flow.');
