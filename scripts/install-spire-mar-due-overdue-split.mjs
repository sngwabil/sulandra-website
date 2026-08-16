import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const timelineTargets = [
  path.join(root, 'assets', 'spire-mar-timeline.js'),
  path.join(dist, 'assets', 'spire-mar-timeline.js'),
];
const continuityTargets = [
  path.join(root, 'assets', 'spire-mar-continuity.js'),
  path.join(dist, 'assets', 'spire-mar-continuity.js'),
];
const masterTargets = [
  path.join(root, 'spire', 'master.html'),
  path.join(dist, 'spire', 'master.html'),
];

const TIMELINE_MARKER = 'SPIRE_MAR_DUE_OVERDUE_SPLIT_V1';
const CONTINUITY_MARKER = 'SPIRE_MAR_CONTINUITY_V2';
const TIMELINE_URL = '/assets/spire-mar-timeline.js?v=20260816-due-overdue-split-1';

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

function patchTimeline(source, label) {
  if (source.includes(TIMELINE_MARKER)) return source;
  if (!source.includes('SPIRE_MAR_TIMELINE_V4')) throw new Error(`${label}: MAR Timeline V4 marker missing`);

  let next = source.replace(
    '  // SPIRE_MAR_TIMELINE_V4\n',
    `  // SPIRE_MAR_TIMELINE_V4\n  // ${TIMELINE_MARKER}\n`,
  );

  const unresolvedPattern = /  function unresolvedDue\(med\) \{[\s\S]*?\n  \}\n\n  function medicationMatchesFilter\(med\) \{/;
  if (!unresolvedPattern.test(next)) throw new Error(`${label}: unresolvedDue block not found`);
  next = next.replace(unresolvedPattern, `  function occurrenceMoment(med, hour, due, administration) {
    const persisted = new Date(administration?.scheduledFor || administration?.scheduledAt || administration?.dueAt || '');
    if (!Number.isNaN(persisted.getTime())) return persisted;
    return new Date(\`${'${currentDate}'}T${'${String(hour).padStart(2, \'0\')}'}:${'${String(due?.minute || 0).padStart(2, \'0\')}'}:00\`);
  }

  function isResolvedAdministration(status) {
    return ['GIVEN', 'REFUSED', 'HELD', 'MISSED', 'NOT_GIVEN'].includes(clean(status).toUpperCase());
  }

  function unresolvedDue(med) {
    const now = new Date();
    const today = localDateInput(now);
    return HOURS.some((hour) => {
      const due = dueTimeForHour(med, hour);
      const administration = administrationForHour(med, hour);
      if (!due && !administration) return false;
      if (isResolvedAdministration(administration?.status)) return false;
      const moment = occurrenceMoment(med, hour, due, administration);
      if (Number.isNaN(moment.getTime())) return false;
      if (currentDate < today) return false;
      return moment >= now;
    });
  }

  function unresolvedOverdue(med) {
    const now = new Date();
    const today = localDateInput(now);
    return HOURS.some((hour) => {
      const due = dueTimeForHour(med, hour);
      const administration = administrationForHour(med, hour);
      if (!due && !administration) return false;
      if (isResolvedAdministration(administration?.status)) return false;
      const moment = occurrenceMoment(med, hour, due, administration);
      if (Number.isNaN(moment.getTime())) return false;
      return currentDate < today || (currentDate === today && moment < now);
    });
  }

  function medicationMatchesFilter(med) {`);

  next = next.replace(
    "      case 'due': return unresolvedDue(med);\n      default: return true;",
    "      case 'due': return unresolvedDue(med);\n      case 'overdue': return unresolvedOverdue(med);\n      default: return true;",
  );
  if (!next.includes("case 'overdue': return unresolvedOverdue(med);")) throw new Error(`${label}: Overdue medication filter was not installed`);

  next = next.replace(
    "    const overdue = selectedToday && dueMoment < now && (due || administration) && !['GIVEN', 'REFUSED', 'HELD', 'MISSED', 'NOT_GIVEN'].includes(status);",
    "    const overdue = (currentDate < localDateInput(now) || (selectedToday && dueMoment < now)) && (due || administration) && !['GIVEN', 'REFUSED', 'HELD', 'MISSED', 'NOT_GIVEN'].includes(status);",
  );
  if (!next.includes('currentDate < localDateInput(now) || (selectedToday && dueMoment < now)')) throw new Error(`${label}: historical-day overdue cells were not installed`);

  next = next.replace(
    "          <button class=\"spire-mar-filter ${currentFilter === 'due' ? 'active' : ''}\" data-mar-filter=\"due\">Due/Overdue Meds</button>",
    "          <button class=\"spire-mar-filter ${currentFilter === 'due' ? 'active' : ''}\" data-mar-filter=\"due\">Due</button>\n          <button class=\"spire-mar-filter ${currentFilter === 'overdue' ? 'active' : ''}\" data-mar-filter=\"overdue\">Overdue</button>",
  );
  if (!next.includes('data-mar-filter="overdue">Overdue</button>')) throw new Error(`${label}: separate Overdue button was not installed`);
  if (next.includes('>Due/Overdue Meds</button>')) throw new Error(`${label}: combined Due/Overdue filter still exists`);

  const cellReturn = "    return `<button type=\"button\" class=\"spire-mar-hour-cell ${esc(model.kind)}\" data-mar-med=\"${esc(medicationId)}\" data-mar-hour=\"${hour}\" data-mar-scheduled=\"${esc(model.scheduledFor)}\" title=\"${esc(title)}\" ${canAdminister ? '' : 'disabled'}>\n      <span class=\"spire-mar-cell-label\">${esc(model.label)}</span>\n      ${model.sub ? `<span class=\"spire-mar-cell-sub\">${esc(model.sub)}</span>` : ''}\n    </button>`;";
  if (!next.includes(cellReturn)) throw new Error(`${label}: MAR cell renderer signature changed; refusing unsafe patch`);
  next = next.replace(cellReturn, `    const hiddenByDueMode = currentFilter === 'due' && model.kind !== 'due';
    const hiddenByOverdueMode = currentFilter === 'overdue' && model.kind !== 'overdue';
    if (hiddenByDueMode || hiddenByOverdueMode) {
      return \`<button type="button" class="spire-mar-hour-cell blank" tabindex="-1" disabled aria-hidden="true"></button>\`;
    }
    return \`<button type="button" class="spire-mar-hour-cell ${'${esc(model.kind)}'}" data-mar-med="${'${esc(medicationId)}'}" data-mar-hour="${'${hour}'}" data-mar-scheduled="${'${esc(model.scheduledFor)}'}" title="${'${esc(title)}'}" ${'${canAdminister ? \'\' : \'disabled\'}'}>
      <span class="spire-mar-cell-label">${'${esc(model.label)}'}</span>
      ${'${model.sub ? `<span class="spire-mar-cell-sub">${esc(model.sub)}</span>` : \'\'}'}
    </button>\`;`);

  return next;
}

function patchContinuity(source, label) {
  let next = source;
  if (!next.includes(CONTINUITY_MARKER)) {
    if (!next.includes('SPIRE_MAR_CONTINUITY_V1')) throw new Error(`${label}: continuity V1 marker missing`);
    next = next.replace('  // SPIRE_MAR_CONTINUITY_V1\n', `  // SPIRE_MAR_CONTINUITY_V1\n  // ${CONTINUITY_MARKER}\n`);
  }

  next = next.replace(
    '<div class="spire-mar-overdue-head"><strong>Past Due / Overdue from prior days: ${total}</strong><span>These remain historical occurrences. They do not block today\'s MAR.</span>',
    '<div class="spire-mar-overdue-head"><strong>Prior-day overdue occurrences: ${total}</strong><span>Historical overdue doses are shown only in the Overdue view and never replace today\'s doses.</span>',
  );

  const loadStart = "  async function loadOverdue(host) {\n    if (selectedDate(host) !== localDateInput()) {";
  if (!next.includes(loadStart)) throw new Error(`${label}: loadOverdue entry not found`);
  next = next.replace(loadStart, `  async function loadOverdue(host) {
    const overdueFilterActive = Boolean(host.querySelector('[data-mar-filter="overdue"].active'));
    if (selectedDate(host) !== localDateInput() || !overdueFilterActive) {`);

  next = next.replace('    priorOverdueQueue: true,', '    priorOverdueQueue: \'overdue-filter-only\',');
  if (!next.includes("priorOverdueQueue: 'overdue-filter-only'")) throw new Error(`${label}: overdue queue contract was not updated`);
  if (!next.includes("[data-mar-filter=\"overdue\"].active")) throw new Error(`${label}: overdue queue is not gated by the Overdue filter`);

  return next;
}

for (const file of timelineTargets) {
  if (!(await exists(file))) continue;
  const source = await readFile(file, 'utf8');
  const next = patchTimeline(source, path.relative(root, file));
  if (next !== source) await writeFile(file, next, 'utf8');
}

for (const file of continuityTargets) {
  if (!(await exists(file))) continue;
  const source = await readFile(file, 'utf8');
  const next = patchContinuity(source, path.relative(root, file));
  if (next !== source) await writeFile(file, next, 'utf8');
}

for (const file of masterTargets) {
  if (!(await exists(file))) continue;
  let html = await readFile(file, 'utf8');
  html = html.replace(/\/assets\/spire-mar-timeline\.js(?:\?v=[^"']+)?/g, TIMELINE_URL);
  await writeFile(file, html, 'utf8');
}

const finalTimeline = await readFile(path.join(root, 'assets', 'spire-mar-timeline.js'), 'utf8');
const finalContinuity = await readFile(path.join(root, 'assets', 'spire-mar-continuity.js'), 'utf8');
for (const required of [TIMELINE_MARKER, 'data-mar-filter="due">Due</button>', 'data-mar-filter="overdue">Overdue</button>', "case 'overdue': return unresolvedOverdue(med);", 'currentDate < localDateInput(now)']) {
  if (!finalTimeline.includes(required)) throw new Error(`Final MAR timeline missing ${required}`);
}
for (const required of [CONTINUITY_MARKER, 'Prior-day overdue occurrences', "priorOverdueQueue: 'overdue-filter-only'", '[data-mar-filter="overdue"].active']) {
  if (!finalContinuity.includes(required)) throw new Error(`Final MAR continuity missing ${required}`);
}
new Function(finalTimeline);
new Function(finalContinuity);
console.log('SPIRE MAR Due/Overdue split installed: Due and Overdue are separate filters, current selected-day overdue doses remain in the hourly grid, and prior-day overdue history appears only when Overdue is selected.');
