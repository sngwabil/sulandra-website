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

// The business-path installer adds native deep-link support inside loadFoundation().
// That function can finish its API calls while the parser is still loading the rest
// of SPIRE. Opening the chart at that moment creates chart tabs and starts optional
// chart runtimes before DOMContentLoaded, which lets startup observers react to a
// half-built page. Defer only the patient/tab handoff; the shell and foundation can
// still initialize immediately.
if (source.includes('BUSINESS_UAT_NATIVE_DEEPLINK') && !source.includes('BUSINESS_UAT_DEFER_DEEPLINK_UNTIL_DOM_READY')) {
  const deepLinkAnchor = `      /* BUSINESS_UAT_NATIVE_DEEPLINK */\n      const deepLinkQuery = new URLSearchParams(location.search);\n      const deepLinkHash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));\n      const deepLinkPatientId = deepLinkQuery.get('patientId') || deepLinkQuery.get('patient') || deepLinkHash.get('patientId') || deepLinkHash.get('patient') || '';\n      const deepLinkTab = deepLinkQuery.get('tab') || deepLinkHash.get('tab') || '';\n      if (deepLinkPatientId) {\n        await openPatient(deepLinkPatientId);\n        if (state.patient && deepLinkTab && chartTabs.some(([key]) => key === deepLinkTab)) await renderChartTab(deepLinkTab);\n      }\n`;
  const deepLinkReplacement = `      /* BUSINESS_UAT_NATIVE_DEEPLINK */\n      /* BUSINESS_UAT_DEFER_DEEPLINK_UNTIL_DOM_READY */\n      const deepLinkQuery = new URLSearchParams(location.search);\n      const deepLinkHash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));\n      const deepLinkPatientId = deepLinkQuery.get('patientId') || deepLinkQuery.get('patient') || deepLinkHash.get('patientId') || deepLinkHash.get('patient') || '';\n      const deepLinkTab = deepLinkQuery.get('tab') || deepLinkHash.get('tab') || '';\n      if (deepLinkPatientId) {\n        const openDeepLinkedChart = async () => {\n          await openPatient(deepLinkPatientId);\n          if (state.patient && deepLinkTab && chartTabs.some(([key]) => key === deepLinkTab)) await renderChartTab(deepLinkTab);\n        };\n        if (document.readyState === 'loading') {\n          document.addEventListener('DOMContentLoaded', () => {\n            openDeepLinkedChart().catch((error) => console.error('[SPIRE deferred deep link]', error));\n          }, { once: true });\n        } else {\n          await openDeepLinkedChart();\n        }\n      }\n`;
  if (!source.includes(deepLinkAnchor)) throw new Error('SPIRE native deep-link anchor changed; cannot safely defer chart opening');
  source = source.replace(deepLinkAnchor, deepLinkReplacement);
}

if (!source.includes('window.SpireEnsureShell = installShell')) {
  throw new Error('Canonical SpireEnsureShell hook is missing; run install-business-path-uat-bridges.mjs first');
}
if (!source.includes('BUSINESS_UAT_IDEMPOTENT_SHELL_BOOTSTRAP') || !source.includes('BUSINESS_UAT_IMMEDIATE_SHELL_BOOTSTRAP')) {
  throw new Error('Idempotent SPIRE shell bootstrap was not installed');
}
if (source.includes('BUSINESS_UAT_NATIVE_DEEPLINK') && !source.includes('BUSINESS_UAT_DEFER_DEEPLINK_UNTIL_DOM_READY')) {
  throw new Error('SPIRE deep-link chart opening is not deferred until DOMContentLoaded');
}

await writeFile(target, source, 'utf8');
console.log('SPIRE canonical shell bootstrap is idempotent and immediate; deep-linked charts wait for DOMContentLoaded before rendering.');
