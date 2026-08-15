(() => {
  'use strict';
  // SPIRE_SUMMARY_OVERVIEW_V2
  if (window.__SPIRE_SUMMARY_OVERVIEW_V2) return;
  window.__SPIRE_SUMMARY_OVERVIEW_V2 = true;

  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector) => clean(document.querySelector(selector)?.textContent || '');
  const withoutPrefix = (value, prefix) => clean(value).replace(new RegExp(`^${prefix}\\s*:?\\s*`, 'i'), '').trim();

  function installStyles() {
    if (document.getElementById('spire-summary-overview-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'spire-summary-overview-v2-style';
    style.textContent = `
      #overview-tab .epic-overview-container.spire-summary-overview-v2{
        display:grid!important;grid-template-columns:minmax(0,1.12fr) minmax(320px,.88fr);gap:10px!important;
        align-items:start;padding:10px 10px 22px!important;background:#edf2f7;
      }
      #overview-tab .spire-summary-at-glance{grid-column:1/-1;order:0;background:#fff;border:1px solid #b9c9d8;border-radius:5px;box-shadow:0 1px 2px rgba(15,42,65,.08);overflow:hidden}
      #overview-tab .spire-summary-at-glance-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;background:linear-gradient(180deg,#f8fbfe,#eaf1f7);border-bottom:1px solid #c5d3df;color:#153e5b}
      #overview-tab .spire-summary-at-glance-title{font-size:13px;font-weight:900;letter-spacing:.01em}
      #overview-tab .spire-summary-at-glance-sub{font-size:10px;color:#657b8e;font-weight:700}
      #overview-tab .spire-summary-snapshot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#d9e3ec}
      #overview-tab .spire-summary-snapshot-item{min-width:0;background:#fff;padding:8px 10px;border-left:3px solid #6b8da7}
      #overview-tab .spire-summary-snapshot-item[data-tone="danger"]{border-left-color:#be3455;background:#fff9fa}
      #overview-tab .spire-summary-snapshot-item[data-tone="warning"]{border-left-color:#d59a1f;background:#fffdf6}
      #overview-tab .spire-summary-snapshot-item[data-tone="success"]{border-left-color:#2c8b67;background:#fbfffd}
      #overview-tab .spire-summary-snapshot-item[data-tone="info"]{border-left-color:#3878a6;background:#fbfdff}
      #overview-tab .spire-summary-snapshot-label{display:block;margin-bottom:2px;color:#6b7f90;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
      #overview-tab .spire-summary-snapshot-value{display:block;color:#18394f;font-size:11.5px;font-weight:800;line-height:1.25;overflow-wrap:anywhere}

      #overview-tab .epic-section-card.spire-summary-card{margin:0!important;border:1px solid #c7d4df!important;border-radius:5px!important;box-shadow:0 1px 2px rgba(15,42,65,.06)!important;background:#fff!important;overflow:hidden!important}
      #overview-tab .spire-summary-card>.epic-section-header{min-height:34px;padding:7px 10px!important;background:#f5f8fb!important;color:#173b55!important;border:0!important;border-bottom:1px solid #d3dde6!important;border-left:4px solid #6388a5!important;font-size:11.5px!important}
      #overview-tab .spire-summary-card>.epic-section-header>span:first-child{font-weight:900!important}
      #overview-tab .spire-summary-card>.epic-section-header>span:last-child{background:#e7eef5;border:1px solid #cedae4;color:#5a7184;padding:2px 6px;border-radius:999px;font-size:9px;font-weight:900;white-space:nowrap}
      #overview-tab .spire-summary-card>.epic-section-body{padding:0!important;font-size:11px!important;line-height:1.35!important;color:#29485d!important}

      #overview-tab .spire-summary-safety{grid-column:1/-1;order:1;border-color:#dfc56d!important}
      #overview-tab .spire-summary-safety>.epic-section-header{border-left-color:#d5a218!important;background:#fffaf0!important;color:#644a0b!important}
      #overview-tab .spire-summary-problems{grid-column:1/-1;order:2}
      #overview-tab .spire-summary-problems>.epic-section-header{border-left-color:#b43f72!important;background:#fff8fb!important}
      #overview-tab .spire-summary-guardian{order:3}
      #overview-tab .spire-summary-guardian>.epic-section-header{border-left-color:#487db8!important}
      #overview-tab .spire-summary-person{order:4}
      #overview-tab .spire-summary-person>.epic-section-header{border-left-color:#7d5bb3!important;background:#fbf9ff!important}
      #overview-tab .spire-summary-isp{order:5}
      #overview-tab .spire-summary-isp>.epic-section-header{border-left-color:#4c9a68!important;background:#f8fff9!important}
      #overview-tab .spire-summary-emergency{order:6}
      #overview-tab .spire-summary-emergency>.epic-section-header{border-left-color:#c95555!important;background:#fff9f9!important}
      #overview-tab .spire-summary-team{grid-column:1/-1;order:7}
      #overview-tab .spire-summary-team>.epic-section-header{border-left-color:#268f86!important;background:#f7fffd!important}
      #overview-tab .spire-summary-other{order:8}

      #overview-tab .spire-summary-facts{display:grid;grid-template-columns:1fr;background:#e4eaf0;gap:1px}
      #overview-tab .spire-summary-fact{display:grid;grid-template-columns:minmax(118px,150px) minmax(0,1fr);gap:9px;align-items:start;background:#fff;padding:7px 9px;min-width:0}
      #overview-tab .spire-summary-fact-label{color:#526b7d;font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:.035em;line-height:1.25}
      #overview-tab .spire-summary-fact-value{color:#203f53;font-size:11px;font-weight:600;line-height:1.36;min-width:0;overflow-wrap:anywhere}
      #overview-tab .spire-summary-mini-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#e4eaf0}
      #overview-tab .spire-summary-mini-fact{background:#fff;padding:7px 9px;min-width:0}
      #overview-tab .spire-summary-mini-fact .spire-summary-fact-label{display:block;margin-bottom:2px}
      #overview-tab .spire-summary-mini-fact .spire-summary-fact-value{display:block}

      #overview-tab .spire-summary-safety .epic-section-body{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px!important;padding:8px!important;background:#fffdf7!important}
      #overview-tab .spire-summary-safety .spire-summary-fact{display:block!important;border:1px solid #eadca6;border-left:4px solid #d6a51d;border-radius:4px;padding:8px 9px!important;background:#fff!important}
      #overview-tab .spire-summary-safety .spire-summary-fact-label{display:block;color:#6f5109;margin-bottom:3px;font-size:10px}
      #overview-tab .spire-summary-safety .spire-summary-fact-value{display:block;color:#3d4b53;font-weight:650}

      #overview-tab .spire-summary-card .doc-table{width:100%!important;margin:0!important;border-collapse:separate!important;border-spacing:0!important;font-size:10.5px!important}
      #overview-tab .spire-summary-card .doc-table thead th{position:sticky;top:0;background:#edf3f8!important;color:#39566b!important;border-color:#d1dce5!important;padding:6px 8px!important;font-size:9.5px!important;text-transform:uppercase;letter-spacing:.035em}
      #overview-tab .spire-summary-card .doc-table tbody td{padding:6px 8px!important;border-color:#e0e7ed!important;color:#29475a!important;vertical-align:top!important;line-height:1.3!important}
      #overview-tab .spire-summary-card .doc-table tbody tr:nth-child(even) td{background:#fafcfe!important}
      #overview-tab .spire-summary-problems .doc-table tbody td:nth-child(2){font-weight:900;color:#26735a;white-space:nowrap}
      #overview-tab .spire-summary-team .doc-table tbody td:first-child{font-weight:800;color:#174c69}

      @media (max-width:1180px){
        #overview-tab .epic-overview-container.spire-summary-overview-v2{grid-template-columns:1fr!important}
        #overview-tab .spire-summary-card{grid-column:1!important}
        #overview-tab .spire-summary-snapshot-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
      @media (max-width:760px){
        #overview-tab .epic-overview-container.spire-summary-overview-v2{padding:6px!important;gap:7px!important}
        #overview-tab .spire-summary-snapshot-grid{grid-template-columns:1fr}
        #overview-tab .spire-summary-safety .epic-section-body{grid-template-columns:1fr!important}
        #overview-tab .spire-summary-fact{grid-template-columns:1fr!important;gap:3px!important}
        #overview-tab .spire-summary-mini-facts{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function snapshotItem(label, value, tone) {
    const item = document.createElement('div');
    item.className = 'spire-summary-snapshot-item';
    item.dataset.tone = tone;
    const labelNode = document.createElement('span');
    labelNode.className = 'spire-summary-snapshot-label';
    labelNode.textContent = label;
    const valueNode = document.createElement('span');
    valueNode.className = 'spire-summary-snapshot-value';
    valueNode.textContent = value || '—';
    item.append(labelNode, valueNode);
    return item;
  }

  function makeSnapshot(container) {
    container.querySelector('#spireSummaryAtGlance')?.remove();
    const card = document.createElement('section');
    card.id = 'spireSummaryAtGlance';
    card.className = 'spire-summary-at-glance';
    card.innerHTML = '<div class="spire-summary-at-glance-head"><div><div class="spire-summary-at-glance-title">Clinical Snapshot</div><div class="spire-summary-at-glance-sub">High-priority information for quick review</div></div><div class="spire-summary-at-glance-sub">Current chart</div></div>';
    const grid = document.createElement('div');
    grid.className = 'spire-summary-snapshot-grid';
    const support = withoutPrefix(text('#displaySupportLevel'), 'Support Level');
    const allergies = text('#displayAllergies');
    const diet = text('#displayDiet');
    const isolation = text('#displayIsolation');
    const code = text('#displayCode');
    const pcp = text('#displayPCP');
    grid.append(
      snapshotItem('Support / Supervision', support, 'warning'),
      snapshotItem('Allergies', allergies, /none|no known/i.test(allergies) ? 'success' : 'danger'),
      snapshotItem('Diet / Swallowing', diet, 'warning'),
      snapshotItem('Isolation / Precautions', isolation, /none|standard/i.test(isolation) ? 'success' : 'danger'),
      snapshotItem('Code Status', code, 'info'),
      snapshotItem('Primary Provider', pcp, 'info'),
    );
    card.appendChild(grid);
    container.prepend(card);
  }

  function segmentNodes(row) {
    const nodes = [...row.childNodes];
    const segments = [];
    let current = null;
    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'B') {
        current = { label: clean(node.textContent).replace(/:\s*$/, ''), nodes: [] };
        segments.push(current);
      } else if (current) {
        current.nodes.push(node.cloneNode(true));
      }
    }
    return segments.filter((segment) => segment.label);
  }

  function enhanceFactRow(row) {
    if (!(row instanceof HTMLElement) || row.dataset.spireSummaryFact === '1') return;
    const segments = segmentNodes(row);
    if (!segments.length) return;
    row.dataset.spireSummaryFact = '1';
    if (segments.length > 1) {
      row.className = 'spire-summary-mini-facts';
      row.replaceChildren(...segments.map((segment) => {
        const item = document.createElement('div');
        item.className = 'spire-summary-mini-fact';
        const label = document.createElement('span');
        label.className = 'spire-summary-fact-label';
        label.textContent = segment.label;
        const value = document.createElement('span');
        value.className = 'spire-summary-fact-value';
        segment.nodes.forEach((node) => value.appendChild(node));
        if (!clean(value.textContent)) value.textContent = '—';
        item.append(label, value);
        return item;
      }));
      return;
    }
    const segment = segments[0];
    row.classList.add('spire-summary-fact');
    const label = document.createElement('div');
    label.className = 'spire-summary-fact-label';
    label.textContent = segment.label;
    const value = document.createElement('div');
    value.className = 'spire-summary-fact-value';
    segment.nodes.forEach((node) => value.appendChild(node));
    if (!clean(value.textContent)) value.textContent = '—';
    row.replaceChildren(label, value);
  }

  function classify(card) {
    const header = card.querySelector(':scope > .epic-section-header');
    if (!header) return 'other';
    if (header.classList.contains('header-advisory')) return 'safety';
    if (header.classList.contains('header-problems')) return 'problems';
    if (header.classList.contains('header-agents')) return 'guardian';
    if (header.classList.contains('header-history')) return 'person';
    if (header.classList.contains('header-diet')) return 'isp';
    if (header.classList.contains('header-emergency')) return 'emergency';
    if (header.classList.contains('header-team')) return 'team';
    return 'other';
  }

  function enhanceCard(card) {
    const kind = classify(card);
    card.classList.add('spire-summary-card', `spire-summary-${kind}`);
    const body = card.querySelector(':scope > .epic-section-body');
    if (!body) return;
    if (!body.querySelector('table')) body.classList.add('spire-summary-facts');
    [...body.children].filter((child) => child.tagName === 'DIV').forEach(enhanceFactRow);
    if (kind === 'problems') {
      body.querySelectorAll('tbody tr').forEach((row) => row.children[1]?.classList.add('spire-summary-status-cell'));
    }
  }

  let enhancing = false;
  function enhance() {
    if (enhancing) return;
    const overview = document.getElementById('overview-tab');
    const container = overview?.querySelector(':scope > .epic-overview-container');
    if (!overview || !container) return;
    enhancing = true;
    try {
      installStyles();
      container.classList.add('spire-summary-overview-v2');
      [...container.querySelectorAll(':scope > .epic-section-card')].forEach(enhanceCard);
      makeSnapshot(container);
    } finally {
      enhancing = false;
    }
  }

  let timer = 0;
  function schedule(delay = 40) {
    clearTimeout(timer);
    timer = window.setTimeout(enhance, delay);
  }

  document.addEventListener('click', (event) => {
    const summary = event.target instanceof Element ? event.target.closest('.chart-tab[data-view="summary-view"]') : null;
    const overview = event.target instanceof Element ? event.target.closest('[data-sumtab="overview-tab"]') : null;
    if (summary || overview) schedule(30);
  }, true);

  new MutationObserver((mutations) => {
    if (enhancing) return;
    if (mutations.some((mutation) => [...mutation.addedNodes].some((node) => node instanceof Element && (node.matches?.('.epic-overview-container,.epic-section-card') || node.querySelector?.('.epic-overview-container,.epic-section-card'))))) schedule(30);
  }).observe(document.documentElement, { childList: true, subtree: true });

  schedule(0);
  window.setTimeout(() => schedule(0), 400);
  window.setTimeout(() => schedule(0), 1100);
})();
