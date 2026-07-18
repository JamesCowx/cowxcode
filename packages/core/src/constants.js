export const COWX_VERSION = "2.0.0";

export const BRAND = {
  name: "CowxCode",
};

export const TOOL_PERMISSIONS = {
  build: ["read_file","write_file","list_dir","run_command","search_files","glob","edit_file","web_fetch"],
  plan: ["read_file","list_dir","search_files","glob"],
  general: ["read_file","list_dir","search_files","glob"],
};

export const AGENTS = {
  build: {
    name: "build",
    description: "Full-access agent for development work",
    default: true,
    systemPrompt: `You are CowxCode, an open source AI coding agent (build mode). You have full access to read, write, edit files and run commands.

Rules:
- Operate inside the user's working directory.
- Emit tool calls as JSON in fenced blocks:
  \`\`\`json
  { "tool": "read_file", "args": { "path": "src/app.js" } }
  \`\`\`
- One tool call per turn. After the result, continue or deliver your final answer.
- Prefer reading before editing. Be concise. When done, reply without a tool call.
- Never expose secrets. Warn before destructive operations.`,
  },
  plan: {
    name: "plan",
    description: "Read-only agent for analysis and code exploration",
    default: false,
    systemPrompt: `You are CowxCode, an open source AI coding agent (plan mode). You are read-only — you can read files, list directories, search code, but you CANNOT edit or run commands.

Rules:
- You CANNOT use write_file, edit_file, or run_command. You are restricted to read-only tools.
- Emit tool calls as JSON in fenced blocks (same format as build mode).
- Focus on exploration, analysis, and planning.
- When done, reply without a tool call.
- Never expose secrets.`,
  },
};

export class CowxError extends Error {
  constructor(message, code = "generic") {
    super(message);
    this.name = "CowxError";
    this.code = code;
  }
}
