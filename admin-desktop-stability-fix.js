(function(){
'use strict';
const SESSION_KEY='sulandra:employee:session';
const PROFILE_PREFIX='sulandra:admin:desktop-profile:';
const $=id=>document.getElementById(id);
let resizeTimer=0;
function session(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')||{};}catch{return {};}}
function userId(){const s=session();return String(s.email||s.username||s.userId||'administrator').toLowerCase();}
function profileKey(){return PROFILE_PREFIX+userId();}
function loadProfile(){try{return JSON.parse(localStorage.getItem(profileKey())||'{}');}catch{return {};}}
function saveProfile(p){localStorage.setItem(profileKey(),JSON.stringify(p));}
function rhythmSvg(){return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='420' height='76' viewBox='0 0 420 76'%3E%3Cpath d='M0 40h55l11-10 12 20 14-38 16 58 15-30h30l10-8 11 16 12-28 14 40 13-20h42l10-8 13 18 14-40 17 60 14-30h38' fill='none' stroke='%23075b9c' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;}
function applyRhythm(enabled){document.documentElement.style.setProperty('--dx-rhythm',enabled?rhythmSvg():'none');document.body.dataset.dxRhythm=enabled?'on':'off';}
function installStyles(){if($('desktopStabilityFixStyles'))return;const s=document.createElement('style');s.id='desktopStabilityFixStyles';s.textContent=`
html,body.dx-ready{height:100%;overflow:hidden!important}
body.dx-ready{padding-bottom:0!important}
body.dx-ready .container{position:fixed!important;top:var(--dx-work-top,var(--ec-panel-top,250px))!important;bottom:var(--dx-dock-visible,var(--dx-dock-h,66px))!important;left:0!important;right:0!important;margin:0!important;max-width:none!important;width:auto!important;overflow:hidden!important;padding-top:12px!important;padding-bottom:12px!important}
body.dx-ready .container>.grid,body.dx-ready .container>.layout,body.dx-ready .container>.admin-layout,body.dx-ready .container>.workspace-layout{height:100%!important;min-height:0!important;overflow:hidden!important}
body.dx-ready main,body.dx-ready .main-content,body.dx-ready #module-dashboard,body.dx-ready #adminInternalWorkspace{height:100%!important;min-height:0!important;overflow-y:auto!important;overscroll-behavior:contain;scrollbar-gutter:stable;padding-bottom:20px}
.ec-side-rail{top:var(--dx-work-top,var(--ec-panel-top,250px))!important;bottom:var(--dx-dock-visible,var(--dx-dock-h,66px))!important;height:auto!important}
.ec-side-rail .ec-rail-scroll{height:100%!important;min-height:0!important;overflow-y:auto!important;overscroll-behavior:contain;scrollbar-gutter:stable}
#dxDesktopDock{left:0!important;right:0!important;bottom:0!important;width:100%!important;max-width:none!important;height:var(--dx-dock-h,66px)!important;border-radius:0!important;border-left:0!important;border-right:0!important;position:fixed!important;z-index:62000!important;transform:translateY(0)!important;transition:transform .22s ease!important}
#dxDesktopDock.dx-collapsed{transform:translateY(calc(100% - 24px))!important}
#dxDesktopDock.dx-autohide,#dxDesktopDock.dx-autohide:not(:hover){transform:translateY(0)!important}
#dxDesktopDock .dx-dock-handle{cursor:pointer!important;height:24px!important;flex:0 0 24px!important;position:relative}
#dxDesktopDock .dx-dock-handle::after{content:'Hide taskbar';position:absolute;right:14px;top:3px;font-size:10px;font-weight:800;color:#cfeeff}
#dxDesktopDock.dx-collapsed .dx-dock-handle::after{content:'Show taskbar'}
#dxDesktopDock .dx-dock-handle span{width:52px!important;height:4px!important;opacity:.65}
.dx-heart-setting{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #d7e4ef;border-radius:14px;padding:14px;background:#f8fbfe}
.dx-heart-setting strong{display:block;color:#102448}.dx-heart-setting small{display:block;color:#62738b;margin-top:3px}.dx-heart-switch{position:relative;width:52px;height:30px;flex:0 0 52px}.dx-heart-switch input{position:absolute;opacity:0}.dx-heart-switch span{position:absolute;inset:0;border-radius:999px;background:#cbd5e1;cursor:pointer;transition:.18s}.dx-heart-switch span::after{content:'';position:absolute;width:24px;height:24px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.25);transition:.18s}.dx-heart-switch input:checked+span{background:#075b9c}.dx-heart-switch input:checked+span::after{transform:translateX(22px)}
@media(max-width:1280px){body.dx-ready .container{left:0!important;right:0!important}.ec-side-rail{bottom:var(--dx-dock-visible,var(--dx-dock-h,66px))!important}}
`;document.head.appendChild(s)}
function calculateWorkspaceTop(){const nav=$('topModuleNav')||document.querySelector('.main-nav')||document.querySelector('header');const bottom=nav?Math.ceil(nav.getBoundingClientRect().bottom):250;document.documentElement.style.setProperty('--dx-work-top',`${Math.max(0,bottom)}px`);}
function syncDockSpace(){const dock=$('dxDesktopDock');const collapsed=!!dock?.classList.contains('dx-collapsed');document.documentElement.style.setProperty('--dx-dock-visible',collapsed?'24px':'var(--dx-dock-h,66px)');}
function configureDock(){const dock=$('dxDesktopDock');if(!dock)return;dock.classList.remove('dx-autohide');dock.dataset.viewportFixed='true';const handle=dock.querySelector('.dx-dock-handle');if(handle&&handle.dataset.viewportToggle!=='true'){handle.dataset.viewportToggle='true';handle.replaceWith(handle.cloneNode(true));const fresh=dock.querySelector('.dx-dock-handle');fresh.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();dock.classList.toggle('dx-collapsed');syncDockSpace();},true);}syncDockSpace();}
function injectHeartSetting(){const modal=document.querySelector('.dx-modal');if(!modal||modal.querySelector('[data-dx-heart-setting]'))return;const grid=modal.querySelector('.dx-form-grid')||modal;const p=loadProfile();const wrap=document.createElement('label');wrap.className='dx-heart-setting';wrap.dataset.dxHeartSetting='true';wrap.innerHTML=`<span><strong>Heart Rhythm Background</strong><small>Show or remove the blurred ECG rhythm behind the top taskbar.</small></span><span class="dx-heart-switch"><input type="checkbox" ${p.rhythm===false?'':'checked'}><span></span></span>`;const input=wrap.querySelector('input');input.addEventListener('change',()=>{const next={...loadProfile(),rhythm:input.checked};saveProfile(next);applyRhythm(input.checked);});grid.appendChild(wrap);const autoHide=Array.from(modal.querySelectorAll('input[type="checkbox"]')).find(el=>/auto.?hide|hide.*taskbar/i.test(el.closest('label')?.textContent||''));if(autoHide){autoHide.checked=false;autoHide.disabled=true;const label=autoHide.closest('label');if(label){label.title='Use the taskbar handle to slide it down or bring it back.';label.style.opacity='.55';}}}
function init(){installStyles();applyRhythm(loadProfile().rhythm!==false);calculateWorkspaceTop();configureDock();document.addEventListener('click',e=>{if(e.target.closest('#adminProfileCustomizationButton,[data-ec-profile]'))setTimeout(injectHeartSetting,80);},true);window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{calculateWorkspaceTop();syncDockSpace();},120);},{passive:true});setTimeout(()=>{calculateWorkspaceTop();configureDock();injectHeartSetting();},700);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();