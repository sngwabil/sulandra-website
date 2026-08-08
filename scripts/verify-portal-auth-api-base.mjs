import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');
const canonical='https://sulandra-website-production-5fc4.up.railway.app';
const stale='https://sulandra-website-production.up.railway.app';
const files=['employee-login-railway.js','employee-portal-railway.js','admin-railway.js'];
const apiRequired=new Set(['employee-login-railway.js','admin-railway.js']);
const failures=[];
for(const relative of files){
  try{
    const source=await readFile(path.join(dist,relative),'utf8');
    if(source.includes(stale))failures.push(`${relative} still references the retired Railway API hostname`);
    if(apiRequired.has(relative) && !source.includes(canonical))failures.push(`${relative} does not reference the canonical Railway API hostname`);
    if(relative==='employee-portal-railway.js'){
      if(!source.includes('sulandra:employee:access-token')||!source.includes('sulandra:employee:session')) failures.push('employee-portal-railway.js does not use the login-established Sulandra session cache');
      if(/fetch\s*\(\s*['"`]\/api\/session/.test(source)) failures.push('employee-portal-railway.js reintroduced redundant per-page session authentication');
    }
    if(relative==='admin-railway.js' && /response\.status\s*===\s*401\)\s*signOut\(/.test(source)) {
      failures.push('admin-railway.js still clears the global login when one protected feature endpoint returns 401');
    }
  }catch(error){failures.push(`Missing published authentication asset: ${relative}`)}
}
if(failures.length){console.error('Portal authentication verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('Portal authentication verified: login/Admin use the canonical API, Employee Portal uses the sign-in-once session cache, and module-level authorization failures do not destroy the global login.');
