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

function normalizeThemeCompatibilityAlias(masterHtml) {
  const legacyAlias = 'window.selectPresetTheme=applyTheme;';
  const canonicalAlias = 'window.selectPresetTheme=applyPresetTheme;';

  if (masterHtml.includes(legacyAlias)) {
    return masterHtml.replace(legacyAlias, canonicalAlias);
  }

  if (!masterHtml.includes(canonicalAlias)) {
    throw new Error(
      'Standalone SPIRE master preset-theme compatibility alias could not be located.'
    );
  }

  return masterHtml;
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
   * boundary here so that step is deterministic.
   *
   * IMPORTANT: the defect/theme pass removes the legacy applyTheme() function.
   * The source master previously left `window.selectPresetTheme=applyTheme;`
   * below that removal point. In a published build that statement throws a
   * ReferenceError before bootstrap() is registered, leaving the page stuck on
   * literal HTML placeholders. Point the compatibility alias at the canonical
   * applyPresetTheme() runtime before the defect/theme pass runs.
   */
  let normalizedMaster = normalizeAccessibilityRuntime(masterHtml);
  normalizedMaster = normalizeThemeCompatibilityAlias(normalizedMaster);

  if (normalizedMaster.includes('window.selectPresetTheme=applyTheme;')) {
    throw new Error(
      'Standalone SPIRE master still contains the bootstrap-breaking applyTheme compatibility alias.'
    );
  }

  if (!normalizedMaster.includes('window.selectPresetTheme=applyPresetTheme;')) {
    throw new Error(
      'Standalone SPIRE master is missing the canonical preset-theme compatibility alias.'
    );
  }

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
      'Preset-theme compatibility alias normalized so bootstrap remains reachable.',
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

// build-static-site.mjs imports this verifier before dist-web is copied.
// Normalize the standalone accessibility suite and make the DSP Daily
// Documentation grid the sole Flowsheets renderer in the master source used
// for this build. These transforms change presentation/runtime wiring only;
// they do not alter patient, MAR, intake, or clinical database records.
await import('./fix-spire-accessibility-suite.mjs');
await import('./fix-spire-master-flowsheet-authority.mjs');