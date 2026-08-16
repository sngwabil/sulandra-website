import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const read = async (relative) => { try { return await readFile(path.join(root, relative), 'utf8'); } catch { failures.push(`Missing ${relative}`); return ''; } };
const requireFile = async (relative) => { try { await access(path.join(root, relative)); } catch { failures.push(`Missing ${relative}`); } };
const has = (source, markers, label) => { for (const marker of markers) if (!source.includes(marker)) failures.push(`${label} missing ${marker}`); };
const hasAny = (source, markers, label) => { if (!markers.some((marker) => source.includes(marker))) failures.push(`${label} missing one of: ${markers.join(', ')}`); };
const forbids = (source, markers, label) => { for (const marker of markers) if (source.includes(marker)) failures.push(`${label} still contains forbidden ${marker}`); };
const syntax = (relative, label) => { const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { encoding: 'utf8' }); if (result.status !== 0) failures.push(`${label} syntax failed: ${(result.stderr || result.stdout || '').trim()}`); };

const files = {
  entry:'dist-web/spire.html', login:'dist-web/spire/login.html', station:'dist-web/spire/client-station.html', legacyStation:'dist-web/spire/patient-station.html', chat:'dist-web/spire/secure-chat.html', master:'dist-web/spire/master.html',
  loginJs:'dist-web/assets/spire-login.js', stationJs:'dist-web/assets/spire-client-station.js', chatJs:'dist-web/assets/spire-secure-chat.js', prefsJs:'dist-web/assets/spire-user-preferences.js', screenJs:'dist-web/assets/spire-screen-controls.js', masterNavJs:'dist-web/assets/spire-master-navigation.js',
  medOrderJs:'dist-web/assets/spire-medication-order-entry.js', medOrderV2Js:'dist-web/assets/spire-medication-order-entry-v2.js', medPolicyJs:'dist-web/assets/spire-medication-management-policy.js', medRowControlsJs:'dist-web/assets/spire-medication-row-controls.js', marTimelineJs:'dist-web/assets/spire-mar-timeline.js', flowJs:'dist-web/assets/spire-master-flowsheet-grid.js', commJs:'dist-web/assets/spire-communications-inbasket.js', workflowJs:'dist-web/assets/spire-workflow.js', cpoeJs:'dist-web/assets/spire-order-composer.js', emarJs:'dist-web/assets/spire-emar.js', careJs:'dist-web/assets/spire-care-plan.js', incidentJs:'dist-web/assets/spire-incidents.js',
  homeRoutes:'api/src/spire-network-home-access-routes.ts', commRoutes:'api/src/spire-communications-inbasket-routes.ts', injector:'scripts/inject-clinical-routes.mjs'
};
const data = {}; for (const [key, relative] of Object.entries(files)) data[key] = await read(relative);

