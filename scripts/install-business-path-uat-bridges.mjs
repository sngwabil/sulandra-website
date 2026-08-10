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

await update('interview-admin-scheduler.js', source => {
  const next = source.replaceAll(staleApi, canonicalApi);
  if (!next.includes(canonicalApi) || next.includes(staleApi)) throw new Error('Interview scheduler is not pinned to the canonical Railway API');
  return next;
});

await update('scls-residential.html', source => {
  let next = source;
  if (!next.includes('id="sclsTaskBoardLink"')) {
    next = next.replace('<span class="spacer"></span>', '<span class="spacer"></span><a id="sclsTaskBoardLink" data-business-uat-contract="'+contract+'" href="/scls-tasks.html">Task Board</a>');
  }
  if (!next.includes('id="sclsTasksWorkflowLink"')) {
    next = next.replace('<div class="head"><h2>House & Resident Tasks</h2></div>', '<div class="head"><h2>House & Resident Tasks</h2><a id="sclsTasksWorkflowLink" class="btn primary" data-business-uat-contract="'+contract+'" href="/scls-tasks.html">Open Task Board</a></div>');
  }
  if (!next.includes('id="sclsTaskBoardLink"') || !next.includes('id="sclsTasksWorkflowLink"')) throw new Error('SCLS Residential task workflow bridge was not installed');
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

console.log('Business-path UAT bridges installed: canonical interview scheduling, SCLS task continuity, payroll-ready export, and exact production contract marker.');
