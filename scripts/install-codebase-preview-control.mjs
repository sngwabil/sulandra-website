import fs from 'node:fs';

const target=process.argv[2];
if(!target)throw new Error('Usage: node install-codebase-preview-control.mjs <execution-server.mjs>');
let source=fs.readFileSync(target,'utf8');
const marker='CODEBASE_PREVIEW_ENVIRONMENTS_CONTROL_V1';
if(source.includes(marker)){console.log('Codebase preview environment control already installed.');process.exit(0)}
if(!source.includes('CODEBASE_PROJECT_CONTROL_V1'))throw new Error('Codebase project control must be installed before preview environment control');

const anchor="app.get('/v1/workspaces/:workspaceId/codebase/projects/:project/railway/status', async (req, res, next) => {";
if(!source.includes(anchor))throw new Error('Codebase Railway status route anchor changed');

const patch=String.raw`
/* CODEBASE_PREVIEW_ENVIRONMENTS_CONTROL_V1
   Resolves the active Codebase project's linked Railway service domain without
   mutating Railway. Custom domains are preferred over *.up.railway.app. */
const codebasePreviewDomainCandidates = value => {
  const found=[];
  const visit=node=>{
    if(Array.isArray(node)){for(const item of node)visit(item);return}
    if(node&&typeof node==='object'){for(const item of Object.values(node))visit(item);return}
    if(typeof node!=='string')return;
    const raw=node.trim();
    if(!raw||/\s/.test(raw))return;
    let host=raw.replace(/^https?:\/\//i,'').split('/')[0].replace(/\.$/,'');
    if(!/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(host))return;
    found.push(host.toLowerCase());
  };
  visit(value);
  return [...new Set(found)];
};
const codebasePreferredProductionDomain = domains => {
  const list=[...new Set((domains||[]).filter(Boolean))];
  const custom=list.filter(domain=>!domain.endsWith('.up.railway.app'));
  return custom[0]||list[0]||'';
};
app.get('/v1/workspaces/:workspaceId/codebase/projects/:project/railway/preview', async (req, res, next) => {
  try {
    const workspace=getWorkspace(req,req.params.workspaceId);
    if(!workspace||workspace.workspaceKind!=='codebase')return res.status(404).json({error:'Codebase workspace not found'});
    const project=normalizeCodebaseProjectName(req.params.project);
    const cwd='/projects/'+project;
    const statusOutput=await runInCodebaseSession(workspace,cwd,'railway',['status','--json'],30_000);
    let status={};try{status=JSON.parse(statusOutput)}catch{status={raw:statusOutput}}
    let domainData=null;let domainError='';
    try{
      const domainOutput=await runInCodebaseSession(workspace,cwd,'railway',['domain','list','--json'],30_000);
      try{domainData=JSON.parse(domainOutput)}catch{domainData={raw:domainOutput}}
    }catch(error){domainError=String(error?.message||error||'').slice(-1200)}
    const domains=[...new Set([...codebasePreviewDomainCandidates(domainData),...codebasePreviewDomainCandidates(status)])];
    const domain=codebasePreferredProductionDomain(domains);
    res.set('Cache-Control','no-store');
    res.json({linked:true,status,domains,productionUrl:domain?'https://'+domain:'',domainError});
  } catch (error) {
    if(Number(error?.status)===422)return res.json({linked:false,status:null,domains:[],productionUrl:'',message:error.message});
    next(error);
  }
});
`;

source=source.replace(anchor,patch+anchor);
for(const required of [marker,"app.get('/v1/workspaces/:workspaceId/codebase/projects/:project/railway/preview'","'domain', 'list', '--json'",'productionUrl:domain']){
  if(!source.includes(required))throw new Error(`Codebase preview control verification missing: ${required}`);
}
fs.writeFileSync(target,source);
console.log('Installed Codebase Local/Railway Production preview control route.');
