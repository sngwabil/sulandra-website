import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const careersPath = path.join(root, 'api/src/careers-routes.ts');
let source = await readFile(careersPath, 'utf8');

const oldBlock = `function applicationPathForOpening(row: any) {\n  if (row.applicationPath) return row.applicationPath;\n  const role = roleForOpening(row.title, row.department);\n  if (role === 'DSP') return \`/applydsp.html?opening=\${encodeURIComponent(row.slug)}\`;\n  if (role === 'LPN' || role === 'RN' || role === 'DELEGATING_NURSE') {\n    return \`/applylpn.html?opening=\${encodeURIComponent(row.slug)}&role=\${role}\`;\n  }\n  if (role === 'DRIVER') return \`/applydriver.html?opening=\${encodeURIComponent(row.slug)}\`;\n  if (role === 'COO') return \`/applycoo.html?opening=\${encodeURIComponent(row.slug)}\`;\n  return \`/applygeneral.html?opening=\${encodeURIComponent(row.slug)}\`;\n}`;

const newBlock = `function applicationPathForOpening(row: any) {\n  const role = roleForOpening(row.title, row.department);\n  // RN openings always use the dedicated RN application, including older openings\n  // that may still have a legacy applylpn.html applicationPath stored in the database.\n  if (role === 'RN') return \`/applyrn.html?opening=\${encodeURIComponent(row.slug)}&role=RN\`;\n  if (row.applicationPath) return row.applicationPath;\n  if (role === 'DSP') return \`/applydsp.html?opening=\${encodeURIComponent(row.slug)}\`;\n  if (role === 'LPN' || role === 'DELEGATING_NURSE') {\n    return \`/applylpn.html?opening=\${encodeURIComponent(row.slug)}&role=\${role}\`;\n  }\n  if (role === 'DRIVER') return \`/applydriver.html?opening=\${encodeURIComponent(row.slug)}\`;\n  if (role === 'COO') return \`/applycoo.html?opening=\${encodeURIComponent(row.slug)}\`;\n  return \`/applygeneral.html?opening=\${encodeURIComponent(row.slug)}\`;\n}`;

if (!source.includes('/applyrn.html?opening=')) {
  if (!source.includes(oldBlock)) throw new Error('Unable to locate Careers nursing application routing block');
  source = source.replace(oldBlock, newBlock);
  await writeFile(careersPath, source, 'utf8');
}

console.log('RN openings route to /applyrn.html; LPN and Delegating Nurse retain the maintained nursing workflow.');
