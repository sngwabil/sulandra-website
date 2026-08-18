import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'tests/production-role-uat.spec.mjs');
let source=await readFile(target,'utf8');

if(!source.includes('async function visibleControl(page,selector){')){
  const helperStart=source.indexOf('async function open(page,selector,path,label){');
  const helperEnd=source.indexOf('\nconst absent=',helperStart);
  if(helperStart<0||helperEnd<0)throw new Error('Production Role UAT navigation helper anchor missing');
  const helper=`async function visibleControl(page,selector){
  const controls=page.locator(selector);
  const deadline=Date.now()+12000;
  while(Date.now()<deadline){
    const count=await controls.count();
    for(let index=0;index<count;index+=1){
      const control=controls.nth(index);
      if(await control.isVisible().catch(()=>false))return control;
    }
    await page.waitForTimeout(100);
  }
  const first=controls.first();
  await expect(first).toBeVisible();
  return first;
}
async function open(page,selector,path,label,{popup=false,title=null}={}){
  const control=await visibleControl(page,selector);
  let target=page;
  if(popup){
    const popupPromise=page.waitForEvent('popup',{timeout:15000});
    await control.click();
    target=await popupPromise;
    await target.waitForLoadState('domcontentloaded').catch(()=>{});
  }else await control.click();
  await expect(target).toHaveURL(new RegExp(path.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\$&')));
  if(title)await expect(target).toHaveTitle(title);
  if(label){
    const pattern=labelPattern(label);
    const heading=target.getByRole('heading',{name:pattern,exact:false}).first();
    if(await heading.count())await expect(heading).toBeVisible();else await expect(target).toHaveTitle(pattern);
  }
  return target;
}`;
  source=source.slice(0,helperStart)+helper+source.slice(helperEnd);
}

const rnOld="else if(key==='rn')await open(page,'#employeeLiveSpireLauncher','/spire.html','SPIRE');";
const rnNew="else if(key==='rn')await open(page,'#employeeLiveSpireLauncher','/spire/master.html','SPIRE',{popup:true});";
if(source.includes(rnOld))source=source.replace(rnOld,rnNew);
else if(!source.includes(rnNew))throw new Error('Production Role UAT RN launcher anchor missing');

const schedulerOld="else if(key==='scheduler'){await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher');await open(page,'#employeeSchedulingLauncher','/scheduling.html','Workforce Schedule Control');}";
const schedulerNew="else if(key==='scheduler'){await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher');await open(page,'#employeeSchedulingLauncher','/scheduling.html','Workforce Schedule Control',{title:/Sulandra Workforce Scheduling/i});}";
if(source.includes(schedulerOld))source=source.replace(schedulerOld,schedulerNew);
else if(!source.includes(schedulerNew))throw new Error('Production Role UAT scheduler anchor missing');

await writeFile(target,source,'utf8');
console.log('Prepared Production Role UAT for visible launch controls, SPIRE popup navigation, the published master chart path, and the current scheduling title.');
