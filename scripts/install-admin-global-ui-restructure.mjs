import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const runtimeSrc = '/assets/admin-global-ui-restructure.js?v=20260822-global-admin-ui-1';
const runtimeAsset = path.join(root, 'assets', 'admin-global-ui-restructure.js');
const companyChroniclesAnchor = "      ['/assets/admin-company-chronicles.js?v=20260822-company-chronicles-1','canonical-admin-company-chronicles'],";
const companySettingsAnchor = "      ['/assets/admin-company-settings.js?v=20260810-company-settings-backend-1','canonical-admin-company-settings'],";
const runtimeEntry = `      ['${runtimeSrc}','canonical-admin-global-ui'],`;

async function patchAdminContext(target) {
  let source = await readFile(target, 'utf8');
  if (source.includes(runtimeSrc)) return;
  if (source.includes(companyChroniclesAnchor)) {
    source = source.replace(companyChroniclesAnchor, `${companyChroniclesAnchor}\n${runtimeEntry}`);
  } else if (source.includes(companySettingsAnchor)) {
    source = source.replace(companySettingsAnchor, `${companySettingsAnchor}\n${runtimeEntry}`);
  } else {
    throw new Error(`Canonical Admin asset anchor missing in ${path.relative(root, target)}`);
  }
  await writeFile(target, source, 'utf8');
}

const runtime = await readFile(runtimeAsset, 'utf8');
try { new Function(runtime); } catch (error) { throw new Error(`Admin global UI runtime has JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}`); }
for (const marker of [
  'Company Chronicles',
  'Clinical Operations',
  'Compliance & Audit',
  'Workforce & Dispatch',
  'Financial & Billing',
  'Active Dispatch Tracking',
  'Immediate Ride Booking',
  'Pending EVV Exceptions',
  'Quick Add Client',
  'System Health',
  'Security & Monitoring',
  'Universal search',
  '/admin-profile.html',
  '/spire-evv-test-console.html',
  '/nmt-dispatch.html',
  '/nmt-orders.html',
  '/client-intake.html',
]) {
  if (!runtime.includes(marker)) throw new Error(`Admin global UI runtime missing ${marker}`);
}

for (const target of [path.join(root, 'assets', 'admin-company-context.js'), path.join(dist, 'assets', 'admin-company-context.js')]) {
  try { await patchAdminContext(target); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

await stat(path.join(dist, 'assets', 'admin-global-ui-restructure.js'));
const publishedContext = await readFile(path.join(dist, 'assets', 'admin-company-context.js'), 'utf8');
if (!publishedContext.includes(runtimeSrc)) throw new Error('Canonical Admin bootstrap does not load the global UI restructuring runtime');

const sourceAdmin = await readFile(path.join(root, 'admin.html'), 'utf8');
const publishedAdmin = await readFile(path.join(dist, 'admin.html'), 'utf8');
if (sourceAdmin !== publishedAdmin) throw new Error('Global UI restructuring must not mutate canonical admin.html after publication');
if (publishedAdmin.includes(runtimeSrc)) throw new Error('Global UI restructuring must be loaded through the canonical Admin bootstrap, not direct admin.html injection');

console.log('Sulandra Admin global UI restructuring published: core folders own the left menu, global operations own the top bar, and day-to-day dispatch/EVV/intake actions own the right drawer.');

// Roadmap PR #12 binds every rendered Admin control to a stable, entity-aware
// operation identity only after the global UI has finished publishing its shell.
await import('./install-admin-operations-mapping.mjs');
await import('./verify-admin-operations-mapping.mjs');
