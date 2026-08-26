import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const importLine = "import { registerSIARoutes } from './sia-routes.js';";
const registerLine = 'registerSIARoutes({ app, prisma, authOf, requireRoles });';
const careersImport = "import { registerCareersRoutes } from './careers-routes.js';";
const careersRegister = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';

let source = await readFile(target, 'utf8');
if (!source.includes(importLine)) {
  if (!source.includes(careersImport)) throw new Error('Unable to locate Careers import anchor for SIA routes');
  source = source.replace(careersImport, `${careersImport}\n${importLine}`);
}
source = source.replace(new RegExp(`\\n?${registerLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'g'), '\n');
if (!source.includes(careersRegister)) throw new Error('Unable to locate Careers registration anchor for SIA routes');
source = source.replace(careersRegister, `${registerLine}\n\n${careersRegister}`);
await writeFile(target, source, 'utf8');

// SIA's canonical Sulandra application map is source-controlled directly in
// api/src/sia-routes.ts. Do not mutate the assistant instructions at build time;
// verify the contract instead so route grounding cannot drift silently.
await import('./verify-sia-system-map.mjs');
console.log('SIA authenticated IT-assistant routes are registered and canonical route grounding is verified.');
