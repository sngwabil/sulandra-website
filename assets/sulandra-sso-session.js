(()=>{
  'use strict';
  const TOKEN_KEY='sulandra:employee:access-token';
  const SESSION_KEY='sulandra:employee:session';
  const API='https://sulandra-website-production-5fc4.up.railway.app';
  const PRIVILEGED_ROLES=new Set(['ADMINISTRATOR','CEO','DOO']);
  const nativeFetch=window.fetch.bind(window);

  const parse=value=>{try{return JSON.parse(value||'null')}catch{return null}};
  const roleOf=session=>String(session?.role||session?.user?.role||session?.profile?.role||'').toUpperCase();
  const readToken=()=>sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||'';
  const readSession=()=>parse(sessionStorage.getItem(SESSION_KEY))||parse(localStorage.getItem(SESSION_KEY));
  const writeSession=(token,session)=>{
    const privileged=PRIVILEGED_ROLES.has(roleOf(session));
    if(token)sessionStorage.setItem(TOKEN_KEY,token);
    if(session)sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
    if(privileged){localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(SESSION_KEY);return}
    if(token)localStorage.setItem(TOKEN_KEY,token);
    if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));
  };
  const clear=()=>{sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(SESSION_KEY);localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(SESSION_KEY)};
  const expired=session=>{
    if(!session)return true;
    if(session.expiresAt){const t=Date.parse(session.expiresAt);if(Number.isFinite(t))return t<=Date.now()+15000;}
    return false;
  };
  const loadPrivilegedGuard=session=>{
    if(!PRIVILEGED_ROLES.has(roleOf(session)))return;
    if(document.querySelector('script[data-sulandra-admin-session-security]'))return;
    const script=document.createElement('script');
    script.src='/assets/admin-session-security.js?v=20260815-privileged-session-1';
    script.async=false;
    script.dataset.sulandraAdminSessionSecurity='true';
    (document.head||document.documentElement).appendChild(script);
  };

  const token=readToken();
  const session=readSession();
  if(token&&session&&!expired(session))writeSession(token,session);
  else if(session&&expired(session))clear();
  loadPrivilegedGuard(readSession());

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