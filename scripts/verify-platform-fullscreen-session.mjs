import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const runtime = await read('assets/sulandra-protected-session.js');
const admin = await read('admin-login-railway.js');
const employee = await read('assets/employee-login-railway.js');
const shell = await read('sulandra-session.html');
const spireLogin = await read('spire/login.html');
const spirePrefs = await read('assets/spire-user-preferences.js');
const spireClient = await read('assets/spire-client-station.js');

function requireMarker(source, marker, label) {
  if (!source.includes(marker)) throw new Error(`${label} is missing ${marker}`);
}
function forbid(source, marker, label) {
  if (source.includes(marker)) throw new Error(`${label} must not contain ${marker}`);
}

for (const marker of [
  'SULANDRA_PROTECTED_SESSION_V2',
  'isCodebaseRoute',
  'requestFullscreen',
  'webkitRequestFullscreen',
  'mozRequestFullScreen',
  'msRequestFullscreen',
  'navigationUI: "hide"',
  'toggleFullscreenFromGesture',
  'fullscreenchange',
  'webkitfullscreenchange',
  'sulandraProtectedFrame',
  'allow="camera; microphone; geolocation; clipboard-read; clipboard-write; fullscreen"',
  'allowfullscreen',
  'window.history.replaceState',
  'frame.addEventListener("load", installChildNavigationBridge)',
  'childWindow.toggleFullScreen = toggleFullscreenFromGesture',
  'childWindow.open = function',
  'window.location.replace(route)',
  '#ff1744',
  '#00e676',
  '#00b0ff',
  '#d500f9',
]) requireMarker(runtime, marker, 'Codebase fullscreen session runtime');

for (const marker of [
  'Resume Full Screen',
  'Browser Full Screen Unavailable',
  'sulandraResumeFullscreen',
  'allow-top-navigation',
  'allow-popups',
]) forbid(runtime, marker, 'Codebase fullscreen session runtime');

for (const [source, label, portal] of [[admin, 'Admin login', 'ADMIN'], [employee, 'Employee login', 'EMPLOYEE']]) {
  for (const marker of [
    'loadProtectedSessionRuntime',
    'await enterProtectedSession',
    `portal: "${portal}"`,
    '/assets/sulandra-protected-session.js?v=20260906-dedicated-fullscreen-1',
  ]) requireMarker(source, marker, label);

  for (const marker of [
    'armProtectedFullscreenFromGesture',
    'event.isTrusted',
    'requestFullscreen',
    'webkitRequestFullscreen',
    'mozRequestFullScreen',
    'msRequestFullscreen',
    'navigationUI: "hide"',
  ]) forbid(source, marker, `${label} generic fullscreen behavior`);
}

for (const marker of [
  'data-sulandra-session-shell',
  '/assets/sulandra-protected-session.js?v=20260906-dedicated-fullscreen-1',
  'Opening Sulandra Codebase',
]) requireMarker(shell, marker, 'reloadable Codebase session shell');
forbid(shell, 'Resume Full Screen', 'reloadable Codebase session shell');

// S.P.I.R.E. keeps its independent authenticated fullscreen shell and user preference.
for (const marker of [
  'SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1',
  'spireWorkspaceShell',
  'spireWorkspaceFrame',
  'allow="fullscreen"',
  'allowfullscreen',
]) requireMarker(spireLogin, marker, 'S.P.I.R.E. authenticated shell');

for (const marker of [
  'fullscreenPreferred',
  'requestFullscreen',
  'exitFullscreen',
  'toggleFullscreenPreference',
  'armPreferredFullscreen',
  'bindFullscreenControls',
  'handleFullscreenChange',
  "return stored==null?true:stored!=='0'",
]) requireMarker(spirePrefs, marker, 'S.P.I.R.E. fullscreen preference runtime');

for (const marker of [
  'function navigateSpire(url)',
  'document.fullscreenElement',
  'spireFullscreenRouteFrame',
]) requireMarker(spireClient, marker, 'S.P.I.R.E. fullscreen route preservation');

console.log('Dedicated fullscreen contract verified: Codebase alone uses the Sulandra protected shell, its real control toggles enter/exit, the recovery overlay is removed, ordinary portal pages do not arm fullscreen, and S.P.I.R.E. retains its independent persistent fullscreen workflow.');
