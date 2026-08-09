(()=>{
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const $=id=>document.getElementById(id);
  const status=(message,error=false)=>{const node=$('status');node.textContent=message;node.className='status show'+(error?' error':'');};
  const value=id=>String($(id)?.value||'').trim();
  const params=new URLSearchParams(location.search);
  const aliases={community:'SHARED_LIVING','community-living':'SHARED_LIVING','shared-living':'SHARED_LIVING','personal-care':'HOMEMAKER_PERSONAL_CARE','hpc':'HOMEMAKER_PERSONAL_CARE',respite:'RESPITE',transportation:'TRANSPORTATION',nursing:'NURSING','home-health':'HOME_HEALTH',rehab:'OTHER','behavioral-health':'OTHER','companion-care':'OTHER','community-integration':'COMMUNITY_INTEGRATION'};
  const requested=String(params.get('service')||'').trim().toLowerCase();
  const requestedType=aliases[requested]||'';
  const companyForServices=types=>{const map={HOMEMAKER_PERSONAL_CARE:'SCLS',SHARED_LIVING:'SCLS',RESPITE:'SCLS',COMMUNITY_INTEGRATION:'SCLS',NURSING:'HOME_HEALTH',HOME_HEALTH:'HOME_HEALTH',TRANSPORTATION:'NMT'};const companies=[...new Set(types.map(type=>map[type]).filter(Boolean))];return companies.length===1?companies[0]:'SULANDRA_HEALTH';};
  if(requestedType){const box=document.querySelector(`#services input[value="${requestedType}"]`);if(box)box.checked=true;}
  const source=String(params.get('source')||'').trim();
  if(requested&&$('notes')&&!$('notes').value)$('notes').value=`Service page interest: ${requested.replaceAll('-',' ')}${source?` (source: ${source})`:''}.`;
  $('requestForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const serviceTypes=[...document.querySelectorAll('#services input:checked')].map(input=>input.value);
    if(!serviceTypes.length){status('Select at least one requested service.',true);return;}
    if(!$('consent').checked){status('Consent is required before submitting the request.',true);return;}
    const body={requesterName:value('requesterName'),requesterRelationship:value('requesterRelationship')||'Self',clientName:value('clientName'),clientDateOfBirth:value('clientDateOfBirth'),email:value('email'),phone:value('phone'),preferredContact:value('preferredContact')||'EMAIL',streetAddress:value('streetAddress'),city:value('city'),state:value('state')||'OH',zipCode:value('zipCode'),county:value('county'),fundingSource:value('fundingSource'),serviceTypes,urgency:value('urgency')||'ROUTINE',currentProvider:value('currentProvider'),requestedStartDate:value('requestedStartDate'),notes:value('notes'),companyCode:companyForServices(serviceTypes),sourcePath:location.pathname,consent:true};
    const button=$('submitBtn');button.disabled=true;button.textContent='Submitting…';status('Submitting your request…');
    try{
      const response=await fetch(`${API}/public/client-service-requests`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`Request failed (${response.status})`);
      const data=payload.data||{};
      $('requestForm').reset();$('requesterRelationship').value='Self';$('state').value='OH';$('preferredContact').value='EMAIL';$('urgency').value='ROUTINE';
      const tracking=data.requestNumber||'available from our team';
      if(data.submissionType==='PRELAUNCH_INTEREST')status(`Your interest was received for planning and follow-up. Tracking number: ${tracking}. This is not confirmation that the requested provider service is approved or currently available.`);
      else if(data.submissionType==='ENTERPRISE_CONSULTATION')status(`Your consultation request was received. Tracking number: ${tracking}. Our team will review it and contact you using your preferred method.`);
      else status(`Your service request was received for intake review. Tracking number: ${tracking}. Submission does not guarantee acceptance or service availability.`);
    }catch(error){status(error.message||'We could not submit the request. Please try again.',true);}
    finally{button.disabled=false;button.textContent='Submit Service Request';}
  });
})();
