(function(){
'use strict';
const SESSION_KEY='sulandra:employee:session';
const PROFILE_PREFIX='sulandra:admin:desktop-profile:';
const $=id=>document.getElementById(id);
function session(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')||{};}catch{return {};}}
function userId(){const s=session();return String(s.email||s.username||s.userId||'administrator').toLowerCase();}
function profileKey(){return PROFILE_PREFIX+userId();}
function loadProfile(){try{return JSON.parse(localStorage.getItem(profileKey())||'{}');}catch{return {};}}
function saveProfile(p){localStorage.setItem(profileKey(),JSON.stringify(p));}
function rhythmSvg(){return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='420' height='76' viewBox='0 0 420 76'%3E%3Cpath d='M0 40h55l11-10 12 20 14-38 16 58 15-30h30l10-8 11 16 12-28 14 40 13-20h42l10-8 13 18 14-40 17 60 14-30h38' fill='none' stroke='%23075b9c' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;}
function applyRhythm(enabled){document.documentElement.style.setProperty('--dx-rhythm',enabled?rhythmSvg():'none');document.body.dataset.dxRhythm=enabled?'on':'off';}
function installStyles(){if($('desktopStabilityFixStyles'))return;const s=document.createElement('style');s.id='desktopStabilityFixStyles';s.textContent=`
/* A filter on body makes position:fixed descendants behave like absolute elements.
   Keep body unfiltered so the taskbar is anchored to the actual browser viewport. */
body.dx-ready{filter:none!important;overflow:hidden!important;height:100vh!important;min-height:100vh!important;padding-bottom:0!important}
body.dx-ready>header,body.dx-ready>.alert-bar,body.dx-ready>.main-nav{filter:contrast(var(--dx-contrast,1)) saturate(var(--dx-saturation,1)) brightness(var(--dx-brightness,1))}
body.dx-ready .container{filter:contrast(var(--dx-contrast,1)) saturate(var(--dx-saturation,1)) brightness(var(--dx-brightness,1))}

/* Three true, independently scrolling work areas. */
body.dx-ready .ec-side-rail{position:fixed!important;top:var(--ec-panel-top,295px)!important;bottom:var(--dx-visible-dock-h,66px)!important;height:auto!important;overflow:hidden!important}
body.dx-ready .ec-side-rail .ec-rail-scroll{height:calc(100vh - var(--ec-panel-top,295px) - var(--dx-visible-dock-h,66px))!important;max-height:none!important;overflow-y:auto!important;overscroll-behavior:contain!important}
body.dx-ready .container{position:fixed!important;top:var(--ec-panel-top,295px)!important;bottom:var(--dx-visible-dock-h,66px)!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;margin-top:0!important;margin-bottom:0!important;padding-bottom:24px!important}
body.dx-ready.ec-left-open .container{left:calc(var(--ec-left-w,330px) + 10px)!important}
body.dx-ready:not(.ec-left-open) .container{left:48px!important}
body.dx-ready.ec-right-open .container{right:calc(var(--ec-right-w,360px) + 10px)!important}
body.dx-ready:not(.ec-right-open) .container{right:48px!important}

/* Viewport-locked desktop taskbar. */
#dxDesktopDock{position:fixed!important;left:0!important;right:0!important;bottom:0!important;top:auto!important;transform:translateY(0)!important;width:100vw!important;max-width:none!important;height:var(--dx-dock-h,66px)!important;margin:0!important;border-radius:0!important;border-left:0!important;border-right:0!important;z-index:2147483000!important;transition:transform .22s ease!important;will-change:transform!important}
#dxDesktopDock.dx-collapsed{transform:translateY(calc(100% - 22px))!important}
#dxDesktopDock.dx-autohide,#dxDesktopDock.dx-autohide:not(:hover){transform:translateY(0)!important}
#dxDesktopDock .dx-dock-handle{height:22px!important;flex:0 0 22px!important;cursor:pointer!important;position:relative!important}
#dxDesktopDock .dx-dock-handle::after{content:'Hide taskbar';position:absolute;right:14px;top:3px;color:#dbeafe;font-size:10px;font-weight:800}
#dxDesktopDock.dx-collapsed .dx-dock-handle::after{content:'Show taskbar'}
#dxDesktopDock .dx-dock-handle span{width:54px!important;height:4px!important;opacity:.65}
body.dx-dock-collapsed{--dx-visible-dock-h:22px!important}
body:not(.dx-dock-collapsed){--dx-visible-dock-h:var(--dx-dock-h,66px)!important}

.dx-heart-setting{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #d7e4ef;border-radius:14px;padding:14px;background:#f8fbfe}
.dx-heart-setting strong{display:block;color:#102448}.dx-heart-setting small{display:block;color:#62738b;margin-top:3px}.dx-heart-switch{position:relative;width:52px;height:30px;flex:0 0 52px}.dx-heart-switch input{position:absolute;opacity:0}.dx-heart-switch span{position:absolute;inset:0;border-radius:999px;background:#cbd5e1;cursor:pointer;transition:.18s}.dx-heart-switch span::after{content:'';position:absolute;width:24px;height:24px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.25);transition:.18s}.dx-heart-switch input:checked+span{background:#075b9c}.dx-heart-switch input:checked+span::after{transform:translateX(22px)}
@media(max-width:1280px){body.dx-ready .container{left:12px!important;right:12px!important}.ec-side-rail{z-index:2147482000!important}}
`;document.head.appendChild(s)}
function configureDock(){const dock=$('dxDesktopDock');if(!dock)return;dock.classList.remove('dx-autohide');const handle=dock.querySelector('.dx-dock-handle');if(handle&&!handle.dataset.viewportToggle){handle.dataset.viewportToggle='true';handle.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const collapsed=dock.classList.toggle('dx-collapsed');document.body.classList.toggle('dx-dock-collapsed',collapsed);},true);}document.body.classList.toggle('dx-dock-collapsed',dock.classList.contains('dx-collapsed'));}
function injectHeartSetting(){const modal=document.querySelector('.dx-modal');if(!modal||modal.querySelector('[data-dx-heart-setting]'))return;const grid=modal.querySelector('.dx-form-grid')||modal;const p=loadProfile();const wrap=document.createElement('label');wrap.className='dx-heart-setting';wrap.dataset.dxHeartSetting='true';wrap.innerHTML=`<span><strong>Heart Rhythm Background</strong><small>Show or remove the blurred ECG rhythm behind the top taskbar.</small></span><span class="dx-heart-switch"><input type="checkbox" ${p.rhythm===false?'':'checked'}><span></span></span>`;const input=wrap.querySelector('input');input.addEventListener('change',()=>{const next={...loadProfile(),rhythm:input.checked};saveProfile(next);applyRhythm(input.checked);});grid.appendChild(wrap);const autoHide=Array.from(modal.querySelectorAll('input[type="checkbox"]')).find(el=>/auto.?hide|hide.*taskbar/i.test(el.closest('label')?.textContent||''));if(autoHide){autoHide.checked=false;autoHide.disabled=true;const label=autoHide.closest('label');if(label){label.title='Use the taskbar handle to slide it up or down.';label.style.opacity='.55';}}}
function init(){installStyles();const p=loadProfile();applyRhythm(p.rhythm!==false);configureDock();document.addEventListener('click',e=>{if(e.target.closest('#adminProfileCustomizationButton,[data-ec-profile]'))setTimeout(injectHeartSetting,80);},true);const observer=new MutationObserver(()=>{configureDock();injectHeartSetting();});observer.observe(document.body,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();