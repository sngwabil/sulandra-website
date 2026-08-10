import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const controllerPath = path.join(root, 'admin-railway.js');
const adminPath = path.join(root, 'admin.html');

let controller = await readFile(controllerPath, 'utf8');
let admin = await readFile(adminPath, 'utf8');

controller = controller.replace(/\n\s*const SETTINGS_KEY = ["']sulandra:admin:company-settings["'];/, '');

const legacyBlock = /\n\s*function loadSettings\(\) \{[\s\S]*?\n\s*window\.saveCompanySettings = function \(\) \{[\s\S]*?\n\s*\};/;
if (legacyBlock.test(controller)) {
  controller = controller.replace(legacyBlock, `

  function loadSettings() {
    // Authoritative company settings are loaded from PostgreSQL by /assets/admin-company-settings.js.
  }

  window.saveCompanySettings = function () {
    return window.SulandraCompanySettings?.save?.();
  };`);
}

if (/localStorage\.setItem\(SETTINGS_KEY/.test(controller) || /localStorage\.getItem\(SETTINGS_KEY/.test(controller)) {
  throw new Error('Legacy browser company-settings persistence still exists in admin-railway.js');
}
if (/const SETTINGS_KEY\s*=/.test(controller)) {
  throw new Error('Legacy company SETTINGS_KEY still exists in admin-railway.js');
}

admin = admin
  .replace('All emails, candidate portals, and offer documents dynamically pull from this central setting.', 'These company-scoped values are stored centrally in the Sulandra backend and are available to connected administrative workflows.')
  .replace('CAREERS SENDER EMAIL', 'COMPANY / CAREERS CONTACT EMAIL')
  .replace(/(<input[^>]+id="settingCompanyName"[^>]+) value="[^"]*"/i, '$1 value=""')
  .replace(/(<input[^>]+id="settingCompanyAddress"[^>]+) value="[^"]*"/i, '$1 value=""')
  .replace(/(<input[^>]+id="settingCompanyPhone"[^>]+) value="[^"]*"/i, '$1 value=""')
  .replace(/(<input[^>]+id="settingCompanyEmail"[^>]+) value="[^"]*"/i, '$1 value=""')
  .replace(/(<input[^>]+id="settingSenderName"[^>]+) value="[^"]*"/i, '$1 value=""')
  .replace(/(<input[^>]+id="settingUnmonitoredNotice"[^>]+) value="[^"]*"/i, '$1 value=""')
  .replace(/(<label[^>]*>GLOBAL EMPLOYMENT DISCLAIMER<\/label>\s*<textarea)(?![^>]*id=)/i, '$1 id="settingEmploymentDisclaimer"')
  .replace(/<textarea([^>]*id="settingEmploymentDisclaimer"[^>]*)>[\s\S]*?<\/textarea>/i, '<textarea$1></textarea>')
  .replace(/<button class="btn btn-primary" type="button" style="padding:12px;" onclick="saveCompanySettings\(\)">Save Settings<\/button>/i, '<button class="btn btn-primary" id="adminCompanySettingsSave" type="submit" style="padding:12px;">Save Company Settings</button>');

if (!admin.includes('id="adminCompanySettingsSave"')) throw new Error('Admin Company Settings save control was not normalized');
if (!admin.includes('id="settingEmploymentDisclaimer"')) throw new Error('Admin Company Settings disclaimer field was not normalized');
if (/onclick="saveCompanySettings\(\)"/.test(admin)) throw new Error('Legacy inline Company Settings save handler still exists');

await Promise.all([
  writeFile(controllerPath, controller, 'utf8'),
  writeFile(adminPath, admin, 'utf8'),
]);

console.log('Admin Company Settings now publish without browser-local persistence or hardcoded company defaults; the backend runtime is authoritative.');
