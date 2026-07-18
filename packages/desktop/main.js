import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { Agent } from "@cowxcode/core";
import { TOOL_SPEC, listProviderModels, AGENTS } from "@cowxcode/core";

// Fix GPU cache path to avoid OneDrive permissions issues
const userDataPath = join(homedir(), "AppData", "Local", "CowxCode");
app.setPath("userData", userDataPath);
app.setPath("cache", join(userDataPath, "Cache"));
app.setPath("crashDumps", join(userDataPath, "Crashpad"));
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let agent = null;
let cwd = app.getPath("documents");
let currentMode = "build";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    frame: false, backgroundColor: "#0a0a0b", titleBarStyle: "hidden",
    titleBarOverlay: false, trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  mainWindow.loadFile(join(__dirname, "ui", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

function configPath() {
  const p = join(app.getPath("userData"), "cowxcode.json");
  mkdirSync(dirname(p), { recursive: true });
  return p;
}

function loadConfig() {
  try { return JSON.parse(readFileSync(configPath(), "utf8")); } catch { return {}; }
}

function saveConfig(cfg) {
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}

function getAgent() {
  if (!agent) {
    const cfg = loadConfig();
    agent = new Agent({
      providerConfig: cfg.provider || { provider: "openai", model: "gpt-4o" },
      cwd, mode: currentMode,
      onEvent: (e) => { if (mainWindow) mainWindow.webContents.send("agent:event", e); },
    });
  }
  return agent;
}

ipcMain.handle("agent:send", async (_e, { message, mode, model }) => {
  const a = getAgent();
  if (mode && mode !== a.mode) a.setMode(mode);
  if (model) a.providerConfig.model = model;
  const out = [];
  for await (const chunk of a.send(message)) { out.push(chunk); }
  return out;
});

ipcMain.handle("agent:reset", async () => { getAgent().reset(); return true; });
ipcMain.handle("agent:setMode", async (_e, mode) => {
  currentMode = mode;
  getAgent().setMode(mode);
  return { mode, description: AGENTS[mode]?.description };
});

ipcMain.handle("agent:getMode", async () => currentMode);

ipcMain.handle("agent:saveSession", async (_e, name) => {
  return await getAgent().saveSession(name);
});

ipcMain.handle("agent:loadSession", async (_e, id) => {
  return await getAgent().loadSession(id);
});

ipcMain.handle("agent:listSessions", async () => {
  return await Agent.listSessions();
});

ipcMain.handle("agent:listModels", async () => {
  const a = getAgent();
  return a.listModels();
});

ipcMain.handle("app:openExternal", async (_e, url) => {
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("fs:pickFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  if (!result.canceled && result.filePaths[0]) {
    cwd = result.filePaths[0]; getAgent().setCwd(cwd); return cwd;
  }
  return cwd;
});

ipcMain.handle("app:getCwd", () => cwd);
ipcMain.handle("config:get", () => loadConfig());
ipcMain.handle("config:set", (_e, cfg) => {
  saveConfig(cfg); agent = null; setTimeout(() => getAgent(), 100); return cfg;
});
ipcMain.handle("tools:list", () => TOOL_SPEC);
ipcMain.handle("agents:list", () => AGENTS);

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); });
ipcMain.on("window:close", () => mainWindow?.close());

// Avoid OneDrive file locking issues with GPU cache
app.setPath("userData", join(homedir(), "AppData", "Local", "CowxCode"));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
