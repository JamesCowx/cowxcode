export class BaseProvider {
  constructor(config = {}) { this.config = config; this.name = config.name || "base"; }
  async *chat() { throw new Error("chat() not implemented"); }
  listModels() { return []; }
}

export class OpenAIProvider extends BaseProvider {
  constructor(config = {}) {
    super({ ...config, name: config.name || "openai" });
    this.baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    this.apiKey = config.apiKey || "";
    this.defaultModel = config.model || "gpt-4o";
  }
  listModels() {
    return [
      { id: "gpt-4o", name: "OpenAI GPT-4o" },
      { id: "gpt-4o-mini", name: "OpenAI GPT-4o Mini" },
      { id: "gpt-4-turbo", name: "OpenAI GPT-4 Turbo" },
      { id: "o4-mini", name: "OpenAI o4 Mini" },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-v3", name: "DeepSeek V3" },
      { id: "deepseek-r1", name: "DeepSeek R1" },
    ];
  }
  async *chat(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const body = { model, messages: messages.map((m) => ({ role: m.role, content: m.content })), stream: true };
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body), signal: options.signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); yield { type: "error", error: `Provider ${res.status}: ${txt}` }; return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (data === "[DONE]") return;
        try { const j = JSON.parse(data); const d = j.choices?.[0]?.delta?.content; if (d) yield { type: "text", text: d }; } catch {}
      }
    }
  }
}

export class AnthropicProvider extends BaseProvider {
  constructor(config = {}) {
    super({ ...config, name: config.name || "anthropic" });
    this.baseUrl = (config.baseUrl || "https://api.anthropic.com").replace(/\/$/, "");
    this.apiKey = config.apiKey || "";
    this.defaultModel = config.model || "claude-sonnet-4-0";
  }
  listModels() {
    return [
      { id: "claude-sonnet-4-0", name: "Claude Sonnet 4" },
      { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
      { id: "claude-haiku-4-0", name: "Claude Haiku 4" },
    ];
  }
  async *chat(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const convo = messages.filter((m) => m.role !== "system");
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: options.maxTokens || 4096, system: system || undefined, messages: convo.map((m) => ({ role: m.role, content: m.content })), stream: true }),
      signal: options.signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); yield { type: "error", error: `Provider ${res.status}: ${txt}` }; return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        try {
          const j = JSON.parse(data);
          if (j.type === "content_block_delta" && j.delta?.type === "text_delta") yield { type: "text", text: j.delta.text };
        } catch {}
      }
    }
  }
}

export class GoogleProvider extends BaseProvider {
  constructor(config = {}) {
    super({ ...config, name: config.name || "google" });
    this.apiKey = config.apiKey || "";
    this.defaultModel = config.model || "gemini-2.5-pro";
  }
  listModels() {
    return [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    ];
  }
  async *chat(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const convo = messages.filter((m) => m.role !== "system");
    const contents = convo.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const body = {
      contents,
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      generationConfig: { maxOutputTokens: options.maxTokens || 4096 },
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: options.signal,
      }
    );
    if (!res.ok) { const txt = await res.text().catch(() => ""); yield { type: "error", error: `Provider ${res.status}: ${txt}` }; return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        try {
          const j = JSON.parse(data);
          const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) yield { type: "text", text };
        } catch {}
      }
    }
  }
}

export class MistralProvider extends BaseProvider {
  constructor(config = {}) {
    super({ ...config, name: config.name || "mistral" });
    this.baseUrl = (config.baseUrl || "https://api.mistral.ai/v1").replace(/\/$/, "");
    this.apiKey = config.apiKey || "";
    this.defaultModel = config.model || "mistral-large-latest";
  }
  listModels() {
    return [
      { id: "mistral-large-latest", name: "Mistral Large" },
      { id: "mistral-small-latest", name: "Mistral Small" },
      { id: "codestral-latest", name: "Codestral" },
      { id: "ministral-8b-latest", name: "Ministral 8B" },
    ];
  }
  async *chat(messages, options = {}) {
    const model = options.model || this.defaultModel;
    const body = { model, messages: messages.map((m) => ({ role: m.role, content: m.content })), stream: true };
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body), signal: options.signal,
    });
    if (!res.ok) { const txt = await res.text().catch(() => ""); yield { type: "error", error: `Provider ${res.status}: ${txt}` }; return; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (data === "[DONE]") return;
        try { const j = JSON.parse(data); const d = j.choices?.[0]?.delta?.content; if (d) yield { type: "text", text: d }; } catch {}
      }
    }
  }
}

