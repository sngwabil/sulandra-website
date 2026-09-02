import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  path.join(root, 'assets', 'sulandra-codebase.js'),
  path.join(root, 'dist-web', 'assets', 'sulandra-codebase.js'),
];
const cssCandidates = [
  path.join(root, 'assets', 'sulandra-codebase.css'),
  path.join(root, 'dist-web', 'assets', 'sulandra-codebase.css'),
];
const editorBefore = "if(edit)edit.textContent=editMode?'View':'Edit';";
const editorAfter = "if(edit){edit.textContent=editMode?'View':'Edit';edit.disabled=!activePath}";
const dividerBefore = `function installTerminalDividers(host,count){
 qsa('.scb-term-divider',host).forEach(n=>n.remove());
 const drag=(axis,event)=>{
   event.preventDefault();const rect=host.getBoundingClientRect();const move=e=>{
     if(axis==='x'){const pct=Math.max(28,Math.min(72,((e.clientX-rect.left)/rect.width)*100));host.style.setProperty('--scb-term-col',\`${'${'}pct}%\`)}
     else{const pct=Math.max(28,Math.min(72,((e.clientY-rect.top)/rect.height)*100));host.style.setProperty('--scb-term-row',\`${'${'}pct}%\`)}
   };const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);void fitVisibleTerminals()};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 };
 if(count>=2){const v=document.createElement('div');v.className='scb-term-divider scb-term-divider-v';v.onpointerdown=e=>drag('x',e);host.appendChild(v)}
 if(count>=3){const h=document.createElement('div');h.className='scb-term-divider scb-term-divider-h';h.onpointerdown=e=>drag('y',e);host.appendChild(h)}
}`;
const dividerAfter = `function installTerminalDividers(host,count){
 qsa('.scb-term-divider',host).forEach(n=>n.remove());
 const install=(axis,className)=>{
   const divider=document.createElement('div');divider.className=\`scb-term-divider ${'${'}className}\`;divider.style.touchAction='none';let active=false;
   divider.style.setProperty('pointer-events','auto','important');divider.style.setProperty('touch-action','none','important');divider.style.setProperty('user-select','none','important');
   if(axis==='x'){
     divider.style.setProperty('top','0','important');divider.style.setProperty('bottom','auto','important');divider.style.setProperty('left','calc(var(--scb-term-col) - 5px)','important');divider.style.setProperty('width','10px','important');divider.style.setProperty('height','100%','important');divider.style.setProperty('min-height','100%','important');divider.style.setProperty('cursor','col-resize','important');
   }else{
     divider.style.setProperty('left',count===4?'0':'var(--scb-term-col)','important');divider.style.setProperty('right','0','important');divider.style.setProperty('top','calc(var(--scb-term-row) - 5px)','important');divider.style.setProperty('width','auto','important');divider.style.setProperty('height','10px','important');divider.style.setProperty('cursor','row-resize','important');
   }
   const begin=event=>{
     if(event.button!==0||active)return;active=true;event.preventDefault();event.stopPropagation();
     const rect=host.getBoundingClientRect();let finished=false;
     const update=(clientX,clientY)=>{
       if(axis==='x'){const pct=Math.max(28,Math.min(72,((clientX-rect.left)/Math.max(1,rect.width))*100));host.style.setProperty('--scb-term-col',\`${'${'}pct}%\`)}
       else{const pct=Math.max(28,Math.min(72,((clientY-rect.top)/Math.max(1,rect.height))*100));host.style.setProperty('--scb-term-row',\`${'${'}pct}%\`)}
     };
     const pointerMove=e=>update(e.clientX,e.clientY);
     const mouseMove=e=>update(e.clientX,e.clientY);
     const up=()=>{
       if(finished)return;finished=true;active=false;
       window.removeEventListener('pointermove',pointerMove,true);window.removeEventListener('mousemove',mouseMove,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('mouseup',up,true);window.removeEventListener('pointercancel',up,true);
       void fitVisibleTerminals();
     };
     window.addEventListener('pointermove',pointerMove,true);window.addEventListener('mousemove',mouseMove,true);window.addEventListener('pointerup',up,true);window.addEventListener('mouseup',up,true);window.addEventListener('pointercancel',up,true);
   };
   divider.addEventListener('pointerdown',begin);divider.addEventListener('mousedown',begin);host.appendChild(divider);
 };
 if(count>=2)install('x','scb-term-divider-v');
 if(count>=3)install('y','scb-term-divider-h');
}`;
const dividerCssMarker = '/* SULANDRA_CODEBASE_DIVIDER_HITBOX_V3 */';
const dividerCss = `\n${dividerCssMarker}\n.scb-terminal-integrated #itwsXtermHost .scb-term-divider{pointer-events:auto!important;touch-action:none!important;user-select:none!important;-webkit-user-select:none!important}\n.scb-terminal-integrated #itwsXtermHost .scb-term-divider-v{top:0!important;bottom:auto!important;left:calc(var(--scb-term-col) - 5px)!important;width:10px!important;height:100%!important;min-height:100%!important;cursor:col-resize!important}\n.scb-terminal-integrated #itwsXtermHost .scb-term-divider-h{left:var(--scb-term-col)!important;right:0!important;top:calc(var(--scb-term-row) - 5px)!important;width:auto!important;height:10px!important;cursor:row-resize!important}\n.scb-terminal-integrated #itwsXtermHost[data-scb-layout="4"] .scb-term-divider-h{left:0!important}\n`;
let touched = 0;
let verified = 0;

for (const file of candidates) {
  try { await access(file); } catch { continue; }
  let source = await readFile(file, 'utf8');
  let changed = false;

  if (!source.includes(editorAfter)) {
    if (!source.includes(editorBefore)) {
      throw new Error(`Sulandra Codebase editor-state contract changed in ${path.relative(root, file)}`);
    }
    source = source.replace(editorBefore, editorAfter);
    changed = true;
  }

  if (!source.includes(dividerAfter)) {
    if (!source.includes(dividerBefore)) {
      throw new Error(`Sulandra Codebase terminal-divider contract changed in ${path.relative(root, file)}`);
    }
    source = source.replace(dividerBefore, dividerAfter);
    changed = true;
  }

  if (changed) {
    await writeFile(file, source, 'utf8');
    touched += 1;
  }
  verified += 1;
}

let cssVerified = 0;
for (const file of cssCandidates) {
  try { await access(file); } catch { continue; }
  let source = await readFile(file, 'utf8');
  if (!source.includes(dividerCssMarker)) {
    source += dividerCss;
    await writeFile(file, source, 'utf8');
    touched += 1;
  }
  cssVerified += 1;
}

if (!verified) throw new Error('Sulandra Codebase runtime was not found for editor/terminal repair');
if (!cssVerified) throw new Error('Sulandra Codebase stylesheet was not found for divider hitbox repair');
console.log(`Sulandra Codebase editor, terminal split state, and divider hitboxes verified (${touched} repaired, ${verified + cssVerified} checked).`);
