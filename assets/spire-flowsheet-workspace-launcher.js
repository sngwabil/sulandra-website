(()=>{'use strict';
  const patientId=()=>sessionStorage.getItem('spire:patientId')||new URLSearchParams(location.hash.replace(/^#/,'' )).get('patient')||new URLSearchParams(location.search).get('patientId')||'';
  const openFlowsheets=event=>{
    event?.preventDefault?.();event?.stopPropagation?.();
    const id=patientId();
    if(!id){alert('Open a patient chart first.');return;}
    sessionStorage.setItem('spire:patientId',id);
    location.href=`/spire/flowsheets.html?patientId=${encodeURIComponent(id)}`;
  };
  function installTabButton(){
    if(document.getElementById('spireContinuousFlowsheetButton'))return;
    const assessments=document.querySelector('[data-chart-tab="assessments"]');
    const fallback=document.querySelector('[data-chart-tab="chart-review"]');
    const anchor=assessments||fallback;
    if(!anchor)return;
    const button=document.createElement('button');
    button.id='spireContinuousFlowsheetButton';
    button.type='button';
    button.className=anchor.className;
    button.textContent='Flowsheets';
    button.title='Open continuous time-sensitive assessments and flowsheets';
    button.style.cssText='font-weight:900;color:#075f91;position:relative;min-width:112px';
    button.addEventListener('click',openFlowsheets);
    anchor.insertAdjacentElement(assessments?'afterend':'afterend',button);
  }
  function installQuickAction(){
    if(document.getElementById('spireQuickFlowsheets'))return;
    const recordVitals=document.getElementById('quickVitals');
    const quickRail=document.querySelector('#spireRightRail .rail-card:last-child');
    if(!recordVitals&&!quickRail)return;
    const button=document.createElement('button');
    button.id='spireQuickFlowsheets';
    button.type='button';
    button.textContent='Flowsheets';
    button.title='Open continuous flowsheet grid';
    button.style.cssText='font-weight:900;color:#075f91';
    button.addEventListener('click',openFlowsheets);
    if(recordVitals)recordVitals.insertAdjacentElement('afterend',button);else quickRail.appendChild(button);
  }
  function install(){installTabButton();installQuickAction();}
  install();
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install()})}).observe(document.documentElement,{childList:true,subtree:true});
})();
