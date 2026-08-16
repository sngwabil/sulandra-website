(() => {
  'use strict';

  // SPIRE_MAR_ACTION_GUIDANCE_V1
  if (window.__SPIRE_MAR_ACTION_GUIDANCE_V1) return;
  window.__SPIRE_MAR_ACTION_GUIDANCE_V1 = true;

  const GENERIC_REJECTION = /^(?:request failed|the mar action could not be saved)(?:\s*\((\d{3})\))?\.?$/i;

  function formatWhen(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  function durationText(milliseconds) {
    const totalMinutes = Math.max(0, Math.round(Math.abs(milliseconds) / 60000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
    if (hours) parts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
    if (minutes || !parts.length) parts.push(`${minutes} min`);
    return parts.slice(0, 2).join(' ');
  }

  function timingContext(scheduledFor) {
    const scheduled = new Date(scheduledFor || '');
    if (Number.isNaN(scheduled.getTime())) {
      return {
        kind: 'unknown',
        lead: 'The scheduled medication time could not be determined from this MAR occurrence.',
        rejection: 'The server rejected this MAR action. Refresh MAR and verify the active medication order and occurrence before trying again.',
      };
    }

    const now = new Date();
    const difference = scheduled.getTime() - now.getTime();
    const when = formatWhen(scheduled);
    const span = durationText(difference);

    if (difference > 60_000) {
      return {
        kind: 'future',
        lead: `Not due yet — scheduled for ${when} (${span} from now).`,
        rejection: `The server rejected this MAR action. This occurrence is scheduled for ${when}, which is ${span} from now. Verify that you selected the intended occurrence and whether early documentation is permitted before trying again.`,
      };
    }

    if (difference < -60_000) {
      return {
        kind: 'past',
        lead: `Older MAR occurrence — scheduled for ${when} (${span} ago). This is not an early-administration warning.`,
        rejection: `The server rejected this MAR action. This occurrence was scheduled for ${when} (${span} ago), so the rejection is not because it is too early. Refresh MAR and verify the current active order and scheduled occurrence. If the order time changed, document against the correct current occurrence.`,
      };
    }

    return {
      kind: 'current',
      lead: `Due now — scheduled for ${when}.`,
      rejection: `The server rejected this MAR action even though this occurrence is at its scheduled time. Refresh MAR and verify the active medication order before trying again.`,
    };
  }

  function ensureStyles() {
    if (document.getElementById('spireMarActionGuidanceStyles')) return;
    const style = document.createElement('style');
    style.id = 'spireMarActionGuidanceStyles';
    style.textContent = `
      .spire-mar-timing-guidance{margin:7px 0 10px;padding:8px 10px;border:1px solid #9db9c8;border-left:4px solid #1688b7;border-radius:2px;background:#eef8fc;color:#234f63;font-size:10.5px;font-weight:750;line-height:1.35}
      .spire-mar-timing-guidance.future{background:#fff7dc;border-color:#d8b75c;border-left-color:#c58b00;color:#6f5208}
      .spire-mar-timing-guidance.past{background:#eef6fb;border-color:#9db9c8;border-left-color:#327fa5;color:#234f63}
      .spire-mar-timing-guidance.current{background:#edf9f0;border-color:#9bc8a6;border-left-color:#2d8c49;color:#255c35}
      .spire-mar-timing-guidance.unknown{background:#f5f7f8;border-color:#c3ced4;border-left-color:#788d98;color:#455e69}
      .spire-mar-dialog-error[data-spire-mar-guided-error="1"]{line-height:1.4}
    `;
    document.head.appendChild(style);
  }

  function replaceGenericError(errorBox, context) {
    if (!errorBox || errorBox.hidden) return false;
    const text = String(errorBox.textContent || '').trim();
    if (!text) return false;

    const generic = text.match(GENERIC_REJECTION);
    if (generic) {
      const status = generic[1] ? ` (server response ${generic[1]})` : '';
      errorBox.textContent = `${context.rejection}${status}`;
      errorBox.dataset.spireMarGuidedError = '1';
      return true;
    }

    if (!errorBox.dataset.spireMarGuidedError) {
      errorBox.textContent = `${context.lead} ${text}`;
      errorBox.dataset.spireMarGuidedError = '1';
    }
    return true;
  }

  function watchSaveResult(dialog, context) {
    const errorBox = dialog.querySelector('[data-mar-error]');
    if (!errorBox) return;
    delete errorBox.dataset.spireMarGuidedError;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (!dialog.isConnected || replaceGenericError(errorBox, context) || attempts >= 100) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  function decorateDialog(dialog, scheduledFor) {
    if (!dialog) return;
    ensureStyles();
    const context = timingContext(scheduledFor);
    let guidance = dialog.querySelector('[data-spire-mar-timing-guidance]');
    if (!guidance) {
      guidance = document.createElement('div');
      guidance.dataset.spireMarTimingGuidance = '1';
      const actionContext = dialog.querySelector('.spire-mar-action-context');
      actionContext?.insertAdjacentElement('afterend', guidance);
    }
    if (guidance) {
      guidance.className = `spire-mar-timing-guidance ${context.kind}`;
      guidance.textContent = context.lead;
      guidance.setAttribute('role', context.kind === 'future' ? 'alert' : 'status');
    }

    const errorBox = dialog.querySelector('[data-mar-error]');
    errorBox?.setAttribute('aria-live', 'assertive');

    const save = dialog.querySelector('[data-mar-save]');
    if (save && !save.dataset.spireMarGuidanceBound) {
      save.dataset.spireMarGuidanceBound = '1';
      save.addEventListener('click', () => watchSaveResult(dialog, context), true);
    }
  }

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const cell = event.target.closest('.spire-mar-hour-cell[data-mar-scheduled]');
    if (!cell) return;
    const scheduledFor = cell.dataset.marScheduled || '';
    window.setTimeout(() => decorateDialog(document.querySelector('[data-spire-mar-dialog]'), scheduledFor), 0);
  }, true);

  window.__SPIRE_MAR_ACTION_GUIDANCE_CONTRACT = Object.freeze({
    marker: 'SPIRE_MAR_ACTION_GUIDANCE_V1',
    futureLabel: 'Not due yet',
    pastLabel: 'Older MAR occurrence',
    genericErrorReplacement: true,
    wholeDocumentObserver: false,
  });
})();
