const { contextBridge, ipcRenderer } = require("electron");

/* ---------------- settings bridge ---------------- */

contextBridge.exposeInMainWorld("mindraSettingsBridge", {
  // 一般フラグを main に送る（既存の adblock / popup 用）
  updateGeneralFlags(flags) {
    try {
      ipcRenderer.send("settings:update-general", flags || {});
    } catch (e) {
      console.error("[preload] updateGeneralFlags error:", e);
    }
  },

  // プロファイルショートカットを作る
  createProfileShortcut() {
    try {
      return ipcRenderer.invoke("profile:create-shortcut");
    } catch (e) {
      console.error("[preload] createProfileShortcut error:", e);
      return Promise.resolve({
        ok: false,
        error: e && e.message ? e.message : String(e),
      });
    }
  },

  // プロファイル一覧
  listProfiles() {
    try {
      return ipcRenderer.invoke("profile:list");
    } catch (e) {
      console.error("[preload] listProfiles error:", e);
      return Promise.resolve({
        ok: false,
        error: e && e.message ? e.message : String(e),
      });
    }
  },

  // プロファイル削除
  deleteProfile(profileId) {
    try {
      return ipcRenderer.invoke("profile:delete", profileId);
    } catch (e) {
      console.error("[preload] deleteProfile error:", e);
      return Promise.resolve({
        ok: false,
        error: e && e.message ? e.message : String(e),
      });
    }
  },
});

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

/* ---------------- AI ---------------- */

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

/* ---------------- 履歴 ---------------- */

contextBridge.exposeInMainWorld("mindraHistory", {
  async getRecent(limit = 200) {
    return await ipcRenderer.invoke("history:get-recent", { limit });
  },
});

/* ---------------- ログ出力 ---------------- */

contextBridge.exposeInMainWorld("mindraLog", {
  info(message, extra) {
    try {
      ipcRenderer.send("mindra-log", {
        level: "INFO",
        message,
        extra,
      });
    } catch (e) {
      console.error("[preload] mindraLog.info error:", e);
    }
  },
  warn(message, extra) {
    try {
      ipcRenderer.send("mindra-log", {
        level: "WARN",
        message,
        extra,
      });
    } catch (e) {
      console.error("[preload] mindraLog.warn error:", e);
    }
  },
  error(message, extra) {
    try {
      ipcRenderer.send("mindra-log", {
        level: "ERROR",
        message,
        extra,
      });
    } catch (e) {
      console.error("[preload] mindraLog.error error:", e);
    }
  },
});

/* ---------------- ログフォルダ操作 ---------------- */

contextBridge.exposeInMainWorld("mindraLogs", {
  async openFolder() {
    try {
      const res = await ipcRenderer.invoke("logs:open-folder");
      return res || { ok: false, error: "unknown error" };
    } catch (e) {
      console.error("[preload] mindraLogs.openFolder error:", e);
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
      };
    }
  },
});
