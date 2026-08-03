(function () {
  "use strict";

  function enforceOfferLetterOnly() {
    document.querySelectorAll(".scw-modal [data-offer-document], [data-scw-offer-modal] [data-offer-document]").forEach((input) => {
      const label = input.closest("label");
      const isOfferLetter = String(input.value || label?.textContent || "").toLowerCase().includes("offer letter");
      if (isOfferLetter) {
        input.value = "Offer Letter";
        input.checked = true;
        input.disabled = false;
        if (label) label.style.display = "none";
      } else {
        input.checked = false;
        input.disabled = true;
        if (label) label.remove();
      }
    });

    document.querySelectorAll(".scw-modal .scw-field, [data-scw-offer-modal] .scw-field").forEach((field) => {
      const label = field.querySelector(":scope > label");
      if (!label || !/required disclosures and onboarding paperwork/i.test(label.textContent || "")) return;
      field.innerHTML = `
        <label>Offer document</label>
        <div style="border:1px solid #cbd9e8;border-radius:12px;padding:12px;background:#f8fbfe;font-weight:800;color:#102448">
          Offer Letter
          <div style="font-size:12px;font-weight:500;color:#62738b;margin-top:4px">The applicant will review and sign only the Offer of Employment at this stage.</div>
        </div>
        <input type="checkbox" data-offer-document value="Offer Letter" checked hidden>
      `;
    });
  }

  const observer = new MutationObserver(enforceOfferLetterOnly);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", enforceOfferLetterOnly);
  enforceOfferLetterOnly();
})();
