(() => {
  'use strict';

  // SPIRE_WORKSTATION_RUNTIME_V4
  // SPIRE_CLIENT_STATION_VIEWPORT_FILL_V5
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

      /* Client Station must always consume the full browser viewport. A browser
         side panel can temporarily shrink the viewport; when it closes, no stale
         fixed-width workspace is allowed to remain and expose an empty right strip. */
      body[data-spire-client-station] .station{
        width:100vw!important;
        max-width:100vw!important;
        min-width:0!important;
      }
      body[data-spire-client-station] .workspace{
        width:100%!important;
        max-width:none!important;
        min-width:0!important;
        grid-template-columns:250px minmax(0,1fr)!important;
      }
      body[data-spire-client-station] .main,
      body[data-spire-client-station] .table-panel,
      body[data-spire-client-station] .toolbar,
      body[data-spire-client-station] .splitter,
      body[data-spire-client-station] .preview{
        width:100%!important;
        max-width:none!important;
        min-width:0!important;
      }
      body[data-spire-client-station] .client-table{
        width:100%!important;
        max-width:none!important;
      }
      @media(max-width:1100px){
        body[data-spire-client-station] .workspace{
          grid-template-columns:205px minmax(0,1fr)!important;
        }
      }

      /* Draw the full-screen control as a real icon instead of relying on the
         U+26F6 font glyph, which renders as an empty square in some browsers. */
      button#spireFullscreenControl[data-spire-fullscreen-control],
      [data-spire-fullscreen-control]#spireFullscreenControl{
        position:relative!important;
        font-size:0!important;
        line-height:0!important;
      }
      button#spireFullscreenControl[data-spire-fullscreen-control]::before,
      [data-spire-fullscreen-control]#spireFullscreenControl::before{
        content:""!important;
        display:block!important;
        width:16px!important;
        height:16px!important;
        margin:auto!important;
        background-repeat:no-repeat!important;
        background-position:center!important;
        background-size:16px 16px!important;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='%23ffffff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 2H2v4M10 2h4v4M14 10v4h-4M2 10v4h4'/%3E%3C/svg%3E")!important;
      }

      /* Keep the Flowsheets navigation/label rail deliberately light in every Spire
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
    // The authenticated Spire shell/user-preference runtime is the single owner of
    // browser-native fullscreen. Re-applying it here arms the preferred fullscreen
    // gesture consistently without competing with the shell's top-window bridge.
    window.SpireUserPreferences?.apply?.();
  }

  window.addEventListener('pageshow', applyWorkstationViewport);
  window.addEventListener('resize', applyWorkstationViewport, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', applyWorkstationViewport, { passive: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyWorkstationViewport, { once: true });
  } else {
    applyWorkstationViewport();
  }
})();
