import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const canonical='https://sulandra-website-production-5fc4.up.railway.app';
const stale='https://sulandra-website-production.up.railway.app';
const files=['employee-login-railway.js','employee-portal-railway.js','admin-railway.js'];
const failures=[];
for(const relative of files){
  try{
    const source=await readFile(path.join(dist,relative),'utf8');
    if(source.includes(stale))failures.push(`${relative} still references the retired Railway API hostname`);
    if(!source.includes(canonical))failures.push(`${relative} does not reference the canonical Railway API hostname`);
    if(relative==='admin-railway.js' && /response\.status\s*===\s*401\)\s*signOut\(/.test(source)) {
      failures.push('admin-railway.js still clears the global login when one protected feature endpoint returns 401');
    }
  }catch(error){failures.push(`Missing published authentication asset: ${relative}`)}
}
if(failures.length){console.error('Portal authentication verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Portal authentication verified: canonical API host is consistent and Admin preserves the global login across module-level authorization failures.');
