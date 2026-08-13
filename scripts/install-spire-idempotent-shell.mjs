import { access, readFile, writeFile } from 'node:fs/promises';
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

function normalizeAccessibilityRuntime(masterHtml) {
  const startToken = 'function openAccessibilityModal';
  const endToken = 'window.openAccessibilityModal=openAccessibilityModal;';

  const startIndex = masterHtml.indexOf(startToken);
  const endStart = masterHtml.indexOf(endToken, startIndex);

  if (startIndex === -1 || endStart === -1) {
    throw new Error(
      'Standalone SPIRE master accessibility runtime could not be located.'
    );
  }

  const lineStart = masterHtml.lastIndexOf('\n', startIndex) + 1;
  const endIndex = endStart + endToken.length;

  const normalized = `  function openAccessibilityModal(){
    const modal=$('#accessibilityModal');
    if(!modal)return;
    const name=state.user?.displayName||state.user?.name||state.user?.email||'User Profile';
    const role=state.user?.role||state.user?.credentials||'';
    modal.style.display='flex';
    const nameInput=$('#inputClinicianName',modal); if(nameInput) nameInput.value=name;
    const credentialInput=$('#inputClinicianCredentials',modal); if(credentialInput) credentialInput.value=role;
    const avatar=$('#modalUserAvatarPreview',modal); if(avatar) avatar.textContent=initialFromName(name);
  }
  window.openAccessibilityModal=openAccessibilityModal;`;

  return (
    masterHtml.slice(0, lineStart) +
    normalized +
    masterHtml.slice(endIndex)
  );
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

  let [
    masterHtml,
    entryHtml
  ] = await Promise.all([
    readFile(masterPath, 'utf8'),
    readFile(entryPath, 'utf8'),
  ]);

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

  if (
    !entryHtml.includes('/spire/master.html')
  ) {
    throw new Error(
      '/spire.html is not configured to open /spire/master.html.'
    );
  }

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

  /*
   * The next build step applies production defect fixes and the 20-theme
   * accessibility runtime. Normalize only the existing accessibility function
   * boundary here so that step is deterministic. This does not touch the
   * flowsheet, MAR, chart, intake, or any other clinical workspace.
   */
  const normalizedMaster = normalizeAccessibilityRuntime(masterHtml);
  if (normalizedMaster !== masterHtml) {
    await writeFile(masterPath, normalizedMaster, 'utf8');
    masterHtml = normalizedMaster;
  }

  console.log(
    [
      'Standalone S.P.I.R.E. architecture verified.',
      'Master application:',
      '/spire/master.html.',
      'Canonical entry:',
      '/spire.html -> /spire/master.html.',
      'Deep-link context is preserved.',
      'Accessibility runtime boundary normalized for the master defect/theme pass.',
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
