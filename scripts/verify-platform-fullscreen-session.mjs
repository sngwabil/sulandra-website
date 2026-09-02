import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const runtime = await read('assets/sulandra-protected-session.js');
const admin = await read('admin-login-railway.js');
const employee = await read('assets/employee-login-railway.js');
const shell = await read('sulandra-session.html');

function requireMarker(source, marker, label) {
  if (!source.includes(marker)) throw new Error(`${label} is missing ${marker}`);
}
function forbid(source, marker, label) {
  if (source.includes(marker)) throw new Error(`${label} must not contain ${marker}`);
}

for (const marker of [
  'SULANDRA_PROTECTED_SESSION_V1',
  'requestFullscreen',
  'webkitRequestFullscreen',
  'mozRequestFullScreen',
  'msRequestFullscreen',
  'navigationUI: "hide"',
  'fullscreenchange',
  'webkitfullscreenchange',
  'Resume Full Screen',
  'sulandraProtectedFrame',
  'sandbox="allow-forms allow-scripts allow-same-origin allow-downloads allow-modals allow-pointer-lock allow-presentation"',
  'External browsing is unavailable inside the protected Sulandra session.',
  'window.history.replaceState',
  'frame.addEventListener("load", installChildNavigationBridge)',
  'childWindow.open = function',
]) requireMarker(runtime, marker, 'protected session runtime');

forbid(runtime, 'allow-top-navigation', 'protected session iframe sandbox');
forbid(runtime, 'allow-popups', 'protected session iframe sandbox');

for (const [source, label, portal] of [[admin, 'Admin login', 'ADMIN'], [employee, 'Employee login', 'EMPLOYEE']]) {
  for (const marker of [
    'armProtectedFullscreenFromGesture',
    'event.isTrusted',
    'loadProtectedSessionRuntime',
    'await enterProtectedSession',
    `portal: "${portal}"`,
    'requestFullscreen',
    'webkitRequestFullscreen',
    'mozRequestFullScreen',
    'msRequestFullscreen',
  ]) requireMarker(source, marker, label);
}

forbid(admin, 'window.location.assign(safeReturnTarget(session))', 'Admin successful-login handoff');
forbid(employee, 'window.location.assign(safeReturnTarget() || "/employee-portal.html")', 'Employee successful-login handoff');

for (const marker of [
  'data-sulandra-session-shell',
  '/assets/sulandra-protected-session.js?v=20260902-protected-session-1',
  'Protected Session',
]) requireMarker(shell, marker, 'reloadable session shell');

console.log('Sulandra protected fullscreen session verified: login gesture entry, persistent shell navigation, cross-browser Fullscreen API fallbacks, top-navigation containment, external-popup containment, and explicit resume behavior are present.');
