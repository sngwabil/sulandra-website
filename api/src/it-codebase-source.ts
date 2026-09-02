type GitTreeItem={path:string;mode?:string;type:string;sha:string;size?:number};

type GitCommit={sha?:string;commit?:{tree?:{sha?:string}}};
type GitContent={type?:string;sha?:string;size?:number;encoding?:string;content?:string};

const REPOSITORY='sngwabil/sulandra-website';
const BRANCH='release/sulandra-1.0';
export const CODEBASE_MAX_FILE_BYTES=512*1024;
const MAX_TREE_ENTRIES=5000;
const BINARY_EXT=new Set(['png','jpg','jpeg','gif','webp','ico','bmp','pdf','zip','gz','tgz','7z','rar','woff','woff2','ttf','otf','eot','mp3','wav','ogg','mp4','mov','avi','webm','exe','dll','so','dylib','class','jar','pyc','sqlite','db']);
const DENY_SEGMENTS=new Set(['.git','node_modules','.idea','.vscode-history','.terraform','.aws','.ssh']);
const DENY_EXACT=new Set(['.npmrc','.pypirc','.netrc','id_rsa','id_ed25519','credentials','credentials.json','secrets.json','service-account.json','service_account.json']);
const DENY_SUFFIX=['.pem','.key','.p12','.pfx','.jks','.keystore','.der','.crt.secret'];
const httpError=(status:number,message:string)=>Object.assign(new Error(message),{status});

export function normalizeCodebasePath(value:unknown){
  const raw=String(value??'').trim();
  if(!raw||raw.includes('\0')||raw.startsWith('/')||raw.startsWith('\\')||/^[A-Za-z]:[\\/]/.test(raw)||raw.includes('\\'))return null;
  const parts=raw.replace(/^\.\//,'').split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'))return null;
  return parts.join('/');
}

export function isCodebasePathBlocked(value:unknown){
  const path=normalizeCodebasePath(value);if(!path)return true;
  const parts=path.toLowerCase().split('/'),name=parts.at(-1)||'';
  if(parts.some(part=>DENY_SEGMENTS.has(part)))return true;
  if(parts.some(part=>part==='.env'||part.startsWith('.env.')))return true;
  if(DENY_EXACT.has(name))return true;
  if(DENY_SUFFIX.some(suffix=>name.endsWith(suffix)))return true;
  if(name.includes('credential')||name.includes('secret-key')||name.includes('private-key'))return true;
  return false;
}

export function isCodebaseBinaryPath(value:unknown){
  const path=normalizeCodebasePath(value);if(!path)return true;
  const name=path.split('/').at(-1)||'';const index=name.lastIndexOf('.');
  return index>0&&BINARY_EXT.has(name.slice(index+1).toLowerCase());
}

export function assertCodebaseReadablePath(value:unknown){
  const path=normalizeCodebasePath(value);
  if(!path)throw httpError(400,'Codebase path is invalid.');
  if(isCodebasePathBlocked(path))throw httpError(403,'Codebase source policy blocks this path.');
  if(isCodebaseBinaryPath(path))throw httpError(415,'Binary files are not displayed in Codebase.');
  return path;
}

function splitRepo(){const [owner,repo]=REPOSITORY.split('/');return{owner,repo}}
function encodePath(path:string){return path.split('/').map(encodeURIComponent).join('/')}
async function gh(path:string){
  const {owner,repo}=splitRepo();const token=process.env.SULANDRA_GITHUB_TOKEN?.trim();
  const headers:Record<string,string>={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Sulandra-Codebase-Source'};
  if(token)headers.Authorization=`Bearer ${token}`;
  const response=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`,{headers,signal:AbortSignal.timeout(20000)});
  const text=await response.text();let data:any={};try{data=text?JSON.parse(text):{}}catch{data={message:'Malformed GitHub response'}}
  if(!response.ok)throw httpError(response.status===404?404:502,`Codebase repository request failed (${response.status}).`);
  return data;
}

export async function readCodebaseTree(){
  const commit=await gh(`/commits/${encodeURIComponent(BRANCH)}`) as GitCommit;
  const commitSha=String(commit.sha||''),treeSha=String(commit.commit?.tree?.sha||'');
  if(!commitSha||!treeSha)throw httpError(502,'Codebase branch metadata is incomplete.');
  const tree=await gh(`/git/trees/${encodeURIComponent(treeSha)}?recursive=1`);
  if(tree?.truncated)throw httpError(409,'Repository tree is too large for a complete safe Codebase snapshot.');
  const entries=((Array.isArray(tree?.tree)?tree.tree:[]) as GitTreeItem[])
    .filter(item=>item?.path&&(item.type==='tree'||item.type==='blob')&&!isCodebasePathBlocked(item.path)&&!isCodebaseBinaryPath(item.path))
    .slice(0,MAX_TREE_ENTRIES)
    .map(item=>({path:item.path,type:item.type,sha:item.sha,size:Number(item.size)||0}));
  return{repository:REPOSITORY,branch:BRANCH,commitSha,treeSha,entries};
}

export async function readCodebaseFile(value:unknown){
  const path=assertCodebaseReadablePath(value);
  const data=await gh(`/contents/${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`) as GitContent;
  if(data.type!=='file'||data.encoding!=='base64'||!data.content)throw httpError(409,'Codebase path is not a readable source file.');
  const declaredSize=Number(data.size)||0;if(declaredSize>CODEBASE_MAX_FILE_BYTES)throw httpError(413,`Codebase viewer limit is ${CODEBASE_MAX_FILE_BYTES} bytes.`);
  const bytes=Buffer.from(String(data.content).replace(/\s/g,''),'base64');
  if(bytes.length>CODEBASE_MAX_FILE_BYTES)throw httpError(413,`Codebase viewer limit is ${CODEBASE_MAX_FILE_BYTES} bytes.`);
  if(bytes.subarray(0,Math.min(bytes.length,8192)).includes(0))throw httpError(415,'Binary files are not displayed in Codebase.');
  return{repository:REPOSITORY,branch:BRANCH,path,sha:String(data.sha||''),size:bytes.length,content:bytes.toString('utf8')};
}
