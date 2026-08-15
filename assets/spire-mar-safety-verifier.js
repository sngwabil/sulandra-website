(() => {
  'use strict';
  // SPIRE_MAR_SAFETY_VERIFIER_V1
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const clean = value => String(value ?? '').trim();
  const esc = value => clean(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const token = () => TOKEN_KEYS.map(key => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const patientId = () => {
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/,''));
    const query = new URLSearchParams(location.search);
    return clean(hash.get('patient') || query.get('patientId') || sessionStorage.getItem('spire:patientId'));
  };
  const orderCache = new Map();

  async function api(path, options={}) {
    const headers = new Headers(options.headers || {});
    headers.set('Accept','application/json');
    if(options.body != null && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    if(token()) headers.set('Authorization',`Bearer ${token()}`);
    const response = await fetch(API + path,{...options,headers,cache:'no-store'});
    const payload = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    return payload.data ?? payload;
  }

  function styles() {
    if(document.getElementById('spireMarSafetyVerifierStyles')) return;
    const style=document.createElement('style');style.id='spireMarSafetyVerifierStyles';style.textContent=`
      .spire-mar-safety-box{margin:8px 0;padding:9px;border:1px solid #8db6c8;background:#f4fbfe;border-radius:4px;color:#274d60;font-size:10.5px}.spire-mar-safety-title{display:flex;align-items:center;gap:6px;font-weight:900;color:#075d7b;margin-bottom:5px}.spire-mar-safety-title::before{content:'✓';display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:#0c7c95;color:#fff;font-size:10px}.spire-mar-safety-rule{margin:3px 0}.spire-mar-safety-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.spire-mar-safety-grid label{display:flex;flex-direction:column;gap:3px;font-size:10px;font-weight:800}.spire-mar-safety-grid input{border:1px solid #8fb2c2;border-radius:3px;padding:6px}.spire-mar-safety-dose{padding:6px;background:#e7f6fb;border-left:3px solid #1688af;font-weight:900}.spire-mar-safety-issues{margin-top:7px}.spire-mar-safety-issue{padding:6px 7px;margin-top:4px;border-radius:3px;font-weight:700}.spire-mar-safety-issue.warning{background:#fff6d8;border:1px solid #dfbd5c;color:#725408}.spire-mar-safety-issue.block{background:#ffe7e7;border:1px solid #df8c8c;color:#8b1d1d}.spire-mar-safety-review{margin-top:7px;padding-top:7px;border-top:1px solid #cbdde5}.spire-mar-safety-review label{display:flex;align-items:flex-start;gap:6px;font-weight:700}.spire-mar-safety-review button{margin-top:6px;border:1px solid #0d5c76;background:#0d7897;color:#fff;border-radius:3px;padding:6px 9px;font-weight:900}.spire-mar-safety-checking{color:#456a7a;font-style:italic}
      @media(max-width:700px){.spire-mar-safety-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(style);
  }

  async function order(orderId) {
    if(orderCache.has(orderId)) return orderCache.get(orderId);
    const value=await api(`/api/spire/medication-orders-v2/${encodeURIComponent(orderId)}`);
    orderCache.set(orderId,value);return value;
  }

  function ensureBox(dialog) {
    let box=dialog.querySelector('[data-spire-mar-safety-box]');
    if(box) return box;
    box=document.createElement('div');box.className='spire-mar-safety-box';box.dataset.spireMarSafetyBox='1';
    const note=dialog.querySelector('.spire-mar-server-time-note');
    (note?.parentElement || dialog.querySelector('main'))?.insertBefore(box,note||null);
    return box;
  }

  function setPrnDialog(dialog, medOrder) {
    if(String(medOrder.scheduleMode||'').toUpperCase()!=='PRN') return;
    if(dialog.dataset.status==='GIVEN') dialog.dataset.status='PRN_GIVEN';
    dialog.querySelectorAll('[data-mar-status]').forEach(button=>button.classList.toggle('selected',button.dataset.marStatus==='PRN_GIVEN'));
    const wrap=dialog.querySelector('[data-mar-reason-wrap]');if(wrap)wrap.hidden=false;
    const label=dialog.querySelector('[data-mar-indication]');if(label)label.textContent='PRN indication / reason';
    const reason=dialog.querySelector('[data-mar-reason]');if(reason && !reason.placeholder)reason.placeholder=clean(medOrder.prnReason)||'Document the indication for this PRN dose';
    const save=dialog.querySelector('[data-mar-save]');if(save)save.textContent='Check & Record PRN Dose';
  }

  function scaleMatch(scale,bg) {
    return (Array.isArray(scale)?scale:[]).find(row=>Number.isFinite(Number(row.min))&&Number.isFinite(Number(row.max))&&bg>=Number(row.min)&&bg<=Number(row.max));
  }

  function renderOrderSafety(dialog,medOrder) {
    const box=ensureBox(dialog);const scale=Array.isArray(medOrder.slidingScale)?medOrder.slidingScale:[];
    box.innerHTML=`<div class="spire-mar-safety-title">SPIRE medication safety verification</div>
      ${medOrder.prnReason?`<div class="spire-mar-safety-rule"><b>PRN indication:</b> ${esc(medOrder.prnReason)}</div>`:''}
      ${medOrder.intervalHours?`<div class="spire-mar-safety-rule"><b>Minimum interval:</b> ${esc(medOrder.intervalHours)} hours</div>`:''}
      ${medOrder.maxDosesPer24Hours?`<div class="spire-mar-safety-rule"><b>24-hour limit:</b> ${esc(medOrder.maxDosesPer24Hours)} dose(s)</div>`:''}
      ${medOrder.maxDailyDoseMg?`<div class="spire-mar-safety-rule"><b>Order-defined daily maximum:</b> ${esc(medOrder.maxDailyDoseMg)} mg</div>`:''}
      ${medOrder.linkedOrderGroupId?`<div class="spire-mar-safety-rule"><b>Linked order:</b> ${esc(medOrder.linkedOrderRule?.indication||medOrder.linkedOrderRule?.relation||'shared medication rule')}</div>`:''}
      ${scale.length?`<div class="spire-mar-safety-grid"><label>Current blood glucose<input type="number" min="0" max="2000" step="1" data-spire-bg placeholder="Enter glucose"></label><div class="spire-mar-safety-dose" data-spire-scale-dose>Enter glucose to calculate the ordered scale dose.</div></div>`:''}
      <div class="spire-mar-safety-issues" data-spire-safety-issues></div>`;
    setPrnDialog(dialog,medOrder);
    if(scale.length){
      const bg=box.querySelector('[data-spire-bg]'),dose=box.querySelector('[data-spire-scale-dose]');
      bg.addEventListener('input',()=>{
        const value=Number(bg.value);if(!Number.isFinite(value)){dose.textContent='Enter glucose to calculate the ordered scale dose.';return;}
        const row=scaleMatch(scale,value);if(!row){dose.textContent='No ordered range covers this glucose value — follow notification instructions.';return;}
        dose.textContent=`Ordered scale dose: ${row.dose} ${row.doseUnit||'units'}${row.instruction?` — ${row.instruction}`:''}`;
        const doseInput=dialog.querySelector('[data-mar-dose]');if(doseInput)doseInput.value=`${row.dose} ${row.doseUnit||'units'}`;
      });
    }
  }

  async function enhance(dialog) {
    if(dialog.dataset.spireSafetyEnhanced==='1') return;
    const orderId=clean(dialog.dataset.medicationOrderId);if(!orderId)return;
    dialog.dataset.spireSafetyEnhanced='1';styles();const box=ensureBox(dialog);box.innerHTML='<div class="spire-mar-safety-title">SPIRE medication safety verification</div><div class="spire-mar-safety-checking">Loading the active medication order…</div>';
    try{renderOrderSafety(dialog,await order(orderId));}catch(error){box.innerHTML=`<div class="spire-mar-safety-title">SPIRE medication safety verification</div><div class="spire-mar-safety-issue block">Unable to load the active order for safety verification: ${esc(error.message)}</div>`;}
  }

  function renderIssues(dialog,result) {
    const host=ensureBox(dialog).querySelector('[data-spire-safety-issues]')||ensureBox(dialog);const issues=Array.isArray(result.issues)?result.issues:[];
    const markup=issues.map(issue=>`<div class="spire-mar-safety-issue ${issue.severity==='BLOCK'?'block':'warning'}">${esc(issue.message)}</div>`).join('');
    host.innerHTML=markup || '<div class="spire-mar-safety-rule"><b>Second check passed:</b> no order-defined safety conflicts detected.</div>';
  }

  async function preflight(button,dialog) {
    const orderId=clean(dialog.dataset.medicationOrderId);if(!orderId)throw new Error('Medication order identity is missing from this MAR action.');
    const status=clean(dialog.dataset.status||'GIVEN');const giving=['GIVEN','PRN_GIVEN'].includes(status);
    if(!giving)return {safeToProceed:true,requiresAcknowledgement:false,issues:[]};
    const payload={clientId:patientId(),medicationOrderId:orderId,scheduledFor:clean(dialog.dataset.scheduledFor)||undefined,status,administeredDose:clean(dialog.querySelector('[data-mar-dose]')?.value)||undefined,administeredRoute:clean(dialog.querySelector('[data-mar-route]')?.value)||undefined,prnIndication:clean(dialog.querySelector('[data-mar-reason]')?.value)||undefined};
    const bg=dialog.querySelector('[data-spire-bg]');if(bg&&clean(bg.value)!=='')payload.bloodGlucose=Number(bg.value);
    return api('/api/spire/medication-safety/check',{method:'POST',body:JSON.stringify(payload)});
  }

  function allowOriginalSave(button) {
    button.dataset.spireSafetyApproved='1';button.disabled=false;button.click();
  }

  document.addEventListener('click',async event=>{
    const button=event.target instanceof Element?event.target.closest('[data-mar-save]'):null;if(!button)return;
    const dialog=button.closest('[data-spire-mar-dialog]');if(!dialog||!clean(dialog.dataset.medicationOrderId))return;
    if(button.dataset.spireSafetyApproved==='1'){delete button.dataset.spireSafetyApproved;return;}
    const status=clean(dialog.dataset.status||'GIVEN');if(!['GIVEN','PRN_GIVEN'].includes(status))return;
    event.preventDefault();event.stopImmediatePropagation();
    const oldText=button.textContent;button.disabled=true;button.textContent='Safety check…';
    try{
      const result=await preflight(button,dialog);renderIssues(dialog,result);
      const blocks=(result.issues||[]).some(issue=>issue.severity==='BLOCK');
      if(blocks){button.disabled=false;button.textContent=oldText;return;}
      if(result.requiresAcknowledgement){
        const box=ensureBox(dialog);let review=box.querySelector('[data-spire-safety-review]');if(!review){review=document.createElement('div');review.className='spire-mar-safety-review';review.dataset.spireSafetyReview='1';review.innerHTML='<label><input type="checkbox" data-spire-safety-ack> I reviewed the medication safety warning and confirmed this administration matches the active order.</label><button type="button" data-spire-safety-continue disabled>Continue administration</button>';box.appendChild(review);const ack=review.querySelector('[data-spire-safety-ack]'),go=review.querySelector('[data-spire-safety-continue]');ack.addEventListener('change',()=>go.disabled=!ack.checked);go.addEventListener('click',()=>{review.remove();allowOriginalSave(button);});}
        button.disabled=false;button.textContent=oldText;return;
      }
      allowOriginalSave(button);
    }catch(error){const box=ensureBox(dialog);let host=box.querySelector('[data-spire-safety-issues]');if(!host){host=document.createElement('div');host.dataset.spireSafetyIssues='1';box.appendChild(host);}host.innerHTML=`<div class="spire-mar-safety-issue block">Safety verification could not complete: ${esc(error.message||'Unknown error')}</div>`;button.disabled=false;button.textContent=oldText;}
  },true);

  const observer=new MutationObserver(mutations=>{for(const mutation of mutations){for(const node of mutation.addedNodes){if(!(node instanceof Element))continue;const dialog=node.matches?.('[data-spire-mar-dialog]')?node:node.querySelector?.('[data-spire-mar-dialog]');if(dialog)void enhance(dialog);}}});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.querySelectorAll('[data-spire-mar-dialog]').forEach(dialog=>void enhance(dialog));
})();
