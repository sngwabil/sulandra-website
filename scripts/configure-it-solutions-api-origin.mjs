import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'it-solutions.html');
const bridgeTarget = path.join(root, 'assets', 'sulandra-codebase-api-bridge.js');
const productionApi = 'https://sulandra-website-production-5fc4.up.railway.app';
const configuredApi = String(process.env.VITE_API_URL || productionApi).trim().replace(/\/$/, '');

const source = await readFile(target, 'utf8');
const marker = `const API='${productionApi}';`;
const configuredMarker = `const API='${configuredApi}';`;
let next = source;

if (configuredApi !== productionApi) {
  if (!source.includes(marker) && !source.includes(configuredMarker)) {
    throw new Error('IT Solutions API origin marker changed; refusing an unsafe rewrite.');
  }
  next = source.replace(marker, configuredMarker);
}

if (!next.includes(configuredMarker)) {
  throw new Error(`IT Solutions does not reference the configured API origin ${configuredApi}`);
}
if (next !== source) await writeFile(target, next, 'utf8');

const bridgeSource = await readFile(bridgeTarget, 'utf8');
const bridgeMarker = `const API_ORIGIN='${productionApi}';`;
const configuredBridgeMarker = `const API_ORIGIN='${configuredApi}';`;
let bridgeNext = bridgeSource;
if (configuredApi !== productionApi) {
  if (!bridgeSource.includes(bridgeMarker) && !bridgeSource.includes(configuredBridgeMarker)) {
    throw new Error('Sulandra Codebase API bridge origin marker changed; refusing an unsafe rewrite.');
  }
  bridgeNext = bridgeSource.replace(bridgeMarker, configuredBridgeMarker);
}
if (!bridgeNext.includes(configuredBridgeMarker)) {
  throw new Error(`Sulandra Codebase API bridge does not reference the configured API origin ${configuredApi}`);
}
if (bridgeNext !== bridgeSource) await writeFile(bridgeTarget, bridgeNext, 'utf8');

console.log(`IT Solutions and Codebase API origins configured for ${configuredApi}.`);
