import { readFile } from 'node:fs/promises';

const target=process.argv[2];
if(!target)throw new Error('Usage: node verify-workspace-browser-session.mjs <server.mjs>');
const source=await readFile(target,'utf8');

const required=[
  'SULANDRA_WORKSPACE_BROWSER_SESSION_V1',
  'TERMINAL_WORKSPACE_SESSION_SECONDS',
  "purpose: 'workspace-browser-session'",
  'workspaceAccessFromRequest',
  'mintWorkspaceBrowserSession',
  'sulandra_workspace_session=',
  'Max-Age=\' + workspaceSessionSeconds',
  'HttpOnly; Secure; SameSite=None',
  'workspaceAccessFromRequest(req, url, sessionId)',
];
for(const marker of required){
  if(!source.includes(marker))throw new Error(`Workspace browser-session verification missing ${marker}`);
}
if(source.includes("sulandra_workspace_ticket=' + encodeURIComponent(ticket) + '; Path=' + cookiePath + '; Max-Age=' + workspaceTicketSeconds")){
  throw new Error('Bootstrap workspace ticket is still being persisted as the browser session cookie');
}
if(!source.includes("Math.max(3600, Math.min(43200, Number(process.env.TERMINAL_WORKSPACE_SESSION_SECONDS || 28800)))")){
  throw new Error('Workspace browser-session TTL must remain bounded to 1-12 hours with an 8-hour default');
}
if(!source.includes("bootstrapClaims?.purpose === 'workspace-ide'")){
  throw new Error('Only the short-lived workspace-ide bootstrap token may mint a browser session');
}
if(!source.includes("sessionClaims?.purpose === 'workspace-browser-session'")){
  throw new Error('Persistent IDE requests are not restricted to the browser-session token purpose');
}
console.log('Workspace browser-session verification passed: bootstrap remains short-lived and reconnects use an owner/session-bound HttpOnly browser session.');
