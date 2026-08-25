(() => {
  'use strict';

  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const API_BASE = String(window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app').replace(/\/$/, '');
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const SELECTED_ENTITY_KEY = 'sulandra:admin:legal-entity-id';
  const SHARED_SELECTED_ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const OWNER_BOOTSTRAP_KEY = 'sulandra:owner-console:parent-bootstrap';
  const PARENT_CODE = 'SULANDRA_HEALTH';
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';

  document.documentElement.classList.add('sulandra-owner-verifying');
  const style = document.createElement('style');
  style.id = 'sulandraOwnerConsoleBoundaryStyles';
  style.textContent = `
    html.sulandra-owner-verifying body{visibility:hidden!important}
    #adminCompanyContext,#adminCompanySelectorContainer,.admin-company-selector{display:none!important}
    #ownerOperationsLauncher{display:inline-flex!important;align-items:center;justify-content:center;text-decoration:none}
  `;
  document.head.appendChild(style);

  function redirect(destination) {
    if (location.pathname.endsWith(destination)) return;
    location.replace(destination);
  }

  async function verifyOwner() {
    const authToken = token();
    if (!authToken) {
      redirect('employee-login.html');
      return null;
    }
    const response = await fetch(`${API_BASE}/api/owner/authority`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      if (response.status === 401) redirect('employee-login.html');
      else redirect('employee-portal.html');
      return null;
    }
    const payload = await response.json().catch(() => ({}));
    const profile = payload?.data || payload || {};
    return profile?.isOwner === true ? profile : null;
  }

  function parentEmployment(profile) {
    const employments = Array.isArray(profile?.employments) ? profile.employments : [];
    return employments.find((employment) => String(employment?.legalEntityCode || '').toUpperCase() === PARENT_CODE)
      || employments.find((employment) => employment?.primaryEmployment)
      || null;
  }

  function pinParentContext(profile) {
    const parent = parentEmployment(profile);
    if (!parent?.legalEntityId) return false;
    const parentId = String(parent.legalEntityId);
    let current = '';
    try { current = localStorage.getItem(SELECTED_ENTITY_KEY) || sessionStorage.getItem(SHARED_SELECTED_ENTITY_KEY) || ''; } catch {}
    if (current === parentId) {
      try { sessionStorage.removeItem(OWNER_BOOTSTRAP_KEY); } catch {}
      return false;
    }
    let attempted = '';
    try { attempted = sessionStorage.getItem(OWNER_BOOTSTRAP_KEY) || ''; } catch {}
    if (attempted === parentId) return false;
    try {
      sessionStorage.setItem(OWNER_BOOTSTRAP_KEY, parentId);
      localStorage.setItem(SELECTED_ENTITY_KEY, parentId);
      sessionStorage.setItem(SHARED_SELECTED_ENTITY_KEY, parentId);
      localStorage.setItem(SHARED_SELECTED_ENTITY_KEY, parentId);
    } catch {}
    location.reload();
    return true;
  }

  function hideCompanySelectors() {
    document.querySelectorAll('#adminCompanyContext,#adminCompanySelectorContainer,.admin-company-selector').forEach((node) => {
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
    });
  }

  function addOperationsButton() {
    if (document.getElementById('ownerOperationsLauncher')) return true;
    const controls = [...document.querySelectorAll('a,button')];
    const readiness = controls.find((node) => String(node.textContent || '').trim().toLowerCase() === 'platform readiness');
    if (!readiness?.parentElement) return false;
    const link = document.createElement('a');
    link.id = 'ownerOperationsLauncher';
    link.href = '/admin-operations.html';
    link.className = readiness.className || 'widget-btn';
    link.textContent = 'Operations';
    link.setAttribute('aria-label', 'Open company Operations desktop');
    readiness.insertAdjacentElement('afterend', link);
    return true;
  }

  let verified = false;
  const start = async () => {
    hideCompanySelectors();
    const profile = await verifyOwner().catch(() => null);
    if (!profile) return;
    if (pinParentContext(profile)) return;
    verified = true;
    hideCompanySelectors();
    addOperationsButton();
    document.documentElement.classList.remove('sulandra-owner-verifying');
    window.setTimeout(addOperationsButton, 350);
    window.setTimeout(addOperationsButton, 1000);
  };

  const observer = new MutationObserver(() => {
    hideCompanySelectors();
    if (verified) addOperationsButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
