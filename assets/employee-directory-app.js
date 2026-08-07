(()=>{
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mode=document.body.dataset.directoryMode==='leadership'?'leadership':'directory';
  let rows=[];
  const initials=name=>String(name||'Employee').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const roleLabel=role=>String(role||'Employee').replaceAll('_',' ').toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());
  async function api(path){const t=token();if(!t){location.href='/employee-login.html';throw new Error('Authentication required');}const r=await fetch(`${API}${path}`,{headers:{authorization:`Bearer ${t}`}});const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`Request failed (${r.status})`);return p.data||p}
  function render(){const q=(document.getElementById('directorySearch')?.value||'').trim().toLowerCase();const filtered=rows.filter(r=>`${r.displayName||''} ${r.jobTitle||''} ${r.department||''} ${r.role||''} ${r.workEmail||''}`.toLowerCase().includes(q));const grid=document.getElementById('directoryGrid');const status=document.getElementById('directoryStatus');if(status)status.textContent=`${filtered.length} ${mode==='leadership'?'leader':'employee'}${filtered.length===1?'':'s'} shown`;grid.innerHTML=filtered.length?filtered.map(r=>`<article class="card"><div class="avatar">${esc(initials(r.displayName))}</div><h3 style="margin:0 0 4px">${esc(r.displayName||'Employee')}</h3><div class="muted">${esc(r.jobTitle||roleLabel(r.role))}</div>${r.department?`<div class="pill">${esc(r.department)}</div>`:''}${r.workEmail?`<p style="margin:12px 0 0"><a href="mailto:${esc(r.workEmail)}">${esc(r.workEmail)}</a></p>`:''}</article>`).join(''):'<div class="empty">No matching employees were found.</div>'}
  async function load(){try{const data=await api(mode==='leadership'?'/api/employee/leadership':'/api/employee/directory');rows=mode==='leadership'?(data.leaders||[]):(data.employees||[]);render()}catch(e){const status=document.getElementById('directoryStatus');if(status)status.textContent=e.message;}}
  document.getElementById('directorySearch')?.addEventListener('input',render);load();
})();
