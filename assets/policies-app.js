(()=>{
  'use strict';
  const API=window.SULANDRA_API_BASE||'https://sulandra-website-production-5fc4.up.railway.app';
  const BOOKMARK_KEY='sulandra:policy-bookmarks';
  const RECENT_KEY='sulandra:policy-recent';
  const state={policies:[],view:'all',categories:[],enterpriseOwner:false,selectedEntity:null,busy:false};
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||sessionStorage.getItem('sulandra:admin:access-token')||localStorage.getItem('sulandra:admin:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';
  const storageSet=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
  const storageGet=(key)=>{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch{return[]}};
  const bookmarks=()=>new Set(storageGet(BOOKMARK_KEY));
  const recent=()=>storageGet(RECENT_KEY);
  const fmtDate=value=>{if(!value)return'—';const date=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(date.getTime())?String(value):date.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})};
  function notice(message,error=false){const node=$('notice');node.textContent=message;node.style.background=error?'#ffe9ec':'#edf8f1';node.style.borderColor=error?'#e8a9b2':'#a4d2b2';node.style.color=error?'#8b202d':'#285c37';node.classList.add('show');clearTimeout(notice.timer);notice.timer=setTimeout(()=>node.classList.remove('show'),6500)}
  async function api(path,options={}){
    const headers=new Headers(options.headers||{});
    headers.set('Accept',options.accept||'application/json');
    if(token()&&!headers.has('Authorization'))headers.set('Authorization',`Bearer ${token()}`);
    if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
    const response=await fetch(/^https?:/i.test(path)?path:API+path,{...options,headers,cache:'no-store'});
    if(options.raw)return response;
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||payload.message||`Request failed (${response.status})`);
    return payload.data??payload;
  }
  function currentContext(){return window.SulandraEntityContext?.get?.()||null}
  function syncContext(){const ctx=currentContext();state.enterpriseOwner=ctx?.enterpriseOwner===true;state.selectedEntity=ctx?.selectedEntity||null;$('companyFilter').querySelector('option[value="ALL"]').disabled=!state.enterpriseOwner;$('scopeChip').textContent=state.selectedEntity?`Enterprise + ${state.selectedEntity.displayName||state.selectedEntity.legalName||state.selectedEntity.code}`:'Enterprise + selected company'}
  function categoryOptions(){const select=$('categoryFilter');const selected=select.value;select.innerHTML='<option value="">All categories</option>'+state.categories.map(category=>`<option value="${esc(category)}">${esc(category)}</option>`).join('');if(state.categories.includes(selected))select.value=selected}
  function activeRows(){
    const marks=bookmarks();const recentIds=recent();
    if(state.view==='bookmarks')return state.policies.filter(row=>marks.has(row.id));
    if(state.view==='recent')return recentIds.map(id=>state.policies.find(row=>row.id===id)).filter(Boolean);
    return state.policies;
  }
  function render(){
    const rows=activeRows();const marks=bookmarks();
    $('resultTitle').textContent=state.view==='bookmarks'?'Bookmarked policies':state.view==='recent'?'Recently opened policies':'Published policies';
    $('resultCount').textContent=`${rows.length} polic${rows.length===1?'y':'ies'}`;
    if(!rows.length){
      const copy=state.view==='bookmarks'?'Bookmark a policy to keep it here.':state.view==='recent'?'Policies you open will appear here.':'No published policies match this search yet.';
      $('policies').innerHTML=`<div class="empty"><strong>${esc(copy)}</strong><span>${state.view==='all'?'Policy drafts stay out of this library until they are reviewed and published.':''}</span></div>`;return;
    }
    $('policies').innerHTML=rows.map(row=>`<article class="policy-row" data-policy="${esc(row.id)}"><div><div class="policy-code">${esc(row.policyCode)} · v${esc(row.versionNumber)}</div><h3>${esc(row.title)}</h3><p>${esc(row.summary||row.objective||'Published Sulandra policy')}</p><div class="meta"><span class="badge ${row.scopeType==='ENTERPRISE'?'enterprise':''}">${esc(row.scopeType==='ENTERPRISE'?'All Sulandra companies':(row.legalEntityName||'Company policy'))}</span><span class="badge">${esc(row.category)}</span>${row.responsibleDepartment?`<span class="badge">${esc(row.responsibleDepartment)}</span>`:''}<span class="badge">Effective ${esc(fmtDate(row.effectiveDate))}</span></div></div><div class="row-actions"><button type="button" data-bookmark="${esc(row.id)}" title="Bookmark policy">${marks.has(row.id)?'★':'☆'}</button><button type="button" class="primary" data-open="${esc(row.id)}">Read policy</button><a href="${esc(row.pdfUrl)}" target="_blank" rel="noopener">PDF</a><button type="button" data-ask="${esc(row.id)}" data-title="${esc(row.title)}">Ask SIA</button></div></article>`).join('');
    document.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>openPolicy(button.dataset.open)));
    document.querySelectorAll('[data-bookmark]').forEach(button=>button.addEventListener('click',()=>toggleBookmark(button.dataset.bookmark)));
    document.querySelectorAll('[data-ask]').forEach(button=>button.addEventListener('click',()=>askSia(`Explain the Sulandra policy “${button.dataset.title}” and give me the link to its PDF.`)));
  }
  function toggleBookmark(id){const marks=bookmarks();marks.has(id)?marks.delete(id):marks.add(id);storageSet(BOOKMARK_KEY,[...marks]);render()}
  function remember(id){const ids=recent().filter(value=>value!==id);ids.unshift(id);storageSet(RECENT_KEY,ids.slice(0,30))}
  function docSection(label,value){return value?`<section class="doc-section"><h3>${esc(label)}</h3><div class="doc-text">${esc(value)}</div></section>`:''}
  async function openPolicy(id){
    try{
      const data=await api(`/api/policies/${encodeURIComponent(id)}`);const row=data.policy;remember(id);
      const revisions=Array.isArray(data.revisions)?data.revisions:[];
      $('detail').innerHTML=`<article class="document"><div class="doc-head"><div class="doc-brand"><strong>Sulandra Health</strong><span>${esc(row.scopeType==='ENTERPRISE'?'Enterprise Policy':(row.legalEntityName||'Company Policy'))}</span></div><div class="doc-grid"><div class="label">Policy Code</div><div>${esc(row.policyCode)}</div><div>Version ${esc(row.versionNumber)}</div><div class="label">Title</div><div>${esc(row.title)}</div><div>Effective ${esc(fmtDate(row.effectiveDate))}</div><div class="label">Responsible Dept.</div><div>${esc(row.responsibleDepartment||'—')}</div><div>Review ${esc(fmtDate(row.reviewDate))}</div></div></div>${docSection('OBJECTIVE / PURPOSE',row.objective)}${docSection('SCOPE',row.scopeText)}${docSection('DEFINITIONS',row.definitionsText)}${docSection('POLICY',row.policyText)}${docSection('PROCEDURES',row.proceduresText)}${docSection('RESPONSIBILITIES',row.responsibilitiesText)}${docSection('DOCUMENTATION & RECORDS',row.documentationText)}${docSection('COMPLIANCE & MONITORING',row.complianceText)}${docSection('REFERENCES',row.referencesText)}${docSection('RELATED DOCUMENTS',row.relatedDocumentsText)}</article><aside class="details"><h3>Document Details</h3><div class="detail-item"><span>Status</span><strong>Published</strong></div><div class="detail-item"><span>Policy Code</span><strong>${esc(row.policyCode)}</strong></div><div class="detail-item"><span>Version</span><strong>${esc(row.versionNumber)}</strong></div><div class="detail-item"><span>Effective Date</span><strong>${esc(fmtDate(row.effectiveDate))}</strong></div><div class="detail-item"><span>Next Review</span><strong>${esc(fmtDate(row.reviewDate))}</strong></div><div class="detail-item"><span>Company Scope</span><strong>${esc(row.scopeType==='ENTERPRISE'?'All Sulandra companies':(row.legalEntityName||'Company-specific'))}</strong></div><div class="detail-item"><span>Category</span><strong>${esc(row.category)}</strong></div><div class="detail-item"><span>Published Versions</span><strong>${revisions.length}</strong></div><div class="detail-actions"><a href="${esc(row.pdfUrl)}" target="_blank" rel="noopener">Open protected PDF</a><button type="button" id="detailAsk">Ask SIA about this policy</button><button type="button" id="detailBookmark" class="secondary">Bookmark policy</button></div></aside>`;
      $('detailBackdrop').classList.add('show');$('detailBackdrop').setAttribute('aria-hidden','false');history.replaceState(null,'',`/policies.html?policy=${encodeURIComponent(id)}`);
      $('detailAsk')?.addEventListener('click',()=>askSia(`Explain policy ${row.policyCode}, “${row.title}”. Answer my questions using the published policy and include the PDF link.`));
      $('detailBookmark')?.addEventListener('click',()=>toggleBookmark(row.id));
    }catch(error){notice(error.message,true)}
  }
  function closePolicy(){const node=$('detailBackdrop');node.classList.remove('show');node.setAttribute('aria-hidden','true');history.replaceState(null,'','/policies.html')}
  async function load(){
    if(!token()){location.href='/employee-login.html?returnTo=%2Fpolicies.html';return}
    if(window.SulandraEntityContext?.ready)await window.SulandraEntityContext.ready;
    syncContext();state.busy=true;$('resultCount').textContent='Searching…';
    try{
      const params=new URLSearchParams();const q=$('search').value.trim();if(q)params.set('q',q);if($('categoryFilter').value)params.set('category',$('categoryFilter').value);if($('companyFilter').value==='ALL')params.set('scope','ALL');params.set('limit','100');
      const data=await api(`/api/policies?${params.toString()}`);state.policies=Array.isArray(data.policies)?data.policies:[];state.categories=[...new Set([...(data.categories||[]),...state.policies.map(row=>row.category).filter(Boolean)])].sort();categoryOptions();render();
    }catch(error){state.policies=[];render();notice(error.message,true)}finally{state.busy=false}
  }
  function askSia(prompt){
    const open=()=>{const launcher=$('siaxLauncher'),input=$('siaxInput');if(!launcher||!input)return false;launcher.click();input.value=prompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();return true};
    if(open())return;let tries=0;const timer=setInterval(()=>{tries+=1;if(open()||tries>12){clearInterval(timer);if(tries>12)location.href=`/sia.html?prompt=${encodeURIComponent(prompt)}`}},100)}
  $('searchForm').addEventListener('submit',event=>{event.preventDefault();state.view='all';document.querySelectorAll('.side-btn').forEach(x=>x.classList.remove('active'));document.querySelector('[data-view="all"]')?.classList.add('active');void load()});
  $('companyFilter').addEventListener('change',()=>void load());$('categoryFilter').addEventListener('change',()=>void load());
  document.querySelectorAll('.side-btn[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;document.querySelectorAll('.side-btn').forEach(x=>x.classList.remove('active'));button.classList.add('active');render()}));
  document.querySelectorAll('.side-btn[data-category]').forEach(button=>button.addEventListener('click',()=>{$('categoryFilter').value=button.dataset.category;state.view='all';void load()}));
  document.querySelectorAll('[data-preset]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();const map={clinical:'Clinical & Care',workforce:'Workforce & Human Resources',safety:'Safety & Compliance',technology:'Technology & Security'};$('categoryFilter').value=map[link.dataset.preset]||'';void load()}));
  $('askSiaGeneral').addEventListener('click',()=>askSia('Help me find and understand a Sulandra policy. Ask me what policy or topic I need, then use only published policy information and give me the protected PDF link.'));
  $('closeDetail').addEventListener('click',closePolicy);$('detailBackdrop').addEventListener('click',event=>{if(event.target===$('detailBackdrop'))closePolicy()});
  $('logout').addEventListener('click',()=>{['sulandra:employee:access-token','sulandra_token','token','accessToken'].forEach(key=>{sessionStorage.removeItem(key);localStorage.removeItem(key)});location.href='/employee-login.html'});
  window.addEventListener('sulandra:entity-context-changed',()=>void load());
  (async()=>{await load();const id=new URL(location.href).searchParams.get('policy');if(id)await openPolicy(id)})();
})();
