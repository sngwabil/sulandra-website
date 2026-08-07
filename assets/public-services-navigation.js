(()=>{
  'use strict';
  if(!/\/services\.html$/i.test(location.pathname))return;
  const links=[...document.querySelectorAll('a')];
  const map={
    'Reviews':{text:'How It Works',href:'/index.html#about'},
    'Resources':{href:'/resources.html'},
    'Free Consultation':{href:'/service-request.html'},
    'About Us':{href:'/index.html#about'},
    'Careers':{href:'/careers.html'},
    'Contact':{href:'/service-request.html'},
    'View All Services':{text:'Request Services',href:'/service-request.html'},
    'How to Start Home Care':{text:'How to Start Services',href:'/service-request.html'},
    'Care Questionnaire':{text:'Service Request Form',href:'/service-request.html'},
    'Contact Us':{href:'/service-request.html'}
  };
  for(const link of links){const label=link.textContent.trim();const next=map[label];if(!next)continue;if(next.text)link.textContent=next.text;link.href=next.href;link.removeAttribute('target');link.removeAttribute('rel');}
})();
