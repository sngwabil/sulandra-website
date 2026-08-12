(() => {
  'use strict';
  const CONTRACT='20260812-spire-chart-review-ownership-1';

  function patientId(){
    return sessionStorage.getItem('spire:patientId') || new URLSearchParams(String(location.hash||'').replace(/^#/,'')).get('patient') || '';
  }

  function activate(){
    document.querySelectorAll('[data-chart-tab]').forEach(button=>button.classList.toggle('active',button.dataset.chartTab==='chart-review'));
    const id=patientId();
    if(id) history.replaceState(null,'',`#patient=${encodeURIComponent(id)}&tab=chart-review`);
  }

  function render(attempt=0,force=true){
    if(!window.SpireChartReviewV2?.load){
      if(attempt<100)setTimeout(()=>render(attempt+1,force),25);
      return false;
    }
    activate();
    window.SpireChartReviewV2.load(force);
    return true;
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-chart-tab="chart-review"]');
    if(!button)return;
    // Capture on document before the generic chart-tab handler. Chart Review has
    // its own structured renderer and must not fall through to generic JSON/detail
    // rendering that can overwrite it a moment later.
    event.preventDefault();
    event.stopImmediatePropagation();
    render(0,true);
  },true);

  document.addEventListener('spire:chart-tab-selected',event=>{
    if(String(event.detail?.tab||'')!=='chart-review')return;
    render(0,false);
  });

  // Patient deep links can land on Chart Review already active before the dedicated
  // module is loaded. Detect that state once the dynamic master runtime arrives.
  const requested=()=>new URLSearchParams(String(location.hash||'').replace(/^#/,'')).get('tab')||'';
  if(requested()==='chart-review')setTimeout(()=>render(0,false),0);

  window.SpireChartReviewOwnership=Object.freeze({contract:CONTRACT,render:()=>render(0,true)});
})();