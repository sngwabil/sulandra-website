(() => {
  'use strict';
  if (!/\/admin\.html$/i.test(location.pathname)) return;
  const HREF='/enterprise-apps.html';
  const SPIRE_ADMIN='/spire-admin.html';
  const addTop=()=>{
    const nav=document.getElementById('topModuleNav');
    if(!nav||document.getElementById('adminEnterpriseAppsTop'))return;
    const li=document.createElement('li');
    const a=document.createElement('a');
    a.id='adminEnterpriseAppsTop';a.href=HREF;a.textContent='Enterprise Apps';a.title='Open all Sulandra Health enterprise applications';
    li.appendChild(a);
    const spire=[...nav.querySelectorAll('li')].find(x=>/Admin Spire|SPIRE/i.test(x.textContent||''));
    if(spire)spire.after(li);else nav.appendChild(li);
  };
  const addSide=()=>{
    const nav=document.getElementById('sideModuleNav');
    if(!nav||document.getElementById('adminEnterpriseAppsSide'))return;
    const b=document.createElement('button');
    b.id='adminEnterpriseAppsSide';b.type='button';b.className='side-btn';b.dataset.sulandraEnterpriseApps='true';
    b.innerHTML='Enterprise Apps <small>All Systems</small>';
    b.addEventListener('click',()=>location.href=HREF);
    const spire=[...nav.children].find(x=>/Admin Spire|SPIRE/i.test(x.textContent||''));
    if(spire)spire.after(b);else nav.appendChild(b);
  };
  const addDrawer=()=>{
    const panel=document.getElementById('rightOperationsPanel');
    if(!panel||document.getElementById('adminEnterpriseAppsDrawer'))return;
    const a=document.createElement('a');a.id='adminEnterpriseAppsDrawer';a.className='quick-action';a.href=HREF;
    a.innerHTML='Enterprise Apps<small>Clinical, operations, workforce, compliance, analytics, security, revenue and company apps</small>';
    const s=document.createElement('a');s.id='adminSpire11Drawer';s.className='quick-action';s.href=SPIRE_ADMIN;
    s.innerHTML='SPIRE 1.1 Tools<small>Ohio regulatory, EVV, DODD billing, claim exchange, screening and compliance tools</small>';
    const first=panel.querySelector('.quick-action');
    if(first){first.before(s);s.before(a);}else panel.append(a,s);
  };
  const addHero=()=>{
    const hero=document.querySelector('.admin-command-hero');
    if(!hero||document.getElementById('adminEnterpriseAppsHero'))return;
    const wrap=document.createElement('div');wrap.id='adminEnterpriseAppsHero';wrap.style.cssText='position:relative;z-index:2;display:flex;gap:8px;flex-wrap:wrap;margin-top:15px';
    const a=document.createElement('a');a.href=HREF;a.textContent='Open Enterprise Apps';a.style.cssText='display:inline-flex;align-items:center;text-decoration:none;background:#fff;color:#075985;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:950;box-shadow:0 5px 16px rgba(0,0,0,.12)';
    const s=document.createElement('a');s.href=SPIRE_ADMIN;s.textContent='Open SPIRE 1.1 Tools';s.style.cssText='display:inline-flex;align-items:center;text-decoration:none;background:#6d3cab;color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:10px;padding:9px 12px;font-size:12px;font-weight:950;box-shadow:0 5px 16px rgba(0,0,0,.12)';
    const r=document.createElement('a');r.href='/platform-readiness.html';r.textContent='Platform Readiness';r.style.cssText='display:inline-flex;align-items:center;text-decoration:none;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.28);border-radius:10px;padding:9px 12px;font-size:12px;font-weight:900';
    wrap.append(a,s,r);hero.appendChild(wrap);
  };
  const addSpire11Launchpad=()=>{
    const hero=document.querySelector('.admin-command-hero');
    if(!hero||document.getElementById('adminSpire11Launchpad'))return;
    const section=document.createElement('section');
    section.id='adminSpire11Launchpad';
    section.style.cssText='margin:18px 0 6px;padding:18px;border:1px solid #d8c9ee;border-radius:18px;background:linear-gradient(135deg,#fbf8ff,#f1f8ff);box-shadow:0 10px 28px rgba(58,54,112,.08)';
    const tools=[
      ['Ohio UI / MUI Incident Compliance','Select an authorized home and client, then open classification, deadlines, filing evidence, UI logs, MUI trends and OhioITMS/county-board handoff evidence.','/spire-incident-compliance-launcher.html','#8b2765'],
      ['Ohio Workforce Screening','Select employees by name, review required checks and readiness, and append verified screening evidence without raw IDs or JSON.','/employee-ohio-screening-workspace.html','#46527f'],
      ['Company Compliance QA & Trends','Compliance oversight, immutable QA packets, evidence review and annual cross-system trends.','/company-compliance.html','#2f6348'],
      ['EVV UAT Console','Canonical EVV validation, adapter queue inspection and alternate EVV implementation testing.','/spire-evv-test-console.html','#1c6570'],
      ['DODD Billing Rules','Date-effective Ohio DODD billing rules, service-event validation and immutable rule versions.','/dodd-billing-rules.html','#7b5518'],
      ['Revenue Claim Exchange','837P/837I candidates, external handoffs, acknowledgements, 835 reconciliation and PNM/eMBS evidence.','/revenue-claim-exchange.html','#285784'],
      ['Live SPIRE — OhioISP & Service Documentation','Open the live chart for OhioISP outcomes/supports, DODD service documentation, EVV-linked care and clinical workflows.','/spire/master.html','#075985']
    ];
    const cards=tools.map(([title,desc,href,color])=>`<a href="${href}" style="display:block;text-decoration:none;color:#173b52;background:#fff;border:1px solid #d9e3eb;border-left:5px solid ${color};border-radius:12px;padding:13px 14px;min-height:112px;box-shadow:0 6px 18px rgba(15,55,85,.05)"><strong style="display:block;color:${color};font-size:14px;margin-bottom:5px">${title}</strong><span style="display:block;color:#627686;font-size:11px;line-height:1.45">${desc}</span><span style="display:inline-block;margin-top:9px;color:${color};font-size:10px;font-weight:950">OPEN →</span></a>`).join('');
    section.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px"><div><div style="font-size:10px;font-weight:950;letter-spacing:.1em;text-transform:uppercase;color:#6d3cab">SPIRE 1.1</div><h2 style="margin:3px 0 4px;color:#173b52;font-size:21px">Ohio Regulatory & Revenue Tools</h2><p style="margin:0;color:#687d8b;font-size:12px">Direct launch buttons for the new SPIRE 1.1 workspaces. These stay visible on the Admin Dashboard instead of being hidden in the More menu.</p></div><a href="${SPIRE_ADMIN}" style="text-decoration:none;background:#6d3cab;color:#fff;border-radius:10px;padding:9px 12px;font-size:11px;font-weight:950">Open SPIRE Administration</a></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">${cards}</div>`;
    hero.insertAdjacentElement('afterend',section);
  };
  function install(){addTop();addSide();addDrawer();addHero();addSpire11Launchpad()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  const observer=new MutationObserver(()=>install());observer.observe(document.documentElement,{childList:true,subtree:true});
})();