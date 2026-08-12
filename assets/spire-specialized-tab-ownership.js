(() => {
  'use strict';

  const contract='20260811-spire-specialized-tab-ownership-1';
  const owners={
    assessments:()=>window.SpireAssessmentsFlowsheets?.renderAssessments?.(),
    vitals:()=>window.SpireAssessmentsFlowsheets?.renderFlowsheets?.(),
  };

  function patientId(){
    return sessionStorage.getItem('spire:patientId') || new URLSearchParams(location.hash.replace(/^#/,'')).get('patient') || '';
  }

  function activate(tab){
    document.querySelectorAll('[data-chart-tab]').forEach(button=>button.classList.toggle('active',button.dataset.chartTab===tab));
    const id=patientId();
    if(id) history.replaceState(null,'',`#patient=${encodeURIComponent(id)}&tab=${encodeURIComponent(tab)}`);
  }

  function renderOwned(tab,attempt=0){
    const run=owners[tab];
    if(!run)return;
    const result=run();
    if(result===undefined && !window.SpireAssessmentsFlowsheets && attempt<20){
      setTimeout(()=>renderOwned(tab,attempt+1),25);
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-chart-tab]');
    const tab=button?.dataset.chartTab;
    if(!tab || !owners[tab])return;

    // These tabs have dedicated clinical renderers. Stop the generic async chart
    // fallback before it can fetch /patients/:id/:tab and later overwrite the
    // structured UI with JSON after the dedicated renderer has already painted.
    event.preventDefault();
    event.stopImmediatePropagation();
    activate(tab);
    queueMicrotask(()=>renderOwned(tab));
  },true);

  window.SpireSpecializedTabOwnership={contract,renderOwned};
})();
