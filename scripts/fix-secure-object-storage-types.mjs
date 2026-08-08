import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api/src/secure-object-storage.ts');
let source=await readFile(target,'utf8');

// Node 22 accepts Buffer/Uint8Array bodies at runtime, but this project compiles
// against DOM fetch typings whose BodyInit definition rejects Node's generic
// ArrayBufferLike-backed Buffer/Uint8Array. Keep the runtime Buffer and narrow
// only the TypeScript boundary rather than copying or re-encoding file bytes.
source=source.replace(
  "const response = await fetch(url, { method: 'PUT', headers: signed, body: encrypted.body });",
  "const response = await fetch(url, { method: 'PUT', headers: signed, body: encrypted.body as any });",
);
source=source.replace(
  "const uploadBody = new Uint8Array(encrypted.body.buffer, encrypted.body.byteOffset, encrypted.body.byteLength);\n  const response = await fetch(url, { method: 'PUT', headers: signed, body: uploadBody });",
  "const response = await fetch(url, { method: 'PUT', headers: signed, body: encrypted.body as any });",
);

if(!source.includes("body: encrypted.body as any"))throw new Error('Secure object upload BodyInit typing was not repaired');
await writeFile(target,source,'utf8');

// Spire's administrator shortcut must accept the full UserRole enum. A literal
// array passed to Array.includes() narrows the parameter to only the three array
// members and fails tsc when a.role is typed as UserRole. Use Set<UserRole>
// instead so all role values type-check while retaining the exact same runtime rule.
const roleTargets=[
  'api/src/spire-documents-external-records-routes.ts',
  'api/src/spire-communications-inbasket-routes.ts',
  'api/src/spire-authorizations-evv-routes.ts',
];
const oldAdmin="const admin=(a:A)=>[UserRole.ADMINISTRATOR,UserRole.CEO,UserRole.DOO].includes(a.role)||String(a.email||'').toLowerCase()==='admin@sulandrahealth.com';";
const newAdmin="const admin=(a:A)=>new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.CEO,UserRole.DOO]).has(a.role)||String(a.email||'').toLowerCase()==='admin@sulandrahealth.com';";
for(const relative of roleTargets){
  const file=path.join(root,relative);
  let body;
  try{body=await readFile(file,'utf8')}catch(error){if(error?.code==='ENOENT')continue;throw error}
  if(body.includes(oldAdmin))body=body.replace(oldAdmin,newAdmin);
  if(body.includes('[UserRole.ADMINISTRATOR,UserRole.CEO,UserRole.DOO].includes(a.role)'))throw new Error(`Spire UserRole typing was not repaired in ${relative}`);
  await writeFile(file,body,'utf8');
}

console.log('Secure object storage BodyInit and Spire administrator UserRole typing are build-safe.');
