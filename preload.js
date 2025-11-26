// preload.js
const { contextBridge, ipcRenderer } = require("electron");

/* =======================
   config を引数から復元
   ======================= */
function loadConfigFromArgs() {
  let env = "prod";
  let config = {};

  try {
    const argv = process.argv || [];

    const envArg = argv.find(
      (a) => typeof a === "string" && a.startsWith("--mindra-env=")
    );
    if (envArg) {
      const v = envArg.split("=")[1];
      if (v === "dev" || v === "prod") env = v;
    }

    const confArg = argv.find(
      (a) => typeof a === "string" && a.startsWith("--mindra-config=")
    );
    if (confArg) {
      const b64 = confArg.split("=")[1];
      // preload では atob が使える（ブラウザ側の関数）
      const json = atob(b64);
      const obj = JSON.parse(json);
      if (obj && typeof obj === "object") {
        config = obj;
      }
    }
  } catch (e) {
    console.error("[preload] loadConfigFromArgs error:", e);
  }

  config.__env = env;
  return config;
}

const config = loadConfigFromArgs();

// ウインドウ制御 API
contextBridge.exposeInMainWorld("mindraWindow", {
  control: (action) => ipcRenderer.invoke("window-control", action),
  getBounds: () => ipcRenderer.invoke("window-get-bounds"),
  setPosition: (x, y) =>
    ipcRenderer.invoke("window-set-position", { x, y }),
});

// ショートカット通知 API
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

// config を renderer に出す
contextBridge.exposeInMainWorld("config", config);
