(() => {
  'use strict';

  // SPIRE_WORKSTATION_RUNTIME_V4
  const ROOT = document.documentElement;
  const NATIVE_TRIGGER_SELECTOR = '#maxBtn,#spireFullscreenControl,[data-spire-fullscreen-control]';

  function installStyles() {
    if (document.getElementById('spireWorkstationRuntimeV4Style')) return;
    const style = document.createElement('style');
    style.id = 'spireWorkstationRuntimeV4Style';
    style.textContent = `
      html[data-spire-app-fullscreen="true"],
      html[data-spire-app-fullscreen="true"] body{
        width:100%!important;
        max-width:none!important;
        height:100dvh!important;
        min-height:100dvh!important;
        margin:0!important;
        padding:0!important;
      }
      html[data-spire-app-fullscreen="true"] body{
        overflow:hidden!important;
      }
      html[data-spire-app-fullscreen="true"] #spireResumeFullscreen{
        display:none!important;
      }

      /* The flowsheet navigation and row-label column remain light even in dark presets.
         Force their text to a high-contrast dark ink instead of inheriting pale theme text. */
      html[data-spire-epic-theme] .flowsheet-tree .tree-item:not(.selected),
      html[data-spire-epic-theme] .flowsheet-tree .tree-item:not(.selected) *,
      html[data-spire-epic-theme] .flowsheet-table tbody td:first-child,
      html[data-spire-epic-theme] .flowsheet-table tbody td:first-child *{
        color:#173441!important;
        opacity:1!important;
        -webkit-text-fill-color:#173441!important;
        text-shadow:none!important;
      }
      html[data-spire-epic-theme] .flowsheet-tree .tree-item.selected,
      html[data-spire-epic-theme] .flowsheet-tree .tree-item.selected *{
        opacity:1!important;
        -webkit-text-fill-color:currentColor!important;
        text-shadow:none!important;
      }
      html[data-spire-epic-theme] .flowsheet-tree input{
        color:#172b3a!important;
        -webkit-text-fill-color:#172b3a!important;
        opacity:1!important;
      }
    `;
    document.head.appendChild(style);
  }

  function applyAppFullscreen() {
    installStyles();
    ROOT.dataset.spireAppFullscreen = 'true';
    ROOT.dataset.spireNativeFullscreen = document.fullscreenElement ? 'true' : 'false';
    document.getElementById('spireResumeFullscreen')?.remove();
  }

  async function toggleNativeFullscreen() {
    applyAppFullscreen();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      } else {
        await ROOT.requestFullscreen?.({ navigationUI: 'hide' });
      }
    } catch (error) {
      console.info('[SPIRE Workstation] Native fullscreen requires a browser-approved user gesture.', error);
    } finally {
      applyAppFullscreen();
    }
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target instanceof Element ? event.target.closest(NATIVE_TRIGGER_SELECTOR) : null;
    if (!trigger) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void toggleNativeFullscreen();
  }, true);

  document.addEventListener('fullscreenchange', applyAppFullscreen);
  window.addEventListener('pageshow', applyAppFullscreen);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAppFullscreen, { once: true });
  } else {
    applyAppFullscreen();
  }
})();
