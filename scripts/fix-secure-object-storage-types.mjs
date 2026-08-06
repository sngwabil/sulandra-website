import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api/src/secure-object-storage.ts');
let source=await readFile(target,'utf8');
source=source.replace("const response = await fetch(url, { method: 'PUT', headers: signed, body: encrypted.body });","const uploadBody = new Uint8Array(encrypted.body.buffer, encrypted.body.byteOffset, encrypted.body.byteLength);\n  const response = await fetch(url, { method: 'PUT', headers: signed, body: uploadBody });");
if(!source.includes('const uploadBody = new Uint8Array'))throw new Error('Secure object upload body typing was not repaired');
await writeFile(target,source,'utf8');
console.log('Secure object storage upload body is compatible with Node fetch BodyInit typing.');
