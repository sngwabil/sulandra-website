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
      `function refs(){return [1,2].map(i=>({name:$(\`[name="ref\${i}Name"]\`)?.value||'',relationship:$(\`[name="ref\${i}Relationship"]\`)?.value||'',phone:$(\`[name="ref\${i}Phone"]\`)?.value||'',email:$(\`[name="ref\${i}Email"]\`)?.value||''}));}`,
      `function refs(){return [1,2].map(i=>({name:document.querySelector(\`[name="ref\${i}Name"]\`)?.value||'',relationship:document.querySelector(\`[name="ref\${i}Relationship"]\`)?.value||'',phone:document.querySelector(\`[name="ref\${i}Phone"]\`)?.value||'',email:document.querySelector(\`[name="ref\${i}Email"]\`)?.value||''}));}`
    );
    source = source.replace(
      /throw new Error\(payload\.error \|\| payload\.message \|\| ['"]Application submission failed\.['"]\);/g,
      `const details = Array.isArray(payload.details) ? payload.details : [];
        const detailText = details.map((issue) => {
          const field = Array.isArray(issue.path) && issue.path.length ? issue.path.join('.') : 'application';
          return field + ': ' + (issue.message || 'invalid value');
        }).join('\\n');
        throw new Error(detailText ? (payload.error || 'Validation failed') + '\\n' + detailText : (payload.error || payload.message || 'Application submission failed.'));`
    );
    if (!source.includes('document.querySelector(`\[name="ref${i}Name"\]`)') && source.includes('function refs(){')) {
      // The current first-class DOO page must use selector lookup for dynamically generated reference fields.
      source = source.replace(/function refs\(\)\{[^\n]*\}/, `function refs(){return [1,2].map(i=>({name:document.querySelector(\`[name="ref\${i}Name"]\`)?.value||'',relationship:document.querySelector(\`[name="ref\${i}Relationship"]\`)?.value||'',phone:document.querySelector(\`[name="ref\${i}Phone"]\`)?.value||'',email:document.querySelector(\`[name="ref\${i}Email"]\`)?.value||''}));}`);
    }
  }

  if (source !== original) await writeFile(target, source, 'utf8');
}

console.log('Careers application pages use the canonical Railway API and the Director of Operations application has hardened validation and reference collection.');
