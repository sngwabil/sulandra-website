(() => {
  'use strict';
  const VERSION='20260812-home-care-redesign-1';
  if(!document.getElementById('spireHomeCareRedesignStyle')){
    const link=document.createElement('link');
    link.id='spireHomeCareRedesignStyle';
    link.rel='stylesheet';
    link.href=`/assets/spire-home-care-redesign.css?v=${VERSION}`;
    document.head.appendChild(link);
  }
  if(!document.getElementById('spireHomeCareRedesignRuntime')){
    const script=document.createElement('script');
    script.id='spireHomeCareRedesignRuntime';
    script.src=`/assets/spire-home-care-redesign.js?v=${VERSION}`;
    script.defer=true;
    document.body.appendChild(script);
  }
})();
