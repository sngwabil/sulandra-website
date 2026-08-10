(() => {
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS=['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const token=()=>TOKEN_KEYS.map(k=>sessionStorage.getItem(k)||localStorage.getItem(k)).find(Boolean)||'';
  const pathname=location.pathname.toLowerCase();
  const onMyWork=pathname.endsWith('/my-work.html')||pathname.endsWith('/my-work/')||pathname.endsWith('/my-work');
  const onNotifications=pathname.endsWith('/notifications.html')||pathname.endsWith('/notifications/')||pathname.endsWith('/notifications');
  if(!onMyWork&&!onNotifications)return;

  async function summary(){
    const response=await fetch(`${API}/api/work/notifications/summary`,{cache:'no-store',headers:{Accept:'application/json',Authorization:`Bearer ${token()}`}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||payload.message||`Notification summary failed (${response.status})`);
    return payload.data??payload;
  }

  function badge(value,urgent=false){
    const n=Number(value||0);
    const node=document.createElement('span');
    node.className=`employee-work-cross-badge${urgent&&n?' urgent':''}`;
    node.textContent=n>99?'99+':String(n);
    return node;
  }

  function installStyles(){
    if(document.getElementById('employeeWorkCrossStyles'))return;
    const style=document.createElement('style');style.id='employeeWorkCrossStyles';
    style.textContent='.employee-work-cross-link{display:inline-flex!important;align-items:center;gap:6px}.employee-work-cross-badge{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#eaf2f7;color:#315d78;font-size:9px;font-weight:950}.employee-work-cross-badge.urgent{background:#fde4e1;color:#982f29}.employee-work-cross-strip{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;margin-bottom:10px;background:#fff;border:1px solid #cfe0e9;border-radius:10px;color:#42677a;font-size:11px}.employee-work-cross-strip strong{color:#174b69}.employee-work-cross-strip a{display:inline-flex;align-items:center;gap:7px;text-decoration:none;border:1px solid #0b6ea8;border-radius:8px;padding:7px 9px;color:#0b6ea8;font-weight:900;background:#fff}@media(max-width:620px){.employee-work-cross-strip{align-items:flex-start;flex-direction:column}}';
    document.head.appendChild(style);
  }

  function topLink(href,label,id){
    const top=document.querySelector('.top');
    if(!top)return null;
    const existingById=document.getElementById(id);
    if(existingById)return existingById;
    const existing=[...top.querySelectorAll('a')].find(a=>{
      try{return new URL(a.href,location.origin).pathname.toLowerCase().replace(/\/+$/,'')===href.toLowerCase().replace(/\/+$/,'')}catch{return false}
    });
    if(existing){existing.id=id;existing.classList.add('employee-work-cross-link');return existing}
    const a=document.createElement('a');a.id=id;a.href=href;a.className='employee-work-cross-link';a.textContent=label;
    const spacer=top.querySelector('.spacer');
    if(spacer&&spacer.nextSibling)top.insertBefore(a,spacer.nextSibling);else top.appendChild(a);
    return a;
  }

  function installStrip(data){
    const shell=document.querySelector('.shell');
    const hero=shell?.querySelector('.hero');
    if(!shell||!hero||document.getElementById('employeeWorkCrossStrip'))return;
    const strip=document.createElement('div');strip.id='employeeWorkCrossStrip';strip.className='employee-work-cross-strip';
    if(onMyWork){
      strip.innerHTML=`<span><strong>Operational notifications:</strong> ${Number(data.open||0)} open${Number(data.urgent||0)?` · ${Number(data.urgent)} urgent/critical`:''}. Notifications stay separate from task counts so alerts are not double-counted as assigned work.</span><a href="/notifications.html">Open Notifications</a>`;
    }else{
      strip.innerHTML='<span><strong>Assigned work:</strong> Open My Work to see SPIRE In Basket, SCLS tasks, Home Health visits, NMT trips, Workforce corrections and Learning together.</span><a href="/my-work.html">Open My Work</a>';
    }
    hero.after(strip);
  }

  function updateLink(link,data){
    if(!link)return;
    link.querySelector('.employee-work-cross-badge')?.remove();
    link.appendChild(badge(data.open||0,Number(data.urgent||0)>0));
    link.title=Number(data.urgent||0)>0?`${data.open||0} open notifications, ${data.urgent} urgent/critical`:`${data.open||0} open notifications`;
  }

  async function refresh(){
    if(!token())return;
    try{
      await window.SulandraEntityContext?.ready;
      const data=await summary();
      const link=onMyWork?topLink('/notifications.html','Notifications','myWorkNotificationsLink'):topLink('/my-work.html','My Work','notificationsMyWorkLink');
      updateLink(link,data);
      installStrip(data);
      const strip=document.getElementById('employeeWorkCrossStrip');
      if(strip&&onMyWork){
        const text=strip.querySelector('span');
        if(text)text.innerHTML=`<strong>Operational notifications:</strong> ${Number(data.open||0)} open${Number(data.urgent||0)?` · ${Number(data.urgent)} urgent/critical`:''}. Notifications stay separate from task counts so alerts are not double-counted as assigned work.`;
      }
    }catch(error){console.warn('[Employee Work Crosslinks]',error)}
  }

  installStyles();
  refresh();
  setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
  window.addEventListener('sulandra:entity-context-changed',refresh);
})();
