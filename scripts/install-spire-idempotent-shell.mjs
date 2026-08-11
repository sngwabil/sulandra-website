import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'assets/spire-app-v2.js');
let source = await readFile(target, 'utf8');

if (!source.includes('BUSINESS_UAT_IDEMPOTENT_SHELL_BOOTSTRAP')) {
  const startAnchor = `  function installShell() {\n    const app = $('spireApp');\n    if (!app) return;\n    app.innerHTML = \``;
  const startReplacement = `  function installShell() {\n    const app = $('spireApp');\n    if (!app) return false;\n    /* BUSINESS_UAT_IDEMPOTENT_SHELL_BOOTSTRAP */\n    if (\n      $('spirePatientStrip') &&\n      $('spireHomeWorkspace') &&\n      $('spireGenericWorkspace') &&\n      $('spireChartWorkspace')\n    ) return true;\n    app.innerHTML = \``;
  if (!source.includes(startAnchor)) throw new Error('SPIRE installShell start anchor is missing');
  source = source.replace(startAnchor, startReplacement);

  const completionAnchor = `    wireShell();\n    renderHome();\n    loadFoundation();\n  }\n\n  function wireShell() {`;
  const completionReplacement = `    wireShell();\n    renderHome();\n    loadFoundation();\n    return true;\n  }\n\n  function wireShell() {`;
  if (!source.includes(completionAnchor)) throw new Error('SPIRE installShell completion anchor is missing');
  source = source.replace(completionAnchor, completionReplacement);
}

if (!source.includes('BUSINESS_UAT_IMMEDIATE_SHELL_BOOTSTRAP')) {
  const bootAnchor = `  document.addEventListener('DOMContentLoaded', installShell);\n  if (document.readyState !== 'loading') installShell();`;
  const bootReplacement = `  /* BUSINESS_UAT_IMMEDIATE_SHELL_BOOTSTRAP */\n  installShell();\n  if (document.readyState === 'loading') {\n    document.addEventListener('DOMContentLoaded', installShell, { once: true });\n  }`;
  if (!source.includes(bootAnchor)) throw new Error('SPIRE shell bootstrap anchor is missing');
  source = source.replace(bootAnchor, bootReplacement);
}

if (!source.includes('window.SpireEnsureShell = installShell')) {
  throw new Error('Canonical SpireEnsureShell hook is missing; run install-business-path-uat-bridges.mjs first');
}
if (!source.includes('BUSINESS_UAT_IDEMPOTENT_SHELL_BOOTSTRAP') || !source.includes('BUSINESS_UAT_IMMEDIATE_SHELL_BOOTSTRAP')) {
  throw new Error('Idempotent SPIRE shell bootstrap was not installed');
}

await writeFile(target, source, 'utf8');
console.log('SPIRE canonical shell bootstrap is idempotent and immediate; later DOM-ready or recovery calls cannot reconstruct an open chart.');
