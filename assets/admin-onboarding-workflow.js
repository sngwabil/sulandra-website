(() => {
  'use strict';
  const registry = window.SulandraAdminRouteRegistry;
  const stages = registry?.onboardingLifecycle || [];
  if (!stages.length) {
    console.error('[Sulandra Onboarding] Lifecycle registry is unavailable.');
    return;
  }
  let activeStage = 'overview';
  let activeStatuses = [];
  let filtering = false;

  const esc = value => String(value ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const statusOf = row => {
    const rendered = row?.querySelector?.('.status-pill')?.textContent || '';
    const status = String(row?.dataset?.lifecycleStatus || rendered)
      .trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
    if (row && status) row.dataset.lifecycleStatus = status;
    return status;
  };

  function installStyles() {
    if (document.getElementById('adminOnboardingWorkflowStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminOnboardingWorkflowStyles';
    style.textContent = `
      .onboarding-tabs.lifecycle-tabs{display:flex;gap:7px;overflow:auto;flex-wrap:nowrap;padding:4px 0 10px;scrollbar-width:thin}
      .onboarding-tabs.lifecycle-tabs .onboarding-tab{flex:0 0 auto;border-radius:10px;padding:9px 12px;font-size:12px}
      .onboarding-overview-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px}
      .onboarding-stage-card{display:flex;flex-direction:column;gap:8px;min-height:142px;border:1px solid #d4e2ed;border-radius:15px;background:#fff;padding:15px;text-align:left;cursor:pointer;color:#173b5d;box-shadow:0 6px 18px rgba(8,58,103,.06)}
      .onboarding-stage-card:hover{border-color:#70afd5;transform:translateY(-1px)}
      .onboarding-stage-card strong{font-size:15px}.onboarding-stage-card span{color:#627b90;font-size:11px;line-height:1.4}
      .onboarding-stage-count{display:inline-flex!important;align-items:center;justify-content:center;width:max-content;min-width:34px;padding:4px 8px;border-radius:999px;background:#e8f4fb!important;color:#075985!important;font-size:15px!important;font-weight:950}
      .onboarding-stage-guidance{display:none;align-items:flex-start;justify-content:space-between;gap:14px;margin:0 0 14px;padding:13px 15px;border:1px solid #c8ddea;border-radius:13px;background:#f5fbff;color:#234b68;font-size:12px}
      .onboarding-stage-guidance.visible{display:flex}.onboarding-stage-guidance strong{display:block;color:#0b4f82;margin-bottom:3px}
      .onboarding-stage-guidance a{white-space:nowrap;text-decoration:none;border-radius:9px;background:#075985;color:#fff;padding:8px 11px;font-weight:850}
      @media(max-width:980px){.onboarding-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:600px){.onboarding-overview-grid{grid-template-columns:1fr}.onboarding-stage-guidance{display:none}.onboarding-stage-guidance.visible{display:grid}}
    `;
    document.head.appendChild(style);
  }

  function stageDescription(stage) {
    return ({
      openings:'Create, publish, close and archive job openings.',
      applications:'New applications waiting for initial review.',
      screening:'Application review, requested documents and Ohio screening handoff.',
      interviews:'Applicants currently in the interview workflow.',
      offers:'Offer preparation, signatures and acceptance review.',
      prehire:'Final pre-employment review before provisioning an employee.',
      activation:'Provisioned employees ready for orientation, learning and Employee 360.',
      archive:'Retained applicants and archived job openings.',
    })[stage.id] || 'Complete the next controlled hiring step.';
  }

  function countFor(stage) {
    const statuses = new Set(stage.statuses || []);
    if (stage.id === 'openings') return document.querySelectorAll('#jobOpeningList .opening-card').length;
    if (stage.id === 'archive') return document.querySelectorAll('#archivedApplicantTable tr').length;
    if (!statuses.size) return 0;
    return [...document.querySelectorAll('#applicantTable tr')].filter(row => statuses.has(statusOf(row))).length;
  }

  function ensureOverview() {
    if (document.getElementById('onboarding-overview')) return;
    const applicants = document.getElementById('onboarding-applicants');
    if (!applicants?.parentElement) return;
    const overview = document.createElement('div');
    overview.className = 'onboarding-panel';
    overview.id = 'onboarding-overview';
    const visibleStages = stages.filter(stage => stage.id !== 'overview');
    overview.innerHTML = `
      <section class="card">
        <h1>Hiring & Onboarding Overview</h1>
        <p class="sub">Follow one controlled path from an approved opening to an activated employee. Every record remains scoped to the selected company.</p>
        <div class="onboarding-overview-grid">
          ${visibleStages.map(stage => `<button class="onboarding-stage-card" type="button" data-open-onboarding-stage="${esc(stage.id)}"><span class="onboarding-stage-count" data-stage-count="${esc(stage.id)}">0</span><strong>${esc(stage.label)}</strong><span>${esc(stageDescription(stage))}</span></button>`).join('')}
        </div>
      </section>
    `;
    applicants.parentElement.insertBefore(overview,applicants);
  }

  function renderTabs() {
    const tabs = document.querySelector('#module-onboarding .onboarding-tabs');
    if (!tabs) return;
    tabs.classList.add('lifecycle-tabs');
    tabs.innerHTML = stages.map(stage => `<button class="onboarding-tab${stage.id === activeStage ? ' active' : ''}" type="button" role="tab" aria-selected="${stage.id === activeStage}" data-onboarding-stage="${esc(stage.id)}">${esc(stage.label)}</button>`).join('');
    tabs.querySelectorAll('[data-onboarding-stage]').forEach(button => button.addEventListener('click',() => activateStage(button.dataset.onboardingStage)));
  }

  function ensureStatusOptions() {
    const select = document.getElementById('statusFilter');
    if (!select) return;
    const options = [
      ['OFFER_ACCEPTED','Offer Accepted'],
      ['HIRE','Pre-employment / Hire Review'],
    ];
    options.forEach(([value,label]) => {
      if ([...select.options].some(option => option.value === value)) return;
      select.add(new Option(label,value));
    });
  }

  function guidance(stage) {
    const map = {
      applications:{title:'Initial application review',text:'Open an applicant folder to review submitted information and documents.',href:'',label:''},
      screening:{title:'Review and screening',text:'Request missing documents here, then use the Ohio screening workspace for background and exclusion evidence.',href:'/employee-ohio-screening.html',label:'Open Ohio Screening'},
      interviews:{title:'Interview workflow',text:'Open the applicant folder and choose Interview to schedule from the shared interview calendar.',href:'',label:''},
      offers:{title:'Offer review',text:'Prepare the employment offer, monitor signature progress and verify acceptance inside the applicant folder.',href:'',label:''},
      prehire:{title:'Pre-employment gate',text:'Confirm the signed offer and required screening evidence before provisioning the employee.',href:'/employee-ohio-screening.html',label:'Review Screening'},
      activation:{title:'Activation and orientation',text:'Provisioned employees continue in Employee 360 and the Learning Center for orientation and assigned training.',href:'/employee360.html',label:'Open Employee 360'},
    };
    return map[stage.id] || null;
  }

  function updateGuidance(stage) {
    const panel = document.getElementById('onboarding-applicants');
    if (!panel) return;
    let node = document.getElementById('onboardingStageGuidance');
    if (!node) {
      node = document.createElement('div');
      node.id = 'onboardingStageGuidance';
      node.className = 'onboarding-stage-guidance';
      panel.prepend(node);
    }
    const data = guidance(stage);
    node.classList.toggle('visible',Boolean(data));
    if (!data) { node.replaceChildren(); return; }
    node.innerHTML = `<div><strong>${esc(data.title)}</strong><span>${esc(data.text)}</span></div>${data.href ? `<a href="${esc(data.href)}">${esc(data.label)}</a>` : ''}`;
  }

  function showPanel(id) {
    document.querySelectorAll('#module-onboarding .onboarding-panel').forEach(panel => panel.classList.toggle('active',panel.id === `onboarding-${id}`));
  }

  function applyStageFilter() {
    if (filtering) return;
    filtering = true;
    try {
      const rows = [...document.querySelectorAll('#applicantTable tr')];
      const allowed = new Set(activeStatuses);
      let visible = 0;
      rows.forEach(row => {
        row.hidden = allowed.size > 0 && !allowed.has(statusOf(row));
        if (!row.hidden) visible += 1;
      });
      const count = document.getElementById('countLabel');
      if (count && activeStage !== 'overview' && activeStage !== 'openings' && activeStage !== 'archive') {
        count.textContent = `${visible} application${visible === 1 ? '' : 's'} in this stage`;
      }
      updateCounts();
    } finally {
      filtering = false;
    }
  }

  function activateStage(id) {
    const stage = stages.find(item => item.id === id) || stages[0];
    activeStage = stage.id;
    activeStatuses = [...(stage.statuses || [])];
    document.querySelectorAll('[data-onboarding-stage]').forEach(button => {
      const selected = button.dataset.onboardingStage === activeStage;
      button.classList.toggle('active',selected);
      button.setAttribute('aria-selected',String(selected));
    });
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter && activeStatuses.length) {
      statusFilter.value = 'all';
      statusFilter.dispatchEvent(new Event('change',{bubbles:true}));
    }
    if (stage.id === 'overview') showPanel('overview');
    else showPanel(stage.panel || 'applicants');
    updateGuidance(stage);
    window.setTimeout(applyStageFilter,0);
    sessionStorage.setItem('sulandra:admin:onboarding-stage',activeStage);
  }

  function updateCounts() {
    stages.forEach(stage => {
      const node = document.querySelector(`[data-stage-count="${CSS.escape(stage.id)}"]`);
      if (node) node.textContent = String(countFor(stage));
    });
  }

  function bindObservers() {
    const targets = [document.getElementById('applicantTable'),document.getElementById('archivedApplicantTable'),document.getElementById('jobOpeningList')].filter(Boolean);
    if (!targets.length || !('MutationObserver' in window)) return;
    const observer = new MutationObserver(() => {
      window.setTimeout(() => { applyStageFilter(); updateCounts(); },0);
    });
    targets.forEach(target => observer.observe(target,{childList:true,subtree:true}));
  }

  function bind() {
    installStyles();
    ensureOverview();
    renderTabs();
    ensureStatusOptions();
    const hero = document.querySelector('#module-onboarding .onboarding-hero');
    if (hero) {
      const title = hero.querySelector('h1');
      const copy = hero.querySelector('p');
      if (title) title.textContent = 'Hiring & Onboarding';
      if (copy) copy.textContent = 'Manage the complete selected-company hiring lifecycle—from approved openings and applications through screening, interviews, offers, employee activation and orientation.';
    }
    document.querySelectorAll('[data-open-onboarding-stage]').forEach(button => button.addEventListener('click',() => activateStage(button.dataset.openOnboardingStage)));
    bindObservers();
    const saved = sessionStorage.getItem('sulandra:admin:onboarding-stage');
    activateStage(stages.some(stage => stage.id === saved) ? saved : 'overview');
  }

  window.SulandraOnboardingLifecycle = Object.freeze({
    activate:activateStage,
    active:() => activeStage,
    statuses:() => [...activeStatuses],
  });

  // Loaded after the complete Admin markup and before the legacy controller.
  // Bind now so counts and observers are ready before Railway data is rendered.
  if (document.body) bind();
  else document.addEventListener('DOMContentLoaded',bind,{once:true});
})();
