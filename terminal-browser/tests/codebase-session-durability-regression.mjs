import { readFile } from 'node:fs/promises';

const durability = await readFile('assets/codebase-terminal-session-durability.js', 'utf8');
const nativePaste = await readFile('assets/codebase-terminal-native-paste.js', 'utf8');
const resumeInstaller = await readFile('scripts/install-codebase-pty-session-resume.mjs', 'utf8');
const terminalDockerfile = await readFile('Dockerfile.coding-terminal', 'utf8');
const frontendDockerfile = await readFile('Dockerfile.frontend', 'utf8');
const publisher = await readFile('scripts/install-codebase-backend-adapter.mjs', 'utf8');

const requireText = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`${label} missing: ${needle}`);
};

for (const marker of [
  'CODEBASE_TERMINAL_SESSION_DURABILITY_V1',
  'CODEBASE_TERMINAL_TRANSIENT_RECONNECT_V1',
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
  'scheduleTerminalReconnect',
  'reconnectAttempts',
  "if(attempt>=4){current.sessionId='';current.workspaceId=''}",
  "ws.addEventListener('close',event=>{schedulePersist();scheduleTerminalReconnect(tabId,event)})",
  "window.addEventListener('online'",
  'Sulandra session expired. Sign in again, then return to Codebase.',
]) requireText(durability, marker, 'frontend durability runtime');

for (const marker of [
  'CODEBASE_TERMINAL_NATIVE_PASTE_V1',
  'codebase-ipad-terminal-keyboard-bridge',
  "typeof term.paste!=='function'",
  'term.paste(text)',
  "document.addEventListener('paste'",
  "document.addEventListener('beforeinput'",
  "insertFromPaste",
  'stopImmediatePropagation',
]) requireText(nativePaste, marker, 'native paste runtime');

for (const marker of [
  'CODEBASE_PTY_SESSION_RESUME_V1',
  'CODEBASE_SESSION_RECONNECT_GRACE_MS',
  "url.searchParams.get('sessionId')",
  'cancelCodebaseCompatSessionCleanup(requestedSessionId)',
  'scheduleCodebaseCompatSessionCleanup(owner, sessionId)',
  "reasonText === 'Terminal tab closed'",
  'resumed: Boolean(resumed)',
  'replaceOnce(oldClose, newClose',
]) requireText(resumeInstaller, marker, 'gateway resume installer');

requireText(terminalDockerfile, 'install-codebase-pty-session-resume.mjs', 'terminal Dockerfile');
requireText(terminalDockerfile, "grep -Fq 'CODEBASE_PTY_SESSION_RESUME_V1'", 'terminal Dockerfile verification');
requireText(frontendDockerfile, 'assets/codebase-terminal-native-paste.js', 'frontend Dockerfile');
requireText(frontendDockerfile, 'assets/codebase-terminal-session-durability.js', 'frontend Dockerfile');
requireText(publisher, '/assets/codebase-terminal-native-paste.js?v=20260905-native-paste-1', 'Codebase publisher');
requireText(publisher, '/assets/codebase-terminal-session-durability.js?v=20260904-session-durability-1', 'Codebase publisher');

// The installer intentionally contains the old one-second cleanup text as its
// exact replacement anchor. What matters is that it replaces that block with
// the reconnect-grace implementation before the gateway image is built.
requireText(resumeInstaller, "const oldClose = `  browser.on('close'", 'legacy cleanup replacement anchor');
requireText(resumeInstaller, 'const newClose = `  browser.on(\'close\', (code, reason) => {', 'durable cleanup replacement');
if (!durability.includes("if(usableToken(configured))return configured")) {
  throw new Error('Explicit Codebase token must still be accepted when it is not expired');
}

console.log('Codebase terminal session durability + native multiline paste + transient reconnect regression: PASS');
