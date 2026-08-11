import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asset = (name) => path.join(root, 'assets', name);
const canonicalToken = "const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';";

async function patchAuth(name) {
  const target = asset(name);
  let source = await readFile(target, 'utf8');

  source = source.replace(/const token=\(\)=>[^;]+;/, canonicalToken);

  if (!source.includes("window.SulandraCompanyContext?.headers?.()")) {
    source = source.replace(
      /Authorization:`Bearer \$\{token\(\)\}`,(?!\.\.\.\(window\.SulandraCompanyContext)/g,
      "Authorization:`Bearer ${token()}`,...(window.SulandraCompanyContext?.headers?.()||{}),",
    );
  }

  await writeFile(target, source, 'utf8');
  return source;
}

// Communications previously replaced #module-employees wholesale. That caused the
// Employee Directory to appear, then disappear as later Employee 360 modules loaded.
{
  const target = asset('admin-employee-communications.js');
  let source = await patchAuth('admin-employee-communications.js');

  const destructive = "function render(){const root=host();if(!root)return;root.innerHTML=`";
  const safe = "function render(){const root=host();if(!root)return;let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`";
  if (source.includes(destructive)) source = source.replace(destructive, safe);
  if (!source.includes(safe)) throw new Error('Unable to verify non-destructive Communications mount');

  source = source
    .replace("root.querySelector('#comm-refresh')", "view.querySelector('#comm-refresh')")
    .replace("root.querySelector('#comm-announcement')", "view.querySelector('#comm-announcement')")
    .replace("root.querySelector('#comm-notification')", "view.querySelector('#comm-notification')");

  const destructiveCatch = "async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){root.innerHTML=`<p style=\"color:#b91c1c\">${esc(error.message)}</p>`}}";
  const safeCatch = "async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`<div style=\"padding:12px;border:1px solid #fecaca;border-radius:10px;color:#b91c1c;background:#fff7f7\">Communications could not load: ${esc(error.message)}</div>`}}";
  if (source.includes(destructiveCatch)) source = source.replace(destructiveCatch, safeCatch);
  if (!source.includes("Communications could not load:")) throw new Error('Unable to verify scoped Communications error state');

  await writeFile(target, source, 'utf8');
}

// These specialty centers append into Employee 360, but several still used stale
// token names. Normalize them to the Admin shell token and selected-company scope.
for (const name of [
  'admin-employee-engagement.js',
  'admin-employee-learning.js',
  'admin-employee-health-safety.js',
]) {
  await patchAuth(name);
}

console.log('Employee 360 specialty modules now preserve the Employee Directory and share canonical Admin authentication/company context.');
