import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'SPIRE_COMPLETE_THEME_SYSTEM_V2';
const assetPath = path.join(root, 'assets', 'spire-epic-theme-suite.js');
const targetFiles = [
  'spire/client-station.html',
  'spire/master.html',
  'spire/secure-chat.html',
  'spire/flowsheets.html',
];
const scriptTag = `<script src="/assets/spire-epic-theme-suite.js?v=20260815-complete-theme-system-2" data-spire-epic-theme-suite="${marker}"></script>`;
const scriptPattern = /\s*<script\s+[^>]*src=["']\/assets\/spire-epic-theme-suite\.js(?:\?[^"']*)?["'][^>]*><\/script>\s*/gi;

await access(assetPath);
const themeRuntime = await readFile(assetPath, 'utf8');
const requiredRuntimeMarkers = [
  marker,
  'SPIRE_COMPLETE_THEME_SURFACE_COVERAGE_V2',
  'SPIRE_THEME_PREVIEW_ICON_V2',
  'Classic Spire Red', 'Clinical Dark Mode', 'Midnight Slate', 'Emerald Healthcare', 'Ocean Blue Executive',
  'Warm Amber Sepia', 'Hyperspace Teal', 'Pure Monochrome', 'Deuteranopia Safe', 'Vibrant Lavender',
  'Crimson Night', 'Arctic Frost', 'Golden Sunrise', 'Cyberpunk Neon Clinical', 'Vintage Chartroom',
  'Industrial Steel Gray', 'Coral Sunset', 'Mint Fresh Healthcare', 'Royal Amethyst', 'Solarized Light Clean',
  'Client Station Classic', 'Dark Clinical Summary',
  'Altitude', 'Lavender', 'Verdant', 'Deep Blue', 'Amethyst', 'Carbon', 'Dark Room', 'High Contrast',
  'enhanceLegacyThemeCards', 'previewMarkup', 'spire:epic-theme-suite:preset'
];
for (const required of requiredRuntimeMarkers) {
  if (!themeRuntime.includes(required)) throw new Error(`SPIRE complete theme runtime missing ${required}`);
}
const syntax = spawnSync(process.execPath, ['--check', assetPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`SPIRE complete theme runtime syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

for (const relative of targetFiles) {
  const filePath = path.join(root, relative);
  let html = await readFile(filePath, 'utf8');
  if (scriptPattern.test(html)) {
    scriptPattern.lastIndex = 0;
    html = html.replace(scriptPattern, `\n  ${scriptTag}\n`);
  } else {
    scriptPattern.lastIndex = 0;
    if (!html.includes('</body>')) throw new Error(`${relative} does not contain </body> for complete theme publication`);
    html = html.replace('</body>', `  ${scriptTag}\n</body>`);
  }
  await writeFile(filePath, html, 'utf8');
  const verified = await readFile(filePath, 'utf8');
  if (!verified.includes('/assets/spire-epic-theme-suite.js?v=20260815-complete-theme-system-2') || !verified.includes(marker)) {
    throw new Error(`SPIRE complete theme system was not published to ${relative}`);
  }
}

console.log('SPIRE complete theme system installed: all 22 existing S.P.I.R.E. themes plus the 8 Epic-style themes now recolor the full workstation and expose miniature preview icons across Client Station, chart, Secure Chat, and Flowsheets.');