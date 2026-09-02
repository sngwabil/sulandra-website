import { readFile } from 'node:fs/promises';

const [workspaceUi, staticServer, proxySource] = await Promise.all([
  readFile(new URL('../assets/it-agent-workspace-preview.js', import.meta.url), 'utf8'),
  readFile(new URL('./serve-static-site.mjs', import.meta.url), 'utf8'),
  readFile(new URL('./workspace-same-origin-proxy.mjs', import.meta.url), 'utf8'),
]);

const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`Workspace same-origin verification failed: ${label}`);
};

requireText(workspaceUi, 'const GATEWAY=window.location.origin;', 'IDE/Preview must use the Sulandra browser origin');
if (workspaceUi.includes('sulandra-coding-terminal-worker-production.up.railway.app')) {
  throw new Error('Workspace same-origin verification failed: browser asset must not embed the Railway worker origin');
}
requireText(workspaceUi, 'fetch(`${GATEWAY}/workspace/ticket`', 'workspace ticket exchange must stay same-origin');
requireText(workspaceUi, "createFramePanel('ide','IDE')", 'IDE must remain a distinct IDE panel');
requireText(workspaceUi, "createFramePanel('preview','Preview')", 'Preview must remain a distinct Preview panel');
requireText(workspaceUi, 'v.frame.src=GATEWAY+access.url', 'IDE iframe URL must stay same-origin');
requireText(workspaceUi, 'const PREVIEW_DISCOVERY_PORTS=', 'Preview must discover common development ports');
requireText(workspaceUi, "method:'HEAD'", 'Preview must verify a live app before loading its iframe');
requireText(workspaceUi, 'No live app is reachable', 'Preview must show a truthful not-running state instead of a raw proxy error');

requireText(staticServer, "import { createWorkspaceSameOriginProxy } from './workspace-same-origin-proxy.mjs';", 'static server must install workspace proxy');
requireText(staticServer, 'if (workspaceProxy.handleHttp(request, response)) return;', 'workspace HTTP proxy must run before static method filtering');
requireText(staticServer, "server.on('upgrade'", 'static server must handle workspace WebSocket upgrades');
requireText(staticServer, 'workspaceProxy.handleUpgrade(request, socket, head)', 'workspace WebSocket upgrades must route through the same-origin proxy');

requireText(proxySource, "pathname === '/workspace/ticket'", 'proxy must explicitly allow the ticket endpoint');
requireText(proxySource, "/^\\/workspace\\/[A-Za-z0-9_-]+\\/ide", 'proxy must restrict IDE paths to a workspace session');
requireText(proxySource, "WORKSPACE_COOKIE_NAMES = new Set(['sulandra_workspace_session', 'sulandra_workspace_ticket'])", 'proxy must forward only workspace cookies');
requireText(proxySource, "if (new URL(request.url || '/', 'http://localhost').pathname === '/workspace/ticket' && request.headers.authorization)", 'Admin bearer token must only be forwarded to the ticket endpoint');
requireText(proxySource, "headers.connection = 'Upgrade';", 'WebSocket upgrade headers must be forwarded');
requireText(proxySource, "socket.pipe(upstreamSocket).pipe(socket);", 'WebSocket sockets must remain bridged after upgrade');
requireText(proxySource, "replace(/;\\s*Domain=[^;]+/ig, '')", 'upstream cookie domains must not escape the Sulandra origin');
requireText(proxySource, "if (!/^(?:[a-z][a-z0-9+.-]*:|\\/\\/)/i.test(raw)) return raw;", 'relative IDE redirects must remain relative to the workspace path');

console.log('Workspace transport verified: IDE and Preview stay distinct, relative IDE redirects stay inside the workspace, Preview checks real listening ports, and authenticated HTTP/WebSocket traffic remains same-origin.');
