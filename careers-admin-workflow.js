(function (global) {
  "use strict";

  const STATUSES = [
    ["RECEIVED", "Received"],
    ["REVIEWING", "Reviewing"],
    ["DOCUMENTS_NEEDED", "Documents needed"],
    ["INTERVIEW", "Interview"],
    ["OFFER_PENDING", "Offer pending"],
    ["HIRED", "Hired"],
    ["NOT_SELECTED", "Not selected"],
    ["WITHDRAWN", "Withdrawn"],
    ["TERMINATED", "Terminated"],
    ["POSITION_FILLED", "Position filled"]
  ];

  const DOCUMENT_TYPES = [
    "APPLICATION", "RESUME", "COVER_LETTER", "REFERENCES", "CPR",
    "DRIVER_LICENSE", "RN_LICENSE", "LPN_LICENSE", "BACKGROUND_CHECK",
    "I9", "W4", "OTHER"
  ];

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

    async function request(path, init) {
      const token = await getToken();
      if (!token) throw new Error("Administrator sign-in is required.");
      const response = await fetch(base + path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          ...((init && init.headers) || {})
        }
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : await response.text();
      if (!response.ok) {
        throw new Error((payload && payload.error) || "The request could not be completed.");
      }
      return payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data")
        ? payload.data
        : payload;
    }

    async function download(path, fileName) {
      const token = await getToken();
      if (!token) throw new Error("Administrator sign-in is required.");
      const response = await fetch(base + path, {
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

    return { request, download };
  }

  function mount(options) {
    const root = typeof options.root === "string"
      ? document.querySelector(options.root)
      : options.root;
    if (!root) throw new Error("A Careers workflow root element is required.");
    if (!options.applicationId) throw new Error("An applicationId is required.");

    const client = createClient(options);
    const state = { folder: null, busy: false, error: "" };

    root.innerHTML = '<section class="scw"><div class="scw-loading">Loading applicant folder…</div></section>';
    if (!document.getElementById("sulandra-careers-workflow-styles")) {
      const style = document.createElement("style");
      style.id = "sulandra-careers-workflow-styles";
      style.textContent = `
        .scw{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102448;background:#fff;border:1px solid #dbe6f2;border-radius:22px;padding:24px;box-shadow:0 18px 50px rgba(16,36,72,.08)}
        .scw *{box-sizing:border-box}.scw h2,.scw h3,.scw p{margin-top:0}.scw-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:1px solid #dbe6f2;padding-bottom:18px}.scw-kicker{font-weight:800;font-size:12px;letter-spacing:.08em;color:#126aa4;text-transform:uppercase}.scw-name{font-size:30px;line-height:1.1;margin:6px 0}.scw-sub{color:#62738b;margin:0}.scw-ref{font-weight:800;color:#126aa4}.scw-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:18px;margin-top:20px}.scw-card{border:1px solid #dbe6f2;border-radius:18px;padding:18px;background:#fbfdff}.scw-card h3{font-size:18px;margin-bottom:14px}.scw-field{display:grid;gap:7px;margin-bottom:12px}.scw-field label{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#52657d}.scw select,.scw input,.scw textarea{width:100%;border:1px solid #cbd9e8;border-radius:12px;padding:11px 12px;font:inherit;background:#fff;color:#102448}.scw textarea{min-height:86px;resize:vertical}.scw-check{display:flex;align-items:center;gap:9px;color:#52657d;font-size:14px;margin:10px 0}.scw-check input{width:auto}.scw-button{border:0;border-radius:12px;padding:11px 15px;background:#0b63a7;color:#fff;font-weight:800;cursor:pointer}.scw-button.secondary{background:#fff;color:#0b63a7;border:1px solid #b9cee2}.scw-button.danger{background:#a52a2a}.scw-button:disabled{opacity:.55;cursor:not-allowed}.scw-score{display:flex;align-items:center;justify-content:space-between;border-radius:14px;padding:14px;background:#edf7ff;margin-bottom:14px}.scw-score strong{font-size:24px;color:#0b63a7}.scw-docs{display:grid;gap:10px}.scw-doc{border:1px solid #dbe6f2;border-radius:14px;padding:13px}.scw-doc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.scw-doc-title{font-weight:800}.scw-doc-meta{font-size:12px;color:#6c7b8e;margin-top:3px}.scw-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef4fa;color:#36506a;font-size:11px;font-weight:800;text-transform:uppercase}.scw-pill.approved{background:#e8f8ef;color:#146b3a}.scw-pill.rejected{background:#fff0f0;color:#9b2727}.scw-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.scw-actions .scw-button{font-size:12px;padding:8px 10px}.scw-history{display:grid;gap:10px}.scw-event{border-left:3px solid #0b63a7;padding:2px 0 2px 12px}.scw-event strong{display:block}.scw-event small{color:#6c7b8e}.scw-error{background:#fff0f0;border:1px solid #ffcaca;color:#9b2727;border-radius:12px;padding:11px;margin:12px 0}.scw-success{background:#eaf8ef;border:1px solid #bfe9ce;color:#146b3a;border-radius:12px;padding:11px;margin:12px 0}.scw-loading{color:#62738b;padding:12px}.scw-request-row{display:grid;grid-template-columns:.7fr 1.3fr;gap:10px}.scw-empty{color:#6c7b8e;font-style:italic}.scw-wide{grid-column:1/-1}@media(max-width:780px){.scw-grid{grid-template-columns:1fr}.scw-head{display:block}.scw-ref{display:block;margin-top:10px}.scw-request-row{grid-template-columns:1fr}}
      `;
      document.head.appendChild(style);
    }

    const setBusy = (busy) => {
      state.busy = busy;
      root.querySelectorAll("button,select,input,textarea").forEach((node) => {
        node.disabled = busy;
      });
    };

    const showMessage = (message, type) => {
      const target = root.querySelector("[data-scw-message]");
      if (!target) return;
      target.className = type === "error" ? "scw-error" : "scw-success";
      target.textContent = message;
      target.hidden = false;
    };

    const render = () => {
      const folder = state.folder;
      const application = folder.application || folder;
      const documents = folder.documents || application.documents || [];
      const history = folder.history || application.statusHistory || [];
      const score = application.assessmentScore ?? application.scoreTotal ?? null;
      const scoreMax = application.assessmentMaxScore ?? application.scoreMaximum ?? null;
      const statusOptions = STATUSES.map(([value, label]) =>
        `<option value="${value}" ${application.workflowStatus === value ? "selected" : ""}>${label}</option>`
      ).join("");

      const documentHtml = documents.length ? documents.map((doc) => {
        const review = String(doc.reviewStatus || doc.status || "MISSING").toLowerCase();
        const canDownload = Boolean(doc.fileName || doc.mimeType || doc.sizeBytes);
        return `<article class="scw-doc" data-document-id="${esc(doc.id)}">
          <div class="scw-doc-head">
            <div><div class="scw-doc-title">${esc(doc.label || title(doc.category))}</div><div class="scw-doc-meta">${esc(doc.fileName || "No file uploaded")} · Version ${esc(doc.version || 1)}</div></div>
            <span class="scw-pill ${esc(review)}">${esc(title(doc.reviewStatus || doc.status || "Missing"))}</span>
          </div>
          ${doc.reviewNotes ? `<div class="scw-doc-meta">${esc(doc.reviewNotes)}</div>` : ""}
          <div class="scw-actions">
            ${canDownload ? '<button class="scw-button secondary" data-doc-action="download">Download</button>' : ""}
            ${canDownload ? '<button class="scw-button" data-doc-action="approve">Approve</button>' : ""}
            ${canDownload ? '<button class="scw-button danger" data-doc-action="reject">Reject</button>' : ""}
          </div>
        </article>`;
      }).join("") : '<p class="scw-empty">No application documents are available.</p>';

      const historyHtml = history.length ? history.map((event) =>
        `<div class="scw-event"><strong>${esc(title(event.toStatus || event.status))}</strong><small>${esc(event.createdAt ? new Date(event.createdAt).toLocaleString() : "")} ${event.changedByName ? "· " + esc(event.changedByName) : ""}</small>${event.note ? `<p>${esc(event.note)}</p>` : ""}</div>`
      ).join("") : '<p class="scw-empty">No status changes have been recorded.</p>';

      root.querySelector(".scw").innerHTML = `
        <header class="scw-head"><div><div class="scw-kicker">Applicant folder</div><h2 class="scw-name">${esc(application.firstName)} ${esc(application.lastName)}</h2><p class="scw-sub">${esc(application.positionTitle || application.role || "Application")} · ${esc(application.email || application.phone || "No contact supplied")}</p></div><span class="scw-ref">${esc(application.referenceNumber || application.id)}</span></header>
        <div data-scw-message hidden></div>
        <div class="scw-grid">
          <section class="scw-card"><h3>Application status</h3><div class="scw-field"><label>Status</label><select data-scw-status>${statusOptions}</select></div><div class="scw-field"><label>Internal/applicant note</label><textarea data-scw-note placeholder="Add an update or instructions for the applicant"></textarea></div><label class="scw-check"><input type="checkbox" data-scw-visible checked> Show this update in the applicant portal</label><label class="scw-check"><input type="checkbox" data-scw-notify checked> Notify the applicant using their preferred communication method</label><button class="scw-button" data-scw-save-status>Save status update</button></section>
          <section class="scw-card"><h3>Application summary</h3>${score == null ? "" : `<div class="scw-score"><span>DSP assessment score</span><strong>${esc(score)}${scoreMax == null ? "" : "/" + esc(scoreMax)}</strong></div>`}<p><strong>Submitted:</strong> ${esc(application.submittedAt ? new Date(application.submittedAt).toLocaleString() : "Unknown")}</p><p><strong>Preferred contact:</strong> ${esc(title(application.preferredCommunication || "EMAIL"))}</p><p><strong>Username:</strong> ${esc(application.applicantUsername || application.email || application.phone || "Pending")}</p></section>
          <section class="scw-card scw-wide"><h3>Application documents</h3><div class="scw-docs">${documentHtml}</div></section>
          <section class="scw-card"><h3>Request a document</h3><div class="scw-request-row"><div class="scw-field"><label>Type</label><select data-scw-request-category>${DOCUMENT_TYPES.map((value) => `<option value="${value}">${title(value)}</option>`).join("")}</select></div><div class="scw-field"><label>Label</label><input data-scw-request-label placeholder="e.g. Current CPR card"></div></div><div class="scw-field"><label>Instructions</label><textarea data-scw-request-message placeholder="Tell the applicant what is needed"></textarea></div><button class="scw-button secondary" data-scw-request>Send document request</button></section>
          <section class="scw-card"><h3>Status history</h3><div class="scw-history">${historyHtml}</div></section>
        </div>`;

      root.querySelector("[data-scw-save-status]").addEventListener("click", saveStatus);
      root.querySelector("[data-scw-request]").addEventListener("click", requestDocument);
      root.querySelectorAll("[data-doc-action]").forEach((button) => button.addEventListener("click", documentAction));
    };

    async function load() {
      try {
        state.folder = await client.request(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/folder`, { method: "GET" });
        render();
      } catch (error) {
        root.querySelector(".scw").innerHTML = `<div class="scw-error">${esc(error.message)}</div>`;
      }
    }

    async function saveStatus() {
      const status = root.querySelector("[data-scw-status]").value;
      const note = root.querySelector("[data-scw-note]").value.trim();
      const visibleToApplicant = root.querySelector("[data-scw-visible]").checked;
      const notifyApplicant = root.querySelector("[data-scw-notify]").checked;
      try {
        setBusy(true);
        await client.request(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status, note, visibleToApplicant, notifyApplicant })
        });
        await load();
        showMessage("Application status updated.", "success");
        if (typeof options.onUpdated === "function") options.onUpdated({ type: "status", status });
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function documentAction(event) {
      const card = event.currentTarget.closest("[data-document-id]");
      const documentId = card.dataset.documentId;
      const action = event.currentTarget.dataset.docAction;
      const doc = (state.folder.documents || []).find((item) => item.id === documentId) || {};
      try {
        if (action === "download") {
          await client.download(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/documents/${encodeURIComponent(documentId)}/download`, doc.fileName);
          return;
        }
        const reviewNotes = global.prompt(action === "approve" ? "Optional approval note:" : "Why is this document being rejected?") || "";
        setBusy(true);
        await client.request(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/documents/${encodeURIComponent(documentId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: action === "approve" ? "APPROVED" : "REJECTED",
            reviewNotes,
            notifyApplicant: true
          })
        });
        await load();
        showMessage(`Document ${action === "approve" ? "approved" : "rejected"}.`, "success");
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    async function requestDocument() {
      const category = root.querySelector("[data-scw-request-category]").value;
      const label = root.querySelector("[data-scw-request-label]").value.trim() || title(category);
      const message = root.querySelector("[data-scw-request-message]").value.trim();
      try {
        setBusy(true);
        await client.request(`/api/admin/applications/${encodeURIComponent(options.applicationId)}/request-document`, {
          method: "POST",
          body: JSON.stringify({ category, label, message, notifyApplicant: true })
        });
        await load();
        showMessage("Document request added and the applicant was notified.", "success");
      } catch (error) {
        showMessage(error.message, "error");
      } finally {
        setBusy(false);
      }
    }

    load();
    return { reload: load };
  }

  global.SulandraCareersWorkflow = { mount, statuses: STATUSES.map(([value]) => value) };
})(window);
