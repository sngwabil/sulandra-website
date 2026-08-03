(function () {
  'use strict';

  const OFFER_ENDPOINT = /\/api\/admin\/applications\/[^/]+\/offers(?:\?|$)/;
  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : String(input && input.url || '');
    if (OFFER_ENDPOINT.test(url) && String(init && init.method || 'GET').toUpperCase() === 'POST' && init && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        body.requiredDocuments = ['Offer Letter'];
        init = { ...init, body: JSON.stringify(body) };
      } catch (_) {
        // Leave non-JSON requests unchanged.
      }
    }
    return originalFetch(input, init);
  };

  function removeOnboardingChecklist() {
    const headings = Array.from(document.querySelectorAll('label, strong, h2, h3, h4, div, p'));
    const heading = headings.find((node) => /required disclosures and onboarding paperwork/i.test((node.textContent || '').trim()));
    if (!heading) return;

    let section = heading.parentElement;
    for (let i = 0; i < 4 && section; i += 1) {
      if (section.querySelectorAll('input[type="checkbox"]').length >= 2) break;
      section = section.parentElement;
    }
    if (!section) return;

    heading.textContent = 'Included document';
    const labels = Array.from(section.querySelectorAll('label'));
    labels.forEach((label) => {
      const checkbox = label.querySelector('input[type="checkbox"]');
      if (!checkbox) return;
      const isOffer = /offer letter/i.test(label.textContent || '');
      checkbox.checked = isOffer;
      checkbox.disabled = true;
      label.style.display = isOffer ? 'flex' : 'none';
    });

    const visibleOffer = labels.find((label) => /offer letter/i.test(label.textContent || ''));
    if (visibleOffer) {
      const textNode = Array.from(visibleOffer.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = ' Offer of Employment only';
    }
  }

  const observer = new MutationObserver(removeOnboardingChecklist);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', removeOnboardingChecklist);
  removeOnboardingChecklist();
})();
