(() => {
  'use strict';
  const OWNER_EMAIL = 'admin@sulandrahealth.com';
  const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
  const sessionKeys = ['sulandra:employee:session','sulandraSession','employeeSession','session','authSession'];
  const stores = [sessionStorage, localStorage];
  const readSession = () => {
    for (const store of stores) for (const key of sessionKeys) {
      try { const value = JSON.parse(store.getItem(key) || 'null'); if (value) return value; } catch {}
    }
    return {};
  };
  const session = readSession();
  const email = String(session.email || session.user?.email || session.employee?.email || '').toLowerCase();
  if (email !== OWNER_EMAIL) return;

  window.SULANDRA_ENTERPRISE_OWNER = Object.freeze({ email: OWNER_EMAIL, displayName: OWNER_NAME, clearance: 'ENTERPRISE_OWNER' });

  const applyIdentity = () => {
    const selectors = ['#employeeName','#userLabel','#currentUserName','#adminEmail','.current-user','.user-name','[data-current-user]'];
    for (const selector of selectors) document.querySelectorAll(selector).forEach((node) => {
      const text = String(node.textContent || '').trim();
      if (!text || text.includes('@') || /administrator|employee portal/i.test(text)) node.textContent = OWNER_NAME;
    });
    document.querySelectorAll('th,td,span,div,strong').forEach((node) => {
      if (node.children.length) return;
      if (String(node.textContent || '').trim().toLowerCase() === OWNER_EMAIL) node.textContent = OWNER_NAME;
    });
  };

  const installProfileStatus = () => {
    document.getElementById('sulandraOwnerConsoleButton')?.remove();
    document.getElementById('sulandraOwnerConsole')?.remove();
    const hosts = [
      document.getElementById('profileCard'),
      document.getElementById('module-profile'),
      document.querySelector('[data-profile-panel]'),
      document.querySelector('.profile-card'),
    ].filter(Boolean);
    for (const host of hosts) {
      if (host.querySelector?.('[data-enterprise-owner-profile]')) continue;
      const card = document.createElement('div');
      card.dataset.enterpriseOwnerProfile = 'true';
      card.style.cssText = 'margin-top:12px;padding:12px 14px;border:1px solid #d7c08d;border-radius:10px;background:#fffaf0;color:#67440a';
      card.innerHTML = `<strong style="display:block;color:#7a4b00">Enterprise Owner</strong><span>${OWNER_NAME}</span><br><small>Highest system-wide administrative clearance. Owner protections remain enforced by the backend.</small>`;
      host.appendChild(card);
    }
    document.querySelectorAll('#userLabel,#currentUserName,.current-user,.user-name,[data-current-user]').forEach(node => {
      node.setAttribute('title','Enterprise Owner');
      node.setAttribute('aria-label',`${OWNER_NAME}, Enterprise Owner`);
    });
  };

  const apply = () => { applyIdentity(); installProfileStatus(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once:true }); else apply();
  let attempts = 0;
  const timer = setInterval(() => { apply(); if (++attempts >= 12) clearInterval(timer); }, 500);
})();
