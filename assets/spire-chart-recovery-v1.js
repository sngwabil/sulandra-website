(() => {
  'use strict';
  const CONTRACT='20260810-spire-chart-recovery-1';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let running=false;
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

  function chartOpenFor(patientId){
    const chart=document.getElementById('spireChartWorkspace');
    const strip=document.getElementById('spirePatientStrip');
    if(!chart||!strip||strip.hidden||!chart.querySelector('[data-chart-tab]'))return false;
    const stored=String(sessionStorage.getItem('spire:patientId')||'');
    const marked=String(document.body.dataset.spireChartPatientId||'');
    return !patientId||stored===patientId||marked===patientId;
  }

  function markReady(patientId){
    patientId=String(patientId||'').trim();
    const chart=document.getElementById('spireChartWorkspace');
    const strip=document.getElementById('spirePatientStrip');
    if(!patientId||!chart||!strip||strip.hidden||!chart.querySelector('[data-chart-tab]'))return false;
    document.querySelectorAll('.spire-workspace').forEach(node=>{
      if(node===chart){if(!node.classList.contains('active'))node.classList.add('active');}
      else if(node.classList.contains('active'))node.classList.remove('active');
    });
    sessionStorage.setItem('spire:patientId',patientId);
    document.body.dataset.spireChartReady='true';
    document.body.dataset.spireChartPatientId=patientId;
    document.body.dataset.spireChartRecovery=CONTRACT;
    return true;
  }

  async function selectTab(tab){
    if(!tab)return;
    const started=Date.now();
    while(Date.now()-started<6000){
      const button=document.querySelector(`[data-chart-tab="${CSS.escape(tab)}"]`);
      if(button){if(!button.classList.contains('active'))button.click();return;}
      await sleep(80);
    }
  }

  async function recover(patientId,tab=''){
    patientId=String(patientId||'').trim();
    if(!patientId)return false;
    requestedPatientId=patientId;
    requestedTab=tab||requestedTab||'';
    if(running){
      const started=Date.now();
      while(Date.now()-started<10000){
        if(markReady(patientId)){await selectTab(requestedTab);return true;}
        await sleep(100);
      }
      return false;
    }
    running=true;
    try{
      const started=Date.now();
      while(Date.now()-started<12000){
        if(typeof window.SpireOpenPatient==='function')break;
        await sleep(80);
      }
      if(typeof window.SpireOpenPatient!=='function')return false;
      for(let attempt=0;attempt<3;attempt++){
        if(chartOpenFor(patientId)||markReady(patientId)){
          markReady(patientId);await selectTab(requestedTab);return true;
        }
        try{await window.SpireOpenPatient(patientId);}catch{}
        for(let probe=0;probe<40;probe++){
          if(markReady(patientId)){await selectTab(requestedTab);return true;}
          await sleep(100);
        }
      }
      return false;
    }finally{running=false;}
  }

  document.addEventListener('click',event=>{
    const row=event.target.closest?.('[data-patient-id]');
    const patientId=row?.dataset?.patientId||'';
    if(!patientId)return;
    requestedPatientId=patientId;
    requestedTab='';
    setTimeout(()=>recover(patientId).catch(()=>{}),0);
  },true);

  const observer=new MutationObserver(()=>{
    if(requestedPatientId)markReady(requestedPatientId);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});

  async function start(){
    const request=requestFromLocation();
    if(request.patientId)await recover(request.patientId,request.tab);
  }

  window.SpireChartRecovery=Object.freeze({contract:CONTRACT,recover,markReady});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start().catch(()=>{}),{once:true});
  else start().catch(()=>{});
})();
