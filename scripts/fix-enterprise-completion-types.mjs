import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');

async function repair(relativePath, transform, label) {
  const filePath = path.join(root, relativePath);
  const before = await readFile(filePath, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await writeFile(filePath, after, 'utf8');
    console.log(`${label} repaired.`);
  } else {
    console.log(`${label} is already build-safe.`);
  }
}

await repair(
  'api/src/company-compliance-evidence-routes.ts',
  (source) => source.replace(
    /const cols=await columns\(prisma,table\),args:unknown\[\]=\[documentId\],where=/,
    'const cols=await columns(prisma,table),args:unknown[]=[documentId];let where='
  ),
  'Company compliance evidence query typing'
);

await repair(
  'api/src/workforce-advanced-routes.ts',
  (source) => source.replace(
    /const map=new Map\(punches\.map\(p=>\[String\(p\.id\),\{\.\.\.p,effectiveSource:'ORIGINAL'\}\]\)\);/,
    "const map=new Map<string,Record<string,unknown>>(punches.map(p=>[String(p.id),{...p,effectiveSource:'ORIGINAL'}] as [string,Record<string,unknown>]));"
  ),
  'Workforce effective punch timeline typing'
);
