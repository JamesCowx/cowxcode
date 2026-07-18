if (!window.cowx) {
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#e10600;font-family:sans-serif;font-size:18px">Preload failed. window.cowx is undefined.</div>';
  throw new Error("Preload not available");
}

const { send, reset, setMode, getMode, saveSession, loadSession, listSessions, listModels, pickFolder, getCwd, getConfig, setConfig, listTools, listAgents, onAgentEvent } = window.cowx;

const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages");
const inputEl = $("#input");
const sendBtn = $("#btn-send");
const modelSelect = $("#model-select");

let cwd = "";
let agentMode = "build";
let assistantEl = null;
let thinkingEl = null;

$("#btn-min").onclick = () => window.cowx.window.minimize();
$("#btn-max").onclick = () => window.cowx.window.maximize();
$("#btn-close").onclick = () => window.cowx.window.close();

/* ---------- Sidebar navigation ---------- */
document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
  item.onclick = () => {
    document.querySelectorAll(".nav-item[data-view]").forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    $("#view-" + item.dataset.view).classList.add("active");
    if (item.dataset.view === "sessions") refreshSessions();
  };
});

/* ---------- Folder ---------- */
async function refreshCwd() { cwd = await getCwd(); $("#cwd-path").textContent = cwd; }
$("#change-folder").onclick = async () => { await pickFolder(); refreshCwd(); };

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, isErr = false) {
  const t = $("#toast"); t.textContent = msg; t.classList.toggle("err", isErr); t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ---------- Message rendering ---------- */
function addMessage(role, text) {
  const el = document.createElement("div"); el.className = "msg " + role;
  const avatar = role === "user" ? "You" : "Cx";
  el.innerHTML = `<div class="avatar">${avatar}</div><div class="body"><div class="role-name">${role === "user" ? "You" : "CowxCode (" + agentMode + ")"}</div><div class="content"></div></div>`;
  el.querySelector(".content").textContent = text;
  messagesEl.appendChild(el); scrollBottom(); return el;
}

function addToolCall(tool, args, result) {
  const el = document.createElement("div"); el.className = "msg assistant";
  const body = document.createElement("div"); body.className = "body";
  const tc = document.createElement("div"); tc.className = "tool-call";
  const argsStr = typeof args === "string" ? args : JSON.stringify(args, null, 2);
  const resStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  tc.innerHTML = `<div class="tc-head"><span>${tool}</span></div><div class="tc-body">${resStr}</div>`;
  body.appendChild(tc);
  const av = document.createElement("div"); av.className = "avatar"; av.textContent = "Cx";
  el.appendChild(av); el.appendChild(body);
  messagesEl.appendChild(el); scrollBottom();
}

function addThinking() {
  const el = document.createElement("div"); el.className = "thinking";
  el.innerHTML = `<span class="dot-pulse"></span> CowxCode (${agentMode}) is working...`;
  messagesEl.appendChild(el); scrollBottom(); return el;
}

function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function showEmptyState() {
  const wrap = document.createElement("div"); wrap.className = "empty-state"; wrap.id = "empty-state";
  const planNote = agentMode === "plan"
    ? `<div class="plan-note">Read-only mode — I can explore, search and explain code but won&rsquo;t edit or run anything.</div>`
    : "";
  const suggestions = agentMode === "plan"
    ? `<button class="suggestion" data-q="Explain what this project does"><div class="s-title">Explore</div><div class="s-sub">Explain this project</div></button>
       <button class="suggestion" data-q="Find all TODO comments and dead code"><div class="s-title">Search</div><div class="s-sub">Find patterns</div></button>
       <button class="suggestion" data-q="Review this codebase for bugs and propose a plan"><div class="s-title">Review</div><div class="s-sub">Plan fixes</div></button>
       <button class="suggestion" data-q="Outline how to add a new feature here"><div class="s-title">Plan</div><div class="s-sub">Design changes</div></button>`
    : `<button class="suggestion" data-q="Explain what this project does"><div class="s-title">Explore</div><div class="s-sub">Explain this project</div></button>
       <button class="suggestion" data-q="Write a hello world function"><div class="s-title">Build</div><div class="s-sub">Create new code</div></button>
       <button class="suggestion" data-q="Find all TODO comments in the code"><div class="s-title">Search</div><div class="s-sub">Find patterns</div></button>
       <button class="suggestion" data-q="Review this codebase for bugs"><div class="s-title">Debug</div><div class="s-sub">Find issues</div></button>`;
  wrap.innerHTML = `<div class="big-logo"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="70" height="70"><defs><linearGradient id="cxr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff3b2f"/><stop offset="100%" stop-color="#8c0400"/></linearGradient></defs><circle cx="60" cy="60" r="46" fill="none" stroke="#2a2a2e" stroke-width="2" stroke-dasharray="4 12"><animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="20s" repeatCount="indefinite"/></circle><polygon points="60,20 92,38 92,82 60,100 28,82 28,38" fill="#0a0a0b" stroke="url(#cxr)" stroke-width="3.5" stroke-linejoin="round"/><path d="M72 47 A18 18 0 1 0 72 78" fill="none" stroke="white" stroke-width="8" stroke-linecap="round"/></svg></div>
    <h1><span>C</span>owxCode</h1>
    <p>${agentMode === "plan" ? "Read-only analysis mode. Explore, search and plan changes safely." : "The open source coding agent. Ask me to build, refactor, debug or explain code in your project folder."}</p>
    ${planNote}
    <div class="suggestions">${suggestions}</div>`;
  messagesEl.appendChild(wrap);
  wrap.querySelectorAll(".suggestion").forEach((b) => { b.onclick = () => { inputEl.value = b.dataset.q; submit(); }; });
}

function updatePlanBanner() {
  let banner = document.getElementById("plan-banner");
  if (agentMode === "plan") {
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "plan-banner";
      banner.className = "plan-banner";
      banner.innerHTML = "&#128274; Plan mode &middot; read-only &middot; no writes or commands";
      const view = document.getElementById("view-chat");
      const header = view.querySelector(".chat-header");
      header.insertAdjacentElement("afterend", banner);
    }
  } else if (banner) {
    banner.remove();
  }
}

