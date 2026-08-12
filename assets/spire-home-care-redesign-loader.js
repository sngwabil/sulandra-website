(() => {
  'use strict';
  // This loader remains at the existing canonical SPIRE hook so Railway/static
  // publication does not need another shell rewrite. The user-provided master
  // template now owns presentation while all existing SPIRE modules keep their
  // current Railway API, authentication, company scope and clinical persistence.
  const VERSION='20260812-user-master-template-1';
  if(!document.getElementById('spireUserMasterTemplateStyle')){
    const link=document.createElement('link');
    link.id='spireUserMasterTemplateStyle';
    link.rel='stylesheet';
    link.href=`/assets/spire-user-template-integration.css?v=${VERSION}`;
    document.head.appendChild(link);
  }
  if(!document.getElementById('spireUserMasterTemplateRuntime')){
    const script=document.createElement('script');
    script.id='spireUserMasterTemplateRuntime';
    script.src=`/assets/spire-user-template-integration.js?v=${VERSION}`;
    script.defer=true;
    document.body.appendChild(script);
  }
})();
