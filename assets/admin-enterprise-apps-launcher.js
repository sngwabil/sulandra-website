(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;
  const HREF='/enterprise-apps.html';
  const addTop=()=>{
    const nav=document.getElementById('topModuleNav');
    if(!nav||document.getElementById('adminEnterpriseAppsTop'))return;
    const li=document.createElement('li');
    const a=document.createElement('a');
    a.id='adminEnterpriseAppsTop';a.href=HREF;a.textContent='Enterprise Apps';a.title='Open all Sulandra Health enterprise applications';
    li.appendChild(a);
    const spire=[...nav.querySelectorAll('li')].find(x=>/Admin Spire/i.test(x.textContent||''));
    spire?.after(li)||nav.appendChild(li);
  };
  const addSide=()=>{
    const nav=document.getElementById('sideModuleNav');
    if(!nav||document.getElementById('adminEnterpriseAppsSide'))return;
    const b=document.createElement('button');
    b.id='adminEnterpriseAppsSide';b.type='button';b.className='side-btn';b.dataset.sulandraEnterpriseApps='true';
    b.innerHTML='Enterprise Apps <small>All Systems</small>';
    b.addEventListener('click',()=>location.href=HREF);
    const spire=[...nav.children].find(x=>/Admin Spire/i.test(x.textContent||''));
    spire?.after(b)||nav.appendChild(b);
  };
  const addDrawer=()=>{
    const panel=document.getElementById('rightOperationsPanel');
    if(!panel||document.getElementById('adminEnterpriseAppsDrawer'))return;
    const a=document.createElement('a');a.id='adminEnterpriseAppsDrawer';a.className='quick-action';a.href=HREF;
    a.innerHTML='Enterprise Apps<small>Clinical, operations, workforce, compliance, analytics, security, revenue and company apps</small>';
    const first=panel.querySelector('.quick-action');first?.before(a)||panel.appendChild(a);
  };
  const addHero=()=>{
    const hero=document.querySelector('.admin-command-hero');
    if(!hero||document.getElementById('adminEnterpriseAppsHero'))return;
    const wrap=document.createElement('div');wrap.id='adminEnterpriseAppsHero';wrap.style.cssText='position:relative;z-index:2;display:flex;gap:8px;flex-wrap:wrap;margin-top:15px';
    const a=document.createElement('a');a.href=HREF;a.textContent='Open Enterprise Apps';a.style.cssText='display:inline-flex;align-items:center;text-decoration:none;background:#fff;color:#075985;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:950;box-shadow:0 5px 16px rgba(0,0,0,.12)';
    const r=document.createElement('a');r.href='/platform-readiness.html';r.textContent='Platform Readiness';r.style.cssText='display:inline-flex;align-items:center;text-decoration:none;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.28);border-radius:10px;padding:9px 12px;font-size:12px;font-weight:900';
    wrap.append(a,r);hero.appendChild(wrap);
  };
  function install(){addTop();addSide();addDrawer();addHero()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  const observer=new MutationObserver(()=>install());observer.observe(document.documentElement,{childList:true,subtree:true});
})();