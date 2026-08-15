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

for (const relative of files) {
  const target = path.join(root, relative);
  let source = await readFile(target, 'utf8');
  source = source.replaceAll(staleApi, canonicalApi);

  // Load the privileged-session guard from the canonical Admin controller. The
  // guard removes persistent auth storage, enforces 30-minute inactivity logout,
  // revokes explicit sign-outs server-side, and requires password step-up before
  // sensitive Admin/security mutations.
  if (!source.includes('data-sulandra-admin-session-security')) {
    source = source.replace('(function () {\n  "use strict";\n', `(function () {\n  "use strict";\n\n${privilegedSecurityLoader}`);
  }

  // A single protected feature returning 401 must not erase the user's entire
  // Sulandra SSO session and throw them back to login. Keep the token/session;
  // surface the authorization error in the module instead. Explicit Sign Out,
  // missing credentials, or expiry handled by the login/session shell still ends
  // the session normally.
  source = source.replace(
    '    if (response.status === 401) signOut();\n',
    '    if (response.status === 401) { throw new Error(payload.error || payload.message || "This module could not authorize the current Sulandra session."); }\n',
  );

  // Executive production UAT proved that CEO correctly lands on Admin from the
  // login shell but the older Admin controller still rejected CEO and bounced
  // back to Employee Portal. Keep all three executive/Admin entry roles aligned.
  source = source.replace(
    '!["ADMINISTRATOR", "DOO"].includes(role)',
    '!["ADMINISTRATOR", "CEO", "DOO"].includes(role)',
  );

  if (source.includes('if (response.status === 401) signOut();')) {
    throw new Error(`${relative} still destroys the global Sulandra session on a feature-level 401.`);
  }
  if (source.includes('!["ADMINISTRATOR", "DOO"].includes(role)')) {
    throw new Error(`${relative} still excludes CEO from the Admin landing.`);
  }
  if (!source.includes('!["ADMINISTRATOR", "CEO", "DOO"].includes(role)')) {
    throw new Error(`${relative} does not enforce the complete Administrator/CEO/DOO Admin landing contract.`);
  }
  if (!source.includes('data-sulandra-admin-session-security')) {
    throw new Error(`${relative} does not load the privileged Admin session security guard.`);
  }
  if (!source.includes(canonicalApi)) throw new Error(`${relative} is not using the canonical Railway API.`);
  await writeFile(target, source, 'utf8');
}

await import('./install-admin-command-center-live-fix.mjs');

console.log('Admin session bounce removed; Administrator/CEO/DOO share the canonical Admin landing contract; privileged tab-only, inactivity and step-up security is published; and the cache-busted command-center fix is installed.');
