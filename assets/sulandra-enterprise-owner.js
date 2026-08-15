(() => {
  'use strict';
  const OWNER_EMAIL = 'admin@sulandrahealth.com';
  const OWNER_NAME = 'Sulpitius Ndeh Gwabil';
  const OWNER_DISPLAY_NAME = 'Sulpitius Gwabil';
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

  const installProfileChipStyles = () => {
    if (document.getElementById('sulandraOwnerProfileChipStyles')) return;
    const style = document.createElement('style');
    style.id = 'sulandraOwnerProfileChipStyles';
    style.textContent = `
      #adminEmailPill.sulandra-owner-profile-chip{
        display:inline-flex!important;align-items:center!important;gap:8px!important;
        min-width:0!important;max-width:176px!important;height:42px!important;
        padding:4px 10px 4px 5px!important;border:1px solid #d8e4ee!important;
        border-radius:999px!important;background:#fff!important;color:#17324d!important;
        box-shadow:0 2px 8px rgba(15,57,88,.06)!important;cursor:pointer!important;
        transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease!important;
      }
      #adminEmailPill.sulandra-owner-profile-chip:hover{
        border-color:#8fb9d5!important;box-shadow:0 5px 14px rgba(15,76,116,.12)!important;
        transform:translateY(-1px)!important;
      }
      #adminEmailPill .owner-profile-avatar{
        flex:0 0 30px;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;
        background:linear-gradient(145deg,#0a5f96,#118fc2);color:#fff;font-size:10px;font-weight:950;
        letter-spacing:.03em;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);
      }
      #adminEmailPill .owner-profile-copy{min-width:0;display:block;line-height:1.05;text-align:left}
      #adminEmailPill .owner-profile-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:900;color:#17324d}
      #adminEmailPill .owner-profile-role{display:block;margin-top:3px;font-size:9px;font-weight:850;color:#6c8294;letter-spacing:.02em;white-space:nowrap}
      #adminEmailPill .owner-profile-chevron{flex:0 0 auto;color:#668097;font-size:11px;margin-left:1px}
      @media(max-width:1120px){#adminEmailPill.sulandra-owner-profile-chip{max-width:145px!important}#adminEmailPill .owner-profile-role{display:none}}
    `;
    document.head.appendChild(style);
  };

  const configureHeaderProfileChip = () => {
    // Remove the old standalone My Profile button that caused the Admin tools to wrap.
    document.getElementById('sulandraOwnerProfileLink')?.remove();
    installProfileChipStyles();

    const identity = document.getElementById('adminEmailPill');
    if (!identity) return;
    identity.classList.add('sulandra-owner-profile-chip');
    identity.innerHTML = `<span class="owner-profile-avatar" aria-hidden="true">SG</span><span class="owner-profile-copy"><span class="owner-profile-name">${OWNER_DISPLAY_NAME}</span><span class="owner-profile-role">Owner • DON</span></span><span class="owner-profile-chevron" aria-hidden="true">›</span>`;
    identity.title = `${OWNER_NAME} — Enterprise Owner & Director of Nursing`;
    identity.setAttribute('role', 'link');
    identity.setAttribute('tabindex', '0');
    identity.setAttribute('aria-label', `${OWNER_NAME}, Enterprise Owner and Director of Nursing. Open My Profile`);
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

  const apply = () => { applyIdentity(); configureHeaderProfileChip(); installProfileStatus(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once:true }); else apply();
  let attempts = 0;
  const timer = setInterval(() => { apply(); if (++attempts >= 20) clearInterval(timer); }, 500);
})();
