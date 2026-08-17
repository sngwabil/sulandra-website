import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetPath = path.join(root, 'assets', 'spire-locked-app-session-v6.js');
const marker = 'SPIRE_LOCKED_APP_SESSION_V6';
const version = '20260817-locked-app-session-v6-2';
const src = '/assets/spire-locked-app-session-v6.js';
const tag = `<script src="${src}?v=${version}" data-spire-locked-app-session="${marker}"></script>`;
const targets = [
  'spire/client-station.html',
  'spire/master.html',
  'spire/secure-chat.html',
  'spire/flowsheets.html',
];

await access(assetPath);
const runtime = await readFile(assetPath, 'utf8');
for (const required of [
  marker,
  'spire:locked-app-session',
  'spire:return-to-portal-url',
  'spireReturnPortal',
  'Return to Portal',
  'requestFullscreen',
  'data-spire-locked-app',
  'data-spire-shell-child',
  '.client-table tbody td:last-child',
  '#stationLogout',
]) {
  if (!runtime.includes(required)) throw new Error(`Spire locked app v6 runtime missing ${required}`);
}
const syntax = spawnSync(process.execPath, ['--check', assetPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`Spire locked app v6 syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

for (const relative of targets) {
  const filePath = path.join(root, relative);
  await access(filePath);
  let html = await readFile(filePath, 'utf8');
  if (!html.includes('</body>')) throw new Error(`${relative} has no body close for locked app publication`);

  html = html.replace(/\s*<script src="\/assets\/spire-locked-app-session-v6\.js(?:\?v=[^"]+)?"[^>]*><\/script>\s*/g, '\n');

  if (relative === 'spire/client-station.html') {
    const stationScript = /<script src="\/assets\/spire-client-station\.js(?:\?v=[^"]+)?"><\/script>/;
    if (!stationScript.test(html)) throw new Error('Client Station locked app v6 could not find canonical Client Station runtime');
    html = html.replace(stationScript, (match) => `${tag}\n  ${match}`);
    html = html.replace('<title>S.P.I.R.E. Client Station | Sulandra Health</title>', '<title>Spire Client Station | Sulandra Health</title>');
  } else {
    html = html.replace('</body>', `  ${tag}\n</body>`);
  }

  await writeFile(filePath, html, 'utf8');
  const verified = await readFile(filePath, 'utf8');
  if (!verified.includes(`${src}?v=${version}`) || !verified.includes(marker)) {
    throw new Error(`Spire locked app v6 was not published to ${relative}`);
  }
  if (relative === 'spire/client-station.html') {
    const lockedAt = verified.indexOf(src);
    const stationAt = verified.indexOf('/assets/spire-client-station.js');
    if (lockedAt < 0 || stationAt < 0 || lockedAt > stationAt) {
      throw new Error('Spire locked app v6 must load before Client Station runtime so portal origin survives URL normalization');
    }
  }
}

console.log('Spire locked app session v6 published: Client Station owns the one fullscreen entry control, embedded chart/chat workspaces hide duplicate fullscreen controls, Authorized remains green, and Return to Portal is preserved.');
