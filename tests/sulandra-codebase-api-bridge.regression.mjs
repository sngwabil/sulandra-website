import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../assets/sulandra-codebase-api-bridge.js',import.meta.url),'utf8');
const calls=[];
const storage=new Map([
  ['sulandra:admin:access-token','admin-token-123'],
]);
const store={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
const nativeFetch=async(input,init={})=>{
  calls.push({input,init});
  return new Response(JSON.stringify({data:{ok:true}}),{status:200,headers:{'Content-Type':'application/json'}});
};
const window={
  location:{origin:'https://www.sulandrahealth.com'},
  fetch:nativeFetch,
  SulandraCompanyContext:{headers:()=>({'x-sulandra-legal-entity-id':'entity-1'})},
};
const context=vm.createContext({window,sessionStorage:store,localStorage:store,URL,Request,Response,Headers,Promise,Object,String});
vm.runInContext(source,context,{filename:'sulandra-codebase-api-bridge.js'});

await window.fetch('/api/it-solutions/codebase/tree',{headers:{'X-Test':'yes'}});
assert.equal(calls.length,1);
assert.equal(calls[0].input,'https://sulandra-website-production-5fc4.up.railway.app/api/it-solutions/codebase/tree');
assert.equal(calls[0].init.credentials,'omit');
const treeHeaders=new Headers(calls[0].init.headers);
assert.equal(treeHeaders.get('authorization'),'Bearer admin-token-123');
assert.equal(treeHeaders.get('accept'),'application/json');
assert.equal(treeHeaders.get('x-sulandra-legal-entity-id'),'entity-1');
assert.equal(treeHeaders.get('x-test'),'yes');

await window.fetch('/api/it-solutions/codebase/file?path=README.md');
assert.equal(calls.length,2);
assert.equal(calls[1].input,'https://sulandra-website-production-5fc4.up.railway.app/api/it-solutions/codebase/file?path=README.md');

await window.fetch('/api/health');
assert.equal(calls.length,3);
assert.equal(calls[2].input,'/api/health');

await window.fetch('https://example.com/api/it-solutions/codebase/tree');
assert.equal(calls.length,4);
assert.equal(calls[3].input,'https://example.com/api/it-solutions/codebase/tree');

storage.delete('sulandra:admin:access-token');
const before=calls.length;
const denied=await window.fetch('/api/it-solutions/codebase/tree');
assert.equal(denied.status,401);
assert.equal(calls.length,before);
assert.match(await denied.text(),/Administrator sign-in is required/);

console.log('Sulandra Codebase API bridge regression passed: source tree/file requests target the authenticated production API, carry Admin/company context, and unrelated fetches remain untouched.');
