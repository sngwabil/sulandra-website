(() => {
  'use strict';
  if (!/\/employee-portal\.html$/i.test(location.pathname)) return;

  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const token = () => sessionStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra:employee:access-token')
    || localStorage.getItem('sulandra_token')
    || localStorage.getItem('token')
    || localStorage.getItem('accessToken')
    || '';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const label = value => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  const date = value => value ? new Date(value).toLocaleDateString() : '—';
  const dateTime = value => value ? new Date(value).toLocaleString() : '—';
  const statusClass = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const number = value => value == null || value === '' ? '—' : Number(value).toFixed(Number(value) % 1 ? 2 : 0);

  let state = null;
  let activeTab = 'overview';
  let selectedReview = null;
  let installed = false;

  async function api(path, options = {}) {
    const auth = token();
    if (!auth) throw new Error('Your employee session is unavailable. Sign in again.');
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: options.accept || 'application/json',
        Authorization: `Bearer ${auth}`,
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  }

  function styles() {
    if (document.getElementById('employeePerformanceStyles')) return;
    const style = document.createElement('style');
    style.id = 'employeePerformanceStyles';
    style.textContent = `
      #employeePerformance{margin-top:22px;background:#fff;border:1px solid #d8e3ec;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.08);overflow:hidden;color:#263847}
      .ep-head{background:linear-gradient(135deg,#4a1d72,#7d3cb5);color:#fff;padding:22px;display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.ep-head h2{margin:0;color:#fff;font-size:27px}.ep-head p{margin:5px 0 0;opacity:.94}.ep-actions{display:flex;gap:8px;flex-wrap:wrap}
      .ep-btn{appearance:none;border:1px solid #6f36a5;background:#fff;color:#552386;border-radius:7px;padding:9px 13px;font-weight:800;cursor:pointer;font-size:14px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.ep-btn.primary{background:#6f36a5;color:#fff}.ep-btn.danger{background:#bd3f2f;border-color:#bd3f2f;color:#fff}.ep-btn.warn{background:#fff1c8;border-color:#d2a31b;color:#6d4d00}.ep-btn:disabled{opacity:.5;cursor:not-allowed}
      .ep-tabs{display:flex;overflow:auto;background:#f0e9f7;border-bottom:1px solid #d4c4e2;scrollbar-width:none}.ep-tabs::-webkit-scrollbar{display:none}.ep-tab{border:0;border-right:1px solid #d4c4e2;background:transparent;color:#57317b;padding:12px 15px;font-weight:900;cursor:pointer;white-space:nowrap}.ep-tab.active{background:#fff;color:#4a1d72}
      .ep-status{display:none;margin:14px 18px 0;padding:10px 12px;border:1px solid #e0c15b;background:#fff6d8;border-radius:7px}.ep-status.show{display:block}.ep-status.error{background:#fde6e2;border-color:#d87866;color:#8f2519}.ep-body{padding:18px}.ep-metrics{display:grid;grid-template-columns:repeat(5,minmax(145px,1fr));gap:11px;margin-bottom:16px}.ep-card{background:#fff;border:1px solid #d3dce5;border-radius:9px;padding:14px}.ep-card h3,.ep-card h4{margin:0 0 7px;color:#542681}.ep-metric{font-size:28px;font-weight:900;color:#5d2c8e}.ep-sub{font-size:12px;color:#687785;margin-top:4px}.ep-grid{display:grid;grid-template-columns:repeat(2,minmax(240px,1fr));gap:12px}.ep-grid.three{grid-template-columns:repeat(3,minmax(180px,1fr))}
      .ep-section{margin-top:18px}.ep-section h3{margin:0 0 10px;color:#542681}.ep-list{border:1px solid #d3dce5;border-radius:9px;overflow:hidden;background:#fff}.ep-row{padding:13px;border-top:1px solid #e2e8ee;display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.ep-row:first-child{border-top:0}.ep-title{font-weight:900;color:#3d2254}.ep-row-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.ep-badge{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:900;background:#eee6f7;color:#542681;margin:2px}.ep-badge.completed,.ep-badge.active,.ep-badge.approved{background:#def4e5;color:#176b35}.ep-badge.atrisk,.ep-badge.overdue,.ep-badge.rejected,.ep-badge.unsuccessful{background:#fde1dc;color:#9e2415}.ep-badge.employeeinput,.ep-badge.managerreview,.ep-badge.calibration,.ep-badge.acknowledgment,.ep-badge.pendingapproval,.ep-badge.extended{background:#fff0c4;color:#705100}
      .ep-progress{height:11px;background:#e9edf1;border-radius:999px;overflow:hidden;margin-top:7px}.ep-progress span{display:block;height:100%;background:linear-gradient(90deg,#6f36a5,#a266d0);width:0}.ep-input,.ep-select,.ep-textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bac8d4;border-radius:7px;background:#fff;font:inherit}.ep-textarea{min-height:100px;resize:vertical}.ep-form label{display:block;font-size:13px;font-weight:800;color:#34495e}.ep-form-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.ep-empty{text-align:center;padding:34px;border:2px dashed #cdb7df;border-radius:10px;background:#fbf8fe}.ep-alert{border:1px solid #ddc068;background:#fff7dc;border-radius:8px;padding:12px;margin-bottom:12px}.ep-alert.danger{border-color:#d77a69;background:#fde7e3}.ep-alert.success{border-color:#8bc69d;background:#eefaf1}
      .ep-modal{position:fixed;inset:0;background:rgba(18,20,39,.68);z-index:10120;display:none;align-items:flex-start;justify-content:center;padding:18px;overflow:auto}.ep-modal.open{display:flex}.ep-dialog{width:min(980px,100%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden;margin:auto}.ep-dialog-head{background:#4a1d72;color:#fff;padding:16px 19px;display:flex;justify-content:space-between;align-items:center;gap:12px}.ep-dialog-head h3{margin:0;color:#fff}.ep-dialog-body{padding:18px;max-height:78vh;overflow:auto}.ep-close{border:0;background:#fff;color:#4a1d72;border-radius:6px;padding:8px 12px;font-weight:900;cursor:pointer}.ep-rating-row{display:grid;grid-template-columns:minmax(170px,1fr) 120px 2fr;gap:10px;align-items:start;padding:11px;border-top:1px solid #e2e8ee}.ep-rating-row:first-child{border-top:0}.ep-plan{border-left:5px solid #6f36a5}.ep-action-plan{border-left:5px solid #b64330}.ep-timeline{margin:8px 0 0 6px;padding-left:20px;border-left:2px solid #d6c7e2}.ep-step{padding:0 0 13px}.ep-step:last-child{padding-bottom:0}
      @media(max-width:920px){.ep-metrics{grid-template-columns:repeat(2,1fr)}.ep-grid,.ep-grid.three{grid-template-columns:1fr 1fr}.ep-rating-row{grid-template-columns:1fr 100px}.ep-rating-row>*:nth-child(3){grid-column:1/-1}}
      @media(max-width:620px){.ep-head{flex-direction:column;padding:18px}.ep-head h2{font-size:23px}.ep-body{padding:13px}.ep-metrics,.ep-grid,.ep-grid.three{grid-template-columns:1fr}.ep-row{flex-direction:column}.ep-row-actions,.ep-actions,.ep-form-actions{width:100%}.ep-row-actions .ep-btn,.ep-actions .ep-btn,.ep-form-actions .ep-btn{flex:1}.ep-modal{padding:6px}.ep-dialog{border-radius:8px}.ep-dialog-body{max-height:none}.ep-rating-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function shell() {
    return `<section id="employeePerformance" aria-label="Employee performance and development">
      <div class="ep-head"><div><h2>My Performance</h2><p>Performance reviews, goals, development plans, formal action plans, feedback, and recognition in one place.</p></div><div class="ep-actions"><button class="ep-btn" id="epRefresh">Refresh</button><button class="ep-btn primary" id="epProposeGoal">Propose Goal</button></div></div>
      <div class="ep-tabs">${[['overview','Overview'],['reviews','Reviews'],['goals','Goals'],['development','Development Plans'],['actions','Action Plans']].map(([id,name]) => `<button class="ep-tab ${id===activeTab?'active':''}" data-ep-tab="${id}">${name}</button>`).join('')}</div>
      <div id="epStatus" class="ep-status"></div><div id="epBody" class="ep-body"></div>
    </section><div class="ep-modal" id="epModal"><div class="ep-dialog"><div class="ep-dialog-head"><h3 id="epModalTitle">My Performance</h3><button class="ep-close" id="epModalClose">Close</button></div><div class="ep-dialog-body" id="epModalBody"></div></div></div>`;
  }

  function setStatus(message, error = false) {
    const box = document.getElementById('epStatus');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('show', Boolean(message));
    box.classList.toggle('error', error);
  }

  function modal(title, body) {
    document.getElementById('epModalTitle').textContent = title;
    document.getElementById('epModalBody').innerHTML = body;
    document.getElementById('epModal').classList.add('open');
  }
  function closeModal() { document.getElementById('epModal')?.classList.remove('open'); selectedReview = null; }

  async function install() {
    if (installed) return;
    const hero = document.querySelector('.page-hero');
    if (!hero) return;
    installed = true;
    styles();
    const nav = document.querySelector('.nav-links');
    if (nav && !document.getElementById('employeePerformanceNav')) {
      const li = document.createElement('li');
      li.innerHTML = '<a href="#myPerformance" id="employeePerformanceNav">My Performance</a>';
      nav.insertBefore(li, nav.children[2] || null);
    }
    const workplace = document.getElementById('employeeWorkplace');
    (workplace || hero).insertAdjacentHTML('afterend', shell());
    document.getElementById('epRefresh').onclick = load;
    document.getElementById('epProposeGoal').onclick = proposeGoal;
    document.getElementById('epModalClose').onclick = closeModal;
    document.getElementById('epModal').addEventListener('click', event => { if (event.target.id === 'epModal') closeModal(); });
    document.querySelectorAll('[data-ep-tab]').forEach(button => button.onclick = () => { activeTab = button.dataset.epTab; render(); });
    await load();
    if (location.hash === '#myPerformance') document.getElementById('employeePerformance').scrollIntoView({behavior:'smooth'});
  }

  async function load() {
    try {
      setStatus('Loading My Performance…');
      state = await api('/api/employee/me/performance');
      render();
      setStatus('');
    } catch (error) {
      setStatus(error.message, true);
      document.getElementById('epBody').innerHTML = `<div class="ep-empty"><h3>My Performance is temporarily unavailable</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  function render() {
    if (!state) return;
    document.querySelectorAll('[data-ep-tab]').forEach(button => button.classList.toggle('active', button.dataset.epTab === activeTab));
    const views = {overview:overview,reviews:reviewsView,goals:goalsView,development:developmentView,actions:actionPlansView};
    document.getElementById('epBody').innerHTML = views[activeTab]();
    wire();
  }

  function metric(title, value, subtitle) { return `<div class="ep-card"><h4>${esc(title)}</h4><div class="ep-metric">${Number(value || 0)}</div><div class="ep-sub">${esc(subtitle)}</div></div>`; }

  function overview() {
    const m = state.metrics || {};
    const currentReviews = state.reviews.filter(item => !['COMPLETED','CANCELLED'].includes(item.status)).slice(0,4);
    const atRiskGoals = state.goals.filter(item => item.status === 'AT_RISK' || (item.dueDate && new Date(item.dueDate) < new Date() && item.status !== 'COMPLETED')).slice(0,5);
    const acknowledgments = [
      ...state.reviews.filter(item => item.status === 'ACKNOWLEDGMENT').map(item => ({kind:'review',id:item.id,title:item.cycleName})),
      ...state.developmentPlans.filter(item => item.acknowledgmentRequired && !item.acknowledgedAt).map(item => ({kind:'development',id:item.id,title:item.title})),
      ...state.actionPlans.filter(item => item.acknowledgmentRequired && !item.acknowledgedAt).map(item => ({kind:'action',id:item.id,title:item.title})),
    ];
    return `<div class="ep-metrics">${metric('Active Reviews',m.activeReviews,'Reviews currently in progress')}${metric('Active Goals',m.activeGoals,'Approved and proposed goals')}${metric('Goals at Risk',m.goalsAtRisk,'Late or marked at risk')}${metric('Acknowledgments',m.pendingAcknowledgments,'Items awaiting your acknowledgment')}${metric('Development Plans',m.activeDevelopmentPlans,'Active growth and learning plans')}</div>
      ${acknowledgments.length ? `<div class="ep-alert"><strong>Action required:</strong> ${acknowledgments.length} performance item${acknowledgments.length===1?'':'s'} require your acknowledgment.</div>` : ''}
      <div class="ep-grid"><div><div class="ep-section" style="margin-top:0"><h3>Current Reviews</h3>${currentReviews.length ? `<div class="ep-list">${currentReviews.map(reviewRow).join('')}</div>` : '<div class="ep-empty">No active performance reviews.</div>'}</div></div><div><div class="ep-section" style="margin-top:0"><h3>Goals Requiring Attention</h3>${atRiskGoals.length ? `<div class="ep-list">${atRiskGoals.map(goalRow).join('')}</div>` : '<div class="ep-empty">No goals currently require attention.</div>'}</div></div></div>
      ${acknowledgments.length ? `<div class="ep-section"><h3>Pending Acknowledgments</h3><div class="ep-list">${acknowledgments.map(item => `<div class="ep-row"><div><div class="ep-title">${esc(item.title)}</div><div class="ep-sub">${label(item.kind)} acknowledgment</div></div><button class="ep-btn primary" data-ack-kind="${item.kind}" data-ack-id="${esc(item.id)}">Review and Acknowledge</button></div>`).join('')}</div></div>` : ''}`;
  }

  function reviewRow(item) {
    return `<div class="ep-row"><div><div class="ep-title">${esc(item.cycleName || item.templateName)}</div><div class="ep-sub">${date(item.periodStart)} – ${date(item.periodEnd)} · Final rating ${number(item.finalRating)}</div><span class="ep-badge ${statusClass(item.status)}">${label(item.status)}</span></div><div class="ep-row-actions"><button class="ep-btn" data-review="${esc(item.id)}">Open Review</button></div></div>`;
  }
  function reviewsView() { return state.reviews.length ? `<div class="ep-list">${state.reviews.map(reviewRow).join('')}</div>` : '<div class="ep-empty"><h3>No performance reviews</h3><p>Assigned review cycles and completed reviews will appear here.</p></div>'; }

  function goalRow(item) {
    return `<div class="ep-row"><div style="flex:1"><div class="ep-title">${esc(item.title)}</div><div class="ep-sub">${label(item.category)} · Due ${date(item.dueDate)} · ${item.targetValue==null?'Milestone':`Target ${number(item.targetValue)} ${esc(item.unit||'')}`}</div><div class="ep-progress"><span style="width:${Math.min(100,Math.max(0,Number(item.progressPercent||0)))}%"></span></div><div class="ep-sub">${number(item.progressPercent)}% complete</div><span class="ep-badge ${statusClass(item.status)}">${label(item.status)}</span></div><div class="ep-row-actions">${item.employeeCanUpdate && ['ACTIVE','AT_RISK'].includes(item.status) ? `<button class="ep-btn primary" data-goal-progress="${esc(item.id)}">Update Progress</button>` : ''}</div></div>`;
  }
  function goalsView() { return `<div class="ep-actions" style="margin-bottom:13px"><button class="ep-btn primary" id="epGoalFromTab">Propose Goal</button></div>${state.goals.length ? `<div class="ep-list">${state.goals.map(goalRow).join('')}</div>` : '<div class="ep-empty"><h3>No goals yet</h3><p>Propose a measurable performance or development goal for manager approval.</p></div>'}`; }

  function developmentView() {
    return state.developmentPlans.length ? `<div class="ep-grid">${state.developmentPlans.map(plan => `<div class="ep-card ep-plan"><h3>${esc(plan.title)}</h3><div><span class="ep-badge ${statusClass(plan.status)}">${label(plan.status)}</span></div><p style="white-space:pre-wrap">${esc(plan.purpose)}</p><div class="ep-sub">Target date: ${date(plan.targetDate)}</div><div class="ep-section"><h4>Development Actions</h4><div class="ep-list">${(plan.actions||[]).map(action => `<div class="ep-row"><div><div class="ep-title">${esc(action.title)}</div><div class="ep-sub">Owner ${label(action.owner)} · Due ${date(action.dueDate)}${action.courseCode?` · Course ${esc(action.courseCode)}`:''}</div></div><span class="ep-badge ${statusClass(action.status)}">${label(action.status)}</span></div>`).join('')}</div></div>${plan.acknowledgmentRequired ? `<div class="ep-form-actions">${plan.acknowledgedAt ? `<span class="ep-badge completed">Acknowledged ${date(plan.acknowledgedAt)}</span>` : `<button class="ep-btn primary" data-ack-development="${esc(plan.id)}">Acknowledge Plan</button>`}</div>` : ''}</div>`).join('')}</div>` : '<div class="ep-empty"><h3>No development plans</h3><p>Manager-created development plans and linked learning actions will appear here.</p></div>';
  }

  function actionPlansView() {
    return state.actionPlans.length ? `<div class="ep-alert danger"><strong>Important:</strong> Acknowledgment confirms receipt and review. It does not prevent you from adding comments or contacting Human Resources.</div><div class="ep-grid">${state.actionPlans.map(plan => `<div class="ep-card ep-action-plan"><h3>${esc(plan.title)}</h3><div><span class="ep-badge ${statusClass(plan.status)}">${label(plan.status)}</span><span class="ep-badge">${label(plan.severity)}</span></div><h4>Reason</h4><p style="white-space:pre-wrap">${esc(plan.reason)}</p><h4>Expectations</h4><p style="white-space:pre-wrap">${esc(plan.expectations)}</p>${plan.supportProvided?`<h4>Support Provided</h4><p style="white-space:pre-wrap">${esc(plan.supportProvided)}</p>`:''}<div class="ep-sub">Plan period: ${date(plan.startDate)} – ${date(plan.endDate)}</div>${plan.acknowledgmentRequired ? `<div class="ep-form-actions">${plan.acknowledgedAt ? `<span class="ep-badge completed">Acknowledged ${date(plan.acknowledgedAt)}</span>` : `<button class="ep-btn primary" data-ack-action="${esc(plan.id)}">Acknowledge Plan</button>`}</div>` : ''}</div>`).join('')}</div>` : '<div class="ep-empty"><h3>No employee-visible action plans</h3><p>Formal coaching or improvement plans shared with you will appear here.</p></div>';
  }

  function wire() {
    document.querySelectorAll('[data-review]').forEach(button => button.onclick = () => openReview(button.dataset.review));
    document.querySelectorAll('[data-goal-progress]').forEach(button => button.onclick = () => updateGoal(button.dataset.goalProgress));
    document.querySelectorAll('[data-ack-development]').forEach(button => button.onclick = () => acknowledge('development',button.dataset.ackDevelopment));
    document.querySelectorAll('[data-ack-action]').forEach(button => button.onclick = () => acknowledge('action',button.dataset.ackAction));
    document.querySelectorAll('[data-ack-kind]').forEach(button => button.onclick = () => {
      if (button.dataset.ackKind === 'review') openReview(button.dataset.ackId);
      else acknowledge(button.dataset.ackKind,button.dataset.ackId);
    });
    document.getElementById('epGoalFromTab')?.addEventListener('click', proposeGoal);
  }

  function proposeGoal() {
    modal('Propose Performance or Development Goal', `<form id="epGoalForm" class="ep-form"><div class="ep-grid three"><label>Category<select class="ep-select" name="category"><option>PERFORMANCE</option><option>DEVELOPMENT</option><option>EDUCATION</option><option>LEADERSHIP</option><option>QUALITY</option><option>SAFETY</option><option>ATTENDANCE</option><option>OTHER</option></select></label><label>Metric type<select class="ep-select" name="metricType"><option>PERCENT</option><option>NUMBER</option><option>MILESTONE</option><option>BOOLEAN</option></select></label><label>Due date<input class="ep-input" type="date" name="dueDate"></label><label>Target value<input class="ep-input" type="number" step="0.01" name="targetValue"></label><label>Unit<input class="ep-input" name="unit" placeholder="%, calls, cases, hours"></label><label>Goal weight<input class="ep-input" type="number" min="0" max="100" name="weight" value="0"></label></div><label style="display:block;margin-top:10px">Goal title<input class="ep-input" name="title" required></label><label style="display:block;margin-top:10px">Description and success criteria<textarea class="ep-textarea" name="description" required></textarea></label><div class="ep-form-actions"><button class="ep-btn primary" type="submit">Submit for Manager Approval</button></div></form>`);
    document.getElementById('epGoalForm').onsubmit = async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      try {
        await api('/api/employee/me/performance/goals',{method:'POST',body:JSON.stringify({title:String(data.get('title')||'').trim(),description:String(data.get('description')||'').trim(),category:String(data.get('category')),metricType:String(data.get('metricType')),targetValue:data.get('targetValue')===''?null:Number(data.get('targetValue')),unit:String(data.get('unit')||'').trim(),dueDate:data.get('dueDate')||null,weight:Number(data.get('weight')||0)})});
        closeModal(); await load(); setStatus('Your goal was submitted for manager approval.');
      } catch (error) { alert(error.message); }
    };
  }

  function updateGoal(id) {
    const goal = state.goals.find(item => item.id === id); if (!goal) return;
    modal(`Update Goal: ${goal.title}`, `<form id="epGoalProgressForm" class="ep-form"><div class="ep-grid"><label>Progress percent<input class="ep-input" type="number" min="0" max="100" step="1" name="progressPercent" value="${Number(goal.progressPercent||0)}"></label><label>Current value<input class="ep-input" type="number" step="0.01" name="currentValue" value="${goal.currentValue??''}"></label><label>Status<select class="ep-select" name="status"><option ${goal.status==='ACTIVE'?'selected':''}>ACTIVE</option><option ${goal.status==='AT_RISK'?'selected':''}>AT_RISK</option><option ${goal.status==='COMPLETED'?'selected':''}>COMPLETED</option></select></label></div><label style="display:block;margin-top:10px">Progress update<textarea class="ep-textarea" name="updateNote" required></textarea></label><div class="ep-form-actions"><button class="ep-btn primary" type="submit">Save Progress</button></div></form>`);
    document.getElementById('epGoalProgressForm').onsubmit = async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      try {
        await api(`/api/employee/me/performance/goals/${encodeURIComponent(id)}/progress`,{method:'PATCH',body:JSON.stringify({progressPercent:Number(data.get('progressPercent')),currentValue:data.get('currentValue')===''?null:Number(data.get('currentValue')),status:String(data.get('status')),updateNote:String(data.get('updateNote')||'').trim()})});
        closeModal(); await load(); setStatus('Goal progress updated.');
      } catch (error) { alert(error.message); }
    };
  }

  async function openReview(id) {
    try {
      selectedReview = await api(`/api/employee/me/performance/reviews/${encodeURIComponent(id)}`);
      const {review,cycle,manager,assessments,goals,events} = selectedReview;
      const self = assessments.find(item => item.assessorType === 'EMPLOYEE');
      const managerAssessment = assessments.find(item => item.assessorType === 'MANAGER');
      const selfForm = ['EMPLOYEE_INPUT','DRAFT'].includes(review.status) ? selfAssessmentForm(cycle,goals,self?.responses||{}) : '';
      const acknowledgment = review.status === 'ACKNOWLEDGMENT' && !review.acknowledgedAt ? `<div class="ep-section"><h3>Employee Acknowledgment</h3><div class="ep-alert">Acknowledgment confirms that you received and reviewed the finalized performance review. You may add comments before submitting.</div><form id="epReviewAckForm" class="ep-form"><label>Employee comments<textarea class="ep-textarea" name="comments"></textarea></label><div class="ep-form-actions"><button class="ep-btn primary" type="submit">Acknowledge Review</button></div></form></div>` : '';
      modal(cycle.name, `<div class="ep-grid three"><div class="ep-card"><h4>Status</h4><span class="ep-badge ${statusClass(review.status)}">${label(review.status)}</span></div><div class="ep-card"><h4>Review Period</h4><strong>${date(cycle.periodStart)} – ${date(cycle.periodEnd)}</strong></div><div class="ep-card"><h4>Manager</h4><strong>${esc(manager?.displayName||'Not assigned')}</strong></div><div class="ep-card"><h4>Final Rating</h4><div class="ep-metric">${number(review.finalRating)}</div></div><div class="ep-card"><h4>Final Score</h4><div class="ep-metric">${number(review.finalScore)}</div></div><div class="ep-card"><h4>Acknowledgment</h4><strong>${review.acknowledgedAt?dateTime(review.acknowledgedAt):'Pending or not required'}</strong></div></div>
        ${review.summary||review.strengths||review.improvementAreas?`<div class="ep-section"><h3>Final Review Summary</h3><div class="ep-card"><h4>Summary</h4><p style="white-space:pre-wrap">${esc(review.summary||'—')}</p><h4>Strengths</h4><p style="white-space:pre-wrap">${esc(review.strengths||'—')}</p><h4>Improvement Areas</h4><p style="white-space:pre-wrap">${esc(review.improvementAreas||'—')}</p></div></div>`:''}
        <div class="ep-section"><h3>Review Goals</h3><div class="ep-list">${goals.map(goalRow).join('')||'<div class="ep-row">No review goals.</div>'}</div></div>
        ${selfForm}
        ${self?`<div class="ep-section"><h3>Your Submitted Self-Assessment</h3><div class="ep-card"><pre style="white-space:pre-wrap;overflow:auto">${esc(JSON.stringify(self.responses,null,2))}</pre></div></div>`:''}
        ${managerAssessment&&['ACKNOWLEDGMENT','COMPLETED'].includes(review.status)?`<div class="ep-section"><h3>Manager Assessment</h3><div class="ep-card"><pre style="white-space:pre-wrap;overflow:auto">${esc(JSON.stringify(managerAssessment.responses,null,2))}</pre></div></div>`:''}
        ${acknowledgment}
        <div class="ep-section"><h3>Review Timeline</h3><div class="ep-timeline">${events.map(item=>`<div class="ep-step"><strong>${label(item.eventType)}</strong><div class="ep-sub">${dateTime(item.createdAt)}</div></div>`).join('')}</div></div>`);
      document.getElementById('epSelfAssessmentForm')?.addEventListener('submit', submitSelfAssessment);
      document.getElementById('epReviewAckForm')?.addEventListener('submit', acknowledgeReview);
      document.querySelectorAll('#epModalBody [data-goal-progress]').forEach(button => button.onclick = () => updateGoal(button.dataset.goalProgress));
    } catch (error) { setStatus(error.message,true); }
  }

  function selfAssessmentForm(cycle,goals,existing) {
    const previousCompetencies = new Map((existing.competencyRatings||[]).map(item=>[item.competencyId,item]));
    const previousGoals = new Map((existing.goalRatings||[]).map(item=>[item.goalId,item]));
    const ratingOptions = (cycle.ratingScale||[]).map(item=>`<option value="${Number(item.value)}">${Number(item.value)} — ${esc(item.label)}</option>`).join('');
    return `<div class="ep-section"><h3>Employee Self-Assessment</h3><div class="ep-alert">Rate your performance using the published rating scale and provide specific examples. Your manager will review this separately.</div><form id="epSelfAssessmentForm" class="ep-form"><h4>Competencies</h4><div class="ep-list">${(cycle.competencies||[]).map(item=>{const prior=previousCompetencies.get(item.id)||{};return `<div class="ep-rating-row" data-competency="${esc(item.id)}"><div><strong>${esc(item.name)}</strong><div class="ep-sub">${esc(item.description||'')} · Weight ${number(item.weight)}%</div></div><select class="ep-select" data-field="rating" required><option value="">Rating</option>${ratingOptions.replace(`value="${prior.rating}"`,`value="${prior.rating}" selected`)}</select><textarea class="ep-textarea" data-field="comments" placeholder="Examples and comments">${esc(prior.comments||'')}</textarea></div>`}).join('')}</div>${goals.length?`<h4 style="margin-top:15px">Goals</h4><div class="ep-list">${goals.map(item=>{const prior=previousGoals.get(item.id)||{};return `<div class="ep-rating-row" data-goal-rating="${esc(item.id)}"><div><strong>${esc(item.title)}</strong><div class="ep-sub">${number(item.progressPercent)}% progress</div></div><select class="ep-select" data-field="rating" required><option value="">Rating</option>${ratingOptions.replace(`value="${prior.rating}"`,`value="${prior.rating}" selected`)}</select><textarea class="ep-textarea" data-field="comments" placeholder="Results and examples">${esc(prior.comments||'')}</textarea></div>`}).join('')}</div>`:''}<div class="ep-grid" style="margin-top:14px"><label>Accomplishments<textarea class="ep-textarea" name="accomplishments">${esc(existing.accomplishments||'')}</textarea></label><label>Challenges<textarea class="ep-textarea" name="challenges">${esc(existing.challenges||'')}</textarea></label><label>Support needed<textarea class="ep-textarea" name="supportNeeded">${esc(existing.supportNeeded||'')}</textarea></label><label>Overall comments<textarea class="ep-textarea" name="overallComments">${esc(existing.overallComments||'')}</textarea></label></div><div class="ep-form-actions"><button class="ep-btn primary" type="submit">Submit Self-Assessment</button></div></form></div>`;
  }

  async function submitSelfAssessment(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const competencyRatings = [...form.querySelectorAll('[data-competency]')].map(row=>({competencyId:row.dataset.competency,rating:Number(row.querySelector('[data-field="rating"]').value),comments:row.querySelector('[data-field="comments"]').value.trim()}));
    const goalRatings = [...form.querySelectorAll('[data-goal-rating]')].map(row=>({goalId:row.dataset.goalRating,rating:Number(row.querySelector('[data-field="rating"]').value),comments:row.querySelector('[data-field="comments"]').value.trim()}));
    const data = new FormData(form);
    if (!confirm('Submit your self-assessment? It will move to manager review.')) return;
    try {
      await api(`/api/employee/me/performance/reviews/${encodeURIComponent(selectedReview.review.id)}/self-assessment`,{method:'POST',body:JSON.stringify({competencyRatings,goalRatings,accomplishments:String(data.get('accomplishments')||''),challenges:String(data.get('challenges')||''),supportNeeded:String(data.get('supportNeeded')||''),overallComments:String(data.get('overallComments')||'')})});
      closeModal(); await load(); setStatus('Your self-assessment was submitted to your manager.');
    } catch (error) { alert(error.message); }
  }

  async function acknowledgeReview(event) {
    event.preventDefault(); const comments = String(new FormData(event.currentTarget).get('comments')||'');
    if (!confirm('Acknowledge that you received and reviewed this performance review?')) return;
    try {
      await api(`/api/employee/me/performance/reviews/${encodeURIComponent(selectedReview.review.id)}/acknowledge`,{method:'POST',body:JSON.stringify({acknowledged:true,comments})});
      closeModal(); await load(); setStatus('Performance review acknowledged.');
    } catch (error) { alert(error.message); }
  }

  async function acknowledge(kind,id) {
    const comments = prompt('Optional acknowledgment comments:', '') ?? null; if (comments === null) return;
    if (!confirm('Confirm receipt and review of this plan?')) return;
    const path = kind === 'development' ? `/api/employee/me/performance/development-plans/${encodeURIComponent(id)}/acknowledge` : `/api/employee/me/performance/action-plans/${encodeURIComponent(id)}/acknowledge`;
    try { await api(path,{method:'POST',body:JSON.stringify({acknowledged:true,comments})}); await load(); setStatus('Plan acknowledged.'); }
    catch (error) { setStatus(error.message,true); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
