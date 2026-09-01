/* SULANDRA_DOCK_RESIZE_CAPTURE_V6 */
(()=>{
  'use strict';
  if(window.__SULANDRA_DOCK_RESIZE_CAPTURE_V6__)return;
  window.__SULANDRA_DOCK_RESIZE_CAPTURE_V6__=true;
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
  const panelBeside=(splitter,direction)=>{
    let node=direction<0?splitter.previousElementSibling:splitter.nextElementSibling;
    while(node&&!node.classList?.contains('itws-dock-panel'))node=direction<0?node.previousElementSibling:node.nextElementSibling;
    return node;
  };
  const prepare=(splitter,event)=>{
    if(window.innerWidth<760||event.button!==0)return null;
    const row=splitter.closest('.itws-dock-row');
    const left=panelBeside(splitter,-1);
    const right=panelBeside(splitter,1);
    if(!row||!left||!right)return null;
    const leftWidth=left.getBoundingClientRect().width;
    const rightWidth=right.getBoundingClientRect().width;
    return {row,left,right,startX:event.clientX,leftWidth,rightWidth,pairWidth:leftWidth+rightWidth,pairShare:(Number(left.dataset.size)||25)+(Number(right.dataset.size)||25)};
  };
  const resize=(state,clientX)=>{
    const nextLeft=clamp(state.leftWidth+(clientX-state.startX),MIN,Math.max(MIN,state.pairWidth-MIN));
    const nextRight=state.pairWidth-nextLeft;
    if(nextRight<MIN)return;
    const ratio=nextLeft/state.pairWidth;
    state.left.dataset.size=String(state.pairShare*ratio);
    state.right.dataset.size=String(state.pairShare*(1-ratio));
    state.left.style.flexBasis=`${nextLeft}px`;
    state.right.style.flexBasis=`${nextRight}px`;
    notify();
  };
  const finish=state=>{
    document.body.classList.remove('itws-dock-resizing');
    normalize(state.row);
    persist(state.row);
    notify();
  };
  const makeShield=()=>{
    const shield=document.createElement('div');
    shield.className='itws-dock-drag-shield';
    Object.assign(shield.style,{position:'fixed',inset:'0',zIndex:'2147483646',cursor:'col-resize',background:'transparent',touchAction:'none',userSelect:'none'});
    document.body.appendChild(shield);
    return shield;
  };
  const startDrag=event=>{
    const target=event.target instanceof Element?event.target:null;
    const splitter=target?.closest('.itws-dock-splitter');
    if(!splitter)return;
    const state=prepare(splitter,event);if(!state)return;
    event.preventDefault();
    const shield=makeShield();
    document.body.classList.add('itws-dock-resizing');
    const move=moveEvent=>{moveEvent.preventDefault();resize(state,moveEvent.clientX)};
    const end=endEvent=>{
      endEvent?.preventDefault?.();
      shield.removeEventListener('pointermove',move);
      shield.removeEventListener('pointerup',end);
      shield.removeEventListener('pointercancel',end);
      shield.removeEventListener('mousemove',move);
      shield.removeEventListener('mouseup',end);
      window.removeEventListener('blur',end,true);
      shield.remove();
      finish(state);
    };
    if('PointerEvent' in window){
      shield.addEventListener('pointermove',move,{passive:false});
      shield.addEventListener('pointerup',end,{passive:false});
      shield.addEventListener('pointercancel',end,{passive:false});
    }else{
      shield.addEventListener('mousemove',move,{passive:false});
      shield.addEventListener('mouseup',end,{passive:false});
    }
    window.addEventListener('blur',end,true);
  };
  document.addEventListener('pointerdown',startDrag,true);
  if(!('PointerEvent' in window))document.addEventListener('mousedown',startDrag,true);
})();
