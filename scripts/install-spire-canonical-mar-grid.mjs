import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist-web');
const targets = [path.join(root, 'spire', 'master.html'), path.join(dist, 'spire', 'master.html')];
const MARKER = 'SPIRE_CANONICAL_MAR_GRID_V3';
const CLINICAL_URL = '/assets/spire-clinical-regression-runtime.js?v=20260816-clinical-regression-2';

const css = `
        /* SPIRE_CANONICAL_MAR_GRID_V3 */
        #mar-view .spire-mar-grid-shell{height:100%;display:flex;flex-direction:column;background:#f8f4e4;color:#0b2940;overflow:hidden}
        #mar-view .spire-mar-grid-toolbar{min-height:42px;display:flex;align-items:center;gap:7px;padding:6px 10px;background:#edf4f9;border-bottom:1px solid #9db4c8;flex-wrap:wrap}
        #mar-view .spire-mar-grid-toolbar b{font-size:14px;color:#123e5d}
        #mar-view .spire-mar-grid-toolbar input{height:29px;padding:3px 7px;border:1px solid #8aa5bb;background:#fff;border-radius:3px}
        #mar-view .spire-mar-grid-toolbar .spire-action{min-height:29px;padding:4px 9px}
        #mar-view .spire-mar-grid-filterbar{display:flex;align-items:center;gap:5px;padding:5px 10px;background:#f5f8fb;border-bottom:1px solid #b8cad8;overflow-x:auto}
        #mar-view .spire-mar-grid-filter{border:1px solid #9db4c8;background:#fff;color:#174d70;border-radius:3px;padding:4px 8px;font-weight:700;cursor:pointer;white-space:nowrap}
        #mar-view .spire-mar-grid-filter.active{background:#145b8d;color:#fff;border-color:#0e4b78}
        #mar-view .spire-mar-grid-legend{display:flex;align-items:center;gap:7px;padding:5px 10px;background:#fff;border-bottom:1px solid #cbd8e2;font-size:11px;flex-wrap:wrap}
        #mar-view .spire-mar-grid-legend span{padding:2px 7px;border-radius:10px;font-weight:700}
        #mar-view .spire-mar-grid-scroll{flex:1;min-height:0;overflow:auto;background:#fff;border-top:1px solid #b9c9d5}
        #mar-view .spire-mar-grid-header,#mar-view .spire-mar-grid-row{display:grid;grid-template-columns:300px repeat(12,minmax(94px,1fr));min-width:1430px;width:100%}
        #mar-view .spire-mar-grid-header{position:sticky;top:0;z-index:25;background:#dce9f3;border-bottom:2px solid #6e91ab;font-weight:800;color:#173f5c}
        #mar-view .spire-mar-grid-head-med{position:sticky;left:0;z-index:28;background:#dce9f3;border-right:2px solid #7898ae;padding:7px 10px;box-shadow:2px 0 3px rgba(15,23,42,.08)}
        #mar-view .spire-mar-grid-hour{display:flex;align-items:center;justify-content:center;min-height:34px;border-right:1px solid #aebfcd;font-size:11px}
        #mar-view .spire-mar-grid-section{min-width:1430px;width:100%;padding:5px 10px;background:linear-gradient(#cfe1ee,#bdd5e6);border-top:1px solid #789bb3;border-bottom:1px solid #789bb3;color:#123f61;font-weight:850;position:sticky;left:0;z-index:8}
        #mar-view .spire-mar-grid-section span{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:18px;margin-left:6px;padding:0 5px;border:1px solid #85a5ba;border-radius:10px;background:#fff;font-size:10px}
        #mar-view .spire-mar-grid-row{min-height:62px;border-bottom:1px solid #c6d3dd;background:#fff}
        #mar-view .spire-mar-grid-row:hover{background:#f6fbff}
        #mar-view .spire-mar-grid-med{position:sticky;left:0;z-index:12;background:#f7fbfe;border-right:2px solid #7f9db2;padding:6px 9px;box-shadow:2px 0 3px rgba(15,23,42,.06)}
        #mar-view .spire-mar-grid-row:hover .spire-mar-grid-med{background:#edf7fd}
        #mar-view .spire-mar-grid-med-name{font-size:12px;font-weight:850;color:#123f61;line-height:1.25}
        #mar-view .spire-mar-grid-med-detail{font-size:10.5px;color:#284d66;margin-top:2px;line-height:1.25}
        #mar-view .spire-mar-grid-med-instructions{font-size:9.5px;color:#657b8c;margin-top:2px;white-space:normal;line-height:1.2}
        #mar-view .spire-mar-grid-med-status{display:inline-block;margin-top:3px;padding:1px 5px;border-radius:8px;background:#e1f3e7;color:#176235;font-size:9px;font-weight:850}
        #mar-view .spire-mar-grid-cell{min-height:62px;padding:3px;border-right:1px solid #d2dde5;background:#fff;display:flex;flex-direction:column;gap:3px;justify-content:center}
        #mar-view .spire-mar-grid-cell:nth-child(even){background:#fbfdff}
        #mar-view .spire-mar-grid-event{border:1px solid #a9bac7;background:#eef3f7;border-radius:3px;padding:3px 4px;font-size:9.5px;line-height:1.15;color:#183b52;min-height:28px}
        #mar-view .spire-mar-grid-event b{display:block;font-size:10px;color:#0f3e5f}
        #mar-view .spire-mar-grid-event.given{background:#dcfce7;border-color:#79c891;color:#14532d}
        #mar-view .spire-mar-grid-event.held{background:#f3e8ff;border-color:#c79be8;color:#6b21a8}
        #mar-view .spire-mar-grid-event.refused,#mar-view .spire-mar-grid-event.missed{background:#fee2e2;border-color:#ef9a9a;color:#991b1b}
        #mar-view .spire-mar-grid-event.scheduled,#mar-view .spire-mar-grid-event.due{background:#edf3f8;border-color:#9db2c2;color:#25465c}
        #mar-view .spire-mar-grid-admin{margin-top:3px;width:100%;border:1px solid #2563a4;background:#e9f4ff;color:#064c83;border-radius:2px;padding:2px 3px;font-size:9px;font-weight:800;cursor:pointer}
        #mar-view .spire-mar-grid-admin:hover{background:#d6ebff}
        #mar-view .spire-mar-grid-empty{padding:18px;background:#fff;color:#61788a;font-style:italic}
        #mar-view .spire-mar-grid-prn-note{font-size:9px;color:#6b7280;font-style:italic;padding:3px 4px}
`;

