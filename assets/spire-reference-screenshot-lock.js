(() => {
  'use strict';
  const VERSION='20260812-reference-screenshot-1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const text=(s,r=document)=>$(s,r)?.textContent?.trim()||'';
  function patientFacts(){
    const strip=document.getElementById('spirePatientStrip');
    const cells={};
    $$('.storyboard-cell',strip).forEach(c=>{const k=text('span',c),v=text('b',c);if(k)cells[k]=v});
    const ctx={};
    $$('.context-section',document.getElementById('spireContext')).forEach(c=>{const k=text('strong',c);if(k)ctx[k]=$$('span,small',c).map(n=>n.textContent?.trim()).filter(Boolean).join(' · ')});
    return {name:text('.patient-main strong',strip)||'Client',sub:text('.patient-main span',strip),small:text('.patient-main small',strip),cells,ctx,alerts:$$('.flag-chip',strip).map(n=>n.textContent?.trim()).filter(Boolean)};
  }
  function renderSummary(){
    const host=document.getElementById('spireChartTabBody'); if(!host)return;
    const f=patientFacts(), c=k=>f.cells[k]||'—', x=k=>f.ctx[k]||'—';
    host.innerHTML=`<div class="spire-reference-summary" data-reference-summary="${VERSION}">
      <div class="spire-reference-subtabs"><button class="active">Overview</button><button>Intake Documents Index</button><button>Medical Problems</button><button>Treatment Team</button><button>Residential Planning</button></div>
      <section class="ref-card agents"><header><span>🛡 Health Care Agents & Legal Guardian</span><span>Comment</span></header><div><b>Client:</b> ${esc(f.name)}<br><b>Chart:</b> ${esc(f.sub||f.small||'Active client record')}<br><b>Care Team:</b> ${esc(x('Care Team'))}</div></section>
      <section class="ref-card risk"><header><span>⚠ Risk & Safety Advisories</span><span>Active Protocols</span></header><div>${f.alerts.length?f.alerts.map(a=>`• ${esc(a)}`).join('<br>'):'• No active chart alerts'}<br><b>Allergies:</b> ${esc(c('Allergies'))}</div></section>
      <section class="ref-card problems"><header><span>🩺 Medical Problems & Active Diagnoses</span><span>Problem List</span></header><div><table><thead><tr><th>Condition / Diagnosis</th><th>Status</th><th>Management / Notes</th></tr></thead><tbody><tr><td>${esc(x('Active Diagnoses'))}</td><td>Active</td><td>${esc(x('Active Problems'))}</td></tr></tbody></table></div></section>
      <section class="ref-card team"><header><span>👥 Treatment Team & Providers</span><span>Directory</span></header><div><table><thead><tr><th>Provider / Role</th><th>Specialty / Focus</th><th>Contact / Follow-up</th></tr></thead><tbody><tr><td>${esc(x('Care Team'))}</td><td>Current care team</td><td>${esc(x('Next Appointment'))}</td></tr></tbody></table></div></section>
      <section class="ref-card contacts"><header><span>🚑 Emergency Contacts & Important People</span><span>Contacts</span></header><div><b>Latest Encounter:</b> ${esc(x('Latest Encounter'))}<br><b>Home / Program:</b> ${esc(c('Home / Program'))}</div></section>
    </div>`;
  }
  function relabel(){
    const brand=$('.spire-brand span');
    if(brand){const home=sessionStorage.getItem('spire:selected-service-home-name')||'';brand.textContent=`Enterprise${home?' - '+home.toUpperCase():''} - ACTIVE CLIENT`;}
    const quick=document.querySelector('.spire-right-rail'); if(quick)quick.setAttribute('aria-hidden','true');
  }
  document.addEventListener('click',e=>{
    const summary=e.target.closest('[data-spmt-special="summary"]');
    if(summary){e.preventDefault();e.stopImmediatePropagation();$$('#spireChartWorkspace>.chart-tabs button').forEach(b=>b.classList.toggle('active',b===summary));queueMicrotask(renderSummary);}
  },true);
  document.addEventListener('spire:chart-tab-selected',e=>{if(e.detail?.tab==='summary')queueMicrotask(renderSummary)});
  const obs=new MutationObserver(()=>{relabel();const chart=document.getElementById('spireChartWorkspace');if(chart?.classList.contains('active')&&!$('#spireChartTabBody .spire-reference-summary')&&!$('#spireChartWorkspace>.chart-tabs .active[data-chart-tab]'))renderSummary();});
  const start=()=>{relabel();obs.observe(document.body,{childList:true,subtree:true});};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
  window.SpireReferenceScreenshotLock={version:VERSION,renderSummary};
})();