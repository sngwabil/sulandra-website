import fs from 'node:fs';

const target = process.argv[2];
if (!target) throw new Error('Usage: node harden-terminal-execution-http.mjs <gateway-server.mjs>');

let source = fs.readFileSync(target, 'utf8');
const marker = 'TERMINAL_EXECUTION_HTTP_IPV4_V1';
if (source.includes(marker)) {
  console.log('Terminal execution HTTP transport already hardened.');
  process.exit(0);
}

const replaceOnce = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Terminal execution HTTP hardening anchor changed: ${label}`);
  source = source.replace(from, to);
};

replaceOnce(
  "import { WebSocket, WebSocketServer } from 'ws';",
  "import { WebSocket, WebSocketServer } from 'ws';\nimport { Agent as UndiciAgent } from 'undici'; // TERMINAL_EXECUTION_HTTP_IPV4_V1",
  'Undici import',
);

replaceOnce(
  'setDefaultResultOrder(executionDnsResultOrder);\nconst executionWebSocketOptions = executionDnsResultOrder === \'ipv4first\' ? { family: 4 } : {};',
  `setDefaultResultOrder(executionDnsResultOrder);\n// Railway production has IPv4 egress to the external execution edge. DNS order\n// alone is only a preference for Node/Undici and can still select an unusable\n// AAAA route. Force the HTTP dispatcher to IPv4 just like the WebSocket client\n// whenever ipv4first is configured. This covers /pty session provisioning,\n// project clone/file APIs, and the readiness probe.\nconst executionHttpDispatcher = new UndiciAgent(executionDnsResultOrder === 'ipv4first'\n  ? { connect: { family: 4 } }\n  : {});\nconst executionWebSocketOptions = executionDnsResultOrder === 'ipv4first' ? { family: 4 } : {};`,
  'execution transport setup',
);

replaceOnce(
  '    const response = await fetch(executionUrl(pathname), {\n      method: options.method || \'GET\',',
  `    const response = await fetch(executionUrl(pathname), {\n      dispatcher: executionHttpDispatcher,\n      method: options.method || 'GET',`,
  'executionRequest dispatcher',
);

replaceOnce(
  "    const response = await fetch(executionUrl('/healthz'), {\n      headers: { Authorization: `Bearer ${executionToken}` },",
  `    const response = await fetch(executionUrl('/healthz'), {\n      dispatcher: executionHttpDispatcher,\n      headers: { Authorization: \`Bearer \${executionToken}\` },`,
  'health dispatcher',
);

for (const required of [
  marker,
  'const executionHttpDispatcher = new UndiciAgent',
  'dispatcher: executionHttpDispatcher',
  "? { connect: { family: 4 } }",
]) {
  if (!source.includes(required)) throw new Error(`Terminal execution HTTP hardening verification missing: ${required}`);
}

fs.writeFileSync(target, source);
console.log(`Installed explicit execution-plane HTTP IPv4 transport into ${target}`);