has(data.entry, ['SPIRE_CANONICAL_LOGIN_ENTRY_V3','/spire/login.html','window.location.search','window.location.hash'], 'SPIRE canonical entry');
forbids(data.entry, ['/spire/portal.html','/spire/master.html'], 'SPIRE canonical entry');
has(data.login, ['SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1','spireWorkspaceFrame','/assets/spire-login.js?v=20260813-exact-workflow-1'], 'SPIRE authentication shell');
has(data.loginJs, ['SPIRE_AUTHENTICATED_FULLSCREEN_SHELL_V1','/api/auth/me','/employee-login.html?returnTo=','/spire/client-station.html','restoreRememberedHome','mirrorRememberedHome'], 'SPIRE authentication runtime');
has(data.station, ['SPIRE_CLIENT_STATION_LISTS_V2','Client Station','Client Lists','All My Clients','Available Homes','stationClientBody','clientPreview','data-spire-fullscreen-control'], 'SPIRE Client Station');
forbids(data.station, ['Patient Lists','>Patient Station<'], 'SPIRE Client Station');
hasAny(data.stationJs, ['SPIRE_CLIENT_STATION_LISTS_V3','SPIRE_CLIENT_STATION_LISTS_V2'], 'SPIRE Client Station runtime');
has(data.stationJs, ['/api/spire/network/service-homes','/access','localStorage.setItem(HOME_ID_KEY',"row.addEventListener('dblclick'",'openChart','/spire/secure-chat.html','/api/spire/inbasket-v2?status=OPEN'], 'SPIRE Client Station runtime');
forbids(data.stationJs, ['/spire/portal.html','openChart(state.clients[0]'], 'SPIRE Client Station runtime');
has(data.legacyStation, ['SPIRE_RETIRED_PATIENT_STATION_COMPAT_V1','/spire/client-station.html'], 'Retired Patient Station compatibility entry');
has(data.chat, ['SPIRE_SECURE_CHAT_V2','Secure Chat','← Client Station','Client-scoped','data-spire-fullscreen-control'], 'SPIRE Secure Chat');
has(data.chatJs, ['SPIRE_SECURE_CHAT_V2','/communications/overview','/communications/threads/','/api/spire/routing-pools','recipientPoolId','/spire/client-station.html','Messages are client-scoped'], 'SPIRE Secure Chat runtime');
forbids(data.chatJs, ['Demo Conversation','Demo Message','mockMessages','/spire/portal.html'], 'SPIRE Secure Chat runtime');
hasAny(data.prefsJs, ['SPIRE_USER_WORKSPACE_PREFERENCES_V4','SPIRE_USER_WORKSPACE_PREFERENCES_V3'], 'SPIRE authenticated-user preferences');
has(data.prefsJs, ['clientStation:','spire:accessibility:preset','spire:accessibility:font-size','spire:accessibility:fullscreen','fullscreenPreferred','requestFullscreen','pointerdown','userScope'], 'SPIRE authenticated-user preferences');
for (const marker of ["title:'#0f172a'","toolbar:'#f4510b'","background:'#eaf7fb'","cyan:'#5bd0e7'","nav:'#082f49'"]) if (!data.prefsJs.includes(marker)) failures.push(`SPIRE theme #21 Client Station palette missing ${marker}`);
has(data.screenJs, ['SPIRE_SCREEN_CONTROLS_LIVE_V2','/api/spire/inbasket-v2?status=OPEN','/spire/secure-chat.html','Alerts & Reminders','Secure Chat'], 'SPIRE chart controls');
forbids(data.screenJs, ['Opening Staff Messaging Portal','Notifications: 3 unread reminders for current client.'], 'SPIRE chart controls');
forbids(data.master, ["alert('Opening Staff Messaging Portal...')","alert('Notifications: 3 unread reminders for current client.')"], 'SPIRE master chart');
has(data.masterNavJs, ['SPIRE_MASTER_EXPLICIT_CLIENT_GATE_V2','/spire/client-station.html','Client Station'], 'SPIRE chart navigation');
forbids(data.masterNavJs, ['/spire/portal.html'], 'SPIRE chart navigation');
has(data.flowJs, ['SPIRE_FLOWSHEET_FRIENDLY_ACTOR_V1','SPIRE Client Station before using Flowsheets'], 'SPIRE Flowsheet');
forbids(data.flowJs, ["entry?.recordedByDisplayName || entry?.recordedById","entry?.recordedByDisplayName || entry?.recordedByName || entry?.recordedById",'SPIRE Patient Station before using Flowsheets'], 'SPIRE Flowsheet');
has(data.master, ['<html','<body','S.P.I.R.E.','21. Client Station Classic','title="Secure Chat"','/assets/spire-user-preferences.js?v=20260813-exact-workflow-1','/assets/spire-screen-controls.js?v=20260813-live-controls-2','/assets/spire-master-navigation.js?v=20260813-client-station-2','/assets/spire-medication-order-entry.js?v=20260816-med-order-canonical-loader-3','/assets/spire-mar-timeline.js?v=20260814-chart-photo-db-2','/assets/spire-mar-epic-v5.css?v=20260814-chart-photo-db-2'], 'SPIRE master chart');

