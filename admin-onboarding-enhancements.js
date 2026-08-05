(() => {
  'use strict';

  const API_BASE = 'https://sulandra-website-production.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const ARCHIVED_STATUSES = new Set(['ARCHIVED', 'POSITION_FILLED', 'NOT_SELECTED']);
  let applications = [];
  let enhancing = false;

  const token = () => sessionStorage.getItem(TOKEN_KEY) || '';
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const fullName = (application) => [
    application?.firstName,
    application?.middleName,
    application?.lastName,
  ].filter(Boolean).join(' ').trim() || 'Applicant';
  const position = (application) => application?.jobTitle
    || application?.positionTitle
    || String(application?.appliedRole || '').replaceAll('_', ' ')
    || 'General Employment Opportunity';
  const status = (application) => String(
    application?.workflowStatus || application?.status || ''
  ).toUpperCase();
  const username = (application) => application?.portalUsername
    || application?.applicantUsername
    || application?.username
    || application?.email
    || 'Not available';

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token()}`,
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status}).`);
    return payload?.data ?? payload;
  }

  function notice(title, message, error = false) {
    let element = document.getElementById('adminEnhancementNotice');
    if (!element) {
      element = document.createElement('div');
      element.id = 'adminEnhancementNotice';
      element.style.cssText = 'position:fixed;right:22px;bottom:22px;z-index:10000;max-width:420px;padding:16px 18px;border-radius:14px;box-shadow:0 18px 50px rgba(15,35,61,.22);font:600 14px/1.45 Inter,Segoe UI,Arial,sans-serif;';
      document.body.appendChild(element);
    }
    element.style.background = error ? '#fff1f2' : '#ecfdf5';
    element.style.border = `1px solid ${error ? '#fecdd3' : '#a7f3d0'}`;
    element.style.color = error ? '#991b1b' : '#166534';
    element.innerHTML = `<strong style="display:block;margin-bottom:4px">${escapeHtml(title)}</strong>${escapeHtml(message)}`;
    clearTimeout(element._timer);
    element._timer = setTimeout(() => element.remove(), 6500);
  }

  async function loadApplications() {
    const result = await api('/api/admin/applications');
    applications = Array.isArray(result) ? result : [];
  }

  function findApplication(card) {
    const name = card.querySelector('h3')?.textContent?.trim() || '';
    const job = card.querySelector('.sub')?.textContent?.trim() || '';
    return applications.find((application) => (
      ARCHIVED_STATUSES.has(status(application))
      && fullName(application) === name
      && (!job || position(application).includes(job) || job.includes(position(application)))
    )) || applications.find((application) => (
      ARCHIVED_STATUSES.has(status(application)) && fullName(application) === name
    ));
  }

  async function restore(application, button) {
    const confirmed = window.confirm(
      `Restore ${fullName(application)} to active review? A new temporary password will be created and the applicant will receive a Sulandra Health Human Resources Department email.`
    );
    if (!confirmed) return;
    button.disabled = true;
    button.textContent = 'Restoring…';
    try {
      await api(`/api/admin/applications/${encodeURIComponent(application.id)}/restore`, {
        method: 'POST',
        body: JSON.stringify({ notifyApplicant: true }),
      });
      notice('Applicant restored', `${fullName(application)} is back in active review. Portal access was reissued with a forced password change.`);
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      notice('Applicant was not restored', error.message, true);
      button.disabled = false;
      button.textContent = 'Restore to Active Review';
    }
  }

  function enhanceArchivedCards() {
    const container = document.getElementById('archivedApplicants');
    if (!container || enhancing) return;
    enhancing = true;
    try {
      container.querySelectorAll('.archive-card:not([data-admin-enhanced])').forEach((card) => {
        const application = findApplication(card);
        if (!application) return;
        card.dataset.adminEnhanced = 'true';

        const details = document.createElement('div');
        details.style.cssText = 'margin-top:12px;padding:12px 14px;border:1px solid #d8e4ef;border-radius:12px;background:#f8fbfe;font-size:13px;line-height:1.55;color:#41566d;';
        details.innerHTML = `
          <div><strong>Application reference:</strong> ${escapeHtml(application.referenceNumber || 'Not available')}</div>
          <div><strong>Applicant username:</strong> ${escapeHtml(username(application))}</div>
          <div><strong>Email:</strong> ${escapeHtml(application.email || 'Not available')}</div>
        `;

        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.style.marginTop = '12px';

        const restoreButton = document.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'button button-primary button-small';
        restoreButton.textContent = 'Restore to Active Review';
        restoreButton.addEventListener('click', () => restore(application, restoreButton));

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'button button-small';
        copyButton.textContent = 'Copy Username';
        copyButton.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(username(application));
            notice('Username copied', username(application));
          } catch {
            notice('Copy failed', 'Select and copy the username shown in the archived applicant card.', true);
          }
        });

        actions.append(restoreButton, copyButton);
        card.append(details, actions);
      });
    } finally {
      enhancing = false;
    }
  }

  async function initialize() {
    if (!token()) return;
    try {
      await loadApplications();
      enhanceArchivedCards();
      const container = document.getElementById('archivedApplicants');
      if (container) {
        new MutationObserver(() => enhanceArchivedCards()).observe(container, {
          childList: true,
          subtree: true,
        });
      }
      document.addEventListener('click', (event) => {
        if (event.target.closest('[data-module="archive"], [data-module="archived"]')) {
          setTimeout(enhanceArchivedCards, 100);
        }
      });
    } catch (error) {
      console.error('Admin onboarding enhancements failed to initialize:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
