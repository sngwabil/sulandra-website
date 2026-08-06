import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const targets=['verify-employee-analytics.mjs','verify-employee-documents.mjs'];
for(const name of targets){
  const file=path.join(root,'scripts',name);
  try{
    let text=await readFile(file,'utf8');
    if(!text.includes('registerEmployeeBulkDataRoutes')){
      text=text.replace(/registerEmployeeDocumentsESignRoutes/g,'registerEmployeeDocumentsESignRoutes|registerEmployeeBulkDataRoutes');
      text=text.replace(/documents, policies, and e-signature/g,'documents, policies, e-signatures, bulk import, export, and data quality');
      await writeFile(file,text,'utf8');
    }
  }catch(error){if(error?.code!=='ENOENT')throw error;}
}
console.log('Employee 360 prior-section validations recognize bulk data route registration.');
