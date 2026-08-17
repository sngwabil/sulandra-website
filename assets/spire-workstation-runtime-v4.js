(() => {
  'use strict';

  // SPIRE_WORKSTATION_RUNTIME_V4
  const ROOT = document.documentElement;

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
      html[data-spire-app-fullscreen="true"] body{overflow:hidden!important}
      html[data-spire-app-fullscreen="true"] #spireResumeFullscreen{display:none!important}

      /* Keep the Flowsheets navigation/label rail deliberately light in every Epic
         suite preset, then pin its text to dark clinical ink. This prevents pale
         dark-theme text from disappearing against the frozen white label column. */
      html[data-spire-epic-theme] .flowsheet-tree{
        background:#f8fafc!important;
        color:#173441!important;
      }
      html[data-spire-epic-theme] .flowsheet-tree .tree-item:not(.selected),
      html[data-spire-epic-theme] .flowsheet-tree .tree-item:not(.selected) *,
      html[data-spire-epic-theme] .flowsheet-table tbody td:first-child,
      html[data-spire-epic-theme] .flowsheet-table tbody td:first-child *{
        color:#173441!important;
        opacity:1!important;
        -webkit-text-fill-color:#173441!important;
        text-shadow:none!important;
      }
      html[data-spire-epic-theme] .flowsheet-table tbody td:first-child{
        background:#f6fbfd!important;
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
        background:#fff!important;
        opacity:1!important;
      }
    `;
    document.head.appendChild(style);
  }

  function applyWorkstationViewport() {
    installStyles();
    ROOT.dataset.spireAppFullscreen = 'true';
    document.getElementById('spireResumeFullscreen')?.remove();
    // The authenticated SPIRE shell/user-preference runtime is the single owner of
    // browser-native fullscreen. Re-applying it here arms the preferred fullscreen
    // gesture consistently without competing with the shell's top-window bridge.
    window.SpireUserPreferences?.apply?.();
  }

  window.addEventListener('pageshow', applyWorkstationViewport);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyWorkstationViewport, { once: true });
  } else {
    applyWorkstationViewport();
  }
})();
