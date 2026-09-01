import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node install-terminal-session-recovery.mjs <server.mjs>');

let source = await readFile(target, 'utf8');
const marker = 'TERMINAL_SESSION_CRASH_RECOVERY_V1';
if (source.includes(marker)) {
  console.log('Terminal session crash recovery already installed.');
  process.exit(0);
}

const oldAddress = `const findContainerAddress = async container => {
  const inspect = await container.inspect();
  const network = inspect.NetworkSettings?.Networks?.[networkName];
  const address = network?.IPAddress || '';
  if (!address) throw new Error(\`Terminal session container has no address on \${networkName}\`);
  return address;
};`;

const newAddress = `/* ${marker}
   If an isolated session container exits or temporarily loses its Docker network
   endpoint, recover the same container and wait for its private-network address
   instead of surfacing a transient raw "no address" failure to the browser.
   Persistent workspace mounts survive this restart. Production sessions are
   configured separately by the VPS stack at 4 GiB / 2 vCPU. */
const findContainerAddress = async container => {
  let lastError = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let inspect;
    try {
      inspect = await container.inspect();
    } catch (error) {
      if (Number(error?.statusCode || error?.status) === 404) {
        const missing = new Error('Terminal session container no longer exists');
        missing.status = 410;
        throw missing;
      }
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 200));
      continue;
    }

    if (!inspect.State?.Running) {
      try {
        await container.start();
      } catch (error) {
        // Docker reports 304 when a concurrent recovery already started it.
        if (Number(error?.statusCode || error?.status) !== 304) lastError = error;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      continue;
    }

    const network = inspect.NetworkSettings?.Networks?.[networkName];
    const address = network?.IPAddress || '';
    if (address) return address;
    lastError = new Error(\`Terminal session container has no address on \${networkName}\`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw lastError || new Error(\`Terminal session container did not become reachable on \${networkName}\`);
};`;

if (!source.includes(oldAddress)) throw new Error('Terminal container address anchor changed');
source = source.replace(oldAddress, newAddress);

const oldRestart = `RestartPolicy: { Name: 'no' },`;
const newRestart = `RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 5 },`;
if (!source.includes(oldRestart)) throw new Error('Terminal session restart-policy anchor changed');
source = source.replace(oldRestart, newRestart);

const oldAgentRequest = `const agentRequest = async (session, pathname, options = {}) => {
  const response = await fetch(await agentUrl(session, pathname), {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-sulandra-session-token': session.agentToken,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(Math.max(1_000, options.timeoutMs || 10_000)),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 2_000) }; }
  }
  if (!response.ok) {
    const error = new Error(payload.error || \`Terminal session agent failed (\${response.status})\`);
    error.status = response.status;
    throw error;
  }
  return payload;
};`;

const newAgentRequest = `const ensureAgentReady = async session => {
  let lastError = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(await agentUrl(session, '/health'), {
        headers: { 'x-sulandra-session-token': session.agentToken },
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
      lastError = new Error(\`Terminal session agent health returned \${response.status}\`);
    } catch (error) {
      if (Number(error?.status) === 410) throw error;
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const unavailable = new Error(lastError?.message || 'Terminal session agent did not recover in time');
  unavailable.status = Number(lastError?.status) || 503;
  throw unavailable;
};

const agentRequest = async (session, pathname, options = {}) => {
  // Preflight health before forwarding input so a container restart cannot race
  // PTY/tmux startup. The actual request is sent exactly once, avoiding duplicate
  // commands if the response path is interrupted.
  await ensureAgentReady(session);
  const response = await fetch(await agentUrl(session, pathname), {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-sulandra-session-token': session.agentToken,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(Math.max(1_000, options.timeoutMs || 10_000)),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { error: text.slice(0, 2_000) }; }
  }
  if (!response.ok) {
    const error = new Error(payload.error || \`Terminal session agent failed (\${response.status})\`);
    error.status = response.status;
    throw error;
  }
  return payload;
};`;

if (!source.includes(oldAgentRequest)) throw new Error('Terminal agent request anchor changed');
source = source.replace(oldAgentRequest, newAgentRequest);

const oldWsStart = `  void (async () => {
    try {
      const url = new URL(await agentUrl(session, '/ws'));`;
const newWsStart = `  void (async () => {
    try {
      // A restarted container can regain an IP before its session agent and tmux
      // are listening. Keep the browser connection open while recovery finishes.
      await ensureAgentReady(session);
      const url = new URL(await agentUrl(session, '/ws'));`;
if (!source.includes(oldWsStart)) throw new Error('Terminal WebSocket recovery anchor changed');
source = source.replace(oldWsStart, newWsStart);

await writeFile(target, source, 'utf8');
console.log('Installed terminal session crash recovery, agent-readiness gating, and bounded automatic restart policy.');
