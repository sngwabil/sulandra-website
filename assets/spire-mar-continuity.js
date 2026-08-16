(() => {
  'use strict';

  // SPIRE_MAR_CONTINUITY_V1
  if (window.__SPIRE_MAR_CONTINUITY_V1) return;
  window.__SPIRE_MAR_CONTINUITY_V1 = true;

  const API_BASE = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const cache = new Map();
  let marObserver = null;
  let decorateTimer = 0;
  let pendingFocus = null;

  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function token() {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of TOKEN_KEYS) {
        const value = storage.getItem(key);
        if (value) return value;
      }
    }
    return '';
  }

  async function api(path) {
    const headers = new Headers({ Accept: 'application/json' });
    const auth = token();
    if (auth) headers.set('Authorization', `Bearer ${auth}`);
    const response = await fetch(/^https?:\/\//i.test(path) ? path : API_BASE + path, {
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

  function shiftDate(dateText, days) {
    const date = new Date(`${dateText}T12:00:00`);
    if (Number.isNaN(date.getTime())) return localDateInput();
    date.setDate(date.getDate() + days);
    return localDateInput(date);
  }

  function displayDate(dateText) {
    const date = new Date(`${dateText}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateText;
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }

  function displayOccurrence(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function occurrenceDate(value) {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? '' : localDateInput(date);
  }

  function occurrenceHour(value) {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? '' : String(date.getHours());
  }

  function selectedDate(host) {
    return clean(host?.querySelector('.spire-mar-date')?.value || host?.dataset.marDate || localDateInput());
  }

  function setDate(host, dateText, { focusMedicationId = '', focusScheduledFor = '' } = {}) {
    const today = localDateInput();
    const target = dateText > today ? today : dateText;
    const input = host?.querySelector('.spire-mar-date');
    if (!input) return false;
    pendingFocus = focusMedicationId ? {
      medicationId: focusMedicationId,
      scheduledFor: focusScheduledFor,
      hour: occurrenceHour(focusScheduledFor),
    } : null;
    input.value = target;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function ensureStyles() {
    if (document.getElementById('spireMarContinuityStyles')) return;
    const style = document.createElement('style');
    style.id = 'spireMarContinuityStyles';
    style.textContent = `
      .spire-mar-day-nav{display:flex;align-items:center;gap:3px}
      .spire-mar-day-context{display:flex;align-items:center;gap:8px;min-height:31px;padding:5px 9px;border-bottom:1px solid #b9d0dc;background:#f8fcfe;color:#315e72;font-size:10px;font-weight:700}
      .spire-mar-day-context.historical{background:#fff7df;border-color:#d9bf74;color:#73570e}
      .spire-mar-day-context strong{font-size:10.5px}
      .spire-mar-day-context .spacer{flex:1}
      .spire-mar-return-today{border:1px solid #1686b6;background:#fff;color:#0872a5;border-radius:2px;padding:4px 8px;font-size:9.5px;font-weight:800;cursor:pointer}
      .spire-mar-overdue-queue{border-bottom:1px solid #cba1a1;background:#fff8f8}
      .spire-mar-overdue-head{display:flex;align-items:center;gap:8px;padding:6px 9px;background:#fdeaea;border-bottom:1px solid #ddb1b1;color:#8c2020;font-size:10px}
      .spire-mar-overdue-head strong{font-size:10.5px}.spire-mar-overdue-head .spacer{flex:1}
      .spire-mar-overdue-list{display:flex;gap:6px;overflow-x:auto;padding:6px 9px}
      .spire-mar-overdue-item{min-width:220px;max-width:300px;border:1px solid #d5b0b0;border-left:4px solid #c43c42;border-radius:2px;background:#fff;padding:6px 7px;color:#553333}
      .spire-mar-overdue-item b{display:block;color:#8c2020;font-size:10px}.spire-mar-overdue-item span{display:block;margin-top:2px;font-size:9px;color:#6e4b4b}
      .spire-mar-overdue-item button{margin-top:5px;border:1px solid #b87b7b;background:#fff;color:#8c2020;border-radius:2px;padding:3px 6px;font-size:9px;font-weight:800;cursor:pointer}
      .spire-mar-continuity-error{padding:6px 9px;border-bottom:1px solid #d7bd75;background:#fff8df;color:#76590b;font-size:9.5px}
      .spire-mar-hour-cell[data-mar-no-occurrence="1"]{cursor:default!important;opacity:.48!important}
      :root[data-spire-preset="darkClinicalSummary"] .spire-mar-day-context{background:#292c32;color:#dce5ea;border-color:#555b66}
      :root[data-spire-preset="darkClinicalSummary"] .spire-mar-day-context.historical{background:#3a3324;color:#f3daa0;border-color:#77653e}
      :root[data-spire-preset="darkClinicalSummary"] .spire-mar-overdue-queue{background:#2f2528;border-color:#75444c}
      :root[data-spire-preset="darkClinicalSummary"] .spire-mar-overdue-head{background:#422c31;color:#ffb6bf;border-color:#75444c}
      :root[data-spire-preset="darkClinicalSummary"] .spire-mar-overdue-item{background:#30292c;color:#f0d8dc;border-color:#75444c;border-left-color:#ff697c}
      @media(max-width:1100px){.spire-mar-day-context{flex-wrap:wrap}.spire-mar-overdue-list{max-width:100vw}}
    `;
    document.head.appendChild(style);
  }

  function disableUnscheduledScheduledCells(host) {
    host.querySelectorAll('.spire-mar-medication-row').forEach((row) => {
      const tags = clean(row.dataset.filterTags).toLowerCase();
      const prn = tags.includes('prn');
      if (prn) return;
      row.querySelectorAll('.spire-mar-hour-cell.blank').forEach((button) => {
        button.disabled = true;
        button.dataset.marNoOccurrence = '1';
        button.title = 'No scheduled medication occurrence at this time.';
        button.setAttribute('aria-label', 'No scheduled medication occurrence at this time');
      });
    });
  }

  function ensureDayNavigation(host) {
    const actions = host.querySelector('.spire-mar-filter-actions');
    const input = actions?.querySelector('.spire-mar-date');
    const nowButton = actions?.querySelector('[data-mar-command="now"]');
    if (!actions || !input || !nowButton) return;

    const today = localDateInput();
    input.max = today;
    nowButton.textContent = 'Today / Now';

    let nav = actions.querySelector('[data-spire-mar-day-nav]');
    if (!nav) {
      nav = document.createElement('span');
      nav.className = 'spire-mar-day-nav';
      nav.dataset.spireMarDayNav = '1';
      nav.innerHTML = `
        <button type="button" class="spire-mar-command" data-spire-mar-day="previous" title="Previous MAR day">‹ Previous</button>
        <button type="button" class="spire-mar-command primary" data-spire-mar-day="today">Today</button>
        <button type="button" class="spire-mar-command" data-spire-mar-day="next" title="Next MAR day">Next ›</button>
      `;
      nowButton.insertAdjacentElement('afterend', nav);
    }

    const date = selectedDate(host);
    const next = nav.querySelector('[data-spire-mar-day="next"]');
    if (next) next.disabled = date >= today;
  }

  function ensureDayContext(host) {
    const root = host.querySelector('.spire-mar-v4');
    const anchor = host.querySelector('.spire-mar-legend') || host.querySelector('.spire-mar-filterbar');
    if (!root || !anchor) return;
    const today = localDateInput();
    const date = selectedDate(host);
    let banner = host.querySelector('[data-spire-mar-day-context]');
    if (!banner) {
      banner = document.createElement('div');
      banner.dataset.spireMarDayContext = '1';
      anchor.insertAdjacentElement('afterend', banner);
    }
    if (date === today) {
      banner.className = 'spire-mar-day-context current';
      banner.innerHTML = `<strong>Today — ${esc(displayDate(today))}</strong><span>Current-day scheduled doses remain independent from prior missed/overdue occurrences.</span>`;
    } else {
      banner.className = 'spire-mar-day-context historical';
      banner.innerHTML = `<strong>Historical MAR — ${esc(displayDate(date))}</strong><span>You are viewing a prior day. Its unresolved doses remain on that date and do not replace today's medication occurrences.</span><span class="spacer"></span><button type="button" class="spire-mar-return-today" data-spire-mar-day="today">Return to Today</button>`;
    }
  }

  function overdueHtml(data) {
    const rows = Array.isArray(data?.overdueOccurrences) ? data.overdueOccurrences : [];
    const total = Number(data?.overdueCount ?? rows.length) || rows.length;
    if (!rows.length) return '';
    const cards = rows.map((item) => {
      const scheduledFor = clean(item.scheduledFor);
      const medId = clean(item.medicationOrderId);
      const label = displayOccurrence(scheduledFor);
      return `<div class="spire-mar-overdue-item">
        <b>${esc(item.name || item.medicationName || 'Medication')}</b>
        <span>${esc([item.dose, item.route, item.frequency].map(clean).filter(Boolean).join(' · '))}</span>
        <span>Past due: ${esc(label || scheduledFor)}</span>
        <button type="button" data-spire-mar-overdue-date="${esc(occurrenceDate(scheduledFor))}" data-spire-mar-overdue-med="${esc(medId)}" data-spire-mar-overdue-scheduled="${esc(scheduledFor)}">View this occurrence</button>
      </div>`;
    }).join('');
    const hidden = Math.max(0, total - rows.length);
    return `<section class="spire-mar-overdue-queue" data-spire-mar-overdue-queue>
      <div class="spire-mar-overdue-head"><strong>Past Due / Overdue from prior days: ${total}</strong><span>These remain historical occurrences. They do not block today's MAR.</span><span class="spacer"></span>${hidden ? `<span>${hidden} additional older occurrence${hidden === 1 ? '' : 's'} not shown</span>` : ''}</div>
      <div class="spire-mar-overdue-list">${cards}</div>
    </section>`;
  }

  async function loadOverdue(host) {
    if (selectedDate(host) !== localDateInput()) {
      host.querySelector('[data-spire-mar-overdue-queue]')?.remove();
      host.querySelector('[data-spire-mar-continuity-error]')?.remove();
      return;
    }
    const id = patientId();
    if (!id) return;
    const key = `${id}:${localDateInput()}`;
    let promise = cache.get(key);
    if (!promise) {
      promise = api(`/api/spire/patients/${encodeURIComponent(id)}/emar?date=${encodeURIComponent(localDateInput())}&includeOverdue=1`);
      cache.set(key, promise);
    }
    try {
      const data = await promise;
      if (!host.isConnected || selectedDate(host) !== localDateInput()) return;
      host.querySelector('[data-spire-mar-continuity-error]')?.remove();
      const existing = host.querySelector('[data-spire-mar-overdue-queue]');
      const html = overdueHtml(data);
      if (!html) {
        existing?.remove();
        return;
      }
      const template = document.createElement('template');
      template.innerHTML = html.trim();
      const next = template.content.firstElementChild;
      if (!next) return;
      if (existing) existing.replaceWith(next);
      else {
        const context = host.querySelector('[data-spire-mar-day-context]');
        context?.insertAdjacentElement('afterend', next);
      }
    } catch (error) {
      cache.delete(key);
      if (!host.isConnected || selectedDate(host) !== localDateInput()) return;
      if (!host.querySelector('[data-spire-mar-continuity-error]')) {
        const notice = document.createElement('div');
        notice.className = 'spire-mar-continuity-error';
        notice.dataset.spireMarContinuityError = '1';
        notice.textContent = `Past-due history could not be loaded: ${clean(error?.message || error || 'Unknown error')}`;
        host.querySelector('[data-spire-mar-day-context]')?.insertAdjacentElement('afterend', notice);
      }
    }
  }

  function focusPendingOccurrence(host) {
    if (!pendingFocus) return;
    const { medicationId, hour } = pendingFocus;
    const target = Array.from(host.querySelectorAll('.spire-mar-hour-cell[data-mar-med]')).find((button) =>
      clean(button.dataset.marMed) === medicationId && clean(button.dataset.marHour) === clean(hour)
    );
    if (!target) return;
    pendingFocus = null;
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    target.focus({ preventScroll: true });
  }

  function decorate(host) {
    if (!host || !host.classList.contains('active') || !host.querySelector('.spire-mar-v4')) return;
    ensureStyles();
    disableUnscheduledScheduledCells(host);
    ensureDayNavigation(host);
    ensureDayContext(host);
    void loadOverdue(host);
    window.setTimeout(() => focusPendingOccurrence(host), 40);
  }

  function scheduleDecorate(host, delay = 0) {
    window.clearTimeout(decorateTimer);
    decorateTimer = window.setTimeout(() => decorate(host), delay);
  }

  function bindHost(host) {
    if (!host || marObserver) return;
    marObserver = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === 'childList')) scheduleDecorate(host, 0);
    });
    marObserver.observe(host, { childList: true, subtree: true });

    host.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;

      const dayButton = event.target.closest('[data-spire-mar-day]');
      if (dayButton) {
        event.preventDefault();
        event.stopPropagation();
        const action = dayButton.dataset.spireMarDay;
        const date = selectedDate(host);
        if (action === 'today') setDate(host, localDateInput());
        else if (action === 'previous') setDate(host, shiftDate(date, -1));
        else if (action === 'next') setDate(host, shiftDate(date, 1));
        return;
      }

      const overdueButton = event.target.closest('[data-spire-mar-overdue-date]');
      if (overdueButton) {
        event.preventDefault();
        event.stopPropagation();
        setDate(host, overdueButton.dataset.spireMarOverdueDate || localDateInput(), {
          focusMedicationId: overdueButton.dataset.spireMarOverdueMed || '',
          focusScheduledFor: overdueButton.dataset.spireMarOverdueScheduled || '',
        });
      }
    }, true);

    const nowCapture = (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('#mar-view [data-mar-command="now"]');
      if (!button) return;
      const today = localDateInput();
      if (selectedDate(host) === today) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setDate(host, today);
      window.setTimeout(() => {
        const current = host.querySelector('.spire-mar-time-label.current');
        current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }, 220);
    };
    document.addEventListener('click', nowCapture, true);
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-spire-mar-dialog] [data-mar-save]')) cache.clear();
    }, true);
  }

  function install() {
    const host = document.getElementById('mar-view');
    if (!host) return false;
    bindHost(host);
    scheduleDecorate(host, 60);
    return true;
  }

  window.__SPIRE_MAR_CONTINUITY_CONTRACT = Object.freeze({
    marker: 'SPIRE_MAR_CONTINUITY_V1',
    occurrenceOriented: true,
    todayIndependentOfHistory: true,
    priorOverdueQueue: true,
    blankScheduledCellsDisabled: true,
    scopedObserver: '#mar-view',
    wholeDocumentObserver: false,
  });

  if (!install()) {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (install() || attempts >= 40) window.clearInterval(timer);
    }, 250);
  }
})();