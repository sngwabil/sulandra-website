import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'api','dist','onboarding-bootstrap.js');
const marker='IT_SOLUTIONS_TERMINAL_PROXY_RUNTIME_V1';
const anchor='registerMultiCompanyRoutes({ app, prisma, authOf, requireRoles, audit });';
let source=await readFile(target,'utf8');
if(source.includes(marker)){
  console.log('Compiled IT terminal proxy is already installed.');
  process.exit(0);
}
if(!source.includes(anchor))throw new Error('Compiled IT terminal proxy anchor changed');

const block=String.raw`
/* IT_SOLUTIONS_TERMINAL_PROXY_RUNTIME_V1
   Authenticated browser requests are proxied to a dedicated isolated coding worker.
   No worker token or production credential is exposed to browser code. */
const terminalWorkerBaseUrl=(process.env.IT_TERMINAL_WORKER_URL?.trim().replace(/\/$/,'')||'');
const terminalWorkerToken=(process.env.IT_TERMINAL_WORKER_TOKEN?.trim()||'');
const terminalIdentifierSchema=z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const terminalInputSchema=z.object({data:z.string().min(1).max(65536)});
const terminalResizeSchema=z.object({cols:z.coerce.number().int().min(40).max(240).optional(),rows:z.coerce.number().int().min(12).max(80).optional()});
const terminalAdminRoles=requireRoles(UserRole.ADMINISTRATOR,UserRole.CEO,UserRole.COO);
const terminalOwnerKey=res=>{const auth=authOf(res);return [auth.organizationId,auth.userId].filter(Boolean).join(':')};
const terminalWorkerRequest=async(res,workerPath,options={})=>{
  if(!terminalWorkerBaseUrl||!terminalWorkerToken)throw Object.assign(new Error('The isolated coding terminal worker is not configured'),{status:503});
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(2000,options.timeoutMs??20000));
  try{
    const response=await fetch(terminalWorkerBaseUrl+workerPath,{method:options.method||'GET',headers:{Accept:'application/json','Content-Type':'application/json','x-sulandra-terminal-token':terminalWorkerToken,'x-sulandra-terminal-owner':terminalOwnerKey(res)},body:options.body===undefined?undefined:JSON.stringify(options.body),signal:controller.signal});
    const text=await response.text();let payload={};if(text){try{payload=JSON.parse(text)}catch{payload={error:text.slice(0,2000)}}}
    if(!response.ok)throw Object.assign(new Error(typeof payload.error==='string'?payload.error:'Terminal worker request failed ('+response.status+')'),{status:response.status});
    return payload;
  }catch(error){if(error?.name==='AbortError')throw Object.assign(new Error('The coding terminal worker timed out'),{status:504});throw error}finally{clearTimeout(timer)}
};
app.get('/api/it-solutions/terminal/health',terminalAdminRoles,async(_req,res,next)=>{try{const data=await terminalWorkerRequest(res,'/health',{timeoutMs:5000});res.json({data:{...data,proxied:true}})}catch(error){next(error)}});
app.post('/api/it-solutions/terminal/workspaces',terminalAdminRoles,async(_req,res,next)=>{try{const auth=authOf(res);const data=await terminalWorkerRequest(res,'/workspaces',{method:'POST',body:{},timeoutMs:60000});await audit(auth,'CREATE_ISOLATED_CODING_WORKSPACE','ItTerminalWorkspace',String(data.workspaceId||''),{isolated:true,worker:'Sulandra Coding Terminal Worker'});res.status(201).json({data})}catch(error){next(error)}});
app.get('/api/it-solutions/terminal/workspaces/:workspaceId',terminalAdminRoles,async(req,res,next)=>{try{const workspaceId=terminalIdentifierSchema.parse(req.params.workspaceId);const data=await terminalWorkerRequest(res,'/workspaces/'+encodeURIComponent(workspaceId));res.json({data})}catch(error){next(error)}});
app.delete('/api/it-solutions/terminal/workspaces/:workspaceId',terminalAdminRoles,async(req,res,next)=>{try{const auth=authOf(res);const workspaceId=terminalIdentifierSchema.parse(req.params.workspaceId);const data=await terminalWorkerRequest(res,'/workspaces/'+encodeURIComponent(workspaceId),{method:'DELETE'});await audit(auth,'DELETE_ISOLATED_CODING_WORKSPACE','ItTerminalWorkspace',workspaceId,{isolated:true});res.json({data})}catch(error){next(error)}});
app.post('/api/it-solutions/terminal/workspaces/:workspaceId/sessions',terminalAdminRoles,async(req,res,next)=>{try{const auth=authOf(res);const workspaceId=terminalIdentifierSchema.parse(req.params.workspaceId);const dimensions=terminalResizeSchema.parse(req.body||{});const data=await terminalWorkerRequest(res,'/workspaces/'+encodeURIComponent(workspaceId)+'/sessions',{method:'POST',body:dimensions});await audit(auth,'OPEN_ISOLATED_TERMINAL_SESSION','ItTerminalSession',String(data.sessionId||''),{workspaceId});res.status(201).json({data})}catch(error){next(error)}});
app.get('/api/it-solutions/terminal/sessions/:sessionId/output',terminalAdminRoles,async(req,res,next)=>{try{const sessionId=terminalIdentifierSchema.parse(req.params.sessionId);const cursor=Math.max(0,Math.trunc(Number(req.query.cursor)||0));res.set('Cache-Control','private, no-store, no-cache, must-revalidate');res.set('Pragma','no-cache');const data=await terminalWorkerRequest(res,'/sessions/'+encodeURIComponent(sessionId)+'/output?cursor='+encodeURIComponent(String(cursor)),{timeoutMs:10000});res.json({data})}catch(error){next(error)}});
app.get('/api/it-solutions/terminal/sessions/:sessionId/history',terminalAdminRoles,async(req,res,next)=>{try{const sessionId=terminalIdentifierSchema.parse(req.params.sessionId);const params=new URLSearchParams();if(req.query.before!==undefined&&req.query.before!=='')params.set('before',String(Math.max(0,Math.trunc(Number(req.query.before)||0))));params.set('limit',String(Math.max(4096,Math.min(1048576,Math.trunc(Number(req.query.limit)||262144)))));res.set('Cache-Control','private, no-store, no-cache, must-revalidate');res.set('Pragma','no-cache');const data=await terminalWorkerRequest(res,'/sessions/'+encodeURIComponent(sessionId)+'/history?'+params.toString(),{timeoutMs:15000});res.json({data})}catch(error){next(error)}});
app.post('/api/it-solutions/terminal/sessions/:sessionId/input',terminalAdminRoles,async(req,res,next)=>{try{const sessionId=terminalIdentifierSchema.parse(req.params.sessionId);const input=terminalInputSchema.parse(req.body||{});const data=await terminalWorkerRequest(res,'/sessions/'+encodeURIComponent(sessionId)+'/input',{method:'POST',body:input});res.json({data})}catch(error){next(error)}});
app.post('/api/it-solutions/terminal/sessions/:sessionId/resize',terminalAdminRoles,async(req,res,next)=>{try{const sessionId=terminalIdentifierSchema.parse(req.params.sessionId);const dimensions=terminalResizeSchema.parse(req.body||{});const data=await terminalWorkerRequest(res,'/sessions/'+encodeURIComponent(sessionId)+'/resize',{method:'POST',body:dimensions});res.json({data})}catch(error){next(error)}});
app.delete('/api/it-solutions/terminal/sessions/:sessionId',terminalAdminRoles,async(req,res,next)=>{try{const auth=authOf(res);const sessionId=terminalIdentifierSchema.parse(req.params.sessionId);const data=await terminalWorkerRequest(res,'/sessions/'+encodeURIComponent(sessionId),{method:'DELETE'});await audit(auth,'CLOSE_ISOLATED_TERMINAL_SESSION','ItTerminalSession',sessionId,{isolated:true});res.json({data})}catch(error){next(error)}});
`;
source=source.replace(anchor,block+'\n'+anchor);
await writeFile(target,source,'utf8');
console.log('Compiled API now proxies authenticated IT Solutions terminal sessions to the isolated coding worker.');
