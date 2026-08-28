import type { PrismaClient } from '@prisma/client';

type Json=Record<string,unknown>;
type TreeItem={path:string;mode?:string;type?:string;sha?:string;size?:number};
type KnowledgeSnapshot={kind:string;repository:string;baseBranch:string;headSha:string;payload:unknown;refreshedAt:Date|string};

const clean=(value:unknown,max=12000)=>String(value??'').trim().slice(0,max);
const boolEnv=(name:string)=>String(process.env[name]||'').trim().toLowerCase()==='true';
const repoName=()=>clean(process.env.SULANDRA_GITHUB_REPOSITORY||'sngwabil/sulandra-website',200);
const baseBranch=()=>clean(process.env.IT_AGENT_GITHUB_BASE_BRANCH||'release/sulandra-1.0',200);
const githubToken=()=>process.env.SULANDRA_GITHUB_TOKEN?.trim()||'';
const primaryApi=()=>clean(process.env.IT_SPECIALIST_PRIMARY_API_URL||'https://sulandra-website-production-5fc4.up.railway.app',500).replace(/\/$/,'');
const secondaryApi=()=>clean(process.env.IT_SPECIALIST_SECONDARY_API_URL||'https://sulandra-website-production.up.railway.app',500).replace(/\/$/,'');
const staticSite=()=>clean(process.env.IT_SPECIALIST_STATIC_URL||'https://www.sulandrahealth.com',500).replace(/\/$/,'');
const httpError=(status:number,message:string)=>Object.assign(new Error(message),{status});
const safeError=(error:unknown)=>clean(error instanceof Error?error.message:error,1200).replace(/ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+/g,'[REDACTED]');

const splitRepo=()=>{const [owner,repo]=repoName().split('/');if(!owner||!repo||repoName().split('/').length!==2)throw httpError(500,'SULANDRA_GITHUB_REPOSITORY must be owner/repo');return{owner,repo}};
const refPath=(branch:string)=>branch.split('/').map(encodeURIComponent).join('/');

