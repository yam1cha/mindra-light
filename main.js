const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const AdBlockClient = require("adblock-rs");

let mainWindow = null;

// ===== ウインドウ位置・サイズ保存用 =====
const windowStatePath = path.join(app.getPath("userData"), "window-state.json");

async function loadWindowState() {
  try {
    const text = await fs.readFile(windowStatePath, "utf8");
    const state = JSON.parse(text);
    if (!state || typeof state !== "object") return {};
    return state;
  } catch {
    return {};
  }
}

async function saveWindowState() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const bounds = mainWindow.getBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: mainWindow.isMaximized(),
      isFullScreen: mainWindow.isFullScreen(),
    };

    await fs.writeFile(
      windowStatePath,
      JSON.stringify(state, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("[window-state] save error:", err);
  }
}

/* ===========================================================
   adblock-rs + EasyList / EasyPrivacy ベースの広告ブロック
   （YouTube 本体は allowlist で守る）
   =========================================================== */

let adblockEngineReady = false;
let adblockClient = null;

/**
 * EasyList / EasyPrivacy のフィルタを読み込んで adblock-rs の Engine を初期化。
 */
async function initAdblockEngine() {
  try {
    const filterDir = path.join(__dirname, "filters");
    const easyListPath = path.join(filterDir, "easylist.txt");
    const easyPrivacyPath = path.join(filterDir, "easyprivacy.txt");

    const easyListRaw = fsSync.readFileSync(easyListPath, { encoding: "utf-8" });
    const easyPrivacyRaw = fsSync.readFileSync(easyPrivacyPath, {
      encoding: "utf-8",
    });

    const easyListRules = easyListRaw.split(/\r?\n/);
    const easyPrivacyRules = easyPrivacyRaw.split(/\r?\n/);
    const rules = easyListRules.concat(easyPrivacyRules);

    const filterSet = new AdBlockClient.FilterSet(true);
    filterSet.addFilters(rules);

    // ひとまず uBlock の scriptlet / redirect などは使わず、ネットワークブロックだけに絞る
    adblockClient = new AdBlockClient.Engine(filterSet, true);

    adblockEngineReady = true;
    console.log(
      "[adblock] Engine initialized (EasyList + EasyPrivacy, rules:",
      rules.length,
      ")"
    );
  } catch (error) {
    console.error("[adblock] initAdblockEngine failed:", error);
    adblockEngineReady = false;
    adblockClient = null;
  }
}

/**
 * adblock-rs を使って URL をブロックするか判定。
 * うまく初期化できていない場合は false（ブロックしない）。
 */
function shouldBlockUrlWithEngine(urlString, resourceType, referrer) {
  if (!adblockEngineReady || !adblockClient) return false;

  let u;
  try {
    u = new URL(urlString);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();

  // ▼ 完全に許可するホスト（YouTube を絶対壊さない）
  const allowDomains = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "ytimg.com",
    "i.ytimg.com",
    "googlevideo.com",
  ];

  if (
    allowDomains.some(
      (d) => host === d || host.endsWith("." + d.replace(/^\./, ""))
    )
  ) {
    return false;
  }

  try {
    const result = adblockClient.check(
      urlString,
      referrer || "",
      resourceType || "other"
    );
    return !!(result && result.matched);
  } catch (e) {
    console.error("[adblock] check failed:", e);
    return false;
  }
}

/**
 * 指定セッション(ses)に対して webRequest フックを仕込む
 */
function applyAdblockToSession(ses) {
  if (!ses) return;

  try {
    ses.webRequest.onBeforeRequest(
      { urls: ["*://*/*"] },
      (details, callback) => {
        const { url, resourceType, referrer } = details;

        if (shouldBlockUrlWithEngine(url, resourceType, referrer)) {
          return callback({ cancel: true });
        }
        return callback({});
      }
    );
  } catch (e) {
    console.error("applyAdblockToSession error:", e);
  }
}

// 広告ブロッカー全体のセットアップ
async function setupAdBlocker() {
  try {
    await initAdblockEngine();

    const sessions = new Set();

    if (session.defaultSession) {
      sessions.add(session.defaultSession);
    }

    // プロファイル用セッション（persist:profile-1〜10）
    for (let i = 1; i <= 10; i++) {
      const ses = session.fromPartition(`persist:profile-${i}`);
      if (ses) sessions.add(ses);
    }

    for (const ses of sessions) {
      applyAdblockToSession(ses);
    }
  } catch (error) {
    console.error("setupAdBlocker error:", error);
  }
}

/* ===========================================================
   ここから下は既存のブラウザ機能（ショートカット・ウインドウ等）
   =========================================================== */

function sendShortcutToRenderer(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send("mindra-shortcut", payload);
  } catch (_) {
    // ignore
  }
}

