import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node harden-terminal-agent-readiness.mjs <session-agent-server.mjs>');

let source = await readFile(target, 'utf8');
const marker = 'TERMINAL_AGENT_DETERMINISTIC_READINESS_V1';
if (source.includes(marker)) {
  console.log('Terminal agent deterministic readiness already installed.');
  process.exit(0);
}

const replaceOnce = (needle, replacement, label) => {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Terminal agent readiness patch failed: ${label}`);
  source = source.slice(0, index) + replacement + source.slice(index + needle.length);
};

replaceOnce(
`const ensureBridge = () => {
  if (!alive || !proc) spawnBridge();
};`,
`const ensureBridge = () => {
  if (!alive || !proc) spawnBridge();
};

/* ${marker}
   PTY output is not a reliable readiness signal. A healthy interactive shell can
   legitimately produce no bytes while tmux is already accepting input. Confirm
   the tmux session directly so the executor does not spend ~45 seconds polling a
   false-negative /health response and then surface a generic "fetch failed".
   The execution plane still waits for this authenticated health endpoint before
   returning a newly-created session to the Railway gateway. */
const confirmBridgeReady = async () => {
  if (!alive || !proc) return false;
  if (bridgeReady) return true;
  try {
    await execFileAsync('tmux', [
      '-f', tmuxConfigPath,
      'has-session', '-t', tmuxSession,
    ], { encoding: 'utf8', env: shellEnv, timeout: 1_000 });
    bridgeReady = true;
    return true;
  } catch {
    return false;
  }
};`,
'bridge readiness helper',
);

replaceOnce(
`app.get('/health', authorize, async (_req, res) => {
  await historyWrite;
  const info = await stat(historyPath).catch(() => ({ size: 0 }));
  if (!alive || !bridgeReady) {
    return res.status(503).json({ ok: false, pty: true, tmux: true, workspaceId, alive, ready: false, transcriptBytes: Number(info.size) || 0 });
  }
  res.json({ ok: true, pty: true, tmux: true, workspaceId, alive, ready: true, transcriptBytes: Number(info.size) || 0 });
});`,
`app.get('/health', authorize, async (_req, res) => {
  await historyWrite;
  const info = await stat(historyPath).catch(() => ({ size: 0 }));
  const ready = await confirmBridgeReady();
  if (!alive || !ready) {
    return res.status(503).json({ ok: false, pty: true, tmux: true, workspaceId, alive, ready: false, transcriptBytes: Number(info.size) || 0 });
  }
  res.json({ ok: true, pty: true, tmux: true, workspaceId, alive, ready: true, transcriptBytes: Number(info.size) || 0 });
});`,
'health endpoint',
);

for (const required of [
  marker,
  'const confirmBridgeReady = async () =>',
  "'has-session', '-t', tmuxSession",
  'const ready = await confirmBridgeReady();',
]) {
  if (!source.includes(required)) throw new Error(`Terminal agent readiness verification missing: ${required}`);
}

await writeFile(target, source, 'utf8');
console.log('Installed deterministic tmux-backed terminal-agent readiness.');
