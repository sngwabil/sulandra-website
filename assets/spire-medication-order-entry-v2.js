(() => {
  'use strict';
  // SPIRE_MEDICATION_ORDER_ENTRY_V2
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const HOME_ID_KEY = 'spire:selected-service-home-id';
  const HOME_ENTITY_KEY = 'spire:selected-service-home-entity';
  const PATIENT_KEY = 'spire:patientId';
  const SESSION_KEY = 'sulandra:employee:session';
  const clean = v => String(v ?? '').trim();
  const esc = v => clean(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  const token = () => TOKEN_KEYS.map(k => sessionStorage.getItem(k) || localStorage.getItem(k)).find(Boolean) || '';
  const patientId = () => {
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(String(location.hash || '').replace(/^#/,''));
    return clean(q.get('patientId') || h.get('patient') || sessionStorage.getItem(PATIENT_KEY));
  };
  const homeId = () => clean(new URLSearchParams(location.search).get('spireHome') || sessionStorage.getItem(HOME_ID_KEY) || localStorage.getItem(HOME_ID_KEY));
  const companyId = () => clean(new URLSearchParams(location.search).get('company') || sessionStorage.getItem(HOME_ENTITY_KEY) || sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY));
  function role(){ for(const s of [sessionStorage,localStorage]){try{const p=JSON.parse(s.getItem(SESSION_KEY)||'null');const u=p?.user||p?.session||p;const r=clean(u?.role).toUpperCase();if(r)return r;}catch{}} return ''; }
  function canOrder(){ return new Set(['ADMINISTRATOR','PROGRAM_MANAGER','CEO','DOO','COO','DELEGATING_NURSE','LPN','RN']).has(role()); }

  const FREQUENCIES = {
    ONCE_DAILY:{label:'Once daily',mode:'SCHEDULED',count:1,frequency:'Once daily'},
    BID:{label:'Twice daily (BID)',mode:'SCHEDULED',count:2,frequency:'Twice daily'},
    TID:{label:'Three times daily (TID)',mode:'SCHEDULED',count:3,frequency:'Three times daily'},
    QID:{label:'Four times daily (QID)',mode:'SCHEDULED',count:4,frequency:'Four times daily'},
    EVERY_N_HOURS:{label:'Every N hours',mode:'SCHEDULED',count:1,frequency:'Every N hours'},
    PRN:{label:'As needed (PRN)',mode:'PRN',count:0,frequency:'PRN'},
    DAYS_OF_WEEK:{label:'Only on selected days',mode:'DAYS_OF_WEEK',count:1,frequency:'Selected days'},
    ONE_TIME:{label:'One-time dose',mode:'ONE_TIME',count:1,frequency:'One time'},
    CONTINUOUS:{label:'Continuous',mode:'CONTINUOUS',count:0,frequency:'Continuous'},
    CUSTOM_TIMES:{label:'Custom administration times',mode:'CUSTOM',count:1,frequency:'Custom times'},
  };
  const WEEKDAYS = [['0','Sun'],['1','Mon'],['2','Tue'],['3','Wed'],['4','Thu'],['5','Fri'],['6','Sat']];

  async function api(path, options={}){
    const headers = new Headers(options.headers || {});
    headers.set('Accept','application/json');
    if(options.body!=null && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    if(token()) headers.set('Authorization',`Bearer ${token()}`);
    if(companyId()) headers.set('x-legal-entity-id',companyId());
    if(homeId()) headers.set('x-spire-home-id',homeId());
    const r = await fetch(API+path,{...options,headers,cache:'no-store'});
    const p = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(p.error || p.message || `Request failed (${r.status})`);
    return p.data ?? p;
  }

  let ordersCache = [];
  let editingOrder = null;
  let warningsReviewed = false;

  function styles(){
    if(document.getElementById('spireMedicationOrderEntryStyles')) return;
    const s=document.createElement('style');
    s.id='spireMedicationOrderEntryStyles';
    s.textContent=`
      .spire-med-order-actions{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0}.spire-add-med-order,.spire-manage-med-orders{border:1px solid #0b6e8f;background:#0b728f;color:#fff;border-radius:4px;padding:6px 10px;font-weight:800;cursor:pointer}.spire-manage-med-orders{background:#fff;color:#14546a}.spire-add-med-order:disabled,.spire-manage-med-orders:disabled{opacity:.55;cursor:not-allowed}
      #spireMedicationOrderModal,#spireMedicationManageModal{position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,.52);display:grid;place-items:center;padding:18px}#spireMedicationOrderModal[hidden],#spireMedicationManageModal[hidden]{display:none!important}
      .spire-med-card{width:min(940px,97vw);max-height:94vh;overflow:auto;background:#fff;border:1px solid #8fb3c2;border-radius:7px;box-shadow:0 18px 55px rgba(0,0,0,.3)}.spire-med-card>header{position:sticky;top:0;z-index:3;display:flex;align-items:center;padding:11px 13px;background:#e7f6fb;border-bottom:1px solid #b8d5df;color:#075b78;font-weight:900}.spire-med-card>header button{margin-left:auto;border:1px solid #9ab7c3;background:#fff;border-radius:4px;padding:3px 8px}.spire-med-card form{padding:12px 14px}.spire-med-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.spire-med-full{grid-column:1/-1}.spire-med-card label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:800;color:#34586a}.spire-med-card input,.spire-med-card select,.spire-med-card textarea{border:1px solid #9fbcc8;border-radius:4px;padding:7px 8px;font:inherit;background:#fff;min-width:0}.spire-med-card textarea{min-height:76px}.spire-med-section{grid-column:1/-1;margin-top:4px;border:1px solid #cbdde6;background:#f9fcfe;border-radius:5px;padding:10px}.spire-med-section-title{font-weight:900;color:#0b5f7b;margin-bottom:7px}.spire-med-help{font-size:10px;color:#67808e;font-weight:500}.spire-med-time-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:7px}.spire-med-time-slot{display:flex;flex-direction:column;gap:3px}.spire-med-weekdays{display:flex;gap:5px;flex-wrap:wrap}.spire-med-weekday{display:flex!important;flex-direction:row!important;align-items:center!important;gap:4px!important;border:1px solid #abc5d2;border-radius:4px;padding:5px 7px;background:#fff}.spire-med-inline{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.spire-med-toggle{display:flex!important;flex-direction:row!important;align-items:center!important;gap:7px!important}.spire-med-toggle input{width:auto}.spire-scale-table{width:100%;border-collapse:collapse;margin-top:6px}.spire-scale-table th,.spire-scale-table td{border:1px solid #c9dbe4;padding:4px}.spire-scale-table input{width:100%;box-sizing:border-box}.spire-scale-remove{border:0;background:#fee2e2;color:#991b1b;border-radius:3px;padding:5px 7px}.spire-mini-btn{border:1px solid #7aa8ba;background:#fff;color:#14546a;border-radius:3px;padding:5px 8px;font-weight:800;cursor:pointer}.spire-med-warning-panel{margin-top:10px;padding:9px;border:1px solid #d7a94a;background:#fff7d6;color:#704f05;border-radius:4px}.spire-med-warning-panel.block{border-color:#db7b7b;background:#fff0f0;color:#8b1d1d}.spire-med-warning-panel ul{margin:5px 0 0 17px}.spire-med-status{margin-top:10px;padding:8px 9px;border-radius:4px;background:#eef7fa;color:#4d6d7a}.spire-med-status.error{background:#fff1f2;color:#9f1239;border:1px solid #fecdd3}.spire-med-status.success{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0}.spire-med-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:12px}.spire-med-btn{border:1px solid #0b6e8f;background:#0b728f;color:#fff;border-radius:4px;padding:7px 11px;font-weight:800}.spire-med-btn.secondary{background:#fff;color:#174d60;border-color:#93b8c5}.spire-med-list{padding:12px;display:grid;gap:8px}.spire-med-order-row{border:1px solid #cbdde6;border-left:4px solid #208bb0;border-radius:4px;padding:9px;background:#fff}.spire-med-order-row.held{border-left-color:#d79b2c}.spire-med-order-row.discontinued{border-left-color:#8b99a3;opacity:.78}.spire-med-order-head{display:flex;justify-content:space-between;gap:10px}.spire-med-order-name{font-weight:900;color:#075b78}.spire-med-order-meta{font-size:10px;color:#59717e;margin-top:3px}.spire-med-order-tools{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.spire-med-order-tools button{border:1px solid #8aaebd;background:#fff;color:#174d60;border-radius:3px;padding:4px 7px;font-weight:800;font-size:10px}.spire-med-badge{display:inline-block;border-radius:999px;padding:2px 6px;background:#e8f4f8;color:#0d607e;font-size:9px;font-weight:900}.spire-med-badge.active{background:#dcfce7;color:#166534}.spire-med-badge.held{background:#fef3c7;color:#92400e}.spire-med-badge.discontinued{background:#e5e7eb;color:#4b5563}
      @media(max-width:760px){.spire-med-grid,.spire-med-inline{grid-template-columns:1fr}.spire-med-full,.spire-med-section{grid-column:auto}.spire-med-time-grid{grid-template-columns:repeat(2,minmax(110px,1fr))}}
    `;
    document.head.appendChild(s);
  }

  function panel(){
    const nodes=[...document.querySelectorAll('h1,h2,h3,h4,strong,div,span')];
    const title=nodes.find(n=>clean(n.textContent)==='Active Medication Orders');
    if(!title) return null;
    return {title,panel:title.closest('.spire-kv-card,.summary-card,.card,.panel,section,div') || title.parentElement};
  }

  function option(value,label){return `<option value="${esc(value)}">${esc(label)}</option>`;}
  function routeOptions(){return ['', 'PO','SL','BUCCAL','TOPICAL','TRANSDERMAL','INHALATION','NEBULIZED','SUBCUTANEOUS','INTRAMUSCULAR','INTRAVENOUS','RECTAL','VAGINAL','OPHTHALMIC','OTIC','NASAL','G_TUBE','J_TUBE','OTHER'].map(v=>option(v,v||'Select route')).join('');}
  function frequencyOptions(){return Object.entries(FREQUENCIES).map(([value,cfg])=>option(value,cfg.label)).join('');}
  function orderSourceOptions(){return [['','Select source'],['ELECTRONIC','Electronic / e-prescribed'],['WRITTEN','Written order'],['VERBAL','Verbal order'],['TELEPHONE','Telephone order'],['FAX','Faxed order'],['HOSPITAL_DISCHARGE','Hospital / facility discharge order'],['OTHER','Other']].map(([v,l])=>option(v,l)).join('');}

  function ensureComposer(){
    styles();
    let m=document.getElementById('spireMedicationOrderModal');
    if(m) return m;
    m=document.createElement('div');m.id='spireMedicationOrderModal';m.hidden=true;
    m.innerHTML=`<div class="spire-med-card" role="dialog" aria-modal="true" aria-label="Medication order composer">
      <header><span data-title>Add Medication Order</span><button type="button" data-close aria-label="Close">✕</button></header>
      <form id="spireMedicationOrderForm">
        <div class="spire-med-grid">
          <label class="spire-med-full">Medication name<input name="name" required maxlength="250" placeholder="e.g., Acetaminophen 500 mg tablet"></label>
          <label>Active ingredient <span class="spire-med-help">Used for duplicate/cumulative-dose warnings.</span><input name="activeIngredient" maxlength="250" placeholder="e.g., acetaminophen"></label>
          <label>Route<select name="route" required>${routeOptions()}</select></label>
          <label>Dose as ordered<input name="dose" required maxlength="160" placeholder="e.g., 500 mg or 6 units"></label>
          <div class="spire-med-inline spire-med-full"><label>Numeric dose<input name="doseAmount" type="number" min="0" step="any" placeholder="500"></label><label>Dose unit<select name="doseUnit"><option value="">Select unit</option><option>mg</option><option>mcg</option><option>g</option><option>mL</option><option>units</option><option>tablet(s)</option><option>puff(s)</option><option>drop(s)</option><option>other</option></select></label><label>Order source<select name="orderSource">${orderSourceOptions()}</select></label></div>

          <div class="spire-med-section">
            <div class="spire-med-section-title">Schedule / Frequency</div>
            <div class="spire-med-inline"><label>Frequency<select name="frequencyCode" data-frequency>${frequencyOptions()}</select></label><label data-interval-wrap hidden>Every how many hours?<input name="intervalHours" type="number" min="0.25" max="168" step="0.25"></label><label data-custom-count-wrap hidden>Times per selected day<input name="customCount" type="number" min="1" max="12" value="1"></label></div>
            <div class="spire-med-time-grid" data-time-slots></div>
            <div class="spire-med-weekdays" data-weekdays hidden>${WEEKDAYS.map(([v,l])=>`<label class="spire-med-weekday"><input type="checkbox" name="dayOfWeek" value="${v}">${l}</label>`).join('')}</div>
            <div class="spire-med-inline" data-prn-fields hidden>
              <label>PRN indication / reason<input name="prnReason" maxlength="1000" placeholder="e.g., mild pain, pain score 1–3"></label>
              <label>Minimum hours between doses<input name="prnIntervalHours" type="number" min="0.25" max="168" step="0.25"></label>
              <label>Max doses in 24 hours<input name="maxDosesPer24Hours" type="number" min="1" max="48"></label>
            </div>
            <div class="spire-med-inline"><label>Start date<input name="startDate" type="date" required></label><label>End date<input name="endDate" type="date"></label><label>Maximum total mg / 24h <span class="spire-med-help">Optional; enforce the exact prescriber limit.</span><input name="maxDailyDoseMg" type="number" min="0" step="any"></label></div>
          </div>

          <div class="spire-med-section">
            <label class="spire-med-toggle"><input type="checkbox" data-scale-toggle> Insulin / sliding-scale or other parameter-based dose</label>
            <div data-scale-panel hidden><div class="spire-med-help">Enter the exact ordered ranges. Overlapping ranges are blocked before the order can be saved.</div><table class="spire-scale-table"><thead><tr><th>From</th><th>Through</th><th>Dose</th><th>Unit</th><th>Instruction</th><th></th></tr></thead><tbody data-scale-body></tbody></table><button type="button" class="spire-mini-btn" data-add-scale>+ Add range</button></div>
          </div>

          <div class="spire-med-section">
            <div class="spire-med-section-title">Linked / Alternative Orders</div>
            <div class="spire-med-help">Use this for related choices such as “500 mg for mild pain” versus “1000 mg for severe pain.” SPIRE can enforce a shared interval or shared 24-hour limit across linked alternatives.</div>
            <div class="spire-med-inline"><label>Link to existing order<select name="linkToOrderId" data-linked-order><option value="">Not linked</option></select></label><label>Relationship<select name="linkedRelation"><option value="RELATED">Related</option><option value="ALTERNATIVE_DOSE">Alternative dose / choose one</option><option value="SEQUENTIAL">Sequential</option><option value="SHARED_LIMIT">Shared daily limit</option></select></label><label>Indication / use<input name="linkedIndication" placeholder="e.g., mild pain"></label></div>
            <div class="spire-med-inline"><label>Severity / condition<input name="linkedSeverity" placeholder="e.g., pain score 1–3"></label><label>Shared minimum interval (hours)<input name="sharedMinIntervalHours" type="number" min="0.25" step="0.25"></label><label>Shared max doses / 24h<input name="sharedMaxDosesPer24Hours" type="number" min="1" max="48"></label></div>
          </div>

          <div class="spire-med-section">
            <div class="spire-med-section-title">Prescriber & Administration Details</div>
            <div class="spire-med-inline"><label>Prescriber name<input name="prescriberName" maxlength="250"></label><label>Credentials<input name="prescriberCredentials" maxlength="120" placeholder="MD, DO, NP, PA"></label><label>Order date/time<input name="prescriberOrderDate" type="datetime-local"></label></div>
            <label>Administration details<textarea name="administrationDetails" maxlength="4000" placeholder="Dilution, site rotation, flush instructions, preparation, monitoring, special administration details..."></textarea></label>
            <label>Instructions / parameters<textarea name="instructions" maxlength="8000" placeholder="PRN indication, hold/notify parameters, monitoring requirements, follow-up instructions..."></textarea></label>
            <label>Reason for change <span class="spire-med-help">Required when editing an existing order.</span><input name="changeReason" maxlength="1000"></label>
          </div>
        </div>
        <div id="spireMedicationOrderWarnings"></div>
        <div class="spire-med-status" id="spireMedicationOrderStatus">Saving activates the order and generates the applicable MAR schedule.</div>
        <div class="spire-med-actions"><button type="button" class="spire-med-btn secondary" data-close>Cancel</button><button type="submit" class="spire-med-btn" id="spireMedicationOrderSave">Validate & Activate Order</button></div>
      </form>
    </div>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>m.hidden=true));
    m.addEventListener('click',e=>{if(e.target===m)m.hidden=true;});
    m.querySelector('[data-frequency]').addEventListener('change',()=>{warningsReviewed=false;renderSchedule(m);});
    m.querySelector('[name="customCount"]').addEventListener('input',()=>renderSchedule(m));
    m.querySelector('[data-scale-toggle]').addEventListener('change',e=>{m.querySelector('[data-scale-panel]').hidden=!e.currentTarget.checked;if(e.currentTarget.checked&&!m.querySelector('[data-scale-body]').children.length)addScaleRow(m);});
    m.querySelector('[data-add-scale]').addEventListener('click',()=>addScaleRow(m));
    m.querySelector('form').addEventListener('submit',submitOrder);
    return m;
  }

  function addScaleRow(m, row={}){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><input data-scale-min type="number" step="any" value="${esc(row.min??'')}"></td><td><input data-scale-max type="number" step="any" value="${esc(row.max??'')}"></td><td><input data-scale-dose type="number" min="0" step="any" value="${esc(row.dose??'')}"></td><td><input data-scale-unit value="${esc(row.doseUnit||'units')}"></td><td><input data-scale-instruction value="${esc(row.instruction||'')}"></td><td><button type="button" class="spire-scale-remove">Remove</button></td>`;
    tr.querySelector('button').addEventListener('click',()=>tr.remove());
    m.querySelector('[data-scale-body]').appendChild(tr);
  }

  function timeValues(m){return [...m.querySelectorAll('[data-time-slot]')].map(i=>clean(i.value)).filter(Boolean);}
  function renderSchedule(m, presetTimes){
    const f=m.querySelector('form');
    const code=f.elements.frequencyCode.value;
    const cfg=FREQUENCIES[code]||FREQUENCIES.CUSTOM_TIMES;
    const times=m.querySelector('[data-time-slots]');
    const existing=presetTimes||timeValues(m);
    const prn=code==='PRN';
    const every=code==='EVERY_N_HOURS';
    const days=code==='DAYS_OF_WEEK';
    const custom=code==='CUSTOM_TIMES'||days;
    m.querySelector('[data-prn-fields]').hidden=!prn;
    m.querySelector('[data-interval-wrap]').hidden=!(every||prn);
    m.querySelector('[data-weekdays]').hidden=!days;
    m.querySelector('[data-custom-count-wrap]').hidden=!custom;
    if(prn||code==='CONTINUOUS'){times.replaceChildren();return;}
    let count=cfg.count;
    if(custom)count=Math.max(1,Math.min(12,Number(f.elements.customCount.value||1)));
    times.replaceChildren();
    for(let i=0;i<count;i+=1){
      const wrap=document.createElement('label');wrap.className='spire-med-time-slot';wrap.innerHTML=`Administration time ${i+1}<input type="time" data-time-slot required>`;
      wrap.querySelector('input').value=existing[i]||['08:00','12:00','16:00','20:00'][i]||'08:00';times.appendChild(wrap);
    }
  }

  function slidingScale(m){
    if(!m.querySelector('[data-scale-toggle]').checked)return[];
    return [...m.querySelectorAll('[data-scale-body] tr')].map(tr=>({min:Number(tr.querySelector('[data-scale-min]').value),max:Number(tr.querySelector('[data-scale-max]').value),dose:Number(tr.querySelector('[data-scale-dose]').value),doseUnit:clean(tr.querySelector('[data-scale-unit]').value)||'units',instruction:clean(tr.querySelector('[data-scale-instruction]').value)||undefined})).filter(r=>Number.isFinite(r.min)&&Number.isFinite(r.max)&&Number.isFinite(r.dose));
  }

  function num(value){const n=Number(value);return clean(value)!==''&&Number.isFinite(n)?n:undefined;}
  function isoOrUndefined(value){if(!value)return undefined;const d=new Date(value);return Number.isNaN(d.getTime())?undefined:d.toISOString();}
  function buildPayload(m){
    const f=m.querySelector('form'), code=f.elements.frequencyCode.value, cfg=FREQUENCIES[code]||FREQUENCIES.CUSTOM_TIMES;
    const linkedId=clean(f.elements.linkToOrderId.value);const peer=ordersCache.find(o=>String(o.id)===linkedId);const group=linkedId?(clean(peer?.linkedOrderGroupId)||`LINK-${linkedId}`):undefined;
    const prn=code==='PRN';
    const interval=num(prn?f.elements.prnIntervalHours.value:f.elements.intervalHours.value);
    return {
      clientId:patientId(),name:clean(f.elements.name.value),activeIngredient:clean(f.elements.activeIngredient.value)||undefined,dose:clean(f.elements.dose.value),doseAmount:num(f.elements.doseAmount.value),doseUnit:clean(f.elements.doseUnit.value)||undefined,route:clean(f.elements.route.value),
      scheduleMode:cfg.mode,frequencyCode:code,frequency:everyFrequencyText(code,interval),dueTimes:timeValues(m),intervalHours:interval,
      daysOfWeek:[...m.querySelectorAll('[name="dayOfWeek"]:checked')].map(i=>Number(i.value)),prnReason:prn?clean(f.elements.prnReason.value)||undefined:undefined,maxDosesPer24Hours:num(f.elements.maxDosesPer24Hours.value),maxDailyDoseMg:num(f.elements.maxDailyDoseMg.value),
      startDate:f.elements.startDate.value,endDate:f.elements.endDate.value||undefined,instructions:clean(f.elements.instructions.value)||undefined,administrationDetails:{text:clean(f.elements.administrationDetails.value)||''},holdParameters:[],slidingScale:slidingScale(m),
      linkedOrderGroupId:group,linkedOrderRule:{relation:f.elements.linkedRelation.value,indication:clean(f.elements.linkedIndication.value)||undefined,severity:clean(f.elements.linkedSeverity.value)||undefined,sharedMinIntervalHours:num(f.elements.sharedMinIntervalHours.value),sharedMaxDosesPer24Hours:num(f.elements.sharedMaxDosesPer24Hours.value)},
      prescriberName:clean(f.elements.prescriberName.value)||undefined,prescriberCredentials:clean(f.elements.prescriberCredentials.value)||undefined,prescriberOrderDate:isoOrUndefined(f.elements.prescriberOrderDate.value),orderSource:clean(f.elements.orderSource.value)||undefined,changeReason:clean(f.elements.changeReason.value)||undefined,
      _linkToOrderId:linkedId||undefined,
    };
  }
  function everyFrequencyText(code,interval){if(code==='EVERY_N_HOURS')return `Every ${interval||'?'} hours`;return FREQUENCIES[code]?.frequency||'Custom times';}
  function transportPayload(payload){const copy={...payload};delete copy._linkToOrderId;return copy;}

  function renderIssues(m,issues){
    const host=m.querySelector('#spireMedicationOrderWarnings');host.replaceChildren();if(!issues?.length)return;
    const blocking=issues.some(i=>i.severity==='BLOCK');const box=document.createElement('div');box.className=`spire-med-warning-panel${blocking?' block':''}`;box.innerHTML=`<strong>${blocking?'Order cannot be saved until corrected':'Medication safety review'}</strong><ul>${issues.map(i=>`<li>${esc(i.message)}</li>`).join('')}</ul>${blocking?'':`<label class="spire-med-toggle" style="margin-top:7px"><input type="checkbox" data-review-warnings> I reviewed these warnings and confirmed the order matches the prescriber order.</label>`}`;host.appendChild(box);box.querySelector('[data-review-warnings]')?.addEventListener('change',e=>{warningsReviewed=e.currentTarget.checked;});
  }

  async function submitOrder(e){
    e.preventDefault();const m=document.getElementById('spireMedicationOrderModal'),st=m.querySelector('#spireMedicationOrderStatus'),save=m.querySelector('#spireMedicationOrderSave');const payload=buildPayload(m);
    if(editingOrder&&!payload.changeReason){st.className='spire-med-status error';st.textContent='Enter a reason for the medication order change.';return;}
    save.disabled=true;st.className='spire-med-status';st.textContent='Running order consistency and medication-safety checks…';
    try{
      const validated=await api('/api/spire/medication-orders-v2/validate',{method:'POST',body:JSON.stringify({...transportPayload(payload),...(editingOrder?{orderId:editingOrder.id}:{})})});
      renderIssues(m,validated.issues||[]);const blockers=(validated.issues||[]).some(i=>i.severity==='BLOCK'),warnings=(validated.issues||[]).some(i=>i.severity==='WARNING');
      if(blockers){st.className='spire-med-status error';st.textContent='Correct the blocked order details above before saving.';save.disabled=false;return;}
      if(warnings&&!warningsReviewed){st.className='spire-med-status';st.textContent='Review the safety warnings and check the acknowledgement before saving.';save.disabled=false;return;}
      st.textContent=editingOrder?'Updating order, preserving revision history, and rebuilding future MAR times…':'Activating order and generating the MAR schedule…';
      const path=editingOrder?`/api/spire/medication-orders-v2/${encodeURIComponent(editingOrder.id)}`:'/api/spire/medication-orders-v2';
      const result=await api(path,{method:editingOrder?'PATCH':'POST',body:JSON.stringify(transportPayload(payload))});
      if(payload._linkToOrderId){await ensureLinkedPeer(payload._linkToOrderId,payload.linkedOrderGroupId);}
      st.className='spire-med-status success';st.textContent=editingOrder?'Medication order updated. Past MAR history was preserved; future schedule was regenerated.':'Medication order activated and added to the MAR.';
      editingOrder=result.order||editingOrder;await loadOrders();setTimeout(()=>{m.hidden=true;location.reload();},750);
    }catch(err){st.className='spire-med-status error';st.textContent=err?.message||'Unable to save medication order.';save.disabled=false;}
  }

  function orderToPayload(order,group){return {clientId:patientId(),name:order.name,activeIngredient:order.activeIngredient||undefined,dose:order.dose,doseAmount:order.doseAmount==null?undefined:Number(order.doseAmount),doseUnit:order.doseUnit||undefined,route:order.route,scheduleMode:order.scheduleMode||'SCHEDULED',frequencyCode:order.frequencyCode||'CUSTOM_TIMES',frequency:order.frequency,dueTimes:Array.isArray(order.dueTimes)?order.dueTimes:[],intervalHours:order.intervalHours==null?undefined:Number(order.intervalHours),daysOfWeek:Array.isArray(order.daysOfWeek)?order.daysOfWeek:[],prnReason:order.prnReason||undefined,maxDosesPer24Hours:order.maxDosesPer24Hours==null?undefined:Number(order.maxDosesPer24Hours),maxDailyDoseMg:order.maxDailyDoseMg==null?undefined:Number(order.maxDailyDoseMg),startDate:String(order.startDate).slice(0,10),endDate:order.endDate?String(order.endDate).slice(0,10):undefined,instructions:order.instructions||undefined,administrationDetails:order.administrationDetails||{},holdParameters:Array.isArray(order.holdParameters)?order.holdParameters:[],slidingScale:Array.isArray(order.slidingScale)?order.slidingScale:[],linkedOrderGroupId:group,linkedOrderRule:order.linkedOrderRule||{relation:'RELATED'},prescriberName:order.prescriberName||undefined,prescriberCredentials:order.prescriberCredentials||undefined,prescriberOrderDate:order.prescriberOrderDate||undefined,orderSource:order.orderSource||undefined,changeReason:'Linked with related/alternative medication order'};}
  async function ensureLinkedPeer(id,group){const peer=ordersCache.find(o=>String(o.id)===String(id));if(!peer||clean(peer.linkedOrderGroupId)===group)return;await api(`/api/spire/medication-orders-v2/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(orderToPayload(peer,group))});}

  function localDay(){const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);}
  async function loadOrders(){if(!patientId())return[];ordersCache=await api(`/api/spire/medication-orders-v2/clients/${encodeURIComponent(patientId())}`);return ordersCache;}
  function populateLinked(m,currentId){const select=m.querySelector('[data-linked-order]');select.innerHTML='<option value="">Not linked</option>'+ordersCache.filter(o=>String(o.id)!==String(currentId||'')&&['ACTIVE','HELD'].includes(String(o.status))).map(o=>`<option value="${esc(o.id)}">${esc(o.name)} · ${esc(o.dose)} · ${esc(o.frequency)}</option>`).join('');}

  async function openComposer(order=null){
    if(!patientId()){alert('Open a client chart first.');return;}if(!canOrder()){alert('Medication order entry requires an authorized nurse or administrator role.');return;}
    const m=ensureComposer();await loadOrders();editingOrder=order;warningsReviewed=false;const f=m.querySelector('form');f.reset();m.querySelector('[data-scale-body]').replaceChildren();m.querySelector('[data-scale-toggle]').checked=false;m.querySelector('[data-scale-panel]').hidden=true;m.querySelector('#spireMedicationOrderWarnings').replaceChildren();populateLinked(m,order?.id);
    m.querySelector('[data-title]').textContent=order?'Edit Medication Order':'Add Medication Order';m.querySelector('#spireMedicationOrderSave').textContent=order?'Validate & Save Changes':'Validate & Activate Order';
    f.elements.startDate.value=localDay();f.elements.frequencyCode.value='ONCE_DAILY';renderSchedule(m);
    if(order) fillOrder(m,order);
    m.querySelector('#spireMedicationOrderStatus').className='spire-med-status';m.querySelector('#spireMedicationOrderStatus').textContent=order?'Changes create a new audited order revision; completed MAR history is retained.':'Saving activates the order and generates the applicable MAR schedule.';m.hidden=false;f.elements.name.focus();
  }

  function setValue(el,value){if(el&&value!=null)el.value=String(value);}
  function fillOrder(m,o){const f=m.querySelector('form');['name','activeIngredient','dose','doseUnit','route','frequencyCode','prnReason','prescriberName','prescriberCredentials','orderSource','instructions'].forEach(k=>setValue(f.elements[k],o[k]));setValue(f.elements.doseAmount,o.doseAmount);setValue(f.elements.maxDosesPer24Hours,o.maxDosesPer24Hours);setValue(f.elements.maxDailyDoseMg,o.maxDailyDoseMg);setValue(f.elements.startDate,String(o.startDate||'').slice(0,10));setValue(f.elements.endDate,o.endDate?String(o.endDate).slice(0,10):'');setValue(f.elements.administrationDetails,o.administrationDetails?.text||'');setValue(f.elements.changeReason,'');setValue(f.elements.linkedRelation,o.linkedOrderRule?.relation||'RELATED');setValue(f.elements.linkedIndication,o.linkedOrderRule?.indication||'');setValue(f.elements.linkedSeverity,o.linkedOrderRule?.severity||'');setValue(f.elements.sharedMinIntervalHours,o.linkedOrderRule?.sharedMinIntervalHours||'');setValue(f.elements.sharedMaxDosesPer24Hours,o.linkedOrderRule?.sharedMaxDosesPer24Hours||'');if(o.prescriberOrderDate){const d=new Date(o.prescriberOrderDate);if(!Number.isNaN(d.getTime()))setValue(f.elements.prescriberOrderDate,new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16));}
    if(o.frequencyCode==='PRN')setValue(f.elements.prnIntervalHours,o.intervalHours);else setValue(f.elements.intervalHours,o.intervalHours);if(o.frequencyCode==='CUSTOM_TIMES'||o.frequencyCode==='DAYS_OF_WEEK')setValue(f.elements.customCount,Math.max(1,(o.dueTimes||[]).length));renderSchedule(m,Array.isArray(o.dueTimes)?o.dueTimes:[]);[...m.querySelectorAll('[name="dayOfWeek"]')].forEach(cb=>cb.checked=(o.daysOfWeek||[]).map(Number).includes(Number(cb.value)));
    if(Array.isArray(o.slidingScale)&&o.slidingScale.length){m.querySelector('[data-scale-toggle]').checked=true;m.querySelector('[data-scale-panel]').hidden=false;o.slidingScale.forEach(r=>addScaleRow(m,r));}
  }

  function ensureManageModal(){styles();let m=document.getElementById('spireMedicationManageModal');if(m)return m;m=document.createElement('div');m.id='spireMedicationManageModal';m.hidden=true;m.innerHTML=`<div class="spire-med-card" role="dialog" aria-modal="true"><header>Manage Medication Orders<button type="button" data-close>✕</button></header><div class="spire-med-list" data-order-list></div></div>`;document.body.appendChild(m);m.querySelector('[data-close]').addEventListener('click',()=>m.hidden=true);m.addEventListener('click',e=>{if(e.target===m)m.hidden=true;});return m;}
  async function openManage(){if(!canOrder())return;const m=ensureManageModal();m.hidden=false;m.querySelector('[data-order-list]').innerHTML='<div class="spire-med-status">Loading medication orders…</div>';try{await loadOrders();renderManage(m);}catch(e){m.querySelector('[data-order-list]').innerHTML=`<div class="spire-med-status error">${esc(e.message||'Unable to load orders.')}</div>`;}}
  function renderManage(m){const host=m.querySelector('[data-order-list]');if(!ordersCache.length){host.innerHTML='<div class="spire-med-status">No medication orders found.</div>';return;}host.innerHTML=ordersCache.map(o=>`<div class="spire-med-order-row ${esc(String(o.status||'').toLowerCase())}" data-order-id="${esc(o.id)}"><div class="spire-med-order-head"><div><div class="spire-med-order-name">${esc(o.name)}</div><div class="spire-med-order-meta">${esc(o.dose)} · ${esc(o.route)} · ${esc(o.frequency)}${o.prnReason?` · PRN for ${esc(o.prnReason)}`:''}</div></div><span class="spire-med-badge ${esc(String(o.status||'').toLowerCase())}">${esc(o.status)}</span></div><div class="spire-med-order-tools">${['ACTIVE','HELD'].includes(String(o.status))?'<button data-edit>Edit order</button>':''}${o.status==='ACTIVE'?'<button data-hold>Hold</button>':''}${o.status==='HELD'?'<button data-resume>Resume</button>':''}${['ACTIVE','HELD'].includes(String(o.status))?'<button data-discontinue>Discontinue</button>':''}</div></div>`).join('');host.querySelectorAll('[data-order-id]').forEach(row=>{const o=ordersCache.find(x=>String(x.id)===row.dataset.orderId);row.querySelector('[data-edit]')?.addEventListener('click',()=>{m.hidden=true;openComposer(o);});row.querySelector('[data-hold]')?.addEventListener('click',()=>changeStatus(o,'HELD'));row.querySelector('[data-resume]')?.addEventListener('click',()=>changeStatus(o,'ACTIVE'));row.querySelector('[data-discontinue]')?.addEventListener('click',()=>changeStatus(o,'DISCONTINUED'));});}
  async function changeStatus(order,status){const reason=prompt(`${status==='DISCONTINUED'?'Discontinue':status==='HELD'?'Hold':'Resume'} ${order.name}: enter the reason.`);if(!clean(reason))return;try{await api(`/api/spire/medication-orders-v2/${encodeURIComponent(order.id)}/status`,{method:'POST',body:JSON.stringify({status,reason:clean(reason)})});await loadOrders();renderManage(ensureManageModal());}catch(e){alert(e.message||'Unable to change medication order status.');}}

  function install(){const found=panel();if(!found||!found.panel)return false;if(found.panel.querySelector('[data-spire-med-order-actions]'))return true;styles();const wrap=document.createElement('div');wrap.className='spire-med-order-actions';wrap.dataset.spireMedOrderActions='true';wrap.innerHTML='<button type="button" class="spire-add-med-order" data-spire-add-medication-order>+ Add Medication Order</button><button type="button" class="spire-manage-med-orders" data-spire-manage-medication-orders>Manage Orders</button>';const add=wrap.querySelector('[data-spire-add-medication-order]'),manage=wrap.querySelector('[data-spire-manage-medication-orders]');if(!canOrder()){add.disabled=true;manage.disabled=true;add.title=manage.title='Authorized nurse or administrator role required';}add.addEventListener('click',()=>openComposer());manage.addEventListener('click',openManage);found.title.insertAdjacentElement('afterend',wrap);return true;}
  if(!install()){const o=new MutationObserver(()=>{if(install())o.disconnect();});o.observe(document.documentElement,{childList:true,subtree:true});}
})();
