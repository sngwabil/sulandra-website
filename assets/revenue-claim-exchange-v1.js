(() => {
  'use strict';
  // SPIRE_REVENUE_CLAIM_EXCHANGE_RUNTIME_V1
  const API = window.SULANDRA_API_BASE || 'https://sulandra-website-production-5fc4.up.railway.app';
  const TOKEN_KEYS = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const ENTITY_KEY = 'sulandra:selected-legal-entity-id';
  const $ = (id) => document.getElementById(id);
  const token = () => TOKEN_KEYS.map((key) => sessionStorage.getItem(key) || localStorage.getItem(key)).find(Boolean) || '';
  const entity = () => sessionStorage.getItem(ENTITY_KEY) || localStorage.getItem(ENTITY_KEY) || '';
  const output = (id, value) => { const node = $(id); if (node) node.textContent = JSON.stringify(value, null, 2); };
  const message = (id, text, error = false) => { const node = $(id); if (!node) return; node.textContent = text; node.classList.toggle('error', error); node.classList.add('show'); };
  const requestHeaders = (json = false) => ({
    Accept: 'application/json',
    ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    ...(entity() ? { 'x-legal-entity-id': entity() } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });
  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      headers: { ...requestHeaders(Boolean(options.body)), ...(options.headers || {}) },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.error || payload?.message || `Request failed (${response.status})`);
      error.details = payload?.error?.details || payload?.details || payload;
      throw error;
    }
    return payload?.data ?? payload;
  }
  async function refresh() {
    try {
      const [status, profiles, workflows, submissions] = await Promise.all([
        api('/api/revenue-cycle/exchange/status'),
        api('/api/revenue-cycle/trading-profiles'),
        api('/api/revenue-cycle/external-workflows'),
        api('/api/revenue-cycle/x12-submissions'),
      ]);
      output('statusOutput', status);
      output('profilesOutput', profiles);
      output('workflowOutput', workflows);
      output('submissionsOutput', submissions);
      const stats = $('stats');
      if (stats) stats.innerHTML = `<div class="stat"><span>Mode</span><strong>${status.mode || '—'}</strong></div><div class="stat"><span>Direct Submit</span><strong>${status.directElectronicSubmissionConfigured ? 'Configured' : 'Disabled'}</strong></div><div class="stat"><span>837 Candidates</span><strong>837P / 837I</strong></div><div class="stat"><span>835</span><strong>Reconciliation enabled</strong></div>`;
    } catch (error) { output('statusOutput', { error: error.message, details: error.details || null }); }
  }
  async function downloadEdi() {
    try {
      const id = $('submissionId')?.value.trim();
      if (!id) throw new Error('Submission ID is required.');
      const response = await fetch(`${API}/api/revenue-cycle/x12-submissions/${encodeURIComponent(id)}/file.edi`, {
        headers: requestHeaders(false), cache: 'no-store',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || payload?.error || payload?.message || `Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const disposition = response.headers.get('Content-Disposition') || '';
      anchor.href = url;
      anchor.download = disposition.match(/filename="([^"]+)"/)?.[1] || `claim-${id}.edi`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('submissionMessage', 'Protected EDI candidate downloaded with your authenticated SPIRE session. No electronic payer/state submission occurred.');
    } catch (error) { message('submissionMessage', error.message, true); }
  }
  function jsonFrom(id, fallback = {}) { try { return JSON.parse($(id)?.value || JSON.stringify(fallback)); } catch { throw new Error(`${id} must contain valid JSON.`); } }
  function wire() {
    $('refresh')?.addEventListener('click', refresh);
    $('createProfile')?.addEventListener('click', async () => {
      try {
        const data = await api('/api/revenue-cycle/trading-profiles', { method: 'POST', body: JSON.stringify({
          profileCode: $('profileCode').value.trim(), name: $('profileName').value.trim(), channelType: $('channel').value,
          environment: $('environment').value, claimFormat: $('claimFormat').value, transportMode: $('transport').value,
          submitterId: $('submitterId').value.trim() || null, receiverId: $('receiverId').value.trim() || null,
          payerId: $('payerId').value.trim() || null, companionGuideVersion: $('guideVersion').value.trim() || null,
          externalVerificationStatus: 'NOT_CONFIGURED', productionEnabled: false, config: jsonFrom('profileConfig'), verificationEvidence: {},
        }) });
        $('profileId').value = data.id;
        message('profileMessage', `Created ${data.profileCode} v${data.version}. Production transport remains disabled.`);
        await refresh();
      } catch (error) { message('profileMessage', error.message, true); }
    });
    $('preview')?.addEventListener('click', async () => {
      try {
        const batch = $('batchId').value.trim(), profile = $('profileId').value.trim();
        if (!batch || !profile) throw new Error('Batch ID and profile version ID are required.');
        const data = await api(`/api/revenue-cycle/batches/${encodeURIComponent(batch)}/x12-preview?profileVersionId=${encodeURIComponent(profile)}&claimFormat=${encodeURIComponent($('format').value)}`);
        output('submissionOutput', data);
        message('submissionMessage', data.errors?.length ? `Preview blocked by ${data.errors.length} error(s).` : 'Candidate preview built. Nothing was submitted.', Boolean(data.errors?.length));
      } catch (error) { message('submissionMessage', error.message, true); output('submissionOutput', { error: error.message, details: error.details || null }); }
    });
    $('generate')?.addEventListener('click', async () => {
      try {
        const batch = $('batchId').value.trim(), profile = $('profileId').value.trim();
        if (!batch || !profile) throw new Error('Batch ID and profile version ID are required.');
        const data = await api(`/api/revenue-cycle/batches/${encodeURIComponent(batch)}/x12-submissions`, { method: 'POST', body: JSON.stringify({ profileVersionId: profile, claimFormat: $('format').value }) });
        $('submissionId').value = data.id;
        output('submissionOutput', data);
        message('submissionMessage', 'X12 candidate stored with immutable generation evidence. No electronic submission occurred.');
        await refresh();
      } catch (error) { message('submissionMessage', error.message, true); output('submissionOutput', { error: error.message, details: error.details || null }); }
    });
    $('download')?.addEventListener('click', downloadEdi);
    $('loadSubmission')?.addEventListener('click', async () => {
      try { const id = $('submissionId').value.trim(); if (!id) throw new Error('Submission ID is required.'); output('submissionOutput', await api(`/api/revenue-cycle/x12-submissions/${encodeURIComponent(id)}`)); }
      catch (error) { message('submissionMessage', error.message, true); }
    });
    $('handoff')?.addEventListener('click', async () => {
      try {
        const id = $('submissionId').value.trim(), externalReference = $('externalReference').value.trim();
        if (!id || !externalReference) throw new Error('Submission ID and external reference are required.');
        const data = await api(`/api/revenue-cycle/x12-submissions/${encodeURIComponent(id)}/handoff`, { method: 'POST', body: JSON.stringify({ externalReference, note: $('handoffNote').value.trim() || null, evidence: { recordedFrom: 'SPIRE_REVENUE_CLAIM_EXCHANGE_V1' } }) });
        output('submissionOutput', data); message('submissionMessage', 'External handoff recorded. SPIRE did not transmit the file itself.'); await refresh();
      } catch (error) { message('submissionMessage', error.message, true); }
    });
    $('recordAck')?.addEventListener('click', async () => {
      try {
        const id = $('submissionId').value.trim(); if (!id) throw new Error('Submission ID is required.');
        const data = await api(`/api/revenue-cycle/x12-submissions/${encodeURIComponent(id)}/acknowledgements`, { method: 'POST', body: JSON.stringify({ acknowledgementType: $('ackType').value, status: $('ackStatus').value, externalReference: $('externalReference').value.trim() || null, rawPayload: $('ackRaw').value || null, details: { recordedFrom: 'SPIRE_REVENUE_CLAIM_EXCHANGE_V1' } }) });
        output('ackOutput', data); message('ackMessage', 'External acknowledgement recorded in append-only exchange history.'); await refresh();
      } catch (error) { message('ackMessage', error.message, true); output('ackOutput', { error: error.message, details: error.details || null }); }
    });
    $('reconcile835')?.addEventListener('click', async () => {
      try {
        const id = $('submissionId').value.trim(), rawPayload = $('raw835').value.trim(); if (!id || !rawPayload) throw new Error('Submission ID and raw 835 are required.');
        const data = await api(`/api/revenue-cycle/x12-submissions/${encodeURIComponent(id)}/remittance-835`, { method: 'POST', body: JSON.stringify({ rawPayload }) });
        output('ackOutput', data); message('ackMessage', data.status === 'RECONCILED' ? '835 matched all SPIRE claim-control numbers.' : '835 recorded with unmatched claim-control numbers requiring review.', data.status !== 'RECONCILED'); await refresh();
      } catch (error) { message('ackMessage', error.message, true); output('ackOutput', { error: error.message, details: error.details || null }); }
    });
    $('createWorkflow')?.addEventListener('click', async () => {
      try {
        const data = await api('/api/revenue-cycle/external-workflows', { method: 'POST', body: JSON.stringify({ workflowType: $('workflowType').value, subjectType: $('subjectType').value, subjectId: $('subjectId').value.trim() || null, externalReference: $('workflowRef').value.trim() || null, evidence: { createdFrom: 'SPIRE_REVENUE_CLAIM_EXCHANGE_V1' } }) });
        $('workflowId').value = data.id; message('workflowMessage', 'External workflow created. Verification remains manual evidence.'); await refresh();
      } catch (error) { message('workflowMessage', error.message, true); }
    });
    $('updateWorkflow')?.addEventListener('click', async () => {
      try {
        const id = $('workflowId').value.trim(); if (!id) throw new Error('Workflow ID is required.');
        const data = await api(`/api/revenue-cycle/external-workflows/${encodeURIComponent(id)}/events`, { method: 'POST', body: JSON.stringify({ status: $('workflowStatus').value, externalReference: $('workflowRef').value.trim() || null, note: $('workflowNote').value.trim() || null, evidence: jsonFrom('workflowEvidence') }) });
        output('workflowOutput', data); message('workflowMessage', 'Workflow evidence/status recorded with append-only event history.'); await refresh();
      } catch (error) { message('workflowMessage', error.message, true); }
    });
  }
  window.addEventListener('sulandra:entity-context-changed', refresh);
  (async () => {
    if (!token()) { location.href = '/employee-login.html?returnTo=' + encodeURIComponent(location.pathname); return; }
    await window.SulandraEntityContext?.ready;
    wire();
    await refresh();
  })();
})();