function attachShortcutsToWebContents(wc) {
  const isMac = process.platform === "darwin";

  wc.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const { key, code, control, shift, alt, meta } = input;
    const primary = isMac ? meta : control; // Cmd or Ctrl
    const k = key.length === 1 ? key.toLowerCase() : key;

    const send = (type, extra = {}) => {
      event.preventDefault();
      sendShortcutToRenderer({ type, ...extra });
    };

    // ===== タブ操作 =====
    if (primary && !shift && !alt && k === "t") {
      return send("new-tab");
    }
    if (primary && !shift && !alt && k === "w") {
      return send("close-tab");
    }
    if (primary && shift && !alt && k === "t") {
      return send("restore-tab");
    }

    // ===== ナビゲーション (Ctrl+[ ], Ctrl+], Alt+←/→) =====
    if (primary && !shift && !alt && (key === "[" || key === "{")) {
      return send("nav-back");
    }
    if (primary && !shift && !alt && (key === "]" || key === "}")) {
      return send("nav-forward");
    }
    if (!primary && !shift && alt && key === "ArrowLeft") {
      return send("nav-back");
    }
    if (!primary && !shift && alt && key === "ArrowRight") {
      return send("nav-forward");
    }

    // ===== 検索 =====
    if (primary && !shift && !alt && k === "f") {
      return send("find");
    }
    if (primary && !alt && k === "g") {
      return send(shift ? "find-prev" : "find-next");
    }

    // ===== リロード =====
    if (primary && !alt && k === "r") {
      return send(shift ? "reload-hard" : "reload");
    }

    // ===== ズーム =====
    if (primary && !shift && !alt && (key === "=" || key === "+")) {
      return send("zoom-in");
    }
    if (primary && !shift && !alt && key === "-") {
      return send("zoom-out");
    }
    if (primary && !shift && !alt && key === "0") {
      return send("zoom-reset");
    }

    // ===== フルスクリーン =====
    if (primary && shift && !alt && code === "Enter") {
      return send("fullscreen");
    }

    // ===== DevTools =====
    if (primary && shift && !alt && k === "i") {
      return send("devtools");
    }
    if (key === "F12") {
      return send("devtools");
    }

    // ===== タブ番号 (Ctrl+1〜8 / 9=最後) =====
    if (primary && !shift && !alt && key >= "1" && key <= "9") {
      const num = parseInt(key, 10);
      if (num >= 1 && num <= 8) {
        return send("tab-index", { index: num });
      } else if (num === 9) {
        return send("tab-last");
      }
    }

    // ===== ウィンドウを閉じる (Alt+F4) =====
    if (!isMac && alt && !control && !shift && key === "F4") {
      return send("close-window");
    }

    // Ctrl+Tab / Ctrl+Shift+Tab でタブ移動
    if (!isMac && control && !alt && code === "Tab") {
      if (!shift) return send("next-tab");
      return send("prev-tab");
    }
  });
}

async function createWindow() {
  const winState = await loadWindowState();

  let x, y;
  if (!winState.isMaximized) {
    if (typeof winState.x === "number") x = winState.x;
    if (typeof winState.y === "number") y = winState.y;
    if (typeof x === "number" && x < 0) x = 0;
    if (typeof y === "number" && y < 0) y = 0;
  }

  mainWindow = new BrowserWindow({
    width: winState.width || 1280,
    height: winState.height || 800,
    x,
    y,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: "#1e1e1e",
    icon: path.join(__dirname, "icons", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
    },
  });

  if (winState.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile("index.html");

  mainWindow.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/120.0.0.0 Safari/537.36"
  );

  attachShortcutsToWebContents(mainWindow.webContents);

  mainWindow.webContents.on("did-attach-webview", (_event, contents) => {
    attachShortcutsToWebContents(contents);

    contents.setWindowOpenHandler((details) => {
      const { url } = details;
      if (url.startsWith("http")) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("mindra-shortcut", {
            type: "new-tab-with-url",
            url,
          });
        }
      }
      return { action: "deny" };
    });
  });

  const saveBounds = () => saveWindowState();
  mainWindow.on("resize", saveBounds);
  mainWindow.on("move", saveBounds);
  mainWindow.on("close", saveBounds);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ==== IPC: タイトルバー操作・位置 ==== */

ipcMain.handle("window-control", (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  switch (action) {
    case "minimize":
      win.minimize();
      break;
    case "maximize":
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      break;
    case "close":
      win.close();
      break;
  }
});

ipcMain.handle("window-get-bounds", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  return win.getBounds();
});

ipcMain.handle("window-set-position", (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const { x, y } = payload || {};
  if (typeof x === "number" && typeof y === "number") {
    win.setPosition(Math.round(x), Math.round(y));
  }
});

app.whenReady().then(async () => {
  await setupAdBlocker();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
