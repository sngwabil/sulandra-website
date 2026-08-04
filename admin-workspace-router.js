(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const EXTERNAL_MAIN_SITES={
    'Sulandra Intranet':'intranet.html',
    'Learning & Development':'education-portal.html',
    'Sulandra Learning Center':'education-portal.html',
    'Employee Portal':'employee-portal.html?stay=1&source=admin'
  };

  const EMBEDDED_PAGES={
    'Intranet Publishing':'intranet-control.html',
    'Corporate Communications':'intranet-control.html'
  };

  const MODULE_TOOLS=new Set([
    'Dashboard','Executive Dashboard','Service Homes','Employees','Scheduling','Time & Attendance',
    'Documents & Compliance','Client Paperwork & Documentation','Reports','Admin S.P.I.R.E.','Admin Spire',
    'Settings','Roles & Permissions','Onboarding','Job Openings'
  ]);

  const SUBSIDIARIES=new Set([
    'Sulandra Community Living Services','Sulandra Home Health Care Services',
    'Sulandra Health Non-Medical Transportation'
  ]);

  const WORKSPACE_DESCRIPTIONS={
    'Payroll Services':'Compensation, pay rates, payroll review, deductions and processing controls.',
    'Benefits Administration':'Eligibility, enrollment, leave coordination and employee benefit records.',
    'Day-to-Day House Operations':'Food, household inventory, grocery coordination, maintenance and petty cash.',
    'Care Plans & ISP Coordination':'Service outcomes, plan implementation, reviews and interdisciplinary follow-up.',
    'Medication & MAR Oversight':'Medication records, administration reviews, errors and nursing follow-up.',
    'Client Appointments & Activities':'Medical appointments, community activities and transportation coordination.',
    'MUI / UI Management':'Secure incident logging, investigation, prevention plans and regulatory reporting.',
    'EVV Compliance':'Visit verification, missing punches, exceptions, corrections and service reconciliation.',
    'Fleet & Trip Dispatch':'Vehicle maintenance, driver logs, trip scheduling, routing and dispatch controls.',
    'Billing & Claims':'Medicaid waiver billing, payer claims, denials, reconciliation and revenue cycle.',
    'Quality Assurance':'Internal audits, corrective actions, performance indicators and survey readiness.',
    'Audit & Security Center':'Administrative actions, access review, security events and governance controls.',
    'Vendors & Procurement':'Vendor records, purchasing, contracts, supplies and approval workflows.',
    'Finance & Budgeting':'Budgets, forecasts, expenses, cash planning and subsidiary financial controls.',
    'Contracts & Legal':'Contracts, insurance, renewals, legal records and corporate obligations.',
    'Facilities & Maintenance':'Properties, repairs, inspections, utilities and capital improvements.',
    'Projects & Expansion':'New homes, service launches, milestones, approvals and implementation tracking.',
    'Emergency & Business Continuity':'Emergency plans, disruptions, escalation trees and continuity readiness.'
  };

  function dashboard(){return $('module-dashboard')||document.querySelector('.module.active')||document.querySelector('main')||document.querySelector('.main-content');}

  function ensureHost(){
    let host=$('adminInternalWorkspace');
    if(host) return host;
    host=document.createElement('section');
    host.id='adminInternalWorkspace';
    host.hidden=true;
    host.innerHTML='<div class="aiw-shell"><header class="aiw-head"><div><div class="aiw-kicker">Sulandra Health Admin Workspace</div><h1 id="aiwTitle">Workspace</h1><p id="aiwDescription"></p></div><div class="aiw-actions"><button type="button" id="aiwBack">Command Center</button><button type="button" id="aiwRefresh">Refresh</button></div></header><div id="aiwBody" class="aiw-body"></div></div>';
    const target=dashboard();
    target?.insertBefore(host,target.firstChild);
    $('aiwBack').onclick=showCommandCenter;
    $('aiwRefresh').onclick=()=>{const frame=$('aiwFrame');if(frame)frame.src=frame.src;};
    return host;
  }

  function installStyles(){
    if($('adminWorkspaceRouterStyles')) return;
    const s=document.createElement('style');s.id='adminWorkspaceRouterStyles';s.textContent=`
      #adminInternalWorkspace{width:100%;min-width:0;margin:0 0 24px}.aiw-shell{background:var(--ec-surface,#fff);border:1px solid var(--ec-line,#d7e4ef);border-radius:24px;box-shadow:var(--ec-shadow,0 18px 50px rgba(15,36,66,.11));overflow:hidden;color:var(--ec-ink,#102448)}
      .aiw-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:22px 24px;border-bottom:1px solid var(--ec-line,#d7e4ef);background:linear-gradient(145deg,var(--ec-soft,#f4f8fb),var(--ec-surface,#fff))}.aiw-kicker{font-size:12px;font-weight:900;letter-spacing:.11em;text-transform:uppercase;color:var(--ec-accent,#075b9c)}.aiw-head h1{margin:5px 0 5px!important;font-size:clamp(25px,3vw,38px)!important;color:var(--ec-ink,#102448)!important}.aiw-head p{margin:0;color:var(--ec-muted,#62738b);line-height:1.55}.aiw-actions{display:flex;gap:9px;flex-wrap:wrap}.aiw-actions button,.aiw-action{border:1px solid var(--ec-line,#d7e4ef);border-radius:12px;background:#fff;color:#102448;padding:10px 14px;font-weight:850;cursor:pointer}.aiw-actions button:last-child,.aiw-action.primary{background:var(--ec-accent,#075b9c);color:#fff;border-color:transparent}.aiw-body{min-height:520px;background:#f7fafc}.aiw-frame{display:block;width:100%;height:calc(100vh - var(--ec-panel-top,252px) - 92px);min-height:620px;border:0;background:#fff}.aiw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;padding:24px}.aiw-card{border:1px solid var(--ec-line,#d7e4ef);border-radius:16px;background:#fff;padding:18px;min-height:130px}.aiw-card h3{margin:0 0 8px;color:#102448}.aiw-card p{margin:0;color:#62738b;line-height:1.55}.aiw-card button{margin-top:14px}.aiw-placeholder{padding:30px}.aiw-placeholder>div{max-width:850px;margin:auto;border:1px solid var(--ec-line,#d7e4ef);border-radius:18px;background:#fff;padding:24px}.aiw-placeholder h2{margin:0 0 8px;color:#102448}.aiw-placeholder p{color:#62738b;line-height:1.65}.aiw-status{display:inline-flex;margin-top:14px;border-radius:999px;padding:7px 11px;background:#eaf8ef;color:#166534;font-size:12px;font-weight:900}
      @media(max-width:760px){.aiw-head{display:block;padding:18px}.aiw-actions{margin-top:14px}.aiw-frame{min-height:520px}.aiw-grid{grid-template-columns:1fr;padding:14px}}
    `;document.head.appendChild(s);
  }

  function showHost(title,description){
    const host=ensureHost();
    const center=$('enterpriseCommandCenter');if(center)center.hidden=true;
    host.hidden=false;$('aiwTitle').textContent=title;$('aiwDescription').textContent=description||'';
    host.scrollIntoView({behavior:'smooth',block:'start'});
    return $('aiwBody');
  }

  function showCommandCenter(){
    const host=$('adminInternalWorkspace');if(host)host.hidden=true;
    const center=$('enterpriseCommandCenter');if(center){center.hidden=false;center.scrollIntoView({behavior:'smooth',block:'start'});}
  }

  function openEmbedded(title,url,description){
    const body=showHost(title,description||'Secure internal control loaded inside the administration workspace.');
    body.innerHTML=`<iframe id="aiwFrame" class="aiw-frame" src="${esc(url)}" title="${esc(title)}"></iframe>`;
  }

  function openPlaceholder(title,description){
    const body=showHost(title,description||'This operational workspace is provisioned for secure connection to its dedicated module.');
    body.innerHTML=`<div class="aiw-placeholder"><div><div class="aiw-kicker">Internal operational workspace</div><h2>${esc(title)}</h2><p>${esc(description||'This workspace is ready for its live data, forms and workflow controls to be connected without leaving the admin portal.')}</p><span class="aiw-status">Workspace routed safely</span></div></div>`;
  }

  function openSubsidiary(title){
    const body=showHost(title,'Manage this Sulandra Health service line from the shared parent-company workspace.');
    const routes=[['Service Operations','homes'],['Workforce','employees'],['Scheduling','scheduling'],['Compliance','documents'],['Reports','reports'],['Service Settings','settings']];
    body.innerHTML=`<div class="aiw-grid">${routes.map(([label,target])=>`<article class="aiw-card"><h3>${esc(label)}</h3><p>Open the ${esc(label.toLowerCase())} controls for this service line.</p><button class="aiw-action primary" type="button" data-aiw-module="${esc(target)}">Open in workspace</button></article>`).join('')}</div>`;
    body.querySelectorAll('[data-aiw-module]').forEach(button=>button.onclick=()=>clickModule(button.dataset.aiwModule));
  }

  function clickModule(target){
    const trigger=document.querySelector(`#topModuleNav [data-module="${target}"],#sideModuleNav [data-module="${target}"],[data-module="${target}"]`);
    if(trigger){trigger.click();return true;}return false;
  }

  function labelOf(node){return (node.querySelector('h3,strong')?.textContent||node.textContent||'').trim().replace(/\s+/g,' ');}

  function handleCapturedClick(event){
    const node=event.target.closest('.ec-tool,.ec-rail-tool');
    if(!node)return;
    const title=labelOf(node);
    if(MODULE_TOOLS.has(title)) return;
    if(EXTERNAL_MAIN_SITES[title]){
      event.preventDefault();event.stopImmediatePropagation();window.open(EXTERNAL_MAIN_SITES[title],'_blank','noopener,noreferrer');return;
    }
    if(EMBEDDED_PAGES[title]){
      event.preventDefault();event.stopImmediatePropagation();openEmbedded(title,EMBEDDED_PAGES[title],node.querySelector('p')?.textContent||'');return;
    }
    if(SUBSIDIARIES.has(title)){
      event.preventDefault();event.stopImmediatePropagation();openSubsidiary(title);return;
    }
    if(title==='Add & Route New Service') return;
    if(WORKSPACE_DESCRIPTIONS[title]){
      event.preventDefault();event.stopImmediatePropagation();openPlaceholder(title,WORKSPACE_DESCRIPTIONS[title]);
    }
  }

  function enforceMainSiteTabs(){
    document.addEventListener('click',event=>{
      const link=event.target.closest('a');if(!link)return;
      const href=(link.getAttribute('href')||'').toLowerCase();
      if(href.includes('intranet.html')||href.includes('education-portal.html')||href.includes('employee-portal.html')){
        event.preventDefault();window.open(link.href,'_blank','noopener,noreferrer');
      }
    },true);
  }

  function init(){
    installStyles();ensureHost();document.addEventListener('click',handleCapturedClick,true);enforceMainSiteTabs();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
