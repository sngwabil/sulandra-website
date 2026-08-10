import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = '20260810-business-uat-1';
const canonicalApi = 'https://sulandra-website-production-5fc4.up.railway.app';
const staleApi = 'https://sulandra-website-production.up.railway.app';

async function update(relative, transform) {
  const target = path.join(root, relative);
  const source = await readFile(target, 'utf8');
  const next = transform(source);
  if (next !== source) await writeFile(target, next, 'utf8');
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
  if (!next.includes('href="/company-compliance.html"')) throw new Error('Company Documents to Company Compliance workflow bridge was not installed');
  return next;
});

await update('workforce-admin.html', source => {
  let next = source.replace(/\s*<script src="\/assets\/workforce-payroll-readiness\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n');
  if (!next.includes('</body>')) throw new Error('Workforce Administration page has no body close');
  next = next.replace('</body>', `<script src="/assets/workforce-payroll-readiness.js?v=${contract}"></script>\n</body>`);
  return next;
});

await update('employee-portal.html', source => {
  if (source.includes(`name="sulandra-business-uat-contract" content="${contract}"`)) return source;
  if (!source.includes('</head>')) throw new Error('Employee Portal has no head close');
  return source.replace('</head>', `<meta name="sulandra-business-uat-contract" content="${contract}">\n</head>`);
});

console.log('Business-path UAT bridges installed: canonical hiring APIs, secure Home Health invitation tokens, SCLS Task Board continuity, Company Documents compliance continuity, payroll-ready export, and exact production contract marker.');
