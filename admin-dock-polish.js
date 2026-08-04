(function(){
'use strict';
const $=id=>document.getElementById(id);

function installStyles(){
  if($('adminDockPolishStyles')) return;
  const style=document.createElement('style');
  style.id='adminDockPolishStyles';
  style.textContent=`
    /* The service operating environment is the desktop. Hide the old generic dashboard card. */
    #module-dashboard > :not(#adminInternalWorkspace):not(#enterpriseCommandCenter){display:none!important}
    #module-dashboard #enterpriseCommandCenter{display:none!important}
    #module-dashboard{background:transparent!important;padding:0!important;border:0!important;box-shadow:none!important}
    #adminInternalWorkspace{display:block!important;width:100%!important;min-width:0!important}

    /* Computer-style compact taskbar icons. */
    #dxDesktopDock .dx-dock-body{
      justify-content:center!important;
      align-items:flex-end!important;
      gap:9px!important;
      padding:0 54px 8px!important;
      overflow-x:auto!important;
      overflow-y:visible!important;
    }
    #dxDesktopDock .dx-dock-empty{
      margin:auto!important;
      font-size:12px!important;
      opacity:.78!important;
    }
    #dxDesktopDock .dx-dock-item{
      position:relative!important;
      display:grid!important;
      place-items:center!important;
      flex:0 0 48px!important;
      width:48px!important;
      min-width:48px!important;
      max-width:48px!important;
      height:48px!important;
      padding:0!important;
      gap:0!important;
      border-radius:13px!important;
      border:1px solid rgba(255,255,255,.24)!important;
      background:linear-gradient(145deg,rgba(255,255,255,.24),rgba(255,255,255,.08))!important;
      box-shadow:0 7px 17px rgba(2,6,23,.28)!important;
      overflow:visible!important;
      transition:transform .16s ease,background .16s ease!important;
    }
    #dxDesktopDock .dx-dock-item:hover{
      transform:translateY(-7px) scale(1.12)!important;
      background:rgba(255,255,255,.28)!important;
      z-index:5!important;
    }
    #dxDesktopDock .dx-dock-item > span:first-child,
    #dxDesktopDock .dx-dock-item .dx-dock-icon{
      display:grid!important;
      place-items:center!important;
      width:100%!important;
      height:100%!important;
      font-size:23px!important;
      line-height:1!important;
    }
    #dxDesktopDock .dx-dock-item strong,
    #dxDesktopDock .dx-dock-item small{
      position:absolute!important;
      left:50%!important;
      bottom:calc(100% + 11px)!important;
      transform:translateX(-50%) translateY(4px)!important;
      width:max-content!important;
      max-width:220px!important;
      padding:6px 9px!important;
      border-radius:8px!important;
      background:rgba(15,23,42,.96)!important;
      color:#fff!important;
      font-size:11px!important;
      line-height:1.25!important;
      white-space:nowrap!important;
      opacity:0!important;
      pointer-events:none!important;
      box-shadow:0 8px 24px rgba(2,6,23,.3)!important;
      transition:opacity .14s ease,transform .14s ease!important;
      z-index:20!important;
    }
    #dxDesktopDock .dx-dock-item small{display:none!important}
    #dxDesktopDock .dx-dock-item:hover strong{
      opacity:1!important;
      transform:translateX(-50%) translateY(0)!important;
    }
    #dxDesktopDock .dx-dock-pin{
      position:absolute!important;
      right:-4px!important;
      top:-5px!important;
      width:17px!important;
      height:17px!important;
      display:grid!important;
      place-items:center!important;
      margin:0!important;
      padding:0!important;
      border-radius:50%!important;
      background:#fee2e2!important;
      color:#991b1b!important;
      font-size:10px!important;
      box-shadow:0 2px 7px rgba(2,6,23,.28)!important;
    }
    #dxDesktopDock .dx-dock-item::after{
      content:'';
      position:absolute;
      left:50%;
      bottom:-6px;
      transform:translateX(-50%);
      width:5px;
      height:5px;
      border-radius:50%;
      background:#93c5fd;
      box-shadow:0 0 8px #93c5fd;
    }
    @media(max-width:760px){
      #dxDesktopDock .dx-dock-body{justify-content:flex-start!important;padding-left:14px!important;padding-right:14px!important}
      #dxDesktopDock .dx-dock-item{flex-basis:44px!important;width:44px!important;min-width:44px!important;max-width:44px!important;height:44px!important}
    }
  `;
  document.head.appendChild(style);
}

function iconFor(title,service){
  const text=String(title||'').toLowerCase();
  if(text.includes('transport')||service==='nemt') return '🚐';
  if(text.includes('home health')||service==='homehealth') return '✚';
  if(text.includes('community')||service==='community') return '🏠';
  if(text.includes('employee')||text.includes('workforce')) return '👥';
  if(text.includes('schedule')||text.includes('appointment')) return '🗓';
  if(text.includes('document')||text.includes('record')) return '📁';
  if(text.includes('report')) return '📊';
  if(text.includes('setting')) return '⚙';
  if(text.includes('applicant')||text.includes('onboarding')) return '🧭';
  if(text.includes('billing')||text.includes('payroll')) return '💳';
  return '◈';
}

function polishDock(){
  const dock=$('dxDesktopDock');
  if(!dock) return;
  dock.querySelectorAll('.dx-dock-item').forEach(item=>{
    const strong=item.querySelector('strong');
    const small=item.querySelector('small');
    const title=(strong?.textContent||item.getAttribute('title')||'Workspace').trim();
    const service=(small?.textContent||'').trim().toLowerCase();
    item.title=title;
    let icon=item.querySelector('.dx-dock-icon');
    if(!icon){
      icon=document.createElement('span');
      icon.className='dx-dock-icon';
      item.insertBefore(icon,item.firstChild);
    }
    icon.textContent=iconFor(title,service);
  });
}

function removeGenericDashboard(){
  const dashboard=$('module-dashboard');
  if(!dashboard) return;
  Array.from(dashboard.children).forEach(child=>{
    if(child.id!=='adminInternalWorkspace'&&child.id!=='enterpriseCommandCenter') child.style.setProperty('display','none','important');
  });
  const command=$('enterpriseCommandCenter');
  if(command) command.style.setProperty('display','none','important');
}

function init(){
  installStyles();
  removeGenericDashboard();
  polishDock();
  const observer=new MutationObserver(()=>{
    removeGenericDashboard();
    polishDock();
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();