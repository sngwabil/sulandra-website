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

const codebaseFetchBlock = `    let upstream;
    try {
      upstream = codebaseRequest
        ? await route.fetch({
            url: FEATURE_API + parsed.pathname + parsed.search,
            headers: { ...request.headers(), authorization: \`Bearer \${featureToken}\` },
          })
        : await route.fetch({ headers: requestHeaders });`;
if (!source.includes(codebaseFetchBlock)) throw new Error('Feature Codebase proxy fetch marker is missing from E2E runner');
source = source.replace(
  codebaseFetchBlock,
  `    let upstream;
    try {
      if (codebaseRequest) {
        const direct = await fetch(FEATURE_API + parsed.pathname + parsed.search, {
          method: request.method(),
          headers: { Accept: 'application/json', 'x-sulandra-e2e-source': featureToken },
        });
        const body = await direct.text();
        console.log('[E2E CODEBASE SOURCE] ' + request.method() + ' ' + parsed.pathname + ' -> ' + direct.status);
        await route.fulfill({
          status: direct.status,
          body,
          headers: {
            'content-type': direct.headers.get('content-type') || 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'access-control-allow-origin': WEB,
            'access-control-allow-credentials': 'true',
            vary: 'Origin',
          },
        });
        return;
      }
      upstream = await route.fetch({ headers: requestHeaders });`,
);

fs.writeFileSync(file, source, 'utf8');
