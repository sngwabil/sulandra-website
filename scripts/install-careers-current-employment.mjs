import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'applydsp.html','applylpn.html','applygeneral.html','applydoo.html','applydriver.html',
  'services/community-living/applydsp.html',
];

async function patchDsp(file) {
  let html = await readFile(file, 'utf8');
  if (!html.includes('id="lastEndDate"')) return html;

  if (!html.includes('id="currentEmployment"')) {
    html = html.replace(
`              <div>
                <label class="required" for="lastEndDate">End date</label>
                <input id="lastEndDate" name="lastEndDate" type="date" required />
                <div class="error" id="err-lastEndDate">Please enter end date.</div>
              </div>`,
`              <div>
                <label for="lastEndDate">End date <span style="font-weight:500;text-transform:none;color:var(--muted)">(optional if currently employed)</span></label>
                <input id="lastEndDate" name="lastEndDate" type="date" />
                <div class="error" id="err-lastEndDate">Enter an end date or select “I currently work here.”</div>
                <div class="checkboxline" style="margin-top:9px"><input id="currentEmployment" name="currentEmployment" type="checkbox" value="yes"><span>I currently work here / I am not leaving this job.</span></div>
              </div>`,
    );
    html = html.replace(
`            <div style="margin-top:16px;">
              <label class="required" for="leaveReason">Reason for leaving</label>
              <textarea id="leaveReason" name="leaveReason" required placeholder="Brief explanation"></textarea>
              <div class="error" id="err-leaveReason">Please provide a reason for leaving.</div>
            </div>`,
`            <div style="margin-top:16px;">
              <label for="leaveReason">Reason for leaving <span style="font-weight:500;text-transform:none;color:var(--muted)">(N/A if remaining employed)</span></label>
              <textarea id="leaveReason" name="leaveReason" placeholder="Brief explanation or N/A — still employed"></textarea>
              <div class="error" id="err-leaveReason">Provide a reason for leaving or select “I currently work here.”</div>
            </div>
            <div id="currentEmploymentDisclaimer" style="display:none;margin-top:12px;padding:13px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc">
              <div class="checkboxline" style="margin:0"><input id="currentEmploymentNoConflict" name="currentEmploymentNoConflict" type="checkbox" value="yes"><span>I confirm that keeping my current job will not interfere with the schedule, attendance, availability, safety, confidentiality, or services required for the Sulandra position I am seeking.</span></div>
              <div class="error" id="err-currentEmploymentNoConflict">This acknowledgement is required when you are keeping your current job.</div>
            </div>`,
    );
  }

  html = html.replace("'#lastEmployer','#lastJobTitle','#lastStartDate','#lastEndDate','#leaveReason','#contactPrevEmployer',", "'#lastEmployer','#lastJobTitle','#lastStartDate','#contactPrevEmployer',");
  html = html.replace(
`      if(!$('lastEndDate').value){ setError('err-lastEndDate', true); ok=false; }
      if(!$('leaveReason').value.trim()){ setError('err-leaveReason', true); ok=false; }`,
`      const currentEmployment = $('currentEmployment')?.checked;
      if(!currentEmployment && !$('lastEndDate').value){ setError('err-lastEndDate', true); ok=false; }
      if(!currentEmployment && !$('leaveReason').value.trim()){ setError('err-leaveReason', true); ok=false; }
      if(currentEmployment && !$('currentEmploymentNoConflict')?.checked){ setError('err-currentEmploymentNoConflict', true); ok=false; }`,
  );
  html = html.replace(
`        'err-lastEmployer','err-lastJobTitle','err-lastStartDate','err-lastEndDate','err-leaveReason','err-contactPrevEmployer',`,
`        'err-lastEmployer','err-lastJobTitle','err-lastStartDate','err-lastEndDate','err-leaveReason','err-currentEmploymentNoConflict','err-contactPrevEmployer',`,
  );
  if (!html.includes('CAREERS_CURRENT_EMPLOYMENT_DSP_V2')) {
    html = html.replace(
`    $('appForm').addEventListener('submit', async (e) => {`,
`    /* CAREERS_CURRENT_EMPLOYMENT_DSP_V2 */
    function syncCurrentEmployment(){
      const current = $('currentEmployment')?.checked;
      const end = $('lastEndDate');
      const reason = $('leaveReason');
      const box = $('currentEmploymentDisclaimer');
      if(end){ end.disabled = !!current; if(current) end.value=''; }
      if(reason && current && !reason.value.trim()) reason.value='N/A — still employed / not leaving current job';
      if(box) box.style.display=current?'block':'none';
      if(!current) setError('err-currentEmploymentNoConflict', false);
      updateProgress(); scheduleAutosave();
    }
    $('currentEmployment')?.addEventListener('change', syncCurrentEmployment);
    syncCurrentEmployment();

    $('appForm').addEventListener('submit', async (e) => {`,
    );
  }
  return html;
}

