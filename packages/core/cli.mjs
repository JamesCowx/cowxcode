#!/usr/bin/env node
import { Agent, AGENTS } from "@cowxcode/core";
import { createInterface } from "node:readline";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
let cwd = process.cwd();
let mode = "build";
let providerConfig = { provider: "openai", model: "gpt-4o" };

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--mode" && args[i + 1]) { mode = args[++i]; }
  else if (args[i] === "--provider" && args[i + 1]) { providerConfig.provider = args[++i]; }
  else if (args[i] === "--model" && args[i + 1]) { providerConfig.model = args[++i]; }
  else if (args[i] === "--key" && args[i + 1]) { providerConfig.apiKey = args[++i]; }
  else if (args[i] === "--cwd" && args[i + 1]) { cwd = resolve(args[++i]); }
  else if (existsSync(resolve(cwd, args[i]))) { cwd = resolve(args[i]); }
}

// Load config from file if exists
const configFile = join(process.env.HOME || process.env.USERPROFILE || ".", ".cowxcode", "config.json");
try { const cfg = JSON.parse(readFileSync(configFile, "utf8")); providerConfig = { ...providerConfig, ...cfg.provider }; } catch {}

console.log("\n\u001b[1;31mCowxCode\u001b[0m v2.0.0 — The open source coding agent");
console.log(`Mode: \u001b[36m${mode}\u001b[0m  |  Provider: \u001b[36m${providerConfig.provider}\u001b[0m  |  Model: \u001b[36m${providerConfig.model || "default"}\u001b[0m`);
console.log(`CWD: \u001b[90m${cwd}\u001b[0m`);
console.log("Type a message. /plan, /build to switch modes. /quit to exit.\n");

const agent = new Agent({ providerConfig, cwd, mode, onEvent: (e) => {
  if (e.type === "tool_call") process.stdout.write(`\n\u001b[33m[${e.tool}]\u001b[0m `);
  if (e.type === "tool_result" && e.result?.ok !== undefined) process.stdout.write(`\u001b[32mOK\u001b[0m\n`);
}});

agent.setMode(mode);

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "\u001b[1;31m>\u001b[0m " });

rl.prompt();
rl.on("line", async (line) => {
  const input = line.trim();
  if (!input) { rl.prompt(); return; }
  if (input === "/quit" || input === "/exit") { console.log("Goodbye."); process.exit(0); }
  if (input === "/build") { agent.setMode("build"); mode = "build"; console.log("\u001b[36mSwitched to build mode.\u001b[0m"); rl.prompt(); return; }
  if (input === "/plan") { agent.setMode("plan"); mode = "plan"; console.log("\u001b[36mSwitched to plan mode.\u001b[0m"); rl.prompt(); return; }
  if (input === "/reset") { agent.reset(); console.log("\u001b[90mSession reset.\u001b[0m"); rl.prompt(); return; }
  if (input === "/save") { const id = await agent.saveSession(); console.log(`\u001b[32mSaved: ${id}\u001b[0m`); rl.prompt(); return; }
  if (input.startsWith("/load ")) { try { await agent.loadSession(input.slice(6).trim()); console.log("\u001b[32mLoaded.\u001b[0m"); } catch(e) { console.log(`\u001b[31m${e.message}\u001b[0m`); } rl.prompt(); return; }
  if (input === "/sessions") { const ss = await Agent.listSessions(); console.log(ss.map(s => `  ${s.id} — ${s.name} [${s.mode}]`).join("\n")); rl.prompt(); return; }

  process.stdout.write("\n\u001b[1;37mCowxCode:\u001b[0m ");
  for await (const chunk of agent.send(input)) {
    if (chunk.type === "text") process.stdout.write(chunk.text);
  }
  process.stdout.write("\n\n");
  rl.prompt();
});

rl.on("close", () => { console.log("\nGoodbye."); process.exit(0); });
