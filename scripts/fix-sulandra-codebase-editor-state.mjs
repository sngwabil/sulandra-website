import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  path.join(root, 'assets', 'sulandra-codebase.js'),
  path.join(root, 'dist-web', 'assets', 'sulandra-codebase.js'),
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
   const divider=document.createElement('div');divider.className=\`scb-term-divider ${'${'}className}\`;divider.style.touchAction='none';
   divider.addEventListener('pointerdown',event=>{
     if(event.button!==0)return;event.preventDefault();event.stopPropagation();
     const rect=host.getBoundingClientRect();let finished=false;
     const update=(clientX,clientY)=>{
       if(axis==='x'){const pct=Math.max(28,Math.min(72,((clientX-rect.left)/Math.max(1,rect.width))*100));host.style.setProperty('--scb-term-col',\`${'${'}pct}%\`)}
       else{const pct=Math.max(28,Math.min(72,((clientY-rect.top)/Math.max(1,rect.height))*100));host.style.setProperty('--scb-term-row',\`${'${'}pct}%\`)}
     };
     const pointerMove=e=>update(e.clientX,e.clientY);
     const mouseMove=e=>update(e.clientX,e.clientY);
     const up=()=>{
       if(finished)return;finished=true;
       window.removeEventListener('pointermove',pointerMove,true);window.removeEventListener('mousemove',mouseMove,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('mouseup',up,true);window.removeEventListener('pointercancel',up,true);
       void fitVisibleTerminals();
     };
     window.addEventListener('pointermove',pointerMove,true);window.addEventListener('mousemove',mouseMove,true);window.addEventListener('pointerup',up,true);window.addEventListener('mouseup',up,true);window.addEventListener('pointercancel',up,true);
   });
   host.appendChild(divider);
 };
 if(count>=2)install('x','scb-term-divider-v');
 if(count>=3)install('y','scb-term-divider-h');
}`;
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

if (!verified) throw new Error('Sulandra Codebase runtime was not found for editor/terminal repair');
console.log(`Sulandra Codebase editor and terminal split state verified (${touched} repaired, ${verified} checked).`);
