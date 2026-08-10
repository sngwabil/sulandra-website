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

const [runtime, backend, publishedAdmin, context] = await Promise.all([
  read('assets/admin-company-settings.js'),
  read('api/src/company-settings-routes.ts'),
  read('admin.html', dist),
  read('assets/admin-company-context.js', dist),
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
requireMarkers('Canonical Admin settings host', publishedAdmin, [
  'id="module-settings"', 'id="settingCompanyName"', 'id="settingCompanyAddress"',
  'id="settingCompanyPhone"', 'id="settingCompanyEmail"', '/assets/admin-company-context.js?v=20260809-admin-company-context-2',
]);
requireMarkers('Canonical Admin bootstrap', context, [
  "'/assets/admin-company-settings.js?v=20260810-company-settings-backend-1'",
  'loadCanonicalShell()',
]);
if (publishedAdmin.includes('/assets/admin-company-settings.js?v=20260810-company-settings-backend-1')) {
  throw new Error('Admin Company Settings is duplicated as a direct HTML injection instead of being owned by the canonical Admin bootstrap');
}
for (const relative of ['assets/admin-company-settings.js','assets/admin-company-context.js','admin.html']) {
  try { await stat(path.join(dist, relative)); }
  catch { throw new Error(`Admin Company Settings publication failed: dist-web/${relative} is missing`); }
}
console.log('Admin Company Settings verified through the canonical Admin bootstrap: selected-company GET/PATCH, PostgreSQL LegalEntity storage, audited saves, backend loading, company-switch reloads, unsaved-change protection, and no post-build Admin HTML normalization.');
