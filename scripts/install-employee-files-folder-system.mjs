import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'assets', 'admin-employee-documents.js');

let app = null;
try {
  app = await readFile(appPath, 'utf8');
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('Employee Files frontend installer skipped: frontend assets are not present in this backend build image.');
  } else {
    throw error;
  }
}

if (app && !app.includes('EMPLOYEE_FILES_FOLDER_VIEW_V2')) {
  const stateAnchor = 'let state=null;';
  const refreshAnchor = "async function refresh(){const root=document.getElementById('employee-documents-admin');if(root)root.innerHTML='<div class=\"adoc-empty\">Loading document center…</div>';state=await api('/api/admin/employee-documents/dashboard');render()}";
  const oldHeader = '<div class="adoc-head"><div><h2>Employee 360 Documents & E-Signatures</h2><p>Manage templates, assignments, signatures and completion history.</p></div><button id="adoc-refresh">Refresh</button></div>';

  if (!app.includes(stateAnchor)) throw new Error('Employee documents state anchor changed');
  if (!app.includes(refreshAnchor)) throw new Error('Employee documents refresh anchor changed');
  if (!app.includes(oldHeader)) throw new Error('Employee documents header anchor changed');

  app = app.replace(
    stateAnchor,
    "/* EMPLOYEE_FILES_FOLDER_VIEW_V2 */let state=null;let fileFolders={rootFolder:'Employee Files',folders:[]};",
  );
  app = app.replace(
    refreshAnchor,
    "async function refresh(){const root=document.getElementById('employee-documents-admin');if(root)root.innerHTML='<div class=\"adoc-empty\">Loading document center…</div>';const results=await Promise.all([api('/api/admin/employee-documents/dashboard'),api('/api/admin/employees')]);state=results[0];const employees=Array.isArray(results[1])?results[1]:[];fileFolders={rootFolder:'Employee Files',folders:employees.filter(e=>String(e.employmentStatus||'ACTIVE')!=='TERMINATED').map(e=>({...e,folderName:e.displayName||e.email||e.id,documentCount:Number(e.documentCount||0)}))};render()}",
  );

  const employeeFilesPanel = `<div class="adoc-head"><div><h2>Employee Files</h2><p>Automatic employee personnel folders, secure files, templates, assignments, signatures and completion history.</p></div><button id="adoc-refresh">Refresh</button></div><div class="adoc-card" style="margin-bottom:16px"><h3>📁 Employee Files</h3><div class="adoc-list">\${(fileFolders.folders||[]).length?(fileFolders.folders||[]).map(f=>\`<div class="adoc-row"><div class="adoc-row-head"><strong>📂 \${esc(f.folderName)}</strong><span>\${esc(f.documentCount||0)} files</span></div><p>\${esc(f.email||'')}</p></div>\`).join(''):'<div class="adoc-empty">Employee folders are created automatically from active employee records in this company.</div>'}</div></div>`;
  app = app.replace(oldHeader, employeeFilesPanel);
  await writeFile(appPath, app, 'utf8');
  console.log('Employee Files folder view installed using existing employee-scoped document storage.');
} else if (app) {
  console.log('Employee Files folder view already installed.');
}

// The enterprise owner may select any Sulandra company, but an owner employment
// in one department must never silently narrow enterprise recruiting to that one
// department. Install the API scope guard before the TypeScript build starts.
await import('./fix-owner-enterprise-onboarding-api.mjs');
