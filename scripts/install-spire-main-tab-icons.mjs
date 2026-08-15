import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_MAIN_TAB_ICONS_V1';

let html = await readFile(target, 'utf8');

if (!html.includes(marker)) {
  const flowsheetsAnchor = '<div class="chart-tab" data-view="flowsheets-view">Flowsheets</div>';
  const marAnchor = '<div class="chart-tab" data-view="mar-view" onclick="triggerMarPopup()">MAR</div>';

  if (!html.includes(flowsheetsAnchor)) throw new Error('SPIRE Flowsheets tab icon anchor was not found');
  if (!html.includes(marAnchor)) throw new Error('SPIRE MAR tab icon anchor was not found');

  const flowsheetsIcon = '<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" style="margin-right:4px;vertical-align:-2px;pointer-events:none"><rect x="1.25" y="1.25" width="13.5" height="13.5" rx="2" fill="#e8f6fb" stroke="#3b82a0" stroke-width="1.2"/><path d="M4 11V8.2M7.7 11V5.4M11.4 11V3.7" fill="none" stroke="#3b82a0" stroke-width="1.4" stroke-linecap="round"/><path d="M3 12.5h10" fill="none" stroke="#d6a63c" stroke-width="1.1" stroke-linecap="round"/></svg>';
  const marIcon = '<svg aria-hidden="true" focusable="false" width="14" height="14" viewBox="0 0 16 16" style="margin-right:4px;vertical-align:-2px;pointer-events:none"><circle cx="8" cy="8" r="6.6" fill="#7d4db3" stroke="#5c348b" stroke-width="1.2"/><path d="M5 8h6M8 5v6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>';

  html = html.replace(
    flowsheetsAnchor,
    `<!-- ${marker} --><div class="chart-tab" data-view="flowsheets-view">${flowsheetsIcon}Flowsheets</div>`,
  );
  html = html.replace(
    marAnchor,
    `<div class="chart-tab" data-view="mar-view" onclick="triggerMarPopup()">${marIcon}MAR</div>`,
  );
}

for (const required of [marker, 'data-view="flowsheets-view"><svg', 'data-view="mar-view" onclick="triggerMarPopup()"><svg']) {
  if (!html.includes(required)) throw new Error(`SPIRE main tab icon publication is missing ${required}`);
}

await writeFile(target, html, 'utf8');
console.log('SPIRE main chart icons installed: Flowsheets and MAR only.');
