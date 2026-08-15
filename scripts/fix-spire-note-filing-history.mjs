import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPath = path.join(root, 'api', 'src', 'spire-note-composer-routes.ts');
const uiPath = path.join(root, 'assets', 'spire-note-composer-v2.js');
const finalizerPath = path.join(root, 'scripts', 'fix-spire-clinical-regressions.mjs');

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    if (source.includes(replacement.trim())) return source;
    throw new Error(`SPIRE note filing history fixer could not find ${label} start marker`);
  }
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`SPIRE note filing history fixer could not find ${label} end marker`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`SPIRE note filing history fixer expected one ${label} anchor; found ${count}`);
  return source.replace(before, after);
}

let api = await readFile(apiPath, 'utf8');
const listStart = "  app.get('/api/spire/patients/:patientId/note-composer/notes', async (req, res, next) => {";
const listEnd = "  app.post('/api/spire/patients/:patientId/note-composer/notes', async (req, res, next) => {";
const listReplacement = `  app.get('/api/spire/patients/:patientId/note-composer/notes', async (req, res, next) => {\n    try {\n      // SPIRE_NOTE_FILE_HISTORY_COMPAT_V1\n      const auth = authOf(res); await requirePatient(prisma, auth, req.params.patientId); const entity = selectedEntity(auth);\n      const rows = await prisma.$queryRawUnsafe<Array<Record<string,unknown>>>(\n        \`SELECT n."id",n."noteType",n."title",\n                CASE WHEN n."signedAt" IS NOT NULL OR n."signedById" IS NOT NULL OR n."signedByUserId" IS NOT NULL\n                     THEN 'SIGNED' ELSE COALESCE(NULLIF(n."status",''),'DRAFT') END AS "status",\n                COALESCE(NULLIF(n."authorUserId",''),NULLIF(n."signedById",''),NULLIF(n."signedByUserId",'')) AS "authorUserId",\n                COALESCE(NULLIF(n."signedById",''),NULLIF(n."signedByUserId",'')) AS "signedById",\n                n."signedAt",n."createdAt",n."updatedAt",COALESCE(n."currentVersion",v."version",1) AS "currentVersion",\n                COALESCE(v."body",n."body") AS "body",v."templateId",v."templateName",v."templateVersion",v."templateSource",v."templateSnapshot",v."authoredBody",\n                v."compositionMetadata",v."pasteDetected",v."pasteEventCount",v."pastedCharacterCount",v."copiedFromNoteId",COALESCE(v."createdAt",n."createdAt") AS "versionCreatedAt",\n                (n."patientId" IS NULL AND n."clientId" IS NOT NULL) AS "legacyStorage"\n           FROM "SpireClinicalNote" n\n           LEFT JOIN LATERAL (\n             SELECT * FROM "SpireClinicalNoteVersion" x WHERE x."organizationId"=n."organizationId" AND x."noteId"=n."id" ORDER BY x."version" DESC LIMIT 1\n           ) v ON TRUE\n          WHERE n."organizationId"=$1\n            AND (n."patientId"=$2 OR n."clientId"=$2)\n            AND (n."legalEntityId"=$3 OR n."legalEntityId" IS NULL)\n          ORDER BY COALESCE(n."signedAt",n."updatedAt",n."createdAt") DESC LIMIT 500\`,\n        auth.organizationId, req.params.patientId, entity,\n      );\n      res.json({ data: { items: rows } });\n    } catch (error) { next(error); }\n  });\n\n`;
api = replaceSection(api, listStart, listEnd, listReplacement, 'unified note history route');

