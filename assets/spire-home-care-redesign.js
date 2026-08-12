(() => {
  'use strict';
  const VERSION='20260812-home-care-redesign-1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const patientId=()=>sessionStorage.getItem('spire:patientId')||new URLSearchParams(location.hash.replace(/^#/,'')).get('patient')||new URLSearchParams(location.search).get('patientId')||'';
  const workspaceButton=(key)=>document.querySelector(`[data-workspace="${CSS.escape(key)}"]`);
  const chartTab=(key)=>document.querySelector(`[data-chart-tab="${CSS.escape(key)}"]`);

  function openClientList(){workspaceButton('census')?.click();setTimeout(applyClientLanguage,20)}
  function requireClient(action){if(patientId()&&document.getElementById('spireChartWorkspace')?.classList.contains('active')){action();return}openClientList()}
  function openChartTab(key){requireClient(()=>chartTab(key)?.click())}
  function openFlowsheet(){requireClient(()=>{const launch=document.getElementById('spireOpenFlowsheetGrid');if(launch){launch.click();return}chartTab('vitals')?.click()})}

  function buildNavigation(){
    const nav=document.querySelector('.spire-global-nav');
    if(!nav||nav.dataset.homeCareNav===VERSION)return;
    nav.dataset.homeCareNav=VERSION;
    const items=[
      ['home','⌂','Home',()=>workspaceButton('home')?.click()],
      ['clients','👥','My Clients',openClientList],
      ['charting','✎','Charting',openFlowsheet],
      ['mar','💊','MAR / TAR',()=>openChartTab('mar')],
      ['isp','◎','ISP & Goals',()=>openChartTab('care-plan')],
      ['clinical','✚','Clinical',()=>openChartTab('assessments')],
      ['incidents','⚠','Incidents',()=>openChartTab('incidents')],
      ['documents','▤','Documents',()=>openChartTab('documents')],
    ];
    nav.innerHTML=items.map(([key,icon,label])=>`<button type="button" data-hc-nav="${key}"><span aria-hidden="true">${icon}</span> ${label}</button>`).join('');
    nav.querySelectorAll('[data-hc-nav]').forEach((button,index)=>button.onclick=e=>{e.preventDefault();e.stopPropagation();nav.querySelectorAll('button').forEach(x=>x.classList.remove('active'));button.classList.add('active');items[index][3]()});
    nav.querySelector('[data-hc-nav="home"]')?.classList.add('active');
  }

  function buildHome(){
    const host=document.getElementById('spireHomeWorkspace');
    if(!host||!host.classList.contains('active'))return;
    if(host.dataset.homeCareHome===VERSION)return;
    host.dataset.homeCareHome=VERSION;
    host.innerHTML=`<div class="spire-hc-home">
      <section class="spire-hc-welcome"><div><h1>Client Care Workspace</h1><p>Document the care, supports, treatments and outcomes delivered in the client’s home and community.</p></div><button class="spire-hc-action" data-hc-home="clients" style="min-height:auto;min-width:220px"><strong>Open a Client Chart</strong><span>Select an assigned client to begin documentation.</span></button></section>
      <div class="spire-hc-actions">
        <button class="spire-hc-action" data-hc-home="clients"><div class="spire-hc-icon">👥</div><strong>My Clients</strong><span>Open assigned client records, demographics, alerts, contacts and current care information.</span></button>
        <button class="spire-hc-action" data-hc-home="charting"><div class="spire-hc-icon">✎</div><strong>Daily Charting</strong><span>ISP logs, ADLs, sleep/wake, toileting, meals, behaviors, vitals and continuous flowsheets.</span></button>
        <button class="spire-hc-action" data-hc-home="mar"><div class="spire-hc-icon">💊</div><strong>MAR / TAR</strong><span>Document medications and treatments due in the home, including PRN follow-up.</span></button>
        <button class="spire-hc-action" data-hc-home="isp"><div class="spire-hc-icon">◎</div><strong>ISP & Outcomes</strong><span>Review current outcomes and document progress toward each support objective.</span></button>
        <button class="spire-hc-action" data-hc-home="clinical"><div class="spire-hc-icon">✚</div><strong>Clinical</strong><span>Nursing assessments, visits, wound care, catheter/tube care, diabetes, respiratory and other skilled needs.</span></button>
        <button class="spire-hc-action" data-hc-home="incidents"><div class="spire-hc-icon">⚠</div><strong>Incidents & Risk</strong><span>Document incidents, follow-up, changes of condition and required review.</span></button>
        <button class="spire-hc-action" data-hc-home="documents"><div class="spire-hc-icon">▤</div><strong>Documents</strong><span>ISP, orders, plans of care, external records, consents and client-specific documents.</span></button>
        <button class="spire-hc-action" data-hc-home="notes"><div class="spire-hc-icon">📝</div><strong>Progress Notes</strong><span>Enter shift, DSP, nursing and other service notes in the client record.</span></button>
      </div>
      <section class="spire-hc-section"><h2>Designed for services delivered where the client lives</h2><p>S.P.I.R.E. is centered on client support, waiver documentation and home-health care rather than hospital workflows. Select a client first, then chart only the activities and clinical services relevant to that individual.</p></section>
    </div>`;
    const actions={clients:openClientList,charting:openFlowsheet,mar:()=>openChartTab('mar'),isp:()=>openChartTab('care-plan'),clinical:()=>openChartTab('assessments'),incidents:()=>openChartTab('incidents'),documents:()=>openChartTab('documents'),notes:()=>openChartTab('notes')};
    host.querySelectorAll('[data-hc-home]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();actions[b.dataset.hcHome]?.()});
  }

  function updateTopActions(){
    const find=document.getElementById('spirePatientSearch');if(find){find.textContent='Find Client';find.setAttribute('aria-label','Find client')}
    const back=document.getElementById('spireBackToPlatform');if(back){back.textContent='Sulandra Health';back.title='Return to Sulandra Health'}
    const brand=document.querySelector('.spire-brand span');if(brand)brand.textContent='Home & Community Care Record';
  }

  function updateQuickActions(){
    const rail=document.getElementById('spireRightRail');if(!rail)return;
    const cards=[...rail.querySelectorAll('.rail-card')];
    const quick=cards.find(c=>/Quick Actions/i.test(c.querySelector('h3')?.textContent||''));
    if(!quick||quick.dataset.homeCareQuick===VERSION)return;
    quick.dataset.homeCareQuick=VERSION;
    quick.innerHTML=`<h3>Quick Charting</h3><button type="button" data-hc-quick="flowsheet">+ Flowsheet</button><button type="button" data-hc-quick="note">+ Progress Note</button><button type="button" data-hc-quick="mar">+ MAR / TAR</button><button type="button" data-hc-quick="incident">+ Incident</button>`;
    const actions={flowsheet:openFlowsheet,note:()=>openChartTab('notes'),mar:()=>openChartTab('mar'),incident:()=>openChartTab('incidents')};
    quick.querySelectorAll('[data-hc-quick]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();actions[b.dataset.hcQuick]?.()});
  }

  const replacements=[
    [/Patient Lists/gi,'Client List'],[/Patient List/gi,'Client List'],[/Find Patient/gi,'Find Client'],[/Find Chart/gi,'Find Client'],[/Open Chart/gi,'Open Client Chart'],[/patient chart/gi,'client chart'],[/patient charts/gi,'client charts'],[/patient record/gi,'client record'],[/patient records/gi,'client records'],[/patient workspace/gi,'client workspace'],[/patient information/gi,'client information'],[/patient-specific/gi,'client-specific'],[/patient-centered/gi,'client-centered'],[/patients/gi,'clients'],[/patient/gi,'client']
  ];
  function translateText(text){let out=text;for(const [rx,to] of replacements)out=out.replace(rx,to);return out}
  function applyClientLanguage(root=document.querySelector('.spire-app')){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>{const p=n.parentElement;if(!p||['SCRIPT','STYLE','TEXTAREA','OPTION'].includes(p.tagName))return NodeFilter.FILTER_REJECT;return /patient/i.test(n.nodeValue||'')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}});
    const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(n=>n.nodeValue=translateText(n.nodeValue||''));
    root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(el=>['placeholder','aria-label','title'].forEach(attr=>{const v=el.getAttribute(attr);if(v&&/patient/i.test(v))el.setAttribute(attr,translateText(v))}));
    document.title=translateText(document.title);
  }

  function simplifyChartTabs(){
    const bar=document.querySelector('#spireChartWorkspace>.chart-tabs');if(!bar)return;
    const allowed=new Set(['chart-review','notes','medications','mar','care-plan','assessments','vitals','incidents','documents','external','timeline']);
    bar.querySelectorAll('[data-chart-tab]').forEach(b=>{b.hidden=!allowed.has(b.dataset.chartTab);const labels={'chart-review':'Overview','care-plan':'ISP & Goals','assessments':'Clinical Assessments','vitals':'Flowsheets','documents':'Documents','external':'External Records','timeline':'Timeline'};if(labels[b.dataset.chartTab])b.textContent=labels[b.dataset.chartTab]});
  }

  function markActiveTopNav(){
    const nav=document.querySelector('.spire-global-nav');if(!nav)return;
    const activeTab=document.querySelector('#spireChartWorkspace>.chart-tabs [data-chart-tab].active')?.dataset.chartTab;
    const map={'mar':'mar','care-plan':'isp','assessments':'clinical','vitals':'charting','incidents':'incidents','documents':'documents','external':'documents','notes':'charting'};
    if(activeTab&&map[activeTab]){nav.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x.dataset.hcNav===map[activeTab]))}
  }

  function apply(){buildNavigation();updateTopActions();buildHome();updateQuickActions();simplifyChartTabs();applyClientLanguage();markActiveTopNav();document.documentElement.dataset.spireHomeCareRedesign=VERSION}
  let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-chart-tab],[data-workspace],[data-patient-id]'))setTimeout(schedule,0)},true);
})();