const replacement = String.raw`  // SPIRE_CANONICAL_MAR_GRID_V3
  function renderMar(host,date){
    const all=asArray(state.emar.medications);
    const meds=all.filter(m=>medPassesFilter(m,state.marFilter));
    const perm=state.emar.permissions||{};
    const hours=Array.from({length:12},(_,index)=>index*2);
    const groups=[['scheduled','Scheduled Medications'],['prn','PRN Medications'],['continuous','Continuous / Infusion Medications'],['one-time','One-Time Medications']];

    const pad=value=>String(value).padStart(2,'0');
    const eventDate=event=>{
      const value=event?.scheduledFor||event?.dueAt||event?.administeredAt||event?.documentedAt||'';
      const parsed=new Date(value);
      return Number.isNaN(parsed.getTime())?null:parsed;
    };
    const bucket=event=>{
      const parsed=eventDate(event);
      return parsed?Math.floor(parsed.getHours()/2)*2:null;
    };
    const eventHtml=event=>{
      const operationalActionId=event?.actionId||event?.administrationActionId||event?.id||'';
      const status=cleanText(event?.status||'SCHEDULED').toUpperCase();
      const parsed=eventDate(event);
      const exact=parsed?pad(parsed.getHours())+':'+pad(parsed.getMinutes()):cleanText(event?.scheduledTime||event?.time||'');
      const dateLabel=parsed?fmtDate(parsed):'';
      const canAct=Boolean(perm.canAdminister&&operationalActionId&&event?.canAdminister!==false&&!['GIVEN','REFUSED','HELD','MISSED','COMPLETED'].includes(status));
      const admin=canAct?'<button type="button" class="spire-mar-grid-admin spire-mar-admin-btn" data-mar-admin="'+esc(operationalActionId)+'" data-scheduled-for="'+esc(event?.scheduledFor||event?.dueAt||'')+'">Document</button>':'';
      return '<div class="spire-mar-grid-event '+esc(marStatusClass(status))+'" title="'+esc(fmtDateTime(event?.scheduledFor||event?.dueAt||event?.administeredAt||''))+' · '+esc(status)+'"><b>'+esc(exact||'—')+'</b><span>'+esc(status.replaceAll('_',' '))+'</span>'+(dateLabel?'<div style="font-size:8.5px;opacity:.78">'+esc(dateLabel)+'</div>':'')+admin+'</div>';
    };
    const rowHtml=med=>{
      const name=med?.medicationName||med?.name||'Medication';
      const details=[med?.dose,med?.route,med?.frequency].filter(Boolean).join(' • ');
      const instructions=cleanText(med?.instructions||med?.sig||med?.specialInstructions||'');
      const events=asArray(med?.events);
      const medKey=cleanText(med?.orderId||med?.medicationOrderId||med?.id||name);
      return '<div class="spire-mar-grid-row" data-mar-medication-row="'+esc(medKey)+'" data-med-name="'+esc(name)+'">'+
        '<div class="spire-mar-grid-med"><div class="spire-mar-grid-med-name">'+esc(name)+'</div><div class="spire-mar-grid-med-detail">'+esc(details||'Order details available')+'</div>'+(instructions?'<div class="spire-mar-grid-med-instructions">'+esc(instructions)+'</div>':'')+'<span class="spire-mar-grid-med-status">'+esc(med?.status||'ACTIVE')+'</span></div>'+
        hours.map(hour=>{
          const slot=events.filter(event=>bucket(event)===hour);
          const prnNote=!slot.length&&marSectionKeyForMedication(med)==='prn'&&hour===0?'<div class="spire-mar-grid-prn-note">PRN — administer only when indicated and authorized.</div>':'';
          return '<div class="spire-mar-grid-cell" data-mar-hour="'+hour+'">'+(slot.map(eventHtml).join('')||prnNote)+'</div>';
        }).join('')+
      '</div>';
    };
    const sections=groups.map(([key,label])=>{
      const rows=meds.filter(m=>marSectionKeyForMedication(m)===key);
      if(!rows.length)return '';
      return '<div class="spire-mar-grid-section" data-mar-section="'+key+'">'+esc(label)+' <span>'+rows.length+'</span></div>'+rows.map(rowHtml).join('');
    }).join('');

    host.innerHTML='<div class="spire-mar-grid-shell">'+
      '<div class="spire-mar-grid-toolbar"><b>MAR / TAR</b><button class="spire-action" id="marPrevDay" type="button">◀ Day</button><input type="date" id="marDatePicker" value="'+esc(date)+'"><button class="spire-action" id="marNextDay" type="button">Day ▶</button><button class="spire-action" id="marTodayBtn" type="button">Today</button><button class="spire-action" id="marRefreshBtn" type="button">Refresh</button><span class="spire-status-chip '+(perm.canAdminister?'green':'amber')+'">'+(perm.canAdminister?'Medication administration authorized':'View only — administration permission required')+'</span></div>'+
      '<div class="spire-mar-grid-filterbar"><b style="margin-right:4px">View:</b>'+[['all','All'],['scheduled','Scheduled'],['prn','PRN'],['continuous','Continuous'],['one-time','One-Time']].map(([key,label])=>'<button type="button" class="spire-mar-grid-filter '+(state.marFilter===key?'active':'')+'" data-mar-filter="'+key+'">'+label+'</button>').join('')+'</div>'+
      '<div class="spire-mar-grid-legend"><b>Legend:</b><span class="legend-given">Given</span><span class="legend-due">Scheduled / Due</span><span class="legend-held">Held</span><span class="legend-refused">Refused / Missed</span><span style="margin-left:auto;color:#5b7183">Scroll horizontally for the 24-hour timeline</span></div>'+
      '<div class="spire-mar-grid-scroll"><div class="spire-mar-grid-header"><div class="spire-mar-grid-head-med">Medication &amp; Order Details</div>'+hours.map(hour=>'<div class="spire-mar-grid-hour">'+pad(hour)+'00</div>').join('')+'</div>'+(sections||'<div class="spire-mar-grid-empty">No medications match the selected view for this date.</div>')+'</div></div>';

    const setDate=value=>{if(!value)return;state.emar.date=value;loadMarView().catch(error=>showError(host,error));};
    const shiftDate=delta=>{
      const parts=String(state.emar.date||date).split('-').map(Number);
      const next=new Date(parts[0],(parts[1]||1)-1,(parts[2]||1)+delta,12,0,0,0);
      setDate(next.getFullYear()+'-'+pad(next.getMonth()+1)+'-'+pad(next.getDate()));
    };
    $('#marDatePicker',host)?.addEventListener('change',event=>setDate(event.target.value));
    $('#marPrevDay',host)?.addEventListener('click',()=>shiftDate(-1));
    $('#marNextDay',host)?.addEventListener('click',()=>shiftDate(1));
    $('#marTodayBtn',host)?.addEventListener('click',()=>{const now=new Date();setDate(now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate()));});
    $('#marRefreshBtn',host)?.addEventListener('click',()=>loadMarView().catch(error=>showError(host,error)));
    $$('.spire-mar-grid-filter',host).forEach(button=>button.addEventListener('click',()=>{state.marFilter=button.dataset.marFilter||'all';renderMar(host,date);}));
    $$('.spire-mar-admin-btn',host).forEach(button=>button.addEventListener('click',()=>openMarAction(button.dataset.marAdmin,button.dataset.scheduledFor||'')));
  }

`;

