import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Transitional verifier normalization: verify-platform-integration predates the
// canonical authenticated SPIRE shell. Keep all of its platform checks intact and
// replace only its obsolete SPIRE architecture section before it executes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'scripts', 'verify-platform-integration.mjs');
const marker = 'SPIRE_PLATFORM_LOGIN_CLIENT_STATION_CONTRACT_V1';
let source = await readFile(target, 'utf8');

if (!source.includes(marker)) {
  const sectionStart = source.indexOf(' * SPIRE standalone architecture');
  const nextSection = source.indexOf(' * SPIRE Administration', sectionStart);
  if (sectionStart < 0 || nextSection < 0) throw new Error('Platform verifier SPIRE section boundary was not found');

  const blockStart = source.lastIndexOf('/*', sectionStart);
  const blockEnd = source.lastIndexOf('/*', nextSection);
  if (blockStart < 0 || blockEnd <= blockStart) throw new Error('Platform verifier SPIRE replacement boundary is invalid');

  const replacement = `/*\n * --------------------------------------------------------------------------\n * SPIRE authenticated Client Station architecture\n * ${marker}\n * --------------------------------------------------------------------------\n */\n\ntry {\n  const [spireEntry, spireLogin, spireStation, spireMaster] = await Promise.all([\n    readFile(path.join(dist, 'spire.html'), 'utf8'),\n    readFile(path.join(dist, 'spire', 'login.html'), 'utf8'),\n    readFile(path.join(dist, 'spire', 'client-station.html'), 'utf8'),\n    readFile(path.join(dist, 'spire', 'master.html'), 'utf8'),\n  ]);\n\n  for (const marker of ['SPIRE_CANONICAL_LOGIN_ENTRY_V3', '/spire/login.html', 'window.location.search', 'window.location.hash']) {\n    if (!spireEntry.includes(marker)) failures.push(\`Canonical SPIRE login entry missing \${marker}\`);\n  }\n  if (spireEntry.includes('/spire/portal.html') || spireEntry.includes('spire-app-v2.js')) {\n    failures.push('Canonical SPIRE entry still exposes a retired gateway/runtime');\n  }\n\n  for (const marker of ['SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1', 'spireWorkspaceFrame', '/assets/spire-login.js?v=20260813-exact-workflow-1']) {\n    if (!spireLogin.includes(marker)) failures.push(\`SPIRE authentication shell missing \${marker}\`);\n  }\n\n  for (const marker of ['SPIRE_CLIENT_STATION_LISTS_V2', 'Client Station', 'Client Lists', 'Available Homes']) {\n    if (!spireStation.includes(marker)) failures.push(\`SPIRE Client Station missing \${marker}\`);\n  }\n  if (spireStation.includes('Patient Lists') || spireStation.includes('>Patient Station<')) {\n    failures.push('SPIRE Client Station exposes retired Patient Station terminology');\n  }\n\n  if (!/<html[\\s>]/i.test(spireMaster) || !/<head[\\s>]/i.test(spireMaster) || !/<body[\\s>]/i.test(spireMaster) || !/<\\/html>/i.test(spireMaster)) {\n    failures.push('Standalone /spire/master.html is not a complete chart application');\n  }\n  if (spireMaster.includes('S.P.I.R.E. Employee Access') || spiresDemo(spireMaster)) {\n    failures.push('SPIRE master contains demo fallback behavior');\n  }\n  for (const fake of [\"alert('Opening Staff Messaging Portal...')\", \"alert('Notifications: 3 unread reminders for current client.')\"]) {\n    if (spireMaster.includes(fake)) failures.push(\`SPIRE master still contains fake clinical control behavior: \${fake}\`);\n  }\n} catch (error) {\n  failures.push(\`SPIRE authenticated Client Station verification could not complete: \${error instanceof Error ? error.message : error}\`);\n}\n\n`;

  source = source.slice(0, blockStart) + replacement + source.slice(blockEnd);
  await writeFile(target, source, 'utf8');
}

source = await readFile(target, 'utf8');
if (!source.includes(marker) || source.includes("'Canonical /spire.html does not route to /spire/master.html'")) {
  throw new Error('Platform verifier still enforces the retired direct-to-master SPIRE entry');
}

console.log('Platform integration verifier normalized for SPIRE login/SSO → Client Station → explicit client chart.');
