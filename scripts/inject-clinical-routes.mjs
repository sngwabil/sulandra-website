import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const target = path.join(repositoryRoot, 'api', 'dist', 'onboarding-bootstrap.js');
let source = await readFile(target, 'utf8');

const importMarker = "import { registerCareersRoutes } from './careers-routes.js';";
const callMarker = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const imports = [
  "import { registerClinicalRoutes } from './clinical-routes.js';",
  "import { registerOfferProgressRoute } from './offer-progress-route.js';",
  "import { registerOfferSendRoute } from './offer-send-route.js';",
  "import { registerProfessionalOfferFormsRoute } from './professional-offer-forms-route.js';",
  "import { registerOfferOnboardingRoutes } from './offer-onboarding-routes.js';",
];
const calls = [
  'registerClinicalRoutes(app, prisma, { authOf });',
  'registerOfferProgressRoute(app, prisma, { authOf, requireRoles });',
  'registerOfferSendRoute(app, prisma, { authOf, requireRoles, audit });',
  'registerProfessionalOfferFormsRoute(app, prisma);',
  'registerOfferOnboardingRoutes(app, prisma, { authOf, requireRoles, audit });',
];

if (!source.includes(importMarker) || !source.includes(callMarker)) {
  throw new Error(`Route injection markers not found in ${target}`);
}
for (const statement of imports) {
  if (!source.includes(statement)) source = source.replace(importMarker, `${importMarker}\n${statement}`);
}
for (const statement of calls) {
  if (!source.includes(statement)) source = source.replace(callMarker, `${statement}\n${callMarker}`);
}

await writeFile(target, source, 'utf8');
console.log(`Registered clinical, offer, and structured onboarding form routes in ${target}.`);
