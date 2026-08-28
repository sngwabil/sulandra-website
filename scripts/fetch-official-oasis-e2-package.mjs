import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PAGE_URL='https://www.cms.gov/medicare/quality/home-health/data-specifications';
const EXPECTED_LABEL='OASIS E2 Data Specs (V3.02.0) FINAL';
const EXPECTED_SHA256='b848a1f33efb77406124f02bfd50dbb48c6efb841c4e4bf3c68719c1e8d9f6ca';
const outputDirectory=path.resolve(process.argv[2]||'artifacts/oasis-e2-official');

function textOfAnchor(value){
  return value
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&#0*39;|&apos;/gi,"'")
    .replace(/&quot;/gi,'"')
    .replace(/\s+/g,' ')
    .trim();
}

function decodeHref(value){
  return value.replace(/&amp;/gi,'&').replace(/&#0*38;/gi,'&').trim();
}

const headers={
  'user-agent':'Sulandra-SPIRE-OASIS-Spec-Verifier/1.0 (+https://www.sulandrahealth.com)',
  'accept':'text/html,application/xhtml+xml,application/zip,*/*;q=0.8',
};

await mkdir(outputDirectory,{recursive:true});
const pageResponse=await fetch(PAGE_URL,{headers,redirect:'follow'});
if(!pageResponse.ok)throw new Error(`CMS data-specifications page returned HTTP ${pageResponse.status}`);
const html=await pageResponse.text();
const anchors=[];
for(const match of html.matchAll(/<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi)){
  anchors.push({href:decodeHref(match[1]||match[2]||''),label:textOfAnchor(match[3]||'')});
}
let target=anchors.find((anchor)=>anchor.label.toLowerCase().includes(EXPECTED_LABEL.toLowerCase()));
if(!target)target=anchors.find((anchor)=>/oasis/i.test(anchor.href)&&/(3[._-]?02|3020)/i.test(anchor.href)&&/zip/i.test(anchor.href));
if(!target)throw new Error(`Could not locate the ${EXPECTED_LABEL} download on the current CMS page`);
const packageUrl=new URL(target.href,PAGE_URL).href;
if(new URL(packageUrl).hostname!=='www.cms.gov')throw new Error(`Resolved OASIS package is not hosted on www.cms.gov: ${packageUrl}`);

const packageResponse=await fetch(packageUrl,{headers,redirect:'follow'});
if(!packageResponse.ok)throw new Error(`CMS OASIS-E2 package returned HTTP ${packageResponse.status}`);
const finalUrl=packageResponse.url;
if(new URL(finalUrl).hostname!=='www.cms.gov')throw new Error(`CMS package redirected off www.cms.gov: ${finalUrl}`);
const bytes=Buffer.from(await packageResponse.arrayBuffer());
if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error(`Downloaded CMS resource is not a ZIP archive; content-type=${packageResponse.headers.get('content-type')||'unknown'}`);
const sha256=createHash('sha256').update(bytes).digest('hex');
if(sha256!==EXPECTED_SHA256)throw new Error(`CMS OASIS-E2 package fingerprint changed. Expected ${EXPECTED_SHA256}; received ${sha256}. Review the new CMS publication before changing the pinned fingerprint.`);
const packagePath=path.join(outputDirectory,'oasis-e2-data-specs-v3.02.0-final.zip');
await writeFile(packagePath,bytes);
const metadata={
  authority:'Centers for Medicare & Medicaid Services (CMS)',landingPage:PAGE_URL,expectedLabel:EXPECTED_LABEL,resolvedLabel:target.label,
  sourceUrl:packageUrl,finalUrl,fetchedAt:new Date().toISOString(),contentType:packageResponse.headers.get('content-type')||null,
  contentLength:bytes.length,sha256,verifiedAgainstPinnedSha256:true,
};
await writeFile(path.join(outputDirectory,'package-metadata.json'),JSON.stringify(metadata,null,2)+'\n','utf8');
console.log(JSON.stringify(metadata,null,2));
console.log(`CMS OASIS-E2 package saved to ${packagePath}`);
