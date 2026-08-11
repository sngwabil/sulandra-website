import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'client-intake.html');
const marker = 'CLIENT_INTAKE_DISPOSITION_UI_V1';
let source = await readFile(target, 'utf8');

const replaceRequired = (before, after, label) => {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Client Intake ${label} anchor changed`);
  source = source.replace(before, after);
};

if (!source.includes(marker)) {
  replaceRequired(
    '<aside class="cases"><button class="new-btn" id="newIntake">+ New Intake</button><input class="filter" id="caseSearch" placeholder="Search intake cases">',
    '<aside class="cases"><button class="new-btn" id="newIntake">+ New Intake</button><div class="tabs" data-intake-disposition-tabs><button class="tab active" type="button" id="activeIntakes">Active Intakes</button><button class="tab" type="button" id="archivedIntakes">Archived Intakes</button></div><input class="filter" id="caseSearch" placeholder="Search intake cases">',
    'sidebar'
  );

  replaceRequired(
    "const state={catalog:null,cases:[],caseId:'',detail:null,sectionKey:'',dirty:false,saving:false,autosaveTimer:null};",
    `const state={catalog:null,cases:[],caseId:'',detail:null,sectionKey:'',dirty:false,saving:false,autosaveTimer:null,archiveView:false,creating:false};/* ${marker} */`,
    'state'
  );

  // Replace the complete renderCases function by structural boundaries rather than
  // matching its minified punctuation. fix-client-intake-packet-coverage.mjs runs
  // before this installer and may legitimately alter nearby source formatting.
  if (!source.includes("const archived=c=>['WITHDRAWN','REJECTED']")) {
    const renderStart = source.indexOf('  function renderCases(){');
    const renderEnd = source.indexOf('\n  function renderSections(){', renderStart);
    if (renderStart < 0 || renderEnd < 0) throw new Error('Client Intake case-list render boundaries changed');
    const newRender = `  function renderCases(){const q=$('caseSearch').value.trim().toLowerCase(),status=$('statusFilter').value;const archived=c=>['WITHDRAWN','REJECTED'].includes(String(c.status||''));const rows=state.cases.filter(c=>(state.archiveView?archived(c):!archived(c))&&(!status||c.status===status)&&(!q||JSON.stringify(c).toLowerCase().includes(q)));const activeCount=state.cases.filter(c=>!archived(c)).length,archiveCount=state.cases.filter(archived).length;if($('activeIntakes'))$('activeIntakes').textContent=\`Active Intakes (\${activeCount})\`;if($('archivedIntakes'))$('archivedIntakes').textContent=\`Archived Intakes (\${archiveCount})\`;$('activeIntakes')?.classList.toggle('active',!state.archiveView);$('archivedIntakes')?.classList.toggle('active',state.archiveView);$('caseList').innerHTML=rows.length?rows.map(c=>\`<button class="case-card \${String(c.id)===state.caseId?'active':''}" data-case="\${esc(c.id)}"><div><span class="status \${esc(c.status)}">\${esc(statusLabel(c.status))}</span></div><div class="case-name">\${esc(caseName(c))}</div><div class="case-meta">\${esc(c.serviceType||c.intakeMode||'Client intake')} · Updated \${esc(fmtDate(c.updatedAt))}</div>\${archived(c)&&c.reviewNotes?\`<div class="case-meta">Reason: \${esc(c.reviewNotes)}</div>\`:''}<div class="case-progress"><span style="width:\${Math.max(0,Math.min(100,Number(c.completionPercent||0)))}%"></span></div></button>\`).join(''):'<div class="empty">'+(state.archiveView?'No archived intake records.':'No active intake cases match this view.')+'</div>';}`;
    source = source.slice(0, renderStart) + newRender + source.slice(renderEnd);
  }

  replaceRequired(
    "${['DRAFT','IN_PROGRESS','REVIEW_REQUIRED'].includes(c.status)?'<button class=\"btn primary\" id=\"submitIntake\">Submit for Review</button>':''}${['SUBMITTED','REVIEW_REQUIRED'].includes(c.status)?'<button class=\"btn success\" id=\"reviewIntake\">Review / Approve</button>':''}",
    "${['DRAFT','IN_PROGRESS','REVIEW_REQUIRED'].includes(c.status)?'<button class=\"btn primary\" id=\"submitIntake\">Submit for Review</button><button class=\"btn danger\" id=\"rejectDraft\">Reject Draft</button><button class=\"btn warn\" id=\"archiveIntake\">Archive</button>':''}${c.status==='REJECTED'?'<button class=\"btn warn\" id=\"archiveIntake\">Archive Rejected Intake</button>':''}${['SUBMITTED','REVIEW_REQUIRED'].includes(c.status)?'<button class=\"btn success\" id=\"reviewIntake\">Review / Approve</button>':''}",
    'workspace actions'
  );

  replaceRequired(
    "$('submitIntake')?.addEventListener('click',submitIntake);$('reviewIntake')?.addEventListener('click',openReview);",
    "$('submitIntake')?.addEventListener('click',submitIntake);$('reviewIntake')?.addEventListener('click',openReview);$('rejectDraft')?.addEventListener('click',()=>disposeIntake('REJECT'));$('archiveIntake')?.addEventListener('click',()=>disposeIntake('ARCHIVE'));",
    'workspace action binding'
  );

  if (!source.includes('async function disposeIntake(action)')) {
    const submitAnchor = '  async function submitIntake(){';
    const at = source.indexOf(submitAnchor);
    if (at < 0) throw new Error('Client Intake submit function boundary changed');
    const dispositionFunction = `  async function disposeIntake(action){if(state.dirty&&editable())await saveSection(false,true);const rejecting=action==='REJECT';const reason=prompt(rejecting?'Enter the reason this intake draft is being rejected:':'Optional archive reason:','');if(reason===null)return;if(rejecting&&!reason.trim()){alert('A rejection reason is required.');return;}if(!confirm(rejecting?'Reject this intake draft? It will be retained in Archived Intakes.':'Archive this intake? It will leave the active work queue but remain available in Archived Intakes.'))return;try{await api(\`/api/admin/client-intakes/\${encodeURIComponent(state.caseId)}/disposition\`,{method:'POST',body:JSON.stringify({action,reason:reason.trim()||null})});state.caseId='';state.detail=null;state.sectionKey='';state.archiveView=true;await loadCases();renderSections();renderWorkspace();renderCases();}catch(e){alert(e.message);}}\n`;
    source = source.slice(0, at) + dispositionFunction + source.slice(at);
  }

  replaceRequired(
    "$('caseSearch').addEventListener('input',renderCases);$('statusFilter').addEventListener('change',renderCases);",
    "$('caseSearch').addEventListener('input',renderCases);$('statusFilter').addEventListener('change',renderCases);$('activeIntakes')?.addEventListener('click',()=>{state.archiveView=false;state.caseId='';state.detail=null;renderCases();renderSections();renderWorkspace();});$('archivedIntakes')?.addEventListener('click',()=>{state.archiveView=true;state.caseId='';state.detail=null;renderCases();renderSections();renderWorkspace();});",
    'archive tab binding'
  );

  const submitStart = "$('newForm').onsubmit=async e=>{e.preventDefault();const error=$('newError');error.classList.remove('show');try{";
  const guardedStart = "$('newForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,error=$('newError'),button=form.querySelector('button[type=\"submit\"]');if(state.creating)return;state.creating=true;error.classList.remove('show');const oldLabel=button?.textContent||'Create Draft & Open Full Packet';if(button){button.disabled=true;button.textContent='Creating…';}try{";
  replaceRequired(submitStart, guardedStart, 'submit handler');

  const submitEnd = "await openCase(data.id);}catch(err){error.textContent=err.message;error.classList.add('show');}};";
  const guardedEnd = "await openCase(data.id);}catch(err){error.textContent=err.message;error.classList.add('show');}finally{state.creating=false;if(button){button.disabled=false;button.textContent=oldLabel;}}};";
  replaceRequired(submitEnd, guardedEnd, 'submit completion');

  await writeFile(target, source, 'utf8');
}

console.log('Client Intake frontend disposition installed: active/archive work queues, reject/archive actions, and single-flight creation are enabled.');