function patchMaster(source, label) {
  let next = source;
  if (!next.includes(MARKER)) {
    const start = next.indexOf('  function renderMar(host,date){');
    const end = next.indexOf('  function renderMedicationCard(', start);
    if (start < 0 || end < 0 || end <= start) throw new Error(`${label}: canonical renderMar/renderMedicationCard boundary not found`);
    next = next.slice(0, start) + replacement + next.slice(end);
    const styleClose = next.indexOf('</style>');
    if (styleClose < 0) throw new Error(`${label}: master style block not found`);
    next = next.slice(0, styleClose) + css + next.slice(styleClose);
  }

  // The old regression runtime used to rewrite MAR and observe the entire document.
  // It is now flowsheet-only; force a cache-busted reference anywhere it is published.
  next = next.replace(/\/assets\/spire-clinical-regression-runtime\.js(?:\?v=[^"']+)?/g, CLINICAL_URL);

  for (const required of [
    MARKER,
    'Medication &amp; Order Details',
    'spire-mar-grid-row',
    'data-mar-admin',
    'openMarAction(button.dataset.marAdmin',
    'function renderMedicationCard(',
    'async function loadMarView()',
  ]) {
    if (!next.includes(required)) throw new Error(`${label}: canonical MAR grid missing ${required}`);
  }
  return next;
}

let patched = 0;
for (const target of targets) {
  try { await stat(target); } catch { continue; }
  const original = await readFile(target, 'utf8');
  const next = patchMaster(original, path.relative(root, target));
  if (next !== original) {
    await writeFile(target, next, 'utf8');
    patched += 1;
  }
}
if (!patched) console.log('SPIRE canonical MAR grid already installed.');
else console.log(`SPIRE canonical MAR grid restored in ${patched} master publication(s): dense 24-hour medication timeline, exact event times, preserved administration actions, and no secondary MAR renderer.`);