async function patchLpn(file) {
  let html = await readFile(file, 'utf8');
  if (!html.includes('function makeExpCard(data = {})')) return html;
  if (!html.includes('CAREERS_CURRENT_EMPLOYMENT_LPN_V2')) {
    html = html.replace(
`            <label class="required" for="exp_end_\${idx}">End date</label>
            <input id="exp_end_\${idx}" name="exp_end_\${idx}" type="date" required value="\${escapeHtml(data.end || "")}">
            <div class="error" id="err-exp_end_\${idx}">End date is required.</div>`,
`            <label for="exp_end_\${idx}">End date <span style="font-weight:500;text-transform:none;color:var(--muted)">(optional if current)</span></label>
            <input id="exp_end_\${idx}" name="exp_end_\${idx}" type="date" value="\${escapeHtml(data.end || "")}">
            <div class="error" id="err-exp_end_\${idx}">Enter an end date or select current employment.</div>
            <div class="checkboxline" style="margin-top:8px"><input id="exp_current_\${idx}" name="exp_current_\${idx}" type="checkbox" value="yes" \${data.current ? 'checked' : ''}><span>I currently work here / I am not leaving this job.</span></div>`,
    );
    html = html.replace(
`          <label class="required" for="exp_reason_\${idx}">Reason for leaving</label>
          <textarea id="exp_reason_\${idx}" name="exp_reason_\${idx}" required placeholder="`,
`          <label for="exp_reason_\${idx}">Reason for leaving (N/A if remaining employed)</label>
          <textarea id="exp_reason_\${idx}" name="exp_reason_\${idx}" placeholder="`,
    );
    const cardReturn = '      return wrap;';
    const enhancer = `      /* CAREERS_CURRENT_EMPLOYMENT_LPN_V2 */
      const currentBox = wrap.querySelector('#exp_current_'+idx);
      if(currentBox){
        const disclaimer = document.createElement('label');
        disclaimer.className='checkboxline';
        disclaimer.style.cssText='margin-top:12px;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc';
        disclaimer.innerHTML='<input id="exp_noConflict_'+idx+'" name="exp_noConflict_'+idx+'" type="checkbox" value="yes"><span>I confirm that keeping this current job will not interfere with the schedule, attendance, availability, safety, confidentiality, or services required for the Sulandra position I am seeking.</span>';
        wrap.appendChild(disclaimer);
        const conflict = disclaimer.querySelector('input');
        if(data.noConflict) conflict.checked=true;
        const sync=()=>{const active=currentBox.checked;const end=$('exp_end_'+idx),reason=$('exp_reason_'+idx);disclaimer.style.display=active?'flex':'none';if(end){end.disabled=active;if(active)end.value='';}if(reason&&active&&!reason.value.trim())reason.value='N/A — still employed / not leaving current job';};
        currentBox.addEventListener('change',sync);sync();
      }
`;
    html = html.replace(cardReturn, enhancer + cardReturn);
    html = html.replace(
`        const end = $(\`exp_end_\${idx}\`)?.value;
        const reason = $(\`exp_reason_\${idx}\`)?.value.trim();
        const contactOk = $(\`exp_contactOk_\${idx}\`)?.value;
        if (employer && title && start && end && reason && contactOk) completeCount++;`,
`        const end = $(\`exp_end_\${idx}\`)?.value;
        const current = $(\`exp_current_\${idx}\`)?.checked;
        const noConflict = $(\`exp_noConflict_\${idx}\`)?.checked;
        const reason = $(\`exp_reason_\${idx}\`)?.value.trim();
        const contactOk = $(\`exp_contactOk_\${idx}\`)?.value;
        const datesOk = current ? noConflict : Boolean(end && reason);
        if (employer && title && start && datesOk && contactOk) completeCount++;`,
    );
    html = html.replace(
`          end: $(\`exp_end_\${idx}\`)?.value || "",
          reason: $(\`exp_reason_\${idx}\`)?.value || "",`,
`          end: $(\`exp_end_\${idx}\`)?.value || "",
          current: !!$(\`exp_current_\${idx}\`)?.checked,
          noConflict: !!$(\`exp_noConflict_\${idx}\`)?.checked,
          reason: $(\`exp_reason_\${idx}\`)?.value || "",`,
    );
  }
  return html;
}

