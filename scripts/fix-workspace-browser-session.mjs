import { readFile, writeFile } from 'node:fs/promises';

const target=process.argv[2];
if(!target)throw new Error('Usage: node fix-workspace-browser-session.mjs <server.mjs>');
let source=await readFile(target,'utf8');
const marker='SULANDRA_WORKSPACE_BROWSER_SESSION_V1';
if(source.includes(marker)){
  console.log(`Workspace browser session already hardened in ${target}`);
  process.exit(0);
}

const ticketSecondsAnchor="const workspaceTicketSeconds = Math.max(60, Math.min(900, Number(process.env.TERMINAL_WORKSPACE_TICKET_SECONDS || 300)));";
if(!source.includes(ticketSecondsAnchor))throw new Error('Workspace browser-session ticket TTL anchor missing');
source=source.replace(ticketSecondsAnchor,`${ticketSecondsAnchor}\nconst workspaceSessionSeconds = Math.max(3600, Math.min(43200, Number(process.env.TERMINAL_WORKSPACE_SESSION_SECONDS || 28800)));\nconst ${marker}=true;`);

const helperBefore=`const ticketCookie = req => {
  const raw = String(req.headers.cookie || '');
  for (const item of raw.split(';')) {
    const [name, ...rest] = item.trim().split('=');
    if (name === 'sulandra_workspace_ticket') return decodeURIComponent(rest.join('=') || '');
  }
  return '';
};
const verifyWorkspaceTicket = (token, sessionId) => {
  try {
    const claims = jwt.verify(String(token || ''), workspaceTicketSecret, { algorithms: ['HS256'] });
    if (typeof claims === 'string' || claims.purpose !== 'workspace-ide' || claims.sessionId !== sessionId || typeof claims.owner !== 'string') return null;
    return claims;
  } catch { return null; }
};
const workspaceTicketFromUrl = (req, parsed) => String(parsed.searchParams.get('ticket') || ticketCookie(req) || '');`;
const helperAfter=`const workspaceSessionCookie = req => {
  const raw = String(req.headers.cookie || '');
  for (const item of raw.split(';')) {
    const [name, ...rest] = item.trim().split('=');
    if (name === 'sulandra_workspace_session') return decodeURIComponent(rest.join('=') || '');
  }
  return '';
};
const verifyWorkspaceAccessToken = (token, sessionId) => {
  try {
    const claims = jwt.verify(String(token || ''), workspaceTicketSecret, { algorithms: ['HS256'] });
    if (typeof claims === 'string' || !['workspace-ide','workspace-browser-session'].includes(claims.purpose) || claims.sessionId !== sessionId || typeof claims.owner !== 'string') return null;
    return claims;
  } catch { return null; }
};
const mintWorkspaceBrowserSession = claims => jwt.sign({
  purpose: 'workspace-browser-session',
  sessionId: claims.sessionId,
  owner: claims.owner,
  role: claims.role,
}, workspaceTicketSecret, {
  algorithm: 'HS256',
  expiresIn: workspaceSessionSeconds,
  subject: String(claims.sub || claims.owner),
});
const workspaceAccessFromRequest = (req, parsed, sessionId) => {
  const bootstrapToken = String(parsed.searchParams.get('ticket') || '');
  if (bootstrapToken) {
    const bootstrapClaims = verifyWorkspaceAccessToken(bootstrapToken, sessionId);
    if (bootstrapClaims?.purpose === 'workspace-ide') {
      return { claims: bootstrapClaims, sessionToken: mintWorkspaceBrowserSession(bootstrapClaims), fromBootstrap: true };
    }
  }
  const sessionToken = workspaceSessionCookie(req);
  const sessionClaims = verifyWorkspaceAccessToken(sessionToken, sessionId);
  if (sessionClaims?.purpose === 'workspace-browser-session') {
    return { claims: sessionClaims, sessionToken, fromBootstrap: false };
  }
  return null;
};`;
if(!source.includes(helperBefore))throw new Error('Workspace browser-session verification helper anchor missing');
source=source.replace(helperBefore,helperAfter);

const httpBefore=`    const ticket = workspaceTicketFromUrl(req, parsed);
    const claims = verifyWorkspaceTicket(ticket, sessionId);
    if (!claims) return res.status(401).json({ error: 'Workspace access expired. Reopen IDE or Preview.' });
    if (parsed.searchParams.has('ticket')) parsed.searchParams.delete('ticket');
    const cookiePath = '/workspace/' + encodeURIComponent(sessionId) + '/ide';
    res.setHeader('Set-Cookie', 'sulandra_workspace_ticket=' + encodeURIComponent(ticket) + '; Path=' + cookiePath + '; Max-Age=' + workspaceTicketSeconds + '; HttpOnly; Secure; SameSite=None');`;
const httpAfter=`    const workspaceAccess = workspaceAccessFromRequest(req, parsed, sessionId);
    if (!workspaceAccess) return res.status(401).json({ error: 'Workspace access expired. Reopen IDE or Preview.' });
    const claims = workspaceAccess.claims;
    if (parsed.searchParams.has('ticket')) parsed.searchParams.delete('ticket');
    const cookiePath = '/workspace/' + encodeURIComponent(sessionId) + '/ide';
    if (workspaceAccess.fromBootstrap) {
      res.setHeader('Set-Cookie', 'sulandra_workspace_session=' + encodeURIComponent(workspaceAccess.sessionToken) + '; Path=' + cookiePath + '; Max-Age=' + workspaceSessionSeconds + '; HttpOnly; Secure; SameSite=None');
    }`;
if(!source.includes(httpBefore))throw new Error('Workspace browser-session HTTP exchange anchor missing');
source=source.replace(httpBefore,httpAfter);

const wsBefore="    const claims = verifyWorkspaceTicket(workspaceTicketFromUrl(req, url), sessionId);";
const wsAfter="    const workspaceAccess = workspaceAccessFromRequest(req, url, sessionId);\n    const claims = workspaceAccess?.claims || null;";
if(!source.includes(wsBefore))throw new Error('Workspace browser-session WebSocket anchor missing');
source=source.replace(wsBefore,wsAfter);

const healthBefore="workspaceIde: { enabled: true, ticketSeconds: workspaceTicketSeconds, previewProxy: true },";
const healthAfter="workspaceIde: { enabled: true, ticketSeconds: workspaceTicketSeconds, sessionSeconds: workspaceSessionSeconds, previewProxy: true },";
if(source.includes(healthBefore))source=source.replace(healthBefore,healthAfter);

await writeFile(target,source,'utf8');
console.log(`Workspace browser session hardened in ${target}: short bootstrap ticket exchanged for an owner/session-bound HttpOnly browser session.`);
