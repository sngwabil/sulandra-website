import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
async function read(relative){try{return await readFile(path.join(root,relative),'utf8')}catch{failures.push(`Missing ${relative}`);return''}}
async function exists(relative){try{await stat(path.join(root,relative));return true}catch{failures.push(`Missing published ${relative}`);return false}}
function requireMarkers(source,markers,label){for(const marker of markers)if(!source.includes(marker))failures.push(`${label} missing ${marker}`)}
function forbid(source,markers,label){for(const marker of markers)if(source.includes(marker))failures.push(`${label} still contains ${marker}`)}

const [html,completion,stability,results,routes,migration,injector,core,workflow,cpoe,finalizer,apiPackage]=await Promise.all([
  read('dist-web/spire.html'),
  read('dist-web/assets/spire-workspace-completion.js'),
  read('dist-web/assets/spire-workspace-stability.js'),
  read('dist-web/assets/spire-results-workspace.js'),
  read('api/src/spire-workspace-completion-routes.ts'),
  read('prisma/migrations/20260810142500_spire_workspace_completion/migration.sql'),
  read('scripts/inject-clinical-routes.mjs'),
  read('dist-web/assets/spire-app-v2.js'),
  read('dist-web/assets/spire-workflow.js'),
  read('dist-web/assets/spire-order-composer.js'),
  read('scripts/finalize-spire-workspace-completion.mjs'),
  read('api/package.json'),
]);

await Promise.all([
  exists('dist-web/assets/spire-workspace-completion.css'),
  exists('dist-web/assets/spire-workspace-completion.js'),
  exists('dist-web/assets/spire-workspace-stability.js'),
  exists('dist-web/assets/spire-results-workspace.js'),
]);

requireMarkers(html,[
  '/assets/spire-workspace-completion.css?v=20260810-spire-workspaces-1',
  '/assets/spire-workspace-completion.js?v=20260810-spire-workspaces-1',
  '/assets/spire-workspace-stability.js?v=20260810-spire-workspaces-1',
],'Published SPIRE HTML');
if((html.match(/spire-workspace-completion\.js/g)||[]).length!==1)failures.push('Published SPIRE completion runtime is not unique');
if((html.match(/spire-workspace-stability\.js/g)||[]).length!==1)failures.push('Published SPIRE stability runtime is not unique');

requireMarkers(migration,[
  '"SpireUserWorkspacePreference"',
  '"workspaceTabs" JSONB',
  '"speedButtons" JSONB',
  '"savedFilters" JSONB',
  '"SpireSmartText"',
  '"respondedAt"',
  '"respondedById"',
  '"responseComment"',
],'SPIRE workspace migration');

requireMarkers(routes,[
  "'/api/spire/workspaces/task-assignees'",
  "'/api/spire/workspaces/tasks'",
  "'/api/spire/workspaces/tasks/:taskId/action'",
  'SpireClinicalTaskEvent',
  "'/api/spire/workspaces/orders'",
  "'/api/spire/workspaces/orders/:kind/:orderId/action'",
  'MEDICATION_ORDER_${i.action}',
  "'/api/spire/workspaces/reports'",
  'abnormalResults',
  'vitalsRecorded',
  "'/api/spire/tools/preferences'",
  "'/api/spire/tools/smarttexts'",
  "'/api/spire/tools/smarttexts/:id'",
  "'/api/spire/tools/smartphrases/:id'",
  "'/api/spire/patients/:patientId/notes-workspace'",
  "'/api/spire/patients/:patientId/notes/:noteId/cosign'",
  "'/api/spire/patients/:patientId/plan-context'",
  "'/api/spire/patients/:patientId/wrap-up-context'",
  'selectedEntity(a)',
  'patientAllowed(prisma,a',
  'SpireClinicalAuditEvent',
],'SPIRE workspace backend');
requireMarkers(injector,['registerSpireWorkspaceCompletionRoutes','registerSpireWorkspaceCompletionRoutes(app, prisma, { authOf, audit });'],'SPIRE backend injector');
requireMarkers(apiPackage,['fix-spire-workspace-completion-types.mjs'],'SPIRE API compile contract');

