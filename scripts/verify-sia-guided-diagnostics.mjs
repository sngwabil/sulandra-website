import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routes = await readFile(path.join(root, 'api', 'src', 'sia-routes.ts'), 'utf8');
const diagnostics = await readFile(path.join(root, 'api', 'src', 'sia-live-diagnostics.ts'), 'utf8');

for (const marker of [
  "from './sia-live-diagnostics.js'",
  'supportWorkspacePage: z.string()',
  'GUIDED_AFFECTED_PAGE_CLARIFICATION',
  'siaNeedsAffectedPageClarification',
  'collectSiaLiveDiagnostics',
  'serializeSiaLiveDiagnostics',
  'supportWorkspacePage (and legacy field page) identifies',
  'allowRailwayManagement: adminAccessFor(auth)',
  'serverGitHubReleaseEvidence',
  'serverRailwayRuntimeEvidence',
]) {
  if (!routes.includes(marker)) throw new Error(`SIA guided-diagnostics route contract missing marker: ${marker}`);
}

for (const marker of [
  'Which Sulandra page is stuck, blank, black, or still loading?',
  'detectSiaDiagnosticTarget',
  'isPageLoadingIntent',
  'https://api.github.com/repos/',
  '/actions/runs?branch=',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_SERVICE_ID',
  'RAILWAY_ENVIRONMENT_ID',
  'SIA_RAILWAY_TOKEN',
  'Project-Access-Token',
  'https://backboard.railway.com/graphql/v2',
  'query deployments($input: DeploymentListInput!)',
  'query deploymentLogs($deploymentId: String!, $limit: Int)',
  'managementApiConnected',
  'managementReadAuthorized',
  'logHighlights',
  'redactInfraLine',
  'serverRailwayBackedApiHealth',
  'serverStaticPageProbe',
  'serverGitHubReleaseEvidence',
]) {
  if (!diagnostics.includes(marker)) throw new Error(`SIA live-diagnostics module missing marker: ${marker}`);
}

if (/supportWorkspacePage[^\n]+affected/i.test(routes)) {
  throw new Error('SIA must not treat the support workspace page as the affected application.');
}

console.log('SIA guided diagnostics verified: affected-page clarification, screenshot-aware flow, GitHub release/CI reads, Railway-backed service health, and Admin-gated read-only Railway deployment/log diagnostics are wired.');
