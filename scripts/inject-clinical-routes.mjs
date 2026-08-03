import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const target = path.join(repositoryRoot, 'api', 'dist', 'onboarding-bootstrap.js');
let source = await readFile(target, 'utf8');

const importMarker = "import { registerCareersRoutes } from './careers-routes.js';";
const callMarker = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const clinicalImport = "import { registerClinicalRoutes } from './clinical-routes.js';";
const clinicalCall = 'registerClinicalRoutes(app, prisma, { authOf });';
const offerProgressImport = "import { registerOfferProgressRoute } from './offer-progress-route.js';";
const offerProgressCall = 'registerOfferProgressRoute(app, prisma, { authOf, requireRoles });';
const offerSendImport = "import { registerOfferSendRoute } from './offer-send-route.js';";
const offerSendCall = 'registerOfferSendRoute(app, prisma, { authOf, requireRoles, audit });';
const offerOnboardingImport = "import { registerOfferOnboardingRoutes } from './offer-onboarding-routes.js';";
const offerOnboardingCall = 'registerOfferOnboardingRoutes(app, prisma, { authOf, requireRoles, audit });';

if (!source.includes(importMarker)) {
  throw new Error(`Route injection failed: import marker not found in ${target}`);
}
if (!source.includes(callMarker)) {
  throw new Error(`Route injection failed: registration marker not found in ${target}`);
}

if (!source.includes(clinicalImport)) {
  source = source.replace(importMarker, `${importMarker}\n${clinicalImport}`);
}
if (!source.includes(offerProgressImport)) {
  source = source.replace(clinicalImport, `${clinicalImport}\n${offerProgressImport}`);
}
if (!source.includes(offerSendImport)) {
  source = source.replace(offerProgressImport, `${offerProgressImport}\n${offerSendImport}`);
}
if (!source.includes(offerOnboardingImport)) {
  source = source.replace(offerSendImport, `${offerSendImport}\n${offerOnboardingImport}`);
}
if (!source.includes(clinicalCall)) {
  source = source.replace(callMarker, `${clinicalCall}\n${callMarker}`);
}
if (!source.includes(offerProgressCall)) {
  source = source.replace(callMarker, `${offerProgressCall}\n${callMarker}`);
}
if (!source.includes(offerSendCall)) {
  source = source.replace(callMarker, `${offerSendCall}\n${callMarker}`);
}
if (!source.includes(offerOnboardingCall)) {
  source = source.replace(callMarker, `${offerOnboardingCall}\n${callMarker}`);
}

await writeFile(target, source, 'utf8');
console.log(`Registered Spire clinical, offer-progress, responsive offer-send, and employment-offer routes in ${target}.`);
