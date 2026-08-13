(() => {
  'use strict';
  // SPIRE_MAR_TIMELINE_V2
  const clean = (v) => String(v ?? '').trim();
  const esc = (v) => clean(v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asArray = (v) => Array.isArray(v) ? v : [];
  const formatHour = (hour) => `${String(hour).padStart(2,'0')}00`;
  const localDay = (d) => new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  const shortTime = (d) => new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(d);
  const statusClass = (status) => ({GIVEN:'given',REFUSED:'refused',HELD:'held',MISSED:'missed',NOT_AVAILABLE:'notavailable',ERROR:'error',DUE:'due',SCHEDULED:'scheduled'}[clean(status).toUpperCase()] || 'scheduled');

  function styles(){
    if(document.getElementById('spireMarTimelineStyles')) return;
    const s=document.createElement('style');
    s.id='spireMarTimelineStyles';
    s.textContent=`
      #mar-view{padding:8px!important;background:#eef6fb!important}
      .spire-mar-toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#f7fbfe;border:1px solid #9cb5c5;padding:6px 8px;border-radius:4px 4px 0 0}
      .spire-mar-toolbar button,.spire-mar-toolbar input{border:1px solid #91a8b8;background:#fff;border-radius:3px;padding:4px 7px;font:inherit}.spire-mar-toolbar button{cursor:pointer;font-weight:700;color:#174f73}.spire-mar-toolbar .primary{background:#eaf5fb;border-color:#66a4ca}.spire-mar-filter{display:flex;gap:4px;margin-left:6px}.spire-mar-filter button.active{background:#d8ecf8;color:#0b4f73}.spire-mar-legend{margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap}.spire-mar-key{font-size:10px;padding:3px 6px;border-radius:3px;border:1px solid #9aa}.spire-mar-key.given{background:#d9f5b0}.spire-mar-key.due{background:#0c54b8;color:white}.spire-mar-key.held{background:#ffe3a3}.spire-mar-key.refused,.spire-mar-key.missed{background:#ffc9c9}
      .spire-mar-datebar{display:flex;align-items:center;justify-content:space-between;padding:6px 9px;background:#fff;border-left:1px solid #9cb5c5;border-right:1px solid #9cb5c5;border-bottom:1px solid #bacbd6}.spire-mar-datebar strong{color:#425d70}.spire-mar-now{font-weight:800;color:#3079b2}
      .spire-mar-wrap{overflow:auto;border:1px solid #9cb5c5;background:#fff}.spire-mar-table{border-collapse:collapse;min-width:1320px;width:100%;table-layout:fixed}.spire-mar-table th,.spire-mar-table td{border-right:1px solid #c5d5df;border-bottom:1px solid #c5d5df}.spire-mar-table thead th{background:#f3f8fb;color:#486477;height:34px;font-size:10px;font-weight:700;text-align:center}.spire-mar-table .medcol{width:360px;min-width:360px;text-align:left;padding:0;position:sticky;left:0;z-index:4;background:#fff}.spire-mar-table thead .medcol{z-index:6;background:#f3f8fb;padding:0 8px}.spire-mar-med{min-height:86px;padding:9px 12px;background:#fff}.spire-mar-med-name{font-size:12px;font-weight:800;color:#1973b6}.spire-mar-med-line{font-size:11px;color:#324e61;margin-top:2px}.spire-mar-med-sub{font-size:10px;color:#667d8d;margin-top:8px}.spire-mar-med-instruction{font-size:10px;color:#2f4555;margin-top:5px;font-weight:600}.spire-mar-hour{width:72px;min-width:72px;height:86px;background:#edf8fd;position:relative;vertical-align:middle;padding:4px}.spire-mar-hour:nth-child(even){background:#e5f3fa}.spire-mar-event{display:flex;min-height:34px;align-items:center;justify-content:center;text-align:center;border:1px solid #8697a4;border-radius:4px;padding:4px 3px;font-size:9.5px;font-weight:800;line-height:1.15;cursor:pointer;box-shadow:0 1px 1px rgba(0,0,0,.08)}.spire-mar-event.given{background:#dff6a7;border-color:#77a44e;color:#355d18}.spire-mar-event.due{background:#0d55bc;border-color:#083a86;color:#fff}.spire-mar-event.held{background:#ffe5a6;color:#805900}.spire-mar-event.refused,.spire-mar-event.missed,.spire-mar-event.notavailable,.spire-mar-event.error{background:#ffcaca;color:#8b1616}.spire-mar-event.scheduled{background:#f6fbff;color:#314b5d}.spire-mar-event small{display:block;font-size:8.5px;font-weight:600;margin-top:2px}.spire-mar-hour.nowcol{box-shadow:inset 2px 0 #347db5,inset -2px 0 #347db5}.spire-mar-empty{padding:28px;text-align:center;color:#637786;background:#fff}.spire-mar-groupbar{background:#5d6266!important;color:#fff!important;text-align:center!important;font-weight:800!important;height:22px!important}.spire-mar-complete .spire-mar-med,.spire-mar-complete .spire-mar-hour{background:#fff2d9!important}
      @media(max-width:900px){.spire-mar-table .medcol{width:280px;min-width:280px}.spire-mar-med-name{font-size:11px}}
    `;
    document.head.appendChild(s);
  }

  function medicationKey(med){
    return clean(med.medicationOrderId || med.id || med.order?.id || `${med.medicationName||med.name}|${med.dose||med.orderedDose}|${med.route}|${med.frequency}`);
  }

  function normalizeRows(data){
    const byKey=new Map();
    for(const med of asArray(data?.medications || data?.items)){
      const key=medicationKey(med);
      const events=asArray(med.administrations || med.events || med.medicationAdministrationEvents).slice();
      const dueTimes=asArray(med.dueTimes || med.schedule || med.scheduledTimes || med.times).map(clean).filter(Boolean);
      if(!byKey.has(key)) byKey.set(key,{...med,events:[],dueTimes:[]});
      const target=byKey.get(key);
      target.events.push(...events);
      target.dueTimes.push(...dueTimes);
      if(!target.instructions && med.instructions) target.instructions=med.instructions;
    }
    return [...byKey.values()].map((med)=>({
      ...med,
      events:med.events.sort((a,b)=>new Date(a.scheduledFor||a.createdAt)-new Date(b.scheduledFor||b.createdAt)),
      dueTimes:[...new Set(med.dueTimes)].sort(),
    }));
  }

  function eventLabel(event){
    const status=clean(event.status||'SCHEDULED').toUpperCase();
    const at=event.administeredAt ? new Date(event.administeredAt) : event.scheduledFor ? new Date(event.scheduledFor) : null;
    const time=at && !Number.isNaN(at.getTime()) ? shortTime(at) : '';
    if(status==='GIVEN') return `${time ? time+' ' : ''}Given${event.administeredDose ? ' '+clean(event.administeredDose) : ''}`;
    if(status==='DUE') return `${time ? time+' ' : ''}Due`;
    if(status==='SCHEDULED') return `${time ? time+' ' : ''}Scheduled`;
    return `${time ? time+' ' : ''}${status.replaceAll('_',' ')}`;
  }

  function hourOf(event){ const d=new Date(event.scheduledFor||event.administeredAt||event.createdAt||0); return Number.isNaN(d.getTime()) ? -1 : d.getHours(); }
  function idOf(med){ return clean(med.medicationOrderId || med.id || med.order?.id); }
  function nameOf(med){ return clean(med.medicationName || med.name || med.displayName || med.order?.name || 'Medication'); }
  function detailsOf(med){ return [med.dose||med.orderedDose||med.order?.dose, med.route||med.order?.route, med.frequency||med.order?.frequency].filter(Boolean).map(clean).join(' · '); }
  function administrationsForHour(med,hour){ return med.events.filter((e)=>hourOf(e)===hour); }
  function scheduledFallback(med,date,hour){
    return med.events.length ? [] : med.dueTimes.filter((t)=>Number(clean(t).split(':')[0])===hour).map((t)=>({status:'SCHEDULED',scheduledFor:`${date}T${t}:00`,_fallback:true}));
  }
  function filterRows(rows,mode){
    if(mode==='prn') return rows.filter((m)=>/\bprn\b/i.test(clean(m.frequency)+' '+clean(m.instructions)));
    if(mode==='scheduled') return rows.filter((m)=>!/\bprn\b/i.test(clean(m.frequency)+' '+clean(m.instructions)));
    return rows;
  }

  function render(host,data,date){
    if(!host) return;
    styles();
    host.dataset.spireMarTimeline='1';
    const rows=filterRows(normalizeRows(data),host.dataset.marFilter||'all');
    const canAdminister=data?.medicationAdministrationAuthorized!==false;
    const now=new Date(); const sameDay=localDay(now)===date; const nowHour=sameDay?now.getHours():-1;
    const hours=Array.from({length:24},(_,i)=>i);
    const active=rows.filter((m)=>clean(m.status||'ACTIVE').toUpperCase()==='ACTIVE');
    const completed=rows.filter((m)=>clean(m.status||'').toUpperCase()!=='ACTIVE');
    const rowHtml=(med,complete=false)=>`<tr class="${complete?'spire-mar-complete':''}"><td class="medcol"><div class="spire-mar-med"><div class="spire-mar-med-name">${esc(nameOf(med))}</div><div class="spire-mar-med-line">${esc(detailsOf(med))}</div>${med.instructions?`<div class="spire-mar-med-instruction">Admin Instructions: ${esc(med.instructions)}</div>`:''}<div class="spire-mar-med-sub">Ordered Admin Amount: ${esc(med.dose||'—')} ${med.lastAdministeredAt?` · Last Admin: ${esc(new Date(med.lastAdministeredAt).toLocaleString())}`:''}</div></div></td>${hours.map((h)=>{const events=[...administrationsForHour(med,h),...scheduledFallback(med,date,h)];return `<td class="spire-mar-hour ${h===nowHour?'nowcol':''}">${events.map((e)=>`<button type="button" class="spire-mar-event ${statusClass(e.status)}" data-mar-timeline-order="${esc(idOf(med))}" data-mar-timeline-scheduled="${esc(e.scheduledFor||'')}" ${canAdminister?'':'disabled'} title="${esc(e.note||e.reason||'')}">${esc(eventLabel(e))}${e.note||e.reason?`<small>${esc(e.note||e.reason)}</small>`:''}</button>`).join('')}</td>`}).join('')}</tr>`;
    host.innerHTML=`<div class="spire-mar-toolbar"><button type="button" data-mar-prev>◀</button><button type="button" class="primary" data-mar-now>Go to Now</button><input type="date" data-mar-date value="${esc(date)}"><button type="button" data-mar-next>▶</button><div class="spire-mar-filter"><button type="button" data-mar-filter="all" class="${(host.dataset.marFilter||'all')==='all'?'active':''}">All</button><button type="button" data-mar-filter="scheduled" class="${host.dataset.marFilter==='scheduled'?'active':''}">Scheduled</button><button type="button" data-mar-filter="prn" class="${host.dataset.marFilter==='prn'?'active':''}">PRN</button></div><div class="spire-mar-legend"><span class="spire-mar-key given">Given</span><span class="spire-mar-key due">Due</span><span class="spire-mar-key held">Held</span><span class="spire-mar-key refused">Refused/Missed</span></div></div><div class="spire-mar-datebar"><strong>${esc(new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}))}</strong><span class="spire-mar-now">${canAdminister?'Medication administration authorized':'View only / qualification required'}</span></div>${rows.length?`<div class="spire-mar-wrap"><table class="spire-mar-table"><thead><tr><th class="medcol">Medication / Order</th>${hours.map((h)=>`<th>${formatHour(h)}</th>`).join('')}</tr></thead><tbody>${active.map((m)=>rowHtml(m)).join('')}${completed.length?`<tr><td colspan="25" class="spire-mar-groupbar">Completed / Inactive Medications</td></tr>${completed.map((m)=>rowHtml(m,true)).join('')}`:''}</tbody></table></div>`:`<div class="spire-mar-empty"><h3>No medication administration records</h3><p>No medications match this date/filter.</p></div>`}`;
    host.querySelector('[data-mar-prev]')?.addEventListener('click',()=>shift(host,-1));
    host.querySelector('[data-mar-next]')?.addEventListener('click',()=>shift(host,1));
    host.querySelector('[data-mar-now]')?.addEventListener('click',()=>{host.dataset.marDate=localDay(new Date());window.loadMarView?.();});
    host.querySelector('[data-mar-date]')?.addEventListener('change',(e)=>{host.dataset.marDate=e.target.value;window.loadMarView?.();});
    host.querySelectorAll('[data-mar-filter]').forEach((b)=>b.addEventListener('click',()=>{host.dataset.marFilter=b.dataset.marFilter;render(host,data,date);}));
    host.querySelectorAll('[data-mar-timeline-order]').forEach((button)=>button.addEventListener('click',()=>{ if(button.disabled)return; if(typeof window.openMarAction==='function') window.openMarAction(button.dataset.marTimelineOrder,button.dataset.marTimelineScheduled||''); }));
    if(nowHour>=0){setTimeout(()=>host.querySelector('.nowcol')?.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'}),0);}
  }

  function currentData(){ return window.state?.emar || window.state?.mar || {}; }
  function currentDate(host){ return host?.dataset.marDate || localDay(new Date()); }
  function renderCurrent(){
    const host=document.querySelector('#mar-view');
    if(!host || !currentData()) return false;
    render(host,currentData(),currentDate(host));
    return true;
  }
  function shift(host,days){const base=new Date(`${currentDate(host)}T12:00:00`);base.setDate(base.getDate()+days);host.dataset.marDate=localDay(base);if(typeof window.loadMarView==='function') window.loadMarView();setTimeout(renderCurrent,0);}

  function install(){
    const host=document.querySelector('#mar-view'); if(!host) return false;
    const legacyRender=window.renderMar;
    window.renderMar=(target,date)=>render(target || host,currentData(),date || currentDate(host));
    window.__SPIRE_MAR_TIMELINE_INSTALLED=true;
    window.__SPIRE_MAR_TIMELINE_LEGACY_RENDER=legacyRender;

    let internal=false;
    const observer=new MutationObserver(()=>{
      if(internal) return;
      if(host.querySelector('.spire-mar-table')) return;
      if(!host.classList.contains('active')) return;
      internal=true;
      queueMicrotask(()=>{ try{ renderCurrent(); } finally { internal=false; } });
    });
    observer.observe(host,{childList:true,subtree:true});

    document.addEventListener('click',(event)=>{
      const tab=event.target.closest('[data-chart-tab="mar"], .chart-tab');
      if(!tab) return;
      const key=clean(tab.dataset?.chartTab || tab.textContent).toLowerCase();
      if(key==='mar' || key.includes('mar')) setTimeout(renderCurrent,0);
    },true);

    const originalLoad=window.loadMarView;
    if(typeof originalLoad==='function'){
      window.loadMarView=async (...args)=>{
        const result=await originalLoad(...args);
        setTimeout(renderCurrent,0);
        return result;
      };
    }

    if(host.classList.contains('active')) setTimeout(renderCurrent,0);
    return true;
  }

  if(!install()){
    let n=0;
    const timer=setInterval(()=>{ if(install() || ++n>120) clearInterval(timer); },100);
  }
})();
