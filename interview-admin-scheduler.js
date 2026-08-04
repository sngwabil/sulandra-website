(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value == null ? "" : value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function removeObsoleteShortcuts(root = document) {
    const scope = root instanceof Element || root instanceof Document ? root : document;
    const candidates = [];
    if (scope instanceof Element) candidates.push(scope);
    scope.querySelectorAll?.("[data-interview-id],button,a,[role='button']").forEach(node => candidates.push(node));
    candidates.forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      const text = node.textContent.trim().replace(/\s+/g, " ").toLowerCase();
      if (node.matches("[data-interview-id]") || text === "schedule interview") node.remove();
    });
  }

  removeObsoleteShortcuts();
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) removeObsoleteShortcuts(node);
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });

  async function request(path, init = {}) {
    const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
    if (!token) throw new Error("Administrator sign-in is required.");
    const response = await fetch(API_BASE + path, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || "The request could not be completed.");
    return payload.data !== undefined ? payload.data : payload;
  }

  function localValue(date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function formatDate(value) {
    return new Date(value).toLocaleString([], {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short"
    });
  }

  function ensureStyles() {
    if ($("#sulandra-interview-admin-styles")) return;
    const style = document.createElement("style");
    style.id = "sulandra-interview-admin-styles";
    style.textContent = `
      .sia-backdrop{position:fixed;inset:0;z-index:30000;display:grid;place-items:center;padding:20px;background:rgba(7,24,42,.68)}
      .sia-modal{width:min(900px,100%);max-height:92vh;overflow:auto;padding:24px;border-radius:22px;background:#fff;color:#102448;box-shadow:0 28px 90px rgba(0,0,0,.34)}
      .sia-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.sia-head h2{margin:4px 0}.sia-kicker{font-size:12px;font-weight:900;color:#075b9c;text-transform:uppercase;letter-spacing:.08em}
      .sia-close,.sia-button,.sia-add{border:0;border-radius:11px;padding:11px 14px;font-weight:900;cursor:pointer}.sia-close,.sia-add,.sia-secondary{background:#eef4fa;color:#102448}.sia-primary{background:#075b9c;color:#fff}
      .sia-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.sia-field{display:grid;gap:6px;margin-top:14px}.sia-field label{font-size:12px;font-weight:900;text-transform:uppercase;color:#52657d}
      .sia-field input,.sia-field select,.sia-field textarea{width:100%;padding:11px;border:1px solid #cbd9e8;border-radius:11px;font:inherit}.sia-field textarea{min-height:86px}
      .sia-row{display:flex;gap:10px;align-items:end}.sia-row .sia-field{flex:1}.sia-added{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.sia-chip{padding:7px 10px;border:1px solid #b9d8ec;border-radius:999px;background:#e8f4fb;font-size:12px;font-weight:800}.sia-chip button{border:0;background:transparent;color:#9b1c1c;font-weight:900;cursor:pointer}
      .sia-slots{margin-top:18px;padding:14px;border:1px solid #dbe6f2;border-radius:16px;background:#f8fbfe}.sia-slot{display:flex;gap:10px;align-items:flex-start;padding:11px 0;border-bottom:1px solid #e4edf5}.sia-slot:last-child{border-bottom:0}.sia-slot input{margin-top:4px}
      .sia-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.sia-error{margin-top:14px;padding:12px;border:1px solid #ffcaca;border-radius:12px;background:#fff0f0;color:#9b2727}.sia-note{color:#62738b;line-height:1.55}
      @media(max-width:760px){.sia-grid{grid-template-columns:1fr}.sia-row{display:block}.sia-actions{display:grid}.sia-button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  async function openScheduler(context) {
    if (!context?.applicationId) throw new Error("An applicant is required to schedule an interview.");
    ensureStyles();
    $(".sia-backdrop")?.remove();

    const data = await request(`/api/admin/interview-slots?applicationId=${encodeURIComponent(context.applicationId)}`);
    const slots = Array.isArray(data.slots) ? data.slots : [];
    const company = data.companyDetails || {};
    const wrapper = document.createElement("div");
    wrapper.className = "sia-backdrop";
    wrapper.innerHTML = `
      <section class="sia-modal" role="dialog" aria-modal="true" aria-labelledby="sia-title">
        <div class="sia-head">
          <div><div class="sia-kicker">Sulandra Health Human Resources Department</div><h2 id="sia-title">Schedule applicant interview</h2><p class="sia-note">Select existing available appointments or add new dates and times. The applicant receives one secure link and chooses one appointment.</p></div>
          <button class="sia-close" type="button" data-close>Close</button>
        </div>
        <div class="sia-grid">
          <div class="sia-field"><label>Interview format</label><select data-mode><option value="IN_PERSON">In person</option><option value="VIDEO">Video interview</option><option value="PHONE">Phone interview</option></select></div>
          <div class="sia-field"><label>Duration</label><select data-duration><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option><option value="90">90 minutes</option></select></div>
          <div class="sia-field"><label>Location or meeting link</label><input data-location value="${esc(company.formattedAddress || "822 Dalewood Pl, Suite A, Dayton, Ohio 45426")}"></div>
          <div class="sia-field"><label>Scheduling link expires</label><input data-expiry type="datetime-local" value="${localValue(new Date(Date.now() + 7 * 86400000))}"></div>
        </div>
        <div class="sia-row"><div class="sia-field"><label>Add another appointment</label><input data-new-time type="datetime-local" min="${localValue(new Date(Date.now() + 31 * 60000))}"></div><button class="sia-add" type="button" data-add>Add time</button></div>
        <div class="sia-added" data-added></div>
        <div class="sia-slots"><strong>Existing future appointments</strong><div data-slot-list>${slots.length ? slots.map(slot => {
          const available = String(slot.status) === "AVAILABLE";
          const label = available ? "Available" : `Booked${slot.bookedFirstName ? ` by ${slot.bookedFirstName} ${slot.bookedLastName || ""}` : ""}`;
          return `<label class="sia-slot"><input type="checkbox" data-slot-id="${esc(slot.id)}" ${available ? "" : "disabled"} ${slot.invitedToCurrentApplication && available ? "checked" : ""}><span><strong>${esc(formatDate(slot.startsAt))}</strong><br><small>${esc(label)} · ${esc(String(slot.mode || "IN_PERSON").replaceAll("_", " "))}</small></span></label>`;
        }).join("") : '<p class="sia-note">No future interview appointments exist yet. Add at least one new appointment above.</p>'}</div></div>
        <div class="sia-field"><label>Message to applicant</label><textarea data-note>${esc(context.note || "")}</textarea></div>
        <div class="sia-error" data-error hidden></div>
        <div class="sia-actions"><button class="sia-button sia-secondary" type="button" data-cancel>Cancel</button><button class="sia-button sia-primary" type="button" data-send>Send interview invitation</button></div>
      </section>`;
    document.body.appendChild(wrapper);

    const added = [];
    const renderAdded = () => {
      $("[data-added]", wrapper).innerHTML = added.map((value, index) => `<span class="sia-chip">${esc(formatDate(value))} <button type="button" data-remove-time="${index}">×</button></span>`).join("");
      wrapper.querySelectorAll("[data-remove-time]").forEach(button => button.onclick = () => {
        added.splice(Number(button.dataset.removeTime), 1);
        renderAdded();
      });
    };
    const close = () => wrapper.remove();
    $("[data-close]", wrapper).onclick = close;
    $("[data-cancel]", wrapper).onclick = close;
    wrapper.onclick = event => { if (event.target === wrapper) close(); };

    $("[data-add]", wrapper).onclick = () => {
      const input = $("[data-new-time]", wrapper);
      if (!input.value) return;
      const date = new Date(input.value);
      const error = $("[data-error]", wrapper);
      if (date.getTime() <= Date.now() + 30 * 60000) {
        error.textContent = "Interview times must begin at least 30 minutes in the future.";
        error.hidden = false;
        return;
      }
      if (!added.includes(date.toISOString())) added.push(date.toISOString());
      input.value = "";
      error.hidden = true;
      renderAdded();
    };

    $("[data-send]", wrapper).onclick = async () => {
      const button = $("[data-send]", wrapper);
      const error = $("[data-error]", wrapper);
      const slotIds = Array.from(wrapper.querySelectorAll("[data-slot-id]:checked")).map(node => node.dataset.slotId);
      if (!slotIds.length && !added.length) {
        error.textContent = "Select or add at least one interview appointment.";
        error.hidden = false;
        return;
      }
      try {
        button.disabled = true;
        button.textContent = "Sending invitation…";
        error.hidden = true;
        await request(`/api/admin/applications/${encodeURIComponent(context.applicationId)}/interview-slots`, {
          method: "POST",
          body: JSON.stringify({
            slotIds,
            startsAt: added,
            durationMinutes: Number($("[data-duration]", wrapper).value),
            mode: $("[data-mode]", wrapper).value,
            locationOrLink: $("[data-location]", wrapper).value.trim(),
            expiresAt: new Date($("[data-expiry]", wrapper).value).toISOString(),
            note: $("[data-note]", wrapper).value.trim() || undefined
          })
        });
        close();
        context.onSent?.();
        alert("Interview invitation sent successfully. The applicant can now choose from the available appointments.");
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        button.disabled = false;
        button.textContent = "Send interview invitation";
      }
    };
  }

  window.SulandraInterviewScheduler = { open: openScheduler, removeObsoleteShortcuts };

  function install() {
    const workflow = window.SulandraCareersWorkflow;
    if (!workflow || workflow.__interviewSchedulerInstalled) return false;
    const originalMount = workflow.mount.bind(workflow);
    workflow.mount = function (options) {
      const provided = options.onInterviewRequested;
      return originalMount({
        ...options,
        onInterviewRequested: context => {
          if (typeof provided === "function") return provided(context);
          return openScheduler({ ...context, onSent: () => options.onUpdated?.({ type: "interview-invitation" }) });
        }
      });
    };
    workflow.__interviewSchedulerInstalled = true;
    return true;
  }

  if (!install()) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (install() || attempts > 100) clearInterval(timer);
    }, 100);
  }
})();
