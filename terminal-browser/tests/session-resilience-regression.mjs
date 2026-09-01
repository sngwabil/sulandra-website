import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const resilience=path.join(repo,'assets','it-agent-terminal-session-resilience.js');
if(!fs.existsSync(resilience))throw new Error(`Missing terminal session resilience asset: ${resilience}`);
const script=fs.readFileSync(resilience,'utf8');

const html=`<!doctype html><html><head><meta charset="utf-8"><title>Terminal session resilience</title></head><body><script>${script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
const server=http.createServer((_req,res)=>{
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const address=server.address();
if(!address||typeof address==='string')throw new Error('Session resilience fixture did not bind');

let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  const url=`http://127.0.0.1:${address.port}/`;
  await page.goto(url,{waitUntil:'domcontentloaded'});

  const ids={workspace:'ws_auth_resume_123',session:'term_auth_resume_456'};
  await page.evaluate(ids=>{
    sessionStorage.setItem('sulandra:admin:access-token','fixture-secret-token-must-not-persist');
    sessionStorage.setItem('sulandra:it-solutions:terminal-workspace',ids.workspace);
    sessionStorage.setItem('sulandra:it-solutions:terminal-sessions:'+ids.workspace,JSON.stringify({ids:[ids.session],activeId:ids.session}));
  },ids);
  await page.waitForTimeout(1100);

  const persisted=await page.evaluate(ids=>({
    workspace:localStorage.getItem('sulandra:it-solutions:terminal-workspace'),
    sessions:localStorage.getItem('sulandra:it-solutions:terminal-sessions:'+ids.workspace),
    leakedAdmin:localStorage.getItem('sulandra:admin:access-token'),
    leakedEmployee:localStorage.getItem('sulandra:employee:access-token'),
  }),ids);
  if(persisted.workspace!==ids.workspace)throw new Error(`Workspace identifier was not persisted: ${JSON.stringify(persisted)}`);
  if(!String(persisted.sessions||'').includes(ids.session))throw new Error(`Session identifier was not persisted: ${JSON.stringify(persisted)}`);
  if(persisted.leakedAdmin||persisted.leakedEmployee)throw new Error('Terminal resilience must never persist auth tokens');

  // Simulate the login/navigation path losing tab-scoped terminal identifiers.
  await page.evaluate(ids=>{
    sessionStorage.removeItem('sulandra:it-solutions:terminal-workspace');
    sessionStorage.removeItem('sulandra:it-solutions:terminal-sessions:'+ids.workspace);
    sessionStorage.removeItem('sulandra:admin:access-token');
  },ids);
  await page.reload({waitUntil:'domcontentloaded'});

  const restored=await page.evaluate(ids=>({
    workspace:sessionStorage.getItem('sulandra:it-solutions:terminal-workspace'),
    sessions:sessionStorage.getItem('sulandra:it-solutions:terminal-sessions:'+ids.workspace),
    auth:sessionStorage.getItem('sulandra:admin:access-token'),
  }),ids);
  if(restored.workspace!==ids.workspace)throw new Error(`Workspace identifier was not restored after navigation: ${JSON.stringify(restored)}`);
  if(!String(restored.sessions||'').includes(ids.session))throw new Error(`Session identifier was not restored after navigation: ${JSON.stringify(restored)}`);
  if(restored.auth)throw new Error('Terminal resilience unexpectedly restored an authentication token');

  console.log('Session resilience regression passed: workspace/session identifiers survive navigation while authentication remains separate.');
}finally{
  await browser?.close().catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
