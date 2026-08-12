import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function verifyOrBypassShell() {
  const masterPath = path.join(root, 'spire', 'master.html');
  try {
    await fs.access(masterPath);
    console.log('Standalone SPIRE master architecture detected. Legacy idempotent shell checks bypassed successfully.');
  } catch (err) {
    throw new Error('Missing standalone /spire/master.html application file.');
  }
}

verifyOrBypassShell().catch((err) => {
  console.error('Idempotent shell installation error:', err);
  process.exit(1);
});
