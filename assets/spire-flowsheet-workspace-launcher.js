(()=>{'use strict';
  const patientId=()=>sessionStorage.getItem('spire:patientId')||new URLSearchParams(location.hash.replace(/^#/,'' )).get('patient')||new URLSearchParams(location.search).get('patientId')||'';
  const onStandaloneMaster=()=>location.pathname.toLowerCase().replace(/\/+$/,'')==='/spire/master.html';
  const openFlowsheets=event=>{
    event?.preventDefault?.();event?.stopPropagation?.();
    const id=patientId();
    if(!id){alert('Open a patient chart first.');return;}
    sessionStorage.setItem('spire:patientId',id);

    // The standalone master owns the canonical inline flowsheet workspace.
    // Never navigate away to the older dedicated /spire/flowsheets.html page
    // when this compatibility asset is present on /spire/master.html.
    if(onStandaloneMaster()){
      const tab=document.querySelector('.chart-tab[data-view="flowsheets-view"]');
      if(tab instanceof HTMLElement)tab.click();
      else{
        document.querySelectorAll('.chart-tab').forEach(node=>node.classList.toggle('active',node.getAttribute('data-view')==='flowsheets-view'));
        document.querySelectorAll('.workspace-view').forEach(node=>node.classList.toggle('active',node.id==='flowsheets-view'));
      }
      window.SpireMasterFlowsheetGrid?.refresh?.();
      return;
    }

    // Compatibility behavior for the older SPIRE shell only.
    location.href=`/spire/flowsheets.html?patientId=${encodeURIComponent(id)}`;
  };
  function installTabButton(){
    // /spire/master.html already contains its authoritative Flowsheets tab.
    if(onStandaloneMaster())return;
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
    anchor.insertAdjacentElement('afterend',button);
  }
  function installQuickAction(){
    // The standalone master already owns its Quick Actions rail.
    if(onStandaloneMaster())return;
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
