(() => {
  'use strict';
  if (!/\/workforce-admin\.html$/i.test(location.pathname)) return;
  const CONTRACT = '20260810-business-uat-1';
  const API = 'https://sulandra-website-production-5fc4.up.railway.app';
  const keys = ['sulandra:employee:access-token','sulandra_token','token','accessToken'];
  const token = () => keys.map(k => sessionStorage.getItem(k) || localStorage.getItem(k)).find(Boolean) || '';

  function install() {
    const panel = document.getElementById('timesheets');
    const toolbar = panel?.querySelector('.toolbar');
    if (!toolbar || document.getElementById('payrollReadyExport')) return;
    const button = document.createElement('button');
    button.id = 'payrollReadyExport';
    button.className = 'btn primary';
    button.type = 'button';
    button.textContent = 'Export Payroll-Ready CSV';
    button.title = 'Export approved timesheet lines for payroll processing';
    button.dataset.businessUatContract = CONTRACT;
    toolbar.appendChild(button);

    const note = document.createElement('span');
    note.id = 'payrollReadyStatus';
    note.style.cssText = 'font-size:11px;font-weight:800;color:#587080;align-self:center';
    note.textContent = 'Approved timesheets are payroll-ready; export does not mark them paid.';
    toolbar.appendChild(note);

    button.addEventListener('click', async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Preparing Payroll…';
      try {
        const response = await fetch(`${API}/api/admin/workforce/payroll-export.csv?status=APPROVED`, {
          cache: 'no-store',
          headers: { Accept: 'text/csv', Authorization: `Bearer ${token()}` }
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || payload.message || `Payroll export failed (${response.status})`);
        }
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/i);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = match?.[1] || `sulandra-payroll-ready-${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        note.textContent = 'Payroll-ready export generated from APPROVED timesheets.';
        note.dataset.exported = 'true';
      } catch (error) {
        note.textContent = error.message || 'Payroll-ready export failed.';
        note.dataset.exported = 'false';
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
