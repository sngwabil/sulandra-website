import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const target = path.join(repositoryRoot, 'api', 'dist', 'onboarding-bootstrap.js');

let source = await readFile(target, 'utf8');

const imports = [
  "import { registerSpireEpicReferenceParityRoutes } from './spire-epic-reference-parity-routes.js';",
  "import { registerSpireSmartPhraseParityRoutes } from './spire-smartphrase-parity-routes.js';",
];
const calls = [
  'registerSpireEpicReferenceParityRoutes(app, prisma, { authOf });',
  'registerSpireSmartPhraseParityRoutes(app, prisma, { authOf });',
];

const importMarker =
  "import { registerSpireWorkspaceCompletionRoutes } from './spire-workspace-completion-routes.js';";
const callMarker =
  'registerSpireWorkspaceCompletionRoutes(app, prisma, { authOf, audit });';

if (!source.includes(importMarker) || !source.includes(callMarker)) {
  throw new Error(`SPIRE reference parity injection markers were not found in ${target}`);
}

for (const statement of imports) {
  if (!source.includes(statement)) {
    source = source.replace(importMarker, `${importMarker}\n${statement}`);
  }
}
for (const statement of calls) {
  if (!source.includes(statement)) {
    source = source.replace(callMarker, `${callMarker}\n${statement}`);
  }
}

await writeFile(target, source, 'utf8');
console.log(`Registered SPIRE Epic-reference parity routes in ${target}.`);
