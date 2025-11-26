// preload.js
const { contextBridge, ipcRenderer } = require("electron");

// ウインドウ制御 API
contextBridge.exposeInMainWorld("mindraWindow", {
  control: (action) => ipcRenderer.invoke("window-control", action),
  getBounds: () => ipcRenderer.invoke("window-get-bounds"),
  setPosition: (x, y) =>
    ipcRenderer.invoke("window-set-position", { x, y }),
});

// ショートカット通知 API
contextBridge.exposeInMainWorld("mindraShortcuts", {
  /**
   * main.js から送られてくるショートカットイベントを購読する
   */
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

/* ===========================================================
   コンフィグ読み込み
   =========================================================== */

const fs = require("fs");
const path = require("path");

function loadConfig() {
  const isDev =
    !process.env.NODE_ENV ||
    process.env.NODE_ENV === "development" ||
    !process.argv[0].includes("app.asar");

  const filename = isDev ? "config.dev.json" : "config.prod.json";
  const configPath = path.join(__dirname, "config", filename);

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load config:", err);
    return {};
  }
}

const config = loadConfig();

contextBridge.exposeInMainWorld("config", config);
