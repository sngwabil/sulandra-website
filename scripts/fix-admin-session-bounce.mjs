import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['admin-railway.js'];
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';
const staleApi = 'https://sulandra-website-production.up.railway.app';
const privilegedSecurityLoader = `  if (!document.querySelector('script[data-sulandra-admin-session-security]')) {
    const securityScript = document.createElement('script');
    securityScript.src = '/assets/admin-session-security.js?v=20260815-privileged-session-1';
    securityScript.async = false;
    securityScript.dataset.sulandraAdminSessionSecurity = 'true';
    document.head.appendChild(securityScript);
  }\n`;
const ownerOnlyGuard = 'if (!session || role !== "ADMINISTRATOR") { const destination = !session ? "admin-login.html?returnTo=/admin.html" : role === "DOO" ? "doo.html" : role === "CEO" ? "ceo.html" : "employee-portal.html"; location.replace(destination); return; }';

for (const relative of files) {
  const target = path.join(root, relative);
  let source = await readFile(target, 'utf8');
  source = source.replaceAll(staleApi, canonicalApi);

  if (!source.includes('data-sulandra-admin-session-security')) {
    source = source.replace('(function () {\n  "use strict";\n', `(function () {\n  "use strict";\n\n${privilegedSecurityLoader}`);
  }

  // Admin login stores its own explicit keys and mirrors the legacy keys only
  // inside the Admin tab. Prefer the explicit keys without breaking older Admin
  // modules that still consume the legacy names.
  if (!source.includes('ADMIN_TOKEN_KEY')) {
    source = source.replace(
      '  const TOKEN_KEY = "sulandra:employee:access-token";\n  const SESSION_KEY = "sulandra:employee:session";',
      '  const TOKEN_KEY = "sulandra:employee:access-token";\n  const SESSION_KEY = "sulandra:employee:session";\n  const ADMIN_TOKEN_KEY = "sulandra:admin:access-token";\n  const ADMIN_SESSION_KEY = "sulandra:admin:session";',
    );
    source = source.replace(
      '  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";',
      '  const token = () => sessionStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";',
    );
    source = source.replace(
      'return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || "null") || null;',
      'return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || "null") || null;',
    );
  }

  source = source.replace(
    '  const OPERATIONS_ROLES = new Set(["ADMINISTRATOR", "HR_MANAGER", "CEO", "DOO"]);',
    '  const OPERATIONS_ROLES = new Set(["ADMINISTRATOR", "PROGRAM_MANAGER", "HR_MANAGER", "CEO", "DOO"]);',
  );

  source = source.replace(
    '    sessionStorage.removeItem(TOKEN_KEY);\n    sessionStorage.removeItem(SESSION_KEY);\n    localStorage.removeItem(TOKEN_KEY);\n    localStorage.removeItem(SESSION_KEY);\n    location.replace("employee-login.html");',
    '    sessionStorage.removeItem(TOKEN_KEY);\n    sessionStorage.removeItem(SESSION_KEY);\n    sessionStorage.removeItem(ADMIN_TOKEN_KEY);\n    sessionStorage.removeItem(ADMIN_SESSION_KEY);\n    localStorage.removeItem(TOKEN_KEY);\n    localStorage.removeItem(SESSION_KEY);\n    location.replace("admin-login.html");',
  );

  source = source.replace(
    '    if (response.status === 401) signOut();\n',
    '    if (response.status === 401) { throw new Error(payload.error || payload.message || "This module could not authorize the current Sulandra session."); }\n',
  );

  // The owner Administrator alone occupies admin.html. CEO and DOO remain
  // privileged, tab-only sessions, but enter their dedicated role workspaces.
  // A missing Admin session returns to Admin sign-in, never Employee Portal.
  source = source.replace(
    'if (!session || !["ADMINISTRATOR", "DOO"].includes(role)) { location.replace("employee-portal.html"); return; }',
    ownerOnlyGuard,
  );
  source = source.replace(
    'if (!session || !["ADMINISTRATOR", "CEO", "DOO"].includes(role)) { location.replace("employee-portal.html"); return; }',
    ownerOnlyGuard,
  );
  source = source.replace(
    'if (!session || !OPERATIONS_ROLES.has(role)) { location.replace("employee-portal.html"); return; }',
    'if (!session || !OPERATIONS_ROLES.has(role)) { location.replace(!session ? "admin-login.html?returnTo=/admin-operations.html" : "employee-portal.html"); return; }',
  );

  if (source.includes('if (response.status === 401) signOut();')) {
    throw new Error(`${relative} still destroys the global Sulandra session on a feature-level 401.`);
  }
  if (!source.includes('role !== "ADMINISTRATOR"') || !source.includes('role === "DOO" ? "doo.html"')) {
    throw new Error(`${relative} does not keep owner admin.html separate from CEO/DOO role workspaces.`);
  }
  if (!source.includes('ADMIN_TOKEN_KEY') || !source.includes('ADMIN_SESSION_KEY')) {
    throw new Error(`${relative} does not prefer the independent Admin tab session.`);
  }
  if (!source.includes('admin-login.html?returnTo=/admin-operations.html')) {
    throw new Error(`${relative} does not return missing Operations sessions to Admin sign-in.`);
  }
  if (!source.includes('"PROGRAM_MANAGER", "HR_MANAGER"')) {
    throw new Error(`${relative} does not allow Program Manager into the company Operations admin workspace.`);
  }
  if (!source.includes('data-sulandra-admin-session-security')) {
    throw new Error(`${relative} does not load the privileged Admin session security guard.`);
  }
  if (!source.includes(canonicalApi)) throw new Error(`${relative} is not using the canonical Railway API.`);
  await writeFile(target, source, 'utf8');
}

await import('./install-admin-command-center-live-fix.mjs');

console.log('Admin authentication separated from Employee Portal: independent Admin tab keys are preferred, missing sessions return to Admin sign-in, Program Manager can use company Operations, and owner-only admin.html plus privileged inactivity security remain enforced.');