(() => {
  'use strict';
  const VERSION='20260812-user-master-template-2';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value};
  const patientId=()=>sessionStorage.getItem('spire:patientId')||new URLSearchParams(location.hash.replace(/^#/,'' )).get('patient')||new URLSearchParams(location.search).get('patientId')||'';
  const workspaceButton=key=>$(`[data-workspace="${CSS.escape(key)}"]`);
  const chartButton=key=>$(`#spireChartWorkspace>.chart-tabs [data-chart-tab="${CSS.escape(key)}"]`);
  const chartOpen=()=>document.getElementById('spireChartWorkspace')?.classList.contains('active');

  function clickWorkspace(key){workspaceButton(key)?.click()}
  function clickChart(key){
    if(!patientId()){clickWorkspace('census');return}
    if(chartOpen()&&chartButton(key)){chartButton(key).click();return}
    location.href=`/spire.html#patient=${encodeURIComponent(patientId())}&tab=${encodeURIComponent(key)}`;
  }
  function openFlowsheets(group=''){
    const id=patientId();
    if(!id){clickWorkspace('census');return}
    sessionStorage.setItem('spire:patientId',id);
    if(group)sessionStorage.setItem('spire:flowsheet:preferred-group',group);else sessionStorage.removeItem('spire:flowsheet:preferred-group');
    const q=new URLSearchParams({patientId:id});if(group)q.set('group',group);
    location.href=`/spire/flowsheets.html?${q.toString()}`;
  }
  function currentClientName(){return $('.patient-main strong')?.textContent?.trim()||'Client Chart'}

  function installGlobalLabels(){
    const labels={home:'Home',schedule:'Schedule',inbasket:'In Basket',census:'Client Lists',search:'Chart Search',tasks:'My Tasks',orders:'Orders',reports:'Reports',tools:'Tools'};
    $$('.spire-global-nav [data-workspace]').forEach(b=>{const v=labels[b.dataset.workspace];if(v)setText(b,v)});
    setText($('.spire-brand strong'),'Spire');
    setText($('.spire-brand span'),'Enterprise • Client Care Record');
    const find=document.getElementById('spirePatientSearch');if(find){setText(find,'Find Client');if(find.title!=='Search authorized client charts')find.title='Search authorized client charts'}
  }

  function installSearch(){
    const top=$('.spire-topbar');if(!top||document.getElementById('spireMasterSearchHost'))return;
    const nav=$('.spire-global-nav',top);if(!nav)return;
    const host=document.createElement('div');host.id='spireMasterSearchHost';host.innerHTML='<input id="spireMasterSearch" type="search" autocomplete="off" placeholder="Search chart / client"><button type="button" aria-label="Search">⌕</button>';
    nav.insertAdjacentElement('beforebegin',host);
    const run=()=>{
      const q=$('#spireMasterSearch',host)?.value?.trim()||'';
      clickWorkspace('search');
      setTimeout(()=>{const input=document.getElementById('patientSearchInput');if(input){input.value=q;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus()}},50);
    };
    $('button',host).onclick=run;$('#spireMasterSearch',host).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run()}});
  }

  function installToolbar(){
    const top=$('.spire-topbar');if(!top)return;
    let bar=document.getElementById('spireMasterToolbar');
    if(!bar){bar=document.createElement('nav');bar.id='spireMasterToolbar';top.insertAdjacentElement('afterend',bar)}
    if(bar.dataset.spmtVersion!==VERSION){
      bar.dataset.spmtVersion=VERSION;
      bar.innerHTML=`
        <button type="button" data-spmt-tool="home">⌂ Home</button>
        <button type="button" data-spmt-tool="clients">👥 Client Lists</button>
        <button type="button" data-spmt-tool="station">🩺 Client Station</button>
        <button type="button" data-spmt-tool="flowsheets">▦ Flowsheets</button>
        <button type="button" data-spmt-tool="mar">💊 MAR / TAR</button>
        <button type="button" data-spmt-tool="isp">◎ ISP & Goals</button>
        <button type="button" data-spmt-tool="clinical">✚ Clinical</button>
        <button type="button" data-spmt-tool="incidents">⚠ Incidents</button>
        <button type="button" data-spmt-tool="documents">▤ Documents</button>
        <button type="button" data-spmt-tool="appointments">📅 Upcoming Appointments</button>
        <button type="button" class="spmt-client-tab" data-spmt-tool="station" title="Return to current client chart">Client Chart</button>`;
      const actions={home:()=>clickWorkspace('home'),clients:()=>clickWorkspace('census'),station:()=>clickChart('chart-review'),flowsheets:()=>openFlowsheets(),mar:()=>clickChart('mar'),isp:()=>clickChart('care-plan'),clinical:()=>clickChart('assessments'),incidents:()=>clickChart('incidents'),documents:()=>clickChart('documents'),appointments:()=>clickWorkspace('schedule')};
      $$('[data-spmt-tool]',bar).forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();actions[b.dataset.spmtTool]?.()});
    }
    setText($('.spmt-client-tab',bar),currentClientName());
  }

  function enhancePatientSidebar(){
    const strip=document.getElementById('spirePatientStrip');if(!strip||strip.hidden)return;
    const main=$('.patient-main',strip),facts=$('.patient-storyboard-facts',strip),alerts=$('.patient-alert-row',strip);
    const addTitle=(before,text,key)=>{if(!before||strip.querySelector(`[data-spmt-side-title="${key}"]`))return;const n=document.createElement('div');n.className='spmt-sidebar-title';n.dataset.spmtSideTitle=key;n.textContent=text;before.insertAdjacentElement('beforebegin',n)};
    addTitle(main,'Demographics & ID','demographics');addTitle(facts,'Clinical, Home & Open Work','clinical');addTitle(alerts,'Safety & Alerts','alerts');
    const cells=$$('.storyboard-cell',strip);const labels=['Allergies','Home / Program','Latest Vitals','Open Work'];
    cells.forEach((c,i)=>{const label=$('span',c);if(label&&labels[i])setText(label,labels[i])});
  }

  const tabLabels={'chart-review':'Chart Review','results-review':'Results Review','timeline':'Synopsis','mar':'MAR','notes':'Notes','orders':'eMAR / Orders','medications':'Medications','care-plan':'ISP & Goals','assessments':'Clinical','authorizations':'EVV / Authorization','incidents':'Incidents & Risk','documents':'Documents','external':'External Records','communications':'Communications','wrap-up':'Wrap-Up','plan':'Plan'};
  function specialButton(key,label){const b=document.createElement('button');b.type='button';b.dataset.spmtSpecial=key;b.textContent=label;return b}
  function setSpecialActive(key=''){$$('#spireChartWorkspace>.chart-tabs [data-spmt-special]').forEach(b=>b.classList.toggle('active',b.dataset.spmtSpecial===key));if(key)$$('#spireChartWorkspace>.chart-tabs [data-chart-tab]').forEach(b=>b.classList.remove('active'))}

  function enhanceChartTabs(){
    const bar=$('#spireChartWorkspace>.chart-tabs');if(!bar)return;
    $$('[data-chart-tab]',bar).forEach(b=>{const v=tabLabels[b.dataset.chartTab];if(v)setText(b,v)});
    const vitals=chartButton('vitals');if(vitals&&!vitals.hidden)vitals.hidden=true;
    let summary=$('[data-spmt-special="summary"]',bar);if(!summary)summary=specialButton('summary','Summary');
    let flows=$('[data-spmt-special="flowsheets"]',bar);if(!flows)flows=specialButton('flowsheets','Flowsheets');
    let io=$('[data-spmt-special="io"]',bar);if(!io)io=specialButton('io','Intake/Output');
    let work=$('[data-spmt-special="worklist"]',bar);if(!work)work=specialButton('worklist','Work List');
    let demo=$('[data-spmt-special="demographics"]',bar);if(!demo)demo=specialButton('demographics','Demographics');
    const ordered=[summary,chartButton('chart-review'),chartButton('results-review'),chartButton('timeline'),flows,chartButton('mar'),io,chartButton('notes'),chartButton('orders'),work,demo,chartButton('medications'),chartButton('care-plan'),chartButton('assessments'),chartButton('authorizations'),chartButton('incidents'),chartButton('documents'),chartButton('external'),chartButton('communications'),chartButton('wrap-up'),chartButton('plan')].filter(Boolean);
    const visible=$$('button',bar).filter(n=>!n.hidden);
    const same=visible.length===ordered.length&&ordered.every((n,i)=>visible[i]===n);
    if(!same)ordered.forEach(n=>bar.appendChild(n));
    if(!summary.dataset.spmtBound){summary.dataset.spmtBound='1';summary.onclick=e=>{e.preventDefault();e.stopPropagation();renderSummary();setSpecialActive('summary')}}
    if(!flows.dataset.spmtBound){flows.dataset.spmtBound='1';flows.onclick=e=>{e.preventDefault();e.stopPropagation();openFlowsheets()}}
    if(!io.dataset.spmtBound){io.dataset.spmtBound='1';io.onclick=e=>{e.preventDefault();e.stopPropagation();openFlowsheets('Intake / Output')}}
    if(!work.dataset.spmtBound){work.dataset.spmtBound='1';work.onclick=e=>{e.preventDefault();e.stopPropagation();clickWorkspace('tasks')}}
    if(!demo.dataset.spmtBound){demo.dataset.spmtBound='1';demo.onclick=e=>{e.preventDefault();e.stopPropagation();renderDemographics();setSpecialActive('demographics')}}
  }

  function getStoryFacts(){
    const strip=document.getElementById('spirePatientStrip');
    const facts={name:currentClientName(),sub:$('.patient-main span',strip)?.textContent?.trim()||'',small:$('.patient-main small',strip)?.textContent?.trim()||'',cells:[]};
    $$('.storyboard-cell',strip).forEach(c=>facts.cells.push({label:$('span',c)?.textContent?.trim()||'',value:$('b',c)?.textContent?.trim()||''}));
    facts.alerts=$$('.patient-alert-row .flag-chip',strip).map(x=>x.textContent?.trim()).filter(Boolean);
    const context=document.getElementById('spireContext');facts.context={};
    $$('.context-section',context).forEach(c=>{const k=$('strong',c)?.textContent?.trim()||'';const vals=$$('span,small',c).map(x=>x.textContent?.trim()).filter(Boolean);if(k)facts.context[k]=vals});
    return facts;
  }

  function renderSummary(){
    const host=document.getElementById('spireChartTabBody');if(!host)return;
    const f=getStoryFacts(),cell=k=>f.cells.find(x=>x.label===k)?.value||'—',ctx=k=>(f.context[k]||[]).join(' · ')||'—';
    host.innerHTML=`<div class="spmt-summary">
      <section class="spmt-summary-card agents"><header><span>🛡️ Client Identity & Care Setting</span><span>Live chart</span></header><div><strong>${esc(f.name)}</strong><br>${esc(f.sub)}${f.small?`<br>${esc(f.small)}`:''}<br><b>Home / Program:</b> ${esc(cell('Home / Program'))}</div></section>
      <section class="spmt-summary-card alerts"><header><span>⚠️ Safety & Alerts</span><span>Active</span></header><div>${f.alerts.length?f.alerts.map(x=>`• ${esc(x)}`).join('<br>'):'No active chart alerts'}<br><b>Allergies:</b> ${esc(cell('Allergies'))}</div></section>
      <section class="spmt-summary-card problems"><header><span>🩺 Active Diagnoses & Problems</span><span>Clinical Context</span></header><div><b>Diagnoses:</b> ${esc(ctx('Active Diagnoses'))}<br><b>Problems:</b> ${esc(ctx('Active Problems'))}<br><b>Latest Vitals:</b> ${esc(cell('Latest Vitals'))}</div></section>
      <section class="spmt-summary-card team"><header><span>👥 Care Team & Follow-up</span><span>Coordination</span></header><div><b>Care Team:</b> ${esc(ctx('Care Team'))}<br><b>Next Appointment:</b> ${esc(ctx('Next Appointment'))}<br><b>Latest Encounter:</b> ${esc(ctx('Latest Encounter'))}</div></section>
      <section class="spmt-summary-card plan"><header><span>◎ ISP / Care Plan</span><span>Documentation</span></header><div>Open <button type="button" data-spmt-summary-action="isp">ISP & Goals</button> to review active outcomes and document progress. Use <button type="button" data-spmt-summary-action="flowsheets">Flowsheets</button> for time-sensitive ISP, sleep/wake, ADL and clinical observations.</div></section>
      <section class="spmt-summary-card diet"><header><span>📋 Open Work</span><span>Current chart</span></header><div>${esc(cell('Open Work'))}<br><button type="button" data-spmt-summary-action="mar">Open MAR / TAR</button> <button type="button" data-spmt-summary-action="clinical">Clinical Assessments</button> <button type="button" data-spmt-summary-action="notes">Progress Notes</button></div></section>
    </div>`;
    const action={isp:()=>clickChart('care-plan'),flowsheets:()=>openFlowsheets(),mar:()=>clickChart('mar'),clinical:()=>clickChart('assessments'),notes:()=>clickChart('notes')};
    $$('[data-spmt-summary-action]',host).forEach(b=>b.onclick=e=>{e.preventDefault();action[b.dataset.spmtSummaryAction]?.()});
  }

  function renderDemographics(){
    const host=document.getElementById('spireChartTabBody');if(!host)return;
    const f=getStoryFacts();
    const cards=f.cells.map((x,i)=>`<section class="spmt-demo-card" style="border-left-color:${['#3b82f6','#10b981','#f59e0b','#8b5cf6'][i%4]}"><h3>${esc(x.label)}</h3><p>${esc(x.value)}</p></section>`).join('');
    host.innerHTML=`<div class="spmt-demographics"><div class="workspace-title compact"><div><h2>Demographics & Client Profile</h2><p>Live information loaded from the current authorized S.P.I.R.E. chart and intake-promoted client record.</p></div></div><div class="spmt-demographics-grid"><section class="spmt-demo-card"><h3>Client</h3><p><strong>${esc(f.name)}</strong></p><p>${esc(f.sub)}</p><p>${esc(f.small)}</p></section>${cards}<section class="spmt-demo-card"><h3>Safety & Alerts</h3><p>${f.alerts.length?f.alerts.map(esc).join(' • '):'No active chart alerts'}</p></section></div></div>`;
  }

  function enhanceQuickActions(){
    const rail=document.getElementById('spireRightRail');if(!rail)return;
    const quick=$$('.rail-card',rail).find(c=>/Quick Actions|Quick Charting/i.test($('h3',c)?.textContent||''));if(!quick)return;
    if(quick.dataset.spmtQuick===VERSION)return;quick.dataset.spmtQuick=VERSION;
    quick.innerHTML=`<h3>Quick Actions</h3><button type="button" data-spmt-quick="note">New Note</button><button type="button" data-spmt-quick="order">New Order</button><button type="button" data-spmt-quick="task">New Task</button><button type="button" data-spmt-quick="vitals">Record Vitals</button><button type="button" data-spmt-quick="flowsheet">Flowsheets</button><button type="button" data-spmt-quick="incident">Incident / Risk</button><button type="button" data-spmt-quick="wrap">Wrap-Up</button>`;
    const action={note:()=>clickChart('notes'),order:()=>clickChart('orders'),task:()=>clickWorkspace('tasks'),vitals:()=>clickChart('vitals'),flowsheet:()=>openFlowsheets(),incident:()=>clickChart('incidents'),wrap:()=>clickChart('wrap-up')};
    $$('[data-spmt-quick]',quick).forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();action[b.dataset.spmtQuick]?.()});
  }

  function markContext(){
    if(!document.body.classList.contains('spmt-ready'))document.body.classList.add('spmt-ready');
    if(document.documentElement.dataset.spireUserTemplateIntegration!==VERSION)document.documentElement.dataset.spireUserTemplateIntegration=VERSION;
    const c=$('#spireMasterToolbar .spmt-client-tab');if(c)setText(c,currentClientName());
  }

  function apply(){installGlobalLabels();installSearch();installToolbar();enhancePatientSidebar();enhanceChartTabs();enhanceQuickActions();markContext()}
  let pending=false;function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;apply()})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-chart-tab]'))setSpecialActive('');if(e.target.closest('[data-patient-id],[data-workspace],[data-chart-tab]'))setTimeout(schedule,0)},true);
  window.SpireMasterTemplate={version:VERSION,openFlowsheets,renderSummary,renderDemographics,refresh:schedule};
})();
