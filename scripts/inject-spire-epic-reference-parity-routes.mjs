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

if (!source.includes(importMarker) || !source.includes(callMarker)) {
  throw new Error(`SPIRE reference parity injection markers were not found in ${target}`);
}

const importBlock = [
  "import { registerSpireEpicReferenceParityRoutes } from './spire-epic-reference-parity-routes.js';",
  "import { registerSpireSpeedButtonParityRoutes } from './spire-speed-button-parity-routes.js';",
  "import { registerSpireSmartPhraseParityRoutes } from './spire-smartphrase-parity-routes.js';",
].join('\n');

const callBlock = [
  // Register this exact static path before /smartphrases/:smartPhraseId so Express
  // never interprets "speed-buttons" as a SmartPhrase id.
  'registerSpireSpeedButtonParityRoutes(app, prisma, { authOf });',
  'registerSpireSmartPhraseParityRoutes(app, prisma, { authOf });',
  'registerSpireEpicReferenceParityRoutes(app, prisma, { authOf });',
].join('\n');

if (!source.includes("./spire-epic-reference-parity-routes.js")) {
  source = source.replace(importMarker, `${importMarker}\n${importBlock}`);
}
if (!source.includes('registerSpireSpeedButtonParityRoutes(app, prisma, { authOf });')) {
  source = source.replace(callMarker, `${callMarker}\n${callBlock}`);
}

await writeFile(target, source, 'utf8');
console.log(`Registered SPIRE Epic-reference parity routes in ${target}.`);
