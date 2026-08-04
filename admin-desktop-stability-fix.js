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
#dxDesktopDock{left:0!important;right:0!important;bottom:0!important;transform:none!important;width:100%!important;max-width:none!important;height:var(--dx-dock-h,66px)!important;border-radius:0!important;border-left:0!important;border-right:0!important;transition:none!important;position:fixed!important}
#dxDesktopDock.dx-collapsed,#dxDesktopDock.dx-autohide,#dxDesktopDock.dx-autohide:not(:hover){transform:none!important}
#dxDesktopDock .dx-dock-handle{cursor:default!important;height:10px!important;flex-basis:10px!important}
#dxDesktopDock .dx-dock-handle span{width:48px!important;height:3px!important;opacity:.45}
body.dx-ready{padding-bottom:calc(var(--dx-dock-h,66px) + 12px)!important}
.dx-heart-setting{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid #d7e4ef;border-radius:14px;padding:14px;background:#f8fbfe}
.dx-heart-setting strong{display:block;color:#102448}.dx-heart-setting small{display:block;color:#62738b;margin-top:3px}.dx-heart-switch{position:relative;width:52px;height:30px;flex:0 0 52px}.dx-heart-switch input{position:absolute;opacity:0}.dx-heart-switch span{position:absolute;inset:0;border-radius:999px;background:#cbd5e1;cursor:pointer;transition:.18s}.dx-heart-switch span::after{content:'';position:absolute;width:24px;height:24px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(15,23,42,.25);transition:.18s}.dx-heart-switch input:checked+span{background:#075b9c}.dx-heart-switch input:checked+span::after{transform:translateX(22px)}
`;document.head.appendChild(s)}
function lockDock(){const dock=$('dxDesktopDock');if(!dock)return;dock.classList.remove('dx-collapsed','dx-autohide');dock.dataset.locked='true';const handle=dock.querySelector('.dx-dock-handle');if(handle&&!handle.dataset.locked){handle.dataset.locked='true';handle.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();dock.classList.remove('dx-collapsed','dx-autohide');},true);}}
function injectHeartSetting(){const modal=document.querySelector('.dx-modal');if(!modal||modal.querySelector('[data-dx-heart-setting]'))return;const grid=modal.querySelector('.dx-form-grid')||modal;
const p=loadProfile();const wrap=document.createElement('label');wrap.className='dx-heart-setting';wrap.dataset.dxHeartSetting='true';wrap.innerHTML=`<span><strong>Heart Rhythm Background</strong><small>Show or remove the blurred ECG rhythm behind the top taskbar.</small></span><span class="dx-heart-switch"><input type="checkbox" ${p.rhythm===false?'':'checked'}><span></span></span>`;
const input=wrap.querySelector('input');input.addEventListener('change',()=>{const next={...loadProfile(),rhythm:input.checked};saveProfile(next);applyRhythm(input.checked);});grid.appendChild(wrap);
const autoHide=Array.from(modal.querySelectorAll('input[type="checkbox"]')).find(el=>{const text=el.closest('label')?.textContent||'';return /auto.?hide|hide.*taskbar/i.test(text);});if(autoHide){autoHide.checked=false;autoHide.disabled=true;const label=autoHide.closest('label');if(label){label.title='The bottom taskbar is locked in place.';label.style.opacity='.55';}}
}
function init(){installStyles();const p=loadProfile();applyRhythm(p.rhythm!==false);lockDock();document.addEventListener('click',e=>{const profile=e.target.closest('#adminProfileCustomizationButton,[data-ec-profile]');if(profile)setTimeout(injectHeartSetting,80);},true);const observer=new MutationObserver(()=>{lockDock();injectHeartSetting();});observer.observe(document.body,{childList:true,subtree:true});setInterval(lockDock,1500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();