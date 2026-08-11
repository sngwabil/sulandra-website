(() => {
  'use strict';

  document.addEventListener('click', (event) => {
    const button = event.target.closest('#spireNewSmartPhrase');
    if (!button) return;
    const host = button.closest('#spireSmartPhraseParityModal');
    if (!host) return;

    for (const selector of ['#spirePhraseName', '#spirePhraseDescription', '#spirePhraseBody', '#spirePhraseOrgWide']) {
      const field = host.querySelector(selector);
      if (field) field.disabled = false;
    }

    const save = host.querySelector('#spireSavePhrase');
    if (save) {
      save.hidden = false;
      save.textContent = 'Create Phrase';
    }
    const deactivate = host.querySelector('#spireDeletePhrase');
    if (deactivate) deactivate.hidden = true;
    const sharing = host.querySelector('#spirePhraseSharing');
    if (sharing) sharing.hidden = true;
  }, true);
})();
