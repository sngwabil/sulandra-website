import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = 'https://sulandra-website-production-5fc4.up.railway.app';
const retired = 'https://sulandra-website-production.up.railway.app';
const pages = ['applydsp.html','applylpn.html','applydriver.html','applygeneral.html','applycoo.html'];

for (const page of pages) {
  const target = path.join(root, page);
  let source;
  try { source = await readFile(target, 'utf8'); } catch { continue; }
  const original = source;
  source = source.replaceAll(retired, canonical);

  if (page === 'applycoo.html') {
    source = source.replace(
      `if(!response.ok){ throw new Error(payload.error || payload.message || "Executive application submission failed."); }`,
      `if(!response.ok){
        const details = Array.isArray(payload.details) ? payload.details : [];
        const detailText = details.map((issue) => {
          const field = Array.isArray(issue.path) && issue.path.length ? issue.path.join('.') : 'application';
          return field + ': ' + (issue.message || 'invalid value');
        }).join('\\n');
        throw new Error(detailText ? (payload.error || 'Validation failed') + '\\n' + detailText : (payload.error || payload.message || 'Executive application submission failed.'));
      }`
    );
    source = source.replace(`notes: base.why || base.exp || null,`, `...(base.why || base.experience ? { notes: base.why || base.experience } : {}),`);
  }

  if (source !== original) await writeFile(target, source, 'utf8');
}

console.log('Careers application pages use the canonical Railway API; COO validation details are surfaced to the applicant.');