function clearEmpty() { const e = document.getElementById("empty-state"); if (e) e.remove(); }

/* ---------- Agent event streaming ---------- */
onAgentEvent((e) => {
  switch (e.type) {
    case "tool_call":
      thinkingEl?.remove(); thinkingEl = null;
      if (e.mode === "plan") {
        addToolCall(e.tool, e.args, "read-only — plan mode (no execution)");
        const last = messagesEl.querySelectorAll(".tool-call");
        const node = last[last.length - 1];
        if (node) node.classList.add("plan-tool");
      } else {
        addToolCall(e.tool, e.args, "running...");
      }
      break;
    case "tool_result":
      const calls = messagesEl.querySelectorAll(".tool-call");
      const last = calls[calls.length - 1];
      if (last) last.querySelector(".tc-body").textContent = JSON.stringify(e.result, null, 2);
      break;
    case "thinking":
      thinkingEl = addThinking(); break;
    case "text":
      clearEmpty();
      if (!assistantEl) { thinkingEl?.remove(); thinkingEl = null; assistantEl = addMessage("assistant", ""); }
      assistantEl.querySelector(".content").textContent += e.text;
      scrollBottom(); break;
    case "done": assistantEl = null; break;
    case "session_loaded":
      clearEmpty(); messagesEl.innerHTML = "";
      showEmptyState();
      toast(`Session loaded: ${e.name || e.id}`, false); break;
    case "error":
      thinkingEl?.remove();
      toast(e.error, true);
      addMessage("assistant", "" + e.error); assistantEl = null; break;
  }
});

/* ---------- Submit ---------- */
async function submit() {
  const text = inputEl.value.trim(); if (!text) return;
  clearEmpty(); addMessage("user", text); inputEl.value = ""; autoResize(); sendBtn.disabled = true; assistantEl = null;
  try {
    const model = modelSelect ? modelSelect.value : null;
    await send(text, agentMode, model);
  } catch (err) { toast(err.message || "Request failed", true); }
  finally { sendBtn.disabled = false; inputEl.focus(); }
}

sendBtn.onclick = submit;
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  if (e.key === "Tab") { e.preventDefault(); switchAgent(); }
});

function autoResize() { inputEl.style.height = "auto"; inputEl.style.height = Math.min(inputEl.scrollHeight, 180) + "px"; }
inputEl.addEventListener("input", autoResize);

/* ---------- Agent switching ---------- */
async function switchAgent() {
  const modes = ["build", "plan"];
  const idx = (modes.indexOf(agentMode) + 1) % modes.length;
  agentMode = modes[idx];
  await setMode(agentMode);
  updateAgentUI();
  toast(`Switched to ${agentMode} mode`);
}

$("#agent-build").onclick = async () => { agentMode = "build"; await setMode("build"); updateAgentUI(); };
$("#agent-plan").onclick = async () => { agentMode = "plan"; await setMode("plan"); updateAgentUI(); };

function updateAgentUI() {
  document.querySelectorAll(".agent-tab").forEach(t => t.classList.remove("active"));
  $("#agent-" + agentMode).classList.add("active");
  $("#mode-tag").textContent = agentMode;
  $("#mode-tag").className = "mode-tag " + (agentMode === "plan" ? "plan" : "");
  updatePlanBanner();
}

/* ---------- Header buttons ---------- */
$("#btn-new").onclick = async () => { await reset(); messagesEl.innerHTML = ""; showEmptyState(); };
$("#btn-save-session").onclick = async () => {
  const name = `Session ${new Date().toLocaleString()}`;
  const id = await saveSession(name);
  toast(`Session saved: ${id}`);
};

