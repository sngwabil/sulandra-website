import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'src', 'onboarding-bootstrap.ts');
const siaRoutesTarget = path.join(root, 'api', 'src', 'sia-routes.ts');
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

// Ground SIA on an explicit, source-controlled map of Sulandra applications.
// This prevents the model from treating the SIA workspace as an Admin sign-in
// page or inventing product routes when a user asks for navigation help.
let siaRoutes = await readFile(siaRoutesTarget, 'utf8');
const mapImport = "import { SULANDRA_CANONICAL_SYSTEM_MAP } from './sia-system-map.js';";
const zodImport = "import { z } from 'zod';";
if (!siaRoutes.includes(mapImport)) {
  if (!siaRoutes.includes(zodImport)) throw new Error('Unable to locate zod import anchor for SIA system map');
  siaRoutes = siaRoutes.replace(zodImport, `${zodImport}\n${mapImport}`);
}

const routeMapAnchor = '- user role: ${roleLabel(auth.role)}\\n\\nSecurity and operating rules:';
const routeMapInsertion = '- user role: ${roleLabel(auth.role)}\\n\\n${SULANDRA_CANONICAL_SYSTEM_MAP}\\nSecurity and operating rules:';
if (!siaRoutes.includes('${SULANDRA_CANONICAL_SYSTEM_MAP}')) {
  if (!siaRoutes.includes(routeMapAnchor)) throw new Error('Unable to locate SIA instruction anchor for canonical route map');
  siaRoutes = siaRoutes.replace(routeMapAnchor, routeMapInsertion);
}

const disambiguationAnchor = '10. If an issue should become a ticket, tell the user to use SIA\'s Create IT Ticket action so the case is recorded and auditable.';
const disambiguationRule = `10. If an issue should become a ticket, tell the user to use SIA's Create IT Ticket action so the case is recorded and auditable.\n11. Resolve Sulandra navigation questions against the canonical application map above before troubleshooting. If the user says "admin sign in", "administrator sign in", "admin login", or "administrator login", treat it as Administrator sign-in at /admin-login.html. Never call /sia.html an Admin sign-in page.\n12. When a canonical route is known, lead with that route before generic browser troubleshooting. Do not ask the user to clear cache, use incognito mode, disable extensions, or check device time unless their actual symptom suggests a browser/session problem.`;
if (!siaRoutes.includes('Resolve Sulandra navigation questions against the canonical application map above')) {
  if (!siaRoutes.includes(disambiguationAnchor)) throw new Error('Unable to locate SIA security-rule anchor for route disambiguation');
  siaRoutes = siaRoutes.replace(disambiguationAnchor, disambiguationRule);
}

await writeFile(siaRoutesTarget, siaRoutes, 'utf8');
await import('./verify-sia-system-map.mjs');
console.log('SIA authenticated IT-assistant routes are registered and grounded on the canonical Sulandra application map.');
