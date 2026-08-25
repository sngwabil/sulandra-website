(() => {
  'use strict';

  if (!/\/admin-operations\.html$/i.test(location.pathname)) return;

  const SESSION_KEY = 'sulandra:employee:session';
  const OPERATIONS_BOOTSTRAP_KEY = 'sulandra:operations:entity-bootstrap';
  const MANAGEMENT_ROLES = new Set(['ADMINISTRATOR','HR_MANAGER','CEO','DOO']);
  const PARENT_CODES = new Set(['SULANDRA_HEALTH','SULANDRAHEALTH','PARENT']);
  let rendering = false;

  document.title = 'Company Operations | Sulandra Health';
  document.body?.classList.add('sulandra-company-operations');

  const style = document.createElement('style');
  style.id = 'sulandraCompanyOperationsDesktopStyles';
  style.textContent = `
    body.sulandra-company-operations{background:#eef4f8}
    body.sulandra-company-operations .alert-bar{background:#123f62!important}
    #module-dashboard[data-operations-desktop="true"]{display:block!important;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}
    .ops-hero{position:relative;overflow:hidden;border-radius:22px;padding:28px 30px;background:linear-gradient(135deg,#0c385d,#0b6997 58%,#118b9e);color:#fff;box-shadow:0 18px 42px rgba(13,56,93,.18)}
    .ops-hero:after{content:"";position:absolute;width:250px;height:250px;border:34px solid rgba(255,255,255,.07);border-radius:50%;right:-80px;top:-105px}.ops-eyebrow{font-size:11px;font-weight:950;letter-spacing:.11em;text-transform:uppercase;color:#bfeafb}.ops-hero h1{margin:5px 0 7px;color:#fff;font-size:clamp(28px,4vw,42px)}.ops-hero p{margin:0;max-width:780px;color:#e5f5fb;line-height:1.55}.ops-hero-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.ops-hero-actions a,.ops-hero-actions button{border:1px solid rgba(255,255,255,.28);border-radius:10px;background:rgba(255,255,255,.13);color:#fff;padding:9px 12px;text-decoration:none;font-weight:850;font-size:12px;cursor:pointer}.ops-hero-actions a:hover,.ops-hero-actions button:hover{background:rgba(255,255,255,.22)}
    .ops-context-strip{display:grid;grid-template-columns:2fr repeat(5,minmax(110px,1fr));gap:12px;margin-top:15px}.ops-context-card{border:1px solid #d7e4ec;border-radius:15px;background:#fff;padding:15px 16px;box-shadow:0 8px 24px rgba(36,65,88,.07)}.ops-context-card small{display:block;color:#6f8290;font-size:9px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.ops-context-card strong{display:block;margin-top:5px;color:#123f62;font-size:15px}.ops-context-card.company strong{font-size:18px}.ops-status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#1e9d58;margin-right:7px}
    .ops-section{margin-top:20px}.ops-section-head{display:flex;justify-content:space-between;gap:15px;align-items:end;margin:0 3px 10px}.ops-section-head h2{margin:0;color:#173f5e;font-size:20px}.ops-section-head p{margin:0;color:#718291;font-size:11px}.ops-folder-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.ops-folder-card{border:1px solid #d9e5ec;border-radius:15px;background:#fff;padding:16px;text-align:left;cursor:pointer;box-shadow:0 8px 22px rgba(39,67,88,.06);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.ops-folder-card:hover{transform:translateY(-2px);border-color:#8fc6de;box-shadow:0 12px 28px rgba(39,67,88,.11)}.ops-folder-icon{display:grid;place-items:center;width:35px;height:35px;border-radius:10px;background:#e9f5fb;color:#0b6997;font-size:17px;font-weight:950}.ops-folder-card h3{margin:11px 0 4px;color:#174663;font-size:14px}.ops-folder-card p{margin:0;color:#758693;font-size:11px;line-height:1.45}.ops-folder-card span{display:block;margin-top:11px;color:#0b6997;font-size:10px;font-weight:900}.ops-quick-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.ops-quick-link{display:flex;flex-direction:column;gap:3px;border:1px solid #d7e5ed;border-radius:12px;background:#fff;padding:13px;color:#164663;text-decoration:none;font-weight:900;font-size:12px}.ops-quick-link small{color:#7a8b96;font-weight:650}.ops-access-denied{border:1px solid #f0c3c3;border-radius:16px;background:#fff7f7;padding:24px;color:#762a2a}.ops-access-denied h2{margin-top:0;color:#762a2a}
    @media(max-width:1250px){.ops-context-strip{grid-template-columns:repeat(3,minmax(0,1fr))}.ops-context-card.company{grid-column:span 2}}
    @media(max-width:1100px){.ops-folder-grid,.ops-quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ops-context-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.ops-context-card.company{grid-column:span 2}}
    @media(max-width:650px){.ops-folder-grid,.ops-quick-grid,.ops-context-strip{grid-template-columns:1fr}.ops-context-card.company{grid-column:auto}.ops-hero{padding:22px}.ops-section-head{align-items:start;flex-direction:column}}
  `;
  document.head.appendChild(style);

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || 'null') || {}; }
    catch { return {}; }
  }

  const isParent = (entity) => entity?.entityType === 'HOLDING' || PARENT_CODES.has(String(entity?.code || '').toUpperCase());
  const hasActiveEmployment = (entity) => Array.isArray(entity?.employments) && entity.employments.some((employment) => String(employment?.status || '').toUpperCase() !== 'TERMINATED');

  function allowedOperatingEntities(context) {
    const entities = Array.isArray(context?.entities) ? context.entities : [];
    return entities.filter((entity) => {
      if (isParent(entity) || entity.status !== 'ACTIVE') return false;
      if (context?.enterpriseOwner) return true;
      return hasActiveEmployment(entity);
    });
  }

  function constrainSelector(context) {
    const allowedEntities = allowedOperatingEntities(context);
    const allowed = new Map(allowedEntities.map((entity) => [String(entity.id), entity]));
    const select = document.getElementById('adminCompanySelect');
    if (!select) return;
    [...select.options].forEach((option) => {
      if (!option.value) return;
      const entity = allowed.get(String(option.value));
      if (!entity) {
        option.remove();
        return;
      }
      const status = String(entity.status || 'ACTIVE');
      const serviceOperationsStatus = String(entity?.metadata?.serviceOperationsStatus || status);
      const licensingStatus = String(entity?.metadata?.licensingStatus || 'UNKNOWN');
      option.title = `Operations: ${serviceOperationsStatus} • Licensing: ${licensingStatus}`;
    });
    if (!allowed.size) {
      select.innerHTML = '<option>No assigned operating company</option>';
      select.disabled = true;
    }
  }

  function ensureOperatingSelection(context) {
    const companyContext = window.SulandraCompanyContext;
    const allowed = allowedOperatingEntities(context);
    const current = companyContext?.current?.();
    if (!allowed.length) return { allowed, current: null, reloading: false };
    if (current && allowed.some((entity) => String(entity.id) === String(current.id))) {
      sessionStorage.removeItem(OPERATIONS_BOOTSTRAP_KEY);
      return { allowed, current, reloading: false };
    }
    const target = allowed[0];
    const attempted = sessionStorage.getItem(OPERATIONS_BOOTSTRAP_KEY);
    if (attempted === String(target.id)) return { allowed, current: target, reloading: false };
    sessionStorage.setItem(OPERATIONS_BOOTSTRAP_KEY, String(target.id));
    try {
      localStorage.setItem(companyContext?.storageKey || 'sulandra:admin:legal-entity-id', String(target.id));
      sessionStorage.setItem(companyContext?.sharedStorageKey || 'sulandra:selected-legal-entity-id', String(target.id));
      localStorage.setItem(companyContext?.sharedStorageKey || 'sulandra:selected-legal-entity-id', String(target.id));
    } catch {}
    location.reload();
    return { allowed, current: target, reloading: true };
  }

  const folderCopy = [
    ['company-management','Company Management','Company identity, homes, official records and business evidence.','CO'],
    ['people-hr','People & HR','Hiring, Employee 360, scheduling, timekeeping, payroll and learning.','HR'],
    ['clients-spire','Clients & SPIRE','Client intake, SPIRE administration, medication and incident workflows.','SP'],
    ['service-operations','Service Operations','Company-specific SCLS, Home Health and NMT operating work.','OP'],
    ['billing-revenue','Billing & Revenue','Revenue cycle, claims, billing rules and payer connectivity.','BR'],
    ['compliance-quality','Compliance & Quality','Readiness, screenings, EVV, data quality and security review.','CQ'],
    ['communications-learning','Communications & Learning','Intranet, policies, education, news and support workflows.','CL'],
    ['system-administration','System Administration','Users, roles, workspaces, integrations and audit controls.','SA'],
  ];

  function openFolder(key) {
    const folder = document.querySelector(`[data-admin-folder="${key}"]`);
    if (!folder) return;
    folder.hidden = false;
    folder.open = true;
    folder.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function dashboardMarkup(context, entity) {
    const session = readSession();
    const role = String(session.role || 'Administrator').replaceAll('_', ' ');
    const owner = Boolean(context?.enterpriseOwner);
    const status = String(entity?.status || 'ACTIVE');
    const serviceOperationsStatus = String(entity?.metadata?.serviceOperationsStatus || status);
    const licensingStatus = String(entity?.metadata?.licensingStatus || 'UNKNOWN');
    const department = Array.isArray(entity?.employments)
      ? entity.employments.find((employment) => employment.primaryEmployment)?.departmentName || entity.employments[0]?.departmentName || 'Company-wide'
      : 'Company-wide';
    return `
      <section class="ops-hero">
        <div class="ops-eyebrow">Company Operations</div>
        <h1>${escapeHtml(entity?.displayName || 'Operations')}</h1>
        <p>A company-scoped administration desktop for workforce, clients, service delivery, revenue, compliance and system controls. Tools shown here follow the selected operating company and the signed-in administrator's authorized employment scope.</p>
        <div class="ops-hero-actions">
          <a href="/my-work.html">My Work</a><a href="/notifications.html">Notifications</a><a href="/platform-readiness.html">Platform Readiness</a>${owner ? '<a href="/admin.html">Owner Command Center</a>' : ''}
        </div>
      </section>
      <section class="ops-context-strip" aria-label="Current operating context">
        <div class="ops-context-card company"><small>Operating Company</small><strong><span class="ops-status-dot"></span>${escapeHtml(entity?.displayName || 'Not selected')}</strong></div>
        <div class="ops-context-card"><small>Company Status</small><strong>${escapeHtml(status)}</strong></div>
        <div class="ops-context-card"><small>Operations Status</small><strong>${escapeHtml(serviceOperationsStatus)}</strong></div>
        <div class="ops-context-card"><small>Licensing</small><strong>${escapeHtml(licensingStatus)}</strong></div>
        <div class="ops-context-card"><small>Your Role</small><strong>${escapeHtml(role)}</strong></div>
        <div class="ops-context-card"><small>Department Scope</small><strong>${escapeHtml(department || 'Company-wide')}</strong></div>
      </section>
      <section class="ops-section">
        <div class="ops-section-head"><div><h2>Administration</h2><p>Eight stable folders organize every company administration tool.</p></div><p>Search above or open a folder.</p></div>
        <div class="ops-folder-grid">${folderCopy.map(([key,title,copy,icon]) => `<button type="button" class="ops-folder-card" data-open-ops-folder="${key}"><span class="ops-folder-icon">${icon}</span><h3>${title}</h3><p>${copy}</p><span>Open folder →</span></button>`).join('')}</div>
      </section>
      <section class="ops-section">
        <div class="ops-section-head"><div><h2>Frequent Work</h2><p>Direct entry to common company-scoped workflows.</p></div></div>
        <div class="ops-quick-grid">
          <a class="ops-quick-link" href="#onboarding"><span>Hiring & Onboarding</span><small>Applicants through employee activation</small></a>
          <a class="ops-quick-link" href="/client-intake.html"><span>Client Intake</span><small>Admissions and referral packets</small></a>
          <a class="ops-quick-link" href="/scheduling.html"><span>Scheduling</span><small>Coverage and workforce schedules</small></a>
          <a class="ops-quick-link" href="/company-compliance.html"><span>Company Compliance</span><small>Evidence, findings and readiness</small></a>
        </div>
      </section>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  }

  function renderAccessDenied(message) {
    const dashboard = document.getElementById('module-dashboard');
    if (!dashboard) return;
    dashboard.dataset.operationsDesktop = 'true';
    dashboard.innerHTML = `<section class="ops-access-denied"><h2>Company Operations unavailable</h2><p>${escapeHtml(message)}</p><p>Operations access is assigned through an active employment with an operating Sulandra company. The parent Sulandra Health entity is intentionally not selectable here.</p></section>`;
  }

  function renderDashboard(context, entity) {
    if (rendering) return;
    const dashboard = document.getElementById('module-dashboard');
    if (!dashboard) return;
    rendering = true;
    try {
      dashboard.dataset.operationsDesktop = 'true';
      dashboard.classList.add('active');
      dashboard.innerHTML = dashboardMarkup(context, entity);
      dashboard.querySelectorAll('[data-open-ops-folder]').forEach((button) => button.addEventListener('click', () => openFolder(button.dataset.openOpsFolder)));
    } finally { rendering = false; }
  }

  async function initialize() {
    const session = readSession();
    const role = String(session.role || '').toUpperCase();
    const companyContext = window.SulandraCompanyContext;
    if (!companyContext) return;
    let context;
    try { context = await companyContext.initialize(); }
    catch (error) { renderAccessDenied(error.message || 'Unable to resolve company access.'); return; }
    if (!context?.enterpriseOwner && !MANAGEMENT_ROLES.has(role)) {
      location.replace('/employee-portal.html');
      return;
    }
    const selection = ensureOperatingSelection(context);
    if (selection.reloading) return;
    constrainSelector(context);
    if (!selection.allowed.length) {
      renderAccessDenied('No active operating-company employment is assigned to this account.');
      return;
    }
    const current = companyContext.current?.() || selection.current || selection.allowed[0];
    const alert = document.querySelector('.alert-bar');
    if (alert) alert.textContent = 'Company Operations — confidential. Authorized management staff only.';
    renderDashboard(context, current);
    window.setTimeout(() => { constrainSelector(context); renderDashboard(context, companyContext.current?.() || current); }, 450);
    window.setTimeout(() => { constrainSelector(context); renderDashboard(context, companyContext.current?.() || current); }, 1200);
  }

  window.addEventListener('sulandra:company-change', () => {
    const context = window.SulandraCompanyContext?.context?.();
    if (!context) return;
    constrainSelector(context);
    renderDashboard(context, window.SulandraCompanyContext.current?.());
  });

  const observer = new MutationObserver(() => {
    const context = window.SulandraCompanyContext?.context?.();
    if (!context) return;
    constrainSelector(context);
    const dashboard = document.getElementById('module-dashboard');
    if (dashboard && dashboard.dataset.operationsDesktop !== 'true') renderDashboard(context, window.SulandraCompanyContext.current?.());
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
