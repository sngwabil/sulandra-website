(() => {
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS=['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const token=()=>TOKEN_KEYS.map(k=>sessionStorage.getItem(k)||localStorage.getItem(k)).find(Boolean)||'';
  if(!token())return;
  if(document.getElementById('sulandraGlobalNotificationLink'))return;
  const style=document.createElement('style');
  style.textContent='.sulandra-notification-link{display:inline-flex!important;align-items:center;gap:6px;text-decoration:none!important;font-weight:900!important;color:#075985!important;white-space:nowrap}.sulandra-notification-count{display:inline-flex;min-width:19px;height:19px;padding:0 5px;align-items:center;justify-content:center;border-radius:999px;background:#9c3029;color:#fff;font-size:10px;font-weight:950}.sulandra-notification-count[data-zero=true]{background:#dce7ed;color:#5c7484}';
  document.head.appendChild(style);
  const link=document.createElement('a');link.id='sulandraGlobalNotificationLink';link.className='sulandra-notification-link';link.href='/notifications.html';link.innerHTML='Notifications <span class="sulandra-notification-count" data-zero="true">0</span>';
  const headerTools=document.querySelector('.header-tools')||document.querySelector('.spire-top-actions')||document.querySelector('header .top')||document.querySelector('header')||document.querySelector('.top');
  if(!headerTools)return;
  if(headerTools.classList?.contains('spire-top-actions'))headerTools.prepend(link);else headerTools.appendChild(link);
  async function refresh(){try{if(window.SulandraEntityContext?.ready)await window.SulandraEntityContext.ready;const r=await fetch(`${API}/api/work/notifications/summary`,{cache:'no-store',headers:{Accept:'application/json',Authorization:`Bearer ${token()}`}}),p=await r.json().catch(()=>({}));if(!r.ok)return;const count=Number((p.data||p).open||0),urgent=Number((p.data||p).urgent||0),badge=link.querySelector('.sulandra-notification-count');badge.textContent=count>99?'99+':String(count);badge.dataset.zero=String(count===0);link.title=urgent?`${urgent} urgent/critical operational notification(s)`:`${count} open operational notification(s)`;}catch{}}
  link.addEventListener('click',()=>{try{sessionStorage.setItem('sulandra:last-notification-open',new Date().toISOString());}catch{}});
  window.addEventListener('sulandra:entity-context-changed',refresh);
  refresh();
  setInterval(refresh,60000);
})();