(() => {
  'use strict';

  if (!/\/admin\.html$/i.test(location.pathname)) return;

  const API_BASE = String(window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app').replace(/\/$/, '');
  const TOKEN_KEY = 'sulandra:employee:access-token';
  const token = () => sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';

  const style = document.createElement('style');
  style.id = 'sulandraOwnerConsoleBoundaryStyles';
  style.textContent = `
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
      return false;
    }
    const response = await fetch(`${API_BASE}/api/owner/authority`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}` },
    });
    if (response.ok) return true;
    if (response.status === 401) redirect('employee-login.html');
    else redirect('employee-portal.html');
    return false;
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
    verified = await verifyOwner().catch(() => false);
    if (!verified) return;
    hideCompanySelectors();
    addOperationsButton();
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
