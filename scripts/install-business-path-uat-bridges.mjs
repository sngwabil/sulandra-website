import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = '20260810-business-uat-1';
const spireAppGeneration = '20260810-business-uat-8';
const chartReadyGeneration = '20260810-spire-chart-ready-2';
const deepLinkGeneration = '20260810-business-uat-5';
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';
const staleApi = 'https://sulandra-website-production.up.railway.app';
const skippedFrontendSources = [];

async function update(relative, transform) {
  const target = path.join(root, relative);
  let source;
  try {
    source = await readFile(target, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      skippedFrontendSources.push(relative);
      return false;
    }
    throw error;
  }
  const next = transform(source);
  if (next !== source) await writeFile(target, next, 'utf8');
  return true;
}

for (const relative of ['applydsp.html','interview-admin-scheduler.js','applicant-portal.html','offer-acceptance.html']) {
  await update(relative, source => {
    const next = source.replaceAll(staleApi, canonicalApi);
    if (!next.includes(canonicalApi) || next.includes(staleApi)) throw new Error(`${relative} is not pinned to the canonical Railway API`);
    return next;
  });
}

await update('home-health-referral.html', source => {
  if (source.includes('home-health-referral-token-bootstrap.js')) return source;
  const marker = '<script>(()=>';
  if (!source.includes(marker)) throw new Error('Home Health referral bootstrap anchor is missing');
  const next = source.replace(marker, `<script src="/assets/home-health-referral-token-bootstrap.js?v=${contract}"></script>${marker}`);
  if (!next.includes('home-health-referral-token-bootstrap.js')) throw new Error('Home Health secure invitation token bootstrap was not installed');
  return next;
});

await update('home-health.html', source => {
  let next = source;
  if (!next.includes('id="homeHealthReferralInboxLink"')) {
    const marker = '<a href="/home-health-visits.html">My Visits</a>';
    if (!next.includes(marker)) throw new Error('Home Health header navigation anchor is missing');
    next = next.replace(marker, `<a id="homeHealthReferralInboxLink" data-business-uat-contract="${contract}" href="/home-health-referrals.html">Referral Inbox</a>${marker}`);
  }
  if (!next.includes('home-health-rail-stability.js')) {
    if (!next.includes('</body>')) throw new Error('Home Health page has no body close');
    next = next.replace('</body>', `<script src="/assets/home-health-rail-stability.js?v=${contract}"></script>\n</body>`);
  }
  if (!next.includes('href="/home-health-referrals.html"')) throw new Error('Home Health Operations to Referral Inbox workflow bridge was not installed');
  if (!next.includes('home-health-rail-stability.js')) throw new Error('Home Health rail stability bridge was not installed');
  return next;
});

await update('employee-portal-railway.js', source => {
  if (source.includes('employeeHomeHealthReferralInboxLauncher')) return source;
  const marker = '          quick.appendChild(launcher("Home Health Operations", "/home-health.html", "Manage Home Health referrals, episodes, Plan of Care, disciplines, staff and scheduling", "employeeHomeHealthOperationsLauncher"));';
  if (!source.includes(marker)) throw new Error('Employee Portal Home Health management launcher anchor is missing');
  const next = source.replace(marker, `${marker}\n          quick.appendChild(launcher("Home Health Referral Inbox", "/home-health-referrals.html", "Review secure hospital and provider Home Health referrals and create intake cases", "employeeHomeHealthReferralInboxLauncher"));`);
  if (!next.includes('employeeHomeHealthReferralInboxLauncher')) throw new Error('Employee Portal Home Health Referral Inbox launcher was not installed');
  return next;
});

