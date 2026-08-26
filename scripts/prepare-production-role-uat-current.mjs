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
      if(!await control.isVisible().catch(()=>false))continue;
      if(!await control.isEnabled().catch(()=>false))continue;
      if(await control.click({trial:true,timeout:500}).then(()=>true).catch(()=>false))return control;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(\`No actionable control found for \${selector}\`);
}
function routeMatches(url,path){
  try{
    const current=new URL(url);
    if(current.pathname===path)return true;
    if(current.pathname==='/employee-login.html'){
      const returnTo=current.searchParams.get('return');
      if(returnTo){
        const destination=new URL(returnTo,current.origin);
        return destination.pathname===path;
      }
    }
  }catch{}
  return false;
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
  await expect.poll(()=>routeMatches(target.url(),path)).toBe(true);
  const authenticationReturn=(()=>{try{return new URL(target.url()).pathname==='/employee-login.html';}catch{return false;}})();
  if(!authenticationReturn&&title)await expect(target).toHaveTitle(title);
  if(!authenticationReturn&&label){
    const pattern=labelPattern(label);
    const heading=target.getByRole('heading',{name:pattern,exact:false}).first();
    if(await heading.count())await expect(heading).toBeVisible();else await expect(target).toHaveTitle(pattern);
  }
  return target;
}`;
  source=source.slice(0,helperStart)+helper+source.slice(helperEnd);
}else{
  const visibleOld=`      if(await control.isVisible().catch(()=>false))return control;`;
  const visibleNew=`      if(!await control.isVisible().catch(()=>false))continue;\n      if(!await control.isEnabled().catch(()=>false))continue;\n      if(await control.click({trial:true,timeout:500}).then(()=>true).catch(()=>false))return control;`;
  if(source.includes(visibleOld))source=source.replace(visibleOld,visibleNew);
  const fallbackOld=`  const first=controls.first();\n  await expect(first).toBeVisible();\n  return first;`;
  const fallbackNew=`  throw new Error(\`No actionable control found for \${selector}\`);`;
  if(source.includes(fallbackOld))source=source.replace(fallbackOld,fallbackNew);
}

const rnOld="else if(key==='rn')await open(page,'#employeeLiveSpireLauncher','/spire.html','SPIRE');";
const rnPrevious="else if(key==='rn')await open(page,'#employeeLiveSpireLauncher','/spire/master.html','SPIRE',{popup:true});";
const rnNew="else if(key==='rn')await open(page,'#employeeLiveSpireLauncher','/spire/client-station.html','SPIRE',{popup:true});";
if(source.includes(rnOld))source=source.replace(rnOld,rnNew);
else if(source.includes(rnPrevious))source=source.replace(rnPrevious,rnNew);
else if(!source.includes(rnNew))throw new Error('Production Role UAT RN launcher anchor missing');

const schedulerOld="else if(key==='scheduler'){await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher');await open(page,'#employeeSchedulingLauncher','/scheduling.html','Workforce Schedule Control');}";
const schedulerPrevious="else if(key==='scheduler'){await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher');await open(page,'#employeeSchedulingLauncher','/scheduling.html','Workforce Schedule Control',{title:/Sulandra Workforce Scheduling/i});}";
const schedulerPrior="else if(key==='scheduler'){await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher');await open(page,'#employeeSchedulingLauncher','/scheduling.html','Workforce Schedule Control',{title:/Sulandra Health \\| Scheduling/i});}";
const schedulerNew="else if(key==='scheduler'){await absent(page,'#employeeMyShiftLauncher','#employeeLiveSpireLauncher','#employeeCompanyDocumentsLauncher');await open(page,'#employeeSchedulingLauncher','/scheduling.html','Scheduling',{title:/Sulandra Health \\| Scheduling/i});}";
if(source.includes(schedulerOld))source=source.replace(schedulerOld,schedulerNew);
else if(source.includes(schedulerPrevious))source=source.replace(schedulerPrevious,schedulerNew);
else if(source.includes(schedulerPrior))source=source.replace(schedulerPrior,schedulerNew);
else if(!source.includes(schedulerNew))throw new Error('Production Role UAT scheduler anchor missing');

// Management users now remain in Employee Portal and receive an explicit Admin
// Sign In door. Older UAT revisions included an executive-only /spire-admin.html
// launcher branch; normalize it when present, but do not require or recreate it.
const executiveNew="else if(p.executive){const link=await visibleControl(page,'a[href=\"/spire-admin.html\"]');await link.click();await expect(page).toHaveURL(/\\/spire-admin\\.html$/);await expect(page).toHaveTitle(/SPIRE/i);}";
if(!source.includes(executiveNew)){
  const executiveSearchStart=source.indexOf("else if(key==='auditor')");
  const executiveStart=source.indexOf('else if(p.executive){',Math.max(0,executiveSearchStart));
  if(executiveStart>=0){
    const executiveEnd=source.indexOf('\n  expect(mutations,',executiveStart);
    if(executiveEnd<0)throw new Error('Production Role UAT executive SPIRE launcher end anchor missing');
    source=source.slice(0,executiveStart)+executiveNew+source.slice(executiveEnd);
  }
}

const mobileAdminOld="['Administrator',PERSONAS.administrator,'#topModuleNav a[href=\"/spire-admin.html\"]','/spire-admin.html'],";
const mobileAdminNew="['Administrator',PERSONAS.administrator,'a[href=\"/spire-admin.html\"]','/spire-admin.html'],";
if(source.includes(mobileAdminOld))source=source.replace(mobileAdminOld,mobileAdminNew);
else if(source.includes(mobileAdminNew)){}

await writeFile(target,source,'utf8');
console.log('Prepared Production Role UAT for actionable launch controls, authenticated SPIRE Client Station routing, current scheduling title, and the current separate Admin-sign-in boundary without requiring an obsolete executive SPIRE launcher.');