export async function itSpecialistGithub(path:string,init:RequestInit={}){
  const token=githubToken();if(!token)throw httpError(503,'GitHub IT Specialist credential is not configured');
  const {owner,repo}=splitRepo();
  const response=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`,{
    ...init,
    headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Sulandra-IT-Specialist',...(init.headers||{})},
    signal:AbortSignal.timeout(60000),
  });
  const text=await response.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={message:text.slice(0,500)}}
  if(!response.ok)throw httpError(response.status,`GitHub IT Specialist request failed (${response.status}): ${clean(data?.message||'Unknown GitHub error',500)}`);
  return data;
}

async function ensureKnowledgeSchema(prisma:PrismaClient){
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ITKnowledgeSnapshot" ("kind" TEXT PRIMARY KEY,"repository" TEXT NOT NULL,"baseBranch" TEXT NOT NULL,"headSha" TEXT NOT NULL,"payload" JSONB NOT NULL DEFAULT '{}'::jsonb,"refreshedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}

const areaFor=(path:string)=>{
  const p=path.toLowerCase();
  if(p.startsWith('.github/'))return'CI_GOVERNANCE';
  if(p.startsWith('prisma/'))return'DATABASE';
  if(p.startsWith('api/src/spire')||p.startsWith('spire/')||p.includes('/spire-'))return'SPIRE';
  if(p.includes('employee')||p.includes('workforce')||p.includes('time-attendance')||p.includes('scheduling'))return'WORKFORCE';
  if(p.includes('career')||p.includes('applicant')||p.includes('interview')||p.includes('offer'))return'RECRUITING';
  if(p.includes('it-solutions')||p.includes('sia')||p.includes('support'))return'IT_SUPPORT';
  if(p.includes('home-health')||p.includes('oasis')||p.includes('iqies'))return'HOME_HEALTH';
  if(p.includes('nmt'))return'NMT';
  if(p.includes('billing')||p.includes('medicaid')||p.includes('prebill'))return'REVENUE';
  if(p.includes('intranet')||p.includes('communication')||p.includes('notification'))return'COMMUNICATIONS';
  if(p.startsWith('scripts/'))return'BUILD_TOOLING';
  if(p.startsWith('assets/')||p.endsWith('.html')||p.endsWith('.css'))return'FRONTEND';
  if(p.startsWith('api/'))return'BACKEND';
  return'PLATFORM';
};

const tokens=(value:string)=>[...new Set(clean(value,6000).toLowerCase().split(/[^a-z0-9]+/).filter(token=>token.length>=3))].slice(0,100);
const parsePayload=<T>(value:unknown,fallback:T):T=>{if(value&&typeof value==='object')return value as T;if(typeof value==='string'){try{return JSON.parse(value) as T}catch{return fallback}}return fallback};

export async function syncITSpecialistKnowledge(prisma:PrismaClient,force=false){
  await ensureKnowledgeSchema(prisma);
  const existing=await prisma.$queryRawUnsafe<KnowledgeSnapshot[]>(`SELECT * FROM "ITKnowledgeSnapshot" WHERE "kind"='REPOSITORY_MAP' LIMIT 1`);
  const refreshed=existing[0]?.refreshedAt?new Date(existing[0].refreshedAt).getTime():0;
  if(!force&&Date.now()-refreshed<6*60*60*1000){
    const approved=await prisma.$queryRawUnsafe<KnowledgeSnapshot[]>(`SELECT * FROM "ITKnowledgeSnapshot" WHERE "kind"='APPROVED_WORK' LIMIT 1`);
    const map=parsePayload<any>(existing[0]?.payload,{files:[]}),work=parsePayload<any>(approved[0]?.payload,{items:[]});
    return{headSha:existing[0]?.headSha||'',fileCount:Array.isArray(map.files)?map.files.length:0,approvedWorkCount:Array.isArray(work.items)?work.items.length:0,refreshedAt:existing[0]?.refreshedAt||null,cached:true};
  }

  const commit=await itSpecialistGithub(`/commits/${encodeURIComponent(baseBranch())}`);const headSha=String(commit.sha||''),treeSha=String(commit.commit?.tree?.sha||'');
  if(!headSha||!treeSha)throw httpError(502,'GitHub base commit metadata is incomplete');
  const tree=await itSpecialistGithub(`/git/trees/${encodeURIComponent(treeSha)}?recursive=1`);if(tree.truncated)throw httpError(409,'Repository tree is truncated; IT Specialist will not use an incomplete system map');
  const files=(tree.tree||[] as TreeItem[]).filter((item:TreeItem)=>item.type==='blob').map((item:TreeItem)=>({path:item.path,sha:item.sha||'',size:item.size||0,area:areaFor(item.path)}));
  const areas:Record<string,number>={};for(const file of files)areas[file.area]=(areas[file.area]||0)+1;
  const services=[
    {name:'Sulandra Static Website',role:'FRONTEND',url:staticSite(),expectedBranch:baseBranch(),verification:'/deployment-meta.json'},
    {name:'sulandra-website',role:'PRIMARY_API',url:primaryApi(),expectedBranch:baseBranch(),verification:'/health'},
    {name:'magnificent-education backend',role:'SECONDARY_API',url:secondaryApi(),expectedBranch:baseBranch(),verification:'/health'},
  ];
  await prisma.$executeRawUnsafe(`INSERT INTO "ITKnowledgeSnapshot" ("kind","repository","baseBranch","headSha","payload","refreshedAt") VALUES ('REPOSITORY_MAP',$1,$2,$3,$4::jsonb,NOW()) ON CONFLICT ("kind") DO UPDATE SET "repository"=EXCLUDED."repository","baseBranch"=EXCLUDED."baseBranch","headSha"=EXCLUDED."headSha","payload"=EXCLUDED."payload","refreshedAt"=NOW()`,repoName(),baseBranch(),headSha,JSON.stringify({files,areas,services}));

  const mergedPrs:any[]=[];
  for(let page=1;page<=25;page++){
    const rows=await itSpecialistGithub(`/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`) as any[];
    for(const pr of rows)if(pr.merged_at)mergedPrs.push({kind:'MERGED_PR',number:Number(pr.number),title:clean(pr.title,500),body:clean(pr.body,6000),mergedAt:pr.merged_at,mergeCommitSha:clean(pr.merge_commit_sha,80),base:clean(pr.base?.ref,200),head:clean(pr.head?.ref,200),url:clean(pr.html_url,500)});
    if(rows.length<100)break;
  }
  const releaseCommits:any[]=[];
  for(let page=1;page<=20;page++){
    const rows=await itSpecialistGithub(`/commits?sha=${encodeURIComponent(baseBranch())}&per_page=100&page=${page}`) as any[];
    for(const row of rows)releaseCommits.push({kind:'RELEASE_COMMIT',sha:clean(row.sha,80),message:clean(row.commit?.message,4000),date:row.commit?.committer?.date||row.commit?.author?.date||null,url:clean(row.html_url,500)});
    if(rows.length<100)break;
  }
  const items=[...mergedPrs,...releaseCommits];
  await prisma.$executeRawUnsafe(`INSERT INTO "ITKnowledgeSnapshot" ("kind","repository","baseBranch","headSha","payload","refreshedAt") VALUES ('APPROVED_WORK',$1,$2,$3,$4::jsonb,NOW()) ON CONFLICT ("kind") DO UPDATE SET "repository"=EXCLUDED."repository","baseBranch"=EXCLUDED."baseBranch","headSha"=EXCLUDED."headSha","payload"=EXCLUDED."payload","refreshedAt"=NOW()`,repoName(),baseBranch(),headSha,JSON.stringify({items}));
  return{headSha,fileCount:files.length,approvedWorkCount:items.length,refreshedAt:new Date().toISOString(),cached:false};
}

export async function getITSpecialistKnowledgeContext(prisma:PrismaClient,query:string){
  await syncITSpecialistKnowledge(prisma,false);
  const rows=await prisma.$queryRawUnsafe<KnowledgeSnapshot[]>(`SELECT * FROM "ITKnowledgeSnapshot" WHERE "kind" IN ('REPOSITORY_MAP','APPROVED_WORK')`);
  const mapRow=rows.find(row=>row.kind==='REPOSITORY_MAP'),workRow=rows.find(row=>row.kind==='APPROVED_WORK');
  const map=parsePayload<any>(mapRow?.payload,{files:[],areas:{},services:[]}),work=parsePayload<any>(workRow?.payload,{items:[]});
  const terms=tokens(query);
  const fileMatches=(Array.isArray(map.files)?map.files:[]).map((file:any)=>{const hay=`${file.path} ${file.area}`.toLowerCase();let score=0;for(const term of terms)if(hay.includes(term))score+=8;if(['IT_SUPPORT','FRONTEND','BACKEND','BUILD_TOOLING','CI_GOVERNANCE'].includes(file.area))score+=1;return{...file,score}}).sort((a:any,b:any)=>b.score-a.score||String(a.path).localeCompare(String(b.path))).slice(0,140);
  const workMatches=(Array.isArray(work.items)?work.items:[]).map((item:any)=>{const hay=`${item.title||''} ${item.body||''} ${item.message||''} ${item.base||''} ${item.head||''}`.toLowerCase();let score=0;for(const term of terms)if(hay.includes(term))score+=8;if(item.kind==='MERGED_PR')score+=1;return{...item,score}}).filter((item:any)=>item.score>0).sort((a:any,b:any)=>b.score-a.score).slice(0,40);
  return{repository:repoName(),baseBranch:baseBranch(),headSha:mapRow?.headSha||'',areas:map.areas||{},services:map.services||[],fileMatches,approvedWorkMatches:workMatches,approvedEvidenceCount:workMatches.length,refreshedAt:mapRow?.refreshedAt||null};
}

const terminalFailure=new Set(['failure','cancelled','timed_out','action_required','stale']);
export async function getITSpecialistGateState(headSha:string){
  const data=await itSpecialistGithub(`/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`);const runs=Array.isArray(data.workflow_runs)?data.workflow_runs:[];
  const latest=new Map<string,any>();for(const run of runs){const name=clean(run.name,200);const prior=latest.get(name);if(!prior||new Date(run.created_at||0).getTime()>new Date(prior.created_at||0).getTime())latest.set(name,run)}
  const required=['CI','Disaster Recovery Verification','Production Role UAT'];
  const evidence=[...latest.values()].map(run=>({name:run.name,status:run.status,conclusion:run.conclusion,url:run.html_url,id:run.id}));
  for(const name of required){const run=latest.get(name);if(!run)return{state:'PENDING' as const,reason:`Waiting for ${name} to start`,evidence};if(run.status!=='completed')return{state:'PENDING' as const,reason:`${name} is ${run.status}`,evidence};if(run.conclusion!=='success')return{state:'FAILED' as const,reason:`${name} concluded ${run.conclusion}`,evidence}}
  for(const optional of ['Section 8 OASIS-E2 Verification','Section 9 IT Solutions Verification']){const run=latest.get(optional);if(run&&run.status==='completed'&&run.conclusion&&run.conclusion!=='success'&&terminalFailure.has(String(run.conclusion)))return{state:'FAILED' as const,reason:`${optional} concluded ${run.conclusion}`,evidence};if(run&&run.status!=='completed')return{state:'PENDING' as const,reason:`${optional} is ${run.status}`,evidence}}
  return{state:'GREEN' as const,reason:'Required CI, DR, Role UAT, and triggered section gates are green',evidence};
}

export async function mergeITSpecialistPullRequest(prNumber:number,headSha:string,ticketNumber:string){
  const result=await itSpecialistGithub(`/pulls/${prNumber}/merge`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha:headSha,merge_method:'merge',commit_title:`IT Specialist repair ${ticketNumber}`,commit_message:`Autonomous established-operation repair for ${ticketNumber}. Required GitHub gates passed before merge.`})});
  if(!result.merged||!result.sha)throw httpError(409,clean(result.message||'GitHub did not merge the IT Specialist PR',700));
  return{mergeSha:String(result.sha),message:clean(result.message,700)};
}

async function fetchJson(url:string){
  try{const response=await fetch(url,{headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});const text=await response.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={raw:text.slice(0,300)}}return{ok:response.ok,status:response.status,data}}catch(error){return{ok:false,status:0,data:{error:safeError(error)}}}
}

export async function verifyITSpecialistProductionCommit(expectedSha:string){
  const [primary,secondary,frontend]=await Promise.all([
    fetchJson(`${primaryApi()}/health`),
    fetchJson(`${secondaryApi()}/health`),
    fetchJson(`${staticSite()}/deployment-meta.json?ts=${Date.now()}`),
  ]);
  const summarize=(name:string,result:any)=>({name,httpOk:result.ok,status:result.status,branch:clean(result.data?.deployment?.branch||result.data?.branch,200),commit:clean(result.data?.deployment?.commit||result.data?.commit,80),service:clean(result.data?.service,200)});
  const services=[summarize('primary-api',primary),summarize('secondary-api',secondary),summarize('static-website',frontend)];
  const allHealthy=services.every(item=>item.httpOk);
  const exactCommit=services.every(item=>item.commit===expectedSha&&item.branch===baseBranch());
  return{state:allHealthy&&exactCommit?'GREEN' as const:'PENDING' as const,expectedSha,expectedBranch:baseBranch(),services,allHealthy,exactCommit};
}

export function itSpecialistKnowledgeStatus(){return{enabled:boolEnv('IT_SPECIALIST_ENABLED'),autoProductionEnabled:boolEnv('IT_SPECIALIST_AUTO_PRODUCTION_ENABLED'),repository:repoName(),baseBranch:baseBranch(),primaryApi:primaryApi(),secondaryApi:secondaryApi(),staticSite:staticSite(),githubCredentialPresent:Boolean(githubToken())}}
