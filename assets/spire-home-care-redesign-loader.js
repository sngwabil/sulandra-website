(() => {
  'use strict';
  // Keep the existing canonical SPIRE loader hook so Railway/static publication
  // does not need another shell rewrite. The user-provided master template owns
  // presentation while all existing SPIRE modules retain Railway API auth,
  // company/service-home scope, PostgreSQL persistence and audit behavior.
  const VERSION='20260812-user-master-template-5';
  const css=[
    ['spireUserMasterTemplateStyle','/assets/spire-user-template-integration.css'],
    ['spireUserMasterTemplateLayoutFix','/assets/spire-user-template-layout-fix.css'],
    ['spireUserMasterTemplateFinalLock','/assets/spire-user-template-final-lock.css'],
  ];
  for(const [id,href] of css){
    if(document.getElementById(id))continue;
    const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.href=`${href}?v=${VERSION}`;document.head.appendChild(link);
  }
  if(!document.getElementById('spireUserMasterTemplateRuntime')){
    const script=document.createElement('script');
    script.id='spireUserMasterTemplateRuntime';
    script.src=`/assets/spire-user-template-integration.js?v=${VERSION}`;
    script.defer=true;
    document.body.appendChild(script);
  }
})();
