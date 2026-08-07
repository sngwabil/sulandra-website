(()=>{
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const $=id=>document.getElementById(id);
  const status=(message,error=false)=>{const node=$('status');node.textContent=message;node.className='status show'+(error?' error':'');};
  const value=id=>String($(id)?.value||'').trim();
  $('requestForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const serviceTypes=[...document.querySelectorAll('#services input:checked')].map(input=>input.value);
    if(!serviceTypes.length){status('Select at least one requested service.',true);return;}
    if(!$('consent').checked){status('Consent is required before submitting the request.',true);return;}
    const body={requesterName:value('requesterName'),requesterRelationship:value('requesterRelationship')||'Self',clientName:value('clientName'),clientDateOfBirth:value('clientDateOfBirth'),email:value('email'),phone:value('phone'),preferredContact:value('preferredContact')||'EMAIL',streetAddress:value('streetAddress'),city:value('city'),state:value('state')||'OH',zipCode:value('zipCode'),county:value('county'),fundingSource:value('fundingSource'),serviceTypes,urgency:value('urgency')||'ROUTINE',currentProvider:value('currentProvider'),requestedStartDate:value('requestedStartDate'),notes:value('notes'),consent:true};
    const button=$('submitBtn');button.disabled=true;button.textContent='Submitting…';status('Submitting your request…');
    try{
      const response=await fetch(`${API}/public/client-service-requests`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||`Request failed (${response.status})`);
      const data=payload.data||{};
      $('requestForm').reset();$('requesterRelationship').value='Self';$('state').value='OH';$('preferredContact').value='EMAIL';$('urgency').value='ROUTINE';
      status(`Your service request was received. Tracking number: ${data.requestNumber||'available from our intake team'}. Sulandra Health will contact you using your preferred method.`);
    }catch(error){status(error.message||'We could not submit the request. Please try again.',true);}
    finally{button.disabled=false;button.textContent='Submit Service Request';}
  });
})();
