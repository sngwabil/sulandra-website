(() => {
  'use strict';

  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const HOME_QUERY_KEY = 'spireHome';
  const HOME_NAME_KEY = 'spire:selected-service-home-name';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const url = new URL(location.href);
  let selectedHomeId = String(url.searchParams.get(HOME_QUERY_KEY) || '').trim();
  const previousFetch = window.fetch.bind(window);

  const style = document.createElement('style');
  style.id = 'spire-network-home-access-style';
  style.textContent = `
    #sulandraCompanySwitcher{display:none!important}
    .spire-home-gate{position:fixed;inset:0;z-index:2147483000;background:linear-gradient(145deg,#e8f2f8 0%,#f7fbfd 48%,#eef7f3 100%);overflow:auto;font-family:"Segoe UI",Arial,sans-serif;color:#16364d}
    .spire-home-gate[hidden]{display:none!important}.spire-home-gate__top{height:10px;background:linear-gradient(90deg,#0a5b8d,#0b83ad,#39a47a)}
    .spire-home-gate__wrap{width:min(1180px,calc(100% - 32px));margin:0 auto;padding:44px 0 56px}.spire-home-gate__brand{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:26px}
    .spire-home-gate__brand img{width:260px;max-width:50vw}.spire-home-gate__security{font-size:12px;font-weight:800;color:#45677e;background:#fff;border:1px solid #d3e1e9;border-radius:999px;padding:8px 12px}
    .spire-home-gate__hero{background:#fff;border:1px solid #d4e2ea;border-radius:24px;box-shadow:0 22px 65px rgba(26,65,91,.13);padding:34px}
    .spire-home-gate__eyebrow{text-transform:uppercase;letter-spacing:.14em;font-weight:900;font-size:12px;color:#0878a7}.spire-home-gate h1{margin:7px 0 10px;font-size:clamp(30px,4vw,48px);color:#0b4568;line-height:1.05}.spire-home-gate__lead{margin:0;max-width:820px;color:#587080;font-size:17px;line-height:1.6}
    .spire-home-gate__toolbar{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;margin:26px 0 16px}.spire-home-gate__search{width:100%;min-height:48px;border:1px solid #b8ccd9;border-radius:12px;padding:0 15px;font:700 15px "Segoe UI",Arial,sans-serif;color:#173d56;outline:none}.spire-home-gate__search:focus{border-color:#0878a7;box-shadow:0 0 0 3px rgba(8,120,167,.12)}
    .spire-home-gate__count{font-size:13px;font-weight:800;color:#547084;white-space:nowrap}.spire-home-gate__message{min-height:24px;margin:6px 0 12px;font-weight:800;font-size:13px;color:#9a4e15}.spire-home-gate__message.ok{color:#2c7252}
    .spire-home-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.spire-home-card{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;border:1px solid #d5e2ea;border-radius:16px;padding:17px;background:#fbfdfe;transition:.15s ease}.spire-home-card:hover{border-color:#8db7cc;box-shadow:0 7px 20px rgba(24,74,105,.08)}.spire-home-card.favorite{border-color:#d9b458;background:#fffdf5}
    .spire-home-star{width:42px;height:42px;border-radius:12px;border:1px solid #ccdce5;background:#fff;color:#899ca8;font-size:24px;cursor:pointer;display:grid;place-items:center;line-height:1}.spire-home-card.favorite .spire-home-star{color:#c79516;border-color:#e3c878;background:#fff9df}.spire-home-star:focus-visible,.spire-home-access:focus-visible{outline:3px solid rgba(8,120,167,.22);outline-offset:2px}
    .spire-home-name{font-size:17px;font-weight:900;color:#123e5d}.spire-home-meta{font-size:12px;color:#657d8d;margin-top:4px;line-height:1.45}.spire-home-company{display:inline-block;color:#316178;font-weight:800}.spire-home-access{border:0;border-radius:11px;background:#0b6f9e;color:#fff;padding:11px 15px;font-weight:900;cursor:pointer;min-width:88px}.spire-home-access:hover{background:#075b84}.spire-home-access:disabled{opacity:.55;cursor:wait}
    .spire-home-empty{grid-column:1/-1;border:1px dashed #b8cbd7;border-radius:15px;padding:30px;text-align:center;color:#627b8b;background:#f9fcfd}.spire-home-gate__footer{margin-top:18px;font-size:12px;line-height:1.55;color:#6a7e8d}.spire-home-gate__footer strong{color:#385a70}
    .spire-current-home{display:inline-flex;align-items:center;gap:8px;border:1px solid #b9d4df;border-radius:999px;background:#eef9fc;color:#0b5578;padding:7px 10px;font:800 12px/1.2 "Segoe UI",Arial,sans-serif;white-space:nowrap}.spire-current-home button{border:0;background:transparent;color:#0a6b95;text-decoration:underline;font:800 12px "Segoe UI",Arial,sans-serif;cursor:pointer;padding:0}
    @media(max-width:760px){.spire-home-gate__wrap{width:min(100% - 20px,1180px);padding-top:22px}.spire-home-gate__brand{align-items:flex-start}.spire-home-gate__security{display:none}.spire-home-gate__hero{padding:22px 17px;border-radius:18px}.spire-home-gate__toolbar{grid-template-columns:1fr}.spire-home-grid{grid-template-columns:1fr}.spire-home-card{grid-template-columns:auto 1fr}.spire-home-access{grid-column:1/-1;width:100%}}
  `;
  document.head.appendChild(style);

  const apiUrl = (path) => /^https?:\/\//i.test(path) ? path : API + path;
  const requestUrl = (input) => typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url || '');
  const isGet = (input, init) => String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase() === 'GET';
  const isSpireApi = (value) => value.startsWith(API + '/api/spire/') || value.startsWith('/api/spire/') || value.startsWith(`${location.origin}/api/spire/`);
  const spirePath = (value) => {
    try { return new URL(value, location.origin).pathname; } catch { return ''; }
  };

  window.fetch = async (input, init = {}) => {
    let target = requestUrl(input);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    const path = spirePath(target);
    if (selectedHomeId && isSpireApi(target)) {
      headers.set('x-spire-home-id', selectedHomeId);
      if (isGet(input, init) && path === '/api/spire/patients') {
        target = apiUrl(`/api/spire/network/service-homes/${encodeURIComponent(selectedHomeId)}/patients`);
      } else if (isGet(input, init) && path === '/api/spire/schedule') {
        target = apiUrl(`/api/spire/network/service-homes/${encodeURIComponent(selectedHomeId)}/schedule`);
      }
    }
    return previousFetch(target, { ...init, headers });
  };

  const gate = document.createElement('section');
  gate.id = 'spireServiceHomeGate';
  gate.className = 'spire-home-gate';
  gate.hidden = Boolean(selectedHomeId);
  gate.setAttribute('aria-label', 'Select a SPIRE service home');
  gate.innerHTML = `
    <div class="spire-home-gate__top"></div>
    <div class="spire-home-gate__wrap">
      <div class="spire-home-gate__brand"><img src="/assets/mainlogo.png" alt="Sulandra Health"><span class="spire-home-gate__security">Protected Clinical Record · Authorized Access Only</span></div>
      <div class="spire-home-gate__hero">
        <div class="spire-home-gate__eyebrow">SPIRE Clinical Record</div>
        <h1>Welcome to SPIRE</h1>
        <p class="spire-home-gate__lead">Select the service home you are working in. You will see every active client assigned to that home. Only service homes assigned to your account are available; SPIRE administrators have access to the full Sulandra Health network.</p>
        <div class="spire-home-gate__toolbar"><input id="spireHomeSearch" class="spire-home-gate__search" type="search" autocomplete="off" placeholder="Search service homes…" aria-label="Search service homes"><span id="spireHomeCount" class="spire-home-gate__count"></span></div>
        <div id="spireHomeMessage" class="spire-home-gate__message" role="status"></div>
        <div id="spireHomeGrid" class="spire-home-grid"><div class="spire-home-empty">Loading your authorized service homes…</div></div>
        <div class="spire-home-gate__footer"><strong>Privacy notice:</strong> Selecting a service home and opening a client chart are audited. Access is for authorized care, operational, compliance, and clinical purposes only.</div>
      </div>
    </div>`;
  document.body.appendChild(gate);

  const grid = gate.querySelector('#spireHomeGrid');
  const search = gate.querySelector('#spireHomeSearch');
  const count = gate.querySelector('#spireHomeCount');
  const message = gate.querySelector('#spireHomeMessage');
  let homes = [];

  const setMessage = (value, ok = false) => {
    message.textContent = value || '';
    message.classList.toggle('ok', ok);
  };
  const addressOf = (home) => [home.streetAddress || home.address, home.city, home.state, home.zipCode].filter(Boolean).join(', ');
  const favoriteIds = () => homes.filter((home) => home.favorite).map((home) => String(home.id));

  async function saveFavorites() {
    const response = await previousFetch(apiUrl('/api/spire/network/favorites'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ homeIds: favoriteIds() }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to save favorites');
  }

  function renderHomes() {
    const term = String(search.value || '').trim().toLowerCase();
    const visible = homes.filter((home) => !term || [home.name, home.companyName, home.companyCode, addressOf(home)].some((value) => String(value || '').toLowerCase().includes(term)));
    count.textContent = `${visible.length} service home${visible.length === 1 ? '' : 's'}`;
    grid.innerHTML = '';
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'spire-home-empty';
      empty.textContent = homes.length ? 'No service homes match your search.' : 'No service homes are assigned to your SPIRE account. Ask a SPIRE administrator to assign your service-home access.';
      grid.appendChild(empty);
      return;
    }
    for (const home of visible) {
      const card = document.createElement('article');
      card.className = `spire-home-card${home.favorite ? ' favorite' : ''}`;
      card.dataset.homeId = home.id;
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'spire-home-star';
      star.setAttribute('aria-label', home.favorite ? `Remove ${home.name} from favorites` : `Favorite ${home.name}`);
      star.setAttribute('aria-pressed', home.favorite ? 'true' : 'false');
      star.textContent = home.favorite ? '★' : '☆';
      const details = document.createElement('div');
      details.innerHTML = `<div class="spire-home-name"></div><div class="spire-home-meta"><span class="spire-home-company"></span><br><span class="spire-home-address"></span><br><span class="spire-home-clients"></span></div>`;
      details.querySelector('.spire-home-name').textContent = home.name || 'Service Home';
      details.querySelector('.spire-home-company').textContent = home.companyName || home.companyCode || 'Sulandra Health';
      details.querySelector('.spire-home-address').textContent = addressOf(home) || 'Address maintained by administration';
      details.querySelector('.spire-home-clients').textContent = `${Number(home.clientCount || 0)} active client${Number(home.clientCount || 0) === 1 ? '' : 's'}`;
      const access = document.createElement('button');
      access.type = 'button';
      access.className = 'spire-home-access';
      access.textContent = 'Access';
      star.addEventListener('click', async () => {
        const wasFavorite = Boolean(home.favorite);
        if (!wasFavorite && favoriteIds().length >= 5) {
          setMessage('You can favorite up to five service homes. Remove one favorite before adding another.');
          return;
        }
        home.favorite = !wasFavorite;
        renderHomes();
        try {
          await saveFavorites();
          homes.sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || String(a.name || '').localeCompare(String(b.name || '')));
          renderHomes();
          setMessage(home.favorite ? `${home.name} added to favorites.` : `${home.name} removed from favorites.`, true);
        } catch (error) {
          home.favorite = wasFavorite;
          renderHomes();
          setMessage(error.message || 'Unable to save favorites.');
        }
      });
      access.addEventListener('click', async () => {
        access.disabled = true;
        access.textContent = 'Opening…';
        setMessage('');
        try {
          const response = await previousFetch(apiUrl(`/api/spire/network/service-homes/${encodeURIComponent(home.id)}/access`), {
            method: 'POST',
            headers: { Accept: 'application/json', 'x-spire-home-id': String(home.id) },
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to access this service home');
          selectedHomeId = String(home.id);
          sessionStorage.setItem(HOME_NAME_KEY, String(home.name || 'Service Home'));
          sessionStorage.setItem(HOME_ENTITY_KEY, String(home.legalEntityId || ''));
          const next = new URL(location.href);
          next.searchParams.set(HOME_QUERY_KEY, selectedHomeId);
          location.replace(next.toString());
        } catch (error) {
          access.disabled = false;
          access.textContent = 'Access';
          setMessage(error.message || 'Unable to access this service home.');
        }
      });
      card.append(star, details, access);
      grid.appendChild(card);
    }
  }

  async function loadHomes() {
    gate.hidden = false;
    setMessage('');
    grid.innerHTML = '<div class="spire-home-empty">Loading your authorized service homes…</div>';
    try {
      await window.SulandraEntityContext?.ready;
      const response = await previousFetch(apiUrl('/api/spire/network/service-homes'), { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        location.replace(`/employee-login.html?return=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
        return;
      }
      if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to load service homes');
      homes = Array.isArray(payload?.data?.homes) ? payload.data.homes : [];
      renderHomes();
      if (payload?.data?.administratorAccess) setMessage('Administrator access: all active Sulandra Health service homes are available.', true);
    } catch (error) {
      grid.innerHTML = '<div class="spire-home-empty">Service-home access could not be loaded.</div>';
      setMessage(error.message || 'Unable to load service homes.');
    }
  }

  function installCurrentHomeBadge() {
    if (!selectedHomeId || document.getElementById('spireCurrentHomeBadge')) return;
    const host = document.querySelector('.spire-top-actions') || document.querySelector('.spire-global-nav') || document.querySelector('header');
    if (!host) return;
    const badge = document.createElement('span');
    badge.id = 'spireCurrentHomeBadge';
    badge.className = 'spire-current-home';
    const name = sessionStorage.getItem(HOME_NAME_KEY) || 'Selected service home';
    const label = document.createElement('span');
    label.textContent = `Home: ${name}`;
    label.title = `Current service home: ${name}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Change Home';
    button.setAttribute('aria-label', 'Go back and select a different service home');
    button.title = 'Go back to the SPIRE service-home selector';
    button.addEventListener('click', () => {
      const next = new URL(location.href);
      next.searchParams.delete(HOME_QUERY_KEY);
      next.hash = '';
      location.assign(next.toString());
    });
    badge.append(label, button);
    host.prepend(badge);
  }

  search.addEventListener('input', renderHomes);
  if (!selectedHomeId) {
    loadHomes().catch(() => {});
  } else {
    gate.hidden = true;
    const observer = new MutationObserver(() => installCurrentHomeBadge());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('DOMContentLoaded', installCurrentHomeBadge, { once: true });
    installCurrentHomeBadge();
  }
})();
