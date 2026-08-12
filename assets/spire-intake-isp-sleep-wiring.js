(() => {
  'use strict';
  const CONTRACT='20260812-spire-intake-isp-sleep-1';
  const patientId=()=>sessionStorage.getItem('spire:patientId')||new URLSearchParams(String(location.hash||'').replace(/^#/,'')).get('patient')||new URLSearchParams(location.search).get('patientId')||'';
  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

  function openFlowsheetGroup(group){
    const id=patientId();
    if(!id){document.querySelector('[data-workspace="census"]')?.click();return;}
    if(window.SpireMasterTemplate?.openFlowsheets){window.SpireMasterTemplate.openFlowsheets(group);return;}
    sessionStorage.setItem('spire:patientId',id);
    sessionStorage.setItem('spire:flowsheet:preferred-group',group);
    location.href=`/spire/flowsheets.html?patientId=${encodeURIComponent(id)}&group=${encodeURIComponent(group)}`;
  }

  function openAdmission(attempt=0){
    const id=patientId();
    if(!id){document.querySelector('[data-workspace="census"]')?.click();return;}
    const button=document.getElementById('spireAdmissionHistoryTab');
    if(button){button.click();sessionStorage.removeItem('spire:pending-admission-history');return;}
    sessionStorage.setItem('spire:pending-admission-history',id);
    if(attempt<30){setTimeout(()=>openAdmission(attempt+1),80);return;}
    location.href=`/spire.html#patient=${encodeURIComponent(id)}&tab=chart-review`;
  }

  function insertToolbarButton(bar,key,label,beforeKey='flowsheets'){
    if(bar.querySelector(`[data-spmt-tool="${key}"]`))return;
    const button=document.createElement('button');
    button.type='button';button.dataset.spmtTool=key;button.textContent=label;
    const before=bar.querySelector(`[data-spmt-tool="${beforeKey}"]`);
    if(before)before.insertAdjacentElement('beforebegin',button);else bar.appendChild(button);
    if(key==='intake')button.onclick=e=>{e.preventDefault();e.stopPropagation();openAdmission();};
    if(key==='isp-logs')button.onclick=e=>{e.preventDefault();e.stopPropagation();openFlowsheetGroup('ISP Outcomes / Progress');};
    if(key==='sleep-wake')button.onclick=e=>{e.preventDefault();e.stopPropagation();openFlowsheetGroup('Sleep / Wake');};
  }

  function wireToolbar(){
    const bar=document.getElementById('spireMasterToolbar');if(!bar)return;
    insertToolbarButton(bar,'intake','📥 Intake / Admission','flowsheets');
    insertToolbarButton(bar,'isp-logs','◎ ISP Logs','flowsheets');
    insertToolbarButton(bar,'sleep-wake','☾ Sleep / Wake','flowsheets');
  }

  function wireAdmissionTab(){
    const button=document.getElementById('spireAdmissionHistoryTab');if(!button)return;
    if(button.textContent!=='Intake / Admission')button.textContent='Intake / Admission';
    button.dataset.spmtIntakeAdmission='true';
    button.title='Open the approved Client Intake source record, attachments, signatures and admission history';
    const pending=sessionStorage.getItem('spire:pending-admission-history');
    if(pending&&pending===patientId()&&!button.classList.contains('active'))setTimeout(()=>openAdmission(),0);
  }

  function appendQuickButton(quick,key,label,handler){
    if(quick.querySelector(`[data-spmt-intake-quick="${key}"]`))return;
    const b=document.createElement('button');b.type='button';b.dataset.spmtIntakeQuick=key;b.textContent=label;b.onclick=e=>{e.preventDefault();e.stopPropagation();handler();};
    quick.appendChild(b);
  }

  function wireQuickActions(){
    const rail=document.getElementById('spireRightRail');if(!rail)return;
    const quick=$$('.rail-card',rail).find(card=>/Quick Actions|Quick Charting/i.test($('h3',card)?.textContent||''));if(!quick)return;
    appendQuickButton(quick,'intake','Intake / Admission',()=>openAdmission());
    appendQuickButton(quick,'isp','ISP Progress Log',()=>openFlowsheetGroup('ISP Outcomes / Progress'));
    appendQuickButton(quick,'sleep','Sleep / Wake Log',()=>openFlowsheetGroup('Sleep / Wake'));
  }

  function wireSummary(){
    const summary=$('#spireChartTabBody .spmt-summary');if(!summary||summary.querySelector('[data-spmt-intake-summary]'))return;
    const card=document.createElement('section');card.className='spmt-summary-card intake';card.dataset.spmtIntakeSummary='true';
    card.innerHTML='<header><span>📥 Approved Intake / Admission</span><span>Source record</span></header><div>The approved Client Intake remains the source record for this chart. <button type="button" data-spmt-open-intake>Open Intake / Admission</button> to review every saved intake section, attachment, acknowledgment and source-company provenance.</div>';
    card.querySelector('[data-spmt-open-intake]').onclick=e=>{e.preventDefault();openAdmission();};
    summary.insertAdjacentElement('afterbegin',card);
  }

  function apply(){
    wireToolbar();wireAdmissionTab();wireQuickActions();wireSummary();
    document.documentElement.dataset.spireIntakeIspSleepWiring=CONTRACT;
  }

  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-patient-id],[data-chart-tab],[data-spmt-special],[data-workspace]'))setTimeout(schedule,0);
  },true);
  window.SpireIntakeIspSleepWiring=Object.freeze({contract:CONTRACT,openAdmission,openFlowsheetGroup,refresh:schedule});
})();
