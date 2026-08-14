(() => {
  'use strict';

  function extendThemeSelector() {
    const presetTab = document.getElementById('accessPresetsTab');
    if (!presetTab) return;

    const tabButton = document.getElementById('tabPresetBtn');
    if (tabButton) tabButton.textContent = '22 Distinct Preset Looks';

    const intro = presetTab.querySelector('p');
    if (intro) intro.textContent = 'Select one of 22 distinct professional visual themes tailored for Spire Enterprise:';

    const grid = presetTab.querySelector('div[style*="grid-template-columns"]');
    if (!grid) return;

    if (!grid.querySelector('[data-spire-theme-card="21"]')) {
      const card21 = document.createElement('div');
      card21.className = 'theme-card';
      card21.dataset.spireThemeCard = '21';
      card21.innerHTML = '<b>21. Client Station Classic</b><br><span style="font-size: 11px; color: #64748b;">The red, cyan and ice-blue Client Station workstation look</span>';
      card21.addEventListener('click', () => {
        if (window.SpireUserPreferences?.setPreset) window.SpireUserPreferences.setPreset('clientStation');
        else if (typeof window.applyPresetTheme === 'function') window.applyPresetTheme('clientStation');
      });
      grid.appendChild(card21);
    }

    if (!grid.querySelector('[data-spire-theme-card="22"]')) {
      const card22 = document.createElement('div');
      card22.className = 'theme-card';
      card22.dataset.spireThemeCard = '22';
      card22.innerHTML = '<b>22. Dark Clinical Summary</b><br><span style="font-size: 11px; color: #64748b;">Charcoal workspace with cyan, magenta and blue clinical accents</span>';
      card22.addEventListener('click', () => {
        if (window.SpireUserPreferences?.setPreset) window.SpireUserPreferences.setPreset('darkClinicalSummary');
        else if (typeof window.applyPresetTheme === 'function') window.applyPresetTheme('darkClinicalSummary');
      });
      grid.appendChild(card22);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', extendThemeSelector, { once: true });
  } else {
    extendThemeSelector();
  }

  const observer = new MutationObserver(() => extendThemeSelector());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
