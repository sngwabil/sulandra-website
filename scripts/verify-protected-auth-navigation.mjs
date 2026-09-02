import { readFile } from 'node:fs/promises';

async function read(path){return readFile(new URL(`../${path}`,import.meta.url),'utf8')}
function requireAll(label,source,markers){for(const marker of markers){if(!source.includes(marker))throw new Error(`${label} missing ${marker}`)}}
function forbidAll(label,source,markers){for(const marker of markers){if(source.includes(marker))throw new Error(`${label} still contains ${marker}`)}}

const [employeeLogin,adminLogin,spireLogin,spireLoginHtml,protectedSession,ssoInstaller,ssoRuntime]=await Promise.all([
  read('assets/employee-login-railway.js'),
  read('admin-login-railway.js'),
  read('assets/spire-login.js'),
  read('spire/login.html'),
  read('assets/sulandra-protected-session.js'),
  read('scripts/install-sulandra-sso-session.mjs'),
  read('assets/sulandra-sso-session.js'),
]);

requireAll('Employee login protected session',employeeLogin,[
  '20260902-protected-session-2','armProtectedFullscreenFromGesture','parentProtectedRuntime','enterProtectedSession',
  'await enterProtectedSession(safeReturnTarget() || "/employee-portal.html")','portal: "EMPLOYEE"',
]);
forbidAll('Employee login protected session',employeeLogin,['window.location.assign(safeReturnTarget() || "/employee-portal.html")']);

requireAll('Admin login protected session',adminLogin,[
  '20260902-protected-session-2','armProtectedFullscreenFromGesture','parentProtectedRuntime','enterProtectedSession',
  'await enterProtectedSession(safeReturnTarget(session))','portal: "ADMIN"',
]);
forbidAll('Admin login protected session',adminLogin,['window.location.assign(safeReturnTarget(session))']);

requireAll('S.P.I.R.E. native login',spireLogin,[
  'SPIRE_NATIVE_LOGIN_V2','S.P.I.R.E. chart access','const body = { identifier, password };',
  "portalContext: 'SPIRE'","runtime.enter(destination, { portal: 'SPIRE' })",'spireAllowed(session)',
]);
forbidAll('S.P.I.R.E. native login',spireLogin,["/employee-login.html?returnTo=","const body = { identifier, password, portal: 'SPIRE' }"]);
requireAll('S.P.I.R.E. sign-in page',spireLoginHtml,['<h1>S.P.I.R.E. Sign In</h1>','SPIRE_NATIVE_LOGIN_V2','20260902-spire-native-login-2']);

requireAll('Protected Sulandra shell',protectedSession,[
  'SULANDRA_PROTECTED_SESSION_V2','20260902-protected-session-2','function inferPortal',
  'return "SPIRE"','employeeAdminReturn','childWindow.SulandraProtectedSession','enter: (route, options) => navigate(route, options)',
  'portal === "SPIRE" ? "/spire/login.html"',
]);
requireAll('Employee Portal runtime boundary',ssoRuntime,['enforceEmployeePortalBoundary','employeeAdminReturn']);
requireAll('Static publication boundary',ssoInstaller,[
  '20260902-protected-session-2','Published Employee Portal still exposes the Admin shortcut',
  'employeeAdminReturn','20260902-spire-native-login-2','/assets/employee-login-railway.js?v=20260902-protected-session-2',
  'admin-login-railway.js?v=20260902-protected-session-2',
]);

console.log('Protected auth navigation verified: Employee/Admin/S.P.I.R.E. share the fullscreen shell, S.P.I.R.E. owns its login surface, and Employee Portal publishes no Admin shortcut.');