await update('spire.html', source => {
  let next = source.replace(/\/assets\/spire-app-v2\.js\?v=[^"']+/g, `/assets/spire-app-v2.js?v=${spireAppGeneration}`);
  next = next.replace(/\/assets\/spire-chart-ready\.js\?v=[^"']+/g, `/assets/spire-chart-ready.js?v=${chartReadyGeneration}`);
  next = next.replace(/\/assets\/spire-deep-link\.js\?v=[^"']+/g, `/assets/spire-deep-link.js?v=${deepLinkGeneration}`);
  if (!next.includes(`/assets/spire-app-v2.js?v=${spireAppGeneration}`)) throw new Error('SPIRE page is not pinned to the current chart-stabilized application generation');
  if (!next.includes(`/assets/spire-chart-ready.js?v=${chartReadyGeneration}`)) throw new Error('SPIRE page is not pinned to the idempotent chart-readiness generation');
  if (!next.includes(`/assets/spire-deep-link.js?v=${deepLinkGeneration}`)) throw new Error('SPIRE page is not pinned to the coordinator-aware deep-link generation');
  return next;
});

await update('assets/spire-app-v2.js', source => {
  let next = source;
  const oldOrder = '      renderPatientStrip();\n      renderChartWorkspace();';
  const priorChartFirst = '      /* BUSINESS_UAT_CHART_FIRST */\n      renderChartWorkspace();\n      renderPatientStrip();';
  const stabilizedChartOpen = `      /* BUSINESS_UAT_CHART_FIRST */\n      /* BUSINESS_UAT_CHART_STABILIZED */\n      /* BUSINESS_UAT_CHART_WORKSPACE_STATE */\n      state.activeWorkspace = 'chart';\n      try { renderPatientStrip(); } catch (error) { console.error('[SPIRE patient strip]', error); }\n      renderChartWorkspace();\n      const openedPatientId = String(id);\n      const stabilizeOpenedChart = () => {\n        const currentPatientId = String(state.patient?.id || state.patient?.patientId || '');\n        if (currentPatientId !== openedPatientId) return;\n        const chartWorkspace = $('spireChartWorkspace');\n        if (!chartWorkspace) return;\n        document.querySelectorAll('.spire-workspace').forEach(node => {\n          if (node === chartWorkspace) { if (!node.classList.contains('active')) node.classList.add('active'); }\n          else if (node.classList.contains('active')) node.classList.remove('active');\n        });\n      };\n      stabilizeOpenedChart();\n      requestAnimationFrame(stabilizeOpenedChart);\n      setTimeout(stabilizeOpenedChart, 120);`;
  if (next.includes(oldOrder)) next = next.replace(oldOrder, stabilizedChartOpen);
  else if (next.includes(priorChartFirst)) next = next.replace(priorChartFirst, stabilizedChartOpen);
  if (!next.includes('BUSINESS_UAT_CHART_FIRST') || !next.includes('BUSINESS_UAT_CHART_STABILIZED') || !next.includes('BUSINESS_UAT_CHART_WORKSPACE_STATE')) throw new Error('SPIRE stabilized chart-open hardening was not installed');

  if (!next.includes('window.SpireOpenPatient = openPatient')) {
    const exposeAnchor = '\n  function renderPatientStrip() {';
    if (!next.includes(exposeAnchor)) throw new Error('SPIRE native patient opener export anchor is missing');
    next = next.replace(exposeAnchor, '\n  window.SpireOpenPatient = openPatient;\n\n  function renderPatientStrip() {');
  }
  if (!next.includes('window.SpireEnsureShell = installShell')) {
    const openerAnchor = '  window.SpireOpenPatient = openPatient;';
    if (!next.includes(openerAnchor)) throw new Error('SPIRE native patient opener export is unavailable for shell hook installation');
    next = next.replace(openerAnchor, `  /* BUSINESS_UAT_CANONICAL_SHELL_REPAIR */\n  window.SpireEnsureShell = installShell;\n${openerAnchor}`);
  }
  if (!next.includes('window.SpireOpenPatient = openPatient')) throw new Error('SPIRE native patient opener was not exported');
  if (!next.includes('window.SpireEnsureShell = installShell') || !next.includes('BUSINESS_UAT_CANONICAL_SHELL_REPAIR')) throw new Error('SPIRE canonical shell repair hook was not exported');

  if (!next.includes('BUSINESS_UAT_ASYNC_WORKSPACE_REFRESH')) {
    const marker = '      renderMiniPanels();\n      renderHome();\n';
    if (!next.includes(marker)) throw new Error('SPIRE foundation load anchor is missing');
    const bridge = `${marker}      /* BUSINESS_UAT_ASYNC_WORKSPACE_REFRESH */\n      if (['census','search'].includes(state.activeWorkspace)) renderGenericWorkspace(state.activeWorkspace);\n      /* BUSINESS_UAT_NATIVE_DEEPLINK */\n      const deepLinkQuery = new URLSearchParams(location.search);\n      const deepLinkHash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));\n      const deepLinkPatientId = deepLinkQuery.get('patientId') || deepLinkQuery.get('patient') || deepLinkHash.get('patientId') || deepLinkHash.get('patient') || '';\n      const deepLinkTab = deepLinkQuery.get('tab') || deepLinkHash.get('tab') || '';\n      if (deepLinkPatientId) {\n        await openPatient(deepLinkPatientId);\n        if (state.patient && deepLinkTab && chartTabs.some(([key]) => key === deepLinkTab)) await renderChartTab(deepLinkTab);\n      }\n`;
    next = next.replace(marker, bridge);
  }
  if (!next.includes('BUSINESS_UAT_ASYNC_WORKSPACE_REFRESH')) throw new Error('SPIRE asynchronous patient-list workspace refresh was not installed');
  if (!next.includes('BUSINESS_UAT_NATIVE_DEEPLINK') || !next.includes('await openPatient(deepLinkPatientId)')) throw new Error('SPIRE native patient/tab deep-link bridge was not installed');
  return next;
});

await update('scls-residential.html', source => {
  let next = source;
  if (!next.includes('id="sclsTaskBoardLink"')) {
    const link = `<a id="sclsTaskBoardLink" data-business-uat-contract="${contract}" href="/scls-tasks.html"><span id="sclsTasksWorkflowLink">Task Board</span></a>`;
    if (next.includes('<span class="spacer"></span>')) next = next.replace('<span class="spacer"></span>', `<span class="spacer"></span>${link}`);
    else if (next.includes('</header>')) next = next.replace('</header>', `${link}</header>`);
    else throw new Error('SCLS Residential header is missing; cannot expose the Task Board workflow');
  }
  if (!next.includes('id="sclsTaskBoardLink"') || !next.includes('id="sclsTasksWorkflowLink"') || !next.includes('href="/scls-tasks.html"')) throw new Error('SCLS Residential Task Board workflow bridge was not installed');
  return next;
});

await update('company-documents.html', source => {
  if (source.includes('id="companyComplianceLink"')) return source;
  const marker = '<a href="/employee-portal.html">Employee Portal</a>';
  if (!source.includes(marker)) throw new Error('Company Documents navigation anchor is missing');
  const next = source.replace(marker, `<a id="companyComplianceLink" data-business-uat-contract="${contract}" href="/company-compliance.html">Company Compliance</a>${marker}`);
  if (!next.includes('href="/company-compliance.html"')) throw new Error('Company Documents to Company Compliance navigation was not installed');
  return next;
});

await update('workforce-admin.html', source => {
  let next = source.replace(/\s*<script src="\/assets\/workforce-payroll-readiness\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  if (!next.includes('</body>')) throw new Error('Workforce Administration page has no body close');
  next = next.replace('</body>', `<script src="/assets/workforce-payroll-readiness.js?v=${contract}"></script>\n</body>`);
  return next;
});

await update('employee-portal.html', source => {
  let next = source;
  if (!next.includes(`name="sulandra-business-uat-contract" content="${contract}"`)) {
    if (!next.includes('</head>')) throw new Error('Employee Portal has no head close');
    next = next.replace('</head>', `<meta name="sulandra-business-uat-contract" content="${contract}">\n</head>`);
  }
  if (!next.includes('employee-role-navigation-guard.js')) {
    if (!next.includes('</body>')) throw new Error('Employee Portal has no body close');
    next = next.replace('</body>', `<script src="/assets/employee-role-navigation-guard.js?v=${contract}"></script>\n</body>`);
  }
  if (!next.includes('employee-role-navigation-guard.js')) throw new Error('Employee Portal navigation guard was not published');
  return next;
});

if (skippedFrontendSources.length) {
  console.log(`Business-path UAT bridge installer skipped frontend-only sources that are not present in this build image: ${[...new Set(skippedFrontendSources)].join(', ')}.`);
} else {
  console.log('Business-path UAT bridges installed: canonical hiring APIs, secure Home Health invitation tokens and stable referral rail, pinned SPIRE app/chart-ready/deep-link generations with canonical single-runtime shell repair and idempotent chart activation, asynchronous patient-list refresh and native chart recovery, SCLS Task Board continuity, Company Documents compliance continuity, guarded Workforce navigation, payroll-ready export, and exact production contract marker.');
}
