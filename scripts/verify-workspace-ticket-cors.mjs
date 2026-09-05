import { spawn } from 'node:child_process';

const target = process.argv[2];
if (!target) throw new Error('Usage: node verify-workspace-ticket-cors.mjs <server.mjs>');

const port = 18081;
const child = spawn(process.execPath, [target], {
  env: {
    ...process.env,
    PORT: String(port),
    TERMINAL_AUTH_TOKEN: 'ci-internal-token',
    TERMINAL_EXECUTION_BASE_URL: 'https://127.0.0.1:65535',
    TERMINAL_EXECUTION_TOKEN: 'ci-execution-token-0123456789abcdef0123456789abcdef',
    TERMINAL_DNS_RESULT_ORDER: 'ipv4first',
    TERMINAL_WS_AUTH_PROVIDER: 'sulandra',
    JWT_SECRET: 'ci-workspace-ticket-cors-secret',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const preflight = origin => fetch(`http://127.0.0.1:${port}/workspace/ticket`, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type',
  },
});

try {
  let response = null;
  for (let i = 0; i < 50; i += 1) {
    try {
      response = await preflight('https://sulandrahealth.com');
      break;
    } catch {
      if (child.exitCode !== null) throw new Error(`Gateway exited before CORS verification:\n${output}`);
      await sleep(100);
    }
  }
  if (!response) throw new Error(`Gateway did not start for CORS verification:\n${output}`);
  const health = await fetch(`http://127.0.0.1:${port}/health`).then(response => response.json());
  if (health.network?.dnsResultOrder !== 'ipv4first') {
    throw new Error(`Gateway did not apply the IPv4-first execution DNS route: ${JSON.stringify(health.network)}`);
  }
  if (response.status !== 204) throw new Error(`Expected Sulandra preflight 204, received ${response.status}`);
  if (response.headers.get('access-control-allow-origin') !== 'https://sulandrahealth.com') {
    throw new Error(`Unexpected Access-Control-Allow-Origin: ${response.headers.get('access-control-allow-origin')}`);
  }
  if (!String(response.headers.get('access-control-allow-methods') || '').includes('POST')) {
    throw new Error('Workspace ticket preflight does not allow POST');
  }
  const allowHeaders = String(response.headers.get('access-control-allow-headers') || '').toLowerCase();
  if (!allowHeaders.includes('authorization') || !allowHeaders.includes('content-type')) {
    throw new Error(`Workspace ticket preflight headers incomplete: ${allowHeaders}`);
  }

  const www = await preflight('https://www.sulandrahealth.com');
  if (www.status !== 204 || www.headers.get('access-control-allow-origin') !== 'https://www.sulandrahealth.com') {
    throw new Error('www.sulandrahealth.com preflight was not accepted');
  }

  const rejected = await preflight('https://example.com');
  if (rejected.status !== 403) throw new Error(`Expected non-Sulandra origin 403, received ${rejected.status}`);

  console.log('Workspace ticket CORS verification passed for both Sulandra origins; non-Sulandra origin rejected.');
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(3000).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); }),
  ]);
}
