(function () {
  'use strict';

  const API_BASE = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const title = (value) => String(value || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/(^|\s)\S/g, (char) => char.toUpperCase());
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';

  async function api(path) {
    const response = await fetch(API_BASE + path, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token()}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status}).`);
    return payload.data !== undefined ? payload.data : payload;
  }

  function appName(app) {
    return [app.firstName, app.middleName, app.lastName].filter(Boolean).join(' ') || 'Applicant';
  }

  function applicantRow(app) {
    const rawDate = app.archivedAt || app.submittedAt || app.createdAt;
    const date = rawDate ? new Date(rawDate).toLocaleDateString() : '—';
    const score = app.assessmentScore == null ? '—' : app.assessmentScore;
    const role = app.jobTitle || title(app.appliedRole || app.role || 'GENERAL');
    return `<tr>
      <td>${esc(date)}</td>
      <td><strong>${esc(appName(app))}</strong><div class="muted">${esc(app.email || app.phone || '')}</div></td>
      <td>${esc(role)}</td>
      <td>${esc(score)}</td>
      <td><button class="btn btn-primary" data-application-id="${esc(app.id)}">Open folder</button></td>
    </tr>`;
  }

  function jobCard(job) {
    const status = String(job.status || 'ARCHIVED').toUpperCase();
    return `<article class="opening-card">
      <div class="opening-card-head">
        <div>
          <h3>${esc(job.title)}</h3>
          <div class="muted">${esc(job.department || 'General')} · ${esc(job.locationText || 'Location not specified')}</div>
        </div>
        <span class="status-pill">${esc(title(status))}</span>
      </div>
      <p class="sub" style="margin-top:8px">${esc(job.summary || '')}</p>
      <div class="opening-actions">
        <button class="btn btn-primary" data-status-id="${esc(job.id)}" data-status="PUBLISHED">Restore to Live</button>
      </div>
    </article>`;
  }

  async function refreshArchivedApplicants() {
    const table = document.getElementById('archivedApplicantTable');
    if (!table || !token()) return;
    try {
      const result = await api('/api/admin/applications?archived=true&limit=200');
      const archived = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
      table.innerHTML = archived.length
        ? archived.map(applicantRow).join('')
        : '<tr><td colspan="5" class="muted">No archived applicants found.</td></tr>';
    } catch (error) {
      table.innerHTML = `<tr><td colspan="5" class="muted">Unable to load archived applicants: ${esc(error.message)}</td></tr>`;
    }
  }

  async function refreshArchivedJobs() {
    const host = document.getElementById('archivedJobsList');
    if (!host || !token()) return;
    try {
      const result = await api('/api/admin/job-openings');
      const jobs = (Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [])
        .filter((job) => ['CLOSED', 'ARCHIVED'].includes(String(job.status || '').toUpperCase()));
      host.innerHTML = jobs.length
        ? jobs.map(jobCard).join('')
        : '<p class="muted" style="padding:12px;text-align:center">No archived or closed job openings.</p>';
    } catch (error) {
      host.innerHTML = `<p class="muted" style="padding:12px;text-align:center">Unable to load archived jobs: ${esc(error.message)}</p>`;
    }
  }

  async function refreshAchievedHub() {
    await Promise.all([refreshArchivedApplicants(), refreshArchivedJobs()]);
  }

  function isArchiveNavigation(target) {
    return Boolean(
      target.closest('[data-onboarding-panel="archived"]') ||
      target.closest('.archive-subtab') ||
      target.closest('[data-status="ARCHIVED"]')
    );
  }

  document.addEventListener('click', (event) => {
    if (isArchiveNavigation(event.target)) {
      window.setTimeout(refreshAchievedHub, 350);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    refreshAchievedHub();
  });

  window.SulandraRefreshAchievedHub = refreshAchievedHub;
})();
