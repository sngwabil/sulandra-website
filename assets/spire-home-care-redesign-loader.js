(() => {
  'use strict';
  // Existing SPIRE modules continue to own auth, data, persistence and clinical
  // behavior. These final assets make the approved workstation screenshot the
  // authoritative visual/layout contract.
  const VERSION='20260812-user-master-template-9';
  const css=[
    ['spireUserMasterTemplateStyle','/assets/spire-user-template-integration.css'],
    ['spireUserMasterTemplateLayoutFix','/assets/spire-user-template-layout-fix.css'],
    ['spireUserMasterTemplateFinalLock','/assets/spire-user-template-final-lock.css'],
    ['spireIntakeIspSleepWiringStyle','/assets/spire-intake-isp-sleep-wiring.css'],
    ['spireReferenceScreenshotLockStyle','/assets/spire-reference-screenshot-lock.css'],
  ];
  for(const [id,href] of css){
    if(document.getElementById(id))continue;
    const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.href=`${href}?v=${VERSION}`;document.head.appendChild(link);
  }
  const scripts=[
    ['spireUserMasterTemplateRuntime','/assets/spire-user-template-integration.js'],
    ['spireChartReviewOwnershipRuntime','/assets/spire-chart-review-ownership.js'],
    ['spireIntakeIspSleepWiringRuntime','/assets/spire-intake-isp-sleep-wiring.js'],
    ['spireReferenceScreenshotLockRuntime','/assets/spire-reference-screenshot-lock.js'],
  ];
  for(const [id,src] of scripts){
    if(document.getElementById(id))continue;
    const script=document.createElement('script');script.id=id;script.src=`${src}?v=${VERSION}`;script.defer=true;document.body.appendChild(script);
  }
})();