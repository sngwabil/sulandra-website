import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const target = path.join(root, 'spire', 'master.html');
const marker = 'SPIRE_MASTER_DEFECT_FIXES_V1';

let html = await readFile(target, 'utf8');

const replaceRequired = (needle, replacement, label) => {
  if (!html.includes(needle)) throw new Error(`SPIRE master ${label} anchor was not found`);
  html = html.replace(needle, replacement);
};

if (!html.includes(marker)) {
  const css = [
    '',
    `        /* ${marker}: production readability and read-only chart presentation. */`,
    '        .workspace{grid-template-columns:320px minmax(0,1fr) 290px}',
    '        .workspace.sidebar-closed{grid-template-columns:320px minmax(0,1fr) 0}',
    '        .client-sidebar{min-width:0}',
    '        .client-info-group,.client-info-group span,.sidebar-card{overflow-wrap:anywhere;word-break:normal}',
    '        .editable[contenteditable="false"]{border-bottom:0!important;cursor:default!important;color:inherit!important;font-weight:inherit!important;text-decoration:none!important}',
    '        .editable[contenteditable="false"]:hover{background:transparent!important}',
    '        .flow-grid td:first-child{white-space:normal}',
    '        @media(max-width:1180px){.workspace{grid-template-columns:285px minmax(0,1fr) 260px}.workspace.sidebar-closed{grid-template-columns:285px minmax(0,1fr) 0}}',
    '',
  ].join('\n');
  replaceRequired('    </style>', `${css}    </style>`, 'style');

  const cleanAnchor = "  const cleanText = (value) => String(value ?? '').trim();\n";
  const helpers = [
    cleanAnchor.trimEnd(),
    '',
    "  const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;",
    "  const firstText = (...values) => values.map(cleanText).find(Boolean) || '';",
    "  const humanLabel = (value, fallback='') => { const textValue=cleanText(value); return textValue && !UUID_LIKE.test(textValue) ? textValue : cleanText(fallback); };",
    '',
    '  function clearStaticDemoMarkup() {',
    '    for (const selector of [\'.mar-med-row[data-med="Sample Medication"]\',\'#notesListContainer .note-item-card\',\'#followupModal .modal-body > div:not(:first-child)\']) {',
    '      document.querySelectorAll(selector).forEach(node => node.remove());',
    '    }',
    "    const overdue=$('#overdueMedListPopup'); if(overdue) overdue.textContent='No live overdue-medication data loaded yet.';",
    '  }',
    '',
  ].join('\n');
  replaceRequired(cleanAnchor, `${helpers}\n`, 'cleanText');

  const patientNamePattern = /  function patientName\(\) \{[\s\S]*?\n  \}\n\n  function calcAge/;
  if (!patientNamePattern.test(html)) throw new Error('SPIRE master patientName anchor was not found');
  html = html.replace(patientNamePattern, [
    '  function patientName() {',
    '    const s = state.storyboard || {};',
    "    const identity = readAdmissionSection('demographics_identity');",
    '    return firstText(',
    '      s.displayName, s.name, s.preferredName,',
    "      [s.firstName,s.middleName,s.lastName].filter(Boolean).join(' '),",
    '      identity.preferredName,',
    "      [identity.firstName,identity.middleName,identity.lastName].filter(Boolean).join(' ')",
    "    ) || 'Client';",
    '  }',
    '',
    '  function calcAge',
  ].join('\n'));

  replaceRequired(
    "    const guardian = readAdmissionSection('legal_decision_maker');",
    "    const identity = readAdmissionSection('demographics_identity');\n    const guardian = readAdmissionSection('legal_decision_maker');",
    'patient identity section',
  );
  replaceRequired(
    "    const baseline = readAdmissionSection('baseline_vitals');",
    "    const baseline = readAdmissionSection('baseline_vitals');\n    const providers = readAdmissionSection('providers_appointments');\n    const infection = readAdmissionSection('infection_control');",
    'patient clinical section',
  );

  replaceRequired(
    "    setText('displayGender', s.sexAtBirth || s.genderIdentity || '—');\n    setText('displayAge', calcAge(s.dateOfBirth));\n    setText('displayDOB', s.dateOfBirth ? fmtDate(s.dateOfBirth) : '—');\n    setText('displayMRN', s.medicalRecordNumber || s.mrn || '—');\n    setText('displayBed', s.homeName || s.locationName || residential.serviceHome || s.programName || '—');",
    "    const dob = firstText(s.dateOfBirth, identity.dateOfBirth);\n    setText('displayGender', firstText(s.sexAtBirth, s.genderIdentity, identity.sexAtBirth, identity.genderIdentity) || '—');\n    setText('displayAge', calcAge(dob));\n    setText('displayDOB', dob ? fmtDate(dob) : '—');\n    setText('displayMRN', firstText(s.medicalRecordNumber, s.mrn, identity.medicalRecordNumber) || '—');\n    setText('displayBed', firstText(humanLabel(s.homeName), humanLabel(s.locationName), residential.serviceHome, humanLabel(s.programName)) || '—');",
    'sidebar identity fields',
  );

  const pcpPattern = /    const pcp = team\.find\(x => \/primary\|pcp\/i\.test\(`\$\{x\.role\|\|''\} \$\{x\.specialty\|\|''\}`\)\) \|\| team\[0\] \|\| \{\};\n    setText\('displayPCP',[^\n]+\);/;
  if (!pcpPattern.test(html)) throw new Error('SPIRE master PCP anchor was not found');
  html = html.replace(pcpPattern,
    "    const pcp = team.find(x => /primary|pcp/i.test(String(x.roleLabel||x.role||'')+' '+String(x.specialty||''))) || team[0] || {};\n    setText('displayPCP', firstText(providers.primaryCare, pcp.displayName, pcp.name, pcp.roleLabel) || '—');"
  );

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

  replaceRequired(
    "  function renderFlowsheet(host) {\n    const data = state.flowsheet || {};\n    const rows = asArray(data.rows);",
    "  function renderFlowsheet(host) {\n    const data = state.flowsheet || {};\n    const rows = asArray(data.rows);\n    if (!rows.length) {\n      host.innerHTML='<div class=\"spire-error\"><b>Flowsheet configuration is unavailable.</b><br>The live API returned no active flowsheet rows for this organization. No browser-generated rows will be fabricated.<div style=\"margin-top:8px\"><button class=\"spire-action\" type=\"button\" data-flow-retry>Retry</button></div></div>';\n      host.querySelector('[data-flow-retry]')?.addEventListener('click',()=>loadFlowsheetsView());\n      return;\n    }",
    'flowsheet render',
  );

  html = html.replace(
    "<span style=\"margin-left:auto\" class=\"spire-pill\">${esc(viewer.displayName||viewer.userId||'Current user')}</span>",
    "<span style=\"margin-left:auto\" class=\"spire-pill\">${esc(state.user?.displayName||state.user?.name||state.user?.email||viewer.displayName||viewer.userId||'Current user')}</span>",
  );
  html = html.replaceAll("new Date(column).toLocaleDateString()", "new Date(column).toLocaleDateString('en-US')");

  replaceRequired(
    "  async function bootstrap() {\n    if(!requireSession())return;",
    "  async function bootstrap() {\n    if(!requireSession())return;\n    clearStaticDemoMarkup();",
    'bootstrap',
  );
}

if (!html.includes(marker)) throw new Error('SPIRE master defect-fix marker was not installed');
await writeFile(target, html, 'utf8');
console.log('SPIRE standalone master defect fixes installed: read-only styling, identity fallbacks, schema normalization, deterministic US dates, authenticated viewer identity, empty-flowsheet error state, and demo-markup cleanup.');
