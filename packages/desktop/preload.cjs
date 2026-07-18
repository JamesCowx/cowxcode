const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cowx", {
  send: (message, mode, model) => ipcRenderer.invoke("agent:send", { message, mode, model }),
  reset: () => ipcRenderer.invoke("agent:reset"),
  setMode: (mode) => ipcRenderer.invoke("agent:setMode", mode),
  getMode: () => ipcRenderer.invoke("agent:getMode"),
  saveSession: (name) => ipcRenderer.invoke("agent:saveSession", name),
  loadSession: (id) => ipcRenderer.invoke("agent:loadSession", id),
  listSessions: () => ipcRenderer.invoke("agent:listSessions"),
  listModels: () => ipcRenderer.invoke("agent:listModels"),
  pickFolder: () => ipcRenderer.invoke("fs:pickFolder"),
  getCwd: () => ipcRenderer.invoke("app:getCwd"),
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (cfg) => ipcRenderer.invoke("config:set", cfg),
  listTools: () => ipcRenderer.invoke("tools:list"),
  listAgents: () => ipcRenderer.invoke("agents:list"),
  onAgentEvent: (cb) => {
    const listener = (_e, value) => cb(value);
    ipcRenderer.on("agent:event", listener);
    return () => ipcRenderer.removeListener("agent:event", listener);
  },
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
  },
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
});
