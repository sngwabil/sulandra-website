import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminRuntimePath = path.join(repositoryRoot, 'dist-web', 'admin-railway.js');
let source = await readFile(adminRuntimePath, 'utf8');

const startMarker = '  function addInterviewSlot(value = "") {';
const endMarker = '  function renderCompanyPreview() {';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  throw new Error('Could not locate the interview scheduler in admin-railway.js.');
}

const replacement = `  function interviewDateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Invalid date";
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short"
    }).format(date);
  }

  function addInterviewSlot(value = "") {
    const row = document.createElement("div");
    row.className = "slot-row";
    row.innerHTML = \`<input type="datetime-local" data-interview-start required value="\${escapeHtml(value)}"><button class="btn btn-danger" type="button" data-remove-slot>Remove</button>\`;
    row.querySelector("[data-remove-slot]").addEventListener("click", () => {
      row.remove();
      if (!document.querySelectorAll("[data-interview-start]").length) addInterviewSlot();
    });
    $("interviewNewSlotList").appendChild(row);
  }

  function defaultInterviewTime() {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    date.setMinutes(date.getMinutes() < 30 ? 30 : 0, 0, 0);
    if (date.getMinutes() === 0) date.setHours(date.getHours() + 1);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function renderAvailableInterviewSlots(slots) {
    const target = $("interviewAvailableSlots");
    const available = (slots || []).filter((slot) => slot.status === "AVAILABLE" || slot.invitedToCurrentApplication);
    if (!available.length) {
      target.innerHTML = '<div class="muted" style="padding:12px;border:1px dashed #bfd5e6;border-radius:12px;">No saved interview times are currently available. Add one or more new times below.</div>';
      return;
    }
    target.innerHTML = available.map((slot) => \`
      <label style="display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid #cfe0ed;border-radius:12px;background:#f7fbfe;">
        <input type="checkbox" data-existing-interview-slot value="\${escapeHtml(slot.id)}" \${slot.invitedToCurrentApplication ? "checked" : ""}>
        <span><strong>\${escapeHtml(interviewDateLabel(slot.startsAt))}</strong><br><small class="muted">\${escapeHtml(String(slot.mode || "IN_PERSON").replaceAll("_", " "))} · \${escapeHtml(slot.locationOrLink || "Sulandra Health office")}</small></span>
      </label>
    \`).join("");
  }

  async function openInterviewScheduler(applicationId, note = "") {
    const application = applications.find((item) => item.id === applicationId);
    interviewApplicationId = applicationId;
    pendingInterviewNote = note;
    $("interviewApplicantName").textContent = application ? applicationName(application) : "Applicant";
    $("interviewModal").style.zIndex = "12000";
    $("interviewModal").style.display = "block";
    $("interviewSlotList").innerHTML = \`
      <div style="display:grid;gap:16px;">
        <section>
          <h3 style="margin:0 0 6px;color:#12345a;">Available interview calendar</h3>
          <p class="sub">Select saved open times from your calendar, or add new times below. The applicant will receive a secure link and choose one available appointment.</p>
          <div id="interviewAvailableSlots" style="display:grid;gap:9px;margin-top:12px;"><div class="muted">Loading available times…</div></div>
        </section>
        <section style="border-top:1px solid #dbe6f2;padding-top:16px;">
          <h3 style="margin:0 0 8px;color:#12345a;">Add new available times</h3>
          <div id="interviewNewSlotList" style="display:grid;gap:9px;"></div>
        </section>
        <section style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;">
          <label class="sub">Interview format<select id="interviewMode" style="display:block;width:100%;margin-top:5px;padding:10px;border:1px solid #bed1df;border-radius:9px;"><option value="IN_PERSON">In person</option><option value="VIDEO">Video</option><option value="PHONE">Phone</option></select></label>
          <label class="sub">Duration<select id="interviewDuration" style="display:block;width:100%;margin-top:5px;padding:10px;border:1px solid #bed1df;border-radius:9px;"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
          <label class="sub">Location or link<input id="interviewLocation" style="display:block;width:100%;margin-top:5px;padding:10px;border:1px solid #bed1df;border-radius:9px;" placeholder="Company address or meeting link"></label>
        </section>
      </div>\`;
    addInterviewSlot(defaultInterviewTime());
    try {
      const payload = await apiRequest(\`/api/admin/interview-slots?applicationId=\${encodeURIComponent(applicationId)}\`);
      const data = payload.data || {};
      renderAvailableInterviewSlots(data.slots || []);
      $("interviewLocation").value = data.companyDetails?.formattedAddress || "822 Dalewood Pl, Suite A, Dayton, Ohio 45426";
    } catch (error) {
      $("interviewAvailableSlots").innerHTML = \`<div class="muted">\${escapeHtml(error.message)} Add new interview times below.</div>\`;
    }
  }

  function closeInterviewScheduler() {
    $("interviewModal").style.display = "none";
    interviewApplicationId = "";
    pendingInterviewNote = "";
    $("interviewSlotList").replaceChildren();
  }

  async function saveInterviewSlots() {
    const startsAt = [...document.querySelectorAll("[data-interview-start]")]
      .map((input) => input.value ? new Date(input.value) : null)
      .filter((date) => date && !Number.isNaN(date.getTime()))
      .map((date) => date.toISOString());
    const slotIds = [...document.querySelectorAll("[data-existing-interview-slot]:checked")]
      .map((input) => input.value);
    if (!startsAt.length && !slotIds.length) {
      toast("Interview times required", "Select at least one available time or add a new date and time.");
      return;
    }
    const button = $("saveInterviewSlots");
    button.disabled = true;
    try {
      await apiRequest(\`/api/admin/applications/\${encodeURIComponent(interviewApplicationId)}/interview-slots\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotIds,
          startsAt,
          note: pendingInterviewNote,
          mode: $("interviewMode")?.value || "IN_PERSON",
          durationMinutes: Number($("interviewDuration")?.value || 30),
          locationOrLink: $("interviewLocation")?.value.trim() || undefined
        })
      });
      closeInterviewScheduler();
      $("closeModalBtn").click();
      toast("Interview invitation sent", "The applicant can now choose from the available interview calendar.");
      await loadApplications();
    } catch (error) {
      toast("Interview not scheduled", error.message);
    } finally {
      button.disabled = false;
    }
  }

`;

source = source.slice(0, start) + replacement + source.slice(end);
await writeFile(adminRuntimePath, source, 'utf8');
console.log('Applicant interview availability calendar restored.');
