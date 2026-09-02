/* SULANDRA_CODEBASE_API_BRIDGE_V2_RAILWAY_DB */
(()=>{
'use strict';
if(window.__SULANDRA_CODEBASE_API_BRIDGE_V2_RAILWAY_DB__)return;
window.__SULANDRA_CODEBASE_API_BRIDGE_V2_RAILWAY_DB__=true;

// Codebase/IDE canary traffic is intentionally isolated on the Railway-backed
// feature API while the historical production dataset remains on Supabase
// until the controlled final migration and reconciliation are complete.
const API_ORIGIN='https://codebase-e2e-api-railway-production.up.railway.app';
const CODEBASE_PATH=/^\/api\/it-solutions\/codebase\/(?:tree|file)(?:\?|$)/;
const nativeFetch=window.fetch.bind(window);
const token=()=>sessionStorage.getItem('sulandra:admin:access-token')||localStorage.getItem('sulandra:admin:access-token')||sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('token')||'';
const companyHeaders=()=>window.SulandraCompanyContext?.headers?.()||{};

window.fetch=(input,init={})=>{
  const rawUrl=typeof input==='string'||input instanceof URL?String(input):String(input?.url||'');
  let parsed;
  try{parsed=new URL(rawUrl,window.location.origin)}catch{return nativeFetch(input,init)}
  if(parsed.origin!==window.location.origin||!CODEBASE_PATH.test(parsed.pathname+parsed.search))return nativeFetch(input,init);

  const bearer=token();
  if(!bearer)return Promise.resolve(new Response(JSON.stringify({error:'Administrator sign-in is required.'}),{status:401,headers:{'Content-Type':'application/json'}}));

  const baseHeaders=input instanceof Request?new Headers(input.headers):new Headers();
  const initHeaders=new Headers(init.headers||{});
  initHeaders.forEach((value,key)=>baseHeaders.set(key,value));
  baseHeaders.set('Accept','application/json');
  baseHeaders.set('Authorization',`Bearer ${bearer}`);
  for(const [key,value] of Object.entries(companyHeaders()))if(value!==undefined&&value!==null)baseHeaders.set(key,String(value));

  const target=API_ORIGIN+parsed.pathname+parsed.search;
  if(input instanceof Request){
    const forwarded=new Request(target,input);
    return nativeFetch(forwarded,{...init,headers:baseHeaders,credentials:'omit'});
  }
  return nativeFetch(target,{...init,headers:baseHeaders,credentials:'omit'});
};
})();
