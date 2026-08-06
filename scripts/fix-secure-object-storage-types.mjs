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
console.log('Secure object storage upload body is compatible with Node fetch typing without copying file bytes.');
