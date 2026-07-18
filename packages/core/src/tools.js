import { readFile, writeFile, readdir, mkdir, stat, access } from "node:fs/promises";
import { join, resolve, relative, dirname, basename, extname } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { TOOL_PERMISSIONS } from "./constants.js";

const execAsync = promisify(exec);

// Simple native glob — matches **, *, and extensions recursively.
async function nativeGlob(pattern, cwd) {
  const parts = pattern.replace(/\\/g, "/").split("/");
  const results = [];

  async function walk(dir, idx) {
    if (idx >= parts.length) { results.push(relative(cwd, dir)); return; }
    const seg = parts[idx];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      if (seg === "**") {
        // match everything recursively
        for (const e of entries) {
          const full = join(dir, e.name);
          if (e.isDirectory()) await walk(full, idx);
          if (e.isFile()) await walk(full, idx + 1);
          if (e.isDirectory()) await walk(full, idx + 1);
        }
      } else if (seg.includes("*")) {
        const re = new RegExp("^" + seg.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
        for (const e of entries) {
          if (re.test(e.name)) {
            if (e.isDirectory() && idx < parts.length - 1) await walk(join(dir, e.name), idx + 1);
            else if (e.isFile() && idx === parts.length - 1) results.push(relative(cwd, join(dir, e.name)));
          }
        }
      } else {
        const next = join(dir, seg);
        if (existsSync(next)) await walk(next, idx + 1);
      }
    } catch { /* skip inaccessible */ }
  }

  await walk(cwd, 0);
  return results;
}

const MAX_FILE_BYTES = 200_000;

export const TOOLS = [
  {
    name: "read_file",
    description: "Read a text file. Returns error for binary or oversized files.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async run({ path }, { cwd }) {
      const full = resolve(cwd, path);
      if (!existsSync(full)) return { error: `File not found: ${path}` };
      const s = await stat(full);
      if (s.size > MAX_FILE_BYTES) return { error: `File too large (${s.size} bytes).` };
      const content = await readFile(full, "utf8");
      return { path, content, lines: content.split("\n").length, size: s.size };
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    async run({ path, content }, { cwd }) {
      const full = resolve(cwd, path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, "utf8");
      return { ok: true, path: relative(cwd, full), lines: content.split("\n").length };
    },
  },
  {
    name: "edit_file",
    description: "Perform an exact string replacement in a file. Fails if oldString is not found or found multiple times.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        oldString: { type: "string", description: "Exact text to replace" },
        newString: { type: "string", description: "Text to replace with" },
      },
      required: ["path", "oldString", "newString"],
    },
    async run({ path, oldString, newString }, { cwd }) {
      const full = resolve(cwd, path);
      if (!existsSync(full)) return { error: `File not found: ${path}` };
      const content = await readFile(full, "utf8");
      if (oldString === newString) return { error: "oldString and newString are identical." };
      const idx = content.indexOf(oldString);
      if (idx === -1) return { error: "oldString not found in file." };
      const second = content.indexOf(oldString, idx + 1);
      if (second !== -1) return { error: "Found multiple matches for oldString. Provide more surrounding context to make it unique." };
      const updated = content.slice(0, idx) + newString + content.slice(idx + oldString.length);
      await writeFile(full, updated, "utf8");
      return { ok: true, path: relative(cwd, full), replacedAt: idx };
    },
  },
  {
    name: "list_dir",
    description: "List files and directories at a path.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Relative path. Defaults to working directory." } },
    },
    async run({ path = "." }, { cwd }) {
      const full = resolve(cwd, path);
      const entries = await readdir(full, { withFileTypes: true });
      return {
        entries: entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "dir" : "file",
        })),
      };
    },
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern (e.g. '**/*.js', 'src/**/*.ts').",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern relative to working directory." },
      },
      required: ["pattern"],
    },
    async run({ pattern }, { cwd }) {
      const files = await nativeGlob(pattern, cwd);
      return { matches: files.slice(0, 500), count: files.length };
    },
  },
  {
    name: "search_files",
    description: "Search file contents recursively for a regular expression.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "JavaScript regex pattern." },
        glob: { type: "string", description: "Optional glob filter, e.g. '*.js'." },
        path: { type: "string", description: "Optional subdirectory to search." },
      },
      required: ["pattern"],
    },
    async run({ pattern, glob: g = "**/*", path: sub = "." }, { cwd }) {
      const matches = [];
      const searchDir = resolve(cwd, sub);
      const files = await nativeGlob(g, searchDir);
      const re = new RegExp(pattern, "i");
      for (const file of files.slice(0, 500)) {
        try {
          const content = await readFile(join(searchDir, file), "utf8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) {
              matches.push({ file, line: i + 1, text: lines[i].trim().slice(0, 200) });
            }
          }
        } catch { /* skip unreadable */ }
        if (matches.length > 100) break;
      }
      return { matches, count: matches.length };
    },
  },
  {
    name: "run_command",
    description: "Execute a shell command in the working directory.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string", description: "Optional sub-directory." },
      },
      required: ["command"],
    },
    async run({ command, cwd: sub }, { cwd, abortSignal, agentMode }) {
      const runIn = sub ? resolve(cwd, sub) : cwd;
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: runIn, maxBuffer: 10 * 1024 * 1024, signal: abortSignal, windowsHide: true,
        });
        return { stdout, stderr, exitCode: 0 };
      } catch (e) {
        return { stdout: e.stdout || "", stderr: e.stderr || e.message, exitCode: e.code || 1 };
      }
    },
  },
  {
    name: "web_fetch",
    description: "Fetch content from a URL and return it as text or markdown. Use for reading documentation or researching APIs.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        format: { type: "string", enum: ["text", "markdown"], description: "Defaults to markdown." },
      },
      required: ["url"],
    },
    async run({ url, format = "markdown" }, { cwd, abortSignal }) {
      try {
        const res = await fetch(url, { signal: abortSignal, headers: { "User-Agent": "CowxCode/2.0" } });
        const text = await res.text();
        // return first 50000 chars to avoid huge payloads
        return { status: res.status, content: text.slice(0, 50000), truncated: text.length > 50000 };
      } catch (e) {
        return { error: `Fetch failed: ${e.message}` };
      }
    },
  },
];

export function getTool(name) {
  return TOOLS.find((t) => t.name === name);
}

export const TOOL_SPEC = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters,
}));

export function allowedToolSpecs(mode) {
  const allowed = (mode === "plan" || mode === "general")
    ? TOOL_PERMISSIONS.plan
    : TOOL_PERMISSIONS.build;
  return TOOL_SPEC.filter((t) => allowed.includes(t.name));
}
