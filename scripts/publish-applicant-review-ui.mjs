import { cp, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'careers-admin-workflow.js',
  'applydsp.html',
  'applylpn.html',
  'applygeneral.html',
  'applydoo.html',
  'applydriver.html',
  'services/community-living/applydsp.html',
];
for (const relative of files) {
  const source = path.join(root, relative);
  const target = path.join(root, 'dist-web', relative);
  try {
    await stat(source);
    await cp(source, target, { force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
console.log('Applicant folder and careers application enhancements published into dist-web.');

// This publisher is already the final static copy step reached from the Employee
// self-service pipeline. Publish and verify SIA here so the assistant page and
// Employee Portal launchers are part of the same immutable website build.
await import('./install-sia-frontend.mjs');
