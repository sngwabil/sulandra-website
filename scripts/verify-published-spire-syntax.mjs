import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const page=await readFile(path.join(root,'spire.html'),'utf8');
const refs=[...page.matchAll(/<script[^>]+src=["']\/([^"'?]+\.js)(?:\?[^"']*)?["'][^>]*><\/script>/gi)].map(match=>match[1]);

// SPIRE's final presentation hook intentionally loads the user master-template
// runtime dynamically. Include JavaScript assets referenced by that loader in the
// same Node syntax gate as direct <script> tags so a cache-busted UI integration
// cannot bypass CI merely because it is loaded at runtime.
let loader='';
try{loader=await readFile(path.join(root,'assets/spire-home-care-redesign-loader.js'),'utf8')}catch{}
const dynamicRefs=[...loader.matchAll(/["'`]\/?(assets\/[A-Za-z0-9._/-]+\.js)(?:\?[^"'`]*)?["'`]/g)].map(match=>match[1]);
if(loader.includes('spire-user-template-integration.js')&&!dynamicRefs.includes('assets/spire-user-template-integration.js'))dynamicRefs.push('assets/spire-user-template-integration.js');

const unique=[...new Set([...refs,...dynamicRefs])];
const failures=[];
for(const relative of unique){
  const target=path.join(root,relative);
  try{await access(target)}catch{failures.push(`${relative}: referenced SPIRE script is missing`);continue}
  const result=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});
  if(result.status!==0)failures.push(`${relative}: ${(result.stderr||result.stdout||'syntax check failed').trim()}`);
}
if(!unique.includes('assets/spire-app-v2.js'))failures.push('spire.html does not load assets/spire-app-v2.js');
if(!unique.includes('assets/spire-shell-resilience.js'))failures.push('spire.html does not load assets/spire-shell-resilience.js');
if(!unique.includes('assets/spire-chart-ready.js'))failures.push('spire.html does not load assets/spire-chart-ready.js');
if(!unique.includes('assets/spire-deep-link.js'))failures.push('spire.html does not load assets/spire-deep-link.js');
if(loader.includes('spire-user-template-integration.js')&&!unique.includes('assets/spire-user-template-integration.js'))failures.push('SPIRE master-template runtime is not syntax-checked');
if(failures.length){
  console.error('Published SPIRE JavaScript syntax verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log(`Published SPIRE JavaScript syntax verified across ${unique.length} direct/dynamic script assets.`);
