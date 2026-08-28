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

// Railway Storage Buckets are S3-compatible but do not currently accept S3
// server-side-encryption headers. Sulandra must therefore encrypt artifact bytes
// client-side before sending them to Railway and omit unsupported SSE headers.
// External S3-compatible providers retain the existing SSE-S3 / SSE-KMS path.
const oldEncryptionBlock=`  let encryption: StoredObject['encryption'];
  if (encrypted.encryption) {
    encryption = 'CLIENT-AES-256-GCM';
    headers['x-amz-server-side-encryption'] = kmsKeyId ? 'aws:kms' : 'AES256';
  } else if (kmsKeyId) {
    encryption = 'SSE-KMS';
    headers['x-amz-server-side-encryption'] = 'aws:kms';
    headers['x-amz-server-side-encryption-aws-kms-key-id'] = kmsKeyId;
  } else {
    encryption = 'SSE-S3';
    headers['x-amz-server-side-encryption'] = 'AES256';
  }`;
const newEncryptionBlock=`  const railwayObjectStorage = (() => { try { return new URL(config.endpoint).hostname.toLowerCase().endsWith('storage.railway.app'); } catch { return false; } })();
  let encryption: StoredObject['encryption'];
  if (encrypted.encryption) {
    encryption = 'CLIENT-AES-256-GCM';
    if (!railwayObjectStorage) headers['x-amz-server-side-encryption'] = kmsKeyId ? 'aws:kms' : 'AES256';
  } else if (railwayObjectStorage) {
    throw Object.assign(new Error('Railway artifact storage requires EMPLOYEE_OBJECT_CLIENT_ENCRYPTION_KEY_BASE64 so files are encrypted before upload'), { status: 503 });
  } else if (kmsKeyId) {
    encryption = 'SSE-KMS';
    headers['x-amz-server-side-encryption'] = 'aws:kms';
    headers['x-amz-server-side-encryption-aws-kms-key-id'] = kmsKeyId;
  } else {
    encryption = 'SSE-S3';
    headers['x-amz-server-side-encryption'] = 'AES256';
  }`;
if(source.includes(oldEncryptionBlock))source=source.replace(oldEncryptionBlock,newEncryptionBlock);
else if(!source.includes('railwayObjectStorage'))throw new Error('Secure object encryption compatibility anchor changed');
if(!source.includes("Railway artifact storage requires EMPLOYEE_OBJECT_CLIENT_ENCRYPTION_KEY_BASE64"))throw new Error('Railway object-storage encryption guard is missing');

await writeFile(target,source,'utf8');

// Spire administrator shortcuts must accept the full UserRole enum. Literal
// arrays passed to Array.includes() narrow the accepted parameter and make tsc
// reject valid UserRole values that are not members of the literal tuple.
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

const emarFile=path.join(root,'api/src/spire-emar-routes.ts');
try{
  let emar=await readFile(emarFile,'utf8');
  const oldEmar="const isAdmin=(a:AuthContext)=>[UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.CEO,UserRole.DOO].includes(a.role)||String(a.email||'').toLowerCase()==='admin@sulandrahealth.com';";
  const newEmar="const isAdmin=(a:AuthContext)=>new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.CEO,UserRole.DOO]).has(a.role)||String(a.email||'').toLowerCase()==='admin@sulandrahealth.com';";
  if(emar.includes(oldEmar))emar=emar.replace(oldEmar,newEmar);
  if(emar.includes('[UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.CEO,UserRole.DOO].includes(a.role)'))throw new Error('Spire eMAR UserRole typing was not repaired');
  await writeFile(emarFile,emar,'utf8');
}catch(error){if(error?.code!=='ENOENT')throw error}

console.log('Secure object storage BodyInit, Railway client-encryption compatibility, and Spire administrator/eMAR UserRole typing are build-safe.');
