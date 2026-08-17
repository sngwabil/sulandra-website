import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const selfPath = fileURLToPath(import.meta.url);
const authorityMarker = 'SPIRE_MASTER_FLOWSHEET_AUTHORITY_V2';
const authorityPath = path.join(root, 'assets', 'spire-master-flowsheet-grid.js');
const assetVersion = '20260817-flowsheet-set-authority-v2-1';

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`SPIRE master Flowsheet authority V2 missing ${label} anchor`);
  return source.replace(needle, replacement);
}

let authority = await readFile(authorityPath, 'utf8');
if (!authority.includes(authorityMarker)) {
  authority = replaceRequired(authority, '// SPIRE_MASTER_FLOWSHEET_AUTHORITY_V1', `// ${authorityMarker}`, 'authority marker');
  authority = authority.replace("const VERSION = '20260815-filed-history-visibility-1';", `const VERSION = '${assetVersion}';`);

  const categoryEnd = `  });\n\n  const runtime = {`;
  const setSupport = `  });\n\n  const FLOW_SET_KEY = 'spire:flowsheet:selected-set:v10';\n  const FLOW_CATEGORY_KEY = 'spire:flowsheet:selected-category:v10';\n  const LEGACY_FLOW_SET_KEY = 'spire:flowsheet:selected-set:v9';\n  const LEGACY_FLOW_CATEGORY_KEY = 'spire:flowsheet:selected-category:v9';\n  const FLOW_SET_DEFS = Object.freeze({\n    dsp: { label: 'DSP Daily Documentation' },\n    nurse: { label: 'Nurse / Skilled Nursing' },\n    all: { label: 'All Clinical Documentation' },\n    vitals: { label: 'Vitals & Clinical Monitoring' },\n    respiratory: { label: 'Respiratory / Oxygen' },\n    woundDevices: { label: 'Wound / Skin / Lines & Devices' },\n    diabetes: { label: 'Diabetes / Blood Glucose' },\n    neuro: { label: 'Neurologic / Seizure' },\n    io: { label: 'Intake / Output & Elimination' },\n    medTreatment: { label: 'Medication / Treatment' },\n    mobility: { label: 'Mobility / Fall Risk' },\n  });\n\n  const runtime = {`;
  authority = replaceRequired(authority, categoryEnd, setSupport, 'set definitions');
  authority = replaceRequired(authority, `    category: 'all',\n    search: '',`, `    set: 'dsp',\n    category: 'all',\n    groupFilter: '',\n    search: '',`, 'runtime set state');

  const oldFilters = `  function rowMatchesCategory(row) {\n    const definition = CATEGORY_DEFS[runtime.category] || CATEGORY_DEFS.all;\n    return definition.test(row);\n  }\n\n  function visibleRows() {\n    const term = runtime.search.toLowerCase();\n    return (Array.isArray(runtime.data?.rows) ? runtime.data.rows : []).filter((row) => {\n      if (!rowMatchesCategory(row)) return false;\n      if (!term) return true;\n      return [row.name, row.groupName, row.description, row.unit].some((value) => clean(value).toLowerCase().includes(term));\n    });\n  }`;
  const newFilters = `  function validFlowSet(value) {\n    const setId = clean(value);\n    return Object.prototype.hasOwnProperty.call(FLOW_SET_DEFS, setId) ? setId : 'dsp';\n  }\n\n  function readSelectedFlowSet() {\n    try {\n      return validFlowSet(sessionStorage.getItem(FLOW_SET_KEY) || sessionStorage.getItem(LEGACY_FLOW_SET_KEY) || 'dsp');\n    } catch {\n      return 'dsp';\n    }\n  }\n\n  function readSelectedFlowCategory() {\n    try {\n      const category = sessionStorage.getItem(FLOW_CATEGORY_KEY) || sessionStorage.getItem(LEGACY_FLOW_CATEGORY_KEY) || 'all';\n      return Object.prototype.hasOwnProperty.call(CATEGORY_DEFS, category) ? category : 'all';\n    } catch {\n      return 'all';\n    }\n  }\n\n  function flowSetLabel(setId = runtime.set) {\n    return FLOW_SET_DEFS[validFlowSet(setId)]?.label || FLOW_SET_DEFS.dsp.label;\n  }\n\n  function rowSearchText(row) {\n    return [row?.groupName, row?.name, row?.description, row?.unit].map(clean).join(' ').toLowerCase();\n  }\n\n  function rowMatchesFlowSet(row, setId = runtime.set) {\n    const set = validFlowSet(setId);\n    if (set === 'all') return true;\n    if (set === 'dsp') return true;\n    const text = rowSearchText(row);\n    if (set === 'nurse') return /(?:nurse|rn\\/?lpn|skilled nursing|clinical monitoring|assessment|pain|respiratory|lung|oxygen|cardiac|heart|gi\\b|gu\\b|gastro|urinary|skin|wound|foley|catheter|feeding tube|enteral|iv\\b|picc|vascular access|diabetes|blood glucose|insulin|medication reconciliation|treatment|intervention|patient education|provider notification|change of condition|escalation|care plan|narrative|neurolog|seizure|intake|output|mobility|fall risk|temperature|pulse|blood pressure|spo2|weight)/.test(text);\n    if (set === 'vitals') return /(?:vital|temperature|pulse|respiration|blood pressure|spo2|oxygen saturation|weight|pain score|pain location|clinical monitoring|general appearance|level of consciousness|orientation)/.test(text);\n    if (set === 'respiratory') return /(?:respiratory|lung sound|oxygen|spo2|breath|cough|sputum|trach)/.test(text);\n    if (set === 'woundDevices') return /(?:skin|wound|incision|pressure injury|catheter|foley|feeding tube|enteral|iv\\b|picc|infusion|vascular access|line|device)/.test(text);\n    if (set === 'diabetes') return /(?:blood glucose|diabetes|insulin|hypogly|hypergly)/.test(text);\n    if (set === 'neuro') return /(?:seizure|neurolog|postictal|orientation|level of consciousness|confus|rescue medication|midazolam)/.test(text);\n    if (set === 'io') return /(?:intake|output|urine|urinary|bowel|stool|gi\\b|gu\\b|hydration|fluid|continence|ostomy|constipation|diarrhea)/.test(text);\n    if (set === 'medTreatment') return /(?:medication|treatment|prn|reconciliation|adherence|drug|dose|emar|pharmacy|intervention|patient education|provider notification)/.test(text);\n    if (set === 'mobility') return /(?:mobility|transfer|reposition|positioning|fall risk|assistive device|bedbound)/.test(text);\n    return false;\n  }\n\n  function rowMatchesCategory(row) {\n    const definition = CATEGORY_DEFS[runtime.category] || CATEGORY_DEFS.all;\n    return definition.test(row);\n  }\n\n  function matchingFlowGroups() {\n    if (runtime.set === 'dsp') return [];\n    return [...new Set((Array.isArray(runtime.data?.rows) ? runtime.data.rows : [])\n      .filter((row) => rowMatchesFlowSet(row, runtime.set))\n      .map((row) => clean(row.groupName || 'Other'))\n      .filter(Boolean))];\n  }\n\n  function visibleRows() {\n    const term = runtime.search.toLowerCase();\n    return (Array.isArray(runtime.data?.rows) ? runtime.data.rows : []).filter((row) => {\n      if (!rowMatchesFlowSet(row, runtime.set)) return false;\n      if (runtime.set === 'dsp' && !rowMatchesCategory(row)) return false;\n      if (runtime.set !== 'dsp' && runtime.groupFilter && clean(row.groupName || 'Other') !== runtime.groupFilter) return false;\n      if (!term) return true;\n      return [row.name, row.groupName, row.description, row.unit].some((value) => clean(value).toLowerCase().includes(term));\n    });\n  }`;
  authority = replaceRequired(authority, oldFilters, newFilters, 'row filtering');

  authority = replaceRequired(
    authority,
    '>Residential HPC Flowsheet</th>${runtime.columns.map',
    '>${esc(flowSetLabel(runtime.set))} Flowsheet</th>${runtime.columns.map',
    'dynamic grid header',
  );

  const oldTree = `    tree.innerHTML = \`<div style="margin-bottom:6px"><input type="text" id="flowTaskSearch" placeholder="Search Task..." style="width:100%;border:1px solid #7f9db9;padding:3px"></div><div class="tree-item \${runtime.category === 'all' ? 'selected' : ''}" data-category="all"><span>Show All Tasks</span></div><hr style="border:0;border-top:1px solid #ccc;margin:4px 0">\${Object.entries(CATEGORY_DEFS).filter(([key]) => key !== 'all').map(([key, value]) => \`<div class="tree-item \${runtime.category === key ? 'selected' : ''}" data-category="\${key}"><span>\${esc(value.label)}</span></div>\`).join('')}\`;\n\n    const search = $('#flowTaskSearch', tree);\n    search.value = runtime.search;\n    search.addEventListener('input', (event) => { runtime.search = event.target.value || ''; renderGrid(); });\n    $$('[data-category]', tree).forEach((item) => item.addEventListener('click', () => {\n      runtime.category = item.dataset.category || 'all';\n      $$('[data-category]', tree).forEach((node) => node.classList.toggle('selected', node === item));\n      const active = $('#activeFlowsheetFilterName');\n      if (active) active.textContent = \`DSP Daily Documentation - \${CATEGORY_DEFS[runtime.category]?.label || 'Show All Tasks'}\`;\n      renderGrid();\n    }));`;
  const newTree = `    if (runtime.set === 'dsp') {\n      tree.innerHTML = \`<div style="margin-bottom:6px"><input type="text" id="flowTaskSearch" placeholder="Search Task..." style="width:100%;border:1px solid #7f9db9;padding:3px"></div><div class="tree-item \${runtime.category === 'all' ? 'selected' : ''}" data-category="all"><span>Show All Tasks</span></div><hr style="border:0;border-top:1px solid #ccc;margin:4px 0">\${Object.entries(CATEGORY_DEFS).filter(([key]) => key !== 'all').map(([key, value]) => \`<div class="tree-item \${runtime.category === key ? 'selected' : ''}" data-category="\${key}"><span>\${esc(value.label)}</span></div>\`).join('')}\`;\n    } else {\n      const groups = matchingFlowGroups();\n      tree.innerHTML = \`<div style="margin-bottom:6px"><input type="text" id="flowTaskSearch" placeholder="Search \${esc(flowSetLabel(runtime.set))}..." style="width:100%;border:1px solid #7f9db9;padding:3px"></div><div class="tree-item \${runtime.groupFilter === '' ? 'selected' : ''}" data-flow-group-filter=""><span>Show All \${esc(flowSetLabel(runtime.set))}</span></div><hr style="border:0;border-top:1px solid #ccc;margin:4px 0">\${groups.map((group) => \`<div class="tree-item \${runtime.groupFilter === group ? 'selected' : ''}" data-flow-group-filter="\${esc(group)}"><span>\${esc(group)}</span></div>\`).join('')}\`;\n    }\n\n    const search = $('#flowTaskSearch', tree);\n    search.value = runtime.search;\n    search.addEventListener('input', (event) => { runtime.search = event.target.value || ''; renderGrid(); });\n    $$('[data-category]', tree).forEach((item) => item.addEventListener('click', () => {\n      if (runtime.set !== 'dsp') return;\n      runtime.category = item.dataset.category || 'all';\n      runtime.groupFilter = '';\n      $$('[data-category]', tree).forEach((node) => node.classList.toggle('selected', node === item));\n      const active = $('#activeFlowsheetFilterName');\n      if (active) active.textContent = \`DSP Daily Documentation - \${CATEGORY_DEFS[runtime.category]?.label || 'Show All Tasks'}\`;\n      renderGrid();\n    }));\n    $$('[data-flow-group-filter]', tree).forEach((item) => item.addEventListener('click', () => {\n      if (runtime.set === 'dsp') return;\n      runtime.groupFilter = item.dataset.flowGroupFilter || '';\n      $$('[data-flow-group-filter]', tree).forEach((node) => node.classList.toggle('selected', node === item));\n      renderGrid();\n    }));`;
  authority = replaceRequired(authority, oldTree, newTree, 'task tree');

  authority = replaceRequired(
    authority,
    `    const active = $('#activeFlowsheetFilterName');\n    if (active) active.textContent = \`DSP Daily Documentation - \${CATEGORY_DEFS[runtime.category]?.label || 'Show All Tasks'}\`;\n    host.dataset.userMasterFlowsheet = 'true';`,
    `    const active = $('#activeFlowsheetFilterName');\n    if (active) active.textContent = runtime.set === 'dsp' ? \`DSP Daily Documentation - \${CATEGORY_DEFS[runtime.category]?.label || 'Show All Tasks'}\` : \`\${flowSetLabel(runtime.set)} - Show All\`;\n    host.dataset.userMasterFlowsheet = 'true';`,
    'active selector label',
  );

  authority = authority.replace(
    '<span id="activeFlowsheetFilterName">DSP Daily Documentation - Show All Tasks</span>',
    '<span id="activeFlowsheetFilterName">${runtime.set === \'dsp\' ? \'DSP Daily Documentation - Show All Tasks\' : flowSetLabel(runtime.set) + \' - Show All\'}</span>',
  );

  authority = replaceRequired(
    authority,
    `    runtime.homeId = currentHomeId();\n    const host = $('#flowsheets-view');`,
    `    runtime.homeId = currentHomeId();\n    runtime.set = readSelectedFlowSet();\n    runtime.category = runtime.set === 'dsp' ? readSelectedFlowCategory() : 'all';\n    if (runtime.set === 'dsp') runtime.groupFilter = '';\n    const host = $('#flowsheets-view');`,
    'workspace selected set sync',
  );

  authority = replaceRequired(
    authority,
    `    runtime.homeId = currentHomeId();\n    loadDraftStore();\n    restoreAuthoritativeToolbar();`,
    `    runtime.homeId = currentHomeId();\n    runtime.set = readSelectedFlowSet();\n    runtime.category = runtime.set === 'dsp' ? readSelectedFlowCategory() : 'all';\n    runtime.groupFilter = '';\n    loadDraftStore();\n    restoreAuthoritativeToolbar();`,
    'initial selected set sync',
  );

  const installAnchor = `    runtime.wired = true;\n    if ($('#flowsheets-view')?.classList.contains('active')) loadWorkspace();`;
  const installListener = `    runtime.wired = true;\n    document.addEventListener('spire:flowsheet-set-change', (event) => {\n      const nextSet = validFlowSet(event?.detail?.set || readSelectedFlowSet());\n      runtime.set = nextSet;\n      runtime.category = nextSet === 'dsp' && Object.prototype.hasOwnProperty.call(CATEGORY_DEFS, event?.detail?.category || '') ? event.detail.category : (nextSet === 'dsp' ? readSelectedFlowCategory() : 'all');\n      runtime.groupFilter = '';\n      runtime.search = '';\n      restoreAuthoritativeToolbar();\n      renderGrid();\n      setStatus(\`Showing \${flowSetLabel(runtime.set)}.\`, 'success');\n    });\n    if ($('#flowsheets-view')?.classList.contains('active')) loadWorkspace();`;
  authority = replaceRequired(authority, installAnchor, installListener, 'set change listener');

  authority = replaceRequired(
    authority,
    `getState: () => ({ patientId: runtime.patientId, homeId: runtime.homeId, pending: runtime.drafts.size, category: runtime.category, columns: [...runtime.columns], selectedDate: runtime.selectedDate, filedEntries: Array.isArray(runtime.data?.entries) ? runtime.data.entries.length : 0 })`,
    `getState: () => ({ patientId: runtime.patientId, homeId: runtime.homeId, pending: runtime.drafts.size, set: runtime.set, category: runtime.category, groupFilter: runtime.groupFilter, columns: [...runtime.columns], selectedDate: runtime.selectedDate, filedEntries: Array.isArray(runtime.data?.entries) ? runtime.data.entries.length : 0 })`,
    'public state',
  );

  await writeFile(authorityPath, authority, 'utf8');
}

