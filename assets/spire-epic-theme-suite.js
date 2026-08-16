(() => {
  'use strict';

  // SPIRE_COMPLETE_THEME_SYSTEM_V2
  // Backward-compatible marker retained for the original eight-theme publication.
  // SPIRE_EPIC_THEME_SUITE_V1
  // All 28 S.P.I.R.E. presets now use the same whole-workstation theme engine.
  // The eight Epic-style presets are original S.P.I.R.E. implementations based on user-supplied visual references.
  const BASE_KEY = 'spire:epic-theme-suite:preset';
  const SESSION_KEY = 'sulandra:employee:session';
  const PRESET_KEY = 'spire:accessibility:preset';

  const LEGACY_BASES = Object.freeze({
    classicRed:{label:'Classic Spire Red',description:'Dark title, deep red controls, bright clinical chart surfaces.',title:'#0f172a',toolbar:'#990000',bg:'#f0f4f8',card:'#ffffff',text:'#000000'},
    clinicalDark:{label:'Clinical Dark Mode',description:'Deep slate workstation with light clinical text.',title:'#020617',toolbar:'#1e293b',bg:'#0f172a',card:'#1e293b',text:'#f8fafc'},
    midnightSlate:{label:'Midnight Slate',description:'Slate blue-gray executive workspace with dark cards.',title:'#1e293b',toolbar:'#334155',bg:'#475569',card:'#1e293b',text:'#f1f5f9'},
    emeraldHealth:{label:'Emerald Healthcare',description:'Forest green navigation with mint clinical surfaces.',title:'#064e3b',toolbar:'#047857',bg:'#ecfdf5',card:'#ffffff',text:'#064e3b'},
    oceanBlue:{label:'Ocean Blue Executive',description:'Royal blue navigation with crisp light-blue charting areas.',title:'#1e40af',toolbar:'#2563eb',bg:'#eff6ff',card:'#ffffff',text:'#1e3a8a'},
    warmSepia:{label:'Warm Amber Sepia',description:'Low-glare warm amber and cream chartroom palette.',title:'#78350f',toolbar:'#b45309',bg:'#fef3c7',card:'#fffbeb',text:'#451a03'},
    epicTeal:{label:'Hyperspace Teal',description:'Healthcare teal navigation with cool white documentation surfaces.',title:'#0f766e',toolbar:'#115e59',bg:'#f0fdfa',card:'#ffffff',text:'#134e4a'},
    monoHighContrast:{label:'Pure Monochrome',description:'Black-and-white clinical workspace with firm borders.',title:'#000000',toolbar:'#333333',bg:'#ffffff',card:'#ffffff',text:'#000000'},
    colorblindSafe:{label:'Deuteranopia Safe',description:'Blue and amber contrast designed to avoid red/green dependence.',title:'#1d4ed8',toolbar:'#b45309',bg:'#fef9c3',card:'#ffffff',text:'#1e293b'},
    vibrantLavender:{label:'Vibrant Lavender',description:'Indigo-violet navigation with soft lavender chart surfaces.',title:'#581c87',toolbar:'#7e22ce',bg:'#f3e8ff',card:'#ffffff',text:'#3b0764'},
    crimsonNight:{label:'Crimson Night',description:'Dark charcoal surfaces with restrained crimson accents.',title:'#450a0a',toolbar:'#7f1d1d',bg:'#18181b',card:'#27272a',text:'#fafafa'},
    arcticFrost:{label:'Arctic Frost',description:'Icy cyan-blue navigation with bright white documentation panels.',title:'#164e63',toolbar:'#0891b2',bg:'#ecfeff',card:'#ffffff',text:'#164e63'},
    goldenSunrise:{label:'Golden Sunrise',description:'Amber-gold controls with soft cream documentation surfaces.',title:'#713f12',toolbar:'#ca8a04',bg:'#fefce8',card:'#ffffff',text:'#422006'},
    cyberpunkNeon:{label:'Cyberpunk Neon Clinical',description:'Near-black workstation with violet and electric-blue accents.',title:'#111827',toolbar:'#6d28d9',bg:'#030712',card:'#111827',text:'#e0f2fe'},
    retroVintage:{label:'Vintage Chartroom',description:'Muted parchment, stone and olive-inspired documentation palette.',title:'#57534e',toolbar:'#78716c',bg:'#f5f5dc',card:'#fffdf5',text:'#3f3f2f'},
    steelGray:{label:'Industrial Steel Gray',description:'Graphite navigation with polished neutral clinical surfaces.',title:'#1f2937',toolbar:'#4b5563',bg:'#e5e7eb',card:'#f9fafb',text:'#111827'},
    coralSunset:{label:'Coral Sunset',description:'Warm coral and orange controls over soft rose-white surfaces.',title:'#9f1239',toolbar:'#ea580c',bg:'#fff1f2',card:'#ffffff',text:'#881337'},
    mintFresh:{label:'Mint Fresh Healthcare',description:'Mint and teal healthcare palette with bright chart cards.',title:'#065f46',toolbar:'#0d9488',bg:'#ecfdf5',card:'#ffffff',text:'#064e3b'},
    royalAmethyst:{label:'Royal Amethyst',description:'Deep violet navigation with pale amethyst documentation surfaces.',title:'#4c1d95',toolbar:'#6d28d9',bg:'#f5f3ff',card:'#ffffff',text:'#3b0764'},
    solarizedLight:{label:'Solarized Light Clean',description:'Soft cream chartroom with blue navigation and muted contrast.',title:'#073642',toolbar:'#268bd2',bg:'#fdf6e3',card:'#eee8d5',text:'#073642'},
    clientStation:{label:'Client Station Classic',description:'S.P.I.R.E. Theme #21 with orange toolbar, cyan clinical accents and pale-blue workstation surfaces.',title:'#0f172a',toolbar:'#f4510b',bg:'#eaf7fb',card:'#ffffff',panel:'#f8fdff',panel2:'#dff8fc',text:'#173c50',muted:'#587789',line:'#b7d3df',accent:'#5bd0e7',accent2:'#0b4f73',link:'#0b4f73',focus:'#1aa6c8',active:'#dff8fc',warn:'#9c570c',warnTint:'#fff3da',danger:'#c12669',dangerTint:'#fde8f1',success:'#087b59',successTint:'#e3f5ee'},
    darkClinicalSummary:{label:'Dark Clinical Summary',description:'S.P.I.R.E. Theme #22 with charcoal clinical surfaces, cyan interactions and pink summary accents.',title:'#15171b',toolbar:'#25282d',bg:'#202329',card:'#292c32',panel:'#292c32',panel2:'#353941',text:'#f4f5f7',muted:'#b6bec8',line:'#555b66',accent:'#ef5cc7',accent2:'#16d7ee',link:'#42dff0',focus:'#55e5f2',active:'#103b43',warn:'#ffd089',warnTint:'#332b20',danger:'#ff78d5',dangerTint:'#48243e',success:'#72e5b3',successTint:'#233b32'}
  });

  const EPIC_THEMES = Object.freeze({
    altitude:{label:'Altitude',description:'Aqua-blue chrome, pale blue-gray workspace and crisp white cards.',swatch:'#36b9d6',title:'#183746',toolbar:'#2d7f99',bg:'#eaf4f7',card:'#ffffff',panel:'#f5fafc',panel2:'#e1eef3',text:'#173441',muted:'#597581',line:'#aac5cf',accent:'#1d95b5',accent2:'#2375a1',link:'#066f9a',focus:'#00a6cf',active:'#d8f2f8',warn:'#9a5a08',warnTint:'#fff2ce',danger:'#b42336',dangerTint:'#fde8ec',success:'#18794e',successTint:'#e5f6ee'},
    lavender:{label:'Lavender',description:'Soft lavender workspace with violet navigation and restrained purple highlights.',swatch:'#a05fb5',title:'#4f3b5f',toolbar:'#8a68a0',bg:'#f3eef6',card:'#ffffff',panel:'#faf7fb',panel2:'#e9deef',text:'#3f3347',muted:'#75677d',line:'#cabbd2',accent:'#8f65a5',accent2:'#684f8f',link:'#6c4c91',focus:'#9a5db8',active:'#eadcf1',warn:'#8a5b16',warnTint:'#fff2d6',danger:'#a53b5c',dangerTint:'#fbe9ef',success:'#3c7652',successTint:'#e8f4ec'},
    verdant:{label:'Verdant',description:'Green clinical chrome with cool neutral documentation surfaces.',swatch:'#64a64a',title:'#315342',toolbar:'#5d865f',bg:'#edf4ee',card:'#ffffff',panel:'#f7faf7',panel2:'#dfeadf',text:'#294137',muted:'#64766c',line:'#b7c9bb',accent:'#5e925d',accent2:'#3d745c',link:'#2c7158',focus:'#4a9b68',active:'#e0efe0',warn:'#8a6117',warnTint:'#fff2d6',danger:'#a33d45',dangerTint:'#fbe9eb',success:'#23734c',successTint:'#e1f3e8'},
    deepBlue:{label:'Deep Blue',description:'Navy-blue navigation with stronger blue headers and cool chart surfaces.',swatch:'#3a6d93',title:'#0c2944',toolbar:'#1c4f78',bg:'#e8eef5',card:'#ffffff',panel:'#f4f7fa',panel2:'#d8e3ed',text:'#18344c',muted:'#63788a',line:'#a9bdcf',accent:'#326f9e',accent2:'#234f79',link:'#1b6396',focus:'#1677b5',active:'#dceaf5',warn:'#94600f',warnTint:'#fff2d6',danger:'#ac3448',dangerTint:'#fce8ec',success:'#277352',successTint:'#e2f3eb'},
    amethyst:{label:'Amethyst',description:'Rich amethyst navigation with violet accents and light neutral charting surfaces.',swatch:'#8500ad',title:'#351242',toolbar:'#6a1a83',bg:'#f2eaf6',card:'#ffffff',panel:'#faf7fc',panel2:'#e7d8ed',text:'#3f2249',muted:'#765e7f',line:'#c9b4d1',accent:'#8c2ca8',accent2:'#5e2f82',link:'#7c2699',focus:'#a13ac0',active:'#ead9f0',warn:'#8f5c14',warnTint:'#fff2d5',danger:'#aa315a',dangerTint:'#fbe6ef',success:'#33744e',successTint:'#e4f3e8'},
    carbon:{label:'Carbon',description:'Graphite clinical chrome with steel-gray surfaces and teal interaction cues.',swatch:'#183b42',title:'#151a1d',toolbar:'#313a3e',bg:'#dfe4e6',card:'#f8fafb',panel:'#eef2f3',panel2:'#d0d8db',text:'#182326',muted:'#59686d',line:'#99a7ab',accent:'#287a87',accent2:'#405e66',link:'#176f81',focus:'#0097ab',active:'#d7e9ec',warn:'#89580d',warnTint:'#fff1d3',danger:'#a82f3f',dangerTint:'#fae6e9',success:'#266d49',successTint:'#dff0e6'},
    darkRoom:{label:'Dark Room',description:'Deep navy workspace with magenta structure, cyan actions and preserved clinical alerts.',swatch:'#182235',title:'#060c17',toolbar:'#101d31',bg:'#071426',card:'#0d1930',panel:'#101e36',panel2:'#13233d',text:'#f2f5fb',muted:'#aebbd0',line:'#3a4a63',accent:'#ff4fc4',accent2:'#1fd2ff',link:'#27cfff',focus:'#53ddff',active:'#162b49',warn:'#ff9d21',warnTint:'#3a250f',danger:'#ff4058',dangerTint:'#3b1320',success:'#50df80',successTint:'#102e21'},
    highContrast:{label:'High Contrast',description:'Accessibility-first black/white workspace with heavy borders and strong focus cues.',swatch:'#f4f4c9',title:'#000000',toolbar:'#000000',bg:'#ffffff',card:'#ffffff',panel:'#ffffff',panel2:'#f1f1f1',text:'#000000',muted:'#202020',line:'#000000',accent:'#000000',accent2:'#005fcc',link:'#003caa',focus:'#ffcc00',active:'#fff3a3',warn:'#5b3500',warnTint:'#ffe45c',danger:'#9c0000',dangerTint:'#ffd5d5',success:'#005a20',successTint:'#d9ffe5'}
  });

  const TOKEN_NAMES = ['title','titleText','toolbar','toolbarText','bg','card','panel','panel2','text','muted','line','accent','accent2','link','focus','active','warn','warnTint','danger','dangerTint','success','successTint'];

  const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
  function rgb(hex) {
    const value = String(hex || '').trim().replace('#','');
    if (!/^[0-9a-f]{6}$/i.test(value)) return [0,0,0];
    return [parseInt(value.slice(0,2),16),parseInt(value.slice(2,4),16),parseInt(value.slice(4,6),16)];
  }
  function hex([r,g,b]) { return `#${[r,g,b].map(v=>clamp(v).toString(16).padStart(2,'0')).join('')}`; }
  function mix(a,b,t) { const x=rgb(a),y=rgb(b),p=Math.max(0,Math.min(1,t)); return hex(x.map((v,i)=>v+(y[i]-v)*p)); }
  function luminance(color) {
    const values = rgb(color).map(v=>{const c=v/255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)});
    return 0.2126*values[0]+0.7152*values[1]+0.0722*values[2];
  }
  function readableText(background) { return luminance(background) < 0.42 ? '#ffffff' : '#111111'; }
  function isDark(color) { return luminance(color) < 0.28; }

  function hydrateTheme(theme) {
    const dark = isDark(theme.card || theme.bg);
    return {
      ...theme,
      swatch: theme.swatch || theme.toolbar,
      titleText: theme.titleText || readableText(theme.title),
      toolbarText: theme.toolbarText || readableText(theme.toolbar),
      panel: theme.panel || mix(theme.card, theme.bg, .42),
      panel2: theme.panel2 || mix(theme.card, theme.toolbar, dark ? .22 : .13),
      muted: theme.muted || mix(theme.text, theme.bg, dark ? .52 : .56),
      line: theme.line || mix(theme.text, theme.bg, dark ? .72 : .78),
      accent: theme.accent || theme.toolbar,
      accent2: theme.accent2 || (dark ? mix(theme.toolbar,'#ffffff',.48) : mix(theme.toolbar,'#000000',.08)),
      link: theme.link || (dark ? mix(theme.toolbar,'#ffffff',.62) : mix(theme.toolbar,'#000000',.12)),
      focus: theme.focus || (dark ? mix(theme.toolbar,'#ffffff',.56) : mix(theme.toolbar,'#000000',.04)),
      active: theme.active || mix(theme.card, theme.toolbar, dark ? .34 : .14),
      warn: theme.warn || (dark ? '#ffb24d' : '#8a5708'),
      warnTint: theme.warnTint || (dark ? '#3b2a12' : '#fff1cf'),
      danger: theme.danger || (dark ? '#ff6677' : '#a52a3c'),
      dangerTint: theme.dangerTint || (dark ? '#3d1720' : '#fde7eb'),
      success: theme.success || (dark ? '#62d98f' : '#1e7048'),
      successTint: theme.successTint || (dark ? '#123022' : '#e2f3e9')
    };
  }

  function legacyTheme(name) { return LEGACY_BASES[name] ? hydrateTheme(LEGACY_BASES[name]) : null; }
  function epicTheme(name) { return EPIC_THEMES[name] ? hydrateTheme(EPIC_THEMES[name]) : null; }

  function readSession() {
    for (const storage of [sessionStorage,localStorage]) {
      try { const value=JSON.parse(storage.getItem(SESSION_KEY)||'null'); if(value&&typeof value==='object')return value; } catch {}
    }
    return {};
  }
  function userScope() {
    const session=readSession(),user=session.user||session.session||session;
    return String(user.id||user.userId||user.sub||user.email||user.username||'anonymous').trim().toLowerCase();
  }
  function scopedKey() { const scope=userScope(); return scope&&scope!=='anonymous'?`${BASE_KEY}:user:${scope}`:BASE_KEY; }
  function normalizeChoice(value) {
    const raw=String(value||'').trim();
    if(raw.startsWith('legacy:')&&LEGACY_BASES[raw.slice(7)])return raw;
    if(raw.startsWith('epic:')&&EPIC_THEMES[raw.slice(5)])return raw;
    if(EPIC_THEMES[raw])return `epic:${raw}`;
    if(LEGACY_BASES[raw])return `legacy:${raw}`;
    return '';
  }
  function getSelectedChoice() {
    try {
      const scoped=scopedKey();
      const stored=normalizeChoice(localStorage.getItem(scoped)||localStorage.getItem(BASE_KEY)||'');
      if(stored)return stored;
    } catch {}
    try {
      const preset=window.SpireUserPreferences?.getPreference?.('preset');
      if(LEGACY_BASES[preset])return `legacy:${preset}`;
    } catch {}
    try {
      const preset=localStorage.getItem(PRESET_KEY)||'';
      if(LEGACY_BASES[preset])return `legacy:${preset}`;
    } catch {}
    return 'legacy:classicRed';
  }
  function saveChoice(choice) {
    const normalized=normalizeChoice(choice);
    try {
      const scoped=scopedKey();
      if(normalized){localStorage.setItem(scoped,normalized);if(scoped===BASE_KEY)localStorage.setItem(BASE_KEY,normalized)}
      else{localStorage.removeItem(scoped);if(scoped===BASE_KEY)localStorage.removeItem(BASE_KEY)}
    } catch {}
  }

  function themeForChoice(choice) {
    const normalized=normalizeChoice(choice);
    if(normalized.startsWith('legacy:'))return legacyTheme(normalized.slice(7));
    if(normalized.startsWith('epic:'))return epicTheme(normalized.slice(5));
    return null;
  }
  function labelForChoice(choice) {
    const normalized=normalizeChoice(choice);
    if(normalized.startsWith('legacy:'))return LEGACY_BASES[normalized.slice(7)]?.label||'Theme';
    if(normalized.startsWith('epic:'))return EPIC_THEMES[normalized.slice(5)]?.label||'Theme';
    return 'Theme';
  }

  function ensureStyle() {
    if(document.getElementById('spireCompleteThemeSystemStyle'))return;
    const style=document.createElement('style');
    style.id='spireCompleteThemeSystemStyle';
    style.textContent=`
      /* SPIRE_COMPLETE_THEME_SURFACE_COVERAGE_V2 */
      :root[data-spire-theme-choice]{color-scheme:light}
      :root[data-spire-theme-dark="true"]{color-scheme:dark}
      :root[data-spire-theme-choice] body,
      :root[data-spire-theme-choice] .workspace,
      :root[data-spire-theme-choice] .workspace-view,
      :root[data-spire-theme-choice] .main-content,
      :root[data-spire-theme-choice] .center-workspace,
      :root[data-spire-theme-choice] .epic-overview-container,
      :root[data-spire-theme-choice] .intake-workspace{background:var(--epic-bg)!important;color:var(--epic-text)!important}
      :root[data-spire-theme-choice] .spire-title-bar{background:var(--epic-title)!important;border-bottom:1px solid var(--epic-line)!important;color:var(--epic-title-text)!important}
      :root[data-spire-theme-choice] .spire-title-bar :where(span,button,.left-title,.right-controls){color:var(--epic-title-text)!important}
      :root[data-spire-theme-choice] .spire-toolbar{background:var(--epic-toolbar)!important;border-bottom:1px solid var(--epic-line)!important;color:var(--epic-toolbar-text)!important}
      :root[data-spire-theme-choice] .spire-toolbar :where(span,button,.tool-btn){color:var(--epic-toolbar-text)!important}
      :root[data-spire-theme-choice] :where(.center-content,.epic-section-card,.epic-section-body,.sidebar-card,.sidebar-section,.modal-card,.modal-content,.modal-body,.master-dialog,.master-dialog main,.mar-panel,.emar-panel,.note-card,.order-card,.care-plan-card,.result-card,.results-card,.document-card,.task-card,.work-list-card,.timeline-card,.timeline-panel,.patient-story-summary,.story-summary,.lda-card,.intake-side-card,.intake-main,.intake-side,.intake-section-card,.intake-attachment,.popover,#floatingPopover,.dropdown-menu,.menu-panel,.context-menu,fieldset,details){background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-theme-choice] :where(.client-sidebar,.right-sidebar,.flowsheet-tree,.intake-nav,.dialog-sidebar,.navigation-panel){background:var(--epic-panel)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-theme-choice] :where(.client-avatar-box,.sidebar-section-header,.flowsheet-sub-toolbar,.flowsheet-filters,.summary-sub-tabs,.chart-tabs,.modal-header,.modal-footer,.master-dialog header,.master-dialog footer,.intake-section-head,.intake-footer-actions,.tab-bar,.sub-tabs,.toolbar-row){background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-theme-choice] :where(.workspace,.workspace-view,.center-content,.client-sidebar,.right-sidebar,.modal-card,.master-dialog,.intake-main,.intake-side,.intake-nav,.epic-section-body) :where(h1,h2,h3,h4,h5,h6,p,li,label,legend,dt,dd){color:var(--epic-text)!important}
      :root[data-spire-theme-choice] :where(.client-info-group,.client-info-group b,.spire-muted,.muted,.secondary-text,small){color:var(--epic-muted)!important}
      :root[data-spire-theme-choice] :where(.client-name-block h2,.sidebar-title,.chart-tab,.summary-sub-tab,.tree-item,.tab,.sub-tab){color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-theme-choice] :where(.chart-tab.active,.summary-sub-tab.active,.tree-item.selected,.tab.active,.sub-tab.active,.selected-row){background:var(--epic-active)!important;color:var(--epic-text)!important;border-color:var(--epic-accent)!important;box-shadow:inset 0 -3px 0 var(--epic-accent)!important}
      :root[data-spire-theme-choice] :where(.search-container,.client-tab){background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-theme-choice] .search-container input{background:transparent!important;color:var(--epic-text)!important}
      :root[data-spire-theme-choice] :where(input,select,textarea,[contenteditable="true"]){background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important;caret-color:var(--epic-text)!important}
      :root[data-spire-theme-choice] :where(input,select,textarea)::placeholder{color:var(--epic-muted)!important;opacity:1!important}
      :root[data-spire-theme-choice] :where(.toolbar-action-btn,.spire-action,button:not(.tool-btn):not(.window-control-btn):not(.user-profile-trigger)){background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-theme-choice] :where(.toolbar-action-btn,.spire-action,button:not(.tool-btn):not(.window-control-btn):not(.user-profile-trigger)):hover{background:var(--epic-active)!important;border-color:var(--epic-accent)!important}
      :root[data-spire-theme-choice] :where(input,select,textarea,button,[tabindex]):focus-visible{outline:3px solid var(--epic-focus)!important;outline-offset:2px!important}
      :root[data-spire-theme-choice] :where(a,.editable,.timeline-link,.switch-view,.link,.action-link){color:var(--epic-link)!important}
      :root[data-spire-theme-choice] :where(.doc-table,.flowsheet-table,.flow-grid,table){border-color:var(--epic-line)!important;color:var(--epic-text)!important}
      :root[data-spire-theme-choice] :where(.doc-table th,.flowsheet-table th,.flow-grid th,table th){background:var(--epic-panel2)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-theme-choice] :where(.doc-table td,.flowsheet-table td,.flow-grid td,table td){background:var(--epic-card)!important;color:var(--epic-text)!important;border-color:var(--epic-line)!important}
      :root[data-spire-theme-choice] :where(.chartable-cell:hover,.flow-cell:hover,table tbody tr:hover td){background:var(--epic-active)!important;box-shadow:inset 0 0 0 1px var(--epic-accent2)!important}
      :root[data-spire-theme-choice] ::-webkit-scrollbar{width:12px;height:12px}
      :root[data-spire-theme-choice] ::-webkit-scrollbar-track{background:var(--epic-panel)!important}
      :root[data-spire-theme-choice] ::-webkit-scrollbar-thumb{background:var(--epic-line)!important;border:3px solid var(--epic-panel)!important;border-radius:8px}
      :root[data-spire-theme-choice] :where(.header-agents,.header-team,.header-emergency){background:var(--epic-active)!important;color:var(--epic-accent2)!important;border-left:5px solid var(--epic-accent2)!important}
      :root[data-spire-theme-choice] .header-advisory{background:var(--epic-warn-tint)!important;color:var(--epic-warn)!important;border-left:5px solid var(--epic-warn)!important}
      :root[data-spire-theme-choice] .header-problems{background:var(--epic-danger-tint)!important;color:var(--epic-danger)!important;border-left:5px solid var(--epic-danger)!important}
      :root[data-spire-theme-choice] :where(.header-history,.header-family){background:var(--epic-panel2)!important;color:var(--epic-accent)!important;border-left:5px solid var(--epic-accent)!important}
      :root[data-spire-theme-choice] .header-diet{background:var(--epic-success-tint)!important;color:var(--epic-success)!important;border-left:5px solid var(--epic-success)!important}
      :root[data-spire-theme-choice] :where(.sidebar-card.demographics){border-left-color:var(--epic-accent2)!important}
      :root[data-spire-theme-choice] :where(.sidebar-card.clinical){border-left-color:var(--epic-success)!important}
      :root[data-spire-theme-choice] :where(.sidebar-card.financial){border-left-color:var(--epic-accent)!important}
      :root[data-spire-theme-choice] :where(.sidebar-card.alerts,.alert-box,.warning,.warn,.intake-warning,.mar-event.due,.status-warning){background:var(--epic-warn-tint)!important;color:var(--epic-warn)!important;border-color:var(--epic-warn)!important}
      :root[data-spire-theme-choice] :where(.notification-badge,.critical,.danger,.overdue,.refused,.mar-event.refused,.status-critical){background:var(--epic-danger)!important;color:#fff!important;border-color:var(--epic-danger)!important}
      :root[data-spire-theme-choice] :where(.success,.given,.completed,.mar-event.given,.status-success){background:var(--epic-success-tint)!important;color:var(--epic-success)!important;border-color:var(--epic-success)!important}
      :root[data-spire-theme-choice] :where(.held,.mar-event.held){background:var(--epic-panel2)!important;color:var(--epic-accent)!important;border-color:var(--epic-accent)!important}
      :root[data-spire-theme-choice] #displayMRN{color:var(--epic-accent)!important}
      :root[data-spire-theme-choice] :where(#displayBed,#displayDiet){color:var(--epic-success)!important}
      :root[data-spire-theme-choice] :where(#displayCode,#displayAllergies,#displayGuardian){color:var(--epic-danger)!important}
      :root[data-spire-theme-choice] #displayPCP{color:var(--epic-link)!important}
      :root[data-spire-theme-choice] #displayIsolation{color:var(--epic-accent)!important}
      :root[data-spire-theme-choice] :where(#displayPrecautions,#displaySupportLevel){color:var(--epic-warn)!important}
      :root[data-spire-theme-choice="epic:darkRoom"] :where(.epic-section-card,.sidebar-section,.mar-panel,.emar-panel,.note-card,.order-card,.care-plan-card,.lda-card){box-shadow:inset 4px 0 0 var(--epic-accent)!important}
      :root[data-spire-theme-choice="epic:darkRoom"] .epic-section-header{color:var(--epic-accent)!important;border-bottom-color:var(--epic-line)!important}
      :root[data-spire-theme-choice="epic:darkRoom"] :where(.header-agents,.header-team,.header-emergency){color:var(--epic-accent2)!important;border-left-color:var(--epic-accent2)!important}
      :root[data-spire-theme-choice="epic:darkRoom"] :where(.chart-tab.active,.summary-sub-tab.active){box-shadow:inset 0 -3px 0 var(--epic-accent)!important;color:var(--epic-accent)!important}
      :root[data-spire-theme-choice="epic:darkRoom"] :where(.tool-btn,.user-profile-trigger):hover{background:#1b3151!important}
      :root[data-spire-theme-choice="epic:highContrast"] *,
      :root[data-spire-theme-choice="legacy:monoHighContrast"] *{text-shadow:none!important}
      :root[data-spire-theme-choice="epic:highContrast"] :where(.epic-section-card,.sidebar-card,.doc-table th,.doc-table td,.flow-grid th,.flow-grid td,input,select,textarea,button),
      :root[data-spire-theme-choice="legacy:monoHighContrast"] :where(.epic-section-card,.sidebar-card,.doc-table th,.doc-table td,.flow-grid th,.flow-grid td,input,select,textarea,button){border-width:2px!important}

      /* SPIRE_THEME_PREVIEW_ICON_V2: miniature workstation previews like the compact theme samples in the supplied reference. */
      #accessPresetsTab .theme-card[data-spire-theme-choice-card]{display:grid!important;grid-template-columns:58px minmax(0,1fr)!important;align-items:center!important;gap:9px!important;min-height:60px!important;padding:7px!important;text-align:left!important;cursor:pointer!important;border:1px solid #cbd5e1!important;border-radius:4px!important;background:#fff!important;color:#0f172a!important}
      #accessPresetsTab .theme-card[data-spire-theme-choice-card][aria-pressed="true"]{box-shadow:inset 0 0 0 2px #2563eb!important;border-color:#2563eb!important}
      #accessPresetsTab .theme-card[data-spire-theme-choice-card] .spire-theme-card-copy{min-width:0;display:block}
      #accessPresetsTab .theme-card[data-spire-theme-choice-card] .spire-theme-card-copy b{display:block;font-size:12px!important;color:#0f172a!important;line-height:1.2}
      #accessPresetsTab .theme-card[data-spire-theme-choice-card] .spire-theme-card-copy .spire-theme-description{display:block;margin-top:3px;font-size:10.5px!important;line-height:1.25;color:#64748b!important}
      .spire-theme-preview-icon{width:52px;height:40px;border:1px solid #64748b;border-radius:2px;overflow:hidden;display:grid;grid-template-rows:6px 6px 1fr;background:var(--preview-bg);box-shadow:0 1px 2px #0002;flex:none}
      .spire-theme-preview-icon .preview-title{background:var(--preview-title)}
      .spire-theme-preview-icon .preview-toolbar{background:var(--preview-toolbar)}
      .spire-theme-preview-icon .preview-body{display:grid;grid-template-columns:14px 1fr;gap:3px;padding:3px;background:var(--preview-bg)}
      .spire-theme-preview-icon .preview-sidebar{background:var(--preview-panel);border-right:1px solid var(--preview-line)}
      .spire-theme-preview-icon .preview-main{display:grid;grid-template-rows:1fr 4px;gap:2px}
      .spire-theme-preview-icon .preview-card{background:var(--preview-card);border:1px solid var(--preview-line);box-shadow:inset 3px 0 0 var(--preview-accent)}
      .spire-theme-preview-icon .preview-status{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px}
      .spire-theme-preview-icon .preview-status i:nth-child(1){background:var(--preview-link)}
      .spire-theme-preview-icon .preview-status i:nth-child(2){background:var(--preview-warn)}
      .spire-theme-preview-icon .preview-status i:nth-child(3){background:var(--preview-success)}
      #spireEpicThemeSuiteGroup{margin-top:14px;padding-top:12px;border-top:2px solid #cbd5e1}
      #spireEpicThemeSuiteGroup .spire-epic-theme-heading{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;color:#0f172a}
      #spireEpicThemeSuiteGroup .spire-epic-theme-heading b{font-size:12px!important;color:#0f172a!important}
      #spireEpicThemeSuiteGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      @media(max-width:720px){#spireEpicThemeSuiteGrid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function applyTokens(theme) {
    const root=document.documentElement;
    for(const token of TOKEN_NAMES){const value=theme[token];if(value)root.style.setProperty(`--epic-${token.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}`,value)}
    root.style.setProperty('--title-bg',theme.title);
    root.style.setProperty('--toolbar-bg',theme.toolbar);
    root.style.setProperty('--main-bg',theme.bg);
    root.style.setProperty('--workspace-card-bg',theme.card);
    root.style.setProperty('--text-color',theme.text);
    root.style.setProperty('--spire-title-bg',theme.title);
    root.style.setProperty('--spire-toolbar-bg',theme.toolbar);
    root.style.setProperty('--spire-page-bg',theme.bg);
    root.style.setProperty('--spire-card-bg',theme.card);
    root.style.setProperty('--spire-text',theme.text);
  }

  function previewMarkup(theme) {
    const t=hydrateTheme(theme);
    const style=`--preview-title:${t.title};--preview-toolbar:${t.toolbar};--preview-bg:${t.bg};--preview-card:${t.card};--preview-panel:${t.panel};--preview-line:${t.line};--preview-accent:${t.accent};--preview-link:${t.link};--preview-warn:${t.warn};--preview-success:${t.success}`;
    return `<span class="spire-theme-preview-icon" style="${style}" aria-hidden="true"><span class="preview-title"></span><span class="preview-toolbar"></span><span class="preview-body"><span class="preview-sidebar"></span><span class="preview-main"><span class="preview-card"></span><span class="preview-status"><i></i><i></i><i></i></span></span></span></span>`;
  }

  function refreshThemeCards() {
    const selected=getSelectedChoice();
    document.querySelectorAll('[data-spire-theme-choice-card]').forEach(card=>{
      const active=card.dataset.spireThemeChoiceCard===selected;
      card.setAttribute('aria-pressed',active?'true':'false');
      card.setAttribute('title',active?`${labelForChoice(selected)} is active`:`Apply ${labelForChoice(card.dataset.spireThemeChoiceCard)}`);
    });
  }

  function applyChoice(choice,options={}) {
    const normalized=normalizeChoice(choice),theme=themeForChoice(normalized);
    if(!normalized||!theme)return false;
    ensureStyle();
    if(normalized.startsWith('legacy:')){
      const name=normalized.slice(7);
      try{window.SpireUserPreferences?.setPreset?.(name)}catch{}
    }else{
      try{window.SpireUserPreferences?.setPreset?.('classicRed')}catch{}
    }
    applyTokens(theme);
    const root=document.documentElement;
    root.dataset.spireThemeChoice=normalized;
    root.dataset.spireEpicTheme=normalized.startsWith('epic:')?normalized.slice(5):`legacy-${normalized.slice(7)}`;
    root.dataset.spireThemeDark=String(isDark(theme.bg)||isDark(theme.card));
    saveChoice(normalized);
    refreshThemeCards();
    window.dispatchEvent(new CustomEvent('spire:theme-change',{detail:{family:normalized.startsWith('epic:')?'epic-suite':'spire-preset',choice:normalized,label:labelForChoice(normalized)}}));
    if(options.closeModal!==false)window.closeAccessibilityModal?.();
    return true;
  }

  function clearTheme(options={}) {
    const root=document.documentElement;
    delete root.dataset.spireThemeChoice;delete root.dataset.spireEpicTheme;delete root.dataset.spireThemeDark;
    saveChoice('');
    for(const token of TOKEN_NAMES)root.style.removeProperty(`--epic-${token.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}`);
    if(options.restoreBase!==false){try{window.SpireUserPreferences?.applyVisualPreferences?.()}catch{}}
    refreshThemeCards();
  }

  function ensureSignatureLegacyCards() {
    const tab=document.getElementById('accessPresetsTab');
    if(!tab)return;
    const grid=Array.from(tab.children).find(node=>node.querySelector?.('.theme-card')&&!node.id);
    if(!grid)return;
    for(const [name,number] of [['clientStation',21],['darkClinicalSummary',22]]){
      if(tab.querySelector(`[data-spire-theme-source-name="${name}"]`)||Array.from(tab.querySelectorAll('.theme-card')).some(card=>(card.getAttribute('onclick')||'').includes(`'${name}'`)))continue;
      const card=document.createElement('div');
      card.className='theme-card';
      card.dataset.spireThemeSourceName=name;
      card.setAttribute('onclick',`applyPresetTheme('${name}')`);
      card.innerHTML=`<b>${number}. ${LEGACY_BASES[name].label}</b><br><span style="font-size:11px;color:#64748b">${LEGACY_BASES[name].description}</span>`;
      grid.appendChild(card);
    }
  }

  function enhanceLegacyThemeCards() {
    const tab=document.getElementById('accessPresetsTab');
    if(!tab)return;
    const intro=tab.querySelector('p');
    if(intro)intro.textContent='Every S.P.I.R.E. theme now recolors the complete workstation — chart surfaces, text, tables, forms, flowsheets, MAR/eMAR, popups and side panels. Each miniature icon previews the theme before you select it.';
    tab.querySelectorAll('.theme-card:not([data-spire-epic-theme-card])').forEach(card=>{
      if(card.dataset.spireThemeEnhanced==='true')return;
      const onclick=card.getAttribute('onclick')||'';
      const match=onclick.match(/applyPresetTheme\(['\"]([^'\"]+)['\"]\)/);
      const name=match?.[1];
      if(!LEGACY_BASES[name])return;
      const theme=legacyTheme(name),copy=document.createElement('span');
      copy.className='spire-theme-card-copy';
      const bold=card.querySelector('b');
      const description=card.querySelector('span');
      copy.innerHTML=`<b>${bold?.textContent||LEGACY_BASES[name].label}</b><span class="spire-theme-description">${description?.textContent||LEGACY_BASES[name].description}</span>`;
      card.replaceChildren();
      card.insertAdjacentHTML('beforeend',previewMarkup(theme));
      card.appendChild(copy);
      card.removeAttribute('onclick');
      card.dataset.spireThemeEnhanced='true';
      card.dataset.spireThemeChoiceCard=`legacy:${name}`;
      card.setAttribute('role','button');card.setAttribute('tabindex','0');card.setAttribute('aria-pressed','false');
      const activate=event=>{event.preventDefault();event.stopPropagation();applyChoice(`legacy:${name}`)};
      card.addEventListener('click',activate);
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();applyChoice(`legacy:${name}`)}});
    });
  }

  function injectEpicThemeCards() {
    const tab=document.getElementById('accessPresetsTab');
    if(!tab||document.getElementById('spireEpicThemeSuiteGroup'))return;
    const group=document.createElement('section');
    group.id='spireEpicThemeSuiteGroup';
    group.innerHTML='<div class="spire-epic-theme-heading"><b>Available Themes — Epic-style clinical set</b><span style="font-size:11px;color:#64748b">8 themes</span></div><div id="spireEpicThemeSuiteGrid"></div>';
    const grid=group.querySelector('#spireEpicThemeSuiteGrid');
    for(const [name,base] of Object.entries(EPIC_THEMES)){
      const theme=epicTheme(name),card=document.createElement('button');
      card.type='button';card.className='theme-card';card.dataset.spireEpicThemeCard=name;card.dataset.spireThemeChoiceCard=`epic:${name}`;card.setAttribute('aria-pressed','false');
      card.innerHTML=`${previewMarkup(theme)}<span class="spire-theme-card-copy"><b>${base.label}</b><span class="spire-theme-description">${base.description}</span></span>`;
      card.addEventListener('click',event=>{event.preventDefault();applyChoice(`epic:${name}`)});
      grid.appendChild(card);
    }
    tab.appendChild(group);
  }

  function installCompatibilityBridge() {
    if(window.__spireCompleteThemeBridgeInstalled)return;
    window.__spireCompleteThemeBridgeInstalled=true;
    const original=typeof window.applyPresetTheme==='function'?window.applyPresetTheme:null;
    window.applyPresetTheme=function(themeName){if(LEGACY_BASES[themeName])return applyChoice(`legacy:${themeName}`);return original?.(themeName)};
    window.selectPresetTheme=window.applyPresetTheme;
  }

  function restore() {
    ensureStyle();
    installCompatibilityBridge();
    ensureSignatureLegacyCards();
    enhanceLegacyThemeCards();
    injectEpicThemeCards();
    const selected=getSelectedChoice();
    applyChoice(selected,{closeModal:false});
    refreshThemeCards();
  }

  const observer=new MutationObserver(()=>{ensureSignatureLegacyCards();enhanceLegacyThemeCards();injectEpicThemeCards();refreshThemeCards()});
  if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('storage',event=>{if(event.key===BASE_KEY||event.key===scopedKey()||event.key===PRESET_KEY||event.key?.startsWith(`${PRESET_KEY}:user:`))restore()});
  window.addEventListener('spire:company-change',restore);
  window.addEventListener('spire:preferences-change',restore);

  window.SpireEpicThemes=Object.freeze({themes:EPIC_THEMES,legacyThemes:LEGACY_BASES,getSelectedTheme:()=>getSelectedChoice(),getSelectedChoice,apply:(name,options)=>applyChoice(EPIC_THEMES[name]?`epic:${name}`:name,options),applyChoice,clear:clearTheme,restore,previewMarkup});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',restore,{once:true});else restore();
})();