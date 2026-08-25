import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(process.argv[2]||'artifacts/oasis-e2-official');
const output=path.resolve(process.argv[3]||path.join(root,'oasis-e2-v3.02.0.normalized.json'));
const csvDir=path.join(root,'csv');
const htmlDir=path.join(root,'html');
const packageMetadataPath=path.join(root,'package-metadata.json');
const decoder=new TextDecoder('windows-1252');
const EXPECTED_PACKAGE_SHA256='b848a1f33efb77406124f02bfd50dbb48c6efb841c4e4bf3c68719c1e8d9f6ca';

function parseCsv(text){
  const rows=[];let row=[];let field='';let quoted=false;
  for(let i=0;i<text.length;i+=1){
    const c=text[i];
    if(quoted){
      if(c==='"'){
        if(text[i+1]==='"'){field+='"';i+=1;}else quoted=false;
      }else field+=c;
      continue;
    }
    if(c==='"'){quoted=true;continue;}
    if(c===','){row.push(field);field='';continue;}
    if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';continue;}
    field+=c;
  }
  if(field.length||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  const headers=rows.shift()||[];
  return rows.filter((entry)=>entry.some((value)=>value!=='')).map((entry)=>Object.fromEntries(headers.map((header,index)=>[header,entry[index]??''])));
}

async function readCsv(name){return parseCsv(decoder.decode(await readFile(path.join(csvDir,name))));}
const sha256=(bytes)=>createHash('sha256').update(bytes).digest('hex');
async function fileSha(file){return sha256(await readFile(file));}
const list=(value)=>String(value||'').split(',').map((entry)=>entry.trim()).filter(Boolean);
const htmlText=(value)=>String(value||'').replace(/<BR\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#0*39;|&apos;/gi,"'").replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
function property(html,label){
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=html.match(new RegExp(`<B><FONT SIZE=2>${escaped}</B></FONT>[\\s\\S]*?<TD[^>]*>[\\s\\S]*?<FONT SIZE=2>([\\s\\S]*?)</FONT>`,'i'));
  return match?htmlText(match[1]):'';
}
function editItemCodes(html){
  const result=[];
  for(const match of html.matchAll(/<A\s+HREF="?oi_([^" >]+?)\.html"?[^>]*>([\s\S]*?)<\/A>/gi)){
    const code=htmlText(match[2]).trim().toUpperCase();
    if(code&&/^[A-Z0-9_]+$/.test(code))result.push(code);
  }
  return [...new Set(result)];
}

const [items,values,iscs,iscValues,packageMetadata]=await Promise.all([
  readCsv('itm_mstr.csv'),readCsv('itm_val.csv'),readCsv('isc_mstr.csv'),readCsv('isc_val.csv'),JSON.parse(await readFile(packageMetadataPath,'utf8')),
]);
if(String(packageMetadata.sha256||'').toLowerCase()!==EXPECTED_PACKAGE_SHA256)throw new Error(`CMS OASIS-E2 package fingerprint mismatch: expected ${EXPECTED_PACKAGE_SHA256}, received ${packageMetadata.sha256||'(missing)'}`);

const valuesByItem=new Map();
for(const value of values){const bucket=valuesByItem.get(value.itm_id)||[];bucket.push(value);valuesByItem.set(value.itm_id,bucket);}
const submitRows=items.filter((item)=>item.itm_grp_cd==='Control'||item.itm_grp_cd==='Asmt').sort((a,b)=>Number(a.itm_srt_id)-Number(b.itm_srt_id));
const submitCodes=new Set(submitRows.map((item)=>item.itm_id));
const valueSets={};
const itemDefinitions=submitRows.map((item)=>{
  const options=(valuesByItem.get(item.itm_id)||[]).sort((a,b)=>Number(a.val_srt_id)-Number(b.val_srt_id)).map((value)=>({value:value.val_id,text:value.val_txt,loinc:value.val_loinc_id||null}));
  const coded=item.itm_type_cd==='Code'||item.itm_type_cd==='Checklist';
  const valueSetName=coded?`CMS_${item.itm_id}`:null;
  if(valueSetName)valueSets[valueSetName]={values:options.map((entry)=>entry.value),options};
  return {
    code:item.itm_id,
    label:item.itm_shrt_label,
    group:item.itm_grp_cd==='Asmt'?'ASSESSMENT':'CONTROL',
    type:item.itm_type_cd.toUpperCase(),
    maxLength:Number(item.fixed_rec_lngth),
    ...(valueSetName?{valueSet:valueSetName}:{}),
    sourceValues:options,
    activeSubsets:list(item.isc_active),
    inactiveSubsets:list(item.isc_inactive),
    source:{itmMasterKey:item.itm_mstr_key,itemSortId:Number(item.itm_srt_id),fixedRecordStart:Number(item.fixed_rec_strt_byte||0),fixedRecordEnd:Number(item.fixed_rec_end_byte||0),versionNotes:item.itm_vrsn_notes||null},
  };
});

const summary=decoder.decode(await readFile(path.join(htmlDir,'oe_edit_summary.html')));
const editRows=[];
for(const match of summary.matchAll(/<A\s+HREF="oe_(\d+)\.html">(-\d+)<\/A>[\s\S]*?<FONT SIZE=2>([^<\r\n]+)[\s\S]*?<FONT SIZE=2>([^<\r\n]+)/gi))editRows.push({file:`oe_${match[1]}.html`,code:match[2].trim(),editType:match[3].trim(),severity:match[4].trim()});
if(editRows.length!==233)throw new Error(`Expected 233 official OASIS-E2 edits; parsed ${editRows.length}`);
const editRules=[];
for(const edit of editRows){
  const html=decoder.decode(await readFile(path.join(htmlDir,edit.file)));
  const message=property(html,'Edit Text');
  if(!message)throw new Error(`Official edit ${edit.code} has no parsed edit text`);
  editRules.push({
    code:edit.code,
    editType:edit.editType,
    severity:edit.severity.toLowerCase()==='warning'?'WARNING':edit.severity.toLowerCase()==='fatal'?'FATAL':'INFO',
    message,
    itemCodes:editItemCodes(html).filter((code)=>submitCodes.has(code)),
    requiresExternalState:true,
    evaluationMode:'CMS_OFFICIAL_TEXT_DEFERRED',
    versionNotes:property(html,'Version Notes')||null,
    sourceFile:edit.file,
  });
}

const submissionDefinition={
  format:'XML',encoding:'ASCII',zipRequired:true,maxZipBytes:5*1024*1024,
  xml:{rootElement:'ASSESSMENT',maxTagLength:30,maxValueLength:100,singleAssessmentPerXml:true},
  fields:itemDefinitions.map((item,index)=>({itemCode:item.code,tag:item.code,order:index,activeSubsets:item.activeSubsets,omitIfBlank:false})),
  assessmentSystemItem:'ASMT_SYS_CD',assessmentSystemValue:'OASIS',
  transactionModeItemCode:'TRANS_TYPE_CD',transactionModes:{NEW:'1',MODIFICATION:'2',INACTIVATION:'3'},
  itemSubsetCodeItem:'ITM_SBST_CD',itemSetVersionItem:'ITM_SET_VRSN_CD',specVersionItem:'SPEC_VRSN_CD',
  inactiveItemsMustBeOmitted:true,calculatedAndFillerItemsOmitted:true,
};
const nested=(name)=>path.join(root,'extracted',name);
const sourceManifest={
  packageMetadata,
  nestedPackages:{
    csv:{name:'OASIS E2 Data Specs CSV Files V3.02.0 FINAL 10-13-2025.zip',sha256:await fileSha(nested('OASIS E2 Data Specs CSV Files V3.02.0 FINAL 10-13-2025.zip'))},
    html:{name:'OASIS E2 Data Specs HTML Files V3.02.0 FINAL 10-13-2025.zip',sha256:await fileSha(nested('OASIS E2 Data Specs HTML Files V3.02.0 FINAL 10-13-2025.zip'))},
    dictionary:{name:'OASIS E2 Data Dictionary (V3.02.0) FINAL 10-13-2025.zip',sha256:await fileSha(nested('OASIS E2 Data Dictionary (V3.02.0) FINAL 10-13-2025.zip'))},
  },
  tables:{
    itmMaster:{name:'itm_mstr.csv',sha256:await fileSha(path.join(csvDir,'itm_mstr.csv')),rowCount:items.length},
    itmValues:{name:'itm_val.csv',sha256:await fileSha(path.join(csvDir,'itm_val.csv')),rowCount:values.length},
    iscMaster:{name:'isc_mstr.csv',sha256:await fileSha(path.join(csvDir,'isc_mstr.csv')),rowCount:iscs.length},
    iscValues:{name:'isc_val.csv',sha256:await fileSha(path.join(csvDir,'isc_val.csv')),rowCount:iscValues.length},
    editSummary:{name:'oe_edit_summary.html',sha256:await fileSha(path.join(htmlDir,'oe_edit_summary.html')),editCount:editRules.length},
  },
  normalization:{submittedItemGroups:['Control','Asmt'],excludedItemGroups:['Calc','Filler'],submittedItemCount:itemDefinitions.length,officialEditCount:editRules.length,allOfficialEditsPreserved:true,officialEditTextEvaluatorsDeferred:true},
};
const normalized={
  contractVersion:'spire-oasis-e2-contract/1',authority:'CMS',specName:'OASIS-E2',itemSetVersionCode:'E2-042026',submissionSpecVersion:'3.02',effectiveFrom:'2026-04-01',effectiveThrough:null,
  sourcePackage:{name:'OASIS E2 Data Specs (V3.02.0) FINAL',sha256:EXPECTED_PACKAGE_SHA256,sourceUrl:packageMetadata.finalUrl||packageMetadata.sourceUrl},
  sourceManifest,itemDefinitions,editRules,valueSets,submissionDefinition,
};
await writeFile(output,JSON.stringify(normalized,null,2)+'\n','utf8');
console.log(JSON.stringify({output,packageSha256:EXPECTED_PACKAGE_SHA256,items:itemDefinitions.length,edits:editRules.length,valueSets:Object.keys(valueSets).length,mappings:submissionDefinition.fields.length,xmlRoot:submissionDefinition.xml.rootElement,transactionModes:submissionDefinition.transactionModes},null,2));
