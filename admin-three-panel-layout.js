(function(){
  'use strict';
  const API='https://sulandra-website-production.up.railway.app';
  const TOKEN_KEY='sulandra:employee:access-token';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const fmt=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});};

  function token(){return sessionStorage.getItem(TOKEN_KEY)||'';}
  async function api(path){
    const r=await fetch(API+path,{cache:'no-store',headers:{Accept:'application/json',Authorization:'Bearer '+token()}});
    const p=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(p.error||p.message||'Unavailable');
    return Object.prototype.hasOwnProperty.call(p,'data')?p.data:p;
  }

  function installStyles(){
    if($('threePanelAdminStyles')) return;
    const s=document.createElement('style');
    s.id='threePanelAdminStyles';
    s.textContent=`
      .ec-command-center,.ec-command-center *{position:relative}.ec-command-center{position:static!important;inset:auto!important;transform:none!important;overflow:visible!important}.ec-command-center .ec-hero{position:static!important;top:auto!important;z-index:auto!important;transform:none!important}
      body.ec-panels-ready{--ec-left-w:310px;--ec-right-w:350px;--ec-panel-top:252px}
      .ec-side-rail{position:fixed;top:var(--ec-panel-top);bottom:14px;z-index:45000;width:var(--ec-left-w);background:rgba(255,255,255,.98);border:1px solid #d7e4ef;box-shadow:0 22px 55px rgba(15,36,66,.18);display:flex;flex-direction:column;overflow:hidden;transition:transform .22s ease;border-radius:0 22px 22px 0}
      .ec-side-rail.right{right:0;width:var(--ec-right-w);border-radius:22px 0 0 22px}.ec-side-rail.left{left:0}
      .ec-side-rail.left.closed{transform:translateX(calc(-100% + 48px))}.ec-side-rail.right.closed{transform:translateX(calc(100% - 48px))}
      .ec-rail-head{flex:0 0 auto;padding:16px 16px 13px;border-bottom:1px solid #d7e4ef;background:linear-gradient(135deg,#0d3154,#075b9c);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px}.ec-rail-head h2{font-size:17px;margin:0}.ec-rail-head small{display:block;color:#cfeeff;margin-top:3px}.ec-rail-toggle{border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;border-radius:10px;width:36px;height:36px;font-size:20px;cursor:pointer}
      .ec-rail-scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px;scrollbar-gutter:stable}.ec-rail-section{margin-bottom:18px}.ec-rail-section-title{font-size:11px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;color:#075b9c;margin:0 0 8px}
      .ec-rail-tool{width:100%;display:flex;align-items:center;gap:10px;text-align:left;border:1px solid #d7e4ef;background:#fff;border-radius:13px;padding:11px;margin:7px 0;cursor:pointer;color:#102448;transition:.15s transform,.15s border-color,.15s box-shadow}.ec-rail-tool:hover{transform:translateX(3px);border-color:#478fc1;box-shadow:0 8px 18px rgba(15,36,66,.1)}.ec-rail-tool .icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:#edf5fb;flex:0 0 34px}.ec-rail-tool strong{font-size:13px;line-height:1.2}.ec-rail-tool span{display:block;font-size:11px;color:#62738b;margin-top:2px}
      .ec-live-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.ec-live-stat{border:1px solid #d7e4ef;border-radius:14px;padding:12px;background:#f7fbfe}.ec-live-stat strong{display:block;font-size:23px;color:#0d3154}.ec-live-stat span{font-size:11px;color:#62738b}.ec-feed-item{border:1px solid #d7e4ef;border-radius:13px;padding:11px;margin:8px 0;background:#fff}.ec-feed-item strong{display:block;font-size:13px;color:#102448}.ec-feed-item p{margin:5px 0 0;color:#62738b;font-size:12px;line-height:1.45}.ec-feed-time{font-size:10px;color:#7a8da3;margin-top:6px}.ec-weather{border-radius:16px;padding:15px;background:linear-gradient(145deg,#dff3ff,#fff8dc);border:1px solid #cfe2ed}.ec-weather-main{display:flex;align-items:center;justify-content:space-between}.ec-weather-temp{font-size:34px;font-weight:900;color:#0d3154}.ec-weather small{color:#62738b}.ec-rail-refresh{width:100%;border:0;border-radius:12px;padding:11px;background:#075b9c;color:#fff;font-weight:850;cursor:pointer;margin-top:8px}
      .ec-rail-handle{display:none;position:fixed;top:54%;z-index:45100;border:0;background:#075b9c;color:#fff;padding:12px 8px;font-weight:900;writing-mode:vertical-rl;border-radius:0 12px 12px 0;cursor:pointer}.ec-rail-handle.right{right:0;border-radius:12px 0 0 12px}.ec-rail-handle.left{left:0}
      body.ec-left-open main,body.ec-left-open .main-content{margin-left:calc(var(--ec-left-w) + 14px)!important}body.ec-right-open main,body.ec-right-open .main-content{margin-right:calc(var(--ec-right-w) + 14px)!important}
      body.ec-left-open.ec-right-open main,body.ec-left-open.ec-right-open .main-content{max-width:none!important}
      body[data-ec-theme='midnight'] .ec-side-rail{background:#10283d;border-color:#29445d}.ec-side-rail .ec-rail-tool{font-family:inherit}
      @media(max-width:1280px){body.ec-panels-ready{--ec-left-w:285px;--ec-right-w:325px}body.ec-left-open main,body.ec-left-open .main-content{margin-left:0!important}body.ec-right-open main,body.ec-right-open .main-content{margin-right:0!important}.ec-side-rail{top:190px}.ec-rail-handle{display:block}}
      @media(max-width:760px){body.ec-panels-ready{--ec-left-w:min(88vw,340px);--ec-right-w:min(92vw,360px)}.ec-side-rail{top:145px;bottom:8px}.ec-side-rail.left,.ec-side-rail.right{border-radius:18px}.ec-command-center{padding:14px!important}.ec-command-center .ec-hero{display:block!important}}
    `;
    document.head.appendChild(s);
  }

  function findToolButtons(){return Array.from(document.querySelectorAll('.ec-command-center .ec-tool'));}
  function toolGroups(){
    return Array.from(document.querySelectorAll('.ec-command-center .ec-section')).map(section=>({
      title:section.querySelector('h2')?.textContent?.trim()||'Enterprise Tools',
      buttons:Array.from(section.querySelectorAll('.ec-tool'))
    })).filter(g=>g.buttons.length);
  }

  function buildLeftRail(){
    if($('enterpriseOperationsRail')) return;
    const rail=document.createElement('aside');rail.id='enterpriseOperationsRail';rail.className='ec-side-rail left';rail.innerHTML=`<header class="ec-rail-head"><div><h2>Operations</h2><small>Parent company tools</small></div><button class="ec-rail-toggle" type="button" aria-label="Collapse Operations">‹</button></header><div class="ec-rail-scroll"></div>`;
    const scroll=rail.querySelector('.ec-rail-scroll');
    toolGroups().forEach(group=>{
      const section=document.createElement('section');section.className='ec-rail-section';section.innerHTML=`<h3 class="ec-rail-section-title">${esc(group.title)}</h3>`;
      group.buttons.forEach(original=>{
        const title=original.querySelector('h3')?.textContent?.trim()||'Tool';const desc=original.querySelector('p')?.textContent?.trim()||'';const icon=original.querySelector('.ec-icon')?.textContent?.trim()||'•';
        const b=document.createElement('button');b.className='ec-rail-tool';b.type='button';b.innerHTML=`<span class="icon">${esc(icon)}</span><span><strong>${esc(title)}</strong><span>${esc(desc.slice(0,72))}</span></span>`;b.onclick=()=>original.click();section.appendChild(b);
      });scroll.appendChild(section);
    });
    document.body.appendChild(rail);
    const handle=document.createElement('button');handle.className='ec-rail-handle left';handle.textContent='Operations';handle.type='button';document.body.appendChild(handle);
    const toggle=()=>{rail.classList.toggle('closed');document.body.classList.toggle('ec-left-open',!rail.classList.contains('closed'));rail.querySelector('.ec-rail-toggle').textContent=rail.classList.contains('closed')?'›':'‹';};
    rail.querySelector('.ec-rail-toggle').onclick=toggle;handle.onclick=toggle;document.body.classList.add('ec-left-open');
  }

  function buildRightRail(){
    if($('enterpriseLiveRail')) return;
    const rail=document.createElement('aside');rail.id='enterpriseLiveRail';rail.className='ec-side-rail right';rail.innerHTML=`<header class="ec-rail-head"><div><h2>Live Activity</h2><small>System-wide operational pulse</small></div><button class="ec-rail-toggle" type="button" aria-label="Collapse Live Activity">›</button></header><div class="ec-rail-scroll"><section class="ec-rail-section"><h3 class="ec-rail-section-title">Live workforce</h3><div id="liveStats" class="ec-live-grid"><div class="ec-live-stat"><strong>—</strong><span>Clocked in</span></div><div class="ec-live-stat"><strong>—</strong><span>Active employees</span></div><div class="ec-live-stat"><strong>—</strong><span>Open applicants</span></div><div class="ec-live-stat"><strong>—</strong><span>Upcoming interviews</span></div></div></section><section class="ec-rail-section"><h3 class="ec-rail-section-title">Dayton weather</h3><div id="liveWeather" class="ec-weather"><small>Loading live weather…</small></div></section><section class="ec-rail-section"><h3 class="ec-rail-section-title">New messages & updates</h3><div id="liveMessages"><div class="ec-feed-item"><p>Loading activity…</p></div></div></section><section class="ec-rail-section"><h3 class="ec-rail-section-title">Upcoming appointments</h3><div id="liveAppointments"><div class="ec-feed-item"><p>Loading schedule…</p></div></div></section><button id="liveActivityRefresh" class="ec-rail-refresh" type="button">Refresh live activity</button></div>`;
    document.body.appendChild(rail);
    const handle=document.createElement('button');handle.className='ec-rail-handle right';handle.textContent='Live Activity';handle.type='button';document.body.appendChild(handle);
    const toggle=()=>{rail.classList.toggle('closed');document.body.classList.toggle('ec-right-open',!rail.classList.contains('closed'));rail.querySelector('.ec-rail-toggle').textContent=rail.classList.contains('closed')?'‹':'›';};
    rail.querySelector('.ec-rail-toggle').onclick=toggle;handle.onclick=toggle;document.body.classList.add('ec-right-open');$('liveActivityRefresh').onclick=loadLiveActivity;
  }

  async function loadWeather(){
    const target=$('liveWeather');if(!target)return;
    try{
      const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude=39.7589&longitude=-84.1916&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York',{cache:'no-store'});const p=await r.json();const c=p.current||{};const labels={0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Cloudy',45:'Fog',48:'Fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',80:'Rain showers',81:'Rain showers',82:'Heavy showers',95:'Thunderstorms'};target.innerHTML=`<div class="ec-weather-main"><div><div class="ec-weather-temp">${Math.round(c.temperature_2m)}°F</div><strong>${esc(labels[c.weather_code]||'Current conditions')}</strong></div><div style="font-size:38px">${c.weather_code>=95?'⛈':c.weather_code>=71?'❄️':c.weather_code>=51?'🌧️':c.weather_code>=2?'☁️':'☀️'}</div></div><small>Feels like ${Math.round(c.apparent_temperature)}°F · Wind ${Math.round(c.wind_speed_10m)} mph · Dayton, Ohio</small>`;
    }catch{target.innerHTML='<small>Weather temporarily unavailable.</small>';}
  }

  async function loadLiveActivity(){
    const btn=$('liveActivityRefresh');if(btn){btn.disabled=true;btn.textContent='Refreshing…';}
    const results=await Promise.allSettled([api('/api/admin/dashboard'),api('/api/admin/applications?limit=40'),api('/api/admin/interview-slots')]);
    const dash=results[0].status==='fulfilled'?(results[0].value||{}):{};const apps=results[1].status==='fulfilled'?(Array.isArray(results[1].value)?results[1].value:[]):[];const slotsPayload=results[2].status==='fulfilled'?(results[2].value||{}):{};const slots=Array.isArray(slotsPayload)?slotsPayload:(slotsPayload.slots||[]);
    const openApps=apps.filter(a=>!['POSITION_FILLED','NOT_SELECTED','WITHDRAWN','HIRED'].includes(String(a.workflowStatus||a.status||'').toUpperCase()));const upcoming=slots.filter(s=>new Date(s.startsAt)>new Date()).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));
    const clocked=dash.clockedIn??dash.clockedInEmployees??dash.data?.clockedIn??'—';const employees=dash.staff??dash.employees??dash.data?.staff??'—';
    $('liveStats').innerHTML=`<div class="ec-live-stat"><strong>${esc(clocked)}</strong><span>Clocked in</span></div><div class="ec-live-stat"><strong>${esc(employees)}</strong><span>Active employees</span></div><div class="ec-live-stat"><strong>${openApps.length}</strong><span>Open applicants</span></div><div class="ec-live-stat"><strong>${upcoming.filter(s=>String(s.status).toUpperCase()==='BOOKED').length}</strong><span>Upcoming interviews</span></div>`;
    const activity=apps.slice().sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt)).slice(0,7);$('liveMessages').innerHTML=activity.length?activity.map(a=>`<div class="ec-feed-item"><strong>${esc([a.firstName,a.lastName].filter(Boolean).join(' ')||'Applicant update')}</strong><p>${esc(a.jobTitle||a.appliedRole||'Application')} · ${esc(String(a.workflowStatus||a.status||'Updated').replaceAll('_',' '))}</p><div class="ec-feed-time">${fmt(a.updatedAt||a.createdAt)}</div></div>`).join(''):'<div class="ec-feed-item"><p>No new system updates.</p></div>';
    $('liveAppointments').innerHTML=upcoming.slice(0,8).map(s=>`<div class="ec-feed-item"><strong>${esc(s.bookedFirstName?`${s.bookedFirstName} ${s.bookedLastName||''}`:'Available interview slot')}</strong><p>${fmt(s.startsAt)} · ${esc(String(s.mode||'IN_PERSON').replaceAll('_',' '))}</p><div class="ec-feed-time">${esc(s.locationOrLink||'Location in invitation')}</div></div>`).join('')||'<div class="ec-feed-item"><p>No upcoming appointments.</p></div>';
    loadWeather();if(btn){btn.disabled=false;btn.textContent='Refresh live activity';}
  }

  function init(){
    installStyles();document.body.classList.add('ec-panels-ready');
    const ready=()=>{if(!document.querySelector('.ec-command-center'))return false;buildLeftRail();buildRightRail();loadLiveActivity();setInterval(()=>{if(!document.hidden)loadLiveActivity();},60000);return true;};
    if(!ready()){const observer=new MutationObserver(()=>{if(ready())observer.disconnect();});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),15000);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();