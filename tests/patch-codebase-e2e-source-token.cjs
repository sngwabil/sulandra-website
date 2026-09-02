const fs = require('node:fs');
const file = '/e2e/codebase-railway-e2e-safe.mjs';
let source = fs.readFileSync(file, 'utf8');

const passwordLine = "const FEATURE_PASSWORD = process.env.E2E_FEATURE_ADMIN_PASSWORD || '';";
if (!source.includes(passwordLine)) throw new Error('Feature password marker is missing from E2E runner');
source = source.replace(passwordLine, "const SOURCE_TOKEN = process.env.E2E_SOURCE_TOKEN || '';");

const loginPattern = /async function featureLoginToken\(\) \{[\s\S]*?\n\}\nasync function terminalOutput/;
if (!loginPattern.test(source)) throw new Error('Feature login helper marker is missing from E2E runner');
source = source.replace(loginPattern, "async function featureLoginToken() { return SOURCE_TOKEN; }\nasync function terminalOutput");

const requireLine = "requireEnv(FEATURE_PASSWORD, 'E2E_FEATURE_ADMIN_PASSWORD');";
if (!source.includes(requireLine)) throw new Error('Feature password requirement marker is missing from E2E runner');
source = source.replace(requireLine, "requireEnv(SOURCE_TOKEN, 'E2E_SOURCE_TOKEN');");
source = source.replace(
  "[E2E INFO] Feature Codebase API authenticated without exposing credentials",
  "[E2E INFO] Feature Codebase source module canary authenticated without exposing credentials",
);

fs.writeFileSync(file, source, 'utf8');
