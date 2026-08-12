(() => {
  'use strict';
  const CONTRACT='20260812-spire-flowsheet-master-1';
  const qs=new URLSearchParams(location.search);
  const patientId=qs.get('patientId')||qs.get('patient')||sessionStorage.getItem('spire:patientId')||'';
  const preferred=qs.get('group')||sessionStorage.getItem('spire:flowsheet:preferred-group')||'';
  if(patientId)sessionStorage.setItem('spire:patientId',patientId);

  function chart(tab='chart-review'){
    if(!patientId){location.href='/spire.html';return}
    location.href=`/spire.html?patientId=${encodeURIComponent(patientId)}#patient=${encodeURIComponent(patientId)}&tab=${encodeURIComponent(tab)}`;
  }
  function addTopActions(){
    const top=document.querySelector('.top');if(!top||top.dataset.spfm==='1')return;top.dataset.spfm='1';
    const refresh=document.getElementById('refresh');
    const spacer=document.createElement('span');spacer.className='spfm-spacer';
    const actions=[['ISP & Goals','care-plan'],['Clinical','assessments'],['MAR / TAR','mar'],['Notes','notes']];
    refresh?.insertAdjacentElement('afterend',spacer);
    for(const [label,tab] of actions){const b=document.createElement('button');b.type='button';b.className='spfm-optional';b.textContent=label;b.onclick=()=>chart(tab);top.appendChild(b)}
  }
  function applyPreferredGroup(attempt=0){
    if(!preferred)return;
    const buttons=[...document.querySelectorAll('#subtabs [data-g]')];
    if(!buttons.length){if(attempt<80)setTimeout(()=>applyPreferredGroup(attempt+1),50);return}
    const target=buttons.find(b=>String(b.dataset.g||'').toLowerCase()===preferred.toLowerCase())||buttons.find(b=>String(b.dataset.g||'').toLowerCase().includes(preferred.toLowerCase()));
    if(target){target.click();sessionStorage.removeItem('spire:flowsheet:preferred-group')}
  }
  function wire(){
    addTopActions();
    const back=document.getElementById('backSpire');if(back){back.textContent='← Client Chart';back.onclick=()=>chart('chart-review')}
    const brand=document.querySelector('.brand');if(brand)brand.innerHTML='Spire <small>ASSESSMENTS & FLOWSHEETS</small>';
    applyPreferredGroup();
    document.documentElement.dataset.spireFlowsheetMaster=CONTRACT;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();