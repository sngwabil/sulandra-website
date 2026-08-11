(() => {
  'use strict';

  const exactText = (node) => String(node?.childNodes?.[0]?.textContent || node?.textContent || '').trim();

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.tool-grid button');
    if (!button) return;
    const label = exactText(button);

    if (label === 'My SmartPhrases' || label === 'Speed Buttons') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const manager = [...document.querySelectorAll('.tool-grid button')]
        .find((candidate) => exactText(candidate) === 'SmartPhrase Manager');
      if (manager) setTimeout(() => manager.click(), 0);
      return;
    }

    if (label === 'Workspace Tabs') {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.getElementById('spireReferenceSettings')?.click();
      return;
    }

    if (label === 'Saved Filters') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const results = document.querySelector('[data-chart-tab="results-review"]');
      if (results) {
        results.click();
      } else {
        document.querySelector('[data-workspace="search"]')?.click();
      }
    }
  }, true);
})();
