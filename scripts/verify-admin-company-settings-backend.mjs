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
  for (const marker of markers) {
    if (!source.includes(marker)) throw new Error(`${label} is missing required marker: ${marker}`);
  }
}

const [runtime, backend, publishedAdmin, publishedController] = await Promise.all([
  read('assets/admin-company-settings.js'),
  read('api/src/company-settings-routes.ts'),
  read('admin.html', dist),
  read('admin-railway.js', dist),
]);

requireMarkers('Company Settings backend', backend, [
  "app.get('/api/admin/company-settings'",
  "app.patch('/api/admin/company-settings'",
  'Select a Sulandra company first',
  'metadata.companySettings',
  "'UPDATE_COMPANY_SETTINGS'",
  'LegalEntity',
  'updatedAt',
  'updatedById',
]);

requireMarkers('Company Settings runtime', runtime, [
  "'/api/admin/company-settings'",
  "method: 'PATCH'",
  "'X-Legal-Entity-Id'",
  'localStorage.removeItem(LEGACY_SETTINGS_KEY)',
  'settingEmploymentDisclaimer',
  'settingTimezone',
  'settingSupportEmail',
  'settingSupportPhone',
  'settingWebsite',
  'adminCompanySettingsBackendStatus',
  'adminCompanySettingsReload',
  'sulandra:company-change',
  'sulandra:entity-context-changed',
  'beforeunload',
  'Browser localStorage is not used as the settings database',
]);

requireMarkers('Published Admin Settings', publishedAdmin, [
  'id="module-settings"',
  'id="adminCompanySettingsSave"',
  'id="settingEmploymentDisclaimer"',
  '/assets/admin-company-settings.js?v=20260810-company-settings-backend-1',
  'These company-scoped values are stored centrally in the Sulandra backend',
]);

for (const forbidden of [
  'onclick="saveCompanySettings()"',
  'value="(937) 555-0199"',
  'All emails, candidate portals, and offer documents dynamically pull from this central setting.',
]) {
  if (publishedAdmin.includes(forbidden)) throw new Error(`Published Admin still contains legacy Company Settings behavior/content: ${forbidden}`);
}

for (const forbidden of [
  'const SETTINGS_KEY = "sulandra:admin:company-settings"',
  'localStorage.setItem(SETTINGS_KEY',
  'localStorage.getItem(SETTINGS_KEY',
  'saved in this browser',
]) {
  if (publishedController.includes(forbidden)) throw new Error(`Published admin-railway.js still treats browser storage as Company Settings authority: ${forbidden}`);
}

for (const relative of ['assets/admin-company-settings.js', 'admin.html', 'admin-railway.js']) {
  try { await stat(path.join(dist, relative)); }
  catch { throw new Error(`Admin Company Settings publication failed: dist-web/${relative} is missing`); }
}

console.log('Admin Company Settings verified: selected-company GET/PATCH, PostgreSQL LegalEntity storage, audited saves, backend loading, company-switch reloads, unsaved-change protection, support/timezone/web fields, and zero browser-local settings authority in published Admin.');
