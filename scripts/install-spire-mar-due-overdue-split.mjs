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
const ACTIVE_ORDER_MARKER = 'SPIRE_MAR_ACTIVE_ORDERS_ONLY_V1';
const DUE_WINDOW_MARKER = 'SPIRE_MAR_DUE_WINDOW_60_MIN_V1';
const CONTINUITY_MARKER = 'SPIRE_MAR_CONTINUITY_V2';
const OVERDUE_SCROLL_MARKER = 'SPIRE_MAR_OVERDUE_SCROLL_V1';
const FILTER_LAYOUT_MARKER = 'SPIRE_MAR_DUE_OVERDUE_FILTER_LAYOUT_V1';
const TIMELINE_URL = '/assets/spire-mar-timeline.js?v=20260816-due-overdue-split-4';
const CONTINUITY_URL = '/assets/spire-mar-continuity.js?v=20260816-overdue-scroll-1';

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

function patchActiveOrderFilter(source, label) {
  if (source.includes(ACTIVE_ORDER_MARKER)) return source;
  const anchor = "  function medicationMatchesFilter(med) {\n    switch (currentFilter) {";
  if (!source.includes(anchor)) throw new Error(`${label}: MAR medication filter anchor not found`);
  return source.replace(anchor, `  // ${ACTIVE_ORDER_MARKER}: current/future MAR grids contain only active medication orders.
  // Historical dates remain viewable for audit history even after an order is later discontinued.
  function currentMarOrderIsActive(med) {
    if (currentDate < localDateInput()) return true;
    const status = clean(
      med?.orderStatus
      || med?.medicationOrderStatus
      || med?.medicationOrder?.status
      || med?.order?.status
      || med?.status
    ).toUpperCase();
    if (['DISCONTINUED', 'COMPLETED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'INACTIVE', 'STOPPED', 'ENDED'].includes(status)) return false;
    if (med?.active === false || med?.isActive === false || med?.isDiscontinued === true) return false;
    if (med?.medicationOrder?.active === false || med?.medicationOrder?.isActive === false || med?.medicationOrder?.isDiscontinued === true) return false;
    if (med?.order?.active === false || med?.order?.isActive === false || med?.order?.isDiscontinued === true) return false;
    return true;
  }

  function medicationMatchesFilter(med) {
    if (!currentMarOrderIsActive(med)) return false;
    switch (currentFilter) {`);
}

