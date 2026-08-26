import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const employeePortalPath = path.join(root, 'employee-portal.html');

let portal = await readFile(employeePortalPath, 'utf8');
const adminEntryPattern = /<a\s+id="employeeAdminReturn"[^>]*>[^<]*<\/a>/i;
const adminEntry = '<a id="employeeAdminReturn" class="header-action admin" href="/admin-login.html" target="_blank" rel="noopener noreferrer" hidden>Administrator Sign In ↗</a>';

if (!adminEntryPattern.test(portal)) {
  throw new Error('Portal entry separation installer could not find employeeAdminReturn');
}
portal = portal.replace(adminEntryPattern, adminEntry);

if (!portal.includes('id="employeeAdminReturn"') || !portal.includes('href="/admin-login.html"') || !portal.includes('target="_blank"')) {
  throw new Error('Employee → Admin separate-tab sign-in contract was not installed');
}
if (/<a\s+id="employeeAdminReturn"[^>]*href="\/admin\.html"/i.test(portal)) {
  throw new Error('Employee Portal still links privileged employees directly into admin.html');
}

await writeFile(employeePortalPath, portal, 'utf8');
console.log('Portal entry separation installed: Employee → Admin uses separate Admin sign-in tab.');
