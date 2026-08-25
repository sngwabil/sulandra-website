import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const [sourceOwner,publishedOwner,sourceOperations,publishedOperations,router,operationsContext,ownerBoundary,adminRuntime,buildScript] = await Promise.all([
  read('admin.html'),read('dist-web/admin.html'),read('admin-operations.html'),read('dist-web/admin-operations.html'),
  read('assets/admin-company-context.js'),read('assets/admin-operations-context.js'),read('assets/admin-owner-console.js'),
  read('admin-railway.js'),read('scripts/build-static-site.mjs'),
]);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const scriptMarker = '/assets/admin-company-context.js?v=20260809-admin-company-context-2';

for (const [label,html] of [['Source owner Admin',sourceOwner],['Published owner Admin',publishedOwner],['Source Operations',sourceOperations],['Published Operations',publishedOperations]]) {
  expect(html.includes(scriptMarker), `${label} does not load the Admin context router`);
  expect(html.indexOf(scriptMarker) < html.indexOf('<script src="admin-railway.js'), `${label} must load the Admin context router before the main Admin runtime`);
}
expect(router.includes('admin-owner-context.js') && router.includes('admin-operations-context.js'), 'Admin context router does not separate owner and Operations contexts');
expect(operationsContext.includes('/api/entity-context'), 'Operations company selector does not load authorized entity context');
expect(operationsContext.includes("entity.code === 'SCLS'"), 'Operations company selector does not preserve SCLS as the safe default');
expect(operationsContext.includes("entity.status === 'ACTIVE'"), 'Operations company selector does not distinguish active and planned companies');
expect(operationsContext.includes("active ? '' : 'disabled'"), 'Planned companies are not protected from premature selection in Operations');
expect(operationsContext.includes("'X-Legal-Entity-Id'"), 'Selected Operations company is not exposed to Admin API requests');
expect(operationsContext.includes('sulandra:company-change'), 'Operations company changes do not publish a shared application event');
expect(operationsContext.includes('sulandra:admin:legal-entity-id'), 'Operations company selection is not persisted');
expect(ownerBoundary.includes('#adminCompanyContext') && ownerBoundary.includes('#adminCompanySelectorContainer'), 'Owner command center does not suppress child-company selector controls');
expect(ownerBoundary.includes('/api/owner/authority'), 'Owner command center is not protected by owner authority');
expect(adminRuntime.includes('SulandraCompanyContext?.headers?.()'), 'Main Admin requests do not carry the selected Operations company context');
expect(adminRuntime.includes('SulandraCompanyContext?.initialize?.(session.entityContext)'), 'Admin session does not initialize Operations selector from authenticated memberships');
expect(buildScript.includes(scriptMarker), 'Static publication does not verify the Admin context router');
expect(buildScript.includes("'assets/admin-company-context.js'"), 'Static publication does not require the Admin context router');
expect(buildScript.includes("'admin-operations.html'"), 'Static publication does not require the company Operations desktop');

if (failures.length) {
  console.error(`Admin company-context verification failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Admin company context verified: the owner command center suppresses child-company selection, while Operations renders authorized entity memberships in one persistent selector, preserves SCLS as the safe default, and sends the selected entity ID with Admin requests.');
