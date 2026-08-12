(() => {
  'use strict';

  const contract='20260812-spire-specialized-tab-ownership-2';
  const owners={
    'chart-review':{
      ready:()=>Boolean(window.SpireChartReviewV2?.load),
      run:()=>window.SpireChartReviewV2?.load?.(true),
    },
    assessments:{
      ready:()=>Boolean(window.SpireAssessmentsFlowsheets?.renderAssessments),
      run:()=>window.SpireAssessmentsFlowsheets?.renderAssessments?.(),
    },
    vitals:{
      ready:()=>Boolean(window.SpireAssessmentsFlowsheets?.renderFlowsheets),
      run:()=>window.SpireAssessmentsFlowsheets?.renderFlowsheets?.(),
    },
  };

  function patientId(){
    return sessionStorage.getItem('spire:patientId') || new URLSearchParams(location.hash.replace(/^#/,'')).get('patient') || '';
  }

  function activate(tab){
    document.querySelectorAll('[data-chart-tab]').forEach(button=>button.classList.toggle('active',button.dataset.chartTab===tab));
    const id=patientId();
    if(id) history.replaceState(null,'',`#patient=${encodeURIComponent(id)}&tab=${encodeURIComponent(tab)}`);
  }

  function signal(tab){
    document.dispatchEvent(new CustomEvent('spire:chart-tab-selected',{
      detail:{tab,patientId:patientId()},
    }));
  }

  function renderOwned(tab,attempt=0){
    const owner=owners[tab];
    if(!owner)return false;
    if(!owner.ready()){
      if(attempt<80)setTimeout(()=>renderOwned(tab,attempt+1),25);
      return false;
    }
    owner.run();
    signal(tab);
    return true;
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-chart-tab]');
    const tab=button?.dataset.chartTab;
    if(!tab || !owners[tab])return;

    // Dedicated tabs must never fall through to the generic /patients/:id/:tab
    // renderer. Chart Review, Clinical Assessments and the legacy Vitals activity
    // each own their structured UI and persistence contract.
    event.preventDefault();
    event.stopImmediatePropagation();
    activate(tab);
    queueMicrotask(()=>renderOwned(tab));
  },true);

  // Deep links can arrive with the requested tab already active, so there may be
  // no click event for the dedicated owner to intercept. The patient-open guard
  // emits this signal after chart activation; render the owned surface directly.
  document.addEventListener('spire:chart-tab-selected',event=>{
    const tab=String(event.detail?.tab||'');
    if(!owners[tab])return;
    activate(tab);
    renderOwned(tab);
  });

  window.SpireSpecializedTabOwnership={contract,renderOwned};
})();