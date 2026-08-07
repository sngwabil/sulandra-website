(()=>{
  'use strict';
  const TOKEN_KEY='sulandra:employee:access-token';
  const SESSION_KEY='sulandra:employee:session';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const nativeFetch=window.fetch.bind(window);

  const parse=value=>{try{return JSON.parse(value||'null')}catch{return null}};
  const readToken=()=>sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||'';
  const readSession=()=>parse(sessionStorage.getItem(SESSION_KEY))||parse(localStorage.getItem(SESSION_KEY));
  const writeSession=(token,session)=>{
    if(token){sessionStorage.setItem(TOKEN_KEY,token);localStorage.setItem(TOKEN_KEY,token)}
    if(session){const encoded=JSON.stringify(session);sessionStorage.setItem(SESSION_KEY,encoded);localStorage.setItem(SESSION_KEY,encoded)}
  };
  const clear=()=>{sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(SESSION_KEY);localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(SESSION_KEY)};
  const expired=session=>{
    if(!session)return true;
    if(session.expiresAt){const t=Date.parse(session.expiresAt);if(Number.isFinite(t))return t<=Date.now()+15000;}
    return false;
  };

  const token=readToken();
  const session=readSession();
  if(token&&session&&!expired(session))writeSession(token,session);
  else if(session&&expired(session))clear();

  window.SulandraSSO={
    token:readToken,
    session:readSession,
    save:writeSession,
    clear,
    signedIn:()=>Boolean(readToken()&&readSession()&&!expired(readSession())),
    role:()=>readSession()?.role||'',
    can(permission){const s=readSession()||{};return Array.isArray(s.permissions)&&s.permissions.includes(permission)},
    api:API
  };

  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:(input?.url||'');
    let resolved='';
    try{resolved=new URL(url,location.href).href}catch{resolved=String(url||'')}
    const method=String(init.method||'GET').toUpperCase();
    if(method==='GET'&&resolved===API+'/api/session'){
      const cached=readSession();
      const activeToken=readToken();
      if(activeToken&&cached&&!expired(cached)){
        return new Response(JSON.stringify({data:cached}),{status:200,headers:{'content-type':'application/json','x-sulandra-session-cache':'hit'}});
      }
    }
    return nativeFetch(input,init);
  };
})();
