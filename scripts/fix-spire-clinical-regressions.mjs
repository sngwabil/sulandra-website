import { appendFile, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const masterPath = path.join(dist, 'spire', 'master.html');
const gridPath = path.join(dist, 'assets', 'spire-master-flowsheet-grid.js');
const marPath = path.join(dist, 'assets', 'spire-mar-timeline.js');
const marCssPath = path.join(dist, 'assets', 'spire-mar-epic-v5.css');
const notePath = path.join(dist, 'assets', 'spire-note-workflow.js');

const GRID_MARKER = 'SPIRE_FLOWSHEET_CLINICIAN_ATTRIBUTION_V1';
const MAR_MARKER = 'SPIRE_MAR_STRUCTURAL_SECTIONS_V1';
const MAR_CSS_MARKER = 'SPIRE_MAR_STRUCTURAL_SECTIONS_CSS_V1';
const NOTE_MARKER = 'SPIRE_NOTE_TEMPLATE_WORKFLOW_V1';
const gridUrl = '/assets/spire-master-flowsheet-grid.js?v=20260815-clinical-attribution-3';
const marUrl = '/assets/spire-mar-timeline.js?v=20260815-mar-sections-3';
const marCssUrl = '/assets/spire-mar-epic-v5.css?v=20260815-mar-sections-3';
const noteUrl = '/assets/spire-note-workflow.js?v=20260815-note-template-workflow-1';

await Promise.all([stat(masterPath), stat(gridPath), stat(marPath), stat(marCssPath), stat(notePath)]);

let grid = await readFile(gridPath, 'utf8');
if (!grid.includes(GRID_MARKER)) {
  const actorBlock = `  async function loadActor() {\n    if (runtime.actor) return runtime.actor;\n    for (const endpoint of ['/api/auth/me', '/api/session', '/api/auth/session']) {\n      try {\n        const value = await api(endpoint);\n        const actor = value?.user || value?.session || value;\n        if (actor && (actor.id || actor.userId || actor.email)) {\n          runtime.actor = actor;\n          return actor;\n        }\n      } catch {}\n    }\n    return null;\n  }\n\n  function actorName() {\n    const actor = runtime.actor || {};\n    return actor.displayName || actor.name || actor.fullName || actor.email || 'Current user';\n  }`;
  if (!grid.includes(actorBlock)) throw new Error('SPIRE flowsheet clinician attribution could not find the actor loader');
  grid = grid.replace(actorBlock, `  // ${GRID_MARKER}\n  function clinicianLabel(identity = {}) {\n    const explicit = clean(identity.displayLabel);\n    if (explicit) return explicit;\n    const name = clean(identity.displayName || identity.name || identity.fullName || identity.email || identity.userId || identity.id || 'Current user');\n    const credentials = clean(identity.credentials || identity.credentialLabel);\n    return credentials && !name.toUpperCase().endsWith(', ' + credentials.toUpperCase()) ? name + ', ' + credentials : name;\n  }\n\n  async function loadActor() {\n    if (runtime.actor) return runtime.actor;\n    let fallback = null;\n    for (const endpoint of ['/api/spire/clinical-identity', '/api/session', '/api/auth/session', '/api/auth/me']) {\n      try {\n        const value = await api(endpoint);\n        const actor = value?.user || value?.session || value;\n        if (!actor || !(actor.id || actor.userId || actor.email)) continue;\n        if (actor.displayName || actor.name || actor.fullName || actor.displayLabel) {\n          runtime.actor = actor;\n          return actor;\n        }\n        fallback ||= actor;\n      } catch {}\n    }\n    runtime.actor = fallback;\n    return fallback;\n  }\n\n  function actorName() {\n    return clinicianLabel(runtime.actor || {});\n  }\n\n  async function hydrateEntryAuthors(entries = []) {\n    const list = Array.isArray(entries) ? entries : [];\n    const ids = [...new Set(list.map((entry) => clean(entry?.recordedById)).filter(Boolean))];\n    let directory = new Map();\n    if (ids.length) {\n      try {\n        const data = await api('/api/spire/clinical-users?ids=' + encodeURIComponent(ids.join(',')));\n        const users = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];\n        directory = new Map(users.map((user) => [String(user.id || user.userId), user]));\n      } catch {}\n    }\n    const actor = runtime.actor || {};\n    const actorId = clean(actor.id || actor.userId);\n    for (const entry of list) {\n      const id = clean(entry?.recordedById);\n      const identity = directory.get(id) || (actorId && id === actorId ? actor : null);\n      if (!identity) continue;\n      entry.recordedByDisplayName = clean(identity.displayName || identity.name || identity.fullName) || entry.recordedByDisplayName || clean(identity.email) || id;\n      entry.recordedByCredentials = clean(identity.credentials || identity.credentialLabel) || entry.recordedByCredentials || '';\n      entry.recordedByDisplayLabel = clinicianLabel(identity);\n    }\n    return list;\n  }`);

  const tooltipBlock = `    const author = entry?.recordedByDisplayName || entry?.recordedById || '';\n    const status = draft ? (draft.amendment ? 'Unfiled amendment' : 'Unfiled') : entry ? (isAmended(entry) ? 'Filed amendment' : 'Filed') : 'Empty';\n    const title = [status, author ? \`by \${author}\` : '', entry?.createdAt ? \`documented \${new Date(entry.createdAt).toLocaleString()}\` : '', comment ? \`Comment: \${comment}\` : ''].filter(Boolean).join(' · ');`;
  if (!grid.includes(tooltipBlock)) throw new Error('SPIRE flowsheet clinician attribution could not find the filed-cell tooltip');
  grid = grid.replace(tooltipBlock, `    const author = entry?.recordedByDisplayName || entry?.recordedById || '';\n    const credentials = clean(entry?.recordedByCredentials);\n    const authorLabel = clean(entry?.recordedByDisplayLabel) || (author && credentials && !String(author).toUpperCase().endsWith(', ' + credentials.toUpperCase()) ? author + ', ' + credentials : author);\n    const status = draft ? (draft.amendment ? 'Unfiled amendment' : 'Unfiled') : entry ? (isAmended(entry) ? 'Filed amendment' : 'Filed') : 'Empty';\n    const recordedFor = entry?.recordedAt ? new Date(entry.recordedAt).toLocaleString() : '';\n    const filedAt = entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : '';\n    const amendedAt = !draft && isAmended(entry) && entry?.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '';\n    const title = [\n      status,\n      authorLabel ? \`Filed by \${authorLabel}\` : '',\n      recordedFor ? \`Recorded for \${recordedFor}\` : '',\n      filedAt ? \`Filed at \${filedAt}\` : '',\n      amendedAt ? \`Last amended \${amendedAt}\` : '',\n      comment ? \`Comment: \${comment}\` : '',\n    ].filter(Boolean).join(' · ');`);

  const workspaceLine = `      runtime.data = await api(\`/api/spire/patients/\${encodeURIComponent(runtime.patientId)}/flowsheet-workspace?from=\${encodeURIComponent(from)}&to=\${encodeURIComponent(to)}\`);`;
  if (!grid.includes(workspaceLine)) throw new Error('SPIRE flowsheet clinician attribution could not find workspace data load');
  grid = grid.replace(workspaceLine, `${workspaceLine}\n      await hydrateEntryAuthors(runtime.data?.entries);`);

  const mergeAnchor = `      if (runtime.data && filedEntries.length) {\n        const merged = new Map((Array.isArray(runtime.data.entries) ? runtime.data.entries : []).map((entry) => [String(entry.id), entry]));`;
  if (!grid.includes(mergeAnchor)) throw new Error('SPIRE flowsheet clinician attribution could not find transactional File merge');
  grid = grid.replace(mergeAnchor, `      if (runtime.data && filedEntries.length) {\n        await hydrateEntryAuthors(filedEntries);\n        const merged = new Map((Array.isArray(runtime.data.entries) ? runtime.data.entries : []).map((entry) => [String(entry.id), entry]));`);
}

for (const marker of [GRID_MARKER, '/api/spire/clinical-identity', '/api/spire/clinical-users?ids=', 'recordedByCredentials', 'Filed by', 'Recorded for', 'Filed at']) {
  if (!grid.includes(marker)) throw new Error(`SPIRE flowsheet clinician attribution missing ${marker}`);
}
try { new Function(grid); }
catch (error) { throw new Error(`SPIRE flowsheet grid syntax error after clinician attribution repair: ${error instanceof Error ? error.message : String(error)}`); }
await writeFile(gridPath, grid, 'utf8');

let mar = await readFile(marPath, 'utf8');
if (!mar.includes(MAR_MARKER)) {
  const prnBlock = `  function isPrn(med) {\n    return /\\bPRN\\b|AS NEEDED/i.test(\`\${med.frequency || ''} \${med.instructions || ''}\`);\n  }`;
  if (!mar.includes(prnBlock)) throw new Error('SPIRE MAR section repair could not find PRN classifier');
  mar = mar.replace(prnBlock, `${prnBlock}\n\n  // ${MAR_MARKER}\n  function isOneTime(med) {\n    const textValue = clean(\`${'${med.frequency || \'\'}'} ${'${med.orderType || \'\'}'} ${'${med.instructions || \'\'}'}\`);\n    return /\\bONCE\\b|ONE[- ]?TIME|\\bSTAT\\b/i.test(textValue);\n  }`);

  const medicationLine = `    const medications = Array.isArray(currentData.medications) ? currentData.medications : [];`;
  if (!mar.includes(medicationLine)) throw new Error('SPIRE MAR section repair could not find medication normalization');
  mar = mar.replace(medicationLine, `    const medications = Array.isArray(currentData.medications) ? currentData.medications : Array.isArray(currentData.items) ? currentData.items : [];`);

  const renderAnchor = `  function render(host, data, date) {`;
  if (!mar.includes(renderAnchor)) throw new Error('SPIRE MAR section repair could not find renderer');
  mar = mar.replace(renderAnchor, `  function medicationSectionKey(med) {\n    if (isPrn(med)) return 'prn';\n    if (isContinuous(med)) return 'continuous';\n    if (isOneTime(med)) return 'one-time';\n    return 'scheduled';\n  }\n\n  function medicationSectionHtml(key, title, medications, canAdminister) {\n    return \`<section class="spire-mar-section" data-mar-section="\${esc(key)}">\n      <div class="spire-mar-section-header"><span>\${esc(title)}</span><span class="spire-mar-section-count">\${medications.length}</span></div>\n      <div class="spire-mar-section-body">\${medications.length ? medications.map((med) => medicationRowHtml(med, canAdminister)).join('') : '<div class="spire-mar-section-empty">No active medications in this section.</div>'}</div>\n    </section>\`;\n  }\n\n${renderAnchor}`);

  const flatList = `        <div class="spire-mar-medication-list \${hideAdmins ? 'hide-admins' : ''}">\n          \${visible.length ? visible.map((med) => medicationRowHtml(med, canAdminister)).join('') : \`<div class="spire-mar-empty">No medications match this MAR view.</div>\`}\n        </div>`;
  if (!mar.includes(flatList)) throw new Error('SPIRE MAR section repair could not find flattened medication list');
  mar = mar.replace(flatList, `        <div class="spire-mar-medication-list \${hideAdmins ? 'hide-admins' : ''}">\n          \${visible.length || currentFilter === 'all' ? [\n            ['scheduled', 'Scheduled Medications'],\n            ['prn', 'PRN Medications'],\n            ['continuous', 'Continuous / Infusion Medications'],\n            ['one-time', 'One-Time Medications'],\n          ].map(([key, title]) => {\n            const sectionMeds = visible.filter((med) => medicationSectionKey(med) === key);\n            return currentFilter === 'all' || sectionMeds.length ? medicationSectionHtml(key, title, sectionMeds, canAdminister) : '';\n          }).join('') : \`<div class="spire-mar-empty">No medications match this MAR view.</div>\`}\n        </div>`);
}

for (const marker of [MAR_MARKER, 'Scheduled Medications', 'PRN Medications', 'Continuous / Infusion Medications', 'One-Time Medications', 'Array.isArray(currentData.items)']) {
  if (!mar.includes(marker)) throw new Error(`SPIRE MAR structural section repair missing ${marker}`);
}
try { new Function(mar); }
catch (error) { throw new Error(`SPIRE MAR syntax error after section repair: ${error instanceof Error ? error.message : String(error)}`); }
await writeFile(marPath, mar, 'utf8');

let marCss = await readFile(marCssPath, 'utf8');
if (!marCss.includes(MAR_CSS_MARKER)) {
  await appendFile(marCssPath, `\n/* ${MAR_CSS_MARKER} */\n.spire-mar-section{border-top:1px solid #9fb5c8;background:#fff}\n.spire-mar-section:first-child{border-top:0}\n.spire-mar-section-header{display:flex;align-items:center;gap:8px;min-height:28px;padding:5px 10px;background:linear-gradient(#dceaf5,#c7dceb);border-bottom:1px solid #8da9bf;color:#123f61;font-size:12px;font-weight:800;text-transform:none;letter-spacing:.01em;position:sticky;left:0;z-index:4}\n.spire-mar-section-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:18px;padding:0 5px;border:1px solid #87a4bb;border-radius:9px;background:#f8fbfd;font-size:10px}\n.spire-mar-section-body{min-width:max-content}\n.spire-mar-section-empty{width:320px;min-height:34px;padding:9px 12px;color:#61788a;font-size:11px;font-style:italic;background:#f8fafc;border-right:1px solid #c7d4df}\n`);
  marCss += `\n/* ${MAR_CSS_MARKER} */`;
}

const note = await readFile(notePath, 'utf8');
for (const marker of [NOTE_MARKER, '/api/spire/note-types', 'Save Draft', 'Sign & Close', 'Note Template']) {
  if (!note.includes(marker)) throw new Error(`SPIRE note workflow publication missing ${marker}`);
}
try { new Function(note); }
catch (error) { throw new Error(`SPIRE note workflow syntax error: ${error instanceof Error ? error.message : String(error)}`); }

let master = await readFile(masterPath, 'utf8');
master = master
  .replace(/\/assets\/spire-master-flowsheet-grid\.js(?:\?v=[^"']+)?/g, gridUrl)
  .replace(/\/assets\/spire-mar-timeline\.js(?:\?v=[^"']+)?/g, marUrl)
  .replace(/\/assets\/spire-mar-epic-v5\.css(?:\?v=[^"']+)?/g, marCssUrl)
  .replace(/\s*<script src="\/assets\/spire-note-workflow\.js(?:\?v=[^"']+)?"><\/script>\s*/g, '\n')
  .replace('</body>', `  <script src="${noteUrl}"></script>\n</body>`);

for (const required of [gridUrl, marUrl, marCssUrl, noteUrl]) {
  if (!master.includes(required)) throw new Error(`SPIRE master clinical regression publication missing ${required}`);
}
if ((master.match(/src="\/assets\/spire-note-workflow\.js(?:\?[^"']*)?"/g) || []).length !== 1) {
  throw new Error('SPIRE note workflow must be published exactly once');
}
await writeFile(masterPath, master, 'utf8');

console.log('SPIRE clinical regressions repaired: clinician-attributed flowsheet hover/file status, structural MAR sections, and note type → template → editor workflow are published with cache-busted assets.');
