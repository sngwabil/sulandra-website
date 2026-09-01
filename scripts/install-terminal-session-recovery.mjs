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
   Session containers are isolated and memory-capped. If one exits unexpectedly
   (for example after an OOM), recover the same container and wait for Docker to
   restore its private-network address instead of surfacing a transient raw
   "no address" failure to the browser. Persistent workspace/history mounts
   survive this restart. */
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

await writeFile(target, source, 'utf8');
console.log('Installed terminal session crash recovery and bounded automatic restart policy.');
