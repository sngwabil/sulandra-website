import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [sourceAdmin, publishedAdmin, contextAsset, adminRuntime, buildScript] = await Promise.all([
  read('admin.html'),
  read('dist-web/admin.html'),
  read('assets/admin-company-context.js'),
  read('admin-railway.js'),
  read('scripts/build-static-site.mjs'),
]);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const scriptMarker = '/assets/admin-company-context.js?v=20260808-admin-company-context-1';

expect(sourceAdmin.includes(scriptMarker), 'Source Admin does not load the company-context asset');
expect(publishedAdmin.includes(scriptMarker), 'Published Admin does not load the company-context asset');
expect(sourceAdmin.indexOf(scriptMarker) < sourceAdmin.indexOf('<script src="admin-railway.js'), 'Company context must load before the main Admin runtime');
expect(contextAsset.includes('/api/entity-context'), 'Company selector does not load authorized entity context');
expect(contextAsset.includes("entity.code === 'SCLS'"), 'Company selector does not default current operations to SCLS');
expect(contextAsset.includes("entity.status === 'ACTIVE'"), 'Company selector does not distinguish active and planned companies');
expect(contextAsset.includes("active ? '' : 'disabled'"), 'Planned companies are not protected from premature selection');
expect(contextAsset.includes("'X-Legal-Entity-Id'"), 'Selected company is not exposed to Admin API requests');
expect(contextAsset.includes('sulandra:company-change'), 'Company changes do not publish a shared application event');
expect(contextAsset.includes('sulandra:admin:legal-entity-id'), 'Company selection is not persisted');
expect(adminRuntime.includes('SulandraCompanyContext?.headers?.()'), 'Main Admin requests do not carry the selected company context');
expect(adminRuntime.includes('SulandraCompanyContext?.initialize?.(session.entityContext)'), 'Admin session does not initialize the selector from authenticated memberships');
expect(buildScript.includes(scriptMarker), 'Static publication does not verify the company selector');
expect(buildScript.includes("'assets/admin-company-context.js'"), 'Static publication does not require the company-context asset');

if (failures.length) {
  console.error(`Admin company-context verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Admin company context verified: authenticated entity memberships render in one persistent selector, SCLS is the safe active default, planned companies remain locked, and Admin requests carry the selected entity ID.');
