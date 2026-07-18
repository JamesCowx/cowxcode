import { createProvider, listProviderModels } from "./provider.js";
import { TOOLS, getTool, TOOL_SPEC, allowedToolSpecs } from "./tools.js";
import { COWX_VERSION, AGENTS, CowxError, TOOL_PERMISSIONS } from "./constants.js";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const SESSIONS_DIR = join(homedir(), ".cowxcode", "sessions");

export class Agent {
  constructor({ providerConfig, cwd, onEvent, mode = "build" } = {}) {
    this.provider = createProvider(providerConfig || { provider: "openai" });
    this.providerConfig = providerConfig || { provider: "openai" };
    this.cwd = cwd || process.cwd();
    this.onEvent = onEvent || (() => {});
    this.mode = mode;
    this.messages = [{ role: "system", content: this._systemPrompt() }];
    this.abort = null;
    this.sessionId = null;
    this.sessionName = null;
  }

  _systemPrompt() {
    return AGENTS[this.mode]?.systemPrompt || AGENTS.build.systemPrompt;
  }

  _allowedTools() {
    return (this.mode === "plan" || this.mode === "general")
      ? TOOL_PERMISSIONS.plan
      : TOOL_PERMISSIONS.build;
  }

  setMode(mode) {
    if (!AGENTS[mode]) throw new CowxError(`Unknown agent mode: ${mode}`, "unknown_agent");
    this.mode = mode;
    this.messages = [{ role: "system", content: this._systemPrompt() }];
  }

  reset() {
    this.messages = [{ role: "system", content: this._systemPrompt() }];
  }

  setCwd(cwd) {
    this.cwd = cwd;
  }

  setProvider(config) {
    this.providerConfig = config;
    this.provider = createProvider(config);
  }

  listModels() {
    return listProviderModels(this.providerConfig);
  }

  /* ---------- Session persistence ---------- */
  async saveSession(name) {
    await mkdir(SESSIONS_DIR, { recursive: true });
    this.sessionId = this.sessionId || Date.now().toString(36);
    this.sessionName = name || `Session ${new Date().toLocaleString()}`;
    const data = {
      id: this.sessionId,
      name: this.sessionName,
      mode: this.mode,
      cwd: this.cwd,
      messages: this.messages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(SESSIONS_DIR, `${this.sessionId}.json`), JSON.stringify(data, null, 2), "utf8");
    return this.sessionId;
  }

  async loadSession(sessionId) {
    const fp = join(SESSIONS_DIR, `${sessionId}.json`);
    if (!existsSync(fp)) throw new CowxError(`Session not found: ${sessionId}`, "session_not_found");
    const data = JSON.parse(await readFile(fp, "utf8"));
    this.sessionId = data.id;
    this.sessionName = data.name;
    this.mode = data.mode || "build";
    this.messages = data.messages;
    this.cwd = data.cwd || this.cwd;
    this.onEvent({ type: "session_loaded", id: this.sessionId, name: this.sessionName, mode: this.mode });
    return { id: this.sessionId, name: this.sessionName, mode: this.mode };
  }

  static async listSessions() {
    try {
      await mkdir(SESSIONS_DIR, { recursive: true });
      const { readdir } = await import("node:fs/promises");
      const files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith(".json"));
      const sessions = [];
      for (const f of files) {
        try {
          const data = JSON.parse(await readFile(join(SESSIONS_DIR, f), "utf8"));
          sessions.push({ id: data.id, name: data.name, mode: data.mode, updatedAt: data.updatedAt });
        } catch {}
      }
      return sessions.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    } catch { return []; }
  }

  /* ---------- Main send loop ---------- */
  async *send(userMessage, { signal, mode } = {}) {
    if (mode && mode !== this.mode) this.setMode(mode);

    this.abort = signal;
    this.messages.push({ role: "user", content: userMessage });
    this.onEvent({ type: "user", text: userMessage });

    let collected = "";
    let toolPhase = false;
    const MAX_TOOL_ROUNDS = 15;

    const flushTool = async () => {
      const fence = collected.match(/```json\s*([\s\S]*?)```/);
      if (!fence) return false;
      try {
        const call = JSON.parse(fence[1].trim());
        const allowed = this._allowedTools();
        if (!allowed.includes(call.tool)) {
          this.onEvent({ type: "error", error: `Tool blocked in ${this.mode} mode: ${call.tool}` });
          return false;
        }
        const tool = getTool(call.tool);
        if (!tool) {
          this.onEvent({ type: "error", error: `Unknown tool: ${call.tool}` });
          return false;
        }
        this.onEvent({ type: "tool_call", tool: call.tool, args: call.args, mode: this.mode });
        const result = await tool.run(call.args || {}, {
          cwd: this.cwd,
          abortSignal: signal,
          agentMode: this.mode,
        });
        this.onEvent({ type: "tool_result", tool: call.tool, result });
        this.messages.push({
          role: "user",
          content: `Tool ${call.tool} result:\n${JSON.stringify(result, null, 2)}`,
        });
        collected = collected.replace(/```json\s*([\s\S]*?)```/, "").trim();
        return true;
      } catch (e) {
        this.onEvent({ type: "error", error: `Tool parse failed: ${e.message}` });
        return false;
      }
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let sawTool = false;
      for await (const chunk of this.provider.chat(this.messages, { signal, model: this.providerConfig.model })) {
        if (chunk.type === "error") {
          this.onEvent({ type: "error", error: chunk.error });
          yield { type: "error", error: chunk.error };
          return;
        }
        const text = chunk.text || "";
        collected += text;
        yield { type: "text", text };
        if (/```json\s*([\s\S]*?)```/.test(collected)) sawTool = true;
      }

      if (!sawTool) break;

      toolPhase = true;
      const executed = await flushTool();
      if (!executed) break;
      this.onEvent({ type: "thinking" });

      if (round === MAX_TOOL_ROUNDS - 1) {
        this.onEvent({ type: "error", error: "Reached max tool rounds; stopping." });
      }
    }

    this.messages.push({ role: "assistant", content: collected });
    this.onEvent({ type: "done", text: collected });
    yield { type: "done", text: collected, toolPhase, mode: this.mode };
  }
}

export { COWX_VERSION, TOOL_SPEC, TOOLS, TOOL_PERMISSIONS, AGENTS, createProvider, listProviderModels };
