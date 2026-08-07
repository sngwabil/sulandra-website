import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = 'https://sulandra-website-production-5fc4.up.railway.app';
const retired = 'https://sulandra-website-production.up.railway.app';
const pages = ['applydsp.html','applylpn.html','applydriver.html','applygeneral.html','applydoo.html','applycoo.html'];

for (const page of pages) {
  const target = path.join(root, page);
  let source;
  try { source = await readFile(target, 'utf8'); } catch { continue; }
  const original = source;
  source = source.replaceAll(retired, canonical);

  if (page === 'applydoo.html') {
    source = source.replace(
      /throw new Error\(payload\.error \|\| payload\.message \|\| ['"]Application submission failed\.['"]\);/g,
      `const details = Array.isArray(payload.details) ? payload.details : [];
        const detailText = details.map((issue) => {
          const field = Array.isArray(issue.path) && issue.path.length ? issue.path.join('.') : 'application';
          return field + ': ' + (issue.message || 'invalid value');
        }).join('\\n');
        throw new Error(detailText ? (payload.error || 'Validation failed') + '\\n' + detailText : (payload.error || payload.message || 'Application submission failed.'));`
    );
  }

  if (source !== original) await writeFile(target, source, 'utf8');
}

console.log('Careers application pages use the canonical Railway API and the Director of Operations application surfaces validation details.');
