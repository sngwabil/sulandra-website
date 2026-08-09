(()=>{
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const serviceMap={'Community Living':'SHARED_LIVING','Personal Care':'HOMEMAKER_PERSONAL_CARE','Respite':'RESPITE','Transportation':'TRANSPORTATION','Caregiver Support':'OTHER','Other':'OTHER'};
  const companyMap={SHARED_LIVING:'SCLS',HOMEMAKER_PERSONAL_CARE:'SCLS',RESPITE:'SCLS',COMMUNITY_INTEGRATION:'SCLS',TRANSPORTATION:'NMT',NURSING:'HOME_HEALTH',HOME_HEALTH:'HOME_HEALTH'};
  document.querySelectorAll('a[href="#reviews"]').forEach(link=>{link.textContent='How It Works';link.href='#about';});
  document.querySelectorAll('a[href="#resources"]').forEach(link=>{link.href='/resources.html';});
  const form=document.getElementById('consultation-form');
  if(!form)return;
  form.addEventListener('submit',async event=>{
    event.preventDefault();event.stopImmediatePropagation();
    const status=document.getElementById('consultation-status');const fd=new FormData(form);const first=String(fd.get('firstName')||'').trim(),last=String(fd.get('lastName')||'').trim(),service=String(fd.get('serviceInterest')||'').trim();
    const serviceType=serviceMap[service]||'OTHER';
    const payload={requesterName:`${first} ${last}`.trim(),requesterRelationship:'Self / consultation requester',clientName:`${first} ${last}`.trim(),clientDateOfBirth:'',email:String(fd.get('email')||'').trim(),phone:String(fd.get('phone')||'').trim(),preferredContact:'EMAIL',streetAddress:'',city:'',state:'OH',zipCode:'',county:'',fundingSource:'',serviceTypes:[serviceType],urgency:'ROUTINE',currentProvider:'',requestedStartDate:'',notes:`Homepage consultation request. Service interest: ${service}.\n\n${String(fd.get('message')||'').trim()}`,companyCode:companyMap[serviceType]||'SULANDRA_HEALTH',sourcePath:location.pathname,consent:true};
    status.textContent='Sending your request…';
    try{const response=await fetch(`${API}/public/client-service-requests`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Unable to send your request.');form.reset();const tracking=body.data?.requestNumber?` Tracking number: ${body.data.requestNumber}.`:'';status.textContent=body.data?.submissionType==='PRELAUNCH_INTEREST'?`Thank you. Your interest was received for planning and follow-up.${tracking} This is not confirmation that the requested provider service is approved or available.`:`Thank you. Your consultation request was received.${tracking}`;}
    catch(error){status.textContent=error.message||'Unable to send your request. Please try again.';}
  },true);
})();
