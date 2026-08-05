(function () {
  "use strict";

  const API_BASE = "https://sulandra-website-production-5fc4.up.railway.app";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const message = document.getElementById("msg");

  function showError(text) {
    message.textContent = text;
    message.className = "msg show";
  }

  function safeReturnTarget() {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (!requested) return "";
    try {
      const resolved = new URL(requested, window.location.origin);
      if (resolved.origin !== window.location.origin) return "";
      return resolved.pathname + resolved.search + resolved.hash;
    } catch {
      return "";
    }
  }

  document.getElementById("demo").addEventListener("click", () => {
    window.location.assign("spire-demo.html");
  });

  document.getElementById("clear").addEventListener("click", () => {
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
    message.className = "msg";
  });

  document.getElementById("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    message.className = "msg";

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    if (!email || !password) {
      showError("Enter your employee email and password.");
      return;
    }

    const submitButton = event.submitter;
    if (submitButton) submitButton.disabled = true;

    try {
      const response = await fetch(API_BASE + "/api/auth/login", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to sign in.");
      }

      const session = payload.session || payload.data || payload;
      const token = session.accessToken || session.bearerToken || session.token;
      if (!token) throw new Error("The server did not return an access token.");

      window.sessionStorage.setItem(TOKEN_KEY, token);
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

      const requestedTarget = safeReturnTarget();
      window.location.assign(
        requestedTarget || (session.role === "ADMINISTRATOR" ? "admin.html" : "employee-portal.html")
      );
    } catch (error) {
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
      showError(error.message || "Unable to sign in.");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
})();
