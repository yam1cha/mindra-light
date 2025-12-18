const { contextBridge, ipcRenderer } = require("electron");

/* ---------------- settings bridge ---------------- */

/**
 * 設定更新 IPC を main プロセスへ橋渡しするブリッジ。
 */
contextBridge.exposeInMainWorld("mindraSettingsBridge", {
  /**
   * 一般設定フラグを main プロセスに送信する。
   * @param {Record<string, any>} flags 変更した設定フラグ。
   */
  updateGeneralFlags(flags) {
    try {
      ipcRenderer.send("settings:update-general", flags || {});
    } catch (e) {
      console.error("[preload] updateGeneralFlags error:", e);
    }
  },

  /**
   * 新しいプロファイルのショートカットを作成する。
   * @returns {Promise<{ok: boolean, profileId?: string, shortcutPath?: string, error?: string}>}
   */
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

  /**
   * 既存プロファイルの一覧を取得する。
   * @returns {Promise<{ok: boolean, profiles?: Array<{id: string, exists: boolean}>, error?: string}>}
   */
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

  /**
   * 指定したプロファイルを削除する。
   * @param {string} profileId 削除対象のプロファイル ID。
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
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

/**
 * 起動引数から base64 で渡された設定を読み込む。
 * @returns {Record<string, any>} デコードされた設定オブジェクト。
 */
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
  /**
   * 指定されたアクションでウィンドウを制御する。
   * @param {string} action 実行するウィンドウ操作。
   * @returns {Promise<any>}
   */
  control(action) {
    return ipcRenderer.invoke("window-control", action);
  },
  /**
   * ウィンドウを最小化する。
   * @returns {Promise<any>}
   */
  minimize() {
    return ipcRenderer.invoke("window-control", "minimize");
  },
  /**
   * ウィンドウを最大化する。
   * @returns {Promise<any>}
   */
  maximize() {
    return ipcRenderer.invoke("window-control", "maximize");
  },
  /**
   * ウィンドウを閉じる。
   * @returns {Promise<any>}
   */
  close() {
    return ipcRenderer.invoke("window-control", "close");
  },
});

/* ---------------- shortcuts ---------------- */

contextBridge.exposeInMainWorld("mindraShortcuts", {
  /**
   * グローバルショートカットを受け取るハンドラを登録する。
   * @param {(payload: any) => void} handler 受信処理を行う関数。
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

/* ---------------- AI ---------------- */

contextBridge.exposeInMainWorld("mindraAI", {
  /**
   * AI バックエンドのステータスを取得する。
   * @returns {Promise<any>}
   */
  getStatus: () => ipcRenderer.invoke("mindra-ai:get-status"),
  /**
   * モデルを事前読み込みする。
   * @returns {Promise<any>}
   */
  preloadModel: () => ipcRenderer.invoke("mindra-ai:preload"),
  /**
   * 利用するモデルを設定する。
   * @param {string} modelName モデル名。
   * @returns {Promise<any>}
   */
  setModel: (modelName) =>
    ipcRenderer.invoke("mindra-ai:set-model", modelName),
  /**
   * チャット API を呼び出す。
   * @param {string} message 送信するメッセージ。
   * @param {Record<string, any>} [options] 追加オプション。
   * @returns {Promise<any>}
   */
  chat: (message, options = {}) =>
    ipcRenderer.invoke("mindra-ai:chat", { message, ...options }),
  /**
   * 省略形のチャット呼び出し（成功時にメッセージのみ返却）。
   * @param {string} message 送信するメッセージ。
   * @param {Array<any>} [history] 過去の会話履歴。
   * @returns {Promise<{ok: boolean, message?: string, error?: string}>}
   */
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
  /**
   * 現在アクティブな webview を取得する。
   * @returns {Element|null}
   */
  getActiveWebview() {
    return document.querySelector("webview.active");
  },
  /**
   * 全ての webview 要素を取得する。
   * @returns {Element[]}
   */
  getAllWebviews() {
    return Array.from(document.querySelectorAll("webview"));
  },
  /**
   * 分割ビュー内の webview 要素を取得する。
   * @returns {Element[]}
   */
  getSplitWebviews() {
    return Array.from(document.querySelectorAll(".split-view webview"));
  },
});

/* ---------------- 履歴 ---------------- */

contextBridge.exposeInMainWorld("mindraHistory", {
  /**
   * 直近の履歴を取得する。
   * @param {number} [limit=200] 取得件数の上限。
   * @returns {Promise<any>}
   */
  async getRecent(limit = 200) {
    return await ipcRenderer.invoke("history:get-recent", { limit });
  },
});

/* ---------------- ログ出力 ---------------- */

contextBridge.exposeInMainWorld("mindraLog", {
  /**
   * INFO レベルのログを送信する。
   * @param {string} message ログメッセージ。
   * @param {Record<string, any>} [extra] 追加情報。
   */
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
  /**
   * WARN レベルのログを送信する。
   * @param {string} message ログメッセージ。
   * @param {Record<string, any>} [extra] 追加情報。
   */
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
  /**
   * ERROR レベルのログを送信する。
   * @param {string} message ログメッセージ。
   * @param {Record<string, any>} [extra] 追加情報。
   */
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
  /**
   * ログフォルダを開く。
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
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

/* ---------------- ダウンロード ---------------- */

contextBridge.exposeInMainWorld("mindraDownloadEvents", {
  /**
   * ダウンロード開始イベントを受け取る。
   * @param {(payload: any) => void} callback 受信時に呼び出す関数。
   */
  onStarted(callback) {
    ipcRenderer.on("mindra-download-started", (_event, payload) => {
      callback(payload);
    });
  },
  /**
   * ダウンロード更新イベントを受け取る。
   * @param {(payload: any) => void} callback 受信時に呼び出す関数。
   */
  onUpdated(callback) {
    ipcRenderer.on("mindra-download-updated", (_event, payload) => {
      callback(payload);
    });
  },
  /**
   * ダウンロード完了イベントを受け取る。
   * @param {(payload: any) => void} callback 受信時に呼び出す関数。
   */
  onDone(callback) {
    ipcRenderer.on("mindra-download-done", (_event, payload) => {
      callback(payload);
    });
  },
});

contextBridge.exposeInMainWorld("mindraDownloads", {
  /**
   * ダウンロードフォルダを開く。
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async openFolder(savePath) {
    try {
      const res = await ipcRenderer.invoke("downloads:open-folder", savePath);
      return res || { ok: false, error: "unknown error" };
    } catch (e) {
      console.error("[preload] mindraDownloads.openFolder error:", e);
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
      };
    }
  },

  /**
   * 進行中のダウンロードを中断する。
   * @param {string} downloadId 対象ダウンロードの ID。
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async cancel(downloadId) {
    try {
      const res = await ipcRenderer.invoke("downloads:cancel", downloadId);
      return res || { ok: false, error: "unknown error" };
    } catch (e) {
      console.error("[preload] mindraDownloads.cancel error:", e);
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
      };
    }
  },

  /**
   * 中断されたダウンロードを再開する。
   * @param {string} downloadId 対象ダウンロードの ID。
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async resume(downloadId) {
    try {
      const res = await ipcRenderer.invoke("downloads:resume", downloadId);
      return res || { ok: false, error: "unknown error" };
    } catch (e) {
      console.error("[preload] mindraDownloads.resume error:", e);
      return {
        ok: false,
        error: e && e.message ? e.message : String(e),
      };
    }
  },
});
