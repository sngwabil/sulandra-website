import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'assets', 'employee360-app.js');
let source = await readFile(target, 'utf8');

const oldHandler = `$('tabs').addEventListener('click',event=>{const button=event.target.closest('button[data-tab]');if(!button)return;document.querySelectorAll('.tabs button').forEach(node=>node.classList.toggle('active',node===button));document.querySelectorAll('.section').forEach(node=>node.classList.toggle('active',node.id===\`tab-\${button.dataset.tab}\`))});load();`;

const newHandler = `function activateTab(name){const tabs=$('tabs'),workspace=$('workspace');if(!tabs||!workspace)return;tabs.querySelectorAll('button[data-tab]').forEach(node=>{const active=node.dataset.tab===name;node.classList.toggle('active',active);node.setAttribute('aria-selected',String(active));node.tabIndex=active?0:-1;});workspace.querySelectorAll('.section[id^="tab-"]').forEach(node=>{const active=node.id===\`tab-\${name}\`;node.classList.toggle('active',active);node.hidden=!active;});}const tabs=$('tabs');if(tabs){tabs.setAttribute('role','tablist');tabs.querySelectorAll('button[data-tab]').forEach(button=>{button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-controls',\`tab-\${button.dataset.tab}\`);button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();activateTab(button.dataset.tab);});});activateTab('overview');}load();`;

if (source.includes(oldHandler)) {
  source = source.replace(oldHandler, newHandler);
  await writeFile(target, source, 'utf8');
  console.log('Employee 360 tab switching hardened for desktop and mobile.');
} else if (source.includes("function activateTab(name)")) {
  console.log('Employee 360 tab switching is already hardened.');
} else {
  throw new Error('Employee 360 tab handler marker was not found.');
}
