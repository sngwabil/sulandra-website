import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masterPath = path.join(root, 'dist-web', 'spire', 'master.html');
const MARKER = 'SPIRE_CANONICAL_MAR_GRID_V4';
const CLINICAL_URL = '/assets/spire-clinical-regression-runtime.js?v=20260816-clinical-regression-2';

const css = `
        /* SPIRE_CANONICAL_MAR_GRID_V4 */
        #mar-view{padding:0!important;overflow:hidden!important;background:#f7f4e7!important}
        #mar-view .spire-mar-grid-shell{height:100%;display:flex;flex-direction:column;background:#f7f4e7;color:#0b2940;overflow:hidden}
        #mar-view .spire-mar-grid-toolbar{min-height:40px;display:flex;align-items:center;gap:6px;padding:5px 9px;background:#edf4f9;border-bottom:1px solid #9db4c8;flex-wrap:wrap}
        #mar-view .spire-mar-grid-toolbar b{font-size:13px;color:#123e5d}
        #mar-view .spire-mar-grid-toolbar input{height:28px;padding:3px 6px;border:1px solid #8aa5bb;background:#fff;border-radius:3px}
        #mar-view .spire-mar-grid-filterbar{display:flex;align-items:center;gap:4px;padding:4px 9px;background:#f7fafc;border-bottom:1px solid #bdccd8;overflow-x:auto}
        #mar-view .spire-mar-grid-filter{border:1px solid #9db4c8;background:#fff;color:#174d70;border-radius:3px;padding:4px 8px;font-weight:700;cursor:pointer;white-space:nowrap;font-size:10px}
        #mar-view .spire-mar-grid-filter.active{background:#145b8d;color:#fff;border-color:#0e4b78}
        #mar-view .spire-mar-grid-legend{display:flex;align-items:center;gap:7px;padding:4px 9px;background:#fff;border-bottom:1px solid #cbd8e2;font-size:10px;flex-wrap:wrap}
        #mar-view .spire-mar-grid-legend span{padding:2px 7px;border-radius:10px;font-weight:700}
        #mar-view .spire-mar-grid-scroll{flex:1;min-height:0;overflow:auto;background:#fff}
        #mar-view .spire-mar-grid-header,#mar-view .spire-mar-grid-row{display:grid;grid-template-columns:300px repeat(12,96px);min-width:1452px;width:max-content}
        #mar-view .spire-mar-grid-header{position:sticky;top:0;z-index:25;background:#dce9f3;border-bottom:2px solid #6e91ab;font-weight:800;color:#173f5c}
        #mar-view .spire-mar-grid-head-med{position:sticky;left:0;z-index:28;background:#dce9f3;border-right:2px solid #7898ae;padding:7px 10px;box-shadow:2px 0 3px rgba(15,23,42,.08)}
        #mar-view .spire-mar-grid-hour{display:flex;align-items:center;justify-content:center;min-height:32px;border-right:1px solid #aebfcd;font-size:10px}
        #mar-view .spire-mar-grid-section{min-width:1452px;width:max-content;padding:4px 10px;background:linear-gradient(#cfe1ee,#bdd5e6);border-top:1px solid #789bb3;border-bottom:1px solid #789bb3;color:#123f61;font-weight:850;position:sticky;left:0;z-index:8;font-size:10px}
        #mar-view .spire-mar-grid-section span{display:inline-flex;min-width:20px;justify-content:center;margin-left:5px;padding:1px 5px;border:1px solid #85a5ba;border-radius:10px;background:#fff;font-size:9px}
        #mar-view .spire-mar-grid-row{min-height:58px;border-bottom:1px solid #c6d3dd;background:#fff}
        #mar-view .spire-mar-grid-row:hover{background:#f6fbff}
        #mar-view .spire-mar-grid-med{position:sticky;left:0;z-index:12;background:#f7fbfe;border-right:2px solid #7f9db2;padding:5px 9px;box-shadow:2px 0 3px rgba(15,23,42,.06)}
        #mar-view .spire-mar-grid-row:hover .spire-mar-grid-med{background:#edf7fd}
        #mar-view .spire-mar-grid-med-name{font-size:11px;font-weight:850;color:#123f61;line-height:1.2}
        #mar-view .spire-mar-grid-med-detail{font-size:9.5px;color:#284d66;margin-top:2px;line-height:1.2}
        #mar-view .spire-mar-grid-med-instructions{font-size:8.5px;color:#657b8c;margin-top:2px;line-height:1.15;white-space:normal}
        #mar-view .spire-mar-grid-med-status{display:inline-block;margin-top:3px;padding:1px 5px;border-radius:8px;background:#e1f3e7;color:#176235;font-size:8px;font-weight:850}
        #mar-view .spire-mar-grid-cell{min-height:58px;padding:3px;border-right:1px solid #d2dde5;background:#fff;display:flex;flex-direction:column;gap:3px;justify-content:center}
        #mar-view .spire-mar-grid-cell:nth-child(even){background:#fbfdff}
        #mar-view .spire-mar-grid-event{border:1px solid #a9bac7;background:#eef3f7;border-radius:3px;padding:3px 4px;font-size:8.5px;line-height:1.12;color:#183b52;min-height:26px}
        #mar-view .spire-mar-grid-event b{display:block;font-size:9.5px;color:#0f3e5f}
        #mar-view .spire-mar-grid-event.given,#mar-view .spire-mar-grid-event.prn_given,#mar-view .spire-mar-grid-event.completed{background:#dcfce7;border-color:#79c891;color:#14532d}
        #mar-view .spire-mar-grid-event.held{background:#f3e8ff;border-color:#c79be8;color:#6b21a8}
        #mar-view .spire-mar-grid-event.refused,#mar-view .spire-mar-grid-event.missed,#mar-view .spire-mar-grid-event.not_given{background:#fee2e2;border-color:#ef9a9a;color:#991b1b}
        #mar-view .spire-mar-grid-event.scheduled,#mar-view .spire-mar-grid-event.due{background:#edf3f8;border-color:#9db2c2;color:#25465c}
        #mar-view .spire-mar-grid-admin{margin-top:2px;width:100%;border:1px solid #2563a4;background:#e9f4ff;color:#064c83;border-radius:2px;padding:2px 3px;font-size:8px;font-weight:800;cursor:pointer}
        #mar-view .spire-mar-grid-admin:hover{background:#d6ebff}
        #mar-view .spire-mar-grid-empty{padding:18px;background:#fff;color:#61788a;font-style:italic}
        #mar-view .spire-mar-grid-prn{font-size:8px;color:#6b7280;font-style:italic}
`;

