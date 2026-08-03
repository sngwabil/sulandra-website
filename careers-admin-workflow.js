(function (global) {
  "use strict";

  const esc = (value) => String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const title = (value) => String(value || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

  function createClient(options) {
    const base = String(options.apiBase || "").replace(/\/$/, "");
    const getToken = typeof options.getToken === "function"
      ? options.getToken
      : () => options.token || "";

    async function raw(path, init = {}) {
      const token = await getToken();
      if (!token) throw new Error("Administrator sign-in is required.");
      const response = await fetch(base + path, {
        ...init,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          Authorization: "Bearer " + token,
          ...(init.headers || {})
        }
      });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    }

    async function request(path, init = {}) {
      const { response, payload } = await raw(path, init);
      if (!response.ok) {
        const error = new Error(payload.error || "The request could not be completed.");
        error.status = response.status;
        throw error;
      }
      return payload && Object.prototype.hasOwnProperty.call(payload, "data")
        ? payload.data
        : payload;
    }

    async function download(path, fileName) {
      const token = await getToken();
      if (!token) throw new Error("Administrator sign-in is required.");
      const response = await fetch(base + path, {
        cache: "no-store",
        headers: { Authorization: "Bearer " + token }
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "The document could not be downloaded.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName || "application-document";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }

    return { request, raw, download };
  }

  function installStyles() {
    if (document.getElementById("sulandra-careers-workflow-styles")) return;
    const style = document.createElement("style");
    style.id = "sulandra-careers-workflow-styles";
    style.textContent = `
      .scw{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102448;background:#fff;border:1px solid #dbe6f2;border-radius:22px;padding:24px;box-shadow:0 18px 50px rgba(16,36,72,.08)}
      .scw *{box-sizing:border-box}.scw h2,.scw h3,.scw p{margin-top:0}.scw-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:1px solid #dbe6f2;padding-bottom:18px}.scw-kicker{font-weight:800;font-size:12px;letter-spacing:.08em;color:#126aa4;text-transform:uppercase}.scw-name{font-size:28px;line-height:1.1;margin:6px 0}.scw-sub{color:#62738b;margin:0}.scw-ref{font-weight:800;color:#126aa4}.scw-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px}.scw-card{border:1px solid #dbe6f2;border-radius:18px;padding:18px;background:#fbfdff}.scw-card h3{font-size:18px;margin-bottom:14px}.scw-field{display:grid;gap:7px;margin-bottom:12px}.scw-field label{font-size:12px;font-weight:800;text-transform:uppercase;color:#52657d}.scw select,.scw input,.scw textarea{width:100%;border:1px solid #cbd9e8;border-radius:12px;padding:11px 12px;font:inherit;background:#fff;color:#102448}.scw textarea{min-height:86px;resize:vertical}.scw-check{display:flex;align-items:center;gap:9px;color:#52657d;font-size:14px;margin:10px 0}.scw-check input{width:auto}.scw-button{border:0;border-radius:12px;padding:10px 14px;background:#0b63a7;color:#fff;font-weight:800;cursor:pointer}.scw-button.secondary{background:#fff;color:#0b63a7;border:1px solid #b9cee2}.scw-button.danger{background:#a52a2a}.scw-button:disabled{opacity:.55;cursor:not-allowed}.scw-score{display:flex;align-items:center;justify-content:space-between;border-radius:14px;padding:14px;background:#edf7ff;margin-bottom:14px}.scw-score strong{font-size:24px;color:#0b63a7}.scw-docs,.scw-history{display:grid;gap:10px}.scw-doc{border:1px solid #dbe6f2;border-radius:14px;padding:13px}.scw-doc-head{display:flex;justify-content:space-between;gap:10px}.scw-doc-title{font-weight:800}.scw-doc-meta{font-size:12px;color:#6c7b8e;margin-top:3px}.scw-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef4fa;color:#36506a;font-size:11px;font-weight:800;text-transform:uppercase}.scw-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.scw-actions .scw-button{font-size:12px;padding:8px 10px}.scw-event{border-left:3px solid #0b63a7;padding-left:12px}.scw-error{background:#fff0f0;border:1px solid #ffcaca;color:#9b2727;border-radius:12px;padding:12px}.scw-success{background:#eaf8ef;border:1px solid #bfe9ce;color:#146b3a;border-radius:12px;padding:12px}.scw-loading,.scw-empty{color:#62738b;padding:12px}.scw-wide{grid-column:1/-1}@media(max-width:780px){.scw-grid{grid-template-columns:1fr}.scw-head{display:block}.scw-ref{display:block;margin-top:10px}}
    `;
    document.head.appendChild(style);
  }

  function mount(options) {
    const root = typeof options.root === "string"
      ? document.querySelector(options.root)
      : options.root;
    if (!root) throw new Error("A Careers workflow root element is required.");
    if (!options.applicationId) throw new Error("An applicationId is required.");

    installStyles();
    const client = createClient(options);
    const state = { folder: null, busy: false, fallback: false };
    root.innerHTML = '<section class="scw"><div class="scw-loading">Loading applicant folder…</div></section>';

    function setBusy(value) {
      state.busy = value;
      root.querySelectorAll("button,select,input,textarea").forEach((node) => {
        node.disabled = value;
      });
    }

    function message(text, type) {
      const target = root.querySelector("[data-message]");
      if (!target) return;
      target.className = type === "error" ? "scw-error" : "scw-success";
      target.textContent = text;
      target.hidden = false;
    }

    async function loadFolder() {
      const id = encodeURIComponent(options.applicationId);
      try {
        state.folder = await client.request(`/api/admin/applications/${id}/folder`, { method: "GET" });
        state.fallback = false;
      } catch (primaryError) {
        if (primaryError.status !== 404 && !/route not found/i.test(primaryError.message)) throw primaryError;
        const collection = await client.request("/api/admin/applications?limit=200", { method: "GET" });
        const applications = Array.isArray(collection) ? collection : [];
        const application = applications.find((item) => String(item.id) === String(options.applicationId));
        if (!application) throw new Error("Application not found.");
        state.folder = { application, documents: [], history: [], messages: [] };
        state.fallback = true;
      }
      render();
    }

    function render() {
      const folder = state.folder || {};
      const application = folder.application || folder;
      const documents = folder.documents || [];
      const history = folder.history || [];
      const status = String(application.workflowStatus || application.status || "RECEIVED").toUpperCase();
      const statuses = ["RECEIVED","REVIEWING","DOCUMENTS_NEEDED","INTERVIEW","OFFER_PENDING","HIRED","WITHDRAWN","TERMINATED","POSITION_FILLED"];
      const statusOptions = statuses.map((value) => `<option value="${value}" ${status === value ? "selected" : ""}>${title(value)}</option>`).join("");
      const score = application.assessmentScore ?? application.scoreTotal;
      const maximum = application.assessmentMaxScore ?? application.scoreMaximum;

      const docsHtml = documents.length ? documents.map((doc) => `
        <article class="scw-doc" data-document-id="${esc(doc.id)}">
          <div class="scw-doc-head"><div><div class="scw-doc-title">${esc(doc.label || title(doc.category))}</div><div class="scw-doc-meta">${esc(doc.fileName || "No file uploaded")}</div></div><span class="scw-pill">${esc(title(doc.status || "Missing"))}</span></div>
          <div class="scw-actions">${doc.fileName ? '<button class="scw-button secondary" data-doc="download">Download</button><button class="scw-button" data-doc="approve">Approve</button><button class="scw-button danger" data-doc="reject">Reject</button>' : ""}</div>
        </article>`).join("") : `<p class="scw-empty">${state.fallback ? "The application opened through compatibility mode. Detailed documents will appear after the API folder route is available." : "No documents are available."}</p>`;

      const historyHtml = history.length ? history.map((event) => `<div class="scw-event"><strong>${esc(title(event.toStatus || event.status))}</strong><small>${esc(event.createdAt ? new Date(event.createdAt).toLocaleString() : "")}</small>${event.note ? `<p>${esc(event.note)}</p>` : ""}</div>`).join("") : '<p class="scw-empty">No status history is available.</p>';

      root.querySelector(".scw").innerHTML = `
        <header class="scw-head"><div><div class="scw-kicker">Applicant folder${state.fallback ? " · compatibility mode" : ""}</div><h2 class="scw-name">${esc([application.firstName, application.middleName, application.lastName].filter(Boolean).join(" "))}</h2><p class="scw-sub">${esc(application.jobTitle || title(application.appliedRole || "Application"))} · ${esc(application.email || application.phone || "No contact supplied")}</p></div><span class="scw-ref">${esc(application.referenceNumber || application.id)}</span></header>
        <div data-message hidden></div>
        <div class="scw-grid">
          <section class="scw-card"><h3>Application status</h3><div class="scw-field"><label>Status</label><select data-status>${statusOptions}</select></div><div class="scw-field"><label>Note</label><textarea data-note placeholder="Add an update or instructions"></textarea></div><label class="scw-check"><input type="checkbox" data-visible checked> Show in applicant portal</label><label class="scw-check"><input type="checkbox" data-notify checked> Notify applicant</label><button class="scw-button" data-save>Save status update</button></section>
          <section class="scw-card"><h3>Application summary</h3>${score == null ? "" : `<div class="scw-score"><span>Assessment score</span><strong>${esc(score)}${maximum == null ? "" : "/" + esc(maximum)}</strong></div>`}<p><strong>Submitted:</strong> ${esc(application.submittedAt ? new Date(application.submittedAt).toLocaleString() : "Unknown")}</p><p><strong>Preferred contact:</strong> ${esc(title(application.preferredCommunication || "EMAIL"))}</p>${application.email ? '<button class="scw-button secondary" data-resend>Resend portal access email</button>' : ""}</section>
          <section class="scw-card scw-wide"><h3>Application documents</h3><div class="scw-docs">${docsHtml}</div></section>
          <section class="scw-card"><h3>Request a document</h3><div class="scw-field"><label>Document label</label><input data-request-label placeholder="Current CPR card"></div><button class="scw-button secondary" data-request>Send document request</button></section>
          <section class="scw-card"><h3>Status history</h3><div class="scw-history">${historyHtml}</div></section>
        </div>`;

      root.querySelector("[data-save]").addEventListener("click", saveStatus);
      root.querySelector("[data-resend]")?.addEventListener("click", resendAccess);
      root.querySelector("[data-request]").addEventListener("click", requestDocument);
      root.querySelectorAll("[data-doc]").forEach((button) => button.addEventListener("click", documentAction));
    }

    async function saveStatus() {
      const status = root.querySelector("[data-status]").value;
      const note = root.querySelector("[data-note]").value.trim();
      if (status === "INTERVIEW" && typeof options.onInterviewRequested === "function") {
        options.onInterviewRequested({ applicationId: options.applicationId, note });
        return;
      }
      try {
        setBusy(true);
        await client.request(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status,
            note,
            visibleToApplicant: root.querySelector("[data-visible]").checked,
            notifyApplicant: root.querySelector("[data-notify]").checked
          })
        });
        await loadFolder();
        message("Application status updated.", "success");
        options.onUpdated?.({ type: "status", status });
      } catch (error) {
        message(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function resendAccess() {
      try {
        setBusy(true);
        const result = await client.request(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/resend-access`, { method: "POST", body: "{}" });
        message(String(result.deliveryStatus || "").toUpperCase() === "SENT" ? "A new temporary password was sent." : "Portal access was reset; delivery could not be confirmed.", "success");
      } catch (error) {
        message(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function requestDocument() {
      const label = root.querySelector("[data-request-label]").value.trim();
      if (!label) return message("Enter the document name.", "error");
      try {
        setBusy(true);
        await client.request(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/request-document`, {
          method: "POST",
          body: JSON.stringify({ category: "OTHER", label, message: `Please upload your ${label}.` })
        });
        await loadFolder();
        message("Document request added.", "success");
      } catch (error) {
        message(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function documentAction(event) {
      const card = event.currentTarget.closest("[data-document-id]");
      const documentId = card.dataset.documentId;
      const action = event.currentTarget.dataset.doc;
      const doc = (state.folder.documents || []).find((item) => item.id === documentId) || {};
      try {
        if (action === "download") {
          await client.download(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/documents/${encodeURIComponent(documentId)}/download`, doc.fileName);
          return;
        }
        setBusy(true);
        await client.request(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/documents/${encodeURIComponent(documentId)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: action === "approve" ? "APPROVED" : "REJECTED", reviewNotes: "", notifyApplicant: true })
        });
        await loadFolder();
        message(`Document ${action === "approve" ? "approved" : "rejected"}.`, "success");
      } catch (error) {
        message(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    loadFolder().catch((error) => {
      root.querySelector(".scw").innerHTML = `<div class="scw-error">${esc(error.message)}</div>`;
    });
    return { reload: loadFolder };
  }

  global.SulandraCareersWorkflow = { mount };
})(window);
