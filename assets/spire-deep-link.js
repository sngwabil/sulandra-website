(() => {
  'use strict';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function request(){
    const query=new URLSearchParams(location.search);
    const hash=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
    return {
      patientId:query.get('patientId')||query.get('patient')||hash.get('patient')||hash.get('patientId')||'',
      tab:query.get('tab')||hash.get('tab')||'',
    };
  }

  async function waitFor(selector,timeoutMs=12000){
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      const node=document.querySelector(selector);
      if(node)return node;
      await sleep(100);
    }
    return null;
  }

  async function waitForAuthorizedPatient(census,patientId,timeoutMs=12000){
    const selector=`[data-patient-id="${CSS.escape(patientId)}"]`;
    const started=Date.now();
    while(Date.now()-started<timeoutMs){
      census.click();
      const row=document.querySelector(selector);
      if(row)return row;
      await sleep(150);
    }
    return null;
  }

  async function directOpenRequestedChart(){
    const {patientId,tab}=request();
    if(!patientId)return false;
    const started=Date.now();
    while(Date.now()-started<12000){
      if(window.SpireChartReady?.ensurePatientChart){
        return Boolean(await window.SpireChartReady.ensurePatientChart(patientId,tab));
      }
      await sleep(80);
    }
    return false;
  }

  async function fallbackOpenRequestedChart(){
    const {patientId,tab}=request();
    if(!patientId)return;

    // BUSINESS_UAT_DIRECT_CHART_OPEN: the chart-readiness coordinator owns the
    // native patient open and requested-tab handoff after the shell exists.
    if(await directOpenRequestedChart())return;

    const census=await waitFor('[data-workspace="census"]');
    if(!census)return;
    const row=await waitForAuthorizedPatient(census,patientId);
    if(!row)return;
    row.click();
    if(tab){
      const button=await waitFor(`[data-chart-tab="${CSS.escape(tab)}"]`);
      if(button)button.click();
    }
  }

  function recoverVisiblePatientClick(event){
    const row=event.target?.closest?.('[data-patient-id]');
    const patientId=row?.dataset?.patientId||'';
    if(!patientId)return;
    // BUSINESS_UAT_PATIENT_CLICK_RECOVERY: normal census/schedule clicks use
    // the same readiness coordinator as deep links, eliminating race-specific
    // patient-opening behavior.
    setTimeout(()=>window.SpireChartReady?.ensurePatientChart?.(patientId).catch(()=>{}),0);
  }

  document.addEventListener('click',recoverVisiblePatientClick,true);
  window.addEventListener('DOMContentLoaded',()=>fallbackOpenRequestedChart().catch(()=>{}),{once:true});
  if(document.readyState!=='loading')fallbackOpenRequestedChart().catch(()=>{});
})();
