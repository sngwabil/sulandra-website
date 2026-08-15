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
const ownerOnlyGuard = 'if (!session || role !== "ADMINISTRATOR") { const destination = role === "DOO" ? "doo.html" : role === "CEO" ? "ceo.html" : "employee-portal.html"; location.replace(destination); return; }';

for (const relative of files) {
  const target = path.join(root, relative);
  let source = await readFile(target, 'utf8');
  source = source.replaceAll(staleApi, canonicalApi);

  if (!source.includes('data-sulandra-admin-session-security')) {
    source = source.replace('(function () {\n  "use strict";\n', `(function () {\n  "use strict";\n\n${privilegedSecurityLoader}`);
  }

  source = source.replace(
    '    if (response.status === 401) signOut();\n',
    '    if (response.status === 401) { throw new Error(payload.error || payload.message || "This module could not authorize the current Sulandra session."); }\n',
  );

  // The owner Administrator alone occupies admin.html. CEO and DOO remain
  // privileged, tab-only sessions, but enter their dedicated role workspaces.
  source = source.replace(
    'if (!session || !["ADMINISTRATOR", "DOO"].includes(role)) { location.replace("employee-portal.html"); return; }',
    ownerOnlyGuard,
  );
  source = source.replace(
    'if (!session || !["ADMINISTRATOR", "CEO", "DOO"].includes(role)) { location.replace("employee-portal.html"); return; }',
    ownerOnlyGuard,
  );

  if (source.includes('if (response.status === 401) signOut();')) {
    throw new Error(`${relative} still destroys the global Sulandra session on a feature-level 401.`);
  }
  if (!source.includes('role !== "ADMINISTRATOR"') || !source.includes('role === "DOO" ? "doo.html"')) {
    throw new Error(`${relative} does not keep owner admin.html separate from CEO/DOO role workspaces.`);
  }
  if (!source.includes('data-sulandra-admin-session-security')) {
    throw new Error(`${relative} does not load the privileged Admin session security guard.`);
  }
  if (!source.includes(canonicalApi)) throw new Error(`${relative} is not using the canonical Railway API.`);
  await writeFile(target, source, 'utf8');
}

await import('./install-admin-command-center-live-fix.mjs');

console.log('Admin session bounce removed; owner Administrator alone occupies admin.html, CEO/DOO use dedicated privileged role workspaces, and tab-only inactivity/step-up security remains published.');
