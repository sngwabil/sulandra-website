import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// DEVELOPMENT_WORKFLOW: resolve from this script's own location.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'assets', 'spire-master-flowsheet-grid.js');
const marker = 'SPIRE_FLOWSHEET_FRIENDLY_ACTOR_V1';

let source = await readFile(target, 'utf8');

if (!source.includes(marker)) {
  const replacements = [
    [
      "  // SPIRE_FLOWSHEET_INLINE_ENTRY_V3",
      "  // SPIRE_FLOWSHEET_INLINE_ENTRY_V3\n  // SPIRE_FLOWSHEET_FRIENDLY_ACTOR_V1"
    ],
    [
      "const author = entry?.recordedByDisplayName || entry?.recordedById || '';",
      "const author = clean(entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedByEmail || '');"
    ],
    [
      "clean(entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedById)",
      "clean(entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedByEmail || '')"
    ],
    [
      'Open this chart from SPIRE Patient Station before using Flowsheets.',
      'Open this chart from SPIRE Client Station before using Flowsheets.'
    ]
  ];

  for (const [from, to] of replacements) source = source.replaceAll(from, to);
  await writeFile(target, source, 'utf8');
}

source = await readFile(target, 'utf8');

if (!source.includes(marker)) {
  throw new Error('SPIRE flowsheet friendly-actor marker was not installed.');
}
if (source.includes("entry?.recordedByDisplayName || entry?.recordedById")) {
  throw new Error('SPIRE flowsheet still exposes recordedById as a filed-by fallback.');
}
if (source.includes("entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedById")) {
  throw new Error('SPIRE flowsheet still exposes recordedById as a friendly-name fallback.');
}
if (source.includes('SPIRE Patient Station before using Flowsheets')) {
  throw new Error('SPIRE flowsheet still refers to the retired Patient Station.');
}

console.log('SPIRE flowsheet filed-by labels verified: display name/name/email only; internal user IDs are never shown to chart users; Client Station terminology is current.');
