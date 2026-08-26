import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profile=await readFile(path.join(root,'api','src','sia-copilot-profile.ts'),'utf8');
const routes=await readFile(path.join(root,'api','src','sia-routes.ts'),'utf8');
const bootstrap=await readFile(path.join(root,'api','src','onboarding-bootstrap.ts'),'utf8');

for(const marker of [
  'SIAEmployeeProfile','/api/sia/profile','/api/sia/profile/context','ensureSIACopilotProfile','serializeSIACopilotProfile',
  'rememberRecentApps','proactiveHints','responseStyle','identitySnapshot','recentContext',
])if(!profile.includes(marker))throw new Error(`SIA copilot profile module missing ${marker}`);

for(const marker of [
  "import { ensureSIACopilotProfile, serializeSIACopilotProfile } from './sia-copilot-profile.js';",
  'const copilotProfile = await ensureSIACopilotProfile',
  'serializeSIACopilotProfile(copilotProfile)',
  'serverConfirmedSIACopilotProfile',
])if(!routes.includes(marker))throw new Error(`SIA chat is not grounded on employee copilot profiles: missing ${marker}`);

for(const marker of [
  "import { registerSIACopilotProfileRoutes } from './sia-copilot-profile.js';",
  'registerSIACopilotProfileRoutes({ app, prisma, authOf, requireRoles });',
])if(!bootstrap.includes(marker))throw new Error(`SIA copilot profile routes are not registered: missing ${marker}`);

console.log('SIA per-employee copilot profile verified: server identity, preferences, recent non-sensitive application context, and chat grounding are persistent and employee-scoped.');