const replacement = String.raw`  // SPIRE_CANONICAL_MAR_GRID_V4
  function renderMar(host,date) {
    const data = state.emar || {};
    const all = asArray(data.medications || data.items);
    const canAdminister = data.medicationAdministrationAuthorized !== false;
    const filter = host.dataset.marFilter || 'all';
    const hours = Array.from({length:12},(_,index)=>index*2);
    const groups = [['scheduled','Scheduled Medications'],['prn','PRN Medications'],['continuous','Continuous / Infusion Medications'],['one-time','One-Time Medications']];
    const pad = value => String(value).padStart(2,'0');
    const sectionKey = med => {
      const text = [med?.frequency,med?.instructions,med?.order?.frequency,med?.order?.instructions,med?.prnIndication].filter(Boolean).join(' ').toLowerCase();
      if (med?.prnIndication || /\bprn\b|as needed/.test(text)) return 'prn';
      if (/continuous|infusion|drip/.test(text)) return 'continuous';
      if (/\bone[- ]?time\b|\bonce\b|\bstat\b/.test(text)) return 'one-time';
      return 'scheduled';
    };
    const medications = filter === 'all' ? all : all.filter(med=>sectionKey(med)===filter);
    const parseTime = value => { const parsed = new Date(value || ''); return Number.isNaN(parsed.getTime()) ? null : parsed; };
    const itemTime = item => parseTime(item?.scheduledFor || item?.dueAt || item?.administeredAt || item?.documentedAt || item?.createdAt || '');
    const bucket = item => { const parsed = itemTime(item); return parsed ? Math.floor(parsed.getHours()/2)*2 : null; };
    const medItems = med => {
      const documented = asArray(med?.events || med?.administrations || med?.medicationAdministrationEvents).map(event=>({...event,__scheduled:false}));
      const scheduled = asArray(med?.schedule || med?.scheduledTimes || med?.times).map(time=>({status:'SCHEDULED',scheduledFor:normalizeScheduledFor(date,time),__scheduled:true}));
      const documentedKeys = new Set(documented.map(event=>String(event?.scheduledFor || event?.dueAt || '').slice(0,16)).filter(Boolean));
      return [...documented,...scheduled.filter(item=>!documentedKeys.has(String(item.scheduledFor || '').slice(0,16)))];
    };
    const itemHtml = (item,orderId) => {
      const status = String(item?.status || 'SCHEDULED').toUpperCase();
      const parsed = itemTime(item);
      const exact = parsed ? pad(parsed.getHours())+':'+pad(parsed.getMinutes()) : '—';
      const action = item.__scheduled && canAdminister && orderId
        ? '<button type="button" class="spire-mar-grid-admin" data-mar-admin="'+esc(orderId)+'" data-scheduled-for="'+esc(item.scheduledFor||'')+'">Document</button>'
        : '';
      return '<div class="spire-mar-grid-event '+esc(status.toLowerCase())+'" title="'+esc(fmtDateTime(item?.administeredAt || item?.scheduledFor || item?.createdAt || ''))+'"><b>'+esc(exact)+'</b><span>'+esc(status.replaceAll('_',' '))+'</span>'+action+'</div>';
    };
    const rowHtml = med => {
      const id = med?.id || med?.medicationOrderId || med?.order?.id || '';
      const name = medicationName(med);
      const details = [med?.dose || med?.orderedDose || med?.order?.dose,med?.route || med?.order?.route,med?.frequency || med?.order?.frequency].filter(Boolean).join(' • ');
      const instructions = med?.instructions || med?.order?.instructions || med?.prnIndication || '';
      const items = medItems(med);
      const firstCellFallback = !items.length && canAdminister && id
        ? '<div class="spire-mar-grid-prn">No fixed time</div><button type="button" class="spire-mar-grid-admin" data-mar-admin="'+esc(id)+'">Document</button>'
        : '';
      return '<div class="spire-mar-grid-row" data-mar-medication-row="'+esc(id||name)+'" data-med-name="'+esc(name)+'">'+
        '<div class="spire-mar-grid-med"><div class="spire-mar-grid-med-name">'+esc(name)+'</div><div class="spire-mar-grid-med-detail">'+esc(details || 'Order details available')+'</div>'+(instructions?'<div class="spire-mar-grid-med-instructions">'+esc(instructions)+'</div>':'')+'<span class="spire-mar-grid-med-status">'+esc(med?.status || med?.order?.status || 'ACTIVE')+'</span></div>'+
        hours.map(hour=>'<div class="spire-mar-grid-cell" data-mar-hour="'+hour+'">'+items.filter(item=>bucket(item)===hour).map(item=>itemHtml(item,id)).join('')+(hour===0?firstCellFallback:'')+'</div>').join('')+
      '</div>';
    };
    const sections = groups.map(([key,label])=>{
      const rows = medications.filter(med=>sectionKey(med)===key);
      return rows.length ? '<div class="spire-mar-grid-section" data-mar-section="'+key+'">'+esc(label)+' <span>'+rows.length+'</span></div>'+rows.map(rowHtml).join('') : '';
    }).join('');

    host.innerHTML = '<div class="spire-mar-grid-shell">'+
      '<div class="spire-mar-grid-toolbar"><b>MAR / TAR</b><button class="toolbar-action-btn" id="marPrevDay" type="button">◀ Day</button><input type="date" id="marDatePicker" value="'+esc(date)+'"><button class="toolbar-action-btn" id="marNextDay" type="button">Day ▶</button><button class="toolbar-action-btn" id="marTodayBtn" type="button">Today</button><button class="toolbar-action-btn" type="button" data-mar-refresh>Refresh</button><span class="spire-pill '+(canAdminister?'complete':'progress')+'">'+(canAdminister?'Medication administration authorized':'View only / qualification required')+'</span></div>'+
      '<div class="spire-mar-grid-filterbar"><b style="margin-right:4px">View:</b>'+[['all','All'],['scheduled','Scheduled'],['prn','PRN'],['continuous','Continuous'],['one-time','One-Time']].map(([key,label])=>'<button type="button" class="spire-mar-grid-filter '+(filter===key?'active':'')+'" data-mar-filter="'+key+'">'+label+'</button>').join('')+'</div>'+
      '<div class="spire-mar-grid-legend"><b>Legend:</b><span class="legend-given">Given</span><span class="legend-due">Scheduled / Due</span><span class="legend-held">Held</span><span class="legend-refused">Refused / Missed</span><span style="margin-left:auto;color:#5b7183">24-hour timeline — scroll horizontally</span></div>'+
      '<div class="spire-mar-grid-scroll"><div class="spire-mar-grid-header"><div class="spire-mar-grid-head-med">Medication &amp; Order Details</div>'+hours.map(hour=>'<div class="spire-mar-grid-hour">'+pad(hour)+'00</div>').join('')+'</div>'+(sections || '<div class="spire-mar-grid-empty">No active medications match this view for the selected date.</div>')+'</div></div>';

    const changeDate = value => { if (!value) return; host.dataset.marDate = value; loadMarView(); };
    const shiftDate = delta => {
      const parts = String(host.dataset.marDate || date).split('-').map(Number);
      const next = new Date(parts[0],(parts[1]||1)-1,(parts[2]||1)+delta,12,0,0,0);
      changeDate(next.getFullYear()+'-'+pad(next.getMonth()+1)+'-'+pad(next.getDate()));
    };
    $('#marDatePicker',host)?.addEventListener('change',event=>changeDate(event.target.value));
    $('#marPrevDay',host)?.addEventListener('click',()=>shiftDate(-1));
    $('#marNextDay',host)?.addEventListener('click',()=>shiftDate(1));
    $('#marTodayBtn',host)?.addEventListener('click',()=>{const now=new Date();changeDate(now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate()));});
    $('[data-mar-refresh]',host)?.addEventListener('click',loadMarView);
    $$('.spire-mar-grid-filter',host).forEach(button=>button.addEventListener('click',()=>{host.dataset.marFilter=button.dataset.marFilter || 'all';renderMar(host,date);}));
    $$('[data-mar-admin]',host).forEach(button=>button.addEventListener('click',()=>openMarAction(button.dataset.marAdmin,button.dataset.scheduledFor || '')));
  }

`;

