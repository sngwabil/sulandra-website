(() => {
  'use strict';

  // SPIRE_USER_WORKSPACE_PREFERENCES_V5
  // Backward-compatible publication markers retained for older build checks:
  // SPIRE_USER_WORKSPACE_PREFERENCES_V4
  // SPIRE_USER_WORKSPACE_PREFERENCES_V3
  // SPIRE_USER_WORKSPACE_PREFERENCES_V2
  // 21. Full-Screen Workspace
  // Theme #21 is the exact Client Station visual system. Theme #22 is a dark
  // clinical-summary visual system inspired by the supplied reference image while
  // preserving SPIRE home-health/DODD content and behavior. Fullscreen remains a
  // separate user preference and defaults to ON.
  const BASE_KEYS = Object.freeze({
    preset: 'spire:accessibility:preset', mode: 'spire:accessibility:mode',
    custom: 'spire:accessibility:custom-colors', cursor: 'spire:accessibility:cursor',
    fontSize: 'spire:accessibility:font-size', fullscreen: 'spire:accessibility:fullscreen'
  });
  const SESSION_KEY = 'sulandra:employee:session';

  const PRESETS = Object.freeze({
    classicRed:{title:'#0f172a',toolbar:'#990000',background:'#f0f4f8',card:'#ffffff',text:'#000000'},
    clinicalDark:{title:'#020617',toolbar:'#1e293b',background:'#0f172a',card:'#1e293b',text:'#f8fafc'},
    midnightSlate:{title:'#1e293b',toolbar:'#334155',background:'#475569',card:'#1e293b',text:'#f1f5f9'},
    emeraldHealth:{title:'#064e3b',toolbar:'#047857',background:'#ecfdf5',card:'#ffffff',text:'#064e3b'},
    oceanBlue:{title:'#1e40af',toolbar:'#2563eb',background:'#eff6ff',card:'#ffffff',text:'#1e3a8a'},
    warmSepia:{title:'#78350f',toolbar:'#b45309',background:'#fef3c7',card:'#fffbeb',text:'#451a03'},
    epicTeal:{title:'#0f766e',toolbar:'#115e59',background:'#f0fdfa',card:'#ffffff',text:'#134e4a'},
    monoHighContrast:{title:'#000000',toolbar:'#333333',background:'#ffffff',card:'#ffffff',text:'#000000'},
    colorblindSafe:{title:'#1d4ed8',toolbar:'#b45309',background:'#fef9c3',card:'#ffffff',text:'#1e293b'},
    vibrantLavender:{title:'#581c87',toolbar:'#7e22ce',background:'#f3e8ff',card:'#ffffff',text:'#3b0764'},
    crimsonNight:{title:'#450a0a',toolbar:'#7f1d1d',background:'#18181b',card:'#27272a',text:'#fafafa'},
    arcticFrost:{title:'#164e63',toolbar:'#0891b2',background:'#ecfeff',card:'#ffffff',text:'#164e63'},
    goldenSunrise:{title:'#713f12',toolbar:'#ca8a04',background:'#fefce8',card:'#ffffff',text:'#422006'},
    cyberpunkNeon:{title:'#111827',toolbar:'#6d28d9',background:'#030712',card:'#111827',text:'#e0f2fe'},
    retroVintage:{title:'#57534e',toolbar:'#78716c',background:'#f5f5dc',card:'#fffdf5',text:'#3f3f2f'},
    steelGray:{title:'#1f2937',toolbar:'#4b5563',background:'#e5e7eb',card:'#f9fafb',text:'#111827'},
    coralSunset:{title:'#9f1239',toolbar:'#ea580c',background:'#fff1f2',card:'#ffffff',text:'#881337'},
    mintFresh:{title:'#065f46',toolbar:'#0d9488',background:'#ecfdf5',card:'#ffffff',text:'#064e3b'},
    royalAmethyst:{title:'#4c1d95',toolbar:'#6d28d9',background:'#f5f3ff',card:'#ffffff',text:'#3b0764'},
    solarizedLight:{title:'#073642',toolbar:'#268bd2',background:'#fdf6e3',card:'#eee8d5',text:'#073642'},
    clientStation:{title:'#0f172a',toolbar:'#f4510b',background:'#eaf7fb',card:'#ffffff',text:'#173c50',cyan:'#5bd0e7',cyan2:'#dff8fc',ice:'#eaf7fb',panel:'#f8fdff',line:'#b7d3df',line2:'#d4e4eb',nav:'#082f49',nav2:'#0b4f73',purple:'#7c3db5'},
    darkClinicalSummary:{title:'#15171b',toolbar:'#25282d',background:'#202329',card:'#292c32',text:'#f4f5f7',cyan:'#16d7ee',cyan2:'#103b43',ice:'#202329',panel:'#292c32',line:'#555b66',line2:'#3c414a',nav:'#17191d',nav2:'#24272c',purple:'#ef5cc7'}
  });

  let navigating=false, deliberateFullscreenExit=false, fullscreenArmed=false;
  function readSession(){for(const storage of [sessionStorage,localStorage]){try{const value=JSON.parse(storage.getItem(SESSION_KEY)||'null');if(value&&typeof value==='object')return value;}catch{}}return {};}
  function userScope(){const session=readSession();const user=session.user||session.session||session;return String(user.id||user.userId||user.sub||user.email||user.username||'anonymous').trim().toLowerCase();}
  function scopedKey(base){const scope=userScope();return scope&&scope!=='anonymous'?`${base}:user:${scope}`:base;}
  function getPreference(name){const base=BASE_KEYS[name]||name,scoped=scopedKey(base);try{const value=localStorage.getItem(scoped);if(value!=null)return value;const legacy=localStorage.getItem(base);if(legacy!=null&&scoped!==base)localStorage.setItem(scoped,legacy);return legacy;}catch{return null;}}
  function setPreference(name,value){const base=BASE_KEYS[name]||name,scoped=scopedKey(base);try{localStorage.setItem(scoped,String(value));localStorage.setItem(base,String(value));}catch{}}
  function removePreference(name){const base=BASE_KEYS[name]||name;try{localStorage.removeItem(scopedKey(base));localStorage.removeItem(base);}catch{}}
  function parseJson(value){try{return value?JSON.parse(value):null;}catch{return null;}}
  function currentPalette(){if(getPreference('mode')==='custom'){const custom=parseJson(getPreference('custom'));if(custom)return{title:custom.title||'#0f172a',toolbar:custom.toolbar||'#990000',background:custom.background||'#f0f4f8',card:'#ffffff',text:custom.text||'#000000'};}return PRESETS[getPreference('preset')||'classicRed']||PRESETS.classicRed;}

  function syncTheme22Style(){
    let style=document.getElementById('spireTheme22Style');
    if(getPreference('preset')!=='darkClinicalSummary'){style?.remove();return;}
    if(!style){style=document.createElement('style');style.id='spireTheme22Style';document.head.appendChild(style);}
    style.textContent=`
      :root[data-spire-preset="darkClinicalSummary"] body{background:#202329!important;color:#f4f5f7!important}
      :root[data-spire-preset="darkClinicalSummary"] .spire-title-bar{background:linear-gradient(180deg,#111317,#1d2025)!important;border-bottom-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .spire-toolbar{background:linear-gradient(180deg,#30343a,#24272c)!important;border-bottom:1px solid #0f1114!important}
      :root[data-spire-preset="darkClinicalSummary"] .chart-tabs,:root[data-spire-preset="darkClinicalSummary"] .summary-sub-tabs{background:#22252a!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .chart-tab,:root[data-spire-preset="darkClinicalSummary"] .summary-sub-tab{color:#e7e9ed!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .chart-tab.active,:root[data-spire-preset="darkClinicalSummary"] .summary-sub-tab.active{background:#30343a!important;color:#fff!important;border-top:3px solid #16d7ee!important}
      :root[data-spire-preset="darkClinicalSummary"] .workspace-view,:root[data-spire-preset="darkClinicalSummary"] .main-content,:root[data-spire-preset="darkClinicalSummary"] .center-workspace{background:#202329!important;color:#f4f5f7!important}
      :root[data-spire-preset="darkClinicalSummary"] .epic-overview-container{background:#202329!important}
      :root[data-spire-preset="darkClinicalSummary"] .epic-section-card{background:#292c32!important;border:1px solid #5b606a!important;box-shadow:0 1px 3px #0008!important;color:#f4f5f7!important}
      :root[data-spire-preset="darkClinicalSummary"] .epic-section-body{background:#292c32!important;color:#f4f5f7!important}
      :root[data-spire-preset="darkClinicalSummary"] .header-agents{background:#123b45!important;color:#55e5f2!important;border-left:5px solid #16d7ee!important}
      :root[data-spire-preset="darkClinicalSummary"] .header-advisory{background:#48243e!important;color:#ff78d5!important;border-left:5px solid #ef5cc7!important}
      :root[data-spire-preset="darkClinicalSummary"] .header-problems{background:#3b253b!important;color:#ff72ce!important;border-left:5px solid #ef5cc7!important}
      :root[data-spire-preset="darkClinicalSummary"] .header-team{background:#123b45!important;color:#55e5f2!important;border-left:5px solid #16d7ee!important}
      :root[data-spire-preset="darkClinicalSummary"] .header-emergency{background:#21384c!important;color:#59c9ff!important;border-left:5px solid #23a9f2!important}
      :root[data-spire-preset="darkClinicalSummary"] .header-history,:root[data-spire-preset="darkClinicalSummary"] .header-family{background:#402b49!important;color:#d98cff!important}
      :root[data-spire-preset="darkClinicalSummary"] .header-diet{background:#233b32!important;color:#72e5b3!important}
      :root[data-spire-preset="darkClinicalSummary"] .doc-table th{background:#34383f!important;color:#7fe9f3!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .doc-table td{background:#292c32!important;color:#f4f5f7!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .right-sidebar{background:#24272c!important;color:#f4f5f7!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .sidebar-section{background:#292c32!important;border-color:#555b66!important;color:#f4f5f7!important}
      :root[data-spire-preset="darkClinicalSummary"] .sidebar-section-header{background:#353941!important;color:#67e7f2!important}
      :root[data-spire-preset="darkClinicalSummary"] .flowsheet-sub-toolbar,:root[data-spire-preset="darkClinicalSummary"] .flowsheet-filters{background:#292c32!important;color:#f4f5f7!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .flowsheet-tree{background:#24272c!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .tree-item{color:#dce1e7!important}:root[data-spire-preset="darkClinicalSummary"] .tree-item.selected{background:#103b43!important;color:#55e5f2!important}
      :root[data-spire-preset="darkClinicalSummary"] .flowsheet-table th,:root[data-spire-preset="darkClinicalSummary"] .flow-grid th{background:#34383f!important;color:#7fe9f3!important;border-color:#606671!important}
      :root[data-spire-preset="darkClinicalSummary"] .flowsheet-table td,:root[data-spire-preset="darkClinicalSummary"] .flow-grid td{background:#292c32!important;color:#f4f5f7!important;border-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .flowsheet-table th:first-child,:root[data-spire-preset="darkClinicalSummary"] .flowsheet-table td:first-child,:root[data-spire-preset="darkClinicalSummary"] .flow-grid th:first-child,:root[data-spire-preset="darkClinicalSummary"] .flow-grid td:first-child{background:#25282d!important}
      :root[data-spire-preset="darkClinicalSummary"] .chartable-cell:hover,:root[data-spire-preset="darkClinicalSummary"] .flow-cell:hover{background:#123b45!important;box-shadow:inset 0 0 0 2px #16d7ee!important}
      :root[data-spire-preset="darkClinicalSummary"] input,:root[data-spire-preset="darkClinicalSummary"] select,:root[data-spire-preset="darkClinicalSummary"] textarea{background:#1e2126!important;color:#f4f5f7!important;border-color:#626873!important}
      :root[data-spire-preset="darkClinicalSummary"] .toolbar-action-btn{background:#383c43!important;color:#f4f5f7!important;border-color:#69707b!important}
      :root[data-spire-preset="darkClinicalSummary"] a{color:#42dff0!important}
    `;
  }

  function syncClinicalWorkstationStyle(){
    let style=document.getElementById('spireClinicalWorkstationStyle');
    if(!style){style=document.createElement('style');style.id='spireClinicalWorkstationStyle';document.head.appendChild(style);}
    style.textContent=`
      /* SPIRE_EPIC_COMPACT_WORKSTATION_V1 - compact, scan-friendly home-health/DODD chart rail */
      .workspace{grid-template-columns:242px minmax(0,1fr) 280px!important}
      .workspace.sidebar-closed{grid-template-columns:242px minmax(0,1fr) 0!important}
      .client-sidebar{padding:8px!important;background:linear-gradient(180deg,#f4fbfe 0%,#e9f4f9 100%)!important;border-right:1px solid #9fc3d4!important;font-size:11.5px!important}
      .client-avatar-box{gap:9px!important;align-items:center!important;margin-bottom:8px!important;padding:7px 6px 9px!important;border-radius:3px!important;border-bottom:2px solid #46a9d5!important;background:linear-gradient(180deg,#fafdff,#e9f6fb)!important}
      .avatar-img{width:64px!important;height:64px!important;min-width:64px!important;flex:0 0 64px!important;border-radius:50%!important;overflow:hidden!important;border:2px solid #ffffff!important;outline:1px solid #75a9c2!important;background:linear-gradient(145deg,#d8edf7,#b7d8e8)!important;box-shadow:0 2px 6px rgba(11,79,115,.22)!important;display:grid!important;place-items:center!important;color:#0b5f7d!important;font-weight:800!important;font-size:17px!important}
      .avatar-img img{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:50%!important}
      .client-name-block{min-width:0!important}
      .client-name-block h2{margin:0!important;line-height:1.12!important;font-size:14px!important;font-weight:800!important;color:#0a5277!important;letter-spacing:-.1px!important}
      .client-name-block h2:last-child{color:#15739a!important}
      .sidebar-card{padding:7px 8px!important;margin-bottom:6px!important;border-radius:3px!important;box-shadow:0 1px 2px rgba(15,76,105,.06)!important;border-top-color:#b8d2df!important;border-right-color:#b8d2df!important;border-bottom-color:#b8d2df!important;background:#fbfeff!important}
      .sidebar-card.demographics{border-left:4px solid #2c86c8!important}
      .sidebar-card.clinical{border-left:4px solid #17a673!important}
      .sidebar-card.alerts{border-left:4px solid #ef9b22!important;background:#fffaf0!important}
      .sidebar-card.financial{border-left:4px solid #8d59c8!important}
      .sidebar-title{padding-bottom:4px!important;margin-bottom:5px!important;border-bottom:1px solid #d6e6ed!important;font-size:10.5px!important;line-height:1.1!important;font-weight:800!important;letter-spacing:.55px!important}
      .sidebar-card.demographics .sidebar-title{color:#176aa5!important}
      .sidebar-card.clinical .sidebar-title{color:#087b59!important}
      .sidebar-card.alerts .sidebar-title{color:#b55d08!important}
      .sidebar-card.financial .sidebar-title{color:#7040a8!important}
      .client-info-group{font-size:11.5px!important;line-height:1.32!important;color:#284c5e!important}
      .client-info-group>div{margin:3px 0!important}
      .client-info-group b{font-weight:800!important;color:#31566a!important}
      .sidebar-card.demographics .client-info-group>div:nth-child(1){color:#2563a8!important;font-style:italic!important}
      #displayMRN{color:#7439a8!important;font-weight:800!important;letter-spacing:.15px!important}
      #displayBed{color:#087b59!important;font-weight:700!important}
      #displayCode{color:#c12669!important;font-weight:800!important}
      #displayPCP{color:#126ea1!important;font-weight:700!important}
      #displayAllergies{color:#c12669!important;font-weight:800!important}
      #displayIsolation{color:#7b3faf!important;font-style:italic!important;font-weight:700!important}
      #displayPrecautions{color:#9c570c!important;font-weight:650!important}
      #displayDiet{color:#087b59!important;font-style:italic!important}
      #displayPayer{color:#5944ad!important;font-weight:800!important}
      #displayGuardian{color:#c23d82!important;font-weight:700!important}
      #displayAdmitDate{color:#087a91!important;font-style:italic!important}
      #displayHtWt{color:#2563a8!important;font-weight:700!important}
      #displaySupportLevel{font-size:11.25px!important;line-height:1.34!important;font-weight:750!important;color:#9b4c08!important;border-radius:3px!important;padding:6px!important}
      .toolbar-action-btn,.spire-action{min-height:28px!important;padding:4px 9px!important;border:1px solid #8eafc0!important;border-radius:4px!important;background:linear-gradient(180deg,#ffffff 0%,#e8f2f7 100%)!important;color:#164c68!important;box-shadow:0 1px 2px rgba(19,71,96,.12)!important;font-size:11.5px!important;font-weight:700!important;line-height:1.15!important;transition:background .14s ease,border-color .14s ease,box-shadow .14s ease,transform .14s ease!important}
      .toolbar-action-btn:hover,.spire-action:hover{background:linear-gradient(180deg,#ffffff 0%,#d7edf7 100%)!important;border-color:#4e9fc6!important;color:#0b5f8a!important;box-shadow:0 1px 4px rgba(24,103,142,.2)!important}
      .toolbar-action-btn:active,.spire-action:active{transform:translateY(1px)!important;box-shadow:inset 0 1px 2px rgba(16,77,105,.15)!important}
      .toolbar-action-btn:focus-visible,.spire-action:focus-visible{outline:2px solid #168bc3!important;outline-offset:2px!important}
      .chart-tab{border-radius:0!important}
      @media (max-width:1100px){
        .workspace{grid-template-columns:218px minmax(0,1fr) 252px!important}
        .workspace.sidebar-closed{grid-template-columns:218px minmax(0,1fr) 0!important}
        .client-sidebar{padding:6px!important}
        .avatar-img{width:58px!important;height:58px!important;min-width:58px!important;flex-basis:58px!important}
        .client-name-block h2{font-size:13px!important}
        .sidebar-card{padding:6px!important}
      }
      :root[data-spire-preset="darkClinicalSummary"] .client-sidebar{background:#202329!important;border-right-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .client-avatar-box{background:#292c32!important;border-bottom-color:#16d7ee!important}
      :root[data-spire-preset="darkClinicalSummary"] .sidebar-card{background:#292c32!important;border-top-color:#555b66!important;border-right-color:#555b66!important;border-bottom-color:#555b66!important}
      :root[data-spire-preset="darkClinicalSummary"] .sidebar-card.alerts{background:#332b20!important}
      :root[data-spire-preset="darkClinicalSummary"] .client-name-block h2{color:#7fe9f3!important}
      :root[data-spire-preset="darkClinicalSummary"] .client-name-block h2:last-child{color:#55cbea!important}
      :root[data-spire-preset="darkClinicalSummary"] .client-info-group,:root[data-spire-preset="darkClinicalSummary"] .client-info-group b{color:#d8e5eb!important}
      :root[data-spire-preset="darkClinicalSummary"] #displayMRN{color:#c9a2ff!important}
      :root[data-spire-preset="darkClinicalSummary"] #displayBed,:root[data-spire-preset="darkClinicalSummary"] #displayDiet{color:#77e2b8!important}
      :root[data-spire-preset="darkClinicalSummary"] #displayCode,:root[data-spire-preset="darkClinicalSummary"] #displayAllergies,:root[data-spire-preset="darkClinicalSummary"] #displayGuardian{color:#ff8ac4!important}
      :root[data-spire-preset="darkClinicalSummary"] #displayPCP{color:#73cef5!important}
      :root[data-spire-preset="darkClinicalSummary"] #displayIsolation{color:#d7a6ff!important}
      :root[data-spire-preset="darkClinicalSummary"] #displayPrecautions,:root[data-spire-preset="darkClinicalSummary"] #displaySupportLevel{color:#ffd089!important}
    `;
  }

  function applyVisualPreferences(){const palette=currentPalette(),root=document.documentElement;const pairs={'--title-bg':palette.title,'--toolbar-bg':palette.toolbar,'--main-bg':palette.background,'--workspace-card-bg':palette.card,'--text-color':palette.text,'--spire-title-bg':palette.title,'--spire-toolbar-bg':palette.toolbar,'--spire-page-bg':palette.background,'--spire-card-bg':palette.card,'--spire-text':palette.text};if(['clientStation','darkClinicalSummary'].includes(getPreference('preset'))){Object.assign(pairs,{'--navy':palette.nav,'--navy2':palette.nav2,'--cyan':palette.cyan,'--cyan2':palette.cyan2,'--ice':palette.ice,'--panel':palette.panel,'--line':palette.line,'--line2':palette.line2,'--ink':palette.text,'--purple':palette.purple});}Object.entries(pairs).forEach(([key,value])=>value&&root.style.setProperty(key,value));const fontSize=getPreference('fontSize')||'13px';if(['12px','13px','14px','16px'].includes(fontSize))root.style.setProperty('--base-font-size',fontSize);const cursor=getPreference('cursor')||'default';let style=document.getElementById('spireSharedCursorStyle');if(cursor==='default')style?.remove();else if(['crosshair','help','pointer'].includes(cursor)){if(!style){style=document.createElement('style');style.id='spireSharedCursorStyle';document.head.appendChild(style);}style.textContent=`body, body * { cursor:${cursor} !important; }`;}root.dataset.spirePreset=getPreference('preset')||'classicRed';syncTheme22Style();syncClinicalWorkstationStyle();}
  function setPreset(name){const preset=PRESETS[name]?name:'classicRed';setPreference('preset',preset);setPreference('mode','preset');removePreference('custom');applyVisualPreferences();return preset;}
  function setCustomColors(values){setPreference('custom',JSON.stringify(values||{}));setPreference('mode','custom');applyVisualPreferences();}
  function fullscreenDocument(){try{if(window.top&&window.top!==window&&window.top.document)return window.top.document;}catch{}return document;}
  function fullscreenPreferred(){const stored=getPreference('fullscreen');return stored==null?true:stored!=='0';}
  function syncFullscreenButtons(){const targetDocument=fullscreenDocument(),active=Boolean(targetDocument.fullscreenElement);document.querySelectorAll('[data-spire-fullscreen-control],#spireFullscreenControl').forEach(button=>{button.textContent=active?'🗗':'⛶';button.setAttribute('aria-pressed',active?'true':'false');button.setAttribute('aria-label',active?'Exit full screen':'Open S.P.I.R.E. full screen');button.setAttribute('title',active?'Exit full screen':(fullscreenPreferred()?'Full screen preferred':'Open full screen'));});}
  async function requestFullscreen({persist=true}={}){if(persist)setPreference('fullscreen','1');const d=fullscreenDocument();if(d.fullscreenElement){syncFullscreenButtons();return true;}const element=d.documentElement;if(!element?.requestFullscreen){syncFullscreenButtons();return false;}try{await element.requestFullscreen({navigationUI:'hide'});syncFullscreenButtons();return true;}catch{syncFullscreenButtons();return false;}}
  async function exitFullscreen({persist=true}={}){if(persist)setPreference('fullscreen','0');deliberateFullscreenExit=true;const d=fullscreenDocument();if(d.fullscreenElement&&d.exitFullscreen){try{await d.exitFullscreen();}catch{}}deliberateFullscreenExit=false;syncFullscreenButtons();}
  async function toggleFullscreenPreference(){const d=fullscreenDocument();if(d.fullscreenElement)return exitFullscreen({persist:true});return requestFullscreen({persist:true});}
  function armPreferredFullscreen(){if(fullscreenArmed||!fullscreenPreferred()||fullscreenDocument().fullscreenElement)return;fullscreenArmed=true;const attempt=()=>{if(!fullscreenPreferred()||fullscreenDocument().fullscreenElement)return cleanup();requestFullscreen({persist:false}).finally(cleanup);};const cleanup=()=>{document.removeEventListener('pointerdown',attempt,true);document.removeEventListener('keydown',attempt,true);fullscreenArmed=false;};document.addEventListener('pointerdown',attempt,true);document.addEventListener('keydown',attempt,true);}
  function bindFullscreenControls(){document.querySelectorAll('[data-spire-fullscreen-control],#spireFullscreenControl').forEach(button=>{if(button.dataset.spireFullscreenBound==='true')return;button.dataset.spireFullscreenBound='true';button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleFullscreenPreference().catch(()=>{});});});syncFullscreenButtons();}
  function handleFullscreenChange(){const d=fullscreenDocument();if(!d.fullscreenElement&&!navigating&&!deliberateFullscreenExit&&fullscreenPreferred())armPreferredFullscreen();syncFullscreenButtons();}
  function applyAll(){applyVisualPreferences();bindFullscreenControls();armPreferredFullscreen();}
  function loadMedicationOrderEntry(){if(document.querySelector('script[data-spire-medication-order-entry]'))return;const script=document.createElement('script');script.src='/assets/spire-medication-order-entry.js?v=20260813-med-order-entry-1';script.dataset.spireMedicationOrderEntry='true';script.defer=true;document.head.appendChild(script);}
  window.SpireUserPreferences=Object.freeze({keys:BASE_KEYS,presets:PRESETS,userScope,getPreference,setPreference,removePreference,setPreset,setCustomColors,apply:applyAll,applyVisualPreferences,fullscreenPreferred,requestFullscreen,exitFullscreen,toggleFullscreenPreference,syncFullscreenButtons,armPreferredFullscreen,setFullscreenPreferred(value){setPreference('fullscreen',value?'1':'0');syncFullscreenButtons();if(value)armPreferredFullscreen();}});
  window.toggleSpireFullscreenPreference=toggleFullscreenPreference;
  try{fullscreenDocument().addEventListener('fullscreenchange',handleFullscreenChange);}catch{}
  window.addEventListener('beforeunload',()=>{navigating=true;});
  window.addEventListener('storage',event=>{if(Object.values(BASE_KEYS).some(base=>event.key===base||event.key?.startsWith(`${base}:user:`)))applyVisualPreferences();});
  loadMedicationOrderEntry();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyAll,{once:true});else applyAll();
})();