export function createProvider(config) {
  const p = (config.provider || "").toLowerCase();

  // OpenCode Zen (pay-as-you-go) and Go ($10/mo) presets
  if (p === "opencode-go" || p === "opencode-zen") {
    const base = p === "opencode-go"
      ? "https://opencode.ai/zen/go/v1"
      : "https://opencode.ai/zen/v1";
    return new OpenAIProvider({ ...config, provider: "openai", baseUrl: config.baseUrl || base, name: "opencode" });
  }

  switch (p) {
    case "deepseek": return new OpenAIProvider({ ...config, provider: "openai", baseUrl: config.baseUrl || "https://api.deepseek.com/v1", name: "deepseek" });
    case "mistral": return new MistralProvider(config);
    case "groq": return new OpenAIProvider({ ...config, provider: "openai", baseUrl: config.baseUrl || "https://api.groq.com/openai/v1", name: "groq" });
    case "xai": return new OpenAIProvider({ ...config, provider: "openai", baseUrl: config.baseUrl || "https://api.x.ai/v1", name: "xai" });
    case "perplexity": return new OpenAIProvider({ ...config, provider: "openai", baseUrl: config.baseUrl || "https://api.perplexity.ai", name: "perplexity" });
    case "openrouter": return new OpenAIProvider({ ...config, provider: "openai", baseUrl: config.baseUrl || "https://openrouter.ai/api/v1", name: "openrouter" });
    case "anthropic": return new AnthropicProvider(config);
    case "google":
    case "gemini": return new GoogleProvider(config);
    case "openai":
    case "ollama":
    case "lmstudio":
    default: return new OpenAIProvider(config);
  }
}

export function listProviderModels(config) {
  const p = (config.provider || "").toLowerCase();

  if (p === "mistral") return new MistralProvider(config).listModels();
  if (p === "groq") return [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B" },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
    { id: "gemma2-9b-it", name: "Gemma 2 9B" },
  ];
  if (p === "xai") return [
    { id: "grok-3", name: "Grok 3" },
    { id: "grok-3-mini", name: "Grok 3 Mini" },
    { id: "grok-2", name: "Grok 2" },
  ];
  if (p === "perplexity") return [
    { id: "sonar", name: "Sonar" },
    { id: "sonar-pro", name: "Sonar Pro" },
    { id: "sonar-reasoning", name: "Sonar Reasoning" },
  ];
  if (p === "openrouter") return [
    { id: "openai/gpt-4o", name: "OpenAI GPT-4o" },
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1" },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B" },
  ];

  // OpenCode Go / Zen model lists
  if (p === "opencode-go" || p === "opencode-zen") {
    return [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free" },
      { id: "gpt-5.6-sol", name: "GPT 5.6 Sol" },
      { id: "gpt-5.5", name: "GPT 5.5" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "qwen3.7-max", name: "Qwen 3.7 Max" },
      { id: "qwen3.7-plus", name: "Qwen 3.7 Plus" },
      { id: "glm-5.2", name: "GLM 5.2" },
      { id: "minimax-m3", name: "MiniMax M3" },
      { id: "kimi-k2.7-code", name: "Kimi K2.7 Code" },
    ];
  }

  if (p === "deepseek") {
    return [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-v3", name: "DeepSeek V3" },
      { id: "deepseek-r1", name: "DeepSeek R1" },
    ];
  }

  return createProvider(config).listModels();
}
