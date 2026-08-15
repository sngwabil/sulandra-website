import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiPath = path.join(root, 'assets', 'spire-note-composer-v2.js');
const finalizerPath = path.join(root, 'scripts', 'fix-spire-clinical-regressions.mjs');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`SPIRE note filing UI fixer expected one ${label} anchor; found ${count}`);
  return source.replace(before, after);
}

let ui = await readFile(uiPath, 'utf8');
const oldActions = `<div class="snc-top-actions"><button type="button" class="snc-btn" id="sncNewFromReader">New Note</button>\${ownDraft ? '<button type="button" class="snc-btn primary" id="sncEditDraft">Edit Draft</button>' : ''}</div>`;
const newActions = `<div class="snc-top-actions"><button type="button" class="snc-btn" id="sncNewFromReader">New Note</button>\${ownDraft ? '<button type="button" class="snc-btn primary" id="sncEditDraft">Edit Draft</button><button type="button" class="snc-btn sign" id="sncSignDraftFromReader">Sign & File</button>' : ''}</div>`;
ui = replaceOnce(ui, oldActions, newActions, 'draft reader actions');

const oldReaderBindings = `    document.getElementById('sncNewFromReader')?.addEventListener('click', newNote);\n    document.getElementById('sncEditDraft')?.addEventListener('click', () => editDraft(note));\n  }\n\n  function editDraft(note) {`;
const newReaderBindings = [
  "    document.getElementById('sncNewFromReader')?.addEventListener('click', newNote);",
  "    document.getElementById('sncEditDraft')?.addEventListener('click', () => editDraft(note));",
  "    document.getElementById('sncSignDraftFromReader')?.addEventListener('click', () => void signDraftFromReader(note));",
  '  }',
  '',
  '  async function signDraftFromReader(note) {',
  '    // SPIRE_NOTE_READER_SIGN_AND_FILE_V1',
  '    const id = clean(note?.id);',
  "    if (!id || clean(note?.status).toUpperCase() === 'SIGNED') return;",
  '    const unresolved = unresolvedPromptCount(note?.body);',
  "    const warning = unresolved ? 'This draft still contains ' + unresolved + ' unresolved template prompt' + (unresolved === 1 ? '' : 's') + '. Sign and file it anyway?' : 'Sign and file this draft as part of the permanent clinical record?';",
  '    if (!window.confirm(warning)) return;',
  "    const button = document.getElementById('sncSignDraftFromReader');",
  "    const oldText = button?.textContent || 'Sign & File';",
  "    if (button) { button.disabled = true; button.textContent = 'Filing…'; }",
  '    try {',
  "      await api('/api/spire/patients/' + encodeURIComponent(state.patientId) + '/note-composer/notes/' + encodeURIComponent(id) + '/sign', { method:'POST', body:JSON.stringify({}) });",
  '      await loadNotes();',
  '      openReader(id);',
  '    } catch (error) {',
  "      window.alert(error?.message || 'Unable to sign and file this draft.');",
  '    } finally {',
  '      if (button?.isConnected) { button.disabled = false; button.textContent = oldText; }',
  '    }',
  '  }',
  '',
  '  function editDraft(note) {',
].join('\n');
ui = replaceOnce(ui, oldReaderBindings, newReaderBindings, 'reader sign-and-file binding');
ui = ui.replace(`<button type="button" class="snc-tab \${mode === 'final' ? 'active' : ''}" data-snc-mode="final">Final Filed Note</button>`, `<button type="button" class="snc-tab \${mode === 'final' ? 'active' : ''}" data-snc-mode="final">\${signed ? 'Final Filed Note' : 'Draft Note'}</button>`);

for (const marker of ['sncSignDraftFromReader','SPIRE_NOTE_READER_SIGN_AND_FILE_V1','Sign & File','Draft Note']) {
  if (!ui.includes(marker)) throw new Error(`SPIRE Note Composer reader filing UI missing ${marker}`);
}
try { new Function(ui); }
catch (error) { throw new Error(`SPIRE Note Composer filing UI patch produced invalid JavaScript: ${error instanceof Error ? error.message : String(error)}`); }
await writeFile(uiPath, ui, 'utf8');

let finalizer = await readFile(finalizerPath, 'utf8');
if (!finalizer.includes('/assets/spire-note-composer-v2.js?v=20260815-note-composer-v2-2')) {
  finalizer = finalizer.replace(
    '/assets/spire-note-composer-v2.js?v=20260815-note-composer-v2-1',
    '/assets/spire-note-composer-v2.js?v=20260815-note-composer-v2-2',
  );
}
if (!finalizer.includes("'sncSignDraftFromReader',")) {
  finalizer = replaceOnce(finalizer, "  'Sign & File',\n", "  'Sign & File',\n  'sncSignDraftFromReader',\n", 'direct-file publication verifier');
}
await writeFile(finalizerPath, finalizer, 'utf8');

console.log('SPIRE Note Composer reader filing UI installed: drafts can Sign & File directly and Static publication is pinned to composer v2-2.');
