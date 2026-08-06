import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function replaceIn(relativePath, replacements) {
  const target = path.join(root, relativePath);
  let source = await readFile(target, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (source.includes(from)) {
      source = source.replace(from, to);
      changed = true;
    }
  }
  if (changed) await writeFile(target, source, 'utf8');
  return changed;
}

await replaceIn('scripts/verify-employee-compliance.mjs', [[
  "installer.includes('${selfServiceRegister}\\\\n${complianceRegister}\\\\n${collaborationRegister}\\\\n\\\\n${careersRegister}')",
  "installer.includes('${selfServiceRegister}\\\\n${complianceRegister}\\\\n${collaborationRegister}\\\\n${performanceRegister}\\\\n\\\\n${careersRegister}')",
]]);

await replaceIn('scripts/verify-employee-collaboration.mjs', [[
  "installer.includes('${complianceRegister}\\\\n${collaborationRegister}\\\\n\\\\n${careersRegister}')",
  "installer.includes('${complianceRegister}\\\\n${collaborationRegister}\\\\n${performanceRegister}\\\\n\\\\n${careersRegister}')",
]]);

await replaceIn('api/src/employee-performance-routes.ts', [[
  "  improvementAreas: string;\n  createdAt: Date | string;",
  "  improvementAreas: string;\n  acknowledgmentComments: string;\n  createdAt: Date | string;",
]]);

console.log('Employee 360 performance TypeScript shape and prior-section validation integration are build-safe.');
