import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const target = path.join(repositoryRoot, 'api', 'dist', 'onboarding-bootstrap.js');

let source = await readFile(target, 'utf8');

const importMarker =
  "import { registerSpireWorkspaceCompletionRoutes } from './spire-workspace-completion-routes.js';";
const callMarker =
  'registerSpireWorkspaceCompletionRoutes(app, prisma, { authOf, audit });';
const foundationCallMarker =
  'registerSpireFoundationRoutes(app, prisma, { authOf });';

if (!source.includes(importMarker) || !source.includes(callMarker) || !source.includes(foundationCallMarker)) {
  throw new Error(`SPIRE parity injection markers were not found in ${target}`);
}

const desiredImports = [
  "import { registerSpireAcuteCareParityRoutes } from './spire-acute-care-parity-routes.js';",
  "import { registerSpireSpecialtyCareParityRoutes } from './spire-specialty-care-parity-routes.js';",
  "import { registerSpirePatientEngagementParityRoutes } from './spire-patient-engagement-parity-routes.js';",
  "import { registerSpireBreakGlassGuard, registerSpireEnterpriseParityRoutes } from './spire-enterprise-parity-routes.js';",
  "import { registerSpireEpicReferenceParityRoutes } from './spire-epic-reference-parity-routes.js';",
  "import { registerSpireSpeedButtonParityRoutes } from './spire-speed-button-parity-routes.js';",
  "import { registerSpireSmartPhraseParityRoutes } from './spire-smartphrase-parity-routes.js';",
  "import { registerSpireSmartTextParityRoutes } from './spire-smarttext-parity-routes.js';",
];
const desiredCalls = [
  // The exact speed-buttons path must remain before /smartphrases/:smartPhraseId.
  'registerSpireSpeedButtonParityRoutes(app, prisma, { authOf });',
  'registerSpireSmartPhraseParityRoutes(app, prisma, { authOf });',
  'registerSpireSmartTextParityRoutes(app, prisma, { authOf });',
  'registerSpireAcuteCareParityRoutes(app, prisma, { authOf });',
  'registerSpireSpecialtyCareParityRoutes(app, prisma, { authOf });',
  'registerSpirePatientEngagementParityRoutes(app, prisma, { authOf });',
  'registerSpireEnterpriseParityRoutes(app, prisma, { authOf });',
  'registerSpireEpicReferenceParityRoutes(app, prisma, { authOf });',
];

// Replacing the same marker prepends each statement. Iterate in reverse so the
// generated Express registration order remains exactly the desired order above.
for (const statement of [...desiredImports].reverse()) {
  if (!source.includes(statement)) {
    source = source.replace(importMarker, `${importMarker}\n${statement}`);
  }
}

// Emergency-access/privacy enforcement must execute before the legacy chart routes.
const guardCall = 'registerSpireBreakGlassGuard(app, prisma, { authOf });';
if (!source.includes(guardCall)) {
  source = source.replace(foundationCallMarker, `${guardCall}\n${foundationCallMarker}`);
}

for (const statement of [...desiredCalls].reverse()) {
  if (!source.includes(statement)) {
    source = source.replace(callMarker, `${callMarker}\n${statement}`);
  }
}

await writeFile(target, source, 'utf8');
console.log(`Registered SPIRE Epic/enterprise parity routes and emergency-access guard in ${target}.`);
