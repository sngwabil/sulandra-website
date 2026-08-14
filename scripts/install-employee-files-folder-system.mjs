import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const apiPath=path.join(root,'api','src','employee-management-routes.ts');
const appPath=path.join(root,'assets','admin-employee-documents.js');

let api=await readFile(apiPath,'utf8');
let app=await readFile(appPath,'utf8');

const readyAnchor='    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmployeeDocument_employee_idx" ON "EmployeeDocument"("organizationId","employeeId","status")`);';
if(!api.includes('EmployeeFileFolder')){
  if(!api.includes(readyAnchor)) throw new Error('Employee document readiness anchor changed');
  api=api.replace(readyAnchor,`${readyAnchor}\n    await prisma.$executeRawUnsafe(\`CREATE TABLE IF NOT EXISTS "EmployeeFileFolder" (\n      "id" TEXT PRIMARY KEY,\n      "organizationId" TEXT NOT NULL,\n      "legalEntityId" TEXT NOT NULL,\n      "employeeId" TEXT NOT NULL,\n      "folderName" TEXT NOT NULL,\n      "status" TEXT NOT NULL DEFAULT 'ACTIVE',\n      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n      UNIQUE("organizationId","legalEntityId","employeeId")\n    )\`);\n    await prisma.$executeRawUnsafe(\`CREATE INDEX IF NOT EXISTS "EmployeeFileFolder_org_idx" ON "EmployeeFileFolder"("organizationId","legalEntityId","status","folderName")\`);`);
}

const accountActionAnchor='  const mailTransport = () => {';
if(!api.includes('ensureEmployeeFolder = async')){
  if(!api.includes(accountActionAnchor)) throw new Error('Employee folder helper anchor changed');
  api=api.replace(accountActionAnchor,`  const ensureEmployeeFolder = async (auth: AuthContext, employeeId: string, preferredName?: string | null) => {\n    await ready();\n    const legalEntityId = selectedEntityId(auth);\n    const target = preferredName ? { displayName: preferredName } : await targetUser(auth, employeeId);\n    const folderName = String(target.displayName || employeeId).trim() || employeeId;\n    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; folderName: string }>>(\n      \`INSERT INTO "EmployeeFileFolder" ("id","organizationId","legalEntityId","employeeId","folderName")\n       VALUES ($1,$2,$3,$4,$5)\n       ON CONFLICT ("organizationId","legalEntityId","employeeId") DO UPDATE SET\n         "folderName"=EXCLUDED."folderName","status"='ACTIVE',"updatedAt"=NOW()\n       RETURNING "id","folderName"\`,\n      randomUUID(), auth.organizationId, legalEntityId, employeeId, folderName,\n    );\n    return rows[0];\n  };\n\n  ${accountActionAnchor}`);
}

const listRouteAnchor="  app.get('/api/admin/employees', manager, async (req, res, next) => {";
if(!api.includes("/api/admin/employee-files/folders")){
  if(!api.includes(listRouteAnchor)) throw new Error('Employee list route anchor changed');
  api=api.replace(listRouteAnchor,`  app.get('/api/admin/employee-files/folders', manager, async (_req, res, next) => {\n    try {\n      await ready();\n      const auth = authOf(res);\n      const legalEntityId = selectedEntityId(auth);\n      const employees = await prisma.$queryRawUnsafe<any[]>(\n        \`SELECT u."id",u."email",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "displayName"\n           FROM "Employment" employment\n           JOIN "User" u ON u."organizationId"=employment."organizationId" AND u."id"=employment."userId"\n           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"\n           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"\n          WHERE employment."organizationId"=$1 AND employment."legalEntityId"=$2 AND employment."status"<>'TERMINATED'\n          ORDER BY "displayName"\`, auth.organizationId, legalEntityId\n      );\n      for (const employee of employees) await ensureEmployeeFolder(auth, employee.id, displayNameFor(employee));\n      const rows = await prisma.$queryRawUnsafe<any[]>(\n        \`SELECT f.*,u."email",COALESCE(NULLIF(c."displayName",''),NULLIF(p."displayName",''),u."email",u."id") AS "displayName",\n                (SELECT COUNT(*)::int FROM "EmployeeDocument" d WHERE d."organizationId"=f."organizationId" AND d."employeeId"=f."employeeId" AND d."status"='ACTIVE') AS "documentCount"\n           FROM "EmployeeFileFolder" f\n           JOIN "User" u ON u."organizationId"=f."organizationId" AND u."id"=f."employeeId"\n           LEFT JOIN "EmployeePortalCredential" c ON c."userId"=u."id"\n           LEFT JOIN "EmployeeManagementProfile" p ON p."userId"=u."id" AND p."organizationId"=u."organizationId"\n          WHERE f."organizationId"=$1 AND f."legalEntityId"=$2 AND f."status"='ACTIVE'\n          ORDER BY f."folderName"\`, auth.organizationId, legalEntityId\n      );\n      res.json({ data: { rootFolder: 'Employee Files', folders: rows } });\n    } catch (error) { next(error); }\n  });\n\n  app.get('/api/admin/employee-files/folders/:employeeId/documents', manager, async (req, res, next) => {\n    try {\n      await ready();\n      const auth = authOf(res);\n      await targetUser(auth, req.params.employeeId);\n      await ensureEmployeeFolder(auth, req.params.employeeId);\n      const documents = await prisma.$queryRawUnsafe<any[]>(\n        \`SELECT "id","employeeId","category","title","fileName","mimeType","fileSizeBytes","issueDate","expirationDate","notes","status","createdAt","updatedAt"\n           FROM "EmployeeDocument"\n          WHERE "organizationId"=$1 AND "employeeId"=$2 AND "status"='ACTIVE'\n          ORDER BY "createdAt" DESC\`, auth.organizationId, req.params.employeeId\n      );\n      res.json({ data: { employeeId: req.params.employeeId, documents } });\n    } catch (error) { next(error); }\n  });\n\n  ${listRouteAnchor}`);
}

