const { contextBridge, ipcRenderer } = require("electron");

/* ---------------- config ---------------- */

function loadConfigFromArgv() {
  try {
    const configArg = process.argv.find((arg) =>
      arg.startsWith("--mindra-config=")
    );
    if (!configArg) return {};

    const b64 = configArg.substring("--mindra-config=".length);
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (e) {
    console.error("[preload] loadConfigFromArgv error:", e);
    return {};
  }
}

contextBridge.exposeInMainWorld("config", loadConfigFromArgv());

/* ---------------- window control ---------------- */

contextBridge.exposeInMainWorld("mindraWindow", {
  control(action) {
    return ipcRenderer.invoke("window-control", action);
  },
  minimize() {
    return ipcRenderer.invoke("window-control", "minimize");
  },
  maximize() {
    return ipcRenderer.invoke("window-control", "maximize");
  },
  close() {
    return ipcRenderer.invoke("window-control", "close");
  },
});

/* ---------------- shortcuts ---------------- */

contextBridge.exposeInMainWorld("mindraShortcuts", {
  onShortcut: (handler) => {
    if (typeof handler !== "function") return;

    ipcRenderer.removeAllListeners("mindra-shortcut");
    ipcRenderer.on("mindra-shortcut", (_event, payload) => {
      try {
        handler(payload);
      } catch (err) {
        console.error("[mindraShortcuts handler error]", err);
      }
    });
  },
});

/* ---------------- AI (統合版) ---------------- */

contextBridge.exposeInMainWorld("mindraAI", {
  getStatus: () => ipcRenderer.invoke("mindra-ai:get-status"),
  preloadModel: () => ipcRenderer.invoke("mindra-ai:preload"),
  setModel: (modelName) =>
    ipcRenderer.invoke("mindra-ai:set-model", modelName),
  chat: (message, options = {}) =>
    ipcRenderer.invoke("mindra-ai:chat", { message, ...options }),
  ask: async (message, history = []) => {
    const res = await ipcRenderer.invoke("mindra-ai:chat", {
      message,
      history,
    });

    if (!res || !res.ok) {
      return { ok: false, error: res?.error || "AIエラー" };
    }

    return { ok: true, message: res.text };
  },
});

/* ---------------- webview 取得ヘルパー ---------------- */

contextBridge.exposeInMainWorld("mindraViews", {
  getActiveWebview() {
    return document.querySelector("webview.active");
  },
  getAllWebviews() {
    return Array.from(document.querySelectorAll("webview"));
  },
  getSplitWebviews() {
    return Array.from(document.querySelectorAll(".split-view webview"));
  },
});
