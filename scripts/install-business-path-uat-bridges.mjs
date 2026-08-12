import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// DEVELOPMENT_WORKFLOW:
// Always resolve repository paths from this script's own location.
// Do not rely on process.cwd().
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');

const masterPath = path.join(root, 'spire', 'master.html');
const entryPath = path.join(root, 'spire.html');

async function requireFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`${label} is missing: ${filePath}`);
  }
}

async function verifyStandaloneSpireArchitecture() {
  await requireFile(
    masterPath,
    'Standalone S.P.I.R.E. master application'
  );

  await requireFile(
    entryPath,
    'Canonical S.P.I.R.E. frontend entry page'
  );

  const [masterHtml, entryHtml] = await Promise.all([
    readFile(masterPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);

  /*
   * Verify that /spire/master.html is actually a complete HTML page.
   * We intentionally do NOT require any legacy SPIRE shell assets.
   */
  if (
    !/<html[\s>]/i.test(masterHtml) ||
    !/<head[\s>]/i.test(masterHtml) ||
    !/<body[\s>]/i.test(masterHtml) ||
    !/<\/html>/i.test(masterHtml)
  ) {
    throw new Error(
      '/spire/master.html does not appear to be a complete HTML application.'
    );
  }

  /*
   * Reject accidental regression back to the legacy root SPIRE shell.
   * The master workstation must remain independent of these presentation
   * runtimes.
   */
  const forbiddenLegacyMasterAssets = [
    'spire-home-care-redesign-loader.js',
    'spire-user-template-integration.js',
    'spire-user-template-layout-fix.css',
    'spire-user-template-final-lock.css',
  ];

  const forbiddenFound = forbiddenLegacyMasterAssets.filter(
    asset => masterHtml.includes(asset)
  );

  if (forbiddenFound.length) {
    throw new Error(
      'Standalone /spire/master.html unexpectedly references legacy SPIRE ' +
      `presentation assets: ${forbiddenFound.join(', ')}`
    );
  }

  /*
   * /spire.html is now only the canonical frontend entry point.
   * It must send the browser to the standalone application while allowing
   * query-string and hash context to survive.
   */
  if (!entryHtml.includes('/spire/master.html')) {
    throw new Error(
      '/spire.html is not configured to open /spire/master.html.'
    );
  }

  if (
    !entryHtml.includes('window.location.search') ||
    !entryHtml.includes('window.location.hash')
  ) {
    throw new Error(
      '/spire.html does not preserve SPIRE query-string/hash deep-link context.'
    );
  }

  /*
   * The root entry must not execute the old SPIRE application.
   */
  const forbiddenEntryAssets = [
    'spire-app-v2.js',
    'spire-canonical-bootstrap.js',
    'spire-shell-resilience.js',
    'spire-chart-ready.js',
    'spire-deep-link.js',
    'spire-home-care-redesign-loader.js',
  ];

  const entryLegacyAssets = forbiddenEntryAssets.filter(
    asset => entryHtml.includes(asset)
  );

  if (entryLegacyAssets.length) {
    throw new Error(
      '/spire.html still references legacy SPIRE runtime assets: ' +
      entryLegacyAssets.join(', ')
    );
  }

  console.log(
    [
      'Standalone S.P.I.R.E. frontend architecture verified.',
      'Source application: /spire/master.html.',
      'Canonical entry: /spire.html -> /spire/master.html.',
      'Query/hash deep-link context is preserved.',
      'Legacy SPIRE shell installation is bypassed.',
      'scripts/build-static-site.mjs may now publish the frontend into dist-web/.',
    ].join(' ')
  );
}

try {
  await verifyStandaloneSpireArchitecture();
} catch (error) {
  console.error(
    'Standalone S.P.I.R.E. architecture verification failed:',
    error instanceof Error ? error.message : error
  );

  process.exit(1);
}