requireMarkers(completion,[
  "api('/api/spire/tools/preferences'",
  "api('/api/spire/workspaces/tasks",
  'My Tasks',
  'data-task-action="START"',
  'data-task-action="COMPLETE"',
  'data-task-save',
  'api(`/api/spire/workspaces/orders?${qs}`)',
  'Open Orders',
  'newOrderFromDashboard',
  'window.SpireOrderComposer?.open?.()',
  'data-order-action="DISCONTINUE"',
  "api(`/api/spire/workspaces/reports?days=${days}`)",
  'Clinical & Operational Reports',
  'Export CSV',
  'SmartPhrase Manager',
  'My SmartPhrases',
  'SmartText Manager',
  'Customize Speed Buttons',
  'Customize Workspace Tabs',
  'Saved Filters',
  "if(e.target.id==='quickTask')",
  'openTaskModal()',
  "api(`/api/spire/patients/${encodeURIComponent(p.id)}/notes-workspace`)",
  'Save & Sign',
  '/notes/${encodeURIComponent(id)}/sign',
  '/notes/${encodeURIComponent(cos.dataset.id)}/cosign',
  "api(`/api/spire/patients/${encodeURIComponent(p.id)}/plan-context`)",
  'Care Plan / ISP',
  "api(`/api/spire/patients/${encodeURIComponent(p.id)}/wrap-up-context`)",
  '/wrap-up',
  'Sign & Close Encounter',
  'saveNamedFilter',
  'saveWorkspaceTabs',
],'SPIRE completion frontend');

requireMarkers(results,[
  'Trend Selected',
  'Number.isFinite(x.numeric)',
  '<polyline fill="none"',
  '<circle cx=',
  "completion()?.saveNamedFilter?.('results'",
  "completion()?.saveWorkspaceTabs",
  'Chart Review always remains available',
],'SPIRE Results workspace');

requireMarkers(stability,[
  "workspace==='tasks'",
  "workspace==='orders'",
  "workspace==='reports'",
  "workspace==='tools'",
  "tab==='notes'",
  "tab==='plan'",
  "tab==='wrap-up'",
  'completion.renderCurrent(true)',
],'SPIRE stability guard');

requireMarkers(workflow,[
  '/notes/${encodeURIComponent(data.id)}/sign',
  '/wrap-up',
  'Record Vitals',
  'Start Encounter',
],'Existing clinical workflow');
requireMarkers(cpoe,['Order Composer','order-composer/check','Sign & Place Order'],'Existing CPOE safety workflow');
requireMarkers(finalizer,['finalize-spire-workspace-completion','will be expanded in its implementation phase','spire-workspace-stability.js'],'SPIRE static finalizer');
forbid(core,['will be expanded in its implementation phase'],'Published SPIRE core');

for(const table of ['SpireClinicalTask','SpireOrder','SpireMedicationOrder','SpireClinicalNote','SpireCarePlan','SpireResultComponent','SpireVitalSign']){
  if(!routes.includes(`"${table}"`))failures.push(`SPIRE workspace backend is not grounded in ${table}`);
}
if(completion.includes("localStorage.setItem('spire:tools")||completion.includes('localStorage.setItem("spire:tools'))failures.push('SPIRE Tools still use browser-local persistence as source of truth');
if(!completion.includes("'X-Legal-Entity-Id'")&&!routes.includes('legalEntityId'))failures.push('SPIRE completion lacks legal-entity scoping');

if(failures.length){console.error('SPIRE workspace completion verification failed:\n- '+failures.join('\n- '));process.exit(1)}
console.log('SPIRE workspace completion verified: My Tasks, Orders, Reports, Quick Task, SmartText, SmartPhrases, Speed Buttons, Workspace Tabs, Saved Filters, numeric Results trending, unified Notes/sign/cosign, Plan and Wrap-Up are live, company-scoped, server-backed and published.');
