(() => {
  'use strict';

  // SPIRE_PCP_CARD_DEDUP_V1
  // The chart profile-image runtime owns the one canonical PCP card. This guard
  // removes/hides the retired MAR-localStorage PCP card if an older runtime tries
  // to recreate it, and collapses any duplicate canonical card to one row.

  let observer = null;
  let timer = 0;
  let normalizing = false;

  function ensureStyle() {
    if (document.getElementById('spirePcpCardDedupStyle')) return;
    const style = document.createElement('style');
    style.id = 'spirePcpCardDedupStyle';
    style.textContent = `
      [data-spire-pcp-photo]{display:none!important}
      .sidebar-card.clinical [data-spire-pcp-original-line]{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function normalize() {
    if (normalizing) return;
    normalizing = true;
    try {
      ensureStyle();
      window.__SPIRE_DISABLE_LEGACY_PCP_PHOTO = true;

      document.querySelectorAll('[data-spire-pcp-photo]').forEach((node) => node.remove());

      const group = document.querySelector('.sidebar-card.clinical .client-info-group');
      if (!group) return;

      const pcpValue = group.querySelector('#displayPCP') || document.querySelector('#displayPCP');
      const originalLine = pcpValue?.closest('div');
      if (originalLine && !originalLine.hasAttribute('data-spire-chart-pcp-photo')) {
        originalLine.hidden = true;
        originalLine.dataset.spirePcpOriginalLine = '1';
      }

      const canonicalRows = Array.from(group.querySelectorAll('[data-spire-chart-pcp-photo]'));
      canonicalRows.slice(1).forEach((node) => node.remove());
    } finally {
      normalizing = false;
    }
  }

  function schedule(delay = 0) {
    window.clearTimeout(timer);
    timer = window.setTimeout(normalize, delay);
  }

  function install() {
    ensureStyle();
    normalize();
    observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === 'childList')) schedule(40);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', () => schedule(80));
    window.__SPIRE_PCP_CARD_DEDUP = Object.freeze({
      marker: 'SPIRE_PCP_CARD_DEDUP_V1',
      normalize,
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
