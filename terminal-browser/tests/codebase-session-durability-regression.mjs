import { readFile } from 'node:fs/promises';

const durability = await readFile('assets/codebase-terminal-session-durability.js', 'utf8');
const resumeInstaller = await readFile('scripts/install-codebase-pty-session-resume.mjs', 'utf8');
const terminalDockerfile = await readFile('Dockerfile.coding-terminal', 'utf8');
const frontendDockerfile = await readFile('Dockerfile.frontend', 'utf8');
const publisher = await readFile('scripts/install-codebase-backend-adapter.mjs', 'utf8');

const requireText = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`${label} missing: ${needle}`);
};

for (const marker of [
  'CODEBASE_TERMINAL_SESSION_DURABILITY_V1',
  'sulandra:codebase:terminal-session-state:v1',
  'expiry>Date.now()+30_000',
  'freshestToken',
  'sessionStorage.setItem',
  'restoreState',
  'ResumeWebSocket',
  "searchParams.set('sessionId'",
  "searchParams.set('resume','1')",
  'data-codebase-active-terminal',
  'term.options.cursorBlink=selected',
]) requireText(durability, marker, 'frontend durability runtime');

for (const marker of [
  'CODEBASE_PTY_SESSION_RESUME_V1',
  'CODEBASE_SESSION_RECONNECT_GRACE_MS',
  "url.searchParams.get('sessionId')",
  'cancelCodebaseCompatSessionCleanup(requestedSessionId)',
  'scheduleCodebaseCompatSessionCleanup(owner, sessionId)',
  "reasonText === 'Terminal tab closed'",
  'resumed: Boolean(resumed)',
]) requireText(resumeInstaller, marker, 'gateway resume installer');

requireText(terminalDockerfile, 'install-codebase-pty-session-resume.mjs', 'terminal Dockerfile');
requireText(terminalDockerfile, "grep -Fq 'CODEBASE_PTY_SESSION_RESUME_V1'", 'terminal Dockerfile verification');
requireText(frontendDockerfile, 'assets/codebase-terminal-session-durability.js', 'frontend Dockerfile');
requireText(publisher, '/assets/codebase-terminal-session-durability.js?v=20260904-session-durability-1', 'Codebase publisher');

if (resumeInstaller.includes("setTimeout(() => void destroyCodebaseCompatSession(owner, sessionId), 1_000)")) {
  throw new Error('Legacy one-second browser-disconnect session destruction returned');
}
if (!durability.includes("if(usableToken(configured))return configured")) {
  throw new Error('Explicit Codebase token must still be accepted when it is not expired');
}

console.log('Codebase terminal session durability regression: PASS');
