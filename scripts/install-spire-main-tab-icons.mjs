import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_MAIN_TAB_ICONS_V1';

let html = await readFile(target, 'utf8');

for (const tab of ['data-view="flowsheets-view"', 'data-view="mar-view"']) {
  if (!html.includes(tab)) throw new Error(`SPIRE main tab icon target is missing ${tab}`);
}

if (!html.includes(marker)) {
  const styleAnchor = '    </style>';
  if (!html.includes(styleAnchor)) throw new Error('SPIRE main tab icon style anchor was not found');

  const iconCss = [
    '',
    `        /* ${marker}: icon-only decoration for Flowsheets and MAR. */`,
    "        #mainChartTabs .chart-tab[data-view=\"flowsheets-view\"]::before{content:'▦';display:inline-block;margin-right:4px;color:#2f7f9f;font-size:14px;line-height:1;vertical-align:-1px}",
    "        #mainChartTabs .chart-tab[data-view=\"mar-view\"]::before{content:'+';display:inline-grid;place-items:center;width:14px;height:14px;margin-right:4px;border-radius:50%;background:#7d4db3;color:#fff;font-family:Arial,sans-serif;font-size:11px;font-weight:800;line-height:14px;vertical-align:-2px}",
    '',
  ].join('\n');

  html = html.replace(styleAnchor, `${iconCss}${styleAnchor}`);
}

if (!html.includes(marker)) throw new Error('SPIRE main tab icon marker was not installed');
await writeFile(target, html, 'utf8');
console.log('SPIRE main chart icons installed: Flowsheets and MAR only; tab markup and behavior unchanged.');
