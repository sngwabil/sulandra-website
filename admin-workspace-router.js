(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const CONTEXT_KEY='sulandra:admin:active-service';
const SERVICES={
 community:{name:'Sulandra Community Living Services',short:'Community Living',icon:'🏠',description:'Residential homes, waiver services, DSP workforce, client supports, ISP implementation and DODD compliance.'},
 homehealth:{name:'Sulandra Home Health Care Services',short:'Home Health Care',icon:'✚',description:'Skilled nursing, home health visits, clinical supervision, care documentation, EVV and healthcare compliance.'},
 nemt:{name:'Sulandra Health Non-Medical Transportation Services',short:'Transportation',icon:'🚐',description:'NEMT clients, drivers, vehicles, dispatch, trip scheduling, maintenance and transportation compliance.'}
};
const SERVICE_TOOLS={
 community:[['Dashboard','dashboard','◈'],['Service Homes','homes','🏘'],['Clients & ISP Records','documents','👤'],['Employees & DSP Workforce','employees','👥'],['Scheduling & Assignments','scheduling','🗓'],['Time & Attendance','time','⏱'],['Medication & MAR Oversight','workspace','💊'],['MUI / UI Management','workspace','⚠'],['EVV Compliance','workspace','📍'],['House Operations','workspace','🛒'],['Onboarding & Applicants','applicants','🧭'],['Job Openings','openings','📣'],['Documents & Compliance','documents','✅'],['Billing & Claims','workspace','💰'],['Reports & Audits','reports','📈'],['Service Settings','settings','⚙']],
 homehealth:[['Dashboard','dashboard','◈'],['Clients & Care Plans','documents','👤'],['Nurses & Home Health Staff','employees','👥'],['Visit Scheduling & Assignments','scheduling','🗓'],['Time & Attendance','time','⏱'],['Clinical Documentation','spire','✦'],['Medication Management','workspace','💊'],['EVV Compliance','workspace','📍'],['Quality Assurance','workspace','📊'],['Incident Management','workspace','⚠'],['Onboarding & Applicants','applicants','🧭'],['Clinical Job Openings','openings','📣'],['Credentials & Compliance','documents','✅'],['Billing & Claims','workspace','💰'],['Reports & Audits','reports','📈'],['Service Settings','settings','⚙']],
 nemt:[['Dashboard','dashboard','◈'],['Clients & Transportation Profiles','documents','👤'],['Drivers & Dispatch Staff','employees','👥'],['Trip Scheduling & Dispatch','scheduling','🗓'],['Driver Time & Attendance','time','⏱'],['Fleet & Vehicle Management','workspace','🚚'],['Route Planning','workspace','🧭'],['Trip Documentation','documents','📁'],['Vehicle Maintenance','workspace','🛠'],['Driver Compliance','documents','✅'],['Incident & Safety Management','workspace','⚠'],['Driver Onboarding','applicants','👥'],['Driver Job Openings','openings','📣'],['Billing & Trip Claims','workspace','💰'],['Transportation Reports','reports','📈'],['Service Settings','settings','⚙']]
};
let originalNav=[];
function installStyles(){
 if($('serviceOperatingSystemStyles'))return;
 const s=document.createElement('style');
 s.id='serviceOperatingSystemStyles';
 s.textContent=`
 #topModuleNav{max-width:none!important;justify-content:center!important;gap:4px!important}.sos-nav-link{display:block;padding:14px 14px;margin:5px 0;border:1px solid transparent;border-radius:9px;background:transparent;color:#26384b;font-weight:850;white-space:nowrap;cursor:pointer;text-decoration:none}.sos-nav-link:hover,.sos-nav-link.active{color:#075b9c;background:#eef6ff;border-color:#cfe4fb}
 #adminInternalWorkspace{scroll-margin-top:calc(var(--ec-panel-top,252px) + 14px)!important}.sos-service-shell{position:relative!important;width:100%;border:1px solid var(--ec-line,#d7e4ef);border-radius:24px;background:var(--ec-surface,#fff);box-shadow:var(--ec-shadow,0 18px 50px rgba(15,36,66,.11));overflow:hidden}.sos-head{position:static!important;top:auto!important;z-index:auto!important;display:block;padding:24px;background:linear-gradient(145deg,var(--ec-soft,#f4f8fb),#fff);border-bottom:1px solid var(--ec-line,#d7e4ef)}.sos-kicker{font-size:12px;font-weight:900;letter-spacing:.11em;text-transform:uppercase;color:var(--ec-accent,#075b9c)}.sos-head h1{margin:6px 0!important;font-size:clamp(28px,4vw,44px)!important;color:#102448!important}.sos-head p{margin:0;max-width:980px;color:#62738b;line-height:1.6}.sos-tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;padding:24px;background:#f7fafc}.sos-tool{display:flex;gap:13px;text-align:left;border:1px solid #d7e4ef;border-radius:16px;background:#fff;padding:17px;min-height:118px;cursor:pointer;box-shadow:0 7px 20px rgba(15,36,66,.06)}.sos-tool:hover{border-color:#5d9dca;transform:translateY(-2px)}.sos-icon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 42px;border-radius:13px;background:#edf5fb;font-size:20px}.sos-tool h3{margin:1px 0 6px;color:#102448;font-size:15px}.sos-tool p{margin:0;color:#62738b;font-size:12px;line-height:1.45}.sos-breadcrumb{padding:12px 24px;background:#0d3154;color:#d9efff;font-size:12px;font-weight:800}.sos-placeholder{padding:30px}.sos-placeholder-card{max-width:900px;margin:auto;border:1px solid #d7e4ef;border-radius:18px;background:#fff;padding:24px}.sos-context-banner{margin-top:14px;padding:12px 14px;border-radius:12px;background:#eaf4fb;color:#075b9c;font-weight:850}.sos-hidden-original-nav{display:none!important}.sos-back{margin-top:16px;border:1px solid #cfe4fb;border-radius:11px;background:#fff;color:#075b9c;padding:10px 14px;font-weight:850;cursor:pointer}
 @media(max-width:900px){.sos-head{padding:18px}.sos-tools{grid-template-columns:1fr;padding:14px}.sos-nav-link{padding:11px 9px;font-size:13px}}
 `;
 document.head.appendChild(s);
}
function captureOriginalNav(){const nav=$('topModuleNav');if(!nav)return;originalNav=Array.from(nav.querySelectorAll('[data-module]')).map(n=>({module:n.dataset.module,node:n}));}
function triggerModule(module){const item=originalNav.find(x=>x.module===module)||{node:document.querySelector(`[data-module="${module}"]`)};if(item.node){item.node.click();applyContextToVisibleModule(module);return true}return false}
function activateOnboarding(panel){triggerModule('onboarding');setTimeout(()=>document.querySelector(`[data-onboarding-panel="${panel}"]`)?.click(),100)}
function service(){const saved=localStorage.getItem(CONTEXT_KEY);return SERVICES[saved]?saved:'community'}
function setService(key){if(!SERVICES[key])return;localStorage.setItem(CONTEXT_KEY,key);renderService(key)}
function host(){let h=$('adminInternalWorkspace');if(!h){h=document.createElement('section');h.id='adminInternalWorkspace';const dashboard=$('module-dashboard')||document.querySelector('main');dashboard?.insertBefore(h,dashboard.firstChild)}h.hidden=false;return h}
function hideCommand(){const c=$('enterpriseCommandCenter');if(c)c.hidden=true;document.querySelectorAll('.module').forEach(m=>{if(m.id!=='module-dashboard')m.classList.remove('active')})}
function toolDescription(label,key){return `Manage ${label.toLowerCase()} for ${SERVICES[key].name}. Records, documents, assignments and reports remain identified with this service.`}
function scrollWorkspaceIntoView(){const h=host();const nav=$('topModuleNav');const offset=(nav?.getBoundingClientRect().bottom||0)+12;const top=window.scrollY+h.getBoundingClientRect().top-offset;window.scrollTo({top:Math.max(0,top),behavior:'smooth'})}
function renderService(key){
 const svc=SERVICES[key]||SERVICES.community;
 hideCommand();
 const h=host();
 document.title=`${svc.name} | Sulandra Admin`;
 h.innerHTML=`<section class="sos-service-shell"><div class="sos-breadcrumb">${esc(svc.name)} Administration</div><header class="sos-head"><div class="sos-kicker">${esc(svc.short)} operating environment</div><h1>${esc(svc.name)}</h1><p>${esc(svc.description)} Every employee profile, schedule, assignment, document, report and workflow opened here carries the ${esc(svc.name)} service context.</p></header><div class="sos-tools">${SERVICE_TOOLS[key].map(([label,target,icon])=>`<button type="button" class="sos-tool" data-sos-target="${esc(target)}" data-sos-label="${esc(label)}"><span class="sos-icon">${icon}</span><span><h3>${esc(svc.name)} — ${esc(label)}</h3><p>${esc(toolDescription(label,key))}</p></span></button>`).join('')}</div></section>`;
 h.querySelectorAll('[data-sos-target]').forEach(b=>b.onclick=()=>openTool(key,b.dataset.sosLabel,b.dataset.sosTarget));
 scrollWorkspaceIntoView();
 syncNav(key);
}
function openTool(key,label,target){const svc=SERVICES[key];if(target==='applicants'){activateOnboarding('applicants');applyContextToVisibleModule('onboarding',svc,label);return}if(target==='openings'){activateOnboarding('openings');applyContextToVisibleModule('onboarding',svc,label);return}if(target==='workspace'){renderPlaceholder(svc,label);return}if(triggerModule(target)){applyContextToVisibleModule(target,svc,label);return}renderPlaceholder(svc,label)}
function renderPlaceholder(svc,label){const key=Object.keys(SERVICES).find(k=>SERVICES[k]===svc)||'community';const h=host();h.innerHTML=`<section class="sos-service-shell"><div class="sos-breadcrumb">${esc(svc.name)} › ${esc(label)}</div><header class="sos-head"><div class="sos-kicker">${esc(svc.short)} management tool</div><h1>${esc(svc.name)} — ${esc(label)}</h1><p>${esc(toolDescription(label,key))}</p><button class="sos-back" type="button" data-back-service>Return to ${esc(svc.short)}</button></header><div class="sos-placeholder"><div class="sos-placeholder-card"><h2>${esc(label)}</h2><p>This dedicated ${esc(svc.name)} workspace is reserved for its live forms, records, approvals and reports. It remains inside the service environment and will not mix records with another Sulandra Health service.</p><div class="sos-context-banner">Active service context: ${esc(svc.name)}</div></div></div></section>`;h.querySelector('[data-back-service]').onclick=()=>renderService(key);scrollWorkspaceIntoView()}
function applyContextToVisibleModule(module,svc=SERVICES[service()],label=''){setTimeout(()=>{const section=$(`module-${module}`);if(!section)return;section.dataset.serviceContext=svc.name;let banner=section.querySelector('.sos-module-context');if(!banner){banner=document.createElement('div');banner.className='sos-context-banner sos-module-context';section.insertBefore(banner,section.firstChild)}banner.textContent=`${svc.name}${label?' — '+label:''}. All records and documents in this view are managed under this service context.`;section.querySelectorAll('h1,h2').forEach((heading,index)=>{if(index===0&&!heading.dataset.sosOriginal){heading.dataset.sosOriginal=heading.textContent;heading.textContent=`${svc.name} — ${heading.textContent}`}})},80)}
function rebuildTopNav(){
 const nav=$('topModuleNav');if(!nav)return;
 nav.innerHTML='';
 const items=[['community','Community Living'],['homehealth','Home Health Care'],['nemt','Transportation']];
 items.forEach(([key,label])=>{const li=document.createElement('li');li.innerHTML=`<button type="button" class="sos-nav-link" data-service-nav="${key}">${label}</button>`;nav.appendChild(li)});
 [['Learning','education-portal.html'],['Sulandra Intranet','intranet.html'],['Employee Portal','employee-portal.html?stay=1&source=admin']].forEach(([label,href])=>{const li=document.createElement('li');li.innerHTML=`<a class="sos-nav-link" href="${href}" target="_blank" rel="noopener">${label}</a>`;nav.appendChild(li)});
 const settings=document.createElement('li');settings.innerHTML='<button type="button" class="sos-nav-link" data-shared-module="settings">Shared Settings</button>';nav.appendChild(settings);
 nav.querySelectorAll('[data-service-nav]').forEach(b=>b.onclick=()=>setService(b.dataset.serviceNav));
 nav.querySelector('[data-shared-module]').onclick=()=>{triggerModule('settings');applyContextToVisibleModule('settings',SERVICES[service()],'Shared Settings')};
 syncNav(service());
}
function syncNav(key){document.querySelectorAll('[data-service-nav]').forEach(b=>b.classList.toggle('active',b.dataset.serviceNav===key))}
function init(){installStyles();captureOriginalNav();rebuildTopNav();renderService(service())}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,100),{once:true});else setTimeout(init,100)
})();