/* ---------- Settings ---------- */
async function loadSettings() {
  const cfg = await getConfig();
  const p = cfg.provider || {};
  $("#cfg-provider").value = p.provider || "openai";
  $("#cfg-baseurl").value = p.baseUrl || "";
  $("#cfg-key").value = p.apiKey || "";
  $("#cfg-model").value = p.model || "";
}
$("#cfg-provider").onchange = () => {
  const pv = $("#cfg-provider").value;
  if (pv === "opencode-go") { $("#cfg-baseurl").value = "https://opencode.ai/zen/go/v1"; $("#cfg-baseurl").placeholder = "https://opencode.ai/zen/go/v1"; }
  else if (pv === "opencode-zen") { $("#cfg-baseurl").value = "https://opencode.ai/zen/v1"; $("#cfg-baseurl").placeholder = "https://opencode.ai/zen/v1"; }
  else if (pv === "deepseek") { $("#cfg-baseurl").value = "https://api.deepseek.com/v1"; $("#cfg-baseurl").placeholder = "https://api.deepseek.com/v1"; }
  else if (pv === "ollama") $("#cfg-baseurl").value = "http://localhost:11434/v1";
  else if (pv === "lmstudio") $("#cfg-baseurl").value = "http://localhost:1234/v1";
  else if (pv === "anthropic") $("#cfg-baseurl").value = "https://api.anthropic.com";
  else if (pv === "mistral") $("#cfg-baseurl").value = "https://api.mistral.ai/v1";
  else if (pv === "groq") $("#cfg-baseurl").value = "https://api.groq.com/openai/v1";
  else if (pv === "xai") $("#cfg-baseurl").value = "https://api.x.ai/v1";
  else if (pv === "perplexity") $("#cfg-baseurl").value = "https://api.perplexity.ai";
  else if (pv === "openrouter") $("#cfg-baseurl").value = "https://openrouter.ai/api/v1";
  else if (pv === "google" || pv === "gemini") { $("#cfg-baseurl").value = ""; $("#cfg-baseurl").placeholder = "N/A (API key only)"; }
  else { $("#cfg-baseurl").value = "https://api.openai.com/v1"; $("#cfg-baseurl").placeholder = "https://api.openai.com/v1"; }
};
$("#btn-save").onclick = async () => {
  const cfg = {
    provider: $("#cfg-provider").value,
    baseUrl: $("#cfg-baseurl").value,
    apiKey: $("#cfg-key").value,
    model: $("#cfg-model").value,
  };
  await setConfig(cfg);
  toast("Configuration saved. Agent restarted.");
};
$("#btn-reset-config").onclick = async () => { await reset(); toast("Session reset"); };

/* ---------- Model selector ---------- */
async function refreshModelSelector() {
  try {
    const models = await listModels();
    if (models && models.length) {
      const cfg = await getConfig();
      const currentModel = (cfg.provider && cfg.provider.model) || "";
      modelSelect.innerHTML = models.map(m => `<option value="${m.id}" ${m.id === currentModel ? "selected" : ""}>${m.name}</option>`).join("");
      modelSelect.onchange = async () => {
        const cfg = await getConfig();
        const p = cfg.provider || {};
        p.model = modelSelect.value;
        await setConfig({ provider: p });
      };
    }
  } catch { modelSelect.innerHTML = "<option>Default model</option>"; }
}

/* ---------- Sessions list ---------- */
async function refreshSessions() {
  const sessions = await listSessions();
  const el = $(".sessions-list");
  el.innerHTML = sessions.map(s =>
    `<div class="session-item" data-id="${s.id}">
      <span>${s.name || s.id}</span>
      <span class="s-mode">${s.mode || "build"}</span>
    </div>`
  ).join("");
  el.querySelectorAll(".session-item").forEach(item => {
    item.onclick = async () => {
      try {
        await loadSession(item.dataset.id);
        agentMode = await getMode();
        updateAgentUI();
        messagesEl.innerHTML = ""; showEmptyState();
      } catch (e) { toast(e.message, true); }
    };
  });
}

/* ---------- Tools view ---------- */
async function refreshTools() {
  const tools = await listTools();
  const grid = $("#tools-grid");
  grid.innerHTML = tools.map(t => `<div class="tool-card"><div class="t-name">${t.name}</div><div class="t-desc">${t.description}</div></div>`).join("");
}

/* ---------- Init ---------- */
(async () => {
  try {
    await refreshCwd();
  } catch (e) {
    console.error("refreshCwd error:", e);
    $("#cwd-path").textContent = "Error loading folder";
  }
  try {
    await loadSettings();
  } catch (e) {
    console.error("loadSettings error:", e);
    toast("Failed to load settings: " + e.message, true);
  }
  try {
    await refreshTools();
  } catch (e) {
    console.error("refreshTools error:", e);
  }
  try {
    await refreshModelSelector();
  } catch (e) {
    console.error("refreshModelSelector error:", e);
    if (modelSelect) modelSelect.innerHTML = "<option>Default model</option>";
  }
  try {
    agentMode = await getMode();
    updateAgentUI();
  } catch (e) {
    console.error("getMode error:", e);
  }
  try {
    showEmptyState();
  } catch (e) {
    console.error("showEmptyState error:", e);
  }
  if (inputEl) {
    try { inputEl.focus(); } catch {}
  }
})();
