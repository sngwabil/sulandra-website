(function(){
  'use strict';
  const KEY='sulandra:admin:future-services';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
  const write=items=>localStorage.setItem(KEY,JSON.stringify(items));
  const label=node=>(node.querySelector('h3,strong')?.textContent||node.textContent||'').trim().replace(/\s+/g,' ');

  function show(){
    const host=$('adminInternalWorkspace'),center=$('enterpriseCommandCenter'),body=$('aiwBody');
    if(!host||!body)return;
    if(center)center.hidden=true;host.hidden=false;
    $('aiwTitle').textContent='Add & Route New Service';
    $('aiwDescription').textContent='Provision a future Sulandra Health subsidiary or service line without leaving the administration workspace.';
    render();host.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function render(){
    const body=$('aiwBody'),items=read();if(!body)return;
    body.innerHTML=`<div class="aiw-grid"><article class="aiw-card" style="grid-column:1/-1"><h3>Create service route</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px"><label>Service name<input id="aiwServiceName" maxlength="120" placeholder="Sulandra Behavioral Health Services" style="display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #d7e4ef;border-radius:10px"></label><label>Route to<select id="aiwServiceRoute" style="display:block;width:100%;margin-top:6px;padding:11px;border:1px solid #d7e4ef;border-radius:10px"><option value="dashboard">Executive Dashboard</option><option value="homes">Service Homes</option><option value="employees">Employees</option><option value="scheduling">Scheduling</option><option value="documents">Documents & Compliance</option><option value="reports">Reports</option><option value="settings">Settings</option></select></label><label style="grid-column:1/-1">Description<textarea id="aiwServiceDescription" maxlength="500" style="display:block;width:100%;min-height:100px;margin-top:6px;padding:11px;border:1px solid #d7e4ef;border-radius:10px"></textarea></label></div><button id="aiwAddService" class="aiw-action primary" type="button">Add Service</button></article>${items.map((item,index)=>`<article class="aiw-card"><h3>${esc(item.name)}</h3><p>${esc(item.description||'Future Sulandra Health service line')}</p><p style="margin-top:8px"><strong>Route:</strong> ${esc(item.route)}</p><button class="aiw-action" type="button" data-aiw-remove="${index}">Remove</button></article>`).join('')||'<article class="aiw-card"><h3>No future services yet</h3><p>Create the next service line using the form above.</p></article>'}</div>`;
    $('aiwAddService').onclick=()=>{const name=$('aiwServiceName').value.trim();if(!name){$('aiwServiceName').focus();return}const items=read();items.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name,description:$('aiwServiceDescription').value.trim(),route:$('aiwServiceRoute').value});write(items);render();document.getElementById('ecFutureServicesGrid')?.dispatchEvent(new Event('refresh'));};
    body.querySelectorAll('[data-aiw-remove]').forEach(button=>button.onclick=()=>{write(read().filter((_,i)=>i!==Number(button.dataset.aiwRemove)));render();});
  }

  document.addEventListener('click',event=>{const node=event.target.closest('.ec-tool,.ec-rail-tool');if(!node||label(node)!=='Add & Route New Service')return;event.preventDefault();event.stopImmediatePropagation();show();},true);
})();