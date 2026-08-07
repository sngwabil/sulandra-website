(()=>{
  'use strict';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const serviceMap={'Community Living':'SHARED_LIVING','Personal Care':'HOMEMAKER_PERSONAL_CARE','Respite':'RESPITE','Transportation':'TRANSPORTATION','Caregiver Support':'OTHER','Other':'OTHER'};
  const form=document.getElementById('consultation-form');
  if(!form)return;
  form.addEventListener('submit',async event=>{
    event.preventDefault();event.stopImmediatePropagation();
    const status=document.getElementById('consultation-status');const fd=new FormData(form);const first=String(fd.get('firstName')||'').trim(),last=String(fd.get('lastName')||'').trim(),service=String(fd.get('serviceInterest')||'').trim();
    const payload={requesterName:`${first} ${last}`.trim(),requesterRelationship:'Self / consultation requester',clientName:`${first} ${last}`.trim(),clientDateOfBirth:'',email:String(fd.get('email')||'').trim(),phone:String(fd.get('phone')||'').trim(),preferredContact:'EMAIL',streetAddress:'',city:'',state:'OH',zipCode:'',county:'',fundingSource:'',serviceTypes:[serviceMap[service]||'OTHER'],urgency:'ROUTINE',currentProvider:'',requestedStartDate:'',notes:`Homepage consultation request. Service interest: ${service}.\n\n${String(fd.get('message')||'').trim()}`,consent:true};
    status.textContent='Sending your request…';
    try{const response=await fetch(`${API}/public/client-service-requests`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Unable to send your request.');form.reset();status.textContent=`Thank you. Your request has been received${body.data?.requestNumber?` — tracking number ${body.data.requestNumber}`:''}.`;}
    catch(error){status.textContent=error.message||'Unable to send your request. Please try again.';}
  },true);
})();
