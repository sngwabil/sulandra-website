import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const route=await readFile(path.join(root,'api/src/employee-communications-notifications-routes.ts'),'utf8');
if(!route.includes('registerEmployeeCommunicationsNotificationsRoutes')) throw new Error('Employee communications route module is missing its registration export');
const bootstrap=await readFile(path.join(root,'api/src/onboarding-bootstrap.ts'),'utf8');
if(!bootstrap.includes('registerEmployeeCommunicationsNotificationsRoutes({ app, prisma')) throw new Error('Employee communications routes are not registered in the backend bootstrap');

const frontendPath=path.join(root,'assets','admin-employee-communications.js');
try {
  await access(frontendPath);
  let frontend=await readFile(frontendPath,'utf8');
  const canonicalToken="const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';";
  frontend=frontend.replace(/const token=\(\)=>[^;]+;/,canonicalToken);
  frontend=frontend.replace(/Authorization:`Bearer \$\{token\(\)\}`,(?!\.\.\.\(window\.SulandraCompanyContext)/g,"Authorization:`Bearer ${token()}`,...(window.SulandraCompanyContext?.headers?.()||{}),");
  const destructive="function render(){const root=host();if(!root)return;root.innerHTML=`";
  const scoped="function render(){const root=host();if(!root)return;let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`";
  if(frontend.includes(destructive)) frontend=frontend.replace(destructive,scoped);
  if(frontend.includes(scoped)) frontend=frontend.replaceAll("root.querySelector('#comm-","view.querySelector('#comm-");
  const destructiveError="async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){root.innerHTML=`<p style=\"color:#b91c1c\">${esc(error.message)}</p>`}}";
  const scopedError="async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`<div style=\"padding:12px;border:1px solid #fecaca;border-radius:10px;color:#b91c1c;background:#fff7f7\">Communications could not load: ${esc(error.message)}</div>`}}";
  if(frontend.includes(destructiveError)) frontend=frontend.replace(destructiveError,scopedError);
  if(frontend.includes('root.innerHTML=`<p style="color:#b91c1c">')) throw new Error('Employee communications still has a destructive Employees-module error renderer');
  await writeFile(frontendPath,frontend,'utf8');
} catch (error) {
  if(error?.code!=='ENOENT') throw error;
}
console.log('Employee 360 communications integration is API-build safe; static builds apply canonical Admin authentication/company scope and non-destructive mounting.');
