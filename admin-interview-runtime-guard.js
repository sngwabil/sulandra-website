(function () {
  "use strict";

  function isObsoleteInterviewShortcut(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (node.matches("[data-interview-id]")) return true;
    if (!node.matches("button, a, [role='button']")) return false;
    return node.textContent.trim().replace(/\s+/g, " ").toLowerCase() === "schedule interview";
  }

  function removeObsoleteInterviewShortcuts(root) {
    const scope = root instanceof Element || root instanceof Document ? root : document;
    if (scope instanceof Element && isObsoleteInterviewShortcut(scope)) scope.remove();
    scope.querySelectorAll("[data-interview-id], button, a, [role='button']").forEach(function (node) {
      if (isObsoleteInterviewShortcut(node)) node.remove();
    });
  }

  removeObsoleteInterviewShortcuts(document);

  const observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeType === Node.ELEMENT_NODE) removeObsoleteInterviewShortcuts(node);
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("pageshow", function () {
    removeObsoleteInterviewShortcuts(document);
  });

  window.addEventListener("sulandra:admin-enhancements-loaded", function () {
    removeObsoleteInterviewShortcuts(document);
  });
})();
