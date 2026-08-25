(() => {
  'use strict';
  const registry = window.SulandraAdminRouteRegistry;
  if (!registry || registry.version !== '2.0.0') {
    console.error('[Sulandra Admin IA] Canonical route registry is unavailable.');
    return;
  }

  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  function installStyles() {
    if (document.getElementById('adminInformationArchitectureStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminInformationArchitectureStyles';
    style.textContent = `
      body.admin-ia-v2 .grid{grid-template-columns:320px minmax(0,1fr)!important;gap:18px!important}
      body.admin-ia-v2 .sidebar{position:sticky;top:150px;max-height:calc(100vh - 170px);overflow:auto;padding:15px!important}
      body.admin-ia-v2 .sidebar>.section-title{font-size:11px;letter-spacing:.09em;color:#587087;margin:0 0 8px}
      body.admin-ia-v2 #sideModuleNav{display:grid;gap:8px}
      body.admin-ia-v2 .admin-tool-search{position:relative;margin:0 0 12px}
      body.admin-ia-v2 .admin-tool-search input{width:100%;min-width:0;border:1px solid #bfd0df;border-radius:11px;background:#fff;padding:11px 12px 11px 36px;font:750 13px/1.2 'Segoe UI',Arial,sans-serif;color:#17324d}
      body.admin-ia-v2 .admin-tool-search span{position:absolute;left:12px;top:9px;color:#587087}
      body.admin-ia-v2 .admin-search-empty{display:none;margin:8px 2px;padding:10px;border:1px dashed #bfd0df;border-radius:10px;color:#587087;font-size:12px}
      body.admin-ia-v2 .admin-search-empty.visible{display:block}
      body.admin-ia-v2 .admin-nav-folder{border:1px solid #d5e1eb;border-radius:12px;background:#fbfdff;overflow:hidden}
      body.admin-ia-v2 .admin-nav-folder[open]{border-color:#9fc5df;background:#f7fbff;box-shadow:0 5px 16px rgba(8,58,103,.07)}
      body.admin-ia-v2 .admin-nav-folder summary{list-style:none;display:flex;align-items:center;gap:10px;min-height:48px;padding:10px 12px;cursor:pointer;color:#153b5c;font-weight:900;font-size:13px}
      body.admin-ia-v2 .admin-nav-folder summary::-webkit-details-marker{display:none}
      body.admin-ia-v2 .admin-nav-folder summary::after{content:'›';margin-left:auto;font-size:18px;transition:transform .16s ease}
      body.admin-ia-v2 .admin-nav-folder[open] summary::after{transform:rotate(90deg)}
      body.admin-ia-v2 .admin-nav-folder-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:#e7f2fa;color:#075985;font-size:13px}
      body.admin-ia-v2 .admin-nav-folder-items{display:grid;gap:5px;padding:0 8px 9px}
      body.admin-ia-v2 .admin-nav-folder-item{min-width:0}
      body.admin-ia-v2 .admin-nav-folder-item[hidden]{display:none!important}
      body.admin-ia-v2 .admin-nav-folder .side-btn{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;text-decoration:none;text-align:left;border:0;border-radius:9px;padding:9px 10px;background:transparent;color:#294b67;font:800 12px/1.25 'Segoe UI',Arial,sans-serif;cursor:pointer}
      body.admin-ia-v2 .admin-nav-folder .side-btn:hover,body.admin-ia-v2 .admin-nav-folder .side-btn.active{background:#e9f5fd;color:#075985}
      body.admin-ia-v2 .admin-nav-folder .side-btn small{display:block;color:#708498;font-weight:650;font-size:10px;text-align:right}
      body.admin-ia-v2 .admin-nav-folder-description{padding:0 12px 10px;color:#6d8194;font-size:10px;line-height:1.35}
      body.admin-ia-v2 .admin-sidebar-note{margin-top:12px;padding:11px;border-radius:11px;background:#eef7fc;color:#36576f;font-size:11px;line-height:1.45}
      body.admin-ia-v2 .edge-drawer,body.admin-ia-v2 .edge-toggle{display:none!important}
      body.admin-ia-v2 #operationsTaskbarToggle,body.admin-ia-v2 #operationsTaskbarScrim{display:none!important}
      body.admin-ia-v2.taskbar-open .grid,body.admin-ia-v2.taskbar-closed .grid{grid-template-columns:320px minmax(0,1fr)!important;gap:18px!important}
      body.admin-ia-v2.taskbar-open .sidebar,body.admin-ia-v2.taskbar-closed .sidebar{transform:none!important;opacity:1!important;pointer-events:auto!important}
      body.admin-ia-v2 #topModuleNav{align-items:center}
      body.admin-ia-v2 #topModuleNav>li>a{display:flex;align-items:center;min-height:42px}
      body.admin-ia-v2 #adminTopNavigationMore{display:none!important}
      body.admin-ia-v2 .module-location{display:flex;align-items:center;gap:8px;margin:0 0 10px;color:#5c7488;font-size:11px;font-weight:800}
      body.admin-ia-v2 .module-location span+span::before{content:'›';margin-right:8px;color:#91a4b5}
      @media(max-width:980px){
        body.admin-ia-v2 .grid,body.admin-ia-v2.taskbar-open .grid,body.admin-ia-v2.taskbar-closed .grid{display:grid!important;grid-template-columns:1fr!important;gap:14px!important}
        body.admin-ia-v2 .sidebar{position:static;max-height:none}
      }
    `;
    document.head.appendChild(style);
  }

  function topMarkup(item) {
    if (item.kind === 'module') {
      return `<li><a href="#${esc(item.module)}" data-module="${esc(item.module)}">${esc(item.label)}</a></li>`;
    }
    return `<li><a href="${esc(item.href)}" class="admin-nav-route" data-sulandra-route="${esc(item.href)}">${esc(item.label)}</a></li>`;
  }

  function sideControl(item) {
    const company = item.companyCodes?.[0] || '';
    const wrapper = `class="admin-nav-folder-item" data-admin-search="${esc([item.label,item.sub,item.desc,...(item.tags||[])].join(' ').toLowerCase())}"${company ? ` data-company-module="${esc(company)}" hidden` : ''}`;
    const detail = item.sub ? `<small>${esc(item.sub)}</small>` : '';
    if (item.kind === 'module') {
      return `<div ${wrapper}><button class="side-btn" type="button" data-module="${esc(item.module)}">${esc(item.label)}${detail}</button></div>`;
    }
    return `<div ${wrapper}><a class="side-btn admin-nav-route" href="${esc(item.href)}" data-sulandra-route="${esc(item.href)}">${esc(item.label)}${detail}</a></div>`;
  }

  function renderNavigation() {
    const top = document.getElementById('topModuleNav');
    if (top) {
      top.innerHTML = registry.topNav.map(topMarkup).join('');
      top.dataset.canonicalNavigation = 'true';
      top.setAttribute('aria-label','Sulandra Admin global actions');
    }
    const side = document.getElementById('sideModuleNav');
    if (!side) return;
    side.innerHTML = registry.folders.map((folder,index) => `
      <details class="admin-nav-folder" data-admin-folder="${esc(folder.id)}" ${index < 2 ? 'open' : ''}>
        <summary><span class="admin-nav-folder-icon" aria-hidden="true">${esc(folder.icon)}</span><span>${esc(folder.label)}</span></summary>
        <div class="admin-nav-folder-description">${esc(folder.description)}</div>
        <div class="admin-nav-folder-items">${folder.items.map(sideControl).join('')}</div>
      </details>
    `).join('');
    side.dataset.canonicalNavigation = 'true';
    side.setAttribute('aria-label','Sulandra Admin organized tools');
    installSearch(side);
    updateCompanyVisibility();
    updateActiveFolder();
  }

  function installSearch(side) {
    const sidebar = side.closest('.sidebar');
    if (!sidebar || document.getElementById('adminToolSearch')) return;
    const title = sidebar.querySelector(':scope > .section-title');
    if (title) title.textContent = 'Company Operations';
    const box = document.createElement('label');
    box.className = 'admin-tool-search';
    box.innerHTML = '<span aria-hidden="true">⌕</span><input id="adminToolSearch" type="search" autocomplete="off" placeholder="Find an Admin tool…" aria-label="Find an Admin tool">';
    side.before(box);
    const empty = document.createElement('div');
    empty.className = 'admin-search-empty';
    empty.id = 'adminToolSearchEmpty';
    empty.textContent = 'No authorized tools match this search.';
    side.after(empty);
    box.querySelector('input').addEventListener('input', event => filterNavigation(event.target.value));
    const oldNotes = sidebar.querySelectorAll(':scope > .section-title, :scope > .sub');
    oldNotes.forEach(node => {
      if (node !== title && !node.closest('.admin-tool-search')) node.remove();
    });
    const note = document.createElement('div');
    note.className = 'admin-sidebar-note';
    note.innerHTML = '<strong>Selected-company workspace</strong><br>Home Health, SCLS and NMT tools follow the company selector. SPIRE remains the separate clinical record application.';
    sidebar.appendChild(note);
  }

  function filterNavigation(value) {
    const query = String(value || '').trim().toLowerCase();
    let matches = 0;
    document.querySelectorAll('[data-admin-folder]').forEach(folder => {
      let folderMatches = 0;
      folder.querySelectorAll('[data-admin-search]').forEach(item => {
        const companyHidden = item.dataset.companyModule && item.dataset.companyModule !== currentCompanyCode();
        const textMatch = !query || item.dataset.adminSearch.includes(query);
        item.hidden = companyHidden || !textMatch;
        if (!item.hidden) folderMatches += 1;
      });
      folder.hidden = folderMatches === 0;
      if (query && folderMatches) folder.open = true;
      matches += folderMatches;
    });
    document.getElementById('adminToolSearchEmpty')?.classList.toggle('visible',matches === 0);
  }

  function currentCompanyCode() {
    return document.body?.dataset?.legalEntityCode || window.SulandraCompanyContext?.current?.()?.code || '';
  }

  function updateCompanyVisibility() {
    const code = currentCompanyCode();
    document.querySelectorAll('[data-admin-folder] [data-company-module]').forEach(item => {
      item.hidden = item.dataset.companyModule !== code;
    });
    const search = document.getElementById('adminToolSearch');
    filterNavigation(search?.value || '');
  }

  function updateActiveFolder() {
    const activeModule = String(location.hash || '').replace(/^#/,'') || 'dashboard';
    document.querySelectorAll('[data-admin-folder]').forEach(folder => {
      const active = Boolean(folder.querySelector(`[data-module="${CSS.escape(activeModule)}"]`));
      if (active) folder.open = true;
    });
  }

  function moveServiceRequests() {
    if (document.getElementById('module-service-requests')) return;
    const panel = document.getElementById('onboarding-service-requests');
    const onboarding = document.getElementById('module-onboarding');
    if (!panel || !onboarding?.parentElement) return;
    const module = document.createElement('section');
    module.className = 'module';
    module.id = 'module-service-requests';
    module.innerHTML = '<div class="module-location"><span>Service Operations</span><span>Service Requests</span></div><div class="onboarding-hero"><h1>Service Requests</h1><p>Review incoming client and operational requests for the selected company. Hiring remains in People & HR.</p></div>';
    panel.classList.remove('onboarding-panel','active');
    panel.removeAttribute('hidden');
    module.appendChild(panel);
    onboarding.parentElement.insertBefore(module,onboarding.nextSibling);
  }

  function addModuleLocation() {
    const folderByModule = new Map();
    registry.folders.forEach(folder => folder.items.filter(item => item.kind === 'module').forEach(item => folderByModule.set(item.module,{folder,item})));
    document.querySelectorAll('.module[id^="module-"]').forEach(module => {
      if (module.querySelector(':scope > .module-location')) return;
      const key = module.id.replace(/^module-/,'');
      const owner = folderByModule.get(key);
      if (!owner) return;
      const location = document.createElement('div');
      location.className = 'module-location';
      location.innerHTML = `<span>${esc(owner.folder.label)}</span><span>${esc(owner.item.label)}</span>`;
      module.prepend(location);
    });
  }

  function bind() {
    document.body.classList.add('admin-ia-v2');
    document.documentElement.dataset.adminInformationArchitecture = '2';
    installStyles();
    moveServiceRequests();
    renderNavigation();
    addModuleLocation();
    window.addEventListener('sulandra:company-change',updateCompanyVisibility);
    window.addEventListener('sulandra:entity-context-changed',updateCompanyVisibility);
    window.addEventListener('hashchange',() => { updateActiveFolder(); addModuleLocation(); });
    const moduleHost = document.querySelector('main');
    if (moduleHost && 'MutationObserver' in window) {
      new MutationObserver(addModuleLocation).observe(moduleHost,{childList:true,subtree:true});
    }
  }

  window.SulandraAdminIA = Object.freeze({
    active:true,
    render:renderNavigation,
    updateCompanyVisibility,
    registry,
  });

  // admin.html loads this at the end of <body>. Install immediately so the
  // existing Admin controller binds its module handlers to the canonical
  // folder controls instead of controls that are replaced on DOMContentLoaded.
  if (document.body) bind();
  else document.addEventListener('DOMContentLoaded',bind,{once:true});
})();
