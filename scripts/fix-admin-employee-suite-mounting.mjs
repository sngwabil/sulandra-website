import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalToken = "const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';";
const roots = [path.join(root, 'assets'), path.join(root, 'dist-web', 'assets')];

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function patchAuth(target) {
  let source = await readFile(target, 'utf8');
  source = source.replace(/const token=\(\)=>[^;]+;/, canonicalToken);
  if (!source.includes("window.SulandraCompanyContext?.headers?.()")) {
    source = source.replace(
      /Authorization:`Bearer \$\{token\(\)\}`,/g,
      "Authorization:`Bearer ${token()}`,...(window.SulandraCompanyContext?.headers?.()||{}),",
    );
  }
  await writeFile(target, source, 'utf8');
  return source;
}

async function patchCommunications(target) {
  let source = await patchAuth(target);

  const destructive = "function render(){const root=host();if(!root)return;root.innerHTML=`";
  const safe = "function render(){const root=host();if(!root)return;let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`";
  if (source.includes(destructive)) source = source.replace(destructive, safe);
  if (!source.includes(safe)) throw new Error(`Unable to verify non-destructive Communications mount in ${target}`);

  source = source
    .replace("root.querySelector('#comm-refresh')", "view.querySelector('#comm-refresh')")
    .replace("root.querySelector('#comm-announcement')", "view.querySelector('#comm-announcement')")
    .replace("root.querySelector('#comm-notification')", "view.querySelector('#comm-notification')");

  const destructiveCatch = "async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){root.innerHTML=`<p style=\"color:#b91c1c\">${esc(error.message)}</p>`}}";
  const safeCatch = "async function load(){const root=host();if(!root)return;try{data=await request('/api/admin/employee-communications/dashboard');render()}catch(error){let view=document.getElementById('employee-communications-admin');if(!view){view=document.createElement('section');view.id='employee-communications-admin';view.style.marginTop='22px';root.appendChild(view)}view.innerHTML=`<div style=\"padding:12px;border:1px solid #fecaca;border-radius:10px;color:#b91c1c;background:#fff7f7\">Communications could not load: ${esc(error.message)}</div>`}}";
  if (source.includes(destructiveCatch)) source = source.replace(destructiveCatch, safeCatch);
  if (!source.includes('Communications could not load:')) throw new Error(`Unable to verify scoped Communications error state in ${target}`);

  await writeFile(target, source, 'utf8');
}

for (const assetRoot of roots) {
  const communications = path.join(assetRoot, 'admin-employee-communications.js');
  if (!(await exists(communications))) continue;
  await patchCommunications(communications);

  for (const name of [
    'admin-employee-engagement.js',
    'admin-employee-learning.js',
    'admin-employee-health-safety.js',
  ]) {
    const target = path.join(assetRoot, name);
    if (await exists(target)) await patchAuth(target);
  }
}

console.log('Employee 360 specialty modules now preserve the Employee Directory and share canonical Admin authentication/company context in source and dist-web.');
