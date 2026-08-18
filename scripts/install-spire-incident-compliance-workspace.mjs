import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'spire','master.html');
let source=await readFile(target,'utf8');
const marker='SPIRE_PHASE_C_INCIDENT_COMPLIANCE_LINK_V1';
if(!source.includes(marker)){
  const header=`<div class="spire-section-title"><div><h3>Incidents / UI / MUI Follow-Up</h3><p>Incident records, reportability, open follow-ups and corrective actions.</p></div><button class="spire-action primary" id="newIncidentBtn" type="button">New Incident</button></div>`;
  const replacement=`<!-- ${marker} --><div class="spire-section-title"><div><h3>Incidents / UI / MUI Follow-Up</h3><p>Incident records, Ohio reportability, deadlines, open follow-ups and corrective actions.</p></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="spire-action" id="incidentComplianceBtn" type="button">Ohio UI / MUI Compliance</button><button class="spire-action primary" id="newIncidentBtn" type="button">New Incident</button></div></div>`;
  if(!source.includes(header))throw new Error('Unable to locate existing Incidents tab header for Ohio compliance link');
  source=source.replace(header,replacement);
  const listener=`    $('#newIncidentBtn',host)?.addEventListener('click',openNewIncident);`;
  if(!source.includes(listener))throw new Error('Unable to locate existing New Incident listener for Ohio compliance link');
  source=source.replace(listener,`${listener}\n    $('#incidentComplianceBtn',host)?.addEventListener('click',()=>{\n      if(!state.patientId)return alert('Select a client first.');\n      window.open('/spire-incident-compliance.html?patientId='+encodeURIComponent(state.patientId),'_blank','noopener');\n    });`);
  await writeFile(target,source,'utf8');
}
console.log('Existing SPIRE Incidents tab now opens the Ohio UI/MUI compliance workbench without replacing the incident workflow.');
