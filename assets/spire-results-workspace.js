(() => {
  'use strict';
  const TAB_KEY='spire:chart-tab-layout:v1';
  const RESULT_KEY='spire:results-preferences:v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));

  function currentLayout(){return read(TAB_KEY,{order:[],hidden:[]});}
  function applyTabLayout(){
    const bar=document.querySelector('.chart-tabs'); if(!bar)return;
    const buttons=[...bar.querySelectorAll('[data-chart-tab]')]; if(!buttons.length)return;
    const layout=currentLayout();
    const byKey=new Map(buttons.map(b=>[b.dataset.chartTab,b]));
    const order=[...layout.order.filter(k=>byKey.has(k)),...buttons.map(b=>b.dataset.chartTab).filter(k=>!layout.order.includes(k))];
    order.forEach(k=>bar.appendChild(byKey.get(k)));
    buttons.forEach(b=>{b.hidden=layout.hidden.includes(b.dataset.chartTab);b.draggable=true;b.classList.add('spire-customizable-tab');});
    if(!bar.querySelector('[data-spire-customize-tabs]')){
      const btn=document.createElement('button');btn.type='button';btn.dataset.spireCustomizeTabs='1';btn.className='spire-customize-tabs';btn.textContent='⚙ Tabs';bar.appendChild(btn);
    }
  }

  function customizeTabs(){
    const bar=document.querySelector('.chart-tabs'); if(!bar)return;
    const buttons=[...bar.querySelectorAll('[data-chart-tab]')]; const layout=currentLayout();
    const host=document.createElement('div');host.className='spire-tabs-modal';
    host.innerHTML=`<div class="spire-tabs-dialog"><header><strong>Customize Chart Workspace</strong><button data-close>×</button></header><p>Drag rows to reorder. Turn off tabs you rarely use; you can restore them anytime.</p><div class="spire-tab-editor">${buttons.map(b=>`<div draggable="true" data-key="${esc(b.dataset.chartTab)}"><span class="drag">⋮⋮</span><label><input type="checkbox" ${layout.hidden.includes(b.dataset.chartTab)?'':'checked'}> ${esc(b.textContent)}</label></div>`).join('')}</div><footer><button data-reset>Reset</button><button class="primary" data-save>Save Workspace</button></footer></div>`;
    document.body.appendChild(host);
    let dragged='';
    host.addEventListener('dragstart',e=>{const row=e.target.closest('[data-key]');if(row){dragged=row.dataset.key;e.dataTransfer.effectAllowed='move';}});
    host.addEventListener('dragover',e=>{if(e.target.closest('[data-key]'))e.preventDefault();});
    host.addEventListener('drop',e=>{const target=e.target.closest('[data-key]');if(!target||!dragged)return;e.preventDefault();const source=host.querySelector(`[data-key="${CSS.escape(dragged)}"]`);if(source&&source!==target)target.before(source);});
    host.onclick=e=>{
      if(e.target.closest('[data-close]')||e.target===host)host.remove();
      if(e.target.closest('[data-reset]')){localStorage.removeItem(TAB_KEY);host.remove();applyTabLayout();}
      if(e.target.closest('[data-save]')){const rows=[...host.querySelectorAll('[data-key]')];write(TAB_KEY,{order:rows.map(r=>r.dataset.key),hidden:rows.filter(r=>!r.querySelector('input').checked).map(r=>r.dataset.key)});host.remove();applyTabLayout();}
    };
  }

  function rowMeta(row){
    const cells=[...row.cells].map(c=>c.textContent.trim());
    const text=cells.join(' ').toLowerCase();
    const dateText=cells.find(v=>/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(v))||'';
    const parsed=dateText?new Date(dateText):null;
    const abnormal=/\b(high|low|critical|abnormal|positive|h\b|l\b|↑|↓|!)\b/i.test(cells.join(' '));
    return {cells,text,date:parsed&&!Number.isNaN(parsed.valueOf())?parsed:null,abnormal};
  }

  function enhanceResults(){
    const active=document.querySelector('[data-chart-tab="results-review"].active'); const body=document.getElementById('spireChartTabBody');
    if(!active||!body||body.querySelector('[data-spire-results-tools]'))return;
    const table=body.querySelector('table'); if(!table)return;
    const pref=read(RESULT_KEY,{sort:'newest',abnormal:false,search:'',from:'',to:''});
    const toolbar=document.createElement('div');toolbar.dataset.spireResultsTools='1';toolbar.className='spire-results-tools';
    toolbar.innerHTML=`<div><label>Search<input type="search" data-r-search value="${esc(pref.search)}" placeholder="Lab, result, component"></label><label>From<input type="date" data-r-from value="${esc(pref.from)}"></label><label>To<input type="date" data-r-to value="${esc(pref.to)}"></label></div><div><label class="check"><input type="checkbox" data-r-abnormal ${pref.abnormal?'checked':''}> Abnormal only</label><select data-r-sort><option value="newest" ${pref.sort==='newest'?'selected':''}>Newest first</option><option value="oldest" ${pref.sort==='oldest'?'selected':''}>Oldest first</option></select><button type="button" data-r-clear>Clear</button><button type="button" data-r-trend>Trend Selected</button></div>`;
    table.parentElement.insertBefore(toolbar,table);
    const header=table.tHead?.rows?.[0]; if(header&&!header.querySelector('.spire-result-select-head')){const th=document.createElement('th');th.className='spire-result-select-head';th.textContent='Trend';header.insertBefore(th,header.firstChild);}
    [...table.tBodies].flatMap(tb=>[...tb.rows]).forEach(row=>{if(!row.querySelector('.spire-result-select')){const td=document.createElement('td');td.className='spire-result-select';td.innerHTML='<input type="checkbox" aria-label="Select result for trend">';row.insertBefore(td,row.firstChild);}});
    const apply=()=>{
      const search=toolbar.querySelector('[data-r-search]').value.trim().toLowerCase(); const from=toolbar.querySelector('[data-r-from]').value; const to=toolbar.querySelector('[data-r-to]').value; const abnormal=toolbar.querySelector('[data-r-abnormal]').checked; const sort=toolbar.querySelector('[data-r-sort]').value;
      write(RESULT_KEY,{search,from,to,abnormal,sort});
      const rows=[...table.tBodies].flatMap(tb=>[...tb.rows]);
      rows.forEach(row=>{const m=rowMeta(row);let visible=!search||m.text.includes(search);if(visible&&abnormal)visible=m.abnormal;if(visible&&from&&m.date)visible=m.date>=new Date(from+'T00:00:00');if(visible&&to&&m.date)visible=m.date<=new Date(to+'T23:59:59');row.hidden=!visible;});
      const visible=rows.filter(r=>!r.hidden);visible.sort((a,b)=>{const ad=rowMeta(a).date?.valueOf()||0,bd=rowMeta(b).date?.valueOf()||0;return sort==='oldest'?ad-bd:bd-ad;});visible.forEach(r=>r.parentElement.appendChild(r));
    };
    toolbar.addEventListener('input',apply);toolbar.addEventListener('change',apply);
    toolbar.querySelector('[data-r-clear]').onclick=()=>{localStorage.removeItem(RESULT_KEY);toolbar.querySelector('[data-r-search]').value='';toolbar.querySelector('[data-r-from]').value='';toolbar.querySelector('[data-r-to]').value='';toolbar.querySelector('[data-r-abnormal]').checked=false;toolbar.querySelector('[data-r-sort]').value='newest';apply();};
    toolbar.querySelector('[data-r-trend]').onclick=()=>showTrend(table);
    apply();
  }

  function showTrend(table){
    const selected=[...table.tBodies].flatMap(tb=>[...tb.rows]).filter(r=>r.querySelector('.spire-result-select input')?.checked);
    if(!selected.length){alert('Select one or more result rows first.');return;}
    const host=document.createElement('div');host.className='spire-tabs-modal';
    host.innerHTML=`<div class="spire-tabs-dialog spire-trend-dialog"><header><strong>Selected Result Trend</strong><button data-close>×</button></header><div class="spire-trend-list">${selected.map(r=>{const m=rowMeta(r);return `<article><time>${esc(m.date?m.date.toLocaleDateString():'Date unavailable')}</time><strong>${esc(m.cells.slice(1,3).join(' — '))}</strong><span>${esc(m.cells.slice(3).join(' · '))}</span></article>`}).join('')}</div><footer><button data-close>Close</button></footer></div>`;
    host.onclick=e=>{if(e.target.closest('[data-close]')||e.target===host)host.remove();};document.body.appendChild(host);
  }

  document.addEventListener('click',e=>{if(e.target.closest('[data-spire-customize-tabs]'))customizeTabs();});
  let dragKey='';document.addEventListener('dragstart',e=>{const tab=e.target.closest('.chart-tabs [data-chart-tab]');if(tab){dragKey=tab.dataset.chartTab;e.dataTransfer.effectAllowed='move';}});document.addEventListener('dragover',e=>{if(dragKey&&e.target.closest('.chart-tabs [data-chart-tab]'))e.preventDefault();});document.addEventListener('drop',e=>{const target=e.target.closest('.chart-tabs [data-chart-tab]');if(!target||!dragKey)return;e.preventDefault();const bar=target.parentElement,source=bar.querySelector(`[data-chart-tab="${CSS.escape(dragKey)}"]`);if(source&&source!==target){target.before(source);const layout=currentLayout();const order=[...bar.querySelectorAll('[data-chart-tab]')].map(b=>b.dataset.chartTab);write(TAB_KEY,{order,hidden:layout.hidden});}dragKey='';});
  const refresh=()=>{applyTabLayout();enhanceResults();};new MutationObserver(refresh).observe(document.body,{subtree:true,childList:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh);else refresh();
})();