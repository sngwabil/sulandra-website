/* SULANDRA_DOCK_RESIZE_CAPTURE_V2 */
(()=>{
  'use strict';
  if(window.__SULANDRA_DOCK_RESIZE_CAPTURE_V2__)return;
  window.__SULANDRA_DOCK_RESIZE_CAPTURE_V2__=true;
  const LAYOUT_KEY='sulandra:engineering-workspace-layout-v2';
  const MIN=280;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const visiblePanels=row=>[...row.querySelectorAll(':scope > .itws-dock-panel')].filter(panel=>!panel.hidden);
  const notify=()=>window.dispatchEvent(new CustomEvent('sulandra:workspace-layout-resized'));
  const normalize=row=>{
    const list=visiblePanels(row);
    const total=list.reduce((sum,panel)=>sum+(Number(panel.dataset.size)||1),0)||1;
    for(const panel of list)panel.style.flexBasis=`${((Number(panel.dataset.size)||1)/total)*100}%`;
  };
  const persist=row=>{
    const sizes={};
    for(const panel of row.querySelectorAll(':scope > .itws-dock-panel'))sizes[panel.dataset.panelId]=Number(panel.dataset.size)||25;
    try{localStorage.setItem(LAYOUT_KEY,JSON.stringify({version:2,sizes}))}catch{}
  };
  document.addEventListener('pointerdown',event=>{
    if(window.innerWidth<760||event.button!==0)return;
    const target=event.target instanceof Element?event.target:null;
    const splitter=target?.closest('.itws-dock-splitter');
    if(!splitter)return;
    const row=splitter.closest('.itws-dock-row');
    if(!row)return;
    const left=row.querySelector(`.itws-dock-panel[data-panel-id="${CSS.escape(splitter.dataset.left||'')}"]`);
    const right=row.querySelector(`.itws-dock-panel[data-panel-id="${CSS.escape(splitter.dataset.right||'')}"]`);
    if(!left||!right)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const startX=event.clientX;
    const leftWidth=left.getBoundingClientRect().width;
    const rightWidth=right.getBoundingClientRect().width;
    const pairWidth=leftWidth+rightWidth;
    const pairShare=(Number(left.dataset.size)||25)+(Number(right.dataset.size)||25);
    document.body.classList.add('itws-dock-resizing');
    const move=moveEvent=>{
      const nextLeft=clamp(leftWidth+(moveEvent.clientX-startX),MIN,Math.max(MIN,pairWidth-MIN));
      const nextRight=pairWidth-nextLeft;
      if(nextRight<MIN)return;
      const ratio=nextLeft/pairWidth;
      left.dataset.size=String(pairShare*ratio);
      right.dataset.size=String(pairShare*(1-ratio));
      left.style.flexBasis=`${nextLeft}px`;
      right.style.flexBasis=`${nextRight}px`;
      notify();
    };
    const end=()=>{
      window.removeEventListener('pointermove',move,true);
      window.removeEventListener('pointerup',end,true);
      window.removeEventListener('pointercancel',end,true);
      window.removeEventListener('blur',end,true);
      document.body.classList.remove('itws-dock-resizing');
      normalize(row);
      persist(row);
      notify();
    };
    window.addEventListener('pointermove',move,true);
    window.addEventListener('pointerup',end,true);
    window.addEventListener('pointercancel',end,true);
    window.addEventListener('blur',end,true);
  },true);
})();
