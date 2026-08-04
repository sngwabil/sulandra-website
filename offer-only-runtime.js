(function () {
  'use strict';

  if (!document.querySelector('script[data-admin-desktop-cloud-sync]')) {
    const cloudScript = document.createElement('script');
    cloudScript.src = '/admin-desktop-cloud-sync.js?v=20260804-feature-3';
    cloudScript.async = false;
    cloudScript.setAttribute('data-admin-desktop-cloud-sync', 'true');
    cloudScript.onerror = () => console.error('The Sulandra desktop cloud profile could not be loaded.');
    document.head.appendChild(cloudScript);
  }

  if (!document.querySelector('script[data-admin-record-empty-state]')) {
    const emptyStateScript = document.createElement('script');
    emptyStateScript.src = '/admin-record-empty-state.js?v=20260804-feature-1';
    emptyStateScript.async = false;
    emptyStateScript.setAttribute('data-admin-record-empty-state', 'true');
    emptyStateScript.onerror = () => console.error('The Sulandra record empty-state manager could not be loaded.');
    document.head.appendChild(emptyStateScript);
  }

  const OFFER_ENDPOINT = /\/api\/admin\/applications\/[^/]+\/offers(?:\?|$)/;
  const STATUS_ENDPOINT = /\/api\/admin\/applications\/[^/]+\/status(?:\?|$)/;
  const REFRESH_ENDPOINT = /\/api\/admin\/applications\/[^/]+\/(?:offers|status|hire)(?:\?|$)/;
  const originalFetch = window.fetch.bind(window);

  function refreshAdminViews() {
    window.setTimeout(() => {
      const progressButton = Array.from(document.querySelectorAll('button')).find((button) => /refresh progress/i.test(button.textContent || ''));
      if (progressButton && !progressButton.disabled) progressButton.click();
      const mainRefresh = document.getElementById('refreshBtn');
      if (mainRefresh && !mainRefresh.disabled) mainRefresh.click();
      synchronizeFolderStatus();
    }, 250);
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : String(input && input.url || '');
    const method = String(init && init.method || 'GET').toUpperCase();

    if (OFFER_ENDPOINT.test(url) && method === 'POST' && init && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        body.requiredDocuments = ['Offer Letter'];
        init = { ...init, body: JSON.stringify(body) };
      } catch (_) {}
    }

    if (STATUS_ENDPOINT.test(url) && method === 'PATCH' && init && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);
        if (body.status === 'OFFER_PENDING' || body.status === 'OFFER_ACCEPTED') {
          body.notifyApplicant = false;
          body.visibleToApplicant = true;
          body.note = '';
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch (_) {}
    }

    const response = await originalFetch(input, init);
    if (response.ok && REFRESH_ENDPOINT.test(url) && ['POST', 'PATCH'].includes(method)) refreshAdminViews();
    return response;
  };

  function removeOnboardingChecklist() {
    const headings = Array.from(document.querySelectorAll('label, strong, h2, h3, h4, div, p'));
    const heading = headings.find((node) => /required disclosures and onboarding paperwork/i.test((node.textContent || '').trim()));
    if (!heading) return;

    let section = heading.parentElement;
    for (let i = 0; i < 5 && section; i += 1) {
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

  function synchronizeFolderStatus() {
    const offerPanel = Array.from(document.querySelectorAll('.scw-card, section, div')).find((node) => /employment offer/i.test(node.textContent || '') && /offer status/i.test(node.textContent || ''));
    if (!offerPanel) return;
    const text = offerPanel.textContent || '';
    let value = '';
    if (/offer accepted/i.test(text)) value = 'OFFER_ACCEPTED';
    else if (/offer pending|offer sent|offer viewed/i.test(text)) value = 'OFFER_PENDING';
    if (!value) return;

    const select = document.querySelector('[data-scw-status], [data-status]');
    if (select && select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  const observer = new MutationObserver(() => {
    removeOnboardingChecklist();
    synchronizeFolderStatus();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => {
    removeOnboardingChecklist();
    synchronizeFolderStatus();
  });
  removeOnboardingChecklist();
  synchronizeFolderStatus();

  window.setInterval(() => {
    const modal = document.getElementById('detailsModal');
    if (!modal || getComputedStyle(modal).display === 'none') return;
    const progressButton = Array.from(modal.querySelectorAll('button')).find((button) => /refresh progress/i.test(button.textContent || ''));
    if (progressButton && !progressButton.disabled) progressButton.click();
    synchronizeFolderStatus();
  }, 6000);
})();