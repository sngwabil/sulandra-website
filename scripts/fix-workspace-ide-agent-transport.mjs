import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!target) throw new Error('Usage: node fix-workspace-ide-agent-transport.mjs <server.mjs>');
let source = await readFile(target, 'utf8');

const replaceOnce = (from, to, label) => {
  if (source.includes(to)) return;
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Workspace IDE agent transport anchor changed: ${label}`);
  source = source.slice(0, index) + to + source.slice(index + from.length);
};

replaceOnce(
  "const workspaceIdeUrl = async (session, pathname = '/') => {\n  const address = await findContainerAddress(docker.getContainer(session.containerId));\n  return 'http://' + address + ':' + idePort + pathname;\n};",
  "const workspaceIdeUrl = async (session, pathname = '/') => {\n  const address = await findContainerAddress(docker.getContainer(session.containerId));\n  return 'http://' + address + ':' + agentPort + '/ide' + pathname;\n};",
  'HTTP target',
);

replaceOnce(
  "    const init = { method: req.method, headers: copyWorkspaceRequestHeaders(req.headers), redirect: 'manual', signal: controller.signal };\n    if (!['GET','HEAD'].includes(String(req.method || 'GET').toUpperCase())) { init.body = req; init.duplex = 'half'; }\n    const upstream = await fetch(await workspaceIdeUrl(session, rest + parsed.search), init);",
  "    const ideHeaders = copyWorkspaceRequestHeaders(req.headers);\n    ideHeaders['x-sulandra-session-token'] = session.agentToken;\n    const init = { method: req.method, headers: ideHeaders, redirect: 'manual', signal: controller.signal };\n    if (!['GET','HEAD'].includes(String(req.method || 'GET').toUpperCase())) { init.body = req; init.duplex = 'half'; }\n    const upstream = await fetch(await workspaceIdeUrl(session, rest + parsed.search), init);",
  'HTTP session authentication',
);

replaceOnce(
  "    req.sulandraIde = { session, upstream: 'ws://' + address + ':' + idePort + rest + url.search };",
  "    req.sulandraIde = { session, upstream: 'ws://' + address + ':' + agentPort + '/ide' + rest + url.search };",
  'websocket target',
);

replaceOnce(
  "    headers: { 'user-agent': String(req.headers['user-agent'] || 'Sulandra-Workspace-Proxy') },",
  "    headers: {\n      'user-agent': String(req.headers['user-agent'] || 'Sulandra-Workspace-Proxy'),\n      'x-sulandra-session-token': session.agentToken,\n    },",
  'websocket session authentication',
);

await writeFile(target, source, 'utf8');
console.log(`Workspace IDE transport routed through session agent in ${target}`);
