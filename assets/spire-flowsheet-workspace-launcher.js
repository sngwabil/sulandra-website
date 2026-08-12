(()=>{'use strict';
  const patientId=()=>sessionStorage.getItem('spire:patientId')||new URLSearchParams(location.hash.replace(/^#/,'' )).get('patient')||new URLSearchParams(location.search).get('patientId')||'';
  function install(){
    const vitals=document.querySelector('[data-chart-tab="vitals"]');
    if(!vitals||document.getElementById('spireContinuousFlowsheetButton'))return;
    const button=document.createElement('button');
    button.id='spireContinuousFlowsheetButton';
    button.type='button';
    button.className=vitals.className;
    button.textContent='Flowsheet Grid';
    button.title='Open continuous time-sensitive assessments and flowsheets';
    button.style.cssText='font-weight:900;color:#075f91;position:relative';
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const id=patientId();
      if(!id){alert('Open a patient chart first.');return;}
      sessionStorage.setItem('spire:patientId',id);
      location.href=`/spire/flowsheets.html?patientId=${encodeURIComponent(id)}`;
    });
    vitals.insertAdjacentElement('afterend',button);
  }
  install();
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install()})}).observe(document.documentElement,{childList:true,subtree:true});
})();
