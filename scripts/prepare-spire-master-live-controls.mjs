import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_MASTER_LIVE_CONTROLS_PREFERENCES_V1';
let html = await readFile(target, 'utf8');

if (!html.includes(marker)) {
  // Remove only the two retired fake clinical actions. Live behavior is owned by
  // assets/spire-screen-controls.js and the shared SPIRE preference runtime.
  html = html
    .replaceAll('title="Messaging Portal"', 'title="Secure Chat" aria-label="Secure Chat"')
    .replaceAll(" onclick=\"alert('Opening Staff Messaging Portal...')\"", '')
    .replaceAll(" onclick=\"alert('Notifications: 3 unread reminders for current client.')\"", '')
    .replaceAll('<span class="notification-badge">3</span>', '<span class="notification-badge" hidden>0</span>')
    .replaceAll('20 Distinct Preset Looks', '21 Display & Accessibility Preferences')
    .replaceAll(
      'Select one of 20 distinct professional visual themes tailored for Spire Enterprise:',
      'Choose one of 20 professional visual themes plus the persistent full-screen workspace preference:',
    );

  if (!html.includes('21. Full-Screen Workspace')) {
    const anchor = `<div class="theme-card" onclick="applyPresetTheme('solarizedLight')"><b>20. Solarized Light Clean</b><br><span style="font-size: 11px; color: #64748b;">Soft cream base with contrasting navy</span></div>`;
    if (!html.includes(anchor)) throw new Error('SPIRE preset 20 card was not found while adding Full-Screen Workspace preference');
    const card = `${anchor}
                        <div class="theme-card" id="spireFullscreenPreferenceCard" role="button" tabindex="0" onclick="toggleSpireFullscreenPreference()"><b>21. Full-Screen Workspace</b><br><span style="font-size: 11px; color: #64748b;">Remember full-screen as the default across Client Station, charts and Secure Chat · <span data-fullscreen-status>Preferred on</span></span></div>`;
    html = html.replace(anchor, card);
  }

  if (!html.includes('</body>')) throw new Error('SPIRE master body close was not found');
  html = html.replace('</body>', `  <!-- ${marker} -->\n</body>`);
  await writeFile(target, html, 'utf8');
}

html = await readFile(target, 'utf8');
for (const required of [
  marker,
  'title="Secure Chat"',
  '21 Display & Accessibility Preferences',
  '21. Full-Screen Workspace',
  'spireFullscreenPreferenceCard',
]) {
  if (!html.includes(required)) throw new Error(`SPIRE master publication preparation missing ${required}`);
}
for (const forbidden of [
  "alert('Opening Staff Messaging Portal...')",
  "alert('Notifications: 3 unread reminders for current client.')",
  '<span class="notification-badge">3</span>',
]) {
  if (html.includes(forbidden)) throw new Error(`SPIRE master still contains retired fake UI: ${forbidden}`);
}

console.log('SPIRE master prepared for publication: Secure Chat/live notification controls replace fake alerts and accessibility preference #21 Full-Screen Workspace is present.');
