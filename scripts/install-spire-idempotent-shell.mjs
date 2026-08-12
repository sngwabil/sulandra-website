import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory =
  path.dirname(fileURLToPath(import.meta.url));

const root =
  path.resolve(scriptDirectory, '..');

const masterPath =
  path.join(root, 'spire', 'master.html');

const entryPath =
  path.join(root, 'spire.html');

async function requireFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(
      `${label} is missing: ${filePath}`
    );
  }
}

async function verifyStandaloneSpireArchitecture() {
  await requireFile(
    masterPath,
    'Standalone S.P.I.R.E. master application'
  );

  await requireFile(
    entryPath,
    'Canonical S.P.I.R.E. entry page'
  );

  const [
    masterHtml,
    entryHtml
  ] = await Promise.all([
    readFile(masterPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);

  /*
   * Verify that the standalone master is a complete HTML document.
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
   * Verify that the canonical entry sends users to the standalone master.
   */
  if (
    !entryHtml.includes('/spire/master.html')
  ) {
    throw new Error(
      '/spire.html is not configured to open /spire/master.html.'
    );
  }

  /*
   * Verify that query-string and hash deep-link context are preserved.
   */
  if (
    !entryHtml.includes(
      'window.location.search'
    ) ||
    !entryHtml.includes(
      'window.location.hash'
    )
  ) {
    throw new Error(
      '/spire.html does not preserve SPIRE query/hash deep-link context.'
    );
  }

  /*
   * The old shell is intentionally no longer required.
   * Do NOT require:
   *
   * window.SpireEnsureShell
   * installShell()
   * spire-app-v2.js
   * spire-canonical-bootstrap.js
   * spire-chart-ready.js
   * spire-deep-link.js
   */
  const legacyEntryAssets = [
    'spire-app-v2.js',
    'spire-canonical-bootstrap.js',
    'spire-shell-resilience.js',
    'spire-chart-ready.js',
    'spire-deep-link.js',
    'spire-home-care-redesign-loader.js',
  ];

  const legacyFound =
    legacyEntryAssets.filter(
      asset => entryHtml.includes(asset)
    );

  if (legacyFound.length) {
    throw new Error(
      '/spire.html still references legacy SPIRE runtime assets: ' +
      legacyFound.join(', ')
    );
  }

  console.log(
    [
      'Standalone S.P.I.R.E. architecture verified.',
      'Master application:',
      '/spire/master.html.',
      'Canonical entry:',
      '/spire.html -> /spire/master.html.',
      'Deep-link context is preserved.',
      'Legacy SpireEnsureShell installation is not required.',
    ].join(' ')
  );
}

try {
  await verifyStandaloneSpireArchitecture();
} catch (error) {
  console.error(
    'Standalone S.P.I.R.E. verification failed:',
    error instanceof Error
      ? error.message
      : error
  );

  process.exit(1);
}
