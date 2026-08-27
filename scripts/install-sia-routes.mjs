import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const siaRoutesTarget = path.join(root, 'api', 'src', 'sia-routes.ts');
const importLine = "import { registerSIARoutes } from './sia-routes.js';";
const profileImportLine = "import { registerSIACopilotProfileRoutes } from './sia-copilot-profile.js';";
const registerLine = 'registerSIARoutes({ app, prisma, authOf, requireRoles });';
const profileRegisterLine = 'registerSIACopilotProfileRoutes({ app, prisma, authOf, requireRoles });';
const careersImport = "import { registerCareersRoutes } from './careers-routes.js';";
const careersRegister = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';

let source = await readFile(target, 'utf8');
if (!source.includes(importLine)) {
  if (!source.includes(careersImport)) throw new Error('Unable to locate Careers import anchor for SIA routes');
  source = source.replace(careersImport, `${careersImport}\n${importLine}`);
}
if (!source.includes(profileImportLine)) {
  if (!source.includes(importLine)) throw new Error('Unable to locate SIA route import anchor for SIA copilot profile');
  source = source.replace(importLine, `${importLine}\n${profileImportLine}`);
}
source = source.replaceAll(registerLine, '');
source = source.replaceAll(profileRegisterLine, '');
if (!source.includes(careersRegister)) throw new Error('Unable to locate Careers registration anchor for SIA routes');
source = source.replace(careersRegister, `${profileRegisterLine}\n${registerLine}\n\n${careersRegister}`);
await writeFile(target, source, 'utf8');

const siaRoutes = await readFile(siaRoutesTarget, 'utf8');
for (const marker of [
  "from './sia-mode-router.js'",
  "from './sia-live-diagnostics.js'",
  "from './sia-copilot-profile.js'",
  'classifySiaMode',
  "routing.mode === 'GENERAL'",
  "routing.mode === 'SULANDRA'",
  "routing.mode === 'CLINICAL_SAFE'",
  "requestBody.tools = [{ type: 'web_search'",
  'serverNowUtc',
  'clientLocalDateTime',
  'serverMyWorkOpenCount',
  'CHAT_PRIVACY_BLOCK',
  'BLOCKED_BEFORE_MODEL',
  'url_citation',
  'modeLabel',
]) {
  if (!siaRoutes.includes(marker)) throw new Error(`SIA intelligence route missing required marker: ${marker}`);
}

await import('./verify-sia-system-map.mjs');
await import('./verify-sia-guided-diagnostics.mjs');
await import('./verify-sia-copilot-profile.mjs');
await import('./verify-sia-intelligence-router.mjs');
console.log('SIA routes registered with automatic General, Sulandra, and Clinical-safe routing; time context; privacy preflight; cited General web search; private employee context; and guided diagnostics.');