// Orders must have one canonical V2 owner. The compatibility loader is allowed
// to load V2 only after the Orders view exists; the row-control enhancer is
// permanently disabled so it cannot create a competing Manage button.
has(data.medOrderJs, ['SPIRE_MEDICATION_ORDER_CANONICAL_LOADER_V3','spire-medication-order-entry-v2.js?v=20260816-med-order-v2-canonical-2',"window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true","document.getElementById('manage-orders-view')"], 'SPIRE canonical medication loader');
forbids(data.medOrderJs, ['SPIRE_MEDICATION_ORDER_ENTRY_V1','observe(document.documentElement'], 'SPIRE canonical medication loader');
has(data.medOrderV2Js, ['SPIRE_MEDICATION_ORDER_ENTRY_V2','+ Add Medication Order','Manage Orders','data-spire-med-order-actions','Save & Activate Order','/api/spire/medication-orders-v2/'], 'SPIRE medication Orders V2');
has(data.medPolicyJs, ['SPIRE_MEDICATION_TOP_MANAGE_ONLY_V1','window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true','[data-spire-manage-medication-orders]'], 'SPIRE medication management policy');
has(data.medRowControlsJs, ['SPIRE_MEDICATION_ROW_CONTROLS_DISABLED_V2','window.__SPIRE_MEDICATION_ROW_CONTROLS_V1 = true'], 'SPIRE retired medication row controls');
forbids(data.medRowControlsJs, ['openManageFor(','ordersForPatient()','Medication management is still loading'], 'SPIRE retired medication row controls');

hasAny(data.marTimelineJs, ['SPIRE_MAR_TIMELINE_V4','SPIRE_MAR_TIMELINE_V3','SPIRE_MAR_TIMELINE_V2'], 'SPIRE MAR timeline runtime');
has(data.marTimelineJs, ['Go to Now','Medication / Order','Completed / Inactive Medications','data-mar-filter="scheduled"','data-mar-filter="prn"'], 'SPIRE MAR timeline');
has(data.workflowJs, ['Start Encounter','New Clinical Note'], 'SPIRE workflow');
has(data.cpoeJs, ['Order Composer','Sign & Place Order'], 'SPIRE CPOE');
has(data.emarJs, ['Electronic Medication Administration Record','PRN Effect'], 'SPIRE eMAR');
has(data.careJs, ['Care Plan / ISP','Goals & Outcomes'], 'SPIRE Care Plan');
has(data.incidentJs, ['Incident Management','New Incident'], 'SPIRE incidents');
has(data.commJs, ['In Basket 2.0','communications/overview','inbasket-v2'], 'SPIRE communications');
has(data.homeRoutes, ["app.get('/api/spire/network/service-homes'","app.post('/api/spire/network/service-homes/:homeId/access'",'SpireEmployeeHomeAssignment','SpirePatientHomeAssignment'], 'SPIRE service-home access routes');
has(data.commRoutes, ["app.get('/api/spire/inbasket-v2'",'/communications/overview','/communications/threads','SpireClinicalAuditEvent'], 'SPIRE communications backend');
has(data.injector, ['registerSpireNetworkHomeAccessRoutes','registerSpireCommunicationsInBasketRoutes'], 'SPIRE route injector');

for (const [relative, label] of [
  ['dist-web/assets/spire-login.js','SPIRE login shell'],['dist-web/assets/spire-client-station.js','Client Station'],['dist-web/assets/spire-secure-chat.js','Secure Chat'],['dist-web/assets/spire-user-preferences.js','Shared preferences'],['dist-web/assets/spire-screen-controls.js','Chart controls'],['dist-web/assets/spire-master-navigation.js','Chart navigation'],['dist-web/assets/spire-master-flowsheet-grid.js','Flowsheet'],['dist-web/assets/spire-medication-order-entry.js','Canonical medication loader'],['dist-web/assets/spire-medication-order-entry-v2.js','Medication Orders V2'],['dist-web/assets/spire-medication-management-policy.js','Medication management policy'],['dist-web/assets/spire-medication-row-controls.js','Retired medication row controls'],['dist-web/assets/spire-mar-timeline.js','MAR timeline']
]) { await requireFile(relative); syntax(relative, label); }

if (failures.length) { console.error('SPIRE corrected workflow verification failed:\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('SPIRE verified: SSO/system login → Client Station → remembered authorized home → explicit client chart; Orders uses one canonical V2 toolbar with Add Medication Order + Manage Orders, per-medication Manage is retired, and MAR remains independently published.');
