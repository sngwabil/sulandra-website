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
  const date = value => value ? new Date(value).toLocaleDateString() : '—';
  const dateTime = value => value ? new Date(value).toLocaleString() : '—';
  const label = value => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  const statusClass = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  let state = null;
  let activeTab = 'overview';
  let selectedRequest = null;
  let installing = false;

  async function api(path, options = {}) {
    const auth = token();
    if (!auth) throw new Error('Your employee session is unavailable. Sign in again.');
    const response = await fetch(API + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${auth}`,
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body.data ?? body;
  }

  function addStyles() {
    if (document.getElementById('employeeWorkplaceStyles')) return;
    const style = document.createElement('style');
    style.id = 'employeeWorkplaceStyles';
    style.textContent = `
      #employeeWorkplace{margin-top:22px;background:#fff;border:1px solid #d9e3ec;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.08);overflow:hidden;color:#243447}
      .ew-head{background:linear-gradient(135deg,#063f73,#087fb9);color:#fff;padding:22px;display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
      .ew-head h2{margin:0;font-size:27px;color:#fff}.ew-head p{margin:5px 0 0;opacity:.93}.ew-actions{display:flex;gap:8px;flex-wrap:wrap}
      .ew-btn{appearance:none;border:1px solid #0b69aa;background:#fff;color:#075493;border-radius:7px;padding:9px 13px;font-weight:800;cursor:pointer;font-size:14px}.ew-btn:hover{filter:brightness(.97)}.ew-btn.primary{background:#0784c6;color:#fff}.ew-btn.danger{background:#c9432d;border-color:#c9432d;color:#fff}.ew-btn.warn{background:#fff2c8;border-color:#d8aa24;color:#6b4d00}.ew-btn:disabled{opacity:.5;cursor:not-allowed}
      .ew-tabs{display:flex;overflow:auto;background:#eaf2f8;border-bottom:1px solid #c7d6e3;scrollbar-width:none}.ew-tabs::-webkit-scrollbar{display:none}.ew-tab{border:0;border-right:1px solid #c7d6e3;background:transparent;color:#16486f;padding:12px 15px;font-weight:800;cursor:pointer;white-space:nowrap}.ew-tab.active{background:#fff;color:#075493}
      .ew-panel{display:none;padding:18px}.ew-panel.active{display:block}.ew-status{display:none;margin:0 18px 14px;padding:10px 12px;border:1px solid #e0c15b;background:#fff6d8;border-radius:7px}.ew-status.show{display:block}.ew-status.error{background:#fde6e2;border-color:#d87866;color:#8f2519}
      .ew-grid{display:grid;grid-template-columns:repeat(2,minmax(230px,1fr));gap:12px}.ew-grid.three{grid-template-columns:repeat(3,minmax(180px,1fr))}.ew-metrics{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;margin-bottom:16px}.ew-card{border:1px solid #d4dfe8;border-radius:9px;background:#fbfdff;padding:14px}.ew-card h3,.ew-card h4{margin:0 0 7px;color:#075493}.ew-metric{font-size:28px;font-weight:900;color:#0a5792}.ew-sub{font-size:12px;color:#687785;margin-top:4px}
      .ew-list{border:1px solid #d4dfe8;border-radius:9px;overflow:hidden;background:#fff}.ew-row{padding:13px;border-top:1px solid #e3e9ef;display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.ew-row:first-child{border-top:0}.ew-row-main{min-width:0}.ew-title{font-weight:900;color:#163f60}.ew-row-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.ew-badge{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:900;background:#e8f3fb;color:#075493;margin:2px}.ew-badge.approved,.ew-badge.completed,.ew-badge.compliant,.ew-badge.read{background:#def4e5;color:#176b35}.ew-badge.rejected,.ew-badge.overdue,.ew-badge.failed,.ew-badge.cancelled{background:#fde1dc;color:#9e2415}.ew-badge.inreview,.ew-badge.submitted,.ew-badge.pending,.ew-badge.duesoon,.ew-badge.unread{background:#fff0c4;color:#705100}
      .ew-section{margin-top:18px}.ew-section h3{margin:0 0 10px;color:#075493}.ew-input,.ew-select,.ew-textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #b9c8d6;border-radius:7px;background:#fff;font:inherit}.ew-textarea{min-height:105px;resize:vertical}.ew-form label{display:block;font-weight:800;font-size:13px;color:#34495e}.ew-form-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.ew-empty{text-align:center;padding:35px;border:2px dashed #bdd6e8;border-radius:10px;background:#f7fbfe}.ew-alert{border:1px solid #e0c15b;background:#fff7dc;border-radius:8px;padding:12px;margin-bottom:12px}.ew-alert.success{border-color:#8bc69d;background:#eefaf1}.ew-timeline{position:relative;margin:8px 0 0 7px;padding-left:20px}.ew-timeline:before{content:'';position:absolute;left:4px;top:5px;bottom:5px;width:2px;background:#c7d6e3}.ew-step{position:relative;padding:0 0 14px}.ew-step:before{content:'';position:absolute;left:-20px;top:3px;width:10px;height:10px;border-radius:50%;background:#0784c6;border:2px solid #fff;box-shadow:0 0 0 1px #9bb6ca}.ew-step:last-child{padding-bottom:0}
      .ew-modal{position:fixed;inset:0;background:rgba(13,31,49,.62);z-index:10050;display:none;align-items:flex-start;justify-content:center;padding:20px;overflow:auto}.ew-modal.open{display:flex}.ew-dialog{width:min(900px,100%);background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;margin:auto}.ew-dialog-head{background:#0d477d;color:#fff;padding:17px 20px;display:flex;justify-content:space-between;gap:12px;align-items:center}.ew-dialog-head h3{margin:0;color:#fff}.ew-dialog-body{padding:18px;max-height:75vh;overflow:auto}.ew-close{border:0;background:#fff;color:#075493;border-radius:6px;padding:8px 12px;font-weight:900;cursor:pointer}.ew-recognition{background:linear-gradient(135deg,#fff9df,#fff);border:1px solid #e4c864}.ew-feedback-ack{border-left:5px solid #d29f16}
      @media(max-width:900px){.ew-head{flex-direction:column}.ew-metrics,.ew-grid,.ew-grid.three{grid-template-columns:1fr 1fr}.ew-row{flex-direction:column}.ew-row-actions{justify-content:flex-start}.ew-dialog-body{max-height:none}}
      @media(max-width:620px){#employeeWorkplace{margin-left:-4px;margin-right:-4px}.ew-head{padding:18px}.ew-head h2{font-size:23px}.ew-panel{padding:13px}.ew-metrics,.ew-grid,.ew-grid.three{grid-template-columns:1fr}.ew-actions,.ew-form-actions{width:100%}.ew-actions .ew-btn,.ew-form-actions .ew-btn{flex:1}.ew-modal{padding:8px}.ew-dialog{border-radius:9px}.ew-row-actions{width:100%}.ew-row-actions .ew-btn{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function installNavigation() {
    const nav = document.querySelector('.nav-links');
    if (!nav || document.getElementById('employeeWorkplaceNav')) return;
    const item = document.createElement('li');
    item.innerHTML = '<a href="#myWorkplace" id="employeeWorkplaceNav">My Workplace</a>';
    nav.insertBefore(item, nav.children[1] || null);
  }

  function shell() {
    return `<section id="employeeWorkplace" aria-label="Employee self-service and workplace collaboration">
      <div class="ew-head"><div><h2>My Workplace</h2><p>Submit requests, follow approvals, review manager feedback, view recognition, and manage workplace notifications.</p></div><div class="ew-actions"><button class="ew-btn" id="ewRefresh">Refresh</button><button class="ew-btn primary" id="ewNewRequest">New Request</button></div></div>
      <div class="ew-tabs">${[['overview','Overview'],['requests','My Requests'],['feedback','Feedback & Check-ins'],['recognition','Recognition'],['notifications','Notifications']].map(([id,name]) => `<button class="ew-tab ${id===activeTab?'active':''}" data-ew-tab="${id}">${name}</button>`).join('')}</div>
      <div id="ewStatus" class="ew-status"></div>
      <div id="ewContent"></div>
    </section>
    <div class="ew-modal" id="ewModal" role="dialog" aria-modal="true"><div class="ew-dialog"><div class="ew-dialog-head"><h3 id="ewModalTitle">Employee Request</h3><button class="ew-close" id="ewModalClose">Close</button></div><div class="ew-dialog-body" id="ewModalBody"></div></div></div>`;
  }

  function setStatus(message, error = false) {
    const box = document.getElementById('ewStatus');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('show', Boolean(message));
    box.classList.toggle('error', error);
  }

  function openModal(title, body) {
    document.getElementById('ewModalTitle').textContent = title;
    document.getElementById('ewModalBody').innerHTML = body;
    document.getElementById('ewModal').classList.add('open');
  }

  function closeModal() {
    document.getElementById('ewModal')?.classList.remove('open');
    selectedRequest = null;
  }

  async function install() {
    if (installing || document.getElementById('employeeWorkplace')) return;
    const hero = document.querySelector('.page-hero');
    if (!hero) return;
    installing = true;
    try {
      addStyles();
      installNavigation();
      hero.insertAdjacentHTML('afterend', shell());
      document.getElementById('ewRefresh').onclick = load;
      document.getElementById('ewNewRequest').onclick = showNewRequest;
      document.getElementById('ewModalClose').onclick = closeModal;
      document.getElementById('ewModal').addEventListener('click', event => { if (event.target.id === 'ewModal') closeModal(); });
      document.querySelectorAll('[data-ew-tab]').forEach(button => button.onclick = () => {
        activeTab = button.dataset.ewTab;
        render();
      });
      await load();
      if (location.hash === '#myWorkplace') document.getElementById('employeeWorkplace').scrollIntoView({behavior:'smooth'});
    } finally { installing = false; }
  }

  async function load() {
    try {
      setStatus('Loading My Workplace…');
      state = await api('/api/employee/me/collaboration');
      render();
      setStatus('');
    } catch (error) {
      setStatus(error.message, true);
      document.getElementById('ewContent').innerHTML = `<div class="ew-panel active"><div class="ew-empty"><h3>My Workplace is temporarily unavailable</h3><p>${esc(error.message)}</p></div></div>`;
    }
  }

  function render() {
    if (!state) return;
    document.querySelectorAll('[data-ew-tab]').forEach(button => button.classList.toggle('active', button.dataset.ewTab === activeTab));
    const content = document.getElementById('ewContent');
    const panels = {
      overview: overviewPanel,
      requests: requestsPanel,
      feedback: feedbackPanel,
      recognition: recognitionPanel,
      notifications: notificationsPanel,
    };
    content.innerHTML = `<div class="ew-panel active">${panels[activeTab]()}</div>`;
    wireCurrentPanel();
  }

  function overviewPanel() {
    const metrics = state.metrics || {};
    const manager = state.manager;
    const urgent = state.requests.filter(request => ['SUBMITTED','IN_REVIEW'].includes(request.status)).slice(0,5);
    const pendingFeedback = state.feedback.filter(item => item.requiresAcknowledgment && !item.acknowledgedAt).slice(0,5);
    const unread = state.notifications.filter(item => item.status === 'UNREAD').slice(0,5);
    return `<div class="ew-metrics"><div class="ew-card"><h4>Open Requests</h4><div class="ew-metric">${Number(metrics.openRequests || 0)}</div><div class="ew-sub">Waiting for review or decision</div></div><div class="ew-card"><h4>Notifications</h4><div class="ew-metric">${Number(metrics.unreadNotifications || 0)}</div><div class="ew-sub">Unread workplace updates</div></div><div class="ew-card"><h4>Acknowledgments</h4><div class="ew-metric">${Number(metrics.pendingAcknowledgments || 0)}</div><div class="ew-sub">Feedback requiring acknowledgment</div></div><div class="ew-card"><h4>Recognition</h4><div class="ew-metric">${Number(metrics.recognitionCount || 0)}</div><div class="ew-sub">Recognition records in Employee 360</div></div></div>
      <div class="ew-grid"><div class="ew-card"><h3>Employee Profile</h3><div><strong>${esc(state.employee.displayName)}</strong></div><div class="ew-sub">${esc(state.employee.jobTitle || label(state.employee.role))}${state.employee.department ? ` · ${esc(state.employee.department)}` : ''}</div><div class="ew-sub">Employment status: ${esc(state.employee.employmentStatus || 'ACTIVE')}</div><div class="ew-form-actions"><button class="ew-btn" data-new-type="PROFILE_CHANGE">Request Profile Update</button></div></div><div class="ew-card"><h3>My Manager</h3>${manager ? `<div><strong>${esc(manager.displayName)}</strong></div><div class="ew-sub">${esc(manager.email || '')}</div>` : '<div class="ew-sub">A supervisor has not been assigned in Employee 360.</div>'}<div class="ew-form-actions"><button class="ew-btn" data-new-type="GENERAL_REQUEST">Contact Through Workflow</button></div></div></div>
      <div class="ew-section"><h3>Requests Requiring Attention</h3>${urgent.length ? `<div class="ew-list">${urgent.map(requestRow).join('')}</div>` : '<div class="ew-empty">You have no open requests.</div>'}</div>
      ${pendingFeedback.length ? `<div class="ew-section"><h3>Feedback Awaiting Acknowledgment</h3><div class="ew-list">${pendingFeedback.map(feedbackRow).join('')}</div></div>` : ''}
      ${unread.length ? `<div class="ew-section"><h3>Unread Notifications</h3><div class="ew-list">${unread.map(notificationRow).join('')}</div></div>` : ''}`;
  }

  function requestRow(request) {
    return `<div class="ew-row"><div class="ew-row-main"><div class="ew-title">${esc(request.title)}</div><div class="ew-sub">${label(request.requestType)} · Submitted ${dateTime(request.submittedAt || request.createdAt)} · Priority ${label(request.priority)}</div><div style="margin-top:5px"><span class="ew-badge ${statusClass(request.status)}">${label(request.status)}</span></div></div><div class="ew-row-actions"><button class="ew-btn" data-view-request="${esc(request.id)}">View Workflow</button>${['SUBMITTED','IN_REVIEW'].includes(request.status) ? `<button class="ew-btn danger" data-cancel-request="${esc(request.id)}">Cancel</button>` : ''}</div></div>`;
  }

  function requestsPanel() {
    return `<div class="ew-actions" style="margin-bottom:14px"><button class="ew-btn primary" id="ewRequestFromList">Submit New Request</button></div>${state.requests.length ? `<div class="ew-list">${state.requests.map(requestRow).join('')}</div>` : '<div class="ew-empty"><h3>No requests yet</h3><p>Use New Request to submit profile changes, time off, schedule changes, document corrections, training support, HR support, or another workplace request.</p></div>'}`;
  }

  function feedbackRow(item) {
    return `<div class="ew-row ${item.requiresAcknowledgment && !item.acknowledgedAt ? 'ew-feedback-ack' : ''}"><div class="ew-row-main"><div class="ew-title">${esc(item.subject)}</div><div class="ew-sub">${label(item.kind)} · From ${esc(item.authorName || 'Manager')} · ${dateTime(item.createdAt)}</div><div style="margin-top:7px;white-space:pre-wrap">${esc(item.body)}</div>${item.followUpDate ? `<div class="ew-sub">Follow-up date: ${date(item.followUpDate)}</div>` : ''}</div><div class="ew-row-actions">${item.requiresAcknowledgment ? item.acknowledgedAt ? `<span class="ew-badge approved">Acknowledged ${date(item.acknowledgedAt)}</span>` : `<button class="ew-btn primary" data-ack-feedback="${esc(item.id)}">Acknowledge</button>` : '<span class="ew-badge">No acknowledgment required</span>'}</div></div>`;
  }

  function feedbackPanel() {
    return state.feedback.length ? `<div class="ew-alert"><strong>Employee-visible feedback:</strong> Check-ins, coaching, goals, and development feedback shared with you are retained in Employee 360. Acknowledgment confirms receipt, not necessarily agreement.</div><div class="ew-list">${state.feedback.map(feedbackRow).join('')}</div>` : '<div class="ew-empty"><h3>No employee-visible feedback</h3><p>Manager check-ins, coaching notes, goals, or feedback shared with you will appear here.</p></div>';
  }

  function recognitionPanel() {
    return state.recognition.length ? `<div class="ew-grid">${state.recognition.map(item => `<div class="ew-card ew-recognition"><h3>${esc(item.title)}</h3><div><span class="ew-badge approved">${label(item.category)}</span>${Number(item.points || 0) ? `<span class="ew-badge">${Number(item.points)} points</span>` : ''}</div><p style="margin:9px 0;white-space:pre-wrap">${esc(item.message)}</p><div class="ew-sub">Recognized by ${esc(item.nominatorName || 'Sulandra Health')} · ${date(item.awardDate)}</div></div>`).join('')}</div>` : '<div class="ew-empty"><h3>No recognition records yet</h3><p>Recognition for teamwork, compassion, safety, leadership, reliability, milestones, and excellence will appear here.</p></div>';
  }

  function notificationRow(item) {
    return `<div class="ew-row"><div class="ew-row-main"><div class="ew-title">${esc(item.title)}</div><div class="ew-sub">${label(item.notificationType)} · ${dateTime(item.createdAt)} · Email ${label(item.emailStatus)}</div><div style="margin-top:7px;white-space:pre-wrap">${esc(item.message)}</div></div><div class="ew-row-actions"><span class="ew-badge ${statusClass(item.status)}">${label(item.status)}</span>${item.status === 'UNREAD' ? `<button class="ew-btn" data-read-notification="${esc(item.id)}">Mark Read</button>` : ''}${item.actionUrl ? `<a class="ew-btn" href="${esc(item.actionUrl)}">Open</a>` : ''}</div></div>`;
  }

  function notificationsPanel() {
    return `<div class="ew-actions" style="margin-bottom:14px"><button class="ew-btn" id="ewReadAll">Mark All Read</button></div>${state.notifications.length ? `<div class="ew-list">${state.notifications.map(notificationRow).join('')}</div>` : '<div class="ew-empty"><h3>No workplace notifications</h3><p>Approval requests, decisions, feedback, recognition, and other Employee 360 notices will appear here.</p></div>'}`;
  }

  function wireCurrentPanel() {
    document.querySelectorAll('[data-new-type]').forEach(button => button.onclick = () => showNewRequest(button.dataset.newType));
    document.querySelectorAll('[data-view-request]').forEach(button => button.onclick = () => viewRequest(button.dataset.viewRequest));
    document.querySelectorAll('[data-cancel-request]').forEach(button => button.onclick = () => cancelRequest(button.dataset.cancelRequest));
    document.querySelectorAll('[data-ack-feedback]').forEach(button => button.onclick = () => acknowledgeFeedback(button.dataset.ackFeedback));
    document.querySelectorAll('[data-read-notification]').forEach(button => button.onclick = () => readNotification(button.dataset.readNotification));
    const newRequest = document.getElementById('ewRequestFromList');
    if (newRequest) newRequest.onclick = () => showNewRequest();
    const readAll = document.getElementById('ewReadAll');
    if (readAll) readAll.onclick = markAllRead;
  }

  function requestTypeFields(type) {
    const e = state.employee || {};
    if (type === 'PROFILE_CHANGE') return `<div class="ew-alert">Enter only the fields that need to change. Your current Employee 360 record remains unchanged until the approval workflow is completed.</div><div class="ew-grid"><label>Display or legal name<input class="ew-input" name="displayName" value="${esc(e.displayName || '')}"></label><label>Personal email<input class="ew-input" type="email" name="personalEmail"></label><label>Phone<input class="ew-input" name="phone"></label><label>Alternate phone<input class="ew-input" name="alternatePhone"></label><label>Street address<input class="ew-input" name="streetAddress"></label><label>City<input class="ew-input" name="city"></label><label>State<input class="ew-input" name="state"></label><label>ZIP code<input class="ew-input" name="zipCode"></label><label>Emergency contact name<input class="ew-input" name="emergencyContactName"></label><label>Emergency contact phone<input class="ew-input" name="emergencyContactPhone"></label></div>`;
    if (type === 'TIME_OFF' || type === 'SCHEDULE_CHANGE') return `<div class="ew-grid"><label>Start date and time<input class="ew-input" type="datetime-local" name="startAt" required></label><label>End date and time<input class="ew-input" type="datetime-local" name="endAt" required></label><label style="grid-column:1/-1">Reason<textarea class="ew-textarea" name="reason" required></textarea></label>${type === 'SCHEDULE_CHANGE' ? '<label style="grid-column:1/-1">Shift ID, when applicable<input class="ew-input" name="shiftId" placeholder="Optional scheduled shift identifier"></label>' : ''}</div>`;
    if (type === 'DOCUMENT_CORRECTION') return `<div class="ew-grid"><label>Employee document ID<input class="ew-input" name="documentId" required placeholder="Use the document ID shown in My Employee File"></label><label>Corrected category<input class="ew-input" name="category"></label><label>Corrected title<input class="ew-input" name="documentTitle"></label><label>Issue date<input class="ew-input" type="date" name="issueDate"></label><label>Expiration date<input class="ew-input" type="date" name="expirationDate"></label><label style="grid-column:1/-1">Correction reason<textarea class="ew-textarea" name="reason" required></textarea></label><label style="grid-column:1/-1">Corrected notes<textarea class="ew-textarea" name="documentNotes"></textarea></label></div>`;
    if (type === 'TRAINING_SUPPORT') return `<div class="ew-grid"><label>Course code<input class="ew-input" name="courseCode" placeholder="Example: SH-CAP-101"></label><label>Course title<input class="ew-input" name="courseTitle"></label><label style="grid-column:1/-1">Support needed<textarea class="ew-textarea" name="reason" required></textarea></label></div>`;
    return '<div class="ew-alert">Describe the support, decision, information, or workplace action you need. Sensitive Human Resources requests are routed through the configured approval chain.</div>';
  }

  function showNewRequest(preselected = '') {
    const available = state.availableRequestTypes || [];
    if (!available.length) return setStatus('No employee request workflows are currently available.', true);
    const selected = available.some(item => item.requestType === preselected) ? preselected : available[0].requestType;
    openModal('Submit Employee Request', `<form id="ewRequestForm" class="ew-form"><div class="ew-grid three"><label>Request type<select class="ew-select" name="requestType" id="ewRequestType">${available.map(item => `<option value="${esc(item.requestType)}" ${item.requestType===selected?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label><label>Priority<select class="ew-select" name="priority"><option>LOW</option><option selected>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label><label>Request title<input class="ew-input" name="title" required maxlength="240"></label></div><label style="display:block;margin-top:12px">Summary and details<textarea class="ew-textarea" name="description" required maxlength="10000"></textarea></label><div id="ewRequestFields" class="ew-section">${requestTypeFields(selected)}</div><div class="ew-form-actions"><button class="ew-btn primary" type="submit">Submit for Approval</button><button class="ew-btn" type="button" id="ewCancelForm">Cancel</button></div></form>`);
    const typeSelect = document.getElementById('ewRequestType');
    typeSelect.onchange = () => { document.getElementById('ewRequestFields').innerHTML = requestTypeFields(typeSelect.value); };
    document.getElementById('ewCancelForm').onclick = closeModal;
    document.getElementById('ewRequestForm').onsubmit = submitRequest;
  }

  function payloadFromForm(form, type) {
    const data = new FormData(form);
    const take = name => String(data.get(name) || '').trim();
    if (type === 'PROFILE_CHANGE') {
      const payload = {};
      ['displayName','personalEmail','phone','alternatePhone','streetAddress','city','state','zipCode','emergencyContactName','emergencyContactPhone'].forEach(name => {
        const value = take(name);
        if (value) payload[name] = value;
      });
      return payload;
    }
    if (type === 'TIME_OFF' || type === 'SCHEDULE_CHANGE') return { startAt: take('startAt'), endAt: take('endAt'), reason: take('reason'), ...(take('shiftId') ? {shiftId:take('shiftId')} : {}) };
    if (type === 'DOCUMENT_CORRECTION') {
      const payload = { documentId: take('documentId'), reason: take('reason') };
      if (take('category')) payload.category = take('category');
      if (take('documentTitle')) payload.title = take('documentTitle');
      if (take('issueDate')) payload.issueDate = take('issueDate');
      if (take('expirationDate')) payload.expirationDate = take('expirationDate');
      if (take('documentNotes')) payload.notes = take('documentNotes');
      return payload;
    }
    if (type === 'TRAINING_SUPPORT') return { courseCode: take('courseCode') || null, courseTitle: take('courseTitle') || null, reason: take('reason') };
    return {};
  }

  async function submitRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const type = String(data.get('requestType'));
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/employee/me/collaboration/requests', {
        method: 'POST',
        body: JSON.stringify({
          requestType: type,
          priority: String(data.get('priority')),
          title: String(data.get('title') || '').trim(),
          description: String(data.get('description') || '').trim(),
          payload: payloadFromForm(form, type),
        })
      });
      closeModal();
      activeTab = 'requests';
      await load();
      setStatus('Your request was submitted and routed through the configured approval workflow.');
    } catch (error) {
      alert(error.message);
    } finally { button.disabled = false; }
  }

  async function viewRequest(id) {
    try {
      selectedRequest = await api(`/api/employee/me/collaboration/requests/${encodeURIComponent(id)}`);
      const { request, approvals, comments, events } = selectedRequest;
      openModal(request.title, `<div class="ew-grid three"><div class="ew-card"><h4>Status</h4><span class="ew-badge ${statusClass(request.status)}">${label(request.status)}</span></div><div class="ew-card"><h4>Request Type</h4><strong>${label(request.requestType)}</strong></div><div class="ew-card"><h4>Submitted</h4><strong>${dateTime(request.submittedAt)}</strong></div></div><div class="ew-section"><h3>Request Details</h3><div class="ew-card"><p style="white-space:pre-wrap">${esc(request.description)}</p><div class="ew-sub">Priority: ${label(request.priority)}</div></div></div><div class="ew-section"><h3>Approval Workflow</h3><div class="ew-timeline">${approvals.map(step => `<div class="ew-step"><strong>${esc(step.label || label(step.approverType))}</strong> <span class="ew-badge ${statusClass(step.status)}">${label(step.status)}</span><div class="ew-sub">Sequence ${step.sequence} · ${label(step.approvalMode)} approval${step.decisionNotes ? ` · ${esc(step.decisionNotes)}` : ''}</div></div>`).join('') || '<div>No approval steps.</div>'}</div></div><div class="ew-section"><h3>Comments</h3><div class="ew-list">${comments.map(comment => `<div class="ew-row"><div><div class="ew-title">${esc(comment.authorName || 'Employee 360')}</div><div class="ew-sub">${dateTime(comment.createdAt)}</div><div style="margin-top:6px;white-space:pre-wrap">${esc(comment.body)}</div></div></div>`).join('') || '<div class="ew-row">No comments.</div>'}</div><form id="ewRequestCommentForm" class="ew-form" style="margin-top:12px"><label>Add comment<textarea class="ew-textarea" name="body" required></textarea></label><div class="ew-form-actions"><button class="ew-btn primary" type="submit">Add Comment</button></div></form></div><div class="ew-section"><h3>Audit Timeline</h3><div class="ew-timeline">${events.map(item => `<div class="ew-step"><strong>${label(item.eventType)}</strong><div class="ew-sub">${dateTime(item.createdAt)}</div></div>`).join('')}</div></div>`);
      document.getElementById('ewRequestCommentForm').onsubmit = addRequestComment;
    } catch (error) { setStatus(error.message, true); }
  }

  async function addRequestComment(event) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get('body') || '').trim();
    if (!body || !selectedRequest) return;
    try {
      await api(`/api/employee/me/collaboration/requests/${encodeURIComponent(selectedRequest.request.id)}/comments`, { method:'POST', body:JSON.stringify({body}) });
      await viewRequest(selectedRequest.request.id);
      await load();
    } catch (error) { alert(error.message); }
  }

  async function cancelRequest(id) {
    if (!confirm('Cancel this employee request? Pending approval steps will be closed.')) return;
    try {
      await api(`/api/employee/me/collaboration/requests/${encodeURIComponent(id)}/cancel`, {method:'POST'});
      await load();
      setStatus('The request was cancelled.');
    } catch (error) { setStatus(error.message, true); }
  }

  async function acknowledgeFeedback(id) {
    if (!confirm('Acknowledge that you received and reviewed this feedback?')) return;
    try {
      await api(`/api/employee/me/collaboration/feedback/${encodeURIComponent(id)}/acknowledge`, {method:'POST'});
      await load();
      setStatus('Feedback acknowledged.');
    } catch (error) { setStatus(error.message, true); }
  }

  async function readNotification(id) {
    try {
      await api(`/api/employee/me/collaboration/notifications/${encodeURIComponent(id)}/read`, {method:'PATCH'});
      await load();
    } catch (error) { setStatus(error.message, true); }
  }

  async function markAllRead() {
    try {
      await api('/api/employee/me/collaboration/notifications/read-all', {method:'POST'});
      await load();
      setStatus('All workplace notifications were marked as read.');
    } catch (error) { setStatus(error.message, true); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
