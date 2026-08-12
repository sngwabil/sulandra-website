import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function verifySpireFoundation() {
  const masterPath = path.join(root, 'spire', 'master.html');
  const rootRedirectPath = path.join(root, 'spire.html');

  try {
    // 1. Verify Master Application exists and contains required Railway/SPIRE bridges
    const masterContent = await readFile(masterPath, 'utf8');
    const requiredSignatures = ['SPIRE_CONFIG', 'spireApi', 'getAccessToken', 'requireSulandraSession'];
    
    for (const sig of requiredSignatures) {
      if (!masterContent.includes(sig)) {
        throw new Error(`Master SPIRE template is missing required signature: ${sig}`);
      }
    }

    // 2. Verify Root Redirect exists and points to master.html
    const redirectContent = await readFile(rootRedirectPath, 'utf8');
    if (!redirectContent.includes('/spire/master.html')) {
      throw new Error('Root spire.html does not point to /spire/master.html canonical redirect.');
    }

    console.log('SPIRE foundation verification passed: Standalone master architecture and canonical redirect are fully intact.');
  } catch (err) {
    console.error('SPIRE foundation verification failed:', err.message);
    process.exit(1);
  }
}

verifySpireFoundation();
