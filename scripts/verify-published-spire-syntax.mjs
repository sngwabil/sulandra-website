import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const page=await readFile(path.join(root,'spire.html'),'utf8');
const refs=[...page.matchAll(/<script[^>]+src=["']\/([^"'?]+\.js)(?:\?[^"']*)?["'][^>]*><\/script>/gi)].map(match=>match[1]);

// SPIRE's final presentation hook intentionally loads the user master-template
// runtimes dynamically. Include every JavaScript asset referenced by that loader
// in the same Node syntax gate as direct <script> tags.
let loader='';
try{loader=await readFile(path.join(root,'assets/spire-home-care-redesign-loader.js'),'utf8')}catch{}
const dynamicRefs=[...loader.matchAll(/["'`]\/?(assets\/[A-Za-z0-9._/-]+\.js)(?:\?[^"'`]*)?["'`]/g)].map(match=>match[1]);
for(const expected of ['assets/spire-user-template-integration.js','assets/spire-chart-review-ownership.js','assets/spire-intake-isp-sleep-wiring.js']){
  if(loader.includes(expected.split('/').pop())&&!dynamicRefs.includes(expected))dynamicRefs.push(expected);
}

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
if(!unique.includes('assets/spire-user-template-integration.js'))failures.push('SPIRE master-template runtime is not syntax-checked');
if(!unique.includes('assets/spire-chart-review-ownership.js'))failures.push('SPIRE dedicated Chart Review ownership is not syntax-checked');
if(!unique.includes('assets/spire-intake-isp-sleep-wiring.js'))failures.push('SPIRE intake/ISP/sleep wiring runtime is not syntax-checked');
if(!page.includes('spire-home-care-redesign-loader.js?v=20260812-user-master-template-8'))failures.push('spire.html is not cache-busted to master-template generation 8');

try{
  const chartOwner=await readFile(path.join(root,'assets/spire-chart-review-ownership.js'),'utf8');
  for(const marker of ['20260812-spire-chart-review-ownership-1','SpireChartReviewV2','stopImmediatePropagation','spire:chart-tab-selected','SpireChartReviewOwnership']){
    if(!chartOwner.includes(marker))failures.push(`SPIRE Chart Review ownership missing ${marker}`);
  }
}catch{failures.push('SPIRE Chart Review ownership runtime is missing');}
try{
  const wiring=await readFile(path.join(root,'assets/spire-intake-isp-sleep-wiring.js'),'utf8');
  for(const marker of ['20260812-spire-intake-isp-sleep-2','spireAdmissionHistoryTab','ISP Outcomes / Progress','Sleep / Wake','spire:flowsheet:preferred-group','SpireIntakeIspSleepWiring','button.hidden=true']){
    if(!wiring.includes(marker))failures.push(`SPIRE intake/ISP/sleep wiring missing ${marker}`);
  }
}catch{failures.push('SPIRE intake/ISP/sleep wiring runtime is missing');}
try{
  const style=await readFile(path.join(root,'assets/spire-intake-isp-sleep-wiring.css'),'utf8');
  for(const marker of ['#spireAdmissionHistoryTab','admission-history-wrap','.spmt-summary-card.intake']){
    if(!style.includes(marker))failures.push(`SPIRE intake master styling missing ${marker}`);
  }
}catch{failures.push('SPIRE intake/ISP/sleep wiring stylesheet is missing');}
try{
  const promotion=await readFile(path.join(root,'api/src/client-intake-promotion.ts'),'utf8');
  for(const marker of ['CLIENT INTAKE → SPIRE ADMISSION SUMMARY','ensureMedications','ensureDocuments','ensureServiceAuthorization','PROMOTE_CLIENT_INTAKE']){
    if(!promotion.includes(marker))failures.push(`Client Intake promotion contract missing ${marker}`);
  }
}catch{failures.push('Client Intake promotion service is missing');}
try{
  const admission=await readFile(path.join(root,'assets/spire-admission-history.js'),'utf8');
  for(const marker of ['/admission-history','Completed Intake Sections','Attached Admission Documents','Recorded Acknowledgments']){
    if(!admission.includes(marker))failures.push(`SPIRE admission-history wiring missing ${marker}`);
  }
}catch{failures.push('SPIRE admission history runtime is missing');}

if(failures.length){
  console.error('Published SPIRE JavaScript/integration verification failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log(`Published SPIRE JavaScript syntax, dedicated Chart Review ownership, and intake/ISP/sleep wiring verified across ${unique.length} direct/dynamic script assets.`);