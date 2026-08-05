(() => {
  'use strict';

  const API_BASE = 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const ACTIVE_EXCLUDED = new Set([
    'ARCHIVED',
    'POSITION_FILLED',
    'NOT_SELECTED',
    'REJECTED',
    'DELETED',
    'WITHDRAWN',
    'TERMINATED',
  ]);
  const ARCHIVED_VISIBLE = new Set([
    'ARCHIVED',
    'POSITION_FILLED',
    'WITHDRAWN',
    'TERMINATED',
  ]);

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const normalize = (value) => String(value || '').trim().toUpperCase().replaceAll(' ', '_');
  const statusOf = (application) => normalize(application?.workflowStatus || application?.status || 'RECEIVED');
  const roleOf = (application) => normalize(application?.appliedRole || application?.role || 'GENERAL');
  const nameOf = (application) => [application?.firstName, application?.middleName, application?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || 'Applicant';
  const titleCase = (value) => String(value || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  const dateOf = (application) => {
    const raw = application?.submittedAt || application?.createdAt;
    if (!raw) return '—';
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(raw) : date.toLocaleDateString();
  };
  const positionOf = (application) => application?.jobTitle
    || application?.positionTitle
    || titleCase(roleOf(application))
    || 'General Employment Opportunity';

  async function loadApplications() {
    const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
    if (!token) return [];
    const response = await fetch(`${API_BASE}/api/admin/applications?limit=500`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => ({}));
    const data = payload?.data ?? payload;
    return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  }

  function matchesCurrentFilters(application) {
    const search = (byId('search')?.value || '').trim().toLowerCase();
    const statusFilter = byId('statusFilter')?.value || 'all';
    const jobFilter = byId('jobFilter')?.value || 'all';
    const searchable = [
      nameOf(application),
      application?.email,
      application?.phone,
      positionOf(application),
      roleOf(application),
      statusOf(application),
    ].filter(Boolean).join(' ').toLowerCase();
    return (!search || searchable.includes(search))
      && (statusFilter === 'all' || statusOf(application) === normalize(statusFilter))
      && (jobFilter === 'all' || roleOf(application) === normalize(jobFilter));
  }

  function activeRow(application) {
    const score = application?.assessmentScore == null ? '—' : application.assessmentScore;
    return `<tr data-lifecycle-status="${escapeHtml(statusOf(application))}">
      <td>${escapeHtml(dateOf(application))}</td>
      <td><strong>${escapeHtml(nameOf(application))}</strong><div class="muted">${escapeHtml(application?.email || application?.phone || '')}</div></td>
      <td>${escapeHtml(positionOf(application))}</td>
      <td><span class="score">${escapeHtml(score)}</span></td>
      <td><span class="status-pill">${escapeHtml(titleCase(statusOf(application)))}</span></td>
      <td><button class="btn btn-primary" data-application-id="${escapeHtml(application.id)}">Open folder</button></td>
    </tr>`;
  }

  function archivedRow(application) {
    const score = application?.assessmentScore == null ? '—' : application.assessmentScore;
    return `<tr data-lifecycle-status="${escapeHtml(statusOf(application))}">
      <td>${escapeHtml(dateOf(application))}</td>
      <td><strong>${escapeHtml(nameOf(application))}</strong><div class="muted">${escapeHtml(application?.email || application?.phone || '')}</div></td>
      <td>${escapeHtml(positionOf(application))}<div class="muted">${escapeHtml(titleCase(statusOf(application)))}</div></td>
      <td>${escapeHtml(score)}</td>
      <td><button class="btn btn-primary" data-application-id="${escapeHtml(application.id)}">Open folder</button></td>
    </tr>`;
  }

  async function reconcile() {
    const activeTable = byId('applicantTable');
    const archivedTable = byId('archivedApplicantTable');
    if (!activeTable || !archivedTable) return;

    const applications = await loadApplications();
    if (!applications.length) return;

    const active = applications
      .filter((application) => !ACTIVE_EXCLUDED.has(statusOf(application)))
      .filter(matchesCurrentFilters);
    const archived = applications
      .filter((application) => ARCHIVED_VISIBLE.has(statusOf(application)));

    activeTable.innerHTML = active.length
      ? active.map(activeRow).join('')
      : '<tr><td colspan="6" class="muted">No active applications match the selected filters.</td></tr>';
    archivedTable.innerHTML = archived.length
      ? archived.map(archivedRow).join('')
      : '<tr><td colspan="5" class="muted">No archived applicants found.</td></tr>';

    if (byId('countLabel')) {
      byId('countLabel').textContent = `${active.length} active application${active.length === 1 ? '' : 's'}`;
    }
    if (byId('kpiApplicants')) byId('kpiApplicants').textContent = String(active.length);
  }

  let timer;
  const scheduleReconcile = () => {
    clearTimeout(timer);
    timer = setTimeout(() => reconcile().catch(console.error), 80);
  };

  document.addEventListener('DOMContentLoaded', () => {
    scheduleReconcile();
    byId('search')?.addEventListener('input', scheduleReconcile);
    byId('statusFilter')?.addEventListener('change', scheduleReconcile);
    byId('jobFilter')?.addEventListener('change', scheduleReconcile);
    byId('refreshBtn')?.addEventListener('click', () => setTimeout(scheduleReconcile, 250));

    const observer = new MutationObserver(() => scheduleReconcile());
    const activeTable = byId('applicantTable');
    const archivedTable = byId('archivedApplicantTable');
    if (activeTable) observer.observe(activeTable, { childList: true });
    if (archivedTable) observer.observe(archivedTable, { childList: true });
  }, { once: true });
})();
