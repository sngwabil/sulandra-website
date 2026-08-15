import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bootstrapPath = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
let source = await readFile(bootstrapPath, 'utf8');

const importLine = "import { registerOwnerAuthorityRoutes } from './owner-authority-routes.js';";
if (!source.includes(importLine)) {
  const anchor = "import { getUserEntityContext, registerMultiCompanyRoutes } from './multi-company-routes.js';";
  if (!source.includes(anchor)) throw new Error('Owner authority installer could not find the multi-company import anchor.');
  source = source.replace(anchor, `${anchor}\n${importLine}`);
}

const registrationLine = 'registerOwnerAuthorityRoutes({ app, prisma, authOf });';
if (!source.includes(registrationLine)) {
  const anchor = 'registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });';
  if (!source.includes(anchor)) throw new Error('Owner authority installer could not find the multi-company registration anchor.');
  source = source.replace(anchor, `${registrationLine}\n${anchor}`);
}

await writeFile(bootstrapPath, source, 'utf8');
console.log('Owner authority and internal leadership profile routes are registered.');
