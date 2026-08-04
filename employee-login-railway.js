(function () {
  "use strict";

  const API_BASE = "";
  const TOKEN_KEY = "sulandra:employee:access-token";
  const SESSION_KEY = "sulandra:employee:session";
  const message = document.getElementById("msg");

  function showMessage(text, success) {
    message.textContent = text;
    message.className = success ? "msg success" : "msg show";
  }

  function showError(text) {
    showMessage(text, false);
  }

  async function sendRecoveryRequest(path, body, successText) {
    message.className = "msg";
    try {
      const response = await fetch(API_BASE + path, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Unable to process the recovery request.");
      }
      showMessage(payload.message || successText, true);
    } catch (error) {
      showError(error.message || "Unable to process the recovery request.");
    }
  }

  document.getElementById("clear").addEventListener("click", () => {
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
    message.className = "msg";
  });

  document.getElementById("forgot-password").addEventListener("click", async () => {
    const username = window.prompt("Enter your employee username:");
    if (username === null) return;
    const normalizedUsername = username.trim().toLowerCase();
    if (!normalizedUsername) {
      showError("Enter your employee username.");
      return;
    }
    await sendRecoveryRequest(
      "/api/auth/forgot-password",
      { username: normalizedUsername },
      "If the username matches an employee account, secure password-reset instructions have been sent to the email address on file. Please check your email."
    );
  });

  document.getElementById("forgot-username").addEventListener("click", async () => {
    const employeeEmail = window.prompt("Enter your employee email address:");
    if (employeeEmail === null) return;
    const normalizedEmail = employeeEmail.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      showError("Enter a valid employee email address.");
      return;
    }
    await sendRecoveryRequest(
      "/api/auth/forgot-username",
      { email: normalizedEmail },
      "If the email address matches an employee account, the username has been sent to the personal and employee email addresses on file. Please check your email."
    );
  });

  document.getElementById("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    message.className = "msg";

    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    if (!email || !password) {
      showError("Enter your employee username and password.");
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
      window.location.assign(
        session.role === "ADMINISTRATOR" ? "admin.html" : "employee-portal.html"
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
