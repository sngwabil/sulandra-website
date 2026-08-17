import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const marker = 'SPIRE_FLOWSHEET_NATIVE_SET_RENDERER_V10';
const files = [
  'spire/master.html',
  'spire/client-station.html',
  'spire/secure-chat.html',
];

const helper = `
  // ${marker}
  const SPIRE_FLOWSHEET_SET_KEY_V10 = 'spire:flowsheet:selected-set:v10';
  const SPIRE_FLOWSHEET_SET_KEY_V9 = 'spire:flowsheet:selected-set:v9';

  function spireSelectedFlowsheetSet() {
    try {
      return sessionStorage.getItem(SPIRE_FLOWSHEET_SET_KEY_V10)
        || sessionStorage.getItem(SPIRE_FLOWSHEET_SET_KEY_V9)
        || 'dsp';
    } catch (_) {
      return 'dsp';
    }
  }

  function spireFlowsheetText(value) {
    return String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  }

  function spireFlowsheetRowMatchesSet(row, setId) {
    if (setId === 'all') return true;
    if (setId === 'dsp') return false;
    const group = spireFlowsheetText(row?.groupName || 'Other');
    const name = spireFlowsheetText(row?.name || '');
    const description = spireFlowsheetText(row?.description || '');
    const text = group + ' ' + name + ' ' + description;

    if (setId === 'nurse') {
      return /(?:nurse|rn\\/?lpn|skilled nursing|clinical monitoring|assessment|pain|respiratory|lung|oxygen|cardiac|heart|gi\\b|gu\\b|gastro|urinary|skin|wound|foley|catheter|feeding tube|enteral|iv\\b|picc|vascular access|diabetes|blood glucose|insulin|medication reconciliation|treatment|intervention|patient education|provider notification|change of condition|escalation|care plan|narrative|neurolog|seizure|intake|output|mobility|fall risk|temperature|pulse|blood pressure|spo2|weight)/.test(text);
    }
    if (setId === 'vitals') {
      return /(?:vital|temperature|pulse|respiration|blood pressure|spo2|oxygen saturation|weight|pain score|pain location|clinical monitoring|general appearance|level of consciousness|orientation)/.test(text);
    }
    if (setId === 'respiratory') {
      return /(?:respiratory|lung sound|oxygen|spo2|breath|cough|sputum|trach)/.test(text);
    }
    if (setId === 'woundDevices') {
      return /(?:skin|wound|incision|pressure injury|catheter|foley|feeding tube|enteral|iv\\b|picc|infusion|vascular access|line|device)/.test(text);
    }
    if (setId === 'diabetes') {
      return /(?:blood glucose|diabetes|insulin|hypogly|hypergly)/.test(text);
    }
    if (setId === 'neuro') {
      return /(?:seizure|neurolog|postictal|orientation|level of consciousness|confus|rescue medication|midazolam)/.test(text);
    }
    if (setId === 'io') {
      return /(?:intake|output|urine|urinary|bowel|stool|gi\\b|gu\\b|hydration|fluid|continence|ostomy|constipation|diarrhea)/.test(text);
    }
    if (setId === 'medTreatment') {
      return /(?:medication|treatment|prn|reconciliation|adherence|drug|dose|emar|pharmacy|intervention|patient education|provider notification)/.test(text);
    }
    if (setId === 'mobility') {
      return /(?:mobility|transfer|reposition|positioning|fall risk|assistive device|bedbound)/.test(text);
    }
    return false;
  }

  function spireRowsForFlowsheetSet(rows, setId, flowGroup) {
    if (setId === 'dsp') {
      return rows.filter(row => (row.groupName || 'Other') === flowGroup);
    }
    return rows
      .filter(row => spireFlowsheetRowMatchesSet(row, setId))
      .map(row => {
        const groupName = String(row.groupName || 'Other').trim();
        const rowName = String(row.name || '').trim();
        return { ...row, name: groupName && rowName && !rowName.toLowerCase().startsWith(groupName.toLowerCase()) ? groupName + ' · ' + rowName : rowName };
      });
  }
`;

const oldRenderLead = `  function renderFlowsheet(host) {
    const data = state.flowsheet || {};
    const rows = asArray(data.rows);
    const groups = [...new Set(rows.map(row=>row.groupName||'Other'))];
    if (!groups.includes(state.flowGroup)) state.flowGroup = groups[0] || '';
    const groupRows = rows.filter(row => (row.groupName||'Other') === state.flowGroup);
    const entries = asArray(data.entries);`;

const newRenderLead = `  function renderFlowsheet(host) {
    const data = state.flowsheet || {};
    const rows = asArray(data.rows);
    const groups = [...new Set(rows.map(row=>row.groupName||'Other'))];
    const selectedFlowSet = spireSelectedFlowsheetSet();
    if (!groups.includes(state.flowGroup)) state.flowGroup = groups[0] || '';
    const groupRows = spireRowsForFlowsheetSet(rows, selectedFlowSet, state.flowGroup);
    host.dataset.spireFlowsheetSet = selectedFlowSet;
    const entries = asArray(data.entries);`;

const openGroupAnchor = `  window.openFlowsheetGroup = openFlowsheetGroup;`;
const openGroupReplacement = `  window.openFlowsheetGroup = openFlowsheetGroup;

  document.addEventListener('spire:flowsheet-set-change', () => {
    const host = $('#flowsheets-view');
    if (!host || !state.flowsheet) return;
    renderFlowsheet(host);
  });`;

let patched = 0;
for (const relative of files) {
  const filePath = path.join(root, relative);
  let html;
  try {
    html = await readFile(filePath, 'utf8');
  } catch (_) {
    continue;
  }

  if (html.includes(marker)) continue;
  if (!html.includes(oldRenderLead) || !html.includes(openGroupAnchor)) {
    if (relative === 'spire/master.html') {
      throw new Error(`SPIRE V10 native Flowsheet patch could not find renderer anchors in ${relative}`);
    }
    continue;
  }

  html = html.replace(oldRenderLead, `${helper}\n${newRenderLead}`);
  html = html.replace(openGroupAnchor, openGroupReplacement);
  await writeFile(filePath, html, 'utf8');
  patched += 1;
}

const master = await readFile(path.join(root, 'spire', 'master.html'), 'utf8');
for (const required of [
  marker,
  'spireSelectedFlowsheetSet',
  'spireRowsForFlowsheetSet',
  "document.addEventListener('spire:flowsheet-set-change'",
  "host.dataset.spireFlowsheetSet = selectedFlowSet",
]) {
  if (!master.includes(required)) throw new Error(`SPIRE V10 native Flowsheet renderer missing ${required}`);
}

console.log(`SPIRE native Flowsheet set renderer V10 ready (${patched} source file${patched === 1 ? '' : 's'} patched).`);
