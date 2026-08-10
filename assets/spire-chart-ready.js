(() => {
  'use strict';
  const CONTRACT='20260810-spire-chart-ready-1';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let opening=false;
  let requestedPatientId='';
  let requestedTab='';

  function requestFromLocation(){
    const query=new URLSearchParams(location.search);
    const hash=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
    return {
      patientId:query.get('patientId')||query.get('patient')||hash.get('patientId')||hash.get('patient')||'',
      tab:query.get('tab')||hash.get('tab')||'',
    };
  }

  function shellReady(){
    return Boolean(document.getElementById('spirePatientStrip')&&document.getElementById('spireChartWorkspace'));
  }

  async function waitForShell(timeoutMs=12000){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      if(shellReady()&&typeof window.SpireOpenPatient==='function')return true;
      await sleep(80);
    }
    return false;
  }

  function chartIsOpen(){
    const chart=document.getElementById('spireChartWorkspace');
    const strip=document.getElementById('spirePatientStrip');
    return Boolean(chart&&strip&&!strip.hidden&&chart.querySelector('[data-chart-tab]'));
  }

  function forceChartActive(){
    const chart=document.getElementById('spireChartWorkspace');
    if(!chart)return false;
    document.querySelectorAll('.spire-workspace').forEach(node=>node.classList.remove('active'));
    chart.classList.add('spire-workspace','active');
    document.querySelectorAll('.spire-global-nav [data-workspace].active').forEach(node=>node.classList.remove('active'));
    return true;
  }

  async function selectTab(tab){
    if(!tab)return;
    const started=Date.now();
    while(Date.now()-started<6000){
      const button=document.querySelector(`[data-chart-tab="${CSS.escape(tab)}"]`);
      if(button){
        forceChartActive();
        if(!button.classList.contains('active'))button.click();
        return;
      }
      await sleep(80);
    }
  }

  async function ensurePatientChart(patientId,tab=''){
    patientId=String(patientId||'').trim();
    if(!patientId)return false;
    requestedPatientId=patientId;
    requestedTab=tab||requestedTab||'';
    if(opening)return false;
    opening=true;
    try{
      if(!(await waitForShell()))return false;
      for(let attempt=0;attempt<3;attempt++){
        await window.SpireOpenPatient(patientId);
        for(let probe=0;probe<20;probe++){
          if(chartIsOpen()){
            forceChartActive();
            await selectTab(requestedTab);
            sessionStorage.setItem('spire:patientId',patientId);
            document.body.dataset.spireChartReady='true';
            document.body.dataset.spireChartPatientId=patientId;
            return true;
          }
          await sleep(100);
        }
      }
      return false;
    } finally {
      opening=false;
    }
  }

  function stabilize(){
    if(!requestedPatientId)return;
    if(chartIsOpen())forceChartActive();
  }

  document.addEventListener('click',event=>{
    const row=event.target.closest('[data-patient-id]');
    if(!row)return;
    const patientId=row.dataset.patientId||'';
    if(!patientId)return;
    requestedPatientId=patientId;
    requestedTab='';
    setTimeout(()=>ensurePatientChart(patientId).catch(()=>{}),0);
  });

  const observer=new MutationObserver(()=>stabilize());
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});

  async function start(){
    const initial=requestFromLocation();
    if(initial.patientId)await ensurePatientChart(initial.patientId,initial.tab);
  }

  window.SpireChartReady=Object.freeze({contract:CONTRACT,ensurePatientChart,forceChartActive});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start().catch(()=>{}),{once:true});
  else start().catch(()=>{});
})();