function genericEnhancement(html) {
  if (html.includes('CAREERS_CURRENT_EMPLOYMENT_GENERIC_V2')) return html;
  if (!/End date/i.test(html)) return html;
  const script = `\n<script>/* CAREERS_CURRENT_EMPLOYMENT_GENERIC_V2 */\n(function(){function enhance(){document.querySelectorAll('input[type="date"]').forEach(function(end){var label=document.querySelector('label[for="'+CSS.escape(end.id||'')+'"]');if(!label||!/end date/i.test(label.textContent)||end.dataset.currentEnhanced)return;end.dataset.currentEnhanced='1';end.required=false;label.classList.remove('required');var host=end.parentElement;if(!host)return;var row=document.createElement('label');row.style.cssText='display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:13px;text-transform:none;color:#334155';var current=document.createElement('input');current.type='checkbox';current.name=(end.name||end.id||'employment')+'_current';current.value='yes';current.style.width='auto';var text=document.createElement('span');text.textContent='I currently work here / I am not leaving this job.';row.append(current,text);host.appendChild(row);var disclaimer=document.createElement('label');disclaimer.style.cssText='display:none;gap:8px;align-items:flex-start;margin-top:8px;padding:10px;border:1px solid #cbd5e1;border-radius:9px;background:#f8fafc;font-size:12px;text-transform:none;color:#334155';var ack=document.createElement('input');ack.type='checkbox';ack.name=(end.name||end.id||'employment')+'_noConflict';ack.value='yes';ack.style.width='auto';var ackText=document.createElement('span');ackText.textContent='I confirm that keeping my current job will not interfere with the schedule, attendance, availability, safety, confidentiality, or services required for the Sulandra position I am seeking.';disclaimer.append(ack,ackText);host.appendChild(disclaimer);current.addEventListener('change',function(){if(current.checked){end.value='';end.disabled=true;ack.required=true;disclaimer.style.display='flex'}else{end.disabled=false;ack.required=false;ack.checked=false;disclaimer.style.display='none'}});});}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();})();\n</script>`;
  return html.replace('</body>', script + '\n</body>');
}

for (const relative of targets) {
  const file = path.join(root, relative);
  try {
    let html = await readFile(file, 'utf8');
    html = await patchDsp(file);
    await writeFile(file, html, 'utf8');
    html = await patchLpn(file);
    html = genericEnhancement(html);
    await writeFile(file, html, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

console.log('Career applications updated: employment end dates are optional for current jobs, current-job status is recorded, and applicants must acknowledge that a retained job will not interfere with Sulandra work.');