function patchMaster(source) {
  let next = source;
  if (!next.includes(MARKER)) {
    const startMatch = /\n\s*function renderMar\(host\s*,\s*date\)\s*\{/.exec(next);
    if (!startMatch) throw new Error('dist-web/spire/master.html: renderMar(host,date) was not found');
    const start = startMatch.index + 1;
    const tail = next.slice(start);
    const endMatch = /\n\s*function renderMedicationCard\(/.exec(tail);
    if (!endMatch) throw new Error('dist-web/spire/master.html: renderMedicationCard boundary was not found after renderMar');
    const end = start + endMatch.index + 1;
    next = next.slice(0,start) + replacement + next.slice(end);

    const styleClose = next.indexOf('</style>');
    if (styleClose < 0) throw new Error('dist-web/spire/master.html: style block was not found');
    next = next.slice(0,styleClose) + css + next.slice(styleClose);
  }

  next = next.replace(/\/assets\/spire-clinical-regression-runtime\.js(?:\?v=[^"']+)?/g,CLINICAL_URL);
  for (const required of [MARKER,'Medication &amp; Order Details','spire-mar-grid-row','data-mar-admin','function renderMedicationCard(','normalizeScheduledFor(date,time)','openMarAction(button.dataset.marAdmin']) {
    if (!next.includes(required)) throw new Error(`Canonical MAR publication missing ${required}`);
  }
  return next;
}

await stat(masterPath);
const original = await readFile(masterPath,'utf8');
const next = patchMaster(original);
if (next !== original) await writeFile(masterPath,next,'utf8');

console.log('SPIRE canonical MAR grid published: one dense 24-hour medication timeline owns MAR presentation; medication names/order details stay fixed on the left, exact scheduled/documented events remain actionable, PRN/continuous/one-time filters are available, and the flowsheet regression helper cannot rewrite MAR.');