const verifiedAuthority = await readFile(authorityPath, 'utf8');
for (const required of [
  authorityMarker,
  'rowMatchesFlowSet',
  "document.addEventListener('spire:flowsheet-set-change'",
  'flowSetLabel(runtime.set)',
  'data-flow-group-filter',
  'set: runtime.set',
  assetVersion,
]) {
  if (!verifiedAuthority.includes(required)) throw new Error(`SPIRE master Flowsheet authority V2 missing ${required}`);
}
if (verifiedAuthority.includes('>Residential HPC Flowsheet</th>')) throw new Error('SPIRE master Flowsheet authority V2 still hard-codes Residential HPC Flowsheet');
const syntax = spawnSync(process.execPath, ['--check', authorityPath], { encoding: 'utf8' });
if (syntax.status !== 0) throw new Error(`SPIRE master Flowsheet authority V2 syntax failed: ${(syntax.stderr || syntax.stdout || '').trim()}`);

async function cacheBustDirectory(directory) {
  let entries = [];
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return 0; }
  let changed = 0;
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist-web'].includes(entry.name)) continue;
      changed += await cacheBustDirectory(filePath);
      continue;
    }
    if (!/\.(?:html|js|mjs)$/i.test(entry.name) || filePath === authorityPath || filePath === selfPath) continue;
    let source = await readFile(filePath, 'utf8');
    if (!source.includes('/assets/spire-master-flowsheet-grid.js')) continue;
    const next = source.replace(/\/assets\/spire-master-flowsheet-grid\.js(?:\?v=[^"'`\s<>]+)?/g, `/assets/spire-master-flowsheet-grid.js?v=${assetVersion}`);
    if (next !== source) {
      await writeFile(filePath, next, 'utf8');
      changed += 1;
    }
  }
  return changed;
}

let cacheBustedFiles = 0;
for (const directory of [path.join(root, 'spire'), path.join(root, 'assets'), path.join(root, 'scripts')]) {
  cacheBustedFiles += await cacheBustDirectory(directory);
}
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.html$/i.test(entry.name)) continue;
  const filePath = path.join(root, entry.name);
  let source = await readFile(filePath, 'utf8');
  if (!source.includes('/assets/spire-master-flowsheet-grid.js')) continue;
  const next = source.replace(/\/assets\/spire-master-flowsheet-grid\.js(?:\?v=[^"'`\s<>]+)?/g, `/assets/spire-master-flowsheet-grid.js?v=${assetVersion}`);
  if (next !== source) {
    await writeFile(filePath, next, 'utf8');
    cacheBustedFiles += 1;
  }
}

console.log(`SPIRE master Flowsheet authority V2 now renders DSP, Nurse and specialty sets from live backend rows; cache-busted ${cacheBustedFiles} loader file(s).`);
