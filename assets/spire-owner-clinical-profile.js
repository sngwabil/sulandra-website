(() => {
  'use strict';

  // SPIRE_OWNER_CLINICAL_PROFILE_SYNC_V1
  // Keeps professional/clinical identity separate from the authenticated RBAC role.
  // The login may remain ADMINISTRATOR for authorization while visible SPIRE identity
  // comes from the auditable internal owner/leadership appointment record.
  const MARKER = 'SPIRE_OWNER_CLINICAL_PROFILE_SYNC_V1';
  if (window[MARKER]) return;
  window[MARKER] = true;

  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const PROFILE_ENDPOINT = '/api/owner/profile';
  const TOKEN_KEYS = ['sulandra:employee:access-token', 'sulandra_token', 'token', 'accessToken'];
  const SESSION_KEYS = ['sulandra:employee:session', 'sulandraSession', 'employeeSession', 'session', 'authSession'];
  let canonicalIdentity = null;
  let observer = null;
  let applying = false;

  const clean = (value) => String(value ?? '').trim();
  const esc = (value) => clean(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';

  function readSession() {
    for (const store of [sessionStorage, localStorage]) {
      for (const key of SESSION_KEYS) {
        try {
          const value = JSON.parse(store.getItem(key) || 'null');
          if (value && typeof value === 'object') return value.user || value.session || value;
        } catch {}
      }
    }
    return {};
  }

  function initials(name) {
    return clean(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'SG';
  }

  function titleCase(value) {
    return clean(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function deriveIdentity(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const appointments = Array.isArray(profile.appointments) ? profile.appointments : [];
    const active = appointments.filter((item) => !item.status || clean(item.status).toUpperCase() === 'ACTIVE');
    const enterpriseDon = active.find((item) => clean(item.appointmentKey).toUpperCase() === 'ENTERPRISE_DON')
      || active.find((item) => /enterprise director of nursing/i.test(clean(item.title)));
    const homeHealthDon = active.find((item) => /director of nursing|clinical director/i.test(clean(item.title)) && /home health/i.test(`${clean(item.legalEntityName)} ${clean(item.legalEntityCode)}`));
    const clinicalAppointment = enterpriseDon || homeHealthDon || active.find((item) => /nursing|clinical/i.test(clean(item.title)));
    const credentials = [...new Set(active.map((item) => clean(item.credentialLabel)).filter(Boolean))];
    const credentialStatuses = [...new Set(active.filter((item) => clean(item.credentialLabel)).map((item) => clean(item.credentialVerificationStatus)).filter(Boolean))];
    const displayName = clean(profile.displayName || profile.fullName || profile.name);
    if (!displayName) return null;
    const primaryTitle = clean(clinicalAppointment?.title || 'Enterprise Clinical Leadership');
    const credentialText = credentials.join(', ');
    const professionalTitle = [credentialText, primaryTitle].filter(Boolean).join(' · ');
    const session = readSession();
    return {
      displayName,
      displayNameWithCredentials: credentialText ? `${displayName}, ${credentialText}` : displayName,
      email: clean(profile.email || session.email),
      professionalTitle,
      primaryTitle,
      credentialText,
      credentialStatuses,
      securityRole: clean(session.role),
      clearance: clean(profile.clearance),
      hiringPath: clean(profile.hiringPath),
    };
  }

  async function loadCanonicalIdentity() {
    const authToken = token();
    if (!authToken) return null;
    try {
      const response = await fetch(API + PROFILE_ENDPOINT, {
        cache: 'no-store',
        headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}` },
      });
      // This endpoint is intentionally owner-scoped. For every other SPIRE user,
      // leave the normal authenticated employee identity untouched.
      if (response.status === 401 || response.status === 403 || response.status === 404) return null;
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Owner profile unavailable (${response.status})`);
      return deriveIdentity(payload.data ?? payload);
    } catch (error) {
      console.warn('[SPIRE owner profile] canonical identity sync unavailable', error);
      return null;
    }
  }

  function setText(node, value) {
    if (node && value && clean(node.textContent) !== value) node.textContent = value;
  }

  function setValue(node, value) {
    if (node && value && node.value !== value) node.value = value;
  }

  function installCanonicalStatus(modal, identity) {
    if (!modal) return;
    let note = modal.querySelector('#spireCanonicalOwnerProfileStatus');
    if (!note) {
      note = document.createElement('div');
      note.id = 'spireCanonicalOwnerProfileStatus';
      note.style.cssText = 'margin:10px 0 0;padding:8px 10px;border:1px solid #a9c9da;border-radius:5px;background:#eef8fc;color:#31566a;font:600 11px/1.35 Segoe UI,Arial,sans-serif';
      const profileTab = modal.querySelector('#accessProfileTab') || modal.querySelector('.modal-body');
      const saveArea = profileTab?.querySelector('[style*="text-align: right"]');
      if (saveArea) saveArea.insertAdjacentElement('beforebegin', note);
      else profileTab?.appendChild(note);
    }
    if (note) {
      const status = identity.credentialStatuses.length
        ? identity.credentialStatuses.map(titleCase).join(', ')
        : 'Recorded';
      note.innerHTML = `<b>Synced from Executive Profile</b> · ${esc(identity.primaryTitle)}${identity.credentialText ? ` · ${esc(identity.credentialText)} credential status: ${esc(status)}` : ''}. System permissions are managed separately from your professional title.`;
    }
  }

  function applyCanonicalIdentity() {
    if (!canonicalIdentity || applying) return;
    applying = true;
    try {
      const identity = canonicalIdentity;
      const topName = document.getElementById('topUserNameDisplay');
      setText(topName, identity.displayNameWithCredentials);
      const topAvatar = document.getElementById('topUserAvatarDisplay');
      if (topAvatar && !topAvatar.querySelector('img')) setText(topAvatar, initials(identity.displayName));
      const trigger = document.querySelector('.user-profile-trigger');
      if (trigger) {
        trigger.title = `${identity.displayNameWithCredentials} — ${identity.primaryTitle}`;
        trigger.setAttribute('aria-label', `Open profile and accessibility settings for ${identity.displayNameWithCredentials}`);
      }

      const modal = document.getElementById('accessibilityModal');
      if (modal) {
        const nameInput = modal.querySelector('#inputClinicianName');
        const credentialInput = modal.querySelector('#inputClinicianCredentials');
        setValue(nameInput, identity.displayName);
        setValue(credentialInput, identity.professionalTitle);
        for (const input of [nameInput, credentialInput]) {
          if (!input) continue;
          input.readOnly = true;
          input.setAttribute('aria-readonly', 'true');
          input.title = 'Synced from your Sulandra Health Executive Profile';
          input.style.background = '#f4f9fc';
          input.style.color = '#173f58';
        }
        const preview = modal.querySelector('#modalUserAvatarPreview');
        if (preview && !preview.querySelector('img')) setText(preview, initials(identity.displayName));
        installCanonicalStatus(modal, identity);
      }

      // Current-user author banners are display identity only. Filed records still
      // use the authenticated token/user id for audit attribution on the backend.
      document.querySelectorAll('.note-author-banner').forEach((banner) => {
        const text = clean(banner.textContent).toLowerCase();
        const loginEmail = identity.email.toLowerCase();
        if (!(text.includes(loginEmail) || text.includes('administrator') || text.includes('current user') || text.includes(identity.displayName.toLowerCase()))) return;
        const avatar = banner.querySelector('.note-author-avatar');
        if (avatar && !avatar.querySelector('img')) setText(avatar, initials(identity.displayName));
        const strong = banner.querySelector('b,strong');
        setText(strong, identity.displayNameWithCredentials);
      });
    } finally {
      applying = false;
    }
  }

  function wrapAccessibilityLauncher() {
    const original = window.openAccessibilityModal;
    if (typeof original !== 'function' || original.__canonicalOwnerWrapped) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      queueMicrotask(applyCanonicalIdentity);
      window.setTimeout(applyCanonicalIdentity, 0);
      window.setTimeout(applyCanonicalIdentity, 120);
      return result;
    };
    wrapped.__canonicalOwnerWrapped = true;
    window.openAccessibilityModal = wrapped;
  }

  function watchForProfileChanges() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (!canonicalIdentity) return;
      window.requestAnimationFrame(() => {
        wrapAccessibilityLauncher();
        applyCanonicalIdentity();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  async function start() {
    canonicalIdentity = await loadCanonicalIdentity();
    if (!canonicalIdentity) return;
    window.SPIRE_CANONICAL_CLINICAL_IDENTITY = Object.freeze({ ...canonicalIdentity });
    wrapAccessibilityLauncher();
    applyCanonicalIdentity();
    watchForProfileChanges();
    for (const delay of [100, 300, 750, 1500, 3000]) window.setTimeout(applyCanonicalIdentity, delay);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
