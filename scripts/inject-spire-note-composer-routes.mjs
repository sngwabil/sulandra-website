import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'api', 'dist', 'onboarding-bootstrap.js');
let source = await readFile(target, 'utf8');

const importMarker = "import { registerCareersRoutes } from './careers-routes.js';";
const callMarker = 'registerCareersRoutes(app, prisma, { authOf, requireRoles, audit });';
const routeImport = "import { registerSpireNoteComposerRoutes } from './spire-note-composer-routes.js';";
const routeCall = 'registerSpireNoteComposerRoutes(app, prisma, { authOf });';

if (!source.includes(importMarker) || !source.includes(callMarker)) {
  throw new Error('SPIRE note composer route injection markers were not found');
}
if (!source.includes(routeImport)) source = source.replace(importMarker, `${importMarker}\n${routeImport}`);
if (!source.includes(routeCall)) source = source.replace(callMarker, `${routeCall}\n${callMarker}`);

if (!source.includes(routeImport) || !source.includes(routeCall)) {
  throw new Error('SPIRE note composer routes were not registered');
}
await writeFile(target, source, 'utf8');
console.log('Registered SPIRE provenance-aware note composer routes.');
