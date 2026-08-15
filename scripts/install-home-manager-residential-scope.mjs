import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function patch(relative, transform) {
  const target = path.join(root, relative);
  const before = await readFile(target, 'utf8');
  const after = transform(before);
  if (after !== before) await writeFile(target, after, 'utf8');
}

await patch('api/src/scls-residential-routes.ts', (source) => {
  const management = "const managementRoles=new Set<UserRole>([UserRole.ADMINISTRATOR,UserRole.PROGRAM_MANAGER,UserRole.DELEGATING_NURSE,UserRole.RN,UserRole.CEO,UserRole.DOO]);";
  const staffManagement = `${management}\nconst staffManagementRoles=new Set<UserRole>([...managementRoles,UserRole.HOUSE_MANAGER]);`;
  if (!source.includes('const staffManagementRoles=')) {
    if (!source.includes(management)) throw new Error('SCLS residential management-role marker changed');
    source = source.replace(management, staffManagement);
  }

  const ensureManager = "const ensureManager=(a:AuthContext)=>{ensure(a);if(!managementRoles.has(a.role)&&!owner(a))throw httpError(403,'Residential management access is required');};";
  const ensureStaffManager = `${ensureManager}\nconst ensureStaffManager=(a:AuthContext)=>{ensure(a);if(!staffManagementRoles.has(a.role)&&!owner(a))throw httpError(403,'House staff management access is required');};`;
  if (!source.includes('const ensureStaffManager=')) {
    if (!source.includes(ensureManager)) throw new Error('SCLS residential manager guard marker changed');
    source = source.replace(ensureManager, ensureStaffManager);
  }

  const oldAccess = 'async function canAccessHome(prisma:PrismaClient,a:AuthContext,homeId:string){if(elevated(a))return true;const rows=await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(`SELECT EXISTS(SELECT 1 FROM "SpireEmployeeHomeAssignment" WHERE "organizationId"=$1 AND "legalEntityId"=$2 AND "userId"=$3 AND "homeId"=$4) AS allowed`,a.organizationId,entity(a),a.userId,homeId);return rows[0]?.allowed===true;}';
  const newAccess = 'async function canAccessHome(prisma:PrismaClient,a:AuthContext,homeId:string){if(elevated(a))return true;const rows=await prisma.$queryRawUnsafe<Array<{allowed:boolean}>>(`SELECT (EXISTS(SELECT 1 FROM "SpireHome" h WHERE h."organizationId"=$1 AND h."legalEntityId"=$2 AND h."id"=$4 AND h."managerUserId"=$3 AND h."active"=TRUE) OR EXISTS(SELECT 1 FROM "SpireEmployeeHomeAssignment" e WHERE e."organizationId"=$1 AND e."legalEntityId"=$2 AND e."userId"=$3 AND e."homeId"=$4)) AS allowed`,a.organizationId,entity(a),a.userId,homeId);return rows[0]?.allowed===true;}';
  if (!source.includes('h."managerUserId"=$3') && source.includes(oldAccess)) source = source.replace(oldAccess, newAccess);

  const oldHomesScope = 'AND ($3::boolean=TRUE OR EXISTS(SELECT 1 FROM "SpireEmployeeHomeAssignment" a WHERE a."organizationId"=h."organizationId" AND a."legalEntityId"=h."legalEntityId" AND a."userId"=$4 AND a."homeId"=h."id")) ORDER BY h."name"`';
  const newHomesScope = 'AND ($3::boolean=TRUE OR h."managerUserId"=$4 OR EXISTS(SELECT 1 FROM "SpireEmployeeHomeAssignment" a WHERE a."organizationId"=h."organizationId" AND a."legalEntityId"=h."legalEntityId" AND a."userId"=$4 AND a."homeId"=h."id")) ORDER BY h."name"`';
  if (!source.includes('OR h."managerUserId"=$4 OR EXISTS') && source.includes(oldHomesScope)) source = source.replace(oldHomesScope, newHomesScope);

  const oldContext = 'res.json({data:{company,role:a.role,elevated:elevated(a)}});';
  const newContext = 'res.json({data:{company,role:a.role,elevated:elevated(a),canManageStaff:owner(a)||staffManagementRoles.has(a.role)}});';
  if (!source.includes('canManageStaff:') && source.includes(oldContext)) source = source.replace(oldContext, newContext);

  source = source.replace(
    "app.post('/api/scls/residential/homes/:homeId/staff',async(req,res,next)=>{try{const a=authOf(res);ensureManager(a);await requireHome",
    "app.post('/api/scls/residential/homes/:homeId/staff',async(req,res,next)=>{try{const a=authOf(res);ensureStaffManager(a);await requireHome",
  );
  source = source.replace(
    "app.delete('/api/scls/residential/homes/:homeId/staff/:userId',async(req,res,next)=>{try{const a=authOf(res);ensureManager(a);await requireHome",
    "app.delete('/api/scls/residential/homes/:homeId/staff/:userId',async(req,res,next)=>{try{const a=authOf(res);ensureStaffManager(a);await requireHome",
  );

  for (const marker of [
    'const staffManagementRoles=new Set<UserRole>([...managementRoles,UserRole.HOUSE_MANAGER]);',
    'const ensureStaffManager=',
    'h."managerUserId"=$3',
    'OR h."managerUserId"=$4 OR EXISTS',
    'canManageStaff:owner(a)||staffManagementRoles.has(a.role)',
    "homes/:homeId/staff',async(req,res,next)=>{try{const a=authOf(res);ensureStaffManager(a);",
    "homes/:homeId/staff/:userId',async(req,res,next)=>{try{const a=authOf(res);ensureStaffManager(a);",
  ]) if (!source.includes(marker)) throw new Error(`SCLS Home Manager backend scope missing ${marker}`);

  return source;
});

