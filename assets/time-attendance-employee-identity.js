(() => {
  'use strict';
  if (!/\/time-attendance(?:\.html|\/)?$/i.test(location.pathname)) return;

  const sessionKeys = ['sulandra:employee:session','sulandraSession','employeeSession','session','authSession'];
  const stores = [sessionStorage, localStorage];
  const readSession = () => {
    for (const store of stores) {
      for (const key of sessionKeys) {
        try {
          const value = JSON.parse(store.getItem(key) || 'null');
          if (value) return value;
        } catch {}
      }
    }
    return {};
  };
  const valueAt = (object, paths) => {
    for (const path of paths) {
      let value = object;
      for (const part of path.split('.')) value = value?.[part];
      if (typeof value === 'string' && value.trim() && !value.includes('@')) return value.trim();
    }
    return '';
  };

  const session = readSession();
  const employeeName = valueAt(session, [
    'displayName','fullName','name','employeeName','user.displayName','user.fullName','user.name',
    'employee.displayName','employee.fullName','profile.displayName','profile.fullName'
  ]);
  const employeeId = String(session.userId || session.employeeId || session.user?.id || session.employee?.id || '');
  const email = String(session.email || session.user?.email || session.employee?.email || '').toLowerCase();

  window.SulandraEmployeeIdentity = { employeeName, employeeId, email };

  let applying = false;
  const setTextIfChanged = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };

  const apply = () => {
    if (applying || !employeeName) return;
    applying = true;
    try {
      const navigatorName = document.getElementById('employeeName');
      if (navigatorName && (!navigatorName.textContent.trim() || navigatorName.textContent.includes('@') || navigatorName.textContent === 'Employee')) {
        setTextIfChanged(navigatorName, employeeName);
      }

      const userLabel = document.getElementById('userLabel');
      if (userLabel) {
        const current = userLabel.textContent || '';
        const suffix = current.includes('·') ? ` · ${current.split('·').slice(1).join('·').trim()}` : '';
        setTextIfChanged(userLabel, employeeName + suffix);
      }

      document.querySelectorAll('#locationScheduleGrid tbody tr').forEach(row => {
        const heading = row.querySelector('th');
        if (!heading) return;
        const rowEmployeeId = row.querySelector('[data-employee]')?.dataset.employee || '';
        const headingText = heading.textContent.toLowerCase();
        const isCurrentEmployee = (employeeId && rowEmployeeId === employeeId) || (email && headingText.includes(email));
        if (isCurrentEmployee) {
          if (heading.textContent.trim() !== employeeName || heading.children.length) {
            heading.replaceChildren(document.createTextNode(employeeName));
          }
        } else {
          heading.querySelectorAll('small').forEach(node => node.remove());
        }
      });
    } finally {
      applying = false;
    }
  };

  const style = document.createElement('style');
  style.textContent = '#locationScheduleGrid tbody th small{display:none!important}';
  document.head.appendChild(style);

  let queued = false;
  const queueApply = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  };

  apply();
  const observer = new MutationObserver((mutations) => {
    if (mutations.some(mutation => mutation.addedNodes.length || mutation.removedNodes.length)) queueApply();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();