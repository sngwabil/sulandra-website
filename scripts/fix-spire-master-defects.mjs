import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const target = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_MASTER_DEFECT_FIXES_V1';

let html = await readFile(target, 'utf8');

if (!html.includes(marker)) {
  const styleAnchor = '        @media(max-width:760px){\n            .intake-workspace{display:block;overflow:auto}.intake-nav{max-height:220px;border-right:0;border-bottom:1px solid #cbd5e1}\n            .intake-main,.intake-side{overflow:visible}.intake-fields,.intake-start-grid{grid-template-columns:1fr}.intake-side{display:block}\n        }\n';
  if (!html.includes(styleAnchor)) throw new Error('SPIRE master responsive-style anchor was not found');
  html = html.replace(styleAnchor, `${styleAnchor}\n        /* ${marker}: production readability and read-only chart presentation. */\n        .workspace{grid-template-columns:320px minmax(0,1fr) 290px}\n        .workspace.sidebar-closed{grid-template-columns:320px minmax(0,1fr) 0}\n        .client-sidebar{min-width:0}\n        .client-info-group,.client-info-group span,.sidebar-card{overflow-wrap:anywhere;word-break:normal}\n        .editable[contenteditable="false"]{border-bottom:0!important;cursor:default!important;color:inherit!important;font-weight:inherit!important;text-decoration:none!important}\n        .editable[contenteditable="false"]:hover{background:transparent!important}\n        .flow-grid td:first-child{white-space:normal}\n        @media(max-width:1180px){.workspace{grid-template-columns:285px minmax(0,1fr) 260px}.workspace.sidebar-closed{grid-template-columns:285px minmax(0,1fr) 0}}\n`);

  const cleanAnchor = "  const cleanText = (value) => String(value ?? '').trim();\n";
  if (!html.includes(cleanAnchor)) throw new Error('SPIRE master cleanText anchor was not found');
  html = html.replace(cleanAnchor, `${cleanAnchor}\n  const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;\n  const firstText = (...values) => values.map(cleanText).find(Boolean) || '';\n  const humanLabel = (value, fallback='') => { const textValue=cleanText(value); return textValue && !UUID_LIKE.test(textValue) ? textValue : cleanText(fallback); };\n\n  function clearStaticDemoMarkup() {\n    for (const selector of ['.mar-med-row[data-med="Sample Medication"]','#notesListContainer .note-item-card','#followupModal .modal-body > div:not(:first-child)']) {\n      document.querySelectorAll(selector).forEach(node => node.remove());\n    }\n    const overdue=$('#overdueMedListPopup'); if(overdue) overdue.textContent='No live overdue-medication data loaded yet.';\n  }\n`);

  const patientNameOld = `  function patientName() {\n    const s = state.storyboard || {};\n    return s.displayName || s.name || s.preferredName || [s.firstName,s.middleName,s.lastName].filter(Boolean).join(' ') || 'Client';\n  }`;
  const patientNameNew = `  function patientName() {\n    const s = state.storyboard || {};\n    const identity = readAdmissionSection('demographics_identity');\n    return firstText(\n      s.displayName,\n      s.name,\n      s.preferredName,\n      [s.firstName,s.middleName,s.lastName].filter(Boolean).join(' '),\n      identity.preferredName,\n      [identity.firstName,identity.middleName,identity.lastName].filter(Boolean).join(' ')\n    ) || 'Client';\n  }`;
  if (!html.includes(patientNameOld)) throw new Error('SPIRE master patientName anchor was not found');
  html = html.replace(patientNameOld, patientNameNew);

  const sidebarStartOld = `    const guardian = readAdmissionSection('legal_decision_maker');\n    const insurance = readAdmissionSection('insurance_medicaid');\n    const residential = readAdmissionSection('scls_residential_setup');\n    const safety = readAdmissionSection('safety_emergency');\n    const nutrition = readAdmissionSection('nutrition_swallowing');\n    const baseline = readAdmissionSection('baseline_vitals');`;
  const sidebarStartNew = `    const identity = readAdmissionSection('demographics_identity');\n    const guardian = readAdmissionSection('legal_decision_maker');\n    const insurance = readAdmissionSection('insurance_medicaid');\n    const residential = readAdmissionSection('scls_residential_setup');\n    const safety = readAdmissionSection('safety_emergency');\n    const nutrition = readAdmissionSection('nutrition_swallowing');\n    const baseline = readAdmissionSection('baseline_vitals');\n    const providers = readAdmissionSection('providers_appointments');\n    const infection = readAdmissionSection('infection_control');`;
  if (!html.includes(sidebarStartOld)) throw new Error('SPIRE master patient sidebar section anchor was not found');
  html = html.replace(sidebarStartOld, sidebarStartNew);

  const sidebarFieldsOld = `    setText('displayGender', s.sexAtBirth || s.genderIdentity || '—');\n    setText('displayAge', calcAge(s.dateOfBirth));\n    setText('displayDOB', s.dateOfBirth ? fmtDate(s.dateOfBirth) : '—');\n    setText('displayMRN', s.medicalRecordNumber || s.mrn || '—');\n    setText('displayBed', s.homeName || s.locationName || residential.serviceHome || s.programName || '—');\n    setText('displayCode', s.codeStatus || 'See current orders');\n    const team = asArray(s.careTeam);\n    const pcp = team.find(x => /primary|pcp/i.test(\`${x.role||''} ${x.specialty||''}\`)) || team[0] || {};\n    setText('displayPCP', pcp.displayName || pcp.name || readAdmissionSection('providers_appointments').primaryCare || '—');`;
  const sidebarFieldsNew = `    const dob = firstText(s.dateOfBirth, identity.dateOfBirth);\n    setText('displayGender', firstText(s.sexAtBirth, s.genderIdentity, identity.sexAtBirth, identity.genderIdentity) || '—');\n    setText('displayAge', calcAge(dob));\n    setText('displayDOB', dob ? fmtDate(dob) : '—');\n    setText('displayMRN', firstText(s.medicalRecordNumber, s.mrn, identity.medicalRecordNumber) || '—');\n    setText('displayBed', firstText(humanLabel(s.homeName), humanLabel(s.locationName), residential.serviceHome, humanLabel(s.programName)) || '—');\n    setText('displayCode', s.codeStatus || 'See current orders');\n    const team = asArray(s.careTeam);\n    const pcp = team.find(x => /primary|pcp/i.test(\`${x.roleLabel||x.role||''} ${x.specialty||''}\`)) || team[0] || {};\n    setText('displayPCP', firstText(providers.primaryCare, pcp.displayName, pcp.name, pcp.roleLabel) || '—');`;
  if (!html.includes(sidebarFieldsOld)) throw new Error('SPIRE master patient sidebar identity anchor was not found');
  html = html.replace(sidebarFieldsOld, sidebarFieldsNew);

  html = html.replace(
    "    setText('displayIsolation', readAdmissionSection('infection_control').currentPrecautions || 'None documented');",
    "    setText('displayIsolation', infection.currentPrecautions || 'None documented');",
  );
  html = html.replace(
    "    setText('displayPrecautions', asArray(s.riskAlerts).map(x=>x.label||x.message||x.type).filter(Boolean).join('; ') || safety.emergencyPlan || 'See active protocols');",
    "    setText('displayPrecautions', asArray(s.riskAlerts).map(x=>x.title||x.label||x.message||x.type||x.details).filter(Boolean).join('; ') || safety.emergencyPlan || 'See active protocols');",
  );

  html = html.replaceAll("item.name||item.description||item.code||'Clinical problem'", "item.display||item.title||item.name||item.description||item.code||'Clinical problem'");
  html = html.replaceAll("item.name||item.description||item.code||'Problem'", "item.display||item.title||item.name||item.description||item.code||'Problem'");
  html = html.replaceAll("item.displayName||item.name||item.role||'Provider'", "item.displayName||item.name||item.roleLabel||item.role||item.userId||'Provider'");
  html = html.replaceAll("item.specialty||item.role||'—'", "item.specialty||item.roleLabel||item.role||'—'");
  html = html.replaceAll("item.displayName||item.name||'Provider'", "item.displayName||item.name||item.roleLabel||item.userId||'Provider'");
  html = html.replaceAll("x=>x.name||x.description||x.code", "x=>x.display||x.title||x.name||x.description||x.code");
  html = html.replaceAll("x=>x.label||x.message||x.type", "x=>x.title||x.label||x.message||x.type||x.details");

  const renderFlowAnchor = `  function renderFlowsheet(host) {\n    const data = state.flowsheet || {};\n    const rows = asArray(data.rows);`;
  const renderFlowReplacement = `  function renderFlowsheet(host) {\n    const data = state.flowsheet || {};\n    const rows = asArray(data.rows);\n    if (!rows.length) {\n      host.innerHTML='<div class="spire-error"><b>Flowsheet configuration is unavailable.</b><br>The live API returned no active flowsheet rows for this organization. No browser-generated rows will be fabricated.<div style="margin-top:8px"><button class="spire-action" type="button" data-flow-retry>Retry</button></div></div>';\n      host.querySelector('[data-flow-retry]')?.addEventListener('click',()=>loadFlowsheetsView());\n      return;\n    }`;
  if (!html.includes(renderFlowAnchor)) throw new Error('SPIRE master flowsheet render anchor was not found');
  html = html.replace(renderFlowAnchor, renderFlowReplacement);

  html = html.replace(
    "<span style=\"margin-left:auto\" class=\"spire-pill\">${esc(viewer.displayName||viewer.userId||'Current user')}</span>",
    "<span style=\"margin-left:auto\" class=\"spire-pill\">${esc(state.user?.displayName||state.user?.name||state.user?.email||viewer.displayName||viewer.userId||'Current user')}</span>",
  );
  html = html.replaceAll("new Date(column).toLocaleDateString()", "new Date(column).toLocaleDateString('en-US')");

  const bootstrapAnchor = `  async function bootstrap() {\n    if(!requireSession())return;`;
  const bootstrapReplacement = `  async function bootstrap() {\n    if(!requireSession())return;\n    clearStaticDemoMarkup();`;
  if (!html.includes(bootstrapAnchor)) throw new Error('SPIRE master bootstrap anchor was not found');
  html = html.replace(bootstrapAnchor, bootstrapReplacement);
}

if (!html.includes(marker)) throw new Error('SPIRE master defect-fix marker was not installed');
await writeFile(target, html, 'utf8');
console.log('SPIRE standalone master defect fixes installed: read-only styling, identity fallbacks, schema normalization, deterministic US dates, authenticated viewer identity, empty-flowsheet error state, and demo-markup cleanup.');