const signStart = "  app.post('/api/spire/patients/:patientId/note-composer/notes/:noteId/sign', async (req, res, next) => {";
const moduleEnd = '\n};';
const signReplacement = `  app.post('/api/spire/patients/:patientId/note-composer/notes/:noteId/sign', async (req, res, next) => {\n    try {\n      // SPIRE_NOTE_DIRECT_SIGN_COMPAT_V1\n      const auth = authOf(res); await requirePatientWrite(prisma, auth, req.params.patientId); const entity = selectedEntity(auth);\n      const result = await prisma.$executeRawUnsafe(\n        \`UPDATE "SpireClinicalNote"\n            SET "status"='SIGNED',"signedAt"=COALESCE("signedAt",NOW()),"signedById"=COALESCE("signedById",$1),\n                "signedByUserId"=COALESCE("signedByUserId",$1),"updatedAt"=NOW()\n          WHERE "id"=$2 AND "organizationId"=$3\n            AND ("legalEntityId"=$4 OR "legalEntityId" IS NULL)\n            AND ("patientId"=$5 OR "clientId"=$5)\n            AND COALESCE("status",'DRAFT')='DRAFT'\n            AND "signedAt" IS NULL\`,\n        auth.userId, req.params.noteId, auth.organizationId, entity, req.params.patientId,\n      );\n      if (!result) throw Object.assign(new Error('Draft note not found or it is already filed'), { status: 404 });\n      await auditClinical(prisma, auth, req.params.patientId, 'SIGN_NOTE', req.params.noteId, { source:'SPIRE_NOTE_COMPOSER_V2', compatibility:'legacy-and-versioned' });\n      res.json({ data: { id:req.params.noteId, status:'SIGNED' } });\n    } catch (error) { next(error); }\n  });`;
const signIndex = api.indexOf(signStart);
if (signIndex < 0 && !api.includes('SPIRE_NOTE_DIRECT_SIGN_COMPAT_V1')) throw new Error('SPIRE note filing history fixer could not find sign route');
if (signIndex >= 0 && !api.includes('SPIRE_NOTE_DIRECT_SIGN_COMPAT_V1')) {
  const end = api.lastIndexOf(moduleEnd);
  if (end < signIndex) throw new Error('SPIRE note filing history fixer could not find note composer module close');
  api = api.slice(0, signIndex) + signReplacement + api.slice(end);
}

for (const marker of [
  'SPIRE_NOTE_FILE_HISTORY_COMPAT_V1',
  '(n."patientId"=$2 OR n."clientId"=$2)',
  'COALESCE(v."body",n."body") AS "body"',
  'n."signedByUserId" IS NOT NULL',
  'SPIRE_NOTE_DIRECT_SIGN_COMPAT_V1',
  '("patientId"=$5 OR "clientId"=$5)',
]) {
  if (!api.includes(marker)) throw new Error(`SPIRE note filing history backend missing ${marker}`);
}
await writeFile(apiPath, api, 'utf8');

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
  "    const id = clean(note?.id);",
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
catch (error) { throw new Error(`SPIRE Note Composer filing-history patch produced invalid JavaScript: ${error instanceof Error ? error.message : String(error)}`); }
await writeFile(uiPath, ui, 'utf8');

let finalizer = await readFile(finalizerPath, 'utf8');
finalizer = finalizer.replace(
  "/assets/spire-note-composer-v2.js?v=20260815-note-composer-v2-1",
  "/assets/spire-note-composer-v2.js?v=20260815-note-composer-v2-2",
);
if (!finalizer.includes("'sncSignDraftFromReader',")) {
  finalizer = replaceOnce(finalizer, "  'Sign & File',\n", "  'Sign & File',\n  'sncSignDraftFromReader',\n", 'Note Composer direct-file verifier');
}
if (!finalizer.includes('/assets/spire-note-composer-v2.js?v=20260815-note-composer-v2-2')) {
  throw new Error('SPIRE Note Composer cache generation was not advanced to v2-2');
}
await writeFile(finalizerPath, finalizer, 'utf8');

console.log('SPIRE note filing/history compatibility installed: legacy signed notes join versioned history, draft reader supports direct Sign & File, and Note Composer publication is cache-busted to v2-2.');