await patch('scls-residential.html', (html) => {
  const oldState = "const state={context:null,homes:[],homeId:'',detail:null,tab:'residents',patients:[]};";
  const newState = "const validTabs=new Set(['residents','staff','tasks','handoff','log']),requestedTab=location.hash.replace(/^#/,'');const state={context:null,homes:[],homeId:'',detail:null,tab:validTabs.has(requestedTab)?requestedTab:'residents',patients:[]};";
  if (!html.includes('const validTabs=new Set(')) {
    if (!html.includes(oldState)) throw new Error('SCLS residential state marker changed');
    html = html.replace(oldState, newState);
  }

  html = html.replace(
    "${state.context.elevated?'<button id=\"addStaff\" class=\"btn primary\">+ Assign Staff</button>':''}",
    "${state.context.canManageStaff?'<button id=\"addStaff\" class=\"btn primary\">+ Assign Staff</button>':''}",
  );
  html = html.replace(
    "${state.context.elevated?`<div class=\"actions\"><button class=\"btn danger\" data-remove-staff=\"${esc(s.userId)}\">Remove Assignment</button></div>`:''}",
    "${state.context.canManageStaff?`<div class=\"actions\"><button class=\"btn danger\" data-remove-staff=\"${esc(s.userId)}\">Remove Assignment</button></div>`:''}",
  );

  const oldTabClick = "document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;renderDetail()});";
  const newTabClick = "document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;history.replaceState(null,'','#'+state.tab);renderDetail()});";
  if (!html.includes("history.replaceState(null,'','#'+state.tab)") && html.includes(oldTabClick)) html = html.replace(oldTabClick, newTabClick);

  const oldLoad = "async function load(){state.context=await api('/api/scls/residential/context');state.homes=await api('/api/scls/residential/homes');";
  const newLoad = "async function load(){state.context=await api('/api/scls/residential/context');$('newHouse').hidden=!state.context.elevated;document.querySelectorAll('a[href=\"/client-intake.html\"],a[href=\"/spire-admin.html\"]').forEach(a=>a.hidden=!state.context.elevated);state.homes=await api('/api/scls/residential/homes');";
  if (!html.includes("$('newHouse').hidden=!state.context.elevated") && html.includes(oldLoad)) html = html.replace(oldLoad, newLoad);

  for (const marker of [
    "const validTabs=new Set(['residents','staff','tasks','handoff','log'])",
    'state.context.canManageStaff?',
    "history.replaceState(null,'','#'+state.tab)",
    "$('newHouse').hidden=!state.context.elevated",
  ]) if (!html.includes(marker)) throw new Error(`SCLS Home Manager frontend scope missing ${marker}`);
  return html;
});

console.log('Home Manager residential scope installed: appointed managers see only their assigned/managed homes, can add or remove staff only in those homes, privileged home/resident administration stays elevated-only, and role deep links open the requested residential tab.');
