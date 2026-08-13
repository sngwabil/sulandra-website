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

  const accessOpenPattern = /  function openAccessibilityModal\(\)\{[\s\S]*?\n  \}\n  window\.openAccessibilityModal=openAccessibilityModal;/;
  if (!accessOpenPattern.test(html)) throw new Error('SPIRE master accessibility modal runtime anchor was not found');
  html = html.replace(accessOpenPattern, `  function openAccessibilityModal(){
    const modal=$('#accessibilityModal');
    if(!modal)return;
    const name=state.user?.displayName||state.user?.name||state.user?.email||'User Profile';
    const role=state.user?.role||state.user?.credentials||'';
    modal.style.display='flex';
    const nameInput=$('#inputClinicianName',modal); if(nameInput) nameInput.value=name;
    const credentialInput=$('#inputClinicianCredentials',modal); if(credentialInput) credentialInput.value=role;
    const avatar=$('#modalUserAvatarPreview',modal); if(avatar) avatar.textContent=initialFromName(name);
  }
  window.openAccessibilityModal=openAccessibilityModal;`);

  const closeAnchor = "  function closeAccessibilityModal(){const modal=$('#accessibilityModal');if(modal)modal.style.display='none'}\n  window.closeAccessibilityModal=closeAccessibilityModal;";
  if (!html.includes(closeAnchor)) throw new Error('SPIRE master accessibility close anchor was not found');
  const themeRuntime = `${closeAnchor}
  function switchAccessTab(tabName) {
    const map={profile:'accessProfileTab',presets:'accessPresetsTab',custom:'accessCustomTab',cursor:'accessCursorTab'};
    const buttons={profile:'tabProfileBtn',presets:'tabPresetBtn',custom:'tabCustomBtn',cursor:'tabCursorBtn'};
    Object.entries(map).forEach(([key,id])=>{const node=document.getElementById(id);if(node)node.style.display=key===tabName?'block':'none';});
    Object.entries(buttons).forEach(([key,id])=>{const node=document.getElementById(id);if(node)node.classList.toggle('active',key===tabName);});
  }
  window.switchAccessTab=switchAccessTab;

  function applyPresetTheme(themeName) {
    const root = document.documentElement;
    if (themeName === 'classicRed') {
        root.style.setProperty('--title-bg', 'linear-gradient(135deg, #050811 0%, #0f172a 100%)');
        root.style.setProperty('--toolbar-bg', '#990000');
        root.style.setProperty('--main-bg', '#f0f4f8');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#000000');
    } else if (themeName === 'clinicalDark') {
        root.style.setProperty('--title-bg', '#020617');
        root.style.setProperty('--toolbar-bg', '#1e293b');
        root.style.setProperty('--main-bg', '#0f172a');
        root.style.setProperty('--workspace-card-bg', '#1e293b');
        root.style.setProperty('--text-color', '#f8fafc');
    } else if (themeName === 'midnightSlate') {
        root.style.setProperty('--title-bg', '#1e293b');
        root.style.setProperty('--toolbar-bg', '#334155');
        root.style.setProperty('--main-bg', '#475569');
        root.style.setProperty('--workspace-card-bg', '#1e293b');
        root.style.setProperty('--text-color', '#f1f5f9');
    } else if (themeName === 'emeraldHealth') {
        root.style.setProperty('--title-bg', '#064e3b');
        root.style.setProperty('--toolbar-bg', '#047857');
        root.style.setProperty('--main-bg', '#ecfdf5');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#064e3b');
    } else if (themeName === 'oceanBlue') {
        root.style.setProperty('--title-bg', '#1e40af');
        root.style.setProperty('--toolbar-bg', '#2563eb');
        root.style.setProperty('--main-bg', '#eff6ff');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#1e3a8a');
    } else if (themeName === 'warmSepia') {
        root.style.setProperty('--title-bg', '#78350f');
        root.style.setProperty('--toolbar-bg', '#b45309');
        root.style.setProperty('--main-bg', '#fef3c7');
        root.style.setProperty('--workspace-card-bg', '#fffbeb');
        root.style.setProperty('--text-color', '#451a03');
    } else if (themeName === 'epicTeal') {
        root.style.setProperty('--title-bg', '#0f766e');
        root.style.setProperty('--toolbar-bg', '#115e59');
        root.style.setProperty('--main-bg', '#f0fdfa');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#134e4a');
    } else if (themeName === 'monoHighContrast') {
        root.style.setProperty('--title-bg', '#000000');
        root.style.setProperty('--toolbar-bg', '#333333');
        root.style.setProperty('--main-bg', '#ffffff');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#000000');
    } else if (themeName === 'colorblindSafe') {
        root.style.setProperty('--title-bg', '#1d4ed8');
        root.style.setProperty('--toolbar-bg', '#b45309');
        root.style.setProperty('--main-bg', '#fef9c3');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#1e293b');
    } else if (themeName === 'vibrantLavender') {
        root.style.setProperty('--title-bg', '#581c87');
        root.style.setProperty('--toolbar-bg', '#7e22ce');
        root.style.setProperty('--main-bg', '#f3e8ff');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#3b0764');
    } else if (themeName === 'crimsonNight') {
        root.style.setProperty('--title-bg', '#450a0a');
        root.style.setProperty('--toolbar-bg', '#7f1d1d');
        root.style.setProperty('--main-bg', '#1c1917');
        root.style.setProperty('--workspace-card-bg', '#292524');
        root.style.setProperty('--text-color', '#fef2f2');
    } else if (themeName === 'arcticFrost') {
        root.style.setProperty('--title-bg', '#0284c7');
        root.style.setProperty('--toolbar-bg', '#0369a1');
        root.style.setProperty('--main-bg', '#f0f9ff');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#0c4a6e');
    } else if (themeName === 'goldenSunrise') {
        root.style.setProperty('--title-bg', '#b45309');
        root.style.setProperty('--toolbar-bg', '#d97706');
        root.style.setProperty('--main-bg', '#fffbeb');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#78350f');
    } else if (themeName === 'cyberpunkNeon') {
        root.style.setProperty('--title-bg', '#31103f');
        root.style.setProperty('--toolbar-bg', '#4c1d95');
        root.style.setProperty('--main-bg', '#09090b');
        root.style.setProperty('--workspace-card-bg', '#18181b');
        root.style.setProperty('--text-color', '#38bdf8');
    } else if (themeName === 'retroVintage') {
        root.style.setProperty('--title-bg', '#365314');
        root.style.setProperty('--toolbar-bg', '#4d7c0f');
        root.style.setProperty('--main-bg', '#f7fee7');
        root.style.setProperty('--workspace-card-bg', '#ecfccb');
        root.style.setProperty('--text-color', '#1a2e05');
    } else if (themeName === 'steelGray') {
        root.style.setProperty('--title-bg', '#334155');
        root.style.setProperty('--toolbar-bg', '#475569');
        root.style.setProperty('--main-bg', '#e2e8f0');
        root.style.setProperty('--workspace-card-bg', '#f1f5f9');
        root.style.setProperty('--text-color', '#0f172a');
    } else if (themeName === 'coralSunset') {
        root.style.setProperty('--title-bg', '#9a3412');
        root.style.setProperty('--toolbar-bg', '#c2410c');
        root.style.setProperty('--main-bg', '#fff7ed');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#7c2d12');
    } else if (themeName === 'mintFresh') {
        root.style.setProperty('--title-bg', '#134e4a');
        root.style.setProperty('--toolbar-bg', '#0f766e');
        root.style.setProperty('--main-bg', '#f0fdfa');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#042f2e');
    } else if (themeName === 'royalAmethyst') {
        root.style.setProperty('--title-bg', '#3b0764');
        root.style.setProperty('--toolbar-bg', '#581c87');
        root.style.setProperty('--main-bg', '#faf5ff');
        root.style.setProperty('--workspace-card-bg', '#ffffff');
        root.style.setProperty('--text-color', '#4c1d95');
    } else if (themeName === 'solarizedLight') {
        root.style.setProperty('--title-bg', '#073642');
        root.style.setProperty('--toolbar-bg', '#268bd2');
        root.style.setProperty('--main-bg', '#eee8d5');
        root.style.setProperty('--workspace-card-bg', '#fdf6e3');
        root.style.setProperty('--text-color', '#657b83');
    }
    closeAccessibilityModal();
  }
  window.applyPresetTheme=applyPresetTheme;`;
  html = html.replace(closeAnchor, themeRuntime);

  const legacyApplyThemePattern = /  function applyTheme\(theme\)\{[\s\S]*?\n  \}\n/;
  if (legacyApplyThemePattern.test(html)) html = html.replace(legacyApplyThemePattern, '');

  replaceRequired(
    "  async function bootstrap() {\n    if(!requireSession())return;",
    "  async function bootstrap() {\n    if(!requireSession())return;\n    clearStaticDemoMarkup();",
    'bootstrap',
  );
}

if (!html.includes(marker)) throw new Error('SPIRE master defect-fix marker was not installed');
await writeFile(target, html, 'utf8');
console.log('SPIRE standalone master defect fixes installed: read-only styling, identity fallbacks, schema normalization, 20 preset accessibility themes, deterministic US dates, authenticated viewer identity, empty-flowsheet error state, and demo-markup cleanup.');
