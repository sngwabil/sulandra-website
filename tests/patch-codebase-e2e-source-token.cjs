const fs = require('node:fs');
const file = '/e2e/codebase-railway-e2e-safe.mjs';
let source = fs.readFileSync(file, 'utf8');

const passwordLine = "const FEATURE_PASSWORD = process.env.E2E_FEATURE_ADMIN_PASSWORD || '';";
if (!source.includes(passwordLine)) throw new Error('Feature password marker is missing from E2E runner');
source = source.replace(passwordLine, "const SOURCE_MARKER = 'codebase-source-canary-v1';");

const loginPattern = /async function featureLoginToken\(\) \{[\s\S]*?\n\}\nasync function terminalOutput/;
if (!loginPattern.test(source)) throw new Error('Feature login helper marker is missing from E2E runner');
source = source.replace(loginPattern, "async function featureLoginToken() { return SOURCE_MARKER; }\nasync function terminalOutput");

const requireLine = "requireEnv(FEATURE_PASSWORD, 'E2E_FEATURE_ADMIN_PASSWORD');";
if (!source.includes(requireLine)) throw new Error('Feature password requirement marker is missing from E2E runner');
source = source.replace(requireLine, '');
source = source.replace(
  "[E2E INFO] Feature Codebase API authenticated without exposing credentials",
  "[E2E INFO] Feature Codebase source module canary marker enabled",
);

const productionOnlyRoute = "  await context.route(`${API}/**`, async (route) => {";
if (!source.includes(productionOnlyRoute)) throw new Error('Production-only API proxy route marker is missing from E2E runner');
source = source.replace(
  productionOnlyRoute,
  "  await context.route(/^https:\\/\\/[^/]+\\/api\\/.*/, async (route) => {",
);

const bearerHeader = "headers: { ...request.headers(), authorization: `Bearer ${featureToken}` },";
if (!source.includes(bearerHeader)) throw new Error('Feature bearer forwarding marker is missing from E2E runner');
source = source.replace(
  bearerHeader,
  "headers: { ...request.headers(), 'x-sulandra-e2e-source': featureToken },",
);

const headersMarker = "    const headers = { ...upstream.headers() };";
if (!source.includes(headersMarker)) throw new Error('Proxy response headers marker is missing from E2E runner');
source = source.replace(
  headersMarker,
  "    if (codebaseRequest) console.log('[E2E CODEBASE SOURCE] ' + request.method() + ' ' + parsed.pathname + ' -> ' + upstream.status());\n" + headersMarker,
);

fs.writeFileSync(file, source, 'utf8');
