(function(){
'use strict';
const $=id=>document.getElementById(id);
function installStyles(){if($('adminDockPolishStyles'))return;const s=document.createElement('style');s.id='adminDockPolishStyles';s.textContent=`
#module-dashboard > :not(#adminInternalWorkspace):not(#enterpriseCommandCenter){display:none!important}
#module-dashboard #enterpriseCommandCenter{display:none!important}
#module-dashboard{background:transparent!important;padding:0!important;border:0!important;box-shadow:none!important;min-height:100%!important}
#adminInternalWorkspace{display:block!important;width:100%!important;min-width:0!important;min-height:100%!important}
#adminInternalWorkspace>.sos-service-shell,#adminInternalWorkspace>.aiw-shell{width:100%!important;min-height:100%!important;box-sizing:border-box!important}
#dxDesktopDock .dx-dock-body{justify-content:center!important;align-items:center!important;gap:9px!important;padding:0 54px 8px!important;overflow-x:auto!important;overflow-y:visible!important}
#dxDesktopDock .dx-dock-empty{margin:auto!important;font-size:12px!important;opacity:.78!important}
#dxDesktopDock .dx-dock-item{position:relative!important;display:grid!important;place-items:center!important;flex:0 0 48px!important;width:48px!important;min-width:48px!important;max-width:48px!important;height:48px!important;padding:0!important;gap:0!important;border-radius:13px!important;border:1px solid rgba(255,255,255,.24)!important;background:linear-gradient(145deg,rgba(255,255,255,.24),rgba(255,255,255,.08))!important;box-shadow:0 7px 17px rgba(2,6,23,.28)!important;overflow:visible!important;transition:transform .16s ease,background .16s ease!important}
#dxDesktopDock .dx-dock-item:hover{transform:translateY(-6px) scale(1.1)!important;background:rgba(255,255,255,.28)!important;z-index:5!important}
#dxDesktopDock .dx-dock-icon{display:grid!important;place-items:center!important;width:100%!important;height:100%!important;font-size:23px!important;line-height:1!important}
#dxDesktopDock .dx-dock-item strong{position:absolute!important;left:50%!important;bottom:calc(100% + 10px)!important;transform:translateX(-50%) translateY(4px)!important;width:max-content!important;max-width:220px!important;padding:6px 9px!important;border-radius:8px!important;background:rgba(15,23,42,.96)!important;color:#fff!important;font-size:11px!important;white-space:nowrap!important;opacity:0!important;pointer-events:none!important;box-shadow:0 8px 24px rgba(2,6,23,.3)!important;transition:.14s!important;z-index:20!important}
#dxDesktopDock .dx-dock-item small{display:none!important}
#dxDesktopDock .dx-dock-item:hover strong{opacity:1!important;transform:translateX(-50%) translateY(0)!important}
#dxDesktopDock .dx-dock-pin{position:absolute!important;right:-4px!important;top:-5px!important;width:17px!important;height:17px!important;display:grid!important;place-items:center!important;margin:0!important;padding:0!important;border-radius:50%!important;background:#fee2e2!important;color:#991b1b!important;font-size:10px!important}
#dxDesktopDock .dx-dock-item::after{content:'';position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:#93c5fd;box-shadow:0 0 8px #93c5fd}
`;document.head.appendChild(s)}
function iconFor(title,service){const t=String(title||'').toLowerCase();if(t.includes('transport')||service==='nemt')return'🚐';if(t.includes('home health')||service==='homehealth')return'✚';if(t.includes('community')||service==='community')return'🏠';if(t.includes('employee')||t.includes('workforce'))return'👥';if(t.includes('schedule')||t.includes('appointment'))return'🗓';if(t.includes('document')||t.includes('record'))return'📁';if(t.includes('report'))return'📊';if(t.includes('setting'))return'⚙';if(t.includes('applicant')||t.includes('onboarding'))return'🧭';if(t.includes('billing')||t.includes('payroll'))return'💳';return'◈'}
function removeGenericDashboard(){const d=$('module-dashboard');if(!d)return;Array.from(d.children).forEach(c=>{if(c.id!=='adminInternalWorkspace'&&c.id!=='enterpriseCommandCenter')c.style.setProperty('display','none','important')});const e=$('enterpriseCommandCenter');if(e)e.style.setProperty('display','none','important')}
function polishDock(){const dock=$('dxDesktopDock');if(!dock)return;dock.querySelectorAll('.dx-dock-item').forEach(item=>{const strong=item.querySelector('strong');const small=item.querySelector('small');const title=(strong?.textContent||item.title||'Workspace').trim();const service=(small?.textContent||'').trim().toLowerCase();item.title=title;let icon=item.querySelector('.dx-dock-icon');if(!icon){icon=document.createElement('span');icon.className='dx-dock-icon';item.insertBefore(icon,item.firstChild)}icon.textContent=iconFor(title,service)})}
function refresh(){removeGenericDashboard();polishDock()}
function init(){installStyles();refresh();setTimeout(refresh,250);setTimeout(refresh,900);document.addEventListener('click',()=>setTimeout(refresh,0),true);window.addEventListener('resize',()=>requestAnimationFrame(refresh),{passive:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();