import { scanBufferForMalware } from './secure-object-storage.js';

type EphemeralAttachment={fileName:string;mimeType:string;fileDataBase64:string};
type ModelPart=Record<string,unknown>;

const blockedExtensions=new Set(['exe','dll','msi','com','scr','bat','cmd','ps1','vbs','apk','dmg','pkg','deb','rpm','iso']);
const modelFileExtensions=new Set(['pdf','txt','csv','tsv','md','markdown','json','xml','yaml','yml','rtf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','js','mjs','cjs','ts','tsx','jsx','css','html','htm','py','java','go','rs','rb','php','sh','sql']);
const imageMimes=new Set(['image/png','image/jpeg','image/webp','image/gif']);
const maxEachBytes=()=>Math.min(20*1024*1024,Math.max(1024*1024,Number(process.env.IT_AGENT_EPHEMERAL_ATTACHMENT_MAX_BYTES||15*1024*1024)));
const maxCombinedBytes=()=>Math.min(35*1024*1024,Math.max(2*1024*1024,Number(process.env.IT_AGENT_EPHEMERAL_ATTACHMENTS_COMBINED_MAX_BYTES||28*1024*1024)));
const requireScan=()=>String(process.env.IT_AGENT_REQUIRE_MALWARE_SCAN||'').trim().toLowerCase()==='true';
const httpError=(status:number,message:string)=>Object.assign(new Error(message),{status});
const clean=(value:unknown,max=220)=>String(value??'').trim().slice(0,max);
const extensionOf=(name:string)=>{const safe=clean(name,220);const index=safe.lastIndexOf('.');return index>=0?safe.slice(index+1).toLowerCase():''};
const normalizeMime=(value:string)=>clean(value,160).split(';')[0].trim().toLowerCase()||'application/octet-stream';

function decodeBase64(value:string){
  const raw=String(value||'').replace(/^data:[^;]+;base64,/i,'').replace(/\s+/g,'');
  if(!raw||!/^[A-Za-z0-9+/]*={0,2}$/.test(raw))throw httpError(400,'Temporary chat attachment data is not valid base64.');
  const body=Buffer.from(raw,'base64');
  if(!body.length)throw httpError(400,'Temporary chat attachment is empty.');
  return body;
}

function validateSignature(fileName:string,mimeType:string,body:Buffer){
  const ext=extensionOf(fileName);
  if(!ext||blockedExtensions.has(ext)||(!modelFileExtensions.has(ext)&&!imageMimes.has(mimeType)))throw httpError(415,`File type .${ext||'unknown'} is not supported as a temporary IT Agent attachment.`);
  if(body.length>maxEachBytes())throw httpError(413,`Temporary attachment ${fileName} exceeds the ${Math.floor(maxEachBytes()/1024/1024)} MB per-file limit.`);
  const starts=(bytes:number[])=>bytes.every((byte,index)=>body[index]===byte);
  if(ext==='pdf'&&!body.subarray(0,5).equals(Buffer.from('%PDF-')))throw httpError(415,'The supplied PDF does not have a valid PDF signature.');
  if(ext==='png'&&!starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))throw httpError(415,'The supplied PNG does not have a valid PNG signature.');
  if(['jpg','jpeg'].includes(ext)&&!starts([0xff,0xd8,0xff]))throw httpError(415,'The supplied JPEG does not have a valid JPEG signature.');
  if(ext==='gif'&&!['GIF87a','GIF89a'].includes(body.subarray(0,6).toString('ascii')))throw httpError(415,'The supplied GIF does not have a valid GIF signature.');
  if(ext==='webp'&&!(body.subarray(0,4).toString('ascii')==='RIFF'&&body.subarray(8,12).toString('ascii')==='WEBP'))throw httpError(415,'The supplied WebP does not have a valid WebP signature.');
  if(['docx','xlsx','pptx','odt','ods','odp'].includes(ext)&&!starts([0x50,0x4b]))throw httpError(415,'The supplied Office file does not have a valid ZIP container signature.');
  if(['txt','csv','tsv','md','markdown','json','xml','yaml','yml','sql','js','mjs','cjs','ts','tsx','jsx','css','html','htm','py','java','go','rs','rb','php','sh'].includes(ext)&&body.includes(0))throw httpError(415,'Temporary text/code attachments cannot contain binary NUL bytes.');
}

export async function buildITAgentEphemeralAttachmentContent(input:{attachments?:EphemeralAttachment[]}){
  const attachments=Array.isArray(input.attachments)?input.attachments.slice(0,8):[];
  if(!attachments.length)return[] as ModelPart[];
  let combined=0;
  const parts:ModelPart[]=[];
  for(const attachment of attachments){
    const fileName=clean(attachment.fileName,220).replace(/[\\/]+/g,'-')||'attachment.bin';
    const mimeType=normalizeMime(attachment.mimeType);
    const body=decodeBase64(attachment.fileDataBase64);
    validateSignature(fileName,mimeType,body);
    combined+=body.length;
    if(combined>maxCombinedBytes())throw httpError(413,`Temporary chat attachments exceed the ${Math.floor(maxCombinedBytes()/1024/1024)} MB combined limit.`);
    const scan=await scanBufferForMalware(body);
    if(scan.status==='INFECTED')throw httpError(422,`Temporary attachment ${fileName} was blocked by malware scanning${scan.signature?`: ${scan.signature}`:''}.`);
    if(scan.status==='UNAVAILABLE'&&requireScan())throw httpError(503,'Malware scanning is required for temporary IT Agent attachments but is currently unavailable.');
    const ext=extensionOf(fileName);
    if(imageMimes.has(mimeType))parts.push({type:'input_image',image_url:`data:${mimeType};base64,${body.toString('base64')}`,detail:'auto'});
    else if(modelFileExtensions.has(ext))parts.push({type:'input_file',filename:fileName,file_data:body.toString('base64')});
    else throw httpError(415,`Temporary attachment ${fileName} cannot be supplied to the model.`);
  }
  return parts;
}
