import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'dist-web','admin.html');
let html=await readFile(target,'utf8');
html=html.replace(/\s*<a id="intranet-content-control-link"[\s\S]*?<\/a>\s*/g,'\n');
const control='<a id="intranet-content-control-link" href="/intranet-control.html" style="position:fixed;right:18px;bottom:18px;z-index:9999;background:#075985;color:white;padding:12px 16px;border-radius:10px;font:700 13px system-ui;text-decoration:none;box-shadow:0 10px 28px rgba(15,23,42,.25)">Manage Intranet Content</a>';
if(!html.includes('</body>'))throw new Error('Unable to expose Intranet Content Control in Admin');
html=html.replace('</body>',`${control}\n</body>`);
await writeFile(target,html,'utf8');
console.log('Admin now links directly to the Intranet Content Control.');