function patchTimeline(source, label) {
  if (source.includes(TIMELINE_MARKER)) return patchActiveOrderFilter(source, label);
  if (!source.includes('SPIRE_MAR_TIMELINE_V4')) throw new Error(`${label}: MAR Timeline V4 marker missing`);

  let next = source.replace(
    '  // SPIRE_MAR_TIMELINE_V4\n',
    `  // SPIRE_MAR_TIMELINE_V4\n  // ${TIMELINE_MARKER}\n  // ${DUE_WINDOW_MARKER}\n`,
  );

  const unresolvedPattern = /  function unresolvedDue\(med\) \{[\s\S]*?\n  \}\n\n  function medicationMatchesFilter\(med\) \{/;
  if (!unresolvedPattern.test(next)) throw new Error(`${label}: unresolvedDue block not found`);
  next = next.replace(unresolvedPattern, `  const DUE_WINDOW_MS = 60 * 60 * 1000;

  function occurrenceMoment(med, hour, due, administration) {
    const persisted = new Date(administration?.scheduledFor || administration?.scheduledAt || administration?.dueAt || '');
    if (!Number.isNaN(persisted.getTime())) return persisted;
    return new Date(\`${'${currentDate}'}T${'${String(hour).padStart(2, \'0\')}'}:${'${String(due?.minute || 0).padStart(2, \'0\')}'}:00\`);
  }

  function isResolvedAdministration(status) {
    return ['GIVEN', 'REFUSED', 'HELD', 'MISSED', 'NOT_GIVEN'].includes(clean(status).toUpperCase());
  }

  // Due means the unresolved scheduled occurrence is within one hour before or after now.
  // A future dose later than one hour away stays Scheduled, and a dose more than one hour late moves to Overdue.
  function unresolvedDue(med) {
    const now = new Date();
    const today = localDateInput(now);
    if (currentDate !== today) return false;
    return HOURS.some((hour) => {
      const due = dueTimeForHour(med, hour);
      const administration = administrationForHour(med, hour);
      if (!due && !administration) return false;
      if (isResolvedAdministration(administration?.status)) return false;
      const moment = occurrenceMoment(med, hour, due, administration);
      if (Number.isNaN(moment.getTime())) return false;
      const delta = moment.getTime() - now.getTime();
      return delta >= -DUE_WINDOW_MS && delta <= DUE_WINDOW_MS;
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
      return currentDate < today || (currentDate === today && moment.getTime() < now.getTime() - DUE_WINDOW_MS);
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
    "    const overdue = (currentDate < localDateInput(now) || (selectedToday && dueMoment.getTime() < now.getTime() - DUE_WINDOW_MS)) && (due || administration) && !['GIVEN', 'REFUSED', 'HELD', 'MISSED', 'NOT_GIVEN'].includes(status);",
  );
  if (!next.includes('dueMoment.getTime() < now.getTime() - DUE_WINDOW_MS')) throw new Error(`${label}: 60-minute overdue threshold was not installed`);

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

  return patchActiveOrderFilter(next, label);
}

function patchContinuity(source, label) {
  let next = source;
  if (!next.includes(CONTINUITY_MARKER)) {
    if (!next.includes('SPIRE_MAR_CONTINUITY_V1')) throw new Error(`${label}: continuity V1 marker missing`);
    next = next.replace('  // SPIRE_MAR_CONTINUITY_V1\n', `  // SPIRE_MAR_CONTINUITY_V1\n  // ${CONTINUITY_MARKER}\n`);
  }

  if (!next.includes(OVERDUE_SCROLL_MARKER)) {
    next = next.replace(`  // ${CONTINUITY_MARKER}\n`, `  // ${CONTINUITY_MARKER}\n  // ${OVERDUE_SCROLL_MARKER}\n`);
    const listCss = '      .spire-mar-overdue-list{display:flex;gap:6px;overflow-x:auto;padding:6px 9px}';
    const itemCss = '      .spire-mar-overdue-item{min-width:220px;max-width:300px;border:1px solid #d5b0b0;border-left:4px solid #c43c42;border-radius:2px;background:#fff;padding:6px 7px;color:#553333}';
    if (!next.includes(listCss) || !next.includes(itemCss)) throw new Error(`${label}: overdue queue CSS anchors not found`);
    next = next.replace(
      listCss,
      '      .spire-mar-overdue-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px;width:100%;max-width:100%;max-height:255px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;padding:6px 9px}',
    );
    next = next.replace(
      itemCss,
      '      .spire-mar-overdue-item{min-width:0;max-width:none;border:1px solid #d5b0b0;border-left:4px solid #c43c42;border-radius:2px;background:#fff;padding:6px 7px;color:#553333}',
    );
    next = next.replace(
      '@media(max-width:1100px){.spire-mar-day-context{flex-wrap:wrap}.spire-mar-overdue-list{max-width:100vw}}',
      '@media(max-width:1100px){.spire-mar-day-context{flex-wrap:wrap}.spire-mar-overdue-list{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));max-width:100%;max-height:300px}}',
    );
  }

  next = next.replace(
    '<div class="spire-mar-overdue-head"><strong>Past Due / Overdue from prior days: ${total}</strong><span>These remain historical occurrences. They do not block today\'s MAR.</span>',
    '<div class="spire-mar-overdue-head"><strong>Prior-day overdue occurrences: ${total}</strong><span>Scroll inside this section to review every historical overdue dose. These never replace today\'s doses.</span>',
  );

  const loadStart = "  async function loadOverdue(host) {\n    if (selectedDate(host) !== localDateInput()) {";
  if (!next.includes(loadStart)) throw new Error(`${label}: loadOverdue entry not found`);
  next = next.replace(loadStart, `  async function loadOverdue(host) {
    const overdueFilterActive = Boolean(host.querySelector('[data-mar-filter="overdue"].active'));
    if (selectedDate(host) !== localDateInput() || !overdueFilterActive) {`);

  next = next.replace('    priorOverdueQueue: true,', '    priorOverdueQueue: \'overdue-filter-only\',');
  if (!next.includes("priorOverdueQueue: 'overdue-filter-only'")) throw new Error(`${label}: overdue queue contract was not updated`);
  if (!next.includes("[data-mar-filter=\"overdue\"].active")) throw new Error(`${label}: overdue queue is not gated by the Overdue filter`);
  if (!next.includes('max-height:255px;overflow-y:auto')) throw new Error(`${label}: overdue queue vertical scrolling was not installed`);

  return next;
}

function installFilterLayout(html, label) {
  const style = `  <style data-spire-mar-due-overdue-layout="${FILTER_LAYOUT_MARKER}">
    /* Keep Due and Overdue independently visible even when the chart center is narrow between sidebars. */
    #mar-view .spire-mar-filterbar{display:flex!important;align-items:center!important;gap:5px 8px!important;flex-wrap:wrap!important;height:auto!important;min-height:31px!important;overflow:visible!important}
    #mar-view .spire-mar-filterset{display:flex!important;align-items:center!important;gap:0!important;flex:1 1 440px!important;min-width:0!important;flex-wrap:wrap!important;overflow:visible!important}
    #mar-view .spire-mar-filter-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important;flex:1 1 430px!important;min-width:0!important;flex-wrap:wrap!important;margin-left:auto!important;overflow:visible!important}
    #mar-view [data-mar-filter="due"],#mar-view [data-mar-filter="overdue"]{display:inline-flex!important;visibility:visible!important;opacity:1!important;flex:0 0 auto!important}
    #mar-view .spire-mar-overdue-queue{min-width:0!important;max-width:100%!important;overflow:hidden!important}
    #mar-view .spire-mar-overdue-list{min-width:0!important;max-width:100%!important}
  </style>`;
  let next = html.replace(new RegExp(`\\s*<style[^>]*data-spire-mar-due-overdue-layout=["']${FILTER_LAYOUT_MARKER}["'][\\s\\S]*?<\\/style>\\s*`, 'g'), '\n');
  if (!next.includes('</head>')) throw new Error(`${label}: cannot publish MAR Due/Overdue layout without </head>`);
  next = next.replace('</head>', `${style}\n</head>`);
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
  html = html.replace(/\/assets\/spire-mar-continuity\.js(?:\?v=[^"']+)?/g, CONTINUITY_URL);
  html = installFilterLayout(html, path.relative(root, file));
  await writeFile(file, html, 'utf8');
}

const timelineRequirements = [TIMELINE_MARKER, ACTIVE_ORDER_MARKER, DUE_WINDOW_MARKER, 'DUE_WINDOW_MS', 'delta >= -DUE_WINDOW_MS && delta <= DUE_WINDOW_MS', 'currentMarOrderIsActive', "'DISCONTINUED'", 'data-mar-filter="due">Due</button>', 'data-mar-filter="overdue">Overdue</button>', "case 'overdue': return unresolvedOverdue(med);", 'dueMoment.getTime() < now.getTime() - DUE_WINDOW_MS'];
const continuityRequirements = [CONTINUITY_MARKER, OVERDUE_SCROLL_MARKER, 'Prior-day overdue occurrences', 'max-height:255px;overflow-y:auto', "priorOverdueQueue: 'overdue-filter-only'", '[data-mar-filter="overdue"].active'];

const finalTimeline = await readFile(path.join(root, 'assets', 'spire-mar-timeline.js'), 'utf8');
const finalContinuity = await readFile(path.join(root, 'assets', 'spire-mar-continuity.js'), 'utf8');
for (const required of timelineRequirements) {
  if (!finalTimeline.includes(required)) throw new Error(`Final MAR timeline missing ${required}`);
}
for (const required of continuityRequirements) {
  if (!finalContinuity.includes(required)) throw new Error(`Final MAR continuity missing ${required}`);
}

const publishedTimelinePath = path.join(dist, 'assets', 'spire-mar-timeline.js');
if (await exists(publishedTimelinePath)) {
  const publishedTimeline = await readFile(publishedTimelinePath, 'utf8');
  for (const required of timelineRequirements) {
    if (!publishedTimeline.includes(required)) throw new Error(`Published MAR timeline missing ${required}`);
  }
  new Function(publishedTimeline);
}

const publishedContinuityPath = path.join(dist, 'assets', 'spire-mar-continuity.js');
if (await exists(publishedContinuityPath)) {
  const publishedContinuity = await readFile(publishedContinuityPath, 'utf8');
  for (const required of continuityRequirements) {
    if (!publishedContinuity.includes(required)) throw new Error(`Published MAR continuity missing ${required}`);
  }
  new Function(publishedContinuity);
}

const publishedMasterPath = path.join(dist, 'spire', 'master.html');
if (await exists(publishedMasterPath)) {
  const publishedMaster = await readFile(publishedMasterPath, 'utf8');
  for (const required of [TIMELINE_URL, FILTER_LAYOUT_MARKER]) {
    if (!publishedMaster.includes(required)) throw new Error(`Published SPIRE master missing ${required}`);
  }
}

new Function(finalTimeline);
new Function(finalContinuity);
console.log('SPIRE MAR Due/Overdue split installed: Due shows only unresolved doses within the 60-minute window before or after the scheduled time; doses more than 60 minutes late move to Overdue; current/future MAR grids exclude discontinued/completed/inactive medication orders; prior-day overdue history is vertically scrollable in the Overdue view; and the final published timeline/continuity/master assets are verified.');