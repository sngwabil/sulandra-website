import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  path.join(root, 'assets', 'sulandra-codebase.js'),
  path.join(root, 'dist-web', 'assets', 'sulandra-codebase.js'),
];
const before = "if(edit)edit.textContent=editMode?'View':'Edit';";
const after = "if(edit){edit.textContent=editMode?'View':'Edit';edit.disabled=!activePath}";
let touched = 0;
let verified = 0;

for (const file of candidates) {
  try { await access(file); } catch { continue; }
  let source = await readFile(file, 'utf8');
  if (source.includes(after)) {
    verified += 1;
    continue;
  }
  if (!source.includes(before)) {
    throw new Error(`Sulandra Codebase editor-state contract changed in ${path.relative(root, file)}`);
  }
  source = source.replace(before, after);
  await writeFile(file, source, 'utf8');
  touched += 1;
  verified += 1;
}

if (!verified) throw new Error('Sulandra Codebase runtime was not found for editor-state repair');
console.log(`Sulandra Codebase editor state verified: Edit is enabled whenever a safe file is active (${touched} repaired, ${verified} checked).`);
