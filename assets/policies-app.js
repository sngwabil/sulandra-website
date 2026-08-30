(()=>{
  'use strict';

  const token=()=>sessionStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra:employee:access-token')||localStorage.getItem('sulandra_token')||localStorage.getItem('token')||localStorage.getItem('accessToken')||'';

  function signOut(){
    sessionStorage.removeItem('sulandra:employee:access-token');
    localStorage.removeItem('sulandra:employee:access-token');
    localStorage.removeItem('sulandra_token');
    localStorage.removeItem('token');
    localStorage.removeItem('accessToken');
    location.href='/employee-login.html';
  }

  if(!token()){
    location.href='/employee-login.html';
    return;
  }

  document.getElementById('logout')?.addEventListener('click',signOut);
})();
