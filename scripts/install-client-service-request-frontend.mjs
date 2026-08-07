import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist-web');

const adminPath=path.join(dist,'admin.html');
try{
  let html=await readFile(adminPath,'utf8');
  html=html.replace(/\s*<script src="\/assets\/admin-client-service-requests\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
  if(!html.includes('</body>'))throw new Error('Unable to install Client Service Requests Admin asset');
  html=html.replace('</body>','  <script src="/assets/admin-client-service-requests.js?v=20260807-intake-1"></script>\n</body>');
  await writeFile(adminPath,html,'utf8');
}catch(error){if(error?.code!=='ENOENT')throw error;}

const indexPath=path.join(dist,'index.html');
try{
  let html=await readFile(indexPath,'utf8');
  html=html.replace(/\s*<script src="\/assets\/public-consultation-service-request-bridge\.js(?:\?v=[^"']+)?"><\/script>\s*/g,'\n');
  if(!html.includes('</body>'))throw new Error('Unable to connect homepage consultation form to Client Service Requests');
  html=html.replace('</body>','  <script src="/assets/public-consultation-service-request-bridge.js?v=20260807-intake-1"></script>\n</body>');
  await writeFile(indexPath,html,'utf8');
}catch(error){if(error?.code!=='ENOENT')throw error;}

const servicesPath=path.join(dist,'services.html');
try{
  let html=await readFile(servicesPath,'utf8');
  html=html
    .replace(/<a href="#" class="btn-cta">Free Consultation<\/a>/g,'<a href="/service-request.html" class="btn-cta">Free Consultation</a>')
    .replace(/<li><a href="#">Careers<\/a><\/li>/g,'<li><a href="/careers.html">Careers</a></li>')
    .replace(/<li><a href="#">Contact<\/a><\/li>/g,'<li><a href="/service-request.html">Contact</a></li>');
  await writeFile(servicesPath,html,'utf8');
}catch(error){if(error?.code!=='ENOENT')throw error;}

const source=path.join(dist,'service-request.html');
try{
  await stat(source);
  const clean=path.join(dist,'service-request');await mkdir(clean,{recursive:true});
  await writeFile(path.join(clean,'index.html'),await readFile(source,'utf8'),'utf8');
}catch(error){if(error?.code!=='ENOENT')throw error;}

console.log('Client Service Requests published: homepage consultations, public intake form, Admin review workspace, and clean service-request route are connected.');
