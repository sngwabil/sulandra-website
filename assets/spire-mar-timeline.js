(() => {
  'use strict';

  // SPIRE_MAR_TIMELINE_V4
  // SPIRE_MAR_TIMELINE_V3
  // SPIRE_MAR_EPIC_PRESENTATION_V2
  // The canonical SPIRE MAR loader remains authoritative. This enhancement does not
  // monkey-patch loadMarView or medication APIs; it renders the same live eMAR data in
  // a compact hourly workstation and posts actions through the existing audited eMAR route.

  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const HOUR_WIDTH = 82;
  const MED_COLUMN_WIDTH = 320;
  const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  let renderTimer = 0;
  let renderSerial = 0;
  let currentData = null;
  let currentDate = '';
  let currentFilter = 'all';
  let showLegend = true;
  let showDetails = true;
  let hideAdmins = false;
  let mutationObserver = null;

  function token() {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of TOKEN_KEYS) {
        const value = storage.getItem(key);
        if (value) return value;
      }
    }
    return '';
  }

  async function api(path, options = {}) {
    if (typeof window.api === 'function') return window.api(path, options);
    const body = options.body;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (body != null && !isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token() && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token()}`);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, {
      ...options,
      headers,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `Request failed (${response.status})`);
    return payload?.data ?? payload;
  }

  function patientId() {
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const query = new URLSearchParams(location.search);
    return hash.get('patient') || query.get('patientId') || sessionStorage.getItem('spire:patientId') || '';
  }

  function localDateInput(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function hhmm(dateValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function displayDate(dateText) {
    const date = new Date(`${dateText}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateText;
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
  }

  function normalizeDueTimes(value) {
    if (Array.isArray(value)) return value.flatMap(normalizeDueTimes).filter(Boolean);
    if (value && typeof value === 'object') {
      return Object.values(value).flatMap(normalizeDueTimes).filter(Boolean);
    }
    const raw = clean(value);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (parsed !== raw) return normalizeDueTimes(parsed);
    } catch {}
    return Array.from(raw.matchAll(/(?:^|\D)([01]\d|2[0-3]):([0-5]\d)(?:$|\D)/g), (match) => `${match[1]}:${match[2]}`);
  }

  function scheduledIso(date, hour, minute = 0) {
    const dateObject = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
    return Number.isNaN(dateObject.getTime()) ? '' : dateObject.toISOString();
  }

  function medicationDetails(med) {
    return [med.dose, med.route, med.frequency].map(clean).filter(Boolean).join(' · ');
  }

  function administrationsOf(med) {
    const value = med.administrations || med.events || med.medicationAdministrationEvents || [];
    return Array.isArray(value) ? value : [];
  }

  function administrationForHour(med, hour) {
    const administrations = administrationsOf(med);
    const exact = administrations.find((item) => {
      const scheduled = new Date(item.scheduledFor || item.scheduledAt || item.dueAt || '');
      return !Number.isNaN(scheduled.getTime()) && scheduled.getHours() === hour;
    });
    if (exact) return exact;
    return null;
  }

  function dueTimeForHour(med, hour) {
    const dueTimes = normalizeDueTimes(med.dueTimes || med.schedule || med.scheduledTimes || med.times);
    const found = dueTimes.find((time) => Number(time.slice(0, 2)) === hour);
    if (!found) return null;
    return { text: found, minute: Number(found.slice(3, 5)) || 0 };
  }

  function isPrn(med) {
    return /\bPRN\b|AS NEEDED/i.test(`${med.frequency || ''} ${med.instructions || ''}`);
  }

  function isContinuous(med) {
    return /CONTINUOUS|CONT\.?\b/i.test(`${med.frequency || ''} ${med.instructions || ''}`);
  }

  function isRespiratory(med) {
    return /RESPIRATORY|INHAL|NEBUL|PUFF|AEROSOL/i.test(`${med.name || ''} ${med.route || ''} ${med.instructions || ''}`);
  }

  function unresolvedDue(med) {
    const now = new Date();
    const selectedToday = currentDate === localDateInput(now);
    return HOURS.some((hour) => {
      const due = dueTimeForHour(med, hour);
      const administration = administrationForHour(med, hour);
      const status = clean(administration?.status).toUpperCase();
      if (!due && !administration) return false;
      if (['GIVEN', 'REFUSED', 'HELD', 'MISSED', 'NOT_GIVEN'].includes(status)) return false;
      if (!selectedToday) return Boolean(due || administration);
      const dueDate = new Date(`${currentDate}T${String(hour).padStart(2, '0')}:${String(due?.minute || 0).padStart(2, '0')}:00`);
      return dueDate <= now;
    });
  }

  function medicationMatchesFilter(med) {
    switch (currentFilter) {
      case 'scheduled': return !isPrn(med) && !isContinuous(med);
      case 'prn': return isPrn(med);
      case 'continuous': return isContinuous(med);
      case 'respiratory': return isRespiratory(med);
      case 'due': return unresolvedDue(med);
      default: return true;
    }
  }

  function cellModel(med, hour) {
    const administration = administrationForHour(med, hour);
    const due = dueTimeForHour(med, hour);
    const status = clean(administration?.status || '').toUpperCase();
    const scheduled = administration?.scheduledFor ? new Date(administration.scheduledFor) : null;
    const scheduledMinute = scheduled && !Number.isNaN(scheduled.getTime()) ? scheduled.getMinutes() : (due?.minute || 0);
    const scheduledLabel = scheduled && !Number.isNaN(scheduled.getTime()) ? hhmm(scheduled) : `${String(hour).padStart(2, '0')}${String(scheduledMinute).padStart(2, '0')}`;
    const scheduledFor = administration?.scheduledFor || scheduledIso(currentDate, hour, scheduledMinute);
    const administeredAt = administration?.administeredAt || administration?.documentedAt || null;
    const actualLabel = administeredAt ? hhmm(administeredAt) : '';
    const dose = clean(med.dose || administration?.administeredDose || '');
    const now = new Date();
    const selectedToday = currentDate === localDateInput(now);
    const dueMoment = new Date(`${currentDate}T${String(hour).padStart(2, '0')}:${String(scheduledMinute).padStart(2, '0')}:00`);
    const overdue = selectedToday && dueMoment < now && (due || administration) && !['GIVEN', 'REFUSED', 'HELD', 'MISSED', 'NOT_GIVEN'].includes(status);

    if (status === 'GIVEN') return { kind: 'given', label: `${actualLabel || scheduledLabel} Given`, sub: dose, scheduledFor, administration };
    if (status === 'REFUSED') return { kind: 'refused', label: `${actualLabel || scheduledLabel} Refused`, sub: '', scheduledFor, administration };
    if (status === 'HELD') return { kind: 'held', label: `${actualLabel || scheduledLabel} Held`, sub: '', scheduledFor, administration };
    if (status === 'MISSED' || status === 'NOT_GIVEN') return { kind: 'missed', label: `${scheduledLabel} Not Given`, sub: '', scheduledFor, administration };
    if (due || administration) return { kind: overdue ? 'overdue' : 'due', label: `${scheduledLabel} ${overdue ? 'Overdue' : 'Due'}`, sub: '', scheduledFor, administration };
    return { kind: 'blank', label: '', sub: '', scheduledFor: scheduledIso(currentDate, hour, 0), administration: null };
  }

  function lastAdministrationText(med) {
    const completed = administrationsOf(med)
      .filter((item) => clean(item.status).toUpperCase() === 'GIVEN' && item.administeredAt)
      .sort((a, b) => new Date(b.administeredAt) - new Date(a.administeredAt));
    if (!completed[0]) return 'No administration documented';
    const date = new Date(completed[0].administeredAt);
    return `Last Admin: ${date.toLocaleDateString()} ${hhmm(date)} (Given)`;
  }

  function cellHtml(med, hour, canAdminister) {
    const model = cellModel(med, hour);
    const medicationId = clean(med.medicationOrderId || med.id || med.order?.id);
    const title = model.kind === 'blank'
      ? `Document an action at ${String(hour).padStart(2, '0')}00`
      : `${model.label}${model.sub ? ` ${model.sub}` : ''}`;
    return `<button type="button" class="spire-mar-hour-cell ${esc(model.kind)}" data-mar-med="${esc(medicationId)}" data-mar-hour="${hour}" data-mar-scheduled="${esc(model.scheduledFor)}" title="${esc(title)}" ${canAdminister ? '' : 'disabled'}>
      <span class="spire-mar-cell-label">${esc(model.label)}</span>
      ${model.sub ? `<span class="spire-mar-cell-sub">${esc(model.sub)}</span>` : ''}
    </button>`;
  }

  function medicationRowHtml(med, canAdminister) {
    const dueTimes = normalizeDueTimes(med.dueTimes || med.schedule || med.scheduledTimes || med.times);
    const categories = [isPrn(med) ? 'PRN' : 'Scheduled', isContinuous(med) ? 'Continuous' : '', isRespiratory(med) ? 'Respiratory' : ''].filter(Boolean);
    return `<section class="spire-mar-medication-row" data-filter-tags="${esc(categories.join(' ').toLowerCase())}">
      <div class="spire-mar-grid-row">
        <div class="spire-mar-medication-summary">
          <div class="spire-mar-med-name">${esc(med.name || med.medicationName || 'Medication')}</div>
          <div class="spire-mar-med-details">${esc(medicationDetails(med) || med.instructions || '')}</div>
          ${showDetails && med.instructions ? `<div class="spire-mar-med-instructions">${esc(med.instructions)}</div>` : ''}
          ${dueTimes.length ? `<div class="spire-mar-due-list">Due: ${esc(dueTimes.map((value) => value.replace(':', '')).join(', '))}</div>` : ''}
        </div>
        ${HOURS.map((hour) => cellHtml(med, hour, canAdminister)).join('')}
      </div>
      <div class="spire-mar-row-meta">
        <span>Ordered Admin Amount: <b>${esc(med.dose || 'See order')}</b></span>
        <span>${esc(lastAdministrationText(med))}</span>
        <span>Route: <b>${esc(med.route || '—')}</b></span>
      </div>
    </section>`;
  }

  function render(host, data, date) {
    currentData = data || {};
    currentDate = date;
    const medications = Array.isArray(currentData.medications) ? currentData.medications : [];
    const visible = medications.filter(medicationMatchesFilter);
    const canAdminister = currentData.medicationAdministrationAuthorized !== false;
    const now = new Date();
    const currentHour = currentDate === localDateInput(now) ? now.getHours() : -1;

    host.dataset.spireMarTimeline = 'interactive-hourly';
    host.dataset.spireMarTimelineStable = '1';
    host.dataset.spireMarEnhancing = '1';
    host.innerHTML = `<div class="spire-mar-v4">
      <div class="spire-mar-commandbar">
        <strong class="spire-mar-title">MAR</strong>
        <button type="button" class="spire-mar-command" data-mar-command="report">▧ Report</button>
        <button type="button" class="spire-mar-command" data-mar-command="note">▣ MAR Note</button>
        <button type="button" class="spire-mar-command" data-mar-command="messages">● Messages</button>
        <button type="button" class="spire-mar-command" data-mar-command="legend">▦ Legend</button>
        <button type="button" class="spire-mar-command" data-mar-command="actions">Show All Actions</button>
        <button type="button" class="spire-mar-command" data-mar-command="links">Link Lines</button>
        <span class="spire-mar-auth ${canAdminister ? 'authorized' : 'readonly'}">${canAdminister ? 'Medication administration authorized' : 'View only / qualification required'}</span>
      </div>
      <div class="spire-mar-filterbar">
        <div class="spire-mar-filterset">
          <button class="spire-mar-filter ${currentFilter === 'all' ? 'active' : ''}" data-mar-filter="all">ALL</button>
          <button class="spire-mar-filter ${currentFilter === 'scheduled' ? 'active' : ''}" data-mar-filter="scheduled">Scheduled</button>
          <button class="spire-mar-filter ${currentFilter === 'prn' ? 'active' : ''}" data-mar-filter="prn">PRN</button>
          <button class="spire-mar-filter ${currentFilter === 'continuous' ? 'active' : ''}" data-mar-filter="continuous">Continuous</button>
          <button class="spire-mar-filter ${currentFilter === 'respiratory' ? 'active' : ''}" data-mar-filter="respiratory">Respiratory</button>
          <button class="spire-mar-filter ${currentFilter === 'due' ? 'active' : ''}" data-mar-filter="due">Due/Overdue Meds</button>
        </div>
        <div class="spire-mar-filter-actions">
          <button type="button" class="spire-mar-command primary" data-mar-command="now">Go to Now</button>
          <input type="date" class="spire-mar-date" value="${esc(currentDate)}" aria-label="MAR date">
          <button type="button" class="spire-mar-command" data-mar-command="details">${showDetails ? 'Hide Details' : 'Show All Details'}</button>
          <button type="button" class="spire-mar-command" data-mar-command="admins">${hideAdmins ? 'Show Admins' : 'Hide All Admins'}</button>
        </div>
      </div>
      ${showLegend ? `<div class="spire-mar-legend">
        <span><i class="legend-swatch due"></i> Due</span>
        <span><i class="legend-swatch given"></i> Given</span>
        <span><i class="legend-swatch held"></i> Held</span>
        <span><i class="legend-swatch refused"></i> Refused / Not Given</span>
        <span class="spire-mar-date-caption">${esc(displayDate(currentDate))}</span>
      </div>` : ''}
      <div class="spire-mar-scroll" data-mar-scroll>
        <div class="spire-mar-time-header">
          <div class="spire-mar-medication-header">Medication / Order</div>
          ${HOURS.map((hour) => `<div class="spire-mar-time-label ${hour === currentHour ? 'current' : ''}" data-mar-time-hour="${hour}">${String(hour).padStart(2, '0')}00</div>`).join('')}
        </div>
        <div class="spire-mar-medication-list ${hideAdmins ? 'hide-admins' : ''}">
          ${visible.length ? visible.map((med) => medicationRowHtml(med, canAdminister)).join('') : `<div class="spire-mar-empty">No medications match this MAR view.</div>`}
        </div>
      </div>
      <div class="spire-mar-inactive-marker" hidden>Completed / Inactive Medications</div>
    </div>`;
    delete host.dataset.spireMarEnhancing;
    bindMarInteractions(host);
    if (currentDate === localDateInput()) requestAnimationFrame(() => scrollToNow(host, false));
  }

  function scrollToNow(host, smooth = true) {
    const scroll = host.querySelector('[data-mar-scroll]');
    if (!scroll) return;
    const now = new Date();
    const fraction = now.getHours() + now.getMinutes() / 60;
    const target = Math.max(0, MED_COLUMN_WIDTH + fraction * HOUR_WIDTH - scroll.clientWidth / 2);
    scroll.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
  }

  function findMedication(medicationId) {
    const medications = Array.isArray(currentData?.medications) ? currentData.medications : [];
    return medications.find((med) => clean(med.medicationOrderId || med.id || med.order?.id) === clean(medicationId));
  }

  function closeActionDialog() {
    document.querySelector('[data-spire-mar-dialog]')?.remove();
  }

  function setDialogStatus(dialog, status) {
    dialog.dataset.status = status;
    dialog.querySelectorAll('[data-mar-status]').forEach((button) => button.classList.toggle('selected', button.dataset.marStatus === status));
    const reasonWrap = dialog.querySelector('[data-mar-reason-wrap]');
    const indication = dialog.querySelector('[data-mar-indication]');
    if (reasonWrap) reasonWrap.hidden = !['REFUSED', 'HELD', 'NOT_GIVEN', 'MISSED', 'PRN_GIVEN'].includes(status);
    if (indication) indication.textContent = status === 'PRN_GIVEN' ? 'PRN indication / reason' : 'Reason';
    const save = dialog.querySelector('[data-mar-save]');
    if (save) save.textContent = status === 'GIVEN' ? 'Record Given' : 'Save MAR Action';
  }

  function openActionDialog(medicationId, scheduledFor, hour) {
    const med = findMedication(medicationId);
    if (!med) return;
    closeActionDialog();
    const due = dueTimeForHour(med, Number(hour));
    const cell = cellModel(med, Number(hour));
    const existingStatus = clean(cell.administration?.status || '').toUpperCase();
    const defaultStatus = existingStatus === 'GIVEN' ? 'GIVEN' : 'GIVEN';
    const offSchedule = !due && !cell.administration;
    const dialog = document.createElement('div');
    dialog.className = 'spire-mar-dialog-backdrop';
    dialog.dataset.spireMarDialog = '1';
    dialog.dataset.status = defaultStatus;
    dialog.innerHTML = `<div class="spire-mar-dialog" role="dialog" aria-modal="true" aria-label="MAR administration action">
      <header>
        <div><strong>${esc(med.name || 'Medication')}</strong><span>${esc(medicationDetails(med))}</span></div>
        <button type="button" class="spire-mar-dialog-close" data-mar-close aria-label="Close">×</button>
      </header>
      <main>
        <div class="spire-mar-action-context">
          <div><span>Scheduled</span><b>${esc(cell.scheduledFor ? new Date(cell.scheduledFor).toLocaleString() : `${currentDate} ${String(hour).padStart(2, '0')}00`)}</b></div>
          <div><span>Due time</span><b>${esc(due ? due.text.replace(':', '') : 'Off-schedule box')}</b></div>
          <div><span>Actual time</span><b data-mar-live-time>${esc(hhmm(new Date()))} now</b></div>
        </div>
        ${offSchedule ? '<div class="spire-mar-warning">This box is outside a documented due time. Add a note explaining the off-schedule administration.</div>' : ''}
        <label class="spire-mar-dialog-label">Choose action</label>
        <div class="spire-mar-status-grid">
          ${['GIVEN', 'REFUSED', 'HELD', 'NOT_GIVEN', 'MISSED', 'PRN_GIVEN'].map((status) => `<button type="button" data-mar-status="${status}" class="spire-mar-status ${status === defaultStatus ? 'selected' : ''}">${status.replaceAll('_', ' ')}</button>`).join('')}
        </div>
        <div class="spire-mar-dialog-fields">
          <label>Dose administered<input type="text" data-mar-dose value="${esc(med.dose || '')}"></label>
          <label>Route<input type="text" data-mar-route value="${esc(med.route || '')}"></label>
          <label data-mar-reason-wrap hidden><span data-mar-indication>Reason</span><input type="text" data-mar-reason></label>
          <label>MAR note<textarea rows="3" data-mar-note placeholder="Optional note${offSchedule ? ' — required for off-schedule Given' : ''}"></textarea></label>
        </div>
        <div class="spire-mar-server-time-note">When <b>Given</b> is saved, SPIRE records the actual administration time from the server at that moment. The due time remains unchanged for audit history.</div>
        <div class="spire-mar-dialog-error" data-mar-error hidden></div>
      </main>
      <footer><button type="button" class="spire-mar-dialog-secondary" data-mar-close>Cancel</button><button type="button" class="spire-mar-dialog-primary" data-mar-save>Record Given</button></footer>
    </div>`;
    document.body.appendChild(dialog);
    const live = dialog.querySelector('[data-mar-live-time]');
    const timer = window.setInterval(() => {
      if (!dialog.isConnected) return window.clearInterval(timer);
      if (live) live.textContent = `${hhmm(new Date())} now`;
    }, 1000);
    dialog.querySelectorAll('[data-mar-close]').forEach((button) => button.addEventListener('click', closeActionDialog));
    dialog.addEventListener('click', (event) => { if (event.target === dialog) closeActionDialog(); });
    dialog.querySelectorAll('[data-mar-status]').forEach((button) => button.addEventListener('click', () => setDialogStatus(dialog, button.dataset.marStatus)));
    dialog.querySelector('[data-mar-save]')?.addEventListener('click', async () => {
      const status = dialog.dataset.status || 'GIVEN';
      const reason = clean(dialog.querySelector('[data-mar-reason]')?.value);
      const note = clean(dialog.querySelector('[data-mar-note]')?.value);
      const errorBox = dialog.querySelector('[data-mar-error]');
      if (['REFUSED', 'HELD', 'NOT_GIVEN', 'MISSED', 'PRN_GIVEN'].includes(status) && !reason) {
        if (errorBox) { errorBox.hidden = false; errorBox.textContent = status === 'PRN_GIVEN' ? 'Enter the PRN indication before saving.' : 'Enter a reason before saving this action.'; }
        return;
      }
      if (offSchedule && status === 'GIVEN' && !note) {
        if (errorBox) { errorBox.hidden = false; errorBox.textContent = 'Add a MAR note before recording an off-schedule Given action.'; }
        return;
      }
      const saveButton = dialog.querySelector('[data-mar-save]');
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
      try {
        await api(`/api/spire/patients/${encodeURIComponent(patientId())}/emar/events`, {
          method: 'POST',
          body: JSON.stringify({
            medicationOrderId,
            scheduledFor: scheduledFor || scheduledIso(currentDate, Number(hour), due?.minute || 0),
            status,
            administeredDose: clean(dialog.querySelector('[data-mar-dose]')?.value) || null,
            administeredRoute: clean(dialog.querySelector('[data-mar-route]')?.value) || null,
            reason: reason || null,
            prnIndication: status === 'PRN_GIVEN' ? reason : null,
            note: note || null,
          }),
        });
        closeActionDialog();
        await renderFromApi(document.querySelector('#mar-view'), currentDate, { force: true });
      } catch (error) {
        if (errorBox) { errorBox.hidden = false; errorBox.textContent = error?.message || 'The MAR action could not be saved.'; }
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = status === 'GIVEN' ? 'Record Given' : 'Save MAR Action'; }
      }
    });
  }

  function bindMarInteractions(host) {
    host.querySelectorAll('[data-mar-filter]').forEach((button) => button.addEventListener('click', () => {
      currentFilter = button.dataset.marFilter || 'all';
      render(host, currentData, currentDate);
    }));
    host.querySelector('.spire-mar-date')?.addEventListener('change', (event) => {
      const date = clean(event.target.value) || localDateInput();
      renderFromApi(host, date, { force: true }).catch(showMarError);
    });
    host.querySelectorAll('[data-mar-med]').forEach((button) => button.addEventListener('click', () => {
      if (button.disabled) return;
      openActionDialog(button.dataset.marMed, button.dataset.marScheduled || '', button.dataset.marHour || '0');
    }));
    host.querySelectorAll('[data-mar-command]').forEach((button) => button.addEventListener('click', () => {
      const command = button.dataset.marCommand;
      if (command === 'now') return scrollToNow(host, true);
      if (command === 'report') return window.print();
      if (command === 'legend') { showLegend = !showLegend; return render(host, currentData, currentDate); }
      if (command === 'details' || command === 'actions') { showDetails = !showDetails; return render(host, currentData, currentDate); }
      if (command === 'admins') { hideAdmins = !hideAdmins; return render(host, currentData, currentDate); }
      if (command === 'links') { host.querySelector('.spire-mar-v4')?.classList.toggle('link-lines'); return; }
      if (command === 'note') { document.querySelector('.chart-tab[data-view="notes-view"]')?.click(); return; }
      if (command === 'messages') {
        const messageControl = Array.from(document.querySelectorAll('.comm-icon,.tool-btn,[title]')).find((node) => /message|inbox/i.test(`${node.textContent || ''} ${node.getAttribute?.('title') || ''}`));
        if (messageControl) messageControl.click();
        else window.alert('Use the S.P.I.R.E. Messages / In Basket control from the top toolbar.');
      }
    }));
  }

  function showMarError(error) {
    const host = document.querySelector('#mar-view');
    if (!host) return;
    host.innerHTML = `<div class="spire-mar-load-error"><b>MAR could not be loaded.</b><span>${esc(error?.message || error || 'Unknown error')}</span><button type="button" data-mar-retry>Retry</button></div>`;
    host.querySelector('[data-mar-retry]')?.addEventListener('click', () => renderFromApi(host, currentDate || localDateInput(), { force: true }));
  }

  async function renderFromApi(host, date = '', { force = false } = {}) {
    if (!host || !patientId()) return false;
    if (!force && host.dataset.spireMarEnhancing === '1') return false;
    const requestedDate = date || host.dataset.marDate || currentDate || localDateInput();
    const serial = ++renderSerial;
    host.dataset.marDate = requestedDate;
    host.dataset.spireMarEnhancing = '1';
    try {
      const data = await api(`/api/spire/patients/${encodeURIComponent(patientId())}/emar?date=${encodeURIComponent(requestedDate)}`);
      if (serial !== renderSerial) return false;
      render(host, data, requestedDate);
      return true;
    } catch (error) {
      delete host.dataset.spireMarEnhancing;
      if (serial === renderSerial) showMarError(error);
      return false;
    }
  }

  function scheduleRender(delay = 220) {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      const host = document.querySelector('#mar-view');
      if (!host || !host.classList.contains('active') || host.querySelector('.spire-mar-v4') || host.dataset.spireMarEnhancing === '1') return;
      renderFromApi(host, host.dataset.marDate || localDateInput()).catch(showMarError);
    }, delay);
  }

  function syncEpicTabLabels() {
    const labels = {
      'summary-view': 'Summary',
      'chart-review-view': 'Chart Review',
      'results-review-view': 'Results',
      'work-list-view': 'Work List',
      'mar-view': 'MAR',
      'flowsheets-view': 'Flowsheets',
      'intake-output-view': 'I/O',
      'notes-view': 'Notes',
      'manage-orders-view': 'Orders',
    };
    document.querySelectorAll('.chart-tab[data-view]').forEach((tab) => {
      const label = labels[tab.dataset.view];
      if (label && tab.textContent.trim() !== label) tab.textContent = label;
    });
  }

  function pcpPhotoKey() {
    return `spire:pcp-photo:${patientId() || 'unselected'}`;
  }

  function pcpInitials() {
    const name = clean(document.querySelector('#displayPCP')?.textContent).replace(/^\[|\]$/g, '');
    const words = name.split(/\s+/).filter(Boolean).slice(0, 2);
    return words.map((word) => word[0]?.toUpperCase()).join('') || 'PCP';
  }

  function renderPcpPhoto(row) {
    const image = row.querySelector('[data-pcp-photo-image]');
    const initials = row.querySelector('[data-pcp-photo-initials]');
    const name = row.querySelector('[data-pcp-photo-name]');
    const stored = localStorage.getItem(pcpPhotoKey()) || '';
    if (image) {
      image.src = stored;
      image.hidden = !stored;
    }
    if (initials) {
      initials.textContent = pcpInitials();
      initials.hidden = Boolean(stored);
    }
    if (name) name.textContent = clean(document.querySelector('#displayPCP')?.textContent) || 'Primary Care Provider';
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Unable to read that image.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Unable to open that image.'));
        image.onload = () => {
          const side = Math.min(image.naturalWidth, image.naturalHeight);
          const sx = Math.max(0, (image.naturalWidth - side) / 2);
          const sy = Math.max(0, (image.naturalHeight - side) / 2);
          const canvas = document.createElement('canvas');
          canvas.width = 180;
          canvas.height = 180;
          const context = canvas.getContext('2d');
          context.drawImage(image, sx, sy, side, side, 0, 0, 180, 180);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  function installPcpPhoto() {
    const group = document.querySelector('.sidebar-card.clinical .client-info-group');
    if (!group) return false;
    let row = group.querySelector('[data-spire-pcp-photo]');
    if (!row) {
      row = document.createElement('div');
      row.className = 'spire-pcp-profile-row';
      row.dataset.spirePcpPhoto = '1';
      row.innerHTML = `<button type="button" class="spire-pcp-photo-button" data-pcp-photo-button title="Upload / change PCP photo">
          <img data-pcp-photo-image alt="PCP" hidden>
          <span data-pcp-photo-initials>PCP</span>
          <i>+</i>
        </button>
        <div class="spire-pcp-profile-copy"><b>Primary Care Provider</b><span data-pcp-photo-name></span><button type="button" data-pcp-photo-change>Upload Photo</button></div>
        <input type="file" accept="image/*" data-pcp-photo-input hidden>`;
      const pcpLine = group.querySelector('#displayPCP')?.closest('div');
      if (pcpLine) group.insertBefore(row, pcpLine);
      else group.prepend(row);
      const input = row.querySelector('[data-pcp-photo-input]');
      const openPicker = () => input?.click();
      row.querySelector('[data-pcp-photo-button]')?.addEventListener('click', openPicker);
      row.querySelector('[data-pcp-photo-change]')?.addEventListener('click', openPicker);
      input?.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return window.alert('Choose an image file for the PCP photo.');
        try {
          const dataUrl = await compressImage(file);
          localStorage.setItem(pcpPhotoKey(), dataUrl);
          renderPcpPhoto(row);
        } catch (error) {
          window.alert(error?.message || 'The PCP photo could not be saved.');
        } finally {
          input.value = '';
        }
      });
    }
    renderPcpPhoto(row);
    return true;
  }

  function installPresentation() {
    let style = document.getElementById('spireMarEpicPresentationStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'spireMarEpicPresentationStyle';
      document.head.appendChild(style);
    }
    style.textContent = `
      #mar-view{padding:0!important;background:#edf7fb!important;overflow:hidden!important}
      .spire-mar-v4{height:100%;display:flex;flex-direction:column;background:#edf7fb;color:#213f50;font-family:'Segoe UI',Tahoma,sans-serif}
      .spire-mar-commandbar,.spire-mar-filterbar{display:flex;align-items:center;min-height:34px;border-bottom:1px solid #aac7d6;background:linear-gradient(180deg,#fbfeff,#e6f1f7);padding:4px 7px;gap:5px;flex:0 0 auto}
      .spire-mar-title{font-size:14px;color:#0878b5;margin-right:2px}
      .spire-mar-command{height:26px;padding:3px 7px;border:1px solid #9bb9c9;border-radius:2px;background:linear-gradient(#fff,#e6eff4);color:#264f63;font-size:10.5px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:0 1px 1px #15465b18}
      .spire-mar-command:hover{background:#dff1f8;border-color:#579ab9;color:#075f92}
      .spire-mar-command.primary{border-color:#1686b6;background:#eefaff;color:#0872a5}
      .spire-mar-auth{margin-left:auto;padding:3px 7px;border-radius:2px;font-size:9.5px;font-weight:800;white-space:nowrap}.spire-mar-auth.authorized{background:#e8f6d4;color:#3f641d;border:1px solid #a9c779}.spire-mar-auth.readonly{background:#fff2cd;color:#785708;border:1px solid #dec36d}
      .spire-mar-filterbar{justify-content:space-between;background:#e7f3f8;gap:10px}.spire-mar-filterset,.spire-mar-filter-actions{display:flex;align-items:center;gap:3px;min-width:0}.spire-mar-filterset{overflow-x:auto}
      .spire-mar-filter{height:27px;padding:3px 8px;border:1px solid transparent;background:transparent;color:#345f72;font-size:10.5px;font-weight:700;cursor:pointer;white-space:nowrap}.spire-mar-filter:hover{background:#d8ebf4}.spire-mar-filter.active{background:#fff;color:#0872a5;border-color:#93b9cc;border-bottom:3px solid #1487bb}
      .spire-mar-date{height:26px;border:1px solid #9bb9c9;border-radius:2px;background:#fff;color:#284e61;padding:2px 5px;font-size:10.5px}
      .spire-mar-legend{display:flex;align-items:center;gap:13px;min-height:27px;padding:3px 9px;border-bottom:1px solid #c2d7e2;background:#f8fcfe;font-size:10px;color:#496675;flex:0 0 auto}.spire-mar-legend span{display:flex;align-items:center;gap:4px}.spire-mar-date-caption{margin-left:auto!important;font-weight:700;color:#315e72}.legend-swatch{width:14px;height:10px;border:1px solid #91a7b4;display:inline-block}.legend-swatch.due{background:#155fc8;border-color:#0d4ca9}.legend-swatch.given{background:#dff0ad;border-color:#9fbd67}.legend-swatch.held{background:#fff0c8;border-color:#dcae43}.legend-swatch.refused{background:#f7d4dd;border-color:#d79aaa}
      .spire-mar-scroll{position:relative;flex:1 1 auto;overflow:auto;background:#edf7fb;scrollbar-color:#82aabd #dbeaf2;scrollbar-width:thin}
      .spire-mar-time-header,.spire-mar-grid-row{display:grid;grid-template-columns:${MED_COLUMN_WIDTH}px repeat(24,${HOUR_WIDTH}px);width:max-content;min-width:100%}
      .spire-mar-time-header{position:sticky;top:0;z-index:30;height:34px;background:#f8fcfe;border-bottom:1px solid #9ebdcd}
      .spire-mar-medication-header{position:sticky;left:0;z-index:35;display:flex;align-items:center;padding:0 10px;background:#f8fcfe;border-right:1px solid #9ebdcd;color:#315f76;font-size:10.5px;font-weight:800}
      .spire-mar-time-label{display:grid;place-items:center;border-right:1px solid #c7dce6;color:#496a7b;font-size:10px;font-weight:700;background:#f8fcfe}.spire-mar-time-label.current{color:#087bb3;background:#dff5fd;border-bottom:3px solid #16a0d4;font-size:11px}
      .spire-mar-medication-row{width:max-content;min-width:100%;margin:6px 0;background:#fff;border-top:1px solid #adc9d7;border-bottom:1px solid #adc9d7;box-shadow:0 1px 2px #123f5710}
      .spire-mar-medication-summary{position:sticky;left:0;z-index:20;min-height:72px;padding:7px 9px;background:linear-gradient(180deg,#fff,#f4fafc);border-right:1px solid #a9c5d3;border-left:4px solid #2d9ccb;overflow:hidden}.spire-mar-med-name{color:#0879b7;font-size:11.5px;font-weight:800;line-height:1.25}.spire-mar-med-details{margin-top:2px;color:#355b6e;font-size:10.5px;line-height:1.25}.spire-mar-med-instructions{margin-top:4px;color:#5c6f79;font-size:9.5px;font-style:italic;line-height:1.22}.spire-mar-due-list{margin-top:4px;color:#075f92;font-size:9.5px;font-weight:800}
      .spire-mar-hour-cell{position:relative;min-height:72px;border:0;border-right:1px solid #c6dce7;border-bottom:0;background:#e7f3f8;color:#315e72;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 3px;cursor:pointer;font-size:9.5px;line-height:1.15;transition:box-shadow .1s,background .1s}.spire-mar-hour-cell:nth-child(even){background:#eaf5f9}.spire-mar-hour-cell:hover:not(:disabled){z-index:2;box-shadow:inset 0 0 0 2px #168ec0;background:#d5edf7}.spire-mar-hour-cell:disabled{cursor:not-allowed;opacity:.72}.spire-mar-cell-label{font-weight:800;text-align:center}.spire-mar-cell-sub{margin-top:2px;font-size:9px;font-weight:700}
      .spire-mar-hour-cell.given{background:#dff0ad!important;color:#315615;border-color:#9fbd67}.spire-mar-hour-cell.due{background:#155fc8!important;color:#fff;border-color:#0c4ca8}.spire-mar-hour-cell.overdue{background:#155fc8!important;color:#fff;border:2px solid #c43c42;box-shadow:inset 0 0 0 1px #fff7}.spire-mar-hour-cell.held{background:#fff0c8!important;color:#78520a;border-color:#dcad43}.spire-mar-hour-cell.refused,.spire-mar-hour-cell.missed{background:#f7d4dd!important;color:#852a43;border-color:#d79aaa}
      .spire-mar-row-meta{position:sticky;left:0;display:flex;justify-content:space-between;gap:12px;width:${MED_COLUMN_WIDTH}px;min-height:25px;padding:4px 8px;background:#f9fcfe;border-top:1px solid #d8e7ee;color:#617783;font-size:9px;overflow:hidden}.spire-mar-row-meta span{white-space:nowrap}.spire-mar-medication-list.hide-admins .spire-mar-hour-cell.given,.spire-mar-medication-list.hide-admins .spire-mar-hour-cell.refused,.spire-mar-medication-list.hide-admins .spire-mar-hour-cell.held,.spire-mar-medication-list.hide-admins .spire-mar-hour-cell.missed{color:transparent}.spire-mar-medication-list.hide-admins .spire-mar-hour-cell.given::after,.spire-mar-medication-list.hide-admins .spire-mar-hour-cell.refused::after,.spire-mar-medication-list.hide-admins .spire-mar-hour-cell.held::after,.spire-mar-medication-list.hide-admins .spire-mar-hour-cell.missed::after{content:'Documented';color:#425d6c;font-size:8px;font-weight:800}
      .spire-mar-v4.link-lines .spire-mar-hour-cell:not(.blank)::before{content:'';position:absolute;top:-7px;bottom:-7px;left:50%;border-left:1px dashed #278bb57a;pointer-events:none}
      .spire-mar-empty{width:100%;min-height:120px;display:grid;place-items:center;color:#607785;font-style:italic}.spire-mar-load-error{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;color:#7f1d1d;background:#fff7f7}.spire-mar-load-error button{padding:5px 12px}.spire-mar-inactive-marker{font-size:10px}
      .spire-mar-dialog-backdrop{position:fixed;inset:0;z-index:12000;background:#10233273;display:grid;place-items:center;padding:18px}.spire-mar-dialog{width:min(700px,96vw);max-height:92vh;overflow:auto;background:#fff;border:1px solid #739bb0;border-radius:4px;box-shadow:0 24px 70px #082d4280;color:#263f4b}.spire-mar-dialog header{display:flex;justify-content:space-between;align-items:flex-start;padding:9px 11px;background:linear-gradient(#f8fdff,#e4f1f7);border-bottom:1px solid #aac5d4}.spire-mar-dialog header strong{display:block;color:#0878b5;font-size:13px}.spire-mar-dialog header span{display:block;margin-top:2px;color:#496777;font-size:10.5px}.spire-mar-dialog-close{border:0;background:transparent;font-size:22px;color:#466879;cursor:pointer;line-height:1}.spire-mar-dialog main{padding:12px}.spire-mar-action-context{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}.spire-mar-action-context div{padding:7px;border:1px solid #c7dbe5;background:#f7fbfd}.spire-mar-action-context span{display:block;color:#6a7f89;font-size:9px;text-transform:uppercase;font-weight:800}.spire-mar-action-context b{display:block;margin-top:2px;color:#315d72;font-size:10.5px}.spire-mar-warning{margin:7px 0;padding:7px 8px;background:#fff4cf;border:1px solid #deb957;color:#77560a;font-size:10.5px;font-weight:700}.spire-mar-dialog-label{font-size:10px;font-weight:800;color:#4c6674}.spire-mar-status-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin:5px 0 10px}.spire-mar-status{min-height:36px;border:1px solid #a8c0cc;background:#f5fafc;color:#36596a;border-radius:3px;font-size:9.5px;font-weight:800;cursor:pointer}.spire-mar-status:hover{border-color:#348db4}.spire-mar-status.selected{background:#155fc8;color:#fff;border-color:#0d4ca9;box-shadow:inset 0 0 0 1px #fff6}.spire-mar-dialog-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px}.spire-mar-dialog-fields label{display:flex;flex-direction:column;gap:3px;font-size:10px;font-weight:700;color:#4b6674}.spire-mar-dialog-fields label:last-child{grid-column:1/-1}.spire-mar-dialog-fields input,.spire-mar-dialog-fields textarea{width:100%;border:1px solid #9eb7c4;border-radius:2px;padding:6px;background:#fff;color:#213f4f;font-size:11px}.spire-mar-server-time-note{margin-top:9px;padding:7px;background:#e8f5fa;border-left:4px solid #1592c2;color:#315d72;font-size:10px}.spire-mar-dialog-error{margin-top:8px;padding:7px;background:#fde8e8;border:1px solid #e5a4a4;color:#8b1d1d;font-size:10.5px;font-weight:700}.spire-mar-dialog footer{display:flex;justify-content:flex-end;gap:6px;padding:8px 11px;background:#f4f9fb;border-top:1px solid #c8dbe4}.spire-mar-dialog-secondary,.spire-mar-dialog-primary{min-width:100px;padding:6px 10px;border-radius:3px;font-size:10.5px;font-weight:800;cursor:pointer}.spire-mar-dialog-secondary{border:1px solid #9fb8c4;background:#fff;color:#355c6d}.spire-mar-dialog-primary{border:1px solid #0c4ca8;background:#155fc8;color:#fff}.spire-mar-dialog-primary:disabled{opacity:.55;cursor:wait}
      .spire-pcp-profile-row{display:flex!important;align-items:center!important;gap:7px!important;margin:4px 0 7px!important;padding:5px!important;border:1px solid #c1d9e4!important;border-radius:3px!important;background:#f5fbfe!important}.spire-pcp-photo-button{position:relative!important;width:42px!important;height:42px!important;min-width:42px!important;border-radius:50%!important;border:2px solid #fff!important;outline:1px solid #78a9c0!important;overflow:hidden!important;padding:0!important;background:#d9edf6!important;color:#156789!important;display:grid!important;place-items:center!important;cursor:pointer!important;font-size:9px!important;font-weight:800!important}.spire-pcp-photo-button img{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:50%!important}.spire-pcp-photo-button i{position:absolute;right:-1px;bottom:-1px;width:15px;height:15px;border-radius:50%;display:grid;place-items:center;background:#0878b5;color:#fff;font-size:11px;font-style:normal;border:1px solid #fff}.spire-pcp-profile-copy{min-width:0;display:flex;flex-direction:column;line-height:1.15}.spire-pcp-profile-copy>b{font-size:9px!important;text-transform:uppercase!important;color:#59717e!important}.spire-pcp-profile-copy>span{margin-top:2px;font-size:10.5px!important;font-weight:800!important;color:#126ea1!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.spire-pcp-profile-copy>button{align-self:flex-start;margin-top:3px;padding:1px 4px;border:1px solid #9cb9c7;background:#fff;color:#176c94;border-radius:2px;font-size:8.5px;font-weight:700;cursor:pointer}
      @media(max-width:1100px){.spire-mar-commandbar{overflow-x:auto}.spire-mar-filterbar{align-items:flex-start;flex-direction:column}.spire-mar-filter-actions{width:100%;overflow-x:auto}.spire-mar-status-grid{grid-template-columns:repeat(3,1fr)}.spire-mar-dialog-fields{grid-template-columns:1fr}.spire-mar-dialog-fields label:last-child{grid-column:auto}}
      :root[data-spire-preset="darkClinicalSummary"] #mar-view,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-v4,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-scroll{background:#202329!important;color:#f4f5f7!important}:root[data-spire-preset="darkClinicalSummary"] .spire-mar-commandbar,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-filterbar,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-legend{background:#292c32!important;border-color:#555b66!important;color:#dce4e9!important}:root[data-spire-preset="darkClinicalSummary"] .spire-mar-command,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-filter{background:#353941!important;color:#e7edf1!important;border-color:#626873!important}:root[data-spire-preset="darkClinicalSummary"] .spire-mar-filter.active{color:#70e5f2!important;border-bottom-color:#16d7ee!important}:root[data-spire-preset="darkClinicalSummary"] .spire-mar-time-header,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-medication-header,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-time-label{background:#30343a!important;color:#d9e3e8!important;border-color:#555b66!important}:root[data-spire-preset="darkClinicalSummary"] .spire-mar-medication-row,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-medication-summary,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-row-meta{background:#292c32!important;color:#dce5ea!important;border-color:#555b66!important}:root[data-spire-preset="darkClinicalSummary"] .spire-mar-med-name{color:#6ee7f2!important}:root[data-spire-preset="darkClinicalSummary"] .spire-mar-med-details,:root[data-spire-preset="darkClinicalSummary"] .spire-mar-med-instructions{color:#d3dde2!important}:root[data-spire-preset="darkClinicalSummary"] .spire-mar-hour-cell.blank{background:#34383f!important;color:#e8edf1!important;border-color:#555b66!important}:root[data-spire-preset="darkClinicalSummary"] .spire-pcp-profile-row{background:#292c32!important;border-color:#555b66!important}:root[data-spire-preset="darkClinicalSummary"] .spire-pcp-profile-copy>b{color:#aebcc4!important}:root[data-spire-preset="darkClinicalSummary"] .spire-pcp-profile-copy>span{color:#73cef5!important}
    `;
  }

  function markCanonicalMarReady() {
    const host = document.querySelector('#mar-view');
    if (!host) return false;
    host.dataset.spireMarTimelineStable = '1';
    return true;
  }

  function observe() {
    const host = document.querySelector('#mar-view');
    if (!host || mutationObserver) return;
    mutationObserver = new MutationObserver(() => {
      syncEpicTabLabels();
      installPcpPhoto();
      if (host.classList.contains('active') && !host.querySelector('.spire-mar-v4') && host.dataset.spireMarEnhancing !== '1') scheduleRender(240);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.querySelector('.chart-tab[data-view="mar-view"]')?.addEventListener('click', () => scheduleRender(420));
    window.addEventListener('hashchange', () => {
      currentData = null;
      currentDate = '';
      window.setTimeout(() => { installPcpPhoto(); scheduleRender(350); }, 0);
    });
  }

  function install() {
    installPresentation();
    syncEpicTabLabels();
    installPcpPhoto();
    if (!markCanonicalMarReady()) return false;
    observe();
    window.__SPIRE_MAR_TIMELINE_INSTALLED = true;
    window.__SPIRE_MAR_TIMELINE_MODE = 'interactive-hourly-canonical-api';
    const host = document.querySelector('#mar-view');
    if (host?.classList.contains('active')) scheduleRender(300);
    return true;
  }

  // Compatibility markers retained for publication verification.
  // data-mar-filter="scheduled"
  // data-mar-filter="prn"
  const publicationContract = Object.freeze({
    marker: 'SPIRE_MAR_TIMELINE_V4',
    compatibilityMarker: 'SPIRE_MAR_TIMELINE_V3',
    nowLabel: 'Go to Now',
    medicationHeader: 'Medication / Order',
    inactiveHeader: 'Completed / Inactive Medications',
    scheduledFilterMarker: 'data-mar-filter="scheduled"',
    prnFilterMarker: 'data-mar-filter="prn"',
    mode: clean('interactive-hourly-canonical-api')
  });
  window.__SPIRE_MAR_TIMELINE_CONTRACT = publicationContract;

  if (!install()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (install() || ++attempts >= 40) window.clearInterval(timer);
    }, 250);
  }
})();
