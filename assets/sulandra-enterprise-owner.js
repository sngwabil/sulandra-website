(() => {
  'use strict';
  const OWNER_EMAIL = 'admin@sulandrahealth.com';
  const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
  const PROFILE_PATH = '/admin-profile.html';
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

  window.SULANDRA_ENTERPRISE_OWNER = Object.freeze({ email: OWNER_EMAIL, displayName: OWNER_NAME, clearance: 'ENTERPRISE_OWNER', profilePath: PROFILE_PATH });

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

  const installHeaderProfileLink = () => {
    const tools = document.querySelector('.header-tools');
    if (!tools) return;
    let link = document.getElementById('sulandraOwnerProfileLink');
    if (!link) {
      link = document.createElement('a');
      link.id = 'sulandraOwnerProfileLink';
      link.href = PROFILE_PATH;
      link.className = 'btn-cta secondary';
      link.textContent = 'My Profile';
      link.title = 'Open Owner & Director of Nursing profile';
      link.setAttribute('aria-label', 'Open My Executive Profile');
      const identity = document.getElementById('adminEmailPill');
      if (identity?.nextSibling) tools.insertBefore(link, identity.nextSibling);
      else if (identity) tools.appendChild(link);
      else tools.prepend(link);
    }
    const identity = document.getElementById('adminEmailPill');
    if (identity) {
      identity.textContent = OWNER_NAME;
      identity.title = 'Enterprise Owner — open My Profile';
      identity.style.cursor = 'pointer';
      identity.setAttribute('role', 'link');
      identity.setAttribute('tabindex', '0');
      identity.setAttribute('aria-label', `${OWNER_NAME}, Enterprise Owner. Open My Profile`);
      if (identity.dataset.ownerProfileBound !== 'true') {
        identity.dataset.ownerProfileBound = 'true';
        const openProfile = () => window.location.assign(PROFILE_PATH);
        identity.addEventListener('click', openProfile);
        identity.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openProfile();
          }
        });
      }
    }
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
      card.innerHTML = `<strong style="display:block;color:#7a4b00">Enterprise Owner</strong><span>${OWNER_NAME}</span><br><small>Highest system-wide administrative clearance. Owner protections remain enforced by the backend.</small><br><a href="${PROFILE_PATH}" style="display:inline-block;margin-top:8px;color:#075985;font-weight:800">Open My Executive Profile</a>`;
      host.appendChild(card);
    }
    document.querySelectorAll('#userLabel,#currentUserName,.current-user,.user-name,[data-current-user]').forEach(node => {
      node.setAttribute('title','Enterprise Owner');
      node.setAttribute('aria-label',`${OWNER_NAME}, Enterprise Owner`);
    });
  };

  const apply = () => { applyIdentity(); installHeaderProfileLink(); installProfileStatus(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once:true }); else apply();
  let attempts = 0;
  const timer = setInterval(() => { apply(); if (++attempts >= 20) clearInterval(timer); }, 500);
})();