const documentInsertMarker='      await prisma.$executeRawUnsafe(\n        `INSERT INTO "EmployeeDocument"';
const folderBeforeDocumentMarker='await ensureEmployeeFolder(auth, req.params.employeeId);\n      await prisma.$executeRawUnsafe(\n        `INSERT INTO "EmployeeDocument"';
if(api.includes(documentInsertMarker) && !api.includes(folderBeforeDocumentMarker)){
  api=api.replace(documentInsertMarker,'      await ensureEmployeeFolder(auth, req.params.employeeId);\n'+documentInsertMarker);
}

if(!app.includes('Employee Files')){
  const renderAnchor="function render(){let root=document.getElementById('employee-documents-admin');";
  if(!app.includes(renderAnchor)) throw new Error('Employee documents render anchor changed');
  app=app.replace("let state=null;","let state=null;let fileFolders={rootFolder:'Employee Files',folders:[]};");
  app=app.replace("async function refresh(){const root=document.getElementById('employee-documents-admin');if(root)root.innerHTML='<div class=\"adoc-empty\">Loading document center…</div>';state=await api('/api/admin/employee-documents/dashboard');render()}","async function refresh(){const root=document.getElementById('employee-documents-admin');if(root)root.innerHTML='<div class=\"adoc-empty\">Loading document center…</div>';[state,fileFolders]=await Promise.all([api('/api/admin/employee-documents/dashboard'),api('/api/admin/employee-files/folders')]);render()}");
  const oldHeader='<div class="adoc-head"><div><h2>Employee 360 Documents & E-Signatures</h2><p>Manage templates, assignments, signatures and completion history.</p></div><button id="adoc-refresh">Refresh</button></div>';
  const employeeFilesPanel=`<div class="adoc-head"><div><h2>Employee Files</h2><p>Automatic employee personnel folders, secure files, templates, assignments, signatures and completion history.</p></div><button id="adoc-refresh">Refresh</button></div><div class="adoc-card" style="margin-bottom:16px"><h3>📁 Employee Files</h3><div class="adoc-list">\${(fileFolders.folders||[]).length?(fileFolders.folders||[]).map(f=>\`<div class="adoc-row"><div class="adoc-row-head"><strong>📂 \${esc(f.folderName)}</strong><span>\${esc(f.documentCount||0)} files</span></div><p>\${esc(f.email||'')}</p></div>\`).join(''):'<div class="adoc-empty">Employee folders are created automatically when employees are active in this company.</div>'}</div></div>`;
  if(!app.includes(oldHeader)) throw new Error('Employee documents header anchor changed');
  app=app.replace(oldHeader,employeeFilesPanel);
}

await writeFile(apiPath,api,'utf8');
await writeFile(appPath,app,'utf8');
console.log('Employee Files folder system installed: root Employee Files, automatic named employee folders, employee-scoped document listing, and document-to-folder wiring.');
