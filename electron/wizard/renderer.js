"use strict";

const els = {
  stepProvider: document.getElementById("step-provider"),
  radiosProvider: document.querySelectorAll("input[name='provider']"),
  stepInstall: document.getElementById("step-install"),
  stepInstallMarker: document.getElementById("step-install-marker"),
  stepLogin: document.getElementById("step-login"),
  stepLoginMarker: document.getElementById("step-login-marker"),
  headerBlurb: document.getElementById("header-blurb"),
  installDesc: document.getElementById("install-desc"),
  installStatus: document.getElementById("install-status"),
  btnInstall: document.getElementById("btn-install"),
  loginDesc: document.getElementById("login-desc"),
  loginStatus: document.getElementById("login-status"),
  btnLogin: document.getElementById("btn-login"),
  apiKeyBox: document.getElementById("api-key-box"),
  apiKeyInput: document.getElementById("api-key-input"),
  btnFinish: document.getElementById("btn-finish"),
  btnCancel: document.getElementById("btn-cancel"),
  platformInfo: document.getElementById("platform-info"),
  authUrlBox: document.getElementById("auth-url-box"),
  authUrl: document.getElementById("auth-url"),
  btnOpenUrl: document.getElementById("btn-open-url"),
};

const BLURB_SIGNIN_ONLY =
  "Sign in to Codex CLI, or select a different provider. Your study data never leaves this Mac/PC.";
const BLURB_INSTALL_AND_SIGNIN =
  "Codex CLI needs to be installed, or you can select a different provider. Your study data never leaves this Mac/PC.";

let lastAuthUrl = null;
let lastPhase = "idle";
let lastStatus = null;
let selectedProvider = "codex";

els.radiosProvider.forEach((r) => {
  r.addEventListener("change", (e) => {
    if (e.target.checked) {
      selectedProvider = e.target.value;
      render(lastStatus);
    }
  });
});

