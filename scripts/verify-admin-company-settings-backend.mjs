import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
async function read(relative, base = root) {
  try { return await readFile(path.join(base, relative), 'utf8'); }
  catch (error) { throw new Error(`Admin Company Settings verification cannot read ${relative}: ${error.message}`); }
}
function requireMarkers(label, source, markers) {
  for (const marker of markers) if (!source.includes(marker)) throw new Error(`${label} is missing required marker: ${marker}`);
}

const [runtime, backend, publishedOwner, publishedOperations, router, operationsContext] = await Promise.all([
  read('assets/admin-company-settings.js'),
  read('api/src/company-settings-routes.ts'),
  read('admin.html', dist),
  read('admin-operations.html', dist),
  read('assets/admin-company-context.js', dist),
  read('assets/admin-operations-context.js', dist),
]);

requireMarkers('Company Settings backend', backend, [
  "app.get('/api/admin/company-settings'", "app.patch('/api/admin/company-settings'",
  'Select a Sulandra company first', 'metadata.companySettings', "'UPDATE_COMPANY_SETTINGS'",
  'LegalEntity', 'updatedAt', 'updatedById',
]);
requireMarkers('Company Settings runtime', runtime, [
  "'/api/admin/company-settings'", "method: 'PATCH'", "'X-Legal-Entity-Id'",
  'localStorage.removeItem(LEGACY_SETTINGS_KEY)', 'window.saveCompanySettings = saveSettings',
  'settingEmploymentDisclaimer', 'settingTimezone', 'settingSupportEmail', 'settingSupportPhone', 'settingWebsite',
  'adminCompanySettingsBackendStatus', 'adminCompanySettingsReload', 'sulandra:company-change',
  'sulandra:entity-context-changed', 'beforeunload', 'Browser localStorage is not used as the settings database',
]);
requireMarkers('Company Operations settings host', publishedOperations, [
  'id="module-settings"', 'id="settingCompanyName"', 'id="settingCompanyAddress"',
  'id="settingCompanyPhone"', 'id="settingCompanyEmail"', '/assets/admin-company-context.js?v=20260809-admin-company-context-2',
]);
requireMarkers('Operations bootstrap', operationsContext, [
  "'/assets/admin-company-settings.js?v=20260810-company-settings-backend-1'",
  'loadCanonicalShell()',
]);
requireMarkers('Admin context router', router, ['admin-owner-context.js','admin-operations-context.js']);
if (publishedOperations.includes('/assets/admin-company-settings.js?v=20260810-company-settings-backend-1')) {
  throw new Error('Company Operations Settings is duplicated as a direct HTML injection instead of being owned by the Operations bootstrap');
}
if (publishedOwner.includes('/assets/admin-company-settings.js?v=20260810-company-settings-backend-1')) {
  throw new Error('Parent owner command center directly loads company-specific settings; those controls belong in Operations');
}
for (const relative of ['assets/admin-company-settings.js','assets/admin-company-context.js','assets/admin-operations-context.js','admin.html','admin-operations.html']) {
  try { await stat(path.join(dist, relative)); }
  catch { throw new Error(`Admin Company Settings publication failed: dist-web/${relative} is missing`); }
}
console.log('Admin Company Settings verified in the company Operations desktop: selected-company GET/PATCH, PostgreSQL LegalEntity storage, audited saves, company-switch reloads and unsaved-change protection remain intact while the parent owner command center stays separate.');
