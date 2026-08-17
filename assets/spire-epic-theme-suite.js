(() => {
  'use strict';

  // SPIRE_EPIC_THEME_SUITE_V1
  // SPIRE_THEME_PICKER_SAFE_V2
  // Available Themes — Clinical set (legacy build marker).
  // Eight clinical palettes remain first; eleven distinct S.P.I.R.E. presets follow.
  // Similar legacy palettes remain supported internally for saved preferences but are
  // intentionally not duplicated in the visible picker.
  const BASE_KEY = 'spire:epic-theme-suite:preset';
  const SESSION_KEY = 'sulandra:employee:session';
  const TOTAL_VISIBLE_THEMES = 19;

  const THEMES = Object.freeze({
    altitude: {
      label: 'Altitude', swatch: '#36b9d6',
      title: '#183746', toolbar: '#2d7f99', bg: '#eaf4f7', card: '#ffffff', panel: '#f5fafc', panel2: '#e1eef3', text: '#173441', muted: '#597581', line: '#aac5cf', accent: '#1d95b5', accent2: '#2375a1', link: '#066f9a', focus: '#00a6cf', active: '#d8f2f8',
      warn: '#9a5a08', warnTint: '#fff2ce', danger: '#b42336', dangerTint: '#fde8ec', success: '#18794e', successTint: '#e5f6ee'
    },
    lavender: {
      label: 'Lavender', swatch: '#a05fb5',
      title: '#4f3b5f', toolbar: '#8a68a0', bg: '#f3eef6', card: '#ffffff', panel: '#faf7fb', panel2: '#e9deef', text: '#3f3347', muted: '#75677d', line: '#cabbd2', accent: '#8f65a5', accent2: '#684f8f', link: '#6c4c91', focus: '#9a5db8', active: '#eadcf1',
      warn: '#8a5b16', warnTint: '#fff2d6', danger: '#a53b5c', dangerTint: '#fbe9ef', success: '#3c7652', successTint: '#e8f4ec'
    },
    verdant: {
      label: 'Verdant', swatch: '#64a64a',
      title: '#315342', toolbar: '#5d865f', bg: '#edf4ee', card: '#ffffff', panel: '#f7faf7', panel2: '#dfeadf', text: '#294137', muted: '#64766c', line: '#b7c9bb', accent: '#5e925d', accent2: '#3d745c', link: '#2c7158', focus: '#4a9b68', active: '#e0efe0',
      warn: '#8a6117', warnTint: '#fff2d6', danger: '#a33d45', dangerTint: '#fbe9eb', success: '#23734c', successTint: '#e1f3e8'
    },
    deepBlue: {
      label: 'Deep Blue', swatch: '#3a6d93',
      title: '#0c2944', toolbar: '#1c4f78', bg: '#e8eef5', card: '#ffffff', panel: '#f4f7fa', panel2: '#d8e3ed', text: '#18344c', muted: '#63788a', line: '#a9bdcf', accent: '#326f9e', accent2: '#234f79', link: '#1b6396', focus: '#1677b5', active: '#dceaf5',
      warn: '#94600f', warnTint: '#fff2d6', danger: '#ac3448', dangerTint: '#fce8ec', success: '#277352', successTint: '#e2f3eb'
    },
    amethyst: {
      label: 'Amethyst', swatch: '#8500ad',
      title: '#351242', toolbar: '#6a1a83', bg: '#f2eaf6', card: '#ffffff', panel: '#faf7fc', panel2: '#e7d8ed', text: '#3f2249', muted: '#765e7f', line: '#c9b4d1', accent: '#8c2ca8', accent2: '#5e2f82', link: '#7c2699', focus: '#a13ac0', active: '#ead9f0',
      warn: '#8f5c14', warnTint: '#fff2d5', danger: '#aa315a', dangerTint: '#fbe6ef', success: '#33744e', successTint: '#e4f3e8'
    },
    carbon: {
      label: 'Carbon', swatch: '#183b42',
      title: '#151a1d', toolbar: '#313a3e', bg: '#dfe4e6', card: '#f8fafb', panel: '#eef2f3', panel2: '#d0d8db', text: '#182326', muted: '#59686d', line: '#99a7ab', accent: '#287a87', accent2: '#405e66', link: '#176f81', focus: '#0097ab', active: '#d7e9ec',
      warn: '#89580d', warnTint: '#fff1d3', danger: '#a82f3f', dangerTint: '#fae6e9', success: '#266d49', successTint: '#dff0e6'
    },
    darkRoom: {
      label: 'Dark Room', swatch: '#182235',
      title: '#060c17', toolbar: '#101d31', bg: '#071426', card: '#0d1930', panel: '#101e36', panel2: '#13233d', text: '#f2f5fb', muted: '#aebbd0', line: '#3a4a63', accent: '#ff4fc4', accent2: '#1fd2ff', link: '#27cfff', focus: '#53ddff', active: '#162b49',
      warn: '#ff9d21', warnTint: '#3a250f', danger: '#ff4058', dangerTint: '#3b1320', success: '#50df80', successTint: '#102e21'
    },
    highContrast: {
      label: 'High Contrast', swatch: '#f4f4c9',
      title: '#000000', toolbar: '#000000', bg: '#ffffff', card: '#ffffff', panel: '#ffffff', panel2: '#f1f1f1', text: '#000000', muted: '#202020', line: '#000000', accent: '#000000', accent2: '#005fcc', link: '#003caa', focus: '#ffcc00', active: '#fff3a3',
      warn: '#5b3500', warnTint: '#ffe45c', danger: '#9c0000', dangerTint: '#ffd5d5', success: '#005a20', successTint: '#d9ffe5'
    }
  });

  const ADDITIONAL_THEMES = Object.freeze([
    { key:'classicRed', label:'Classic S.P.I.R.E. Red', swatch:'#990000', description:'Signature dark title bar with deep red clinical toolbar.' },
    { key:'midnightSlate', label:'Midnight Slate', swatch:'#334155', description:'Slate blue-gray workspace with an executive clinical feel.' },
    { key:'warmSepia', label:'Warm Amber Sepia', swatch:'#b45309', description:'Low-glare amber and warm brown tones.' },
    { key:'colorblindSafe', label:'Deuteranopia Safe', swatch:'#1d4ed8', description:'Blue and yellow palette with stronger color separation.' },
    { key:'crimsonNight', label:'Crimson Night', swatch:'#7f1d1d', description:'Dark charcoal workspace with crimson highlights.' },
    { key:'goldenSunrise', label:'Golden Sunrise', swatch:'#ca8a04', description:'Warm gold accents over soft cream surfaces.' },
    { key:'cyberpunkNeon', label:'Cyber Neon', swatch:'#6d28d9', description:'Dark workspace with vivid blue and magenta accents.' },
    { key:'retroVintage', label:'Vintage Chartroom', swatch:'#78716c', description:'Muted parchment, stone, and olive-inspired charting.' },
    { key:'coralSunset', label:'Coral Sunset', swatch:'#ea580c', description:'Warm coral and orange accents on light surfaces.' },
    { key:'solarizedLight', label:'Solarized Light', swatch:'#268bd2', description:'Soft cream base with balanced blue and navy contrast.' },
    { key:'clientStation', label:'Client Station', swatch:'#5bd0e7', description:'Bright cyan workstation styling with compact chart navigation.' }
  ]);

  const TOKEN_NAMES = [
    'title','toolbar','bg','card','panel','panel2','text','muted','line','accent','accent2','link','focus','active',
    'warn','warnTint','danger','dangerTint','success','successTint'
  ];

  function readSession() {
    for (const storage of [sessionStorage, localStorage]) {
      try {
        const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
        if (value && typeof value === 'object') return value;
      } catch {}
    }
    return {};
  }

  function userScope() {
    const session = readSession();
    const user = session.user || session.session || session;
    return String(user.id || user.userId || user.sub || user.email || user.username || 'anonymous').trim().toLowerCase();
  }

  function scopedKey() {
    const scope = userScope();
    return scope && scope !== 'anonymous' ? `${BASE_KEY}:user:${scope}` : BASE_KEY;
  }

  function getSelectedTheme() {
    try {
      const scoped = scopedKey();
      const selected = scoped === BASE_KEY ? (localStorage.getItem(BASE_KEY) || '') : (localStorage.getItem(scoped) || '');
      return THEMES[selected] ? selected : '';
    } catch { return ''; }
  }

  function saveSelectedTheme(name) {
    try {
      if (name && THEMES[name]) {
        const scoped = scopedKey();
        localStorage.setItem(scoped, name);
        if (scoped === BASE_KEY) localStorage.setItem(BASE_KEY, name);
      } else {
        const scoped = scopedKey();
        localStorage.removeItem(scoped);
        if (scoped === BASE_KEY) localStorage.removeItem(BASE_KEY);
      }
    } catch {}
  }

  function ensureStyle() {
    if (document.getElementById('spireEpicThemeSuiteStyle')) return;
    const style = document.createElement('style');
    style.id = 'spireEpicThemeSuiteStyle';
    style.textContent = `
      :root[data-spire-epic-theme] body,
      :root[data-spire-epic-theme] .workspace,
      :root[data-spire-epic-theme] .workspace-view,
      :root[data-spire-epic-theme] .main-content,
      :root[data-spire-epic-theme] .center-workspace,
      :root[data-spire-epic-theme] .epic-overview-container{background:var(--epic-bg)!important;color:var(--epic-text)!important}
      :root[data-spire-epic-theme] .spire-title-bar{background:var(--epic-title)!important;border-bottom:1px solid var(--epic-line)!important;color:var(--epic-text)!important}
      :root[data-spire-epic-theme] .spire-toolbar{background:var(--epic-toolbar)!important;border-bottom:1px solid var(--epic-line)!important;color:#fff!important}
      :root[data-spire-epic-theme] .center-content,
      :root[data-spire-epic-theme] .epic-section-card,
      :root[data-spire-epic-theme] .epic-section-body,
      :root[data-spire-epic-theme] .sidebar-card,
      :root[data-spire-epic-theme] .sidebar-section,
      :root[data-spire-epic-theme] .modal-card,
      :root[data-spire-epic-theme] .master-dialog,
      :root[data-spire-epic-theme] .mar-panel,
      :root[data-spire-epic-theme] .emar-panel,
      :root[data-spire-epic-theme] .note-card,
      :root[data-spire-epic-theme] .order-card,
      :root[data-spire-epic-theme] .care-plan-card{background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme] .client-sidebar,
      :root[data-spire-epic-theme] .right-sidebar,
      :root[data-spire-epic-theme] .flowsheet-tree{background:var(--epic-panel)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme] .client-avatar-box,
      :root[data-spire-epic-theme] .sidebar-section-header,
      :root[data-spire-epic-theme] .flowsheet-sub-toolbar,
      :root[data-spire-epic-theme] .flowsheet-filters,
      :root[data-spire-epic-theme] .summary-sub-tabs,
      :root[data-spire-epic-theme] .chart-tabs{background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme] .client-name-block h2,
      :root[data-spire-epic-theme] .sidebar-title,
      :root[data-spire-epic-theme] .chart-tab,
      :root[data-spire-epic-theme] .summary-sub-tab,
      :root[data-spire-epic-theme] .tree-item{color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme] .chart-tab.active,
      :root[data-spire-epic-theme] .summary-sub-tab.active,
      :root[data-spire-epic-theme] .tree-item.selected{background:var(--epic-active)!important;color:var(--epic-text)!important;border-color:var(--epic-accent)!important;box-shadow:inset 0 -3px 0 var(--epic-accent)!important}
      :root[data-spire-epic-theme] .toolbar-action-btn,
      :root[data-spire-epic-theme] .spire-action,
      :root[data-spire-epic-theme] button:not(.tool-btn):not(.window-control-btn):not(.user-profile-trigger){background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme] .toolbar-action-btn:hover,
      :root[data-spire-epic-theme] .spire-action:hover,
      :root[data-spire-epic-theme] button:not(.tool-btn):not(.window-control-btn):not(.user-profile-trigger):hover{background:var(--epic-active)!important;border-color:var(--epic-accent)!important}
      :root[data-spire-epic-theme] input,
      :root[data-spire-epic-theme] select,
      :root[data-spire-epic-theme] textarea{background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme] input:focus,
      :root[data-spire-epic-theme] select:focus,
      :root[data-spire-epic-theme] textarea:focus,
      :root[data-spire-epic-theme] button:focus-visible,
      :root[data-spire-epic-theme] [tabindex]:focus-visible{outline:3px solid var(--epic-focus)!important;outline-offset:2px!important}
      :root[data-spire-epic-theme] a,
      :root[data-spire-epic-theme] .editable,
      :root[data-spire-epic-theme] .timeline-link,
      :root[data-spire-epic-theme] .switch-view{color:var(--epic-link)!important}
      :root[data-spire-epic-theme] .client-info-group,
      :root[data-spire-epic-theme] .client-info-group b,
      :root[data-spire-epic-theme] .spire-muted,
      :root[data-spire-epic-theme] small{color:var(--epic-muted)!important}
      :root[data-spire-epic-theme] .doc-table th,
      :root[data-spire-epic-theme] .flowsheet-table th,
      :root[data-spire-epic-theme] .flow-grid th,
      :root[data-spire-epic-theme] table th{background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme] .doc-table td,
      :root[data-spire-epic-theme] .flowsheet-table td,
      :root[data-spire-epic-theme] .flow-grid td,
      :root[data-spire-epic-theme] table td{background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-epic-theme] .chartable-cell:hover,
      :root[data-spire-epic-theme] .flow-cell:hover,
      :root[data-spire-epic-theme] table tbody tr:hover td{background:var(--epic-active)!important;box-shadow:inset 0 0 0 1px var(--epic-accent2)!important}
      :root[data-spire-epic-theme] .header-agents,
      :root[data-spire-epic-theme] .header-team,
      :root[data-spire-epic-theme] .header-emergency{background:var(--epic-active)!important;color:var(--epic-accent2)!important;border-left:5px solid var(--epic-accent2)!important}
      :root[data-spire-epic-theme] .header-advisory{background:var(--epic-warn-tint)!important;color:var(--epic-warn)!important;border-left:5px solid var(--epic-warn)!important}
      :root[data-spire-epic-theme] .header-problems{background:var(--epic-danger-tint)!important;color:var(--epic-danger)!important;border-left:5px solid var(--epic-danger)!important}
      :root[data-spire-epic-theme] .header-history,
      :root[data-spire-epic-theme] .header-family{background:var(--epic-panel2)!important;color:var(--epic-accent)!important;border-left:5px solid var(--epic-accent)!important}
      :root[data-spire-epic-theme] .header-diet{background:var(--epic-success-tint)!important;color:var(--epic-success)!important;border-left:5px solid var(--epic-success)!important}
      :root[data-spire-epic-theme] .sidebar-card.alerts,
      :root[data-spire-epic-theme] .alert-box{background:var(--epic-warn-tint)!important;color:var(--epic-warn)!important;border-color:var(--epic-warn)!important}
      :root[data-spire-epic-theme] .notification-badge,
      :root[data-spire-epic-theme] .critical,
      :root[data-spire-epic-theme] .danger,
      :root[data-spire-epic-theme] .overdue{background:var(--epic-danger)!important;color:#fff!important}
      :root[data-spire-epic-theme] .success,
      :root[data-spire-epic-theme] .given,
      :root[data-spire-epic-theme] .completed{border-color:var(--epic-success)!important}
      :root[data-spire-epic-theme] .theme-card[data-spire-epic-theme-card]{position:relative;border:1px solid var(--epic-line,#cbd5e1)!important}
      :root[data-spire-epic-theme] .theme-card[data-spire-epic-theme-card][aria-pressed="true"]{box-shadow:inset 0 0 0 2px var(--epic-accent)!important;background:var(--epic-active)!important}
      :root[data-spire-epic-theme="darkRoom"] .epic-section-card,
      :root[data-spire-epic-theme="darkRoom"] .sidebar-section,
      :root[data-spire-epic-theme="darkRoom"] .mar-panel,
      :root[data-spire-epic-theme="darkRoom"] .emar-panel{box-shadow:inset 4px 0 0 var(--epic-accent)!important}
      :root[data-spire-epic-theme="darkRoom"] .epic-section-header{color:var(--epic-accent)!important;border-bottom-color:var(--epic-line)!important}
      :root[data-spire-epic-theme="darkRoom"] .header-agents,
      :root[data-spire-epic-theme="darkRoom"] .header-team,
      :root[data-spire-epic-theme="darkRoom"] .header-emergency{color:var(--epic-accent2)!important;border-left-color:var(--epic-accent2)!important}
      :root[data-spire-epic-theme="darkRoom"] .chart-tab.active,
      :root[data-spire-epic-theme="darkRoom"] .summary-sub-tab.active{box-shadow:inset 0 -3px 0 var(--epic-accent)!important;color:var(--epic-accent)!important}
      :root[data-spire-epic-theme="darkRoom"] .tool-btn:hover,
      :root[data-spire-epic-theme="darkRoom"] .user-profile-trigger:hover{background:#1b3151!important}
      :root[data-spire-epic-theme="highContrast"] *{text-shadow:none!important}
      :root[data-spire-epic-theme="highContrast"] .epic-section-card,
      :root[data-spire-epic-theme="highContrast"] .sidebar-card,
      :root[data-spire-epic-theme="highContrast"] .doc-table th,
      :root[data-spire-epic-theme="highContrast"] .doc-table td,
      :root[data-spire-epic-theme="highContrast"] .flow-grid th,
      :root[data-spire-epic-theme="highContrast"] .flow-grid td{border-width:2px!important}
      #spireEpicThemeSuiteGroup{margin-top:4px}
      #spireEpicThemeSuiteGroup .spire-theme-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 8px;padding:0 2px}
      #spireEpicThemeSuiteGroup .spire-theme-heading b{font-size:12px;color:inherit}
      #spireEpicThemeSuiteGroup .spire-theme-heading span{font-size:11px;color:#64748b}
      #spireEpicThemeSuiteGroup .spire-theme-section+.spire-theme-section{margin-top:14px;padding-top:12px;border-top:2px solid #cbd5e1}
      #spireEpicThemeSuiteGroup .spire-theme-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      #spireEpicThemeSuiteGroup .theme-card{appearance:none;width:100%;min-height:58px;cursor:pointer;padding:8px;border:1px solid #64748b;border-radius:4px;background:#fff;color:#0f172a;text-align:center}
      #spireEpicThemeSuiteGroup .theme-card:hover{box-shadow:0 0 0 2px #94a3b8 inset}
      #spireEpicThemeSuiteGroup .theme-card[aria-pressed="true"]{box-shadow:inset 0 0 0 2px #2563eb;background:#eff6ff}
      #spireEpicThemeSuiteGroup .theme-card .swatch{display:inline-block;width:15px;height:15px;border:1px solid #64748b;vertical-align:-3px;margin-right:6px}
      @media(max-width:720px){#spireEpicThemeSuiteGroup .spire-theme-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function applyTokens(theme) {
    const root = document.documentElement;
    for (const token of TOKEN_NAMES) root.style.setProperty(`--epic-${token.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`, theme[token]);
    root.style.setProperty('--title-bg', theme.title);
    root.style.setProperty('--toolbar-bg', theme.toolbar);
    root.style.setProperty('--main-bg', theme.bg);
    root.style.setProperty('--workspace-card-bg', theme.card);
    root.style.setProperty('--text-color', theme.text);
    root.style.setProperty('--spire-title-bg', theme.title);
    root.style.setProperty('--spire-toolbar-bg', theme.toolbar);
    root.style.setProperty('--spire-page-bg', theme.bg);
    root.style.setProperty('--spire-card-bg', theme.card);
    root.style.setProperty('--spire-text', theme.text);
  }

  function selectedLegacyTheme() {
    try { return window.SpireUserPreferences?.getPreference?.('preset') || 'classicRed'; }
    catch { return 'classicRed'; }
  }

  function refreshThemeCards() {
    const clinical = getSelectedTheme();
    const legacy = selectedLegacyTheme();
    document.querySelectorAll('[data-spire-epic-theme-card]').forEach(card => {
      const name = card.dataset.spireEpicThemeCard;
      const active = name === clinical;
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
      card.setAttribute('title', active ? `${THEMES[name]?.label || 'Theme'} is active` : `Apply ${THEMES[name]?.label || 'theme'}`);
    });
    document.querySelectorAll('[data-spire-legacy-theme-card]').forEach(card => {
      const active = !clinical && card.dataset.spireLegacyThemeCard === legacy;
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function applyTheme(name, options = {}) {
    const theme = THEMES[name];
    if (!theme) return false;
    ensureStyle();
    try { window.SpireUserPreferences?.setPreset?.('classicRed'); } catch {}
    applyTokens(theme);
    document.documentElement.dataset.spireEpicTheme = name;
    saveSelectedTheme(name);
    refreshThemeCards();
    window.dispatchEvent(new CustomEvent('spire:theme-change', { detail: { family: 'clinical-suite', name, label: theme.label } }));
    if (options.closeModal !== false) window.closeAccessibilityModal?.();
    return true;
  }

  function clearTheme(options = {}) {
    const root = document.documentElement;
    delete root.dataset.spireEpicTheme;
    saveSelectedTheme('');
    for (const token of TOKEN_NAMES) root.style.removeProperty(`--epic-${token.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`);
    if (options.restoreBase !== false) {
      try { window.SpireUserPreferences?.applyVisualPreferences?.(); } catch {}
    }
    refreshThemeCards();
  }

  function applyLegacyTheme(name) {
    if (!ADDITIONAL_THEMES.some(theme => theme.key === name)) return false;
    clearTheme({ restoreBase: false });
    try { window.SpireUserPreferences?.setPreset?.(name); } catch { return false; }
    refreshThemeCards();
    window.dispatchEvent(new CustomEvent('spire:theme-change', { detail: { family: 'spire-preset', name } }));
    window.closeAccessibilityModal?.();
    return true;
  }

  function clinicalDescription(name) {
    if (name === 'darkRoom') return 'Deep navy, magenta, cyan and preserved clinical alerts.';
    if (name === 'highContrast') return 'Accessibility-first black and white with strong focus states.';
    if (name === 'altitude') return 'Airy cyan-blue clinical workspace with calm contrast.';
    if (name === 'lavender') return 'Soft lavender workspace with restrained purple accents.';
    if (name === 'verdant') return 'Green clinical palette with gentle mint-tinted surfaces.';
    if (name === 'deepBlue') return 'Deep blue navigation with cool, readable clinical panels.';
    if (name === 'amethyst') return 'Rich violet accents balanced with pale neutral surfaces.';
    return 'Graphite and steel surfaces with restrained teal accents.';
  }

  function themeCard({ name, label, swatch, description, family }) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'theme-card';
    card.setAttribute('aria-pressed', 'false');
    if (family === 'clinical') {
      card.dataset.spireEpicThemeCard = name;
      card.addEventListener('click', event => { event.preventDefault(); applyTheme(name); });
    } else {
      card.dataset.spireLegacyThemeCard = name;
      card.addEventListener('click', event => { event.preventDefault(); applyLegacyTheme(name); });
    }
    card.innerHTML = `<b><span class="swatch" style="background:${swatch}"></span>${label}</b><br><span style="font-size:11px;color:#64748b">${description}</span>`;
    return card;
  }

  function mountThemePicker() {
    const tab = document.getElementById('accessPresetsTab');
    if (!tab) return false;
    const tabButton = document.getElementById('tabPresetBtn');
    if (tabButton) tabButton.textContent = `${TOTAL_VISIBLE_THEMES} Distinct Themes`;
    const intro = tab.querySelector('p');
    if (intro) intro.textContent = `Choose from ${TOTAL_VISIBLE_THEMES} distinct S.P.I.R.E. themes. Similar palettes are merged so each visible choice is meaningfully different.`;

    if (document.getElementById('spireEpicThemeSuiteGroup')) {
      refreshThemeCards();
      return true;
    }

    const legacyCards = [...tab.querySelectorAll('.theme-card')].filter(card => !card.dataset.spireEpicThemeCard);
    const legacyGrid = legacyCards[0]?.parentElement;
    if (legacyGrid) legacyGrid.style.display = 'none';

    const group = document.createElement('section');
    group.id = 'spireEpicThemeSuiteGroup';
    group.innerHTML = `
      <section class="spire-theme-section">
        <div class="spire-theme-heading"><b>Clinical Themes</b><span>8 themes</span></div>
        <div class="spire-theme-grid" data-spire-clinical-grid></div>
      </section>
      <section class="spire-theme-section">
        <div class="spire-theme-heading"><b>Additional S.P.I.R.E. Themes</b><span>11 themes</span></div>
        <div class="spire-theme-grid" data-spire-additional-grid></div>
      </section>`;

    const clinicalGrid = group.querySelector('[data-spire-clinical-grid]');
    Object.entries(THEMES).forEach(([name, theme]) => {
      clinicalGrid.appendChild(themeCard({ name, label:theme.label, swatch:theme.swatch, description:clinicalDescription(name), family:'clinical' }));
    });

    const additionalGrid = group.querySelector('[data-spire-additional-grid]');
    ADDITIONAL_THEMES.forEach(theme => {
      additionalGrid.appendChild(themeCard({ name:theme.key, label:theme.label, swatch:theme.swatch, description:theme.description, family:'legacy' }));
    });

    tab.appendChild(group);
    refreshThemeCards();
    return true;
  }

  function restore() {
    ensureStyle();
    mountThemePicker();
    const selected = getSelectedTheme();
    if (selected) applyTheme(selected, { closeModal: false });
  }

  // Intentionally no MutationObserver here. The picker mounts once at startup and
  // on the explicit company-change event only; clinical chart DOM mutations are ignored.
  window.addEventListener('storage', event => {
    if (event.key === BASE_KEY || event.key === scopedKey()) restore();
  });
  window.addEventListener('spire:company-change', restore);

  window.SpireEpicThemes = Object.freeze({
    themes: THEMES,
    additionalThemes: ADDITIONAL_THEMES,
    totalVisibleThemes: TOTAL_VISIBLE_THEMES,
    getSelectedTheme,
    apply: applyTheme,
    applyLegacy: applyLegacyTheme,
    clear: clearTheme,
    restore,
    mountThemePicker
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restore, { once: true });
  else restore();
})();