function render(s) {
  if (!s) return;
  lastStatus = s;
  els.platformInfo.textContent = s.targetTriple
    ? `Platform: ${s.targetTriple}  ·  Required: ≥ ${s.requiredVersion}`
    : "";

  const isCodex = selectedProvider === "codex";
  const codexReady = s.binaryFound && s.versionOk;
  const showInstallStep = !codexReady && isCodex;
  const showLoginStep = isCodex || selectedProvider === "gemini";

  els.stepInstall.hidden = !showInstallStep;
  els.stepLogin.hidden = !showLoginStep;
  
  els.stepInstallMarker.textContent = "2";
  els.stepLoginMarker.textContent = showInstallStep ? "3" : "2";
  els.headerBlurb.textContent = showInstallStep
    ? BLURB_INSTALL_AND_SIGNIN
    : BLURB_SIGNIN_ONLY;

  // ── Step 1: install / version (only visible when bundled copy missing)
  if (showInstallStep) {
    els.stepInstall.classList.toggle("done", false);
    els.stepInstall.classList.toggle(
      "active",
      (s.phase ?? "idle") !== "logging-in",
    );
    els.stepInstall.classList.toggle("error", s.phase === "error");
    if (!s.binaryFound) {
      els.installDesc.textContent = `Get It.'s bundled Codex CLI ${s.requiredVersion} is missing on this machine. Install a fresh copy now — one-time download, ~30 MB.`;
      els.btnInstall.disabled = false;
      els.btnInstall.textContent = "Install Codex CLI";
    } else {
      // binary present but version too old — only reachable for the
      // node_modules / userdata sources, since the bundled copy's
      // version is pinned at build time.
      els.installDesc.textContent = `The Codex CLI on this machine is ${s.version ?? "an unknown version"}; Get It. needs ≥ ${s.requiredVersion}. Update?`;
      els.btnInstall.disabled = false;
      els.btnInstall.textContent = "Update Codex CLI";
    }
    if (s.phase === "installing") {
      els.installStatus.innerHTML = `<span class="spinner"></span>${escapeHtml(s.message || "Installing…")}`;
      els.btnInstall.disabled = true;
    } else if (s.phase === "error") {
      els.installStatus.innerHTML = `<span class="err">${escapeHtml(s.message || "Failed.")}</span>`;
    } else {
      els.installStatus.innerHTML = "";
    }
  }

  // ── Sign-in step (always visible)
  els.stepLogin.classList.toggle("done", s.loggedIn);
  els.stepLogin.classList.toggle("active", codexReady && !s.loggedIn);
  els.stepLogin.classList.toggle(
    "error",
    s.phase === "error" && codexReady && !s.loggedIn,
  );
  if (selectedProvider === "gemini") {
    const h2 = els.stepLogin.querySelector("h2");
    h2.textContent = "Configure Gemini";
    els.loginDesc.innerHTML =
      "Paste your Gemini API key below. It is saved to your local settings and used as the <code>GEMINI_API_KEY</code> for Gemini CLI.";
    els.btnLogin.hidden = true;
    els.loginStatus.innerHTML = "";
    els.apiKeyBox.hidden = false;
  } else if (!codexReady) {
    els.apiKeyBox.hidden = true;
    els.loginDesc.textContent = "Install Codex CLI first.";
    els.btnLogin.disabled = true;
    els.loginStatus.innerHTML = "";
  } else if (s.loggedIn) {
    els.apiKeyBox.hidden = true;
    els.loginDesc.textContent = "You're signed in to Codex.";
    els.btnLogin.disabled = true;
    els.btnLogin.textContent = "Signed in";
    els.loginStatus.innerHTML = `<span class="ok">✓ Connected</span>`;
  } else {
    els.apiKeyBox.hidden = true;
    const h2 = els.stepLogin.querySelector("h2");
    h2.textContent = "Sign in with ChatGPT or OpenAI";
    els.loginDesc.textContent =
      "A browser window will open. After you finish signing in there, this dialog continues automatically.";
    els.btnLogin.hidden = false;
    els.btnLogin.disabled = s.phase === "logging-in";
    els.btnLogin.textContent = "Sign in with ChatGPT";
    if (s.phase === "logging-in") {
      els.loginStatus.innerHTML = `<span class="spinner"></span>${escapeHtml(s.message || "Waiting for browser…")}`;
    } else if (s.phase === "error") {
      els.loginStatus.innerHTML = `<span class="err">${escapeHtml(s.message || "Login failed.")}</span>`;
    } else {
      els.loginStatus.innerHTML = "";
    }
  }

  // Auth-url fallback
  if (s.authUrl && s.phase === "logging-in") {
    lastAuthUrl = s.authUrl;
    els.authUrlBox.hidden = false;
    els.authUrl.textContent = s.authUrl;
  } else if (s.phase !== "logging-in") {
    els.authUrlBox.hidden = true;
    lastAuthUrl = null;
  }

  // ── Finish button — only enabled when everything green (or not codex)
  if (isCodex) {
    els.btnFinish.disabled = !(codexReady && s.loggedIn);
  } else if (selectedProvider === "gemini") {
    els.btnFinish.disabled = !els.apiKeyInput.value.trim();
  } else {
    els.btnFinish.disabled = false;
  }

  lastPhase = s.phase ?? "idle";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

// ── Wire buttons ────────────────────────────────────────────────────────
els.btnInstall.addEventListener("click", async () => {
  els.btnInstall.disabled = true;
  await window.wizard.install();
});
els.btnLogin.addEventListener("click", async () => {
  els.btnLogin.disabled = true;
  await window.wizard.login();
});
els.btnFinish.addEventListener("click", async () => {
  const payload = { provider: selectedProvider };
  if (selectedProvider === "gemini") {
    payload.geminiApiKey = els.apiKeyInput.value.trim();
  }
  await window.wizard.finish(payload);
});
els.apiKeyInput.addEventListener("input", () => {
  if (lastStatus) render(lastStatus);
});
els.btnCancel.addEventListener("click", async () => {
  await window.wizard.cancel();
});
els.btnOpenUrl.addEventListener("click", async () => {
  if (lastAuthUrl) await window.wizard.openUrl(lastAuthUrl);
});

// ── Live status pushes from main ────────────────────────────────────────
window.wizard.onStatus(render);
window.wizard.status().then(render);
