process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
const { app, BrowserWindow, ipcMain, Menu, shell, session, screen } = require(
  "electron",
);
Menu.setApplicationMenu(null);
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const https = require("https"); // EasyList ダウンロード用
const AdBlockClient = require("adblock-rs");
const { initAIBackend } = require("./main/ai-ollama.js");
const { initHistory, addEntry, getRecent } = require("./main/history-store.js");
const logger = require("./main/logger.js");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

// YouTube の広告をどこまで殺すか
// true にすると広告ストリームもブロック（壊れることもある）
// false ならほぼ安全だけど広告は出やすい
const YT_AGGRESSIVE_ADBLOCK = true;

// =============================================
// 開発版は userData を dev/ に分離
// =============================================
if (!app.isPackaged) {
  const devPath = path.join(app.getPath("userData"), "dev");
  app.setPath("userData", devPath);
}

// ロガー初期化
logger.initLogger(app);

// 90 日以上前のログを自動で削除
logger.removeOldLogs(logger.getLogsDir(), 90);

let mainWindow = null;
const profileWindows = new Map();

const activeDownloadItems = new Map();
let lastDownloadedSavePath = "";

function getDownloadBaseDir() {
  const downloadsDir = app.getPath("downloads");
  if (downloadsDir) {
    try {
      fsSync.mkdirSync(downloadsDir, { recursive: true });
      return downloadsDir;
    } catch (e) {
      console.error("[download] failed to prepare downloads dir:", e);
    }
  }

  const fallback = path.join(app.getPath("userData"), "downloads");
  try {
    fsSync.mkdirSync(fallback, { recursive: true });
  } catch (e) {
    console.error("[download] failed to prepare fallback downloads dir:", e);
  }
  return fallback;
}

function buildUniqueSavePath(fileName) {
  const baseDir = getDownloadBaseDir();
  const ext = path.extname(fileName);
  const name = path.basename(fileName, ext);

  let counter = 0;
  let candidate = path.join(baseDir, fileName);

  while (fsSync.existsSync(candidate)) {
    counter += 1;
    const suffix = `(${counter})`;
    const nextName = ext ? `${name}${suffix}${ext}` : `${name}${suffix}`;
    candidate = path.join(baseDir, nextName);
  }

  return candidate;
}

// 一般設定フラグ（renderer から IPC で更新）
let generalSettingsFlags = {
  enableAdblock: false, // 広告ブロック有効
  enablePopups: true, // ポップアップ無効
};

// ===== ウインドウ位置・サイズ保存用 =====
const windowStatePath = path.join(app.getPath("userData"), "window-state.json");

// ===== プロファイルショートカット用メタ =====
const profilesMetaPath = path.join(
  app.getPath("userData"),
  "profiles-meta.json"
);

// ===== Adblock 関連 =====
let adblockEngine = null;

// フィルタ保存先（ビルド版でも書き込める userData 配下）
const userDataDir = app.getPath("userData");
const filtersDir = path.join(userDataDir, "filters");
const easyListPath = path.join(filtersDir, "easylist.txt");
const easyPrivacyPath = path.join(filtersDir, "easyprivacy.txt");
const easyListJpPath = path.join(filtersDir, "easylist_jp.txt");

// filters フォルダが無ければ作成
if (!fsSync.existsSync(filtersDir)) {
  fsSync.mkdirSync(filtersDir, { recursive: true });
}

// 自動更新間隔（ミリ秒）: 7日
const FILTER_UPDATE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// 複数 WebView から同時に initAdblockForSession が呼ばれても
// ダウンロードが何度も走らないようにするための共有 Promise
let filterUpdatePromise = null;

// main プロセスの致命的例外をログに出す
process.on("uncaughtException", (err) => {
  try {
    logger.logError("uncaughtException", {
      name: err && err.name,
      message: err && err.message,
      stack: err && err.stack,
    });
  } catch (e) {
    console.error("[logger] failed to log uncaughtException:", e);
  }
});

process.on("unhandledRejection", (reason) => {
  try {
    logger.logError("unhandledRejection", {
      reason: reason && reason.message ? reason.message : String(reason),
    });
  } catch (e) {
    console.error("[logger] failed to log unhandledRejection:", e);
  }
});

/**
 * HTTP/HTTPS のみを許可して URL をパースするユーティリティ。
 *
 * @param {string} raw 入力文字列
 * @returns {URL|null} 許可された場合は URL オブジェクト、それ以外は null
 */
function safeParseHttpUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Electron が通知するリクエスト種別を adblock-rs のタイプに変換する。
 * adblock-rs では独自の種類名を使うため、ここでマッピングして渡す。
 *
 * @param {string} electronType Electron のリクエスト種別（webRequest）
 * @returns {import("adblock-rs").RequestType} adblock-rs で扱える種別
 */
function mapRequestTypeForAdblock(electronType) {
  switch (electronType) {
    case "mainFrame":
      return "document";
    case "subFrame":
      return "subdocument";
    case "script":
      return "script";
    case "stylesheet":
      return "stylesheet";
    case "image":
      return "image";
    case "xhr":
    case "xmlhttprequest":
      return "xmlhttprequest";
    case "media":
      return "media";
    case "font":
      return "font";
    default:
      return "other";
  }
}

// ===== プロファイルメタ管理 =====
/**
 * 追加プロファイルの採番状態と一覧を読み出す。
 * ファイルが欠損しても安全な初期値を返し、壊れたデータで落ちないようにする。
 */
function readProfilesMeta() {
  try {
    const raw = fsSync.readFileSync(profilesMetaPath, "utf8");
    const meta = JSON.parse(raw) || {};

    if (typeof meta.lastId !== "number") {
      // 最初の追加プロファイルは profile-2 にしたいので 1 を既定値にする
      meta.lastId = 1;
    }
    if (!Array.isArray(meta.profiles)) {
      meta.profiles = [];
    }

    // デフォルトプロファイル profile-1 はメタ管理から除外して扱う
    meta.profiles = meta.profiles.filter(
      (p) => p && typeof p.id === "string" && p.id !== "profile-1"
    );

    if (meta.lastId < 1) {
      meta.lastId = 1;
    }

    return meta;
  } catch {
    // 初期状態：lastId=1（最初に作るのは profile-2）
    return { lastId: 1, profiles: [] };
  }
}

/**
 * プロファイルメタ（lastId/追加プロファイル一覧）をファイルに保存する。
 * ディレクトリが無い場合は自動で作成し、JSON で書き出す。
 *
 * @param {{lastId: number, profiles: Array<{id: string, name?: string}>}} meta 保存するメタ情報
 */
function writeProfilesMeta(meta) {
  try {
    fsSync.mkdirSync(path.dirname(profilesMetaPath), { recursive: true });
    fsSync.writeFileSync(
      profilesMetaPath,
      JSON.stringify(meta, null, 2),
      "utf8"
    );
  } catch (e) {
    console.error("[profile] write meta error:", e);
  }
}

// ===== YouTube 専用ネットワークブロック =====

/**
 * YouTube または googlevideo 系ホストかどうかを判定する。
 *
 * @param {string} hostname 判定対象のホスト名
 * @returns {boolean} YouTube 系なら true
 */
function isYouTubeHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();

  // YouTube 本体だけ専用処理。googlevideo は含めない。
  if (
    h === "youtube.com" ||
    h === "www.youtube.com" ||
    h === "m.youtube.com" ||
    h.endsWith(".youtube.com") ||
    h === "youtube-nocookie.com" ||
    h === "www.youtube-nocookie.com" ||
    h.endsWith(".youtube-nocookie.com")
  ) {
    return true;
  }

  return false;
}

function isYouTubeAdVideo(url) {
  const u = url.toLowerCase();

  if (!u.includes("googlevideo.com/videoplayback")) return false;

  const adParams = [
    "ctier=l",
    "oad",
    "oads",
    "adformat",
    "source=yt_otf",
    "label=ad",
  ];

  return adParams.some((p) => u.includes(p));
}

/**
 * YouTube の広告用 URL かどうかを判定する。
 *
 * @param {string} url 判定対象の URL
 * @param {string} hostname 既知のホスト名
 * @returns {boolean} 広告 URL なら true
 */
function isYouTubeAdUrl(url, hostname) {
  const lowerUrl = url.toLowerCase();
  const h = (hostname || "").toLowerCase();

  // 典型的な広告・トラッキングエンドポイントだけブロック
  const patterns = [
    "doubleclick.net/pagead/",
    "doubleclick.net/gampad/",
    "doubleclick.net/pcs/",
    "doubleclick.net/adx/",
    "doubleclick.net/ad",
    "youtube.com/api/stats/ads",
    "youtube.com/pagead/",
    "youtube.com/get_midroll",
    "youtube.com/youtubei/v1/playerad",
    "youtube.com/youtubei/v1/ads",
    "youtube.com/youtubei/v1/nextad",
    "youtube.com/ptracking",
  ];
  for (const p of patterns) {
    if (lowerUrl.includes(p)) return true;
  }

  return false;
}

/**
 * HTTPS でテキストをダウンロードし、そのまま指定パスへ保存する。
 * 親ディレクトリが無ければ作成する。エラーは呼び出し元へ返す。
 */
function downloadTextToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    try {
      fsSync.mkdirSync(path.dirname(destPath), { recursive: true });
    } catch {
      // ignore
    }

    const file = fsSync.createWriteStream(destPath);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          file.close(() => {
            fsSync.unlink(destPath, () => {});
          });
          return reject(
            new Error(`HTTP ${res.statusCode} while downloading ${url}`)
          );
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve());
        });
      })
      .on("error", (err) => {
        try {
          file.close(() => {
            fsSync.unlink(destPath, () => {});
          });
        } catch {
          // ignore
        }
        reject(err);
      });
  });
}

/**
 * 指定されたフィルタファイルが存在しない、もしくは更新期限を超えている場合に再ダウンロードする。
 * 期限内なら何もしない。
 */
async function ensureFilterFileFresh(url, localPath, label) {
  try {
    let needDownload = false;

    if (!fsSync.existsSync(localPath)) {
      needDownload = true;
    } else {
      try {
        const stat = fsSync.statSync(localPath);
        const age = Date.now() - stat.mtimeMs;
        if (age > FILTER_UPDATE_INTERVAL_MS) {
          needDownload = true;
        }
      } catch {
        needDownload = true;
      }
    }

    if (!needDownload) {
      return;
    }

    await downloadTextToFile(url, localPath);
  } catch (e) {
    console.error(`[adblock] failed to download ${label}:`, e);
  }
}

/**
 * EasyList / EasyPrivacy / Japan 用フィルタをまとめて最新化する。
 * 同時実行を避けるため、共有 Promise を使って一度だけ更新する。
 */
async function ensureFiltersUpdated() {
  // 公式URL
  const EASYLIST_URL = "https://easylist.to/easylist/easylist.txt";
  const EASYP_PRIVACY_URL = "https://easylist.to/easylist/easyprivacy.txt";
  const EASYLIST_JP_URL =
    "https://easylist.to/easylist/easylistjapan.txt";// 見つからない

  // EasyList
  await ensureFilterFileFresh(EASYLIST_URL, easyListPath, "EasyList");

  // EasyPrivacy
  await ensureFilterFileFresh(
    EASYP_PRIVACY_URL,
    easyPrivacyPath,
    "EasyPrivacy"
  );

/*
  // 日本向けフィルタ
  await ensureFilterFileFresh(
    EASYLIST_JP_URL,
    easyListJpPath,
    "EasyList Japan"
  );
*/
}

/**
 * 指定セッションへ adblock-rs を組み込み、リクエストをフィルタリングする。
 * フィルタが無ければダウンロードし、ロードに失敗した場合は adblock を無効化する。
 */
async function initAdblockForSession(session) {
  try {
    if (!filterUpdatePromise) {
      filterUpdatePromise = ensureFiltersUpdated();
    }
    await filterUpdatePromise;

    let rules = [];

    if (fsSync.existsSync(easyListPath)) {
      const txt = await fs.readFile(easyListPath, "utf8");
      rules = rules.concat(txt.split("\n"));
    }
    if (fsSync.existsSync(easyPrivacyPath)) {
      const txt = await fs.readFile(easyPrivacyPath, "utf8");
      rules = rules.concat(txt.split("\n"));
    }
    if (fsSync.existsSync(easyListJpPath)) {
      const txt = await fs.readFile(easyListJpPath, "utf8");
      rules = rules.concat(txt.split("\n"));
    }

    if (rules.length === 0) {
      console.warn("[adblock] no rules loaded; adblock disabled");
      adblockEngine = null;
      return;
    }

    const filterSet = new AdBlockClient.FilterSet(true);
    filterSet.addFilters(rules);
    adblockEngine = new AdBlockClient.Engine(filterSet, true);

    try {
      session.webRequest.onBeforeRequest(null);
    } catch {
      // ignore
    }

    session.webRequest.onBeforeRequest(
      { urls: ["*://*/*"] },
      (details, callback) => {
        try {
          if (!generalSettingsFlags.enableAdblock) {
            return callback({});
          }

          const url = details.url;
          const electronType = details.resourceType || "other"; // mainFrame / script など
          const originUrl = details.referrer || details.firstPartyURL || url;

          let hostname = "";
          try {
            hostname = new URL(url).hostname || "";
          } catch {
            hostname = "";
          }

          // ============================
          // 1) YouTube 本体 (youtube.com 系)
          //    - mainFrame / subFrame は絶対ブロックしない
          //    - サブリソースの広告 API だけ専用ロジックでブロック
          // ============================
          if (isYouTubeHost(hostname)) {
            if (electronType !== "mainFrame" && electronType !== "subFrame") {
              if (isYouTubeAdUrl(url, hostname)) {
                return callback({ cancel: true });
              }
            }
            // YouTube 本体のページやその他リソースはここで終了（汎用 adblock-rs には回さない）
            return callback({});
          }

          // ============================
          // 2) YouTube 動画ストリーム (googlevideo.com)
          // ============================
          if (hostname && hostname.toLowerCase().includes("googlevideo.com")) {
            if (YT_AGGRESSIVE_ADBLOCK && isYouTubeAdVideo(url)) {
              // 攻撃的モードのときだけ広告ストリームを殺す
              return callback({ cancel: true });
            }

            // それ以外（本編っぽい videoplayback）は必ず通す
            return callback({});
          }

          // ============================
          // 3) 汎用 adblock-rs (EasyList 等)
          // ============================
          if (!adblockEngine) {
            return callback({});
          }

          const parsedUrl = safeParseHttpUrl(url);
          if (!parsedUrl) {
            return callback({});
          }
          const parsedOrigin = safeParseHttpUrl(originUrl) || parsedUrl;

          const requestUrl = parsedUrl.href;
          const sourceUrl = parsedOrigin.href;
          const requestType = mapRequestTypeForAdblock(electronType);

          const result = adblockEngine.check(
            requestUrl,
            sourceUrl,
            requestType,
            true
          );

          let shouldBlock = false;
          let redirectURL = undefined;

          if (typeof result === "boolean") {
            shouldBlock = result;
          } else if (result && typeof result === "object") {
            if (result.matched === true || result.match === true) {
              shouldBlock = true;
            }
            if (
              typeof result.redirect === "string" &&
              result.redirect.length > 0
            ) {
              redirectURL = result.redirect;
            }
          }

          if (redirectURL) {
            return callback({ redirectURL });
          }

          if (shouldBlock) {
            return callback({ cancel: true });
          }

          return callback({});
        } catch (e) {
          console.error("[adblock] onBeforeRequest error:", e);
          return callback({});
        }
      }
    );

  } catch (e) {
    console.error("[adblock] failed to init:", e);
    adblockEngine = null;
  }
}

/**
 * YouTube の DOM 広告を非表示にする CSS を返す。
 *
 * @returns {string} 挿入用の CSS コード
 */
function getYouTubeDomAdblockScript() {
  // ここは YouTube の DOM 変更で壊れる可能性があるので「これは推論寄りだよ」
  return `
    (function() {
      try {
        const style = document.createElement('style');
        style.setAttribute('data-mindra-yt-adblock', '1');
        style.textContent = [
          '#masthead-ad',
          '#player-ads',
          '.video-ads',
          'ytd-promoted-video-renderer',
          'ytd-in-feed-ad-layout-renderer',
          'ytd-action-companion-ad-renderer',
          'ytd-display-ad-renderer',
          'ytd-video-masthead-ad-v3-renderer',
          'ytd-banner-promo-renderer',
          'ytd-companion-slot-renderer'
        ].join(',') + '{ display: none !important; }';
        document.documentElement.appendChild(style);
      } catch (e) {}
    })();
  `;
}

// =====================================================
// ウインドウ位置・サイズ（プロファイル別）
// =====================================================
/**
 * プロファイルごとに保存されたウインドウ位置・サイズを読み込む。
 * ファイルがない場合や破損している場合は既定サイズを返す。
 */
async function loadWindowState(profileId) {
  const pid = profileId || "profile-1";

  try {
    const raw = await fs.readFile(windowStatePath, "utf8");
    const all = JSON.parse(raw) || {};

    // プロファイルごとの状態を持つ形にする
    const state = all[pid] || all["default"] || {};

    return {
      width: typeof state.width === "number" ? state.width : 1280,
      height: typeof state.height === "number" ? state.height : 800,
      x: typeof state.x === "number" ? state.x : undefined,
      y: typeof state.y === "number" ? state.y : undefined,
      isMaximized: !!state.isMaximized,
    };
  } catch (e) {
    // まだファイルがない / 壊れてるときのデフォルト
    return {
      width: 1280,
      height: 800,
      x: undefined,
      y: undefined,
      isMaximized: false,
    };
  }
}

/**
 * 現在のウインドウ位置・サイズを保存する。プロファイルごとに保持される。
 * ウインドウが無効な場合は何もしない。
 */
function saveWindowState(win, profileId) {
  if (!win) return;
  const pid = profileId || "profile-1";

  const isMaximized = win.isMaximized();
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();

  const nextState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized,
  };

  let all = {};
  try {
    const raw = fsSync.readFileSync(windowStatePath, "utf8");
    all = JSON.parse(raw) || {};
  } catch (e) {
    all = {};
  }

  all[pid] = nextState;

  try {
    fsSync.mkdirSync(path.dirname(windowStatePath), { recursive: true });
    fsSync.writeFileSync(windowStatePath, JSON.stringify(all, null, 2), "utf8");
  } catch (e) {
    console.error("[window-state] save error:", e);
  }
}

/**
 * 保存済みのウインドウ位置が現在のディスプレイ構成でも有効になるよう補正する。
 * 座標が欠落している場合はそのまま返す。
 *
 * @param {{x?: number, y?: number, width?: number, height?: number, isMaximized?: boolean}} state 保存された状態
 * @returns {{x?: number, y?: number, width?: number, height?: number, isMaximized?: boolean}} 補正後の状態
 */
function normalizeWindowStateForDisplay(state) {
  if (!state || typeof state !== "object") return state;
  if (typeof state.x !== "number" || typeof state.y !== "number") return state;

  try {
    const displays = screen.getAllDisplays();
    if (!displays || displays.length === 0) return state;

    const width = typeof state.width === "number" ? state.width : 1280;
    const height = typeof state.height === "number" ? state.height : 800;

    const display = screen.getDisplayMatching({
      x: state.x,
      y: state.y,
      width,
      height,
    });

    const workArea = display
      ? display.workArea
      : screen.getPrimaryDisplay().workArea;

    const maxX = workArea.x + Math.max(workArea.width - width, 0);
    const maxY = workArea.y + Math.max(workArea.height - height, 0);

    return {
      ...state,
      width,
      height,
      x: Math.min(Math.max(state.x, workArea.x), maxX),
      y: Math.min(Math.max(state.y, workArea.y), maxY),
    };
  } catch (e) {
    console.warn("[window-state] normalize error:", e);
    return state;
  }
}

/**
 * 起動引数からプロファイル ID を抽出する。
 *
 * @param {string[]} argv Electron に渡された argv 配列
 * @returns {string|null} 見つかったプロファイル ID
 */
function extractProfileIdFromArgv(argv) {
  try {
    const list = Array.isArray(argv) ? argv : process.argv;

    const normalizeProfile = (raw) => {
      const v = typeof raw === "string" ? raw.trim() : "";
      if (!v) return null;
      if (/^profile-\d+$/.test(v)) return v;
      if (/^\d+$/.test(v)) return `profile-${v}`; // 2 -> profile-2
      return null;
    };

    // 環境変数で指定された場合を優先
    const envProfile =
      normalizeProfile(process.env.MINDRA_PROFILE || process.env.MINDRA_PROFILE_ID);
    if (envProfile) return envProfile;

    for (let i = 0; i < list.length; i++) {
      const arg = list[i];
      if (typeof arg !== "string") continue;

      // --mindra-profile=profile-2 / --profile=2
      let fromArg =
        arg.startsWith("--mindra-profile=")
          ? normalizeProfile(arg.substring("--mindra-profile=".length))
          : arg.startsWith("--profile=")
            ? normalizeProfile(arg.substring("--profile=".length))
            : null;

      // --mindra-profile profile-2 / --profile 2
      if (!fromArg && (arg === "--mindra-profile" || arg === "--profile")) {
        fromArg = normalizeProfile(list[i + 1]);
      }

      // --profile-2 / profile-2 / 2
      if (!fromArg) {
        const trimmed = arg.startsWith("--") ? arg.substring(2) : arg;
        fromArg = normalizeProfile(trimmed || arg);
      }

      if (fromArg) return fromArg;
    }
  } catch (e) {
    console.warn("[profile] extractProfileIdFromArgv error:", e);
  }
  // 見つからなければデフォルト
  return "profile-1";
}

/**
 * renderer で読み込む前の簡易 config を main プロセス側で構築する。
 *
 * @param {boolean} isDev 開発モードかどうか
 * @returns {{isDev: boolean, preload: string}} IPC へ渡す設定
 */
function loadConfigInMain(isDev) {
  const filename = isDev ? "config.dev.json" : "config.prod.json";
  const configPath = path.join(__dirname, "config", filename);
  try {
    const raw = fsSync.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("[config] failed to load:", e);
    return {};
  }
}

/**
 * ショートカット処理の対象となる BrowserWindow を返す。
 *
 * @returns {import("electron").BrowserWindow|null} 対象ウインドウ
 */
function getTargetWindowForShortcut() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const all = BrowserWindow.getAllWindows();
  const alive = all.find((w) => !w.isDestroyed());
  return alive || null;
}

function sendShortcutToRenderer(payload) {
  const target = getTargetWindowForShortcut();
  if (!target) return;
  try {
    target.webContents.send("mindra-shortcut", payload);
  } catch {
    // ignore
  }
}

function attachShortcutsToWebContents(wc) {
  const isMac = process.platform === "darwin";

  wc.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const { key, code, control, shift, alt, meta } = input;
    const primary = isMac ? meta : control;
    const k = key.length === 1 ? key.toLowerCase() : key;

    const send = (type, extra = {}) => {
      event.preventDefault();
      sendShortcutToRenderer({ type, ...extra });
    };

    if (primary && !shift && !alt && k === "t") return send("new-tab");
    if (primary && !shift && !alt && k === "w") return send("close-tab");
    if (primary && shift && !alt && k === "t") return send("restore-tab");

    if (primary && !shift && !alt && (key === "[" || key === "{"))
      return send("nav-back");
    if (primary && !shift && !alt && (key === "]" || key === "}"))
      return send("nav-forward");
    if (!primary && !shift && alt && key === "ArrowLeft")
      return send("nav-back");
    if (!primary && !shift && alt && key === "ArrowRight")
      return send("nav-forward");

    if (primary && !shift && !alt && k === "f") return send("find");
    if (primary && !alt && k === "g")
      return send(shift ? "find-prev" : "find-next");

    if (primary && !alt && k === "r")
      return send(shift ? "reload-hard" : "reload");

    if (primary && !shift && !alt && (key === "=" || key === "+"))
      return send("zoom-in");
    if (primary && !shift && !alt && key === "-") return send("zoom-out");
    if (primary && !shift && !alt && key === "0") return send("zoom-reset");

    if (primary && shift && !alt && code === "Enter")
      return send("fullscreen");

    if (primary && shift && !alt && k === "i") return send("devtools");
    if (key === "F12") return send("devtools");

    if (primary && !shift && !alt && key >= "1" && key <= "9") {
      const num = parseInt(key, 10);
      if (num >= 1 && num <= 8) return send("tab-index", { index: num });
      if (num === 9) return send("tab-last");
    }

    if (!isMac && alt && !control && !shift && key === "F4")
      return send("close-window");

    if (!isMac && control && !alt && code === "Tab") {
      if (!shift) return send("next-tab");
      return send("prev-tab");
    }
  });
}

/**
 * - Mac のトラックパッドスワイプ → 戻る / 進む
 * - Electron の BrowserWindow "swipe" イベント（macOS 限定）
 * - direction: "left" / "right" / "up" / "down"
 * - Safari と同じ感覚になるように
 *   - 右へスワイプ → 戻る (nav-back)
 *   - 左へスワイプ → 進む (nav-forward)
 */
function attachSwipeToWindow(win) {
  if (process.platform !== "darwin") return;
  if (!win || win.isDestroyed()) return;

  win.on("swipe", (_event, direction) => {
    let type = null;

    if (direction === "right") {
      // 指を右へ → 戻る
      type = "nav-back";
    } else if (direction === "left") {
      // 指を左へ → 進む
      type = "nav-forward";
    }

    if (!type) return;

    try {
      win.webContents.send("mindra-shortcut", { type });
    } catch (e) {
      console.error("[swipe] failed to send shortcut:", e);
    }
  });
}

// すべての WebContents（ポップアップ含む）に adblock を適用
app.on("web-contents-created", (event, contents) => {
  const type = contents.getType();
  if (type === "devtools") return;

  // webview は did-attach-webview 側で処理しているので、ここでは除外
  if (type !== "webview") {
    // キーボードショートカット
    attachShortcutsToWebContents(contents);

    // その WebContents の session に adblock-rs を適用（ポップアップもここで対象になる）
    const sess = contents.session;
    if (sess) {
      initAdblockForSession(sess).catch((e) => {
        console.error("[adblock] global adblock init failed:", e);
      });
    }

    contents.on("console-message", (event2, level, message, line, sourceId) => {
      // level: 0=log, 1=warn, 2=error
      try {
        if (level === 1) {
          logger.logWarn("renderer-console", {
            message,
            line,
            source: sourceId,
          });
        } else if (level === 2) {
          logger.logError("renderer-console", {
            message,
            line,
            source: sourceId,
          });
        }
        // console.log(level=0) はログに出さない
      } catch (e) {
        console.error("[logger] failed to log console-message:", e);
      }
    });

    // YouTube の DOM 広告も隠す（通常ウィンドウ／ポップアップ共通）
    contents.on("did-finish-load", () => {
      try {
        const url = contents.getURL() || "";
        if (/https?:\/\/(www\.)?youtube\.com\//.test(url)) {
          contents
            .executeJavaScript(getYouTubeDomAdblockScript(), { world: "main" })
            .catch(() => {});
        }
      } catch {
        // ignore
      }
    });
  }
});

// ===== ダウンロードイベント設定 =====

/**
 * 指定した session にダウンロードイベントを一度だけフックする。
 *
 * @param {import("electron").Session} ses 対象となる session
 */
function attachDownloadEventsToSession(ses) {
  if (!ses) return;

  // 二重登録防止
  if (ses.__mindraDownloadHooked) return;
  ses.__mindraDownloadHooked = true;

  ses.on("will-download", (event, item, wc) => {
    try {
      // ダウンロードを起こした webContents から親ウィンドウを探す
      let targetWin = null;

      // 通常の BrowserWindow からのダウンロード
      if (wc && typeof wc.getOwnerBrowserWindow === "function") {
        targetWin = wc.getOwnerBrowserWindow();
      }

      // webview 経由の場合 hostWebContents → ウィンドウを取得
      if (!targetWin && wc && wc.hostWebContents) {
        targetWin = BrowserWindow.fromWebContents(wc.hostWebContents);
      }

      // それでも見つからなければ mainWindow 等にフォールバック
      if (!targetWin || targetWin.isDestroyed()) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          targetWin = mainWindow;
        } else {
          const all = BrowserWindow.getAllWindows();
          targetWin = all.find((w) => !w.isDestroyed()) || null;
        }
      }

      if (!targetWin || targetWin.isDestroyed()) return;
      const sendTo = targetWin.webContents;

      const downloadId = `${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;
      const fileName = item.getFilename();
      const totalBytes = item.getTotalBytes();
      const url = item.getURL();

      try {
        const savePath = buildUniqueSavePath(fileName);
        item.setSavePath(savePath);
        lastDownloadedSavePath = savePath;
      } catch (e) {
        console.error("[download] failed to set save path:", e);
      }

      activeDownloadItems.set(downloadId, item);

      // ダウンロード開始
      sendTo.send("mindra-download-started", {
        id: downloadId,
        fileName,
        total: totalBytes,
        url,
      });

      // 進捗
      item.on("updated", (_e, state) => {
        const received = item.getReceivedBytes();
        const total = item.getTotalBytes();

        sendTo.send("mindra-download-updated", {
          id: downloadId,
          fileName: item.getFilename(),
          url: item.getURL(),
          state,
          received,
          total,
        });
      });

      // 完了／中断
      item.on("done", (_e, state) => {
        sendTo.send("mindra-download-done", {
          id: downloadId,
          state,
          fileName: item.getFilename(),
          savePath: item.getSavePath(),
        });

        const savePath = item.getSavePath();
        if (savePath) {
          lastDownloadedSavePath = savePath;
        }

        activeDownloadItems.delete(downloadId);
      });
    } catch (e) {
      console.error("[download] will-download handler error:", e);
    }
  });
}

/**
 * すべての既存 session にダウンロードイベントをフックする。
 */
function setupDownloadEvents() {
  // まず defaultSession
  attachDownloadEventsToSession(session.defaultSession);

  // その後に作られる session（persist:profile-X など）にも自動で付ける
  app.on("session-created", (ses) => {
    attachDownloadEventsToSession(ses);
  });
}

// ===== ウィンドウ生成 =====
async function createWindow(profileIdArg) {
  // 起動プロファイルID決定
  const profileId =
    (typeof profileIdArg === "string" && profileIdArg) ||
    extractProfileIdFromArgv(process.argv) ||
    "profile-1";

  const existing = profileWindows.get(profileId);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }

  const winStateRaw = await loadWindowState(profileId); // ここでプロファイル渡す
  const winState = normalizeWindowStateForDisplay(winStateRaw);

  let x, y;
  if (typeof winState.x === "number") x = winState.x;
  if (typeof winState.y === "number") y = winState.y;

  const isDev = !app.isPackaged;
  const configObj = loadConfigInMain(isDev);

  // renderer 側に渡す config にプロファイルIDを埋め込む
  configObj.profileId = profileId;

  const configB64 = Buffer.from(JSON.stringify(configObj), "utf8").toString(
    "base64"
  );

  const win = new BrowserWindow({
    width: winState.width || 1280,
    height: winState.height || 800,
    x,
    y,
    minWidth: 400,
    minHeight: 200,
    frame: false,
    backgroundColor: "#1e1e1e",
    icon: path.join(__dirname, "icons", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true,
      additionalArguments: [
        `--mindra-env=${isDev ? "dev" : "prod"}`,
        `--mindra-config=${configB64}`,
      ],
    webSecurity: true,
    enableRemoteModule: false,
    devTools: isDev
   },
  });

  profileWindows.set(profileId, win);

  const saveBounds = () => saveWindowState(win, profileId); // プロファイル渡す
  win.on("resize", saveBounds);
  win.on("move", saveBounds);
  win.on("close", saveBounds);

  if (!mainWindow) {
    mainWindow = win;
  }

  // Mac スワイプナビゲーションをこのウィンドウに付ける
  attachSwipeToWindow(win);

  if (winState.isMaximized) {
    win.maximize();
  }

  win.loadFile("index.html");

  win.on("closed", () => {
    profileWindows.delete(profileId);
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on("did-navigate", (_event, url) => {
    try {
      addEntry({
        url,
        source: "main",
      });
    } catch (e) {
      console.error("[history] main did-navigate error:", e);
    }
  });

  win.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (!isMainFrame) return;
    try {
      addEntry({
        url,
        source: "main",
      });
    } catch (e) {
      console.error("[history] main did-navigate-in-page error:", e);
    }
  });

  if (isDev) {
    //win.webContents.openDevTools({ mode: "detach" });// debug
  }

  win.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/120.0.0.0 Safari/537.36"
  );

  attachShortcutsToWebContents(win.webContents);

  // renderer 側クラッシュなどをログ
  win.webContents.on("render-process-gone", (_event, details) => {
    try {
      logger.logError("render-process-gone", {
        reason: details && details.reason,
        exitCode: details && details.exitCode,
      });
    } catch (e) {
      console.error("[logger] failed to log render-process-gone:", e);
    }
  });

  win.webContents.on("crashed", () => {
    try {
      logger.logError("renderer-crashed", {});
    } catch (e) {
      console.error("[logger] failed to log renderer-crashed:", e);
    }
  });

// --------
  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      try {
        logger.logError("did-fail-load", {
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
        });
      } catch (e) {
        console.error("[logger] failed to log did-fail-load:", e);
      }
    }
  );

  win.webContents.on(
    "console-message",
    (_event, level, message, line, sourceId) => {
      try {
        logger.logInfo("main-webContents console", {
          level,
          message,
          line,
          sourceId,
        });
      } catch (e) {
        console.error("[logger] failed to log console-message:", e);
      }
    }
  );

  win.webContents.on("did-attach-webview", (_event, contents) => {
    attachShortcutsToWebContents(contents);

    const webviewSession = contents.session;
    initAdblockForSession(webviewSession).catch((e) => {
      console.error("[adblock] webview init failed:", e);
    });

    contents.on("did-finish-load", () => {
      try {
        const url = contents.getURL() || "";
        if (/https?:\/\/(www\.)?youtube\.com\//.test(url)) {
          contents
            .executeJavaScript(getYouTubeDomAdblockScript(), { world: "main" })
            .catch(() => {});
        }
      } catch {
        // ignore
      }
    });

    contents.on("did-navigate", (_e, url) => {
      try {
        addEntry({
          url,
          source: "webview",
        });
      } catch (e) {
        console.error("[history] webview did-navigate error:", e);
      }
    });

    contents.on("did-navigate-in-page", (_e, url, isMainFrame) => {
      if (!isMainFrame) return;
      try {
        addEntry({
          url,
          source: "webview",
        });
      } catch (e) {
        console.error("[history] webview did-navigate-in-page error:", e);
      }
    });

    contents.on("page-title-updated", (_e, title) => {
      try {
        const url = contents.getURL();
        if (!url) return;
        addEntry({
          url,
          title,
          source: "webview",
        });
      } catch (e) {
        console.error("[history] webview page-title-updated error:", e);
      }
    });

    contents.setWindowOpenHandler((details) => {
      const { url } = details;

      try {
        const u = new URL(url);
        const host = u.hostname;

        // Google ログイン画面だけは常に別ウィンドウ許可
        if (
          host === "accounts.google.com" ||
          host === "oauth2.googleapis.com"
        ) {
          return { action: "allow" };
        }
      } catch {
        // ignore
      }

      if (url.startsWith("http")) {
        // ポップアップ無効モード:
        if (!generalSettingsFlags.enablePopups) {
          if (!win.isDestroyed()) {
            win.webContents.send("mindra-shortcut", {
              type: "new-tab-with-url",
              url,
            });
          }
          return { action: "deny" };
        }

        // ポップアップ有効モード:
        return { action: "allow" };
      }

      // その他はそのまま
      return { action: "allow" };
    });
  });

  win.on("closed", () => {
    if (win === mainWindow) {
      mainWindow = null;
    }
  });
}

function extractHttpUrlFromArgv(argv) {
  const list = Array.isArray(argv) ? argv : [];
  for (const a of list) {
    if (typeof a === "string" && /^https?:\/\//i.test(a)) return a;
  }
  return null;
}

function openUrlInExistingWindow(win, url) {
  if (!win || win.isDestroyed()) return false;
  if (!url || typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false;

  try {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } catch {
    // ignore
  }

  const sendOpen = () => {
    try {
      win.webContents.send("mindra-shortcut", {
        type: "new-tab-with-url",
        url,
      });
    } catch (e) {
      console.error("[default-browser] failed to send new-tab-with-url:", e);
    }
  };

  // renderer がまだロード中なら、読み込み完了後に一回だけ送る
  try {
    if (win.webContents && win.webContents.isLoading && win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", () => sendOpen());
      return true;
    }
  } catch {
    // ignore
  }

  sendOpen();
  return true;
}

// --------
// デフォルトブラウザ設定画面を開く（Windows / macOS / Linux）
ipcMain.handle("open-default-browser-settings", async () => {
  const platform = process.platform;

  if (platform === "win32") {
    // Windows: 既定のアプリ設定
    await shell.openExternal("ms-settings:defaultapps");
    return;
  }

  if (platform === "darwin") {
    // macOS: システム設定（デスクトップとDock / 既定ブラウザはここから辿れる）
    try {
      await execFileAsync("open", [
        "x-apple.systempreferences:com.apple.Desktop-Settings.extension",
      ]);
    } catch (e) {
      // 失敗しても落とさない
      console.warn("[default-browser] mac open settings failed:", e);
    }
    return;
  }

  if (platform === "linux") {
    // Linux: 環境依存が強いので「試す → ダメでも無視」でOK
    try {
      // まず自動設定を試す（存在しないDEもある）
      await execFileAsync("xdg-settings", [
        "set",
        "default-web-browser",
        "mindra-light.desktop",
      ]);
    } catch (e) {
      console.warn("[default-browser] linux xdg-settings failed:", e);
    }

    try {
      // GNOME の設定画面（GNOME以外では失敗してOK）
      await execFileAsync("gnome-control-center", ["default-apps"]);
    } catch (e) {
      console.warn("[default-browser] linux gnome-control-center failed:", e);
    }
  }
});

// renderer からのログ受付
ipcMain.on("mindra-log", (_event, payload) => {
  try {
    if (!payload || typeof payload !== "object") return;
    const { level, message, extra } = payload;
    if (!message) return;

    switch (level) {
      case "ERROR":
        logger.logError(message, extra || {});
        break;
      case "WARN":
        logger.logWarn(message, extra || {});
        break;
      default:
        logger.logInfo(message, extra || {});
        break;
    }
  } catch (e) {
    console.error("[logger] failed to handle mindra-log IPC:", e);
  }
});

// ログフォルダを開く IPC（settings から使う）
ipcMain.handle("logs:open-folder", async () => {
  try {
    const dir = logger.getLogsDir();
    if (!dir) {
      return { ok: false, error: "ログフォルダが未初期化です" };
    }
    const result = await shell.openPath(dir);
    if (result) {
      logger.logError("logs:open-folder failed", { error: result });
      return { ok: false, error: result };
    }
    return { ok: true };
  } catch (e) {
    logger.logError("logs:open-folder exception", {
      error: e && e.message ? e.message : String(e),
    });
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("downloads:open-folder", async (_event, targetPath) => {
  try {
    const candidates = [];
    if (typeof targetPath === "string" && targetPath.trim()) {
      candidates.push(targetPath);
    }
    if (lastDownloadedSavePath) {
      candidates.push(lastDownloadedSavePath);
    }

    const downloadsDir = app.getPath("downloads");
    if (downloadsDir) {
      candidates.push(downloadsDir);
    }

    for (const p of candidates) {
      if (!p) continue;
      try {
        const stat = fsSync.statSync(p);
        if (stat.isDirectory()) {
          const result = await shell.openPath(p);
          if (!result) return { ok: true };
        } else {
          shell.showItemInFolder(p);
          return { ok: true };
        }
      } catch (e) {
        // ignore and try next path
      }
    }

    logger.logError("downloads:open-folder failed", { error: "対象パスが見つかりません" });
    return { ok: false, error: "対象のパスが見つかりません" };
  } catch (e) {
    logger.logError("downloads:open-folder exception", {
      error: e && e.message ? e.message : String(e),
    });
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("downloads:cancel", async (_event, downloadId) => {
  if (!downloadId) {
    return { ok: false, error: "downloadId is required" };
  }

  const item = activeDownloadItems.get(downloadId);
  if (!item) {
    return { ok: false, error: "対象のダウンロードが見つかりません" };
  }

  try {
    if (typeof item.pause === "function") {
      item.pause();
      return { ok: true };
    }

    item.cancel();
    return { ok: false, error: "中断に対応していません" };
  } catch (e) {
    logger.logError("downloads:cancel exception", {
      error: e && e.message ? e.message : String(e),
    });
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle("downloads:resume", async (_event, downloadId) => {
  if (!downloadId) {
    return { ok: false, error: "downloadId is required" };
  }

  const item = activeDownloadItems.get(downloadId);
  if (!item) {
    return { ok: false, error: "対象のダウンロードが見つかりません" };
  }

  try {
    if (typeof item.canResume === "function" && item.canResume()) {
      item.resume();
      return { ok: true };
    }
    return { ok: false, error: "再開できない状態です" };
  } catch (e) {
    logger.logError("downloads:resume exception", {
      error: e && e.message ? e.message : String(e),
    });
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.on("settings:update-general", (_event, flags) => {
  if (!flags || typeof flags !== "object") return;
  generalSettingsFlags = {
    ...generalSettingsFlags,
    ...flags,
  };
});

// 一般設定フラグ
ipcMain.on("settings:update-general", (_event, flags) => {
  if (!flags || typeof flags !== "object") return;
  generalSettingsFlags = {
    ...generalSettingsFlags,
    ...flags,
  };
});

// プロファイルショートカット作成
ipcMain.handle("profile:create-shortcut", async () => {
  try {
    const meta = readProfilesMeta();
    const profiles = Array.isArray(meta.profiles) ? meta.profiles : [];
    const maxExistingId = Math.max(
      1,
      ...profiles
        .map((p) => {
          const m = typeof p.id === "string" && p.id.match(/^profile-(\d+)$/);
          return m ? Number(m[1]) : null;
        })
        .filter((n) => typeof n === "number" && Number.isFinite(n))
    );

    const nextId = maxExistingId + 1;
    const profileId = `profile-${nextId}`;

    const desktopDir = app.getPath("desktop");
    const appPath = process.execPath;

    let shortcutPath = "";

    if (process.platform === "win32") {
      // Windows: アイコン付きショートカット (.lnk)。失敗時は従来の .cmd を使用。
      const shortcutName = `MindraLight-${profileId}.lnk`;
      shortcutPath = path.join(desktopDir, shortcutName);

      const escapeForPwsh = (p) => p.replace(/'/g, "''");
      const psScript = [
        `$s = (New-Object -COM WScript.Shell).CreateShortcut('${escapeForPwsh(shortcutPath)}')`,
        `$s.TargetPath = '${escapeForPwsh(appPath)}'`,
        `$s.Arguments = '--mindra-profile=${profileId}'`,
        `$s.IconLocation = '${escapeForPwsh(appPath)}'`,
        "$s.WorkingDirectory = Split-Path -Parent $s.TargetPath",
        "$s.Save()",
      ].join("; ");

      try {
        await execFileAsync("powershell.exe", [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          psScript,
        ]);
      } catch (e) {
        console.warn("[profile] .lnk creation failed, fallback to .cmd", e);

        const fallbackName = `MindraLight-${profileId}.cmd`;
        shortcutPath = path.join(desktopDir, fallbackName);
        const script = `@echo off\r\n"${appPath}" --mindra-profile=${profileId}\r\n`;

        await fs.writeFile(shortcutPath, script, "utf8");
      }
    } else {
      // Mac / Linux: 起動用スクリプト
      const isMac = process.platform === "darwin";
      const scriptName = isMac
        ? `MindraLight-${profileId}.command`
        : `MindraLight-${profileId}.sh`;

      shortcutPath = path.join(desktopDir, scriptName);

      const script = isMac
        ? `#!/bin/bash
open -na "${appPath}" --args --mindra-profile=${profileId}
`
: `#!/bin/bash
"/home/vboxuser/Downloads/mindra-light-ubuntu-latest(1)/mindra-light-0.9.1.AppImage" --no-sandbox --mindra-profile=${profileId} &
`;

      await fs.writeFile(shortcutPath, script, "utf8");

      try {
        await fs.chmod(shortcutPath, 0o755);
      } catch (e) {
        console.warn("[profile] chmod failed for", shortcutPath, e);
      }
    }

    if (!Array.isArray(meta.profiles)) meta.profiles = [];
    meta.lastId = nextId;
    meta.profiles.push({
      id: profileId,
      shortcutPath,
    });
    writeProfilesMeta(meta);

    return { ok: true, profileId, shortcutPath };
  } catch (e) {
    console.error("[profile] create-shortcut error:", e);
    return { ok: false, error: String(e) };
  }
});

// プロファイル一覧
ipcMain.handle("profile:list", async () => {
  try {
    const meta = readProfilesMeta();
    const profiles = Array.isArray(meta.profiles) ? meta.profiles : [];
    const enriched = profiles.map((p) => {
      const pathStr = p.shortcutPath || "";
      let exists = false;
      try {
        if (pathStr && fsSync.existsSync(pathStr)) {
          exists = true;
        }
      } catch {
        exists = false;
      }
      return {
        id: p.id,
        shortcutPath: pathStr,
        exists,
      };
    });

    return { ok: true, profiles: enriched };
  } catch (e) {
    console.error("[profile] list error:", e);
    return { ok: false, error: String(e) };
  }
});

// プロファイル削除（デフォルト profile-1 は対象外）
ipcMain.handle("profile:delete", async (_event, profileId) => {
  try {
    if (!profileId || profileId === "profile-1") {
      return { ok: false, error: "cannot delete default profile" };
    }

    const meta = readProfilesMeta();
    const profiles = Array.isArray(meta.profiles) ? meta.profiles : [];
    const target = profiles.find((p) => p.id === profileId);

    // ショートカットファイル削除
    if (target && target.shortcutPath) {
      try {
        if (fsSync.existsSync(target.shortcutPath)) {
          fsSync.unlinkSync(target.shortcutPath);
        }
      } catch (e) {
        console.warn("[profile] unlink shortcut failed:", e);
      }
    }

    // セッションディレクトリ削除（Cookie / ログイン情報等）
    try {
      const partitionsDir = path.join(userDataDir, "Partitions");
      const profileDir = path.join(partitionsDir, `persist:${profileId}`);
      if (fsSync.existsSync(profileDir)) {
        fsSync.rmSync(profileDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn("[profile] remove partition dir failed:", e);
    }

    // メタ更新
    meta.profiles = profiles.filter((p) => p.id !== profileId);
    writeProfilesMeta(meta);

    return { ok: true };
  } catch (e) {
    console.error("[profile] delete error:", e);
    return { ok: false, error: String(e) };
  }
});

// ===== IPC: タイトルバー操作・位置 =====
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

ipcMain.handle("history:get-recent", (_event, options) => {
  try {
    return getRecent(options || {});
  } catch (e) {
    console.error("[history] get-recent error:", e);
    return [];
  }
});

app.on("browser-window-created", (_event, win) => {
  // メニューバー完全非表示
  win.setMenuBarVisibility(false);
  // Alt 押しても出てこないように（念のため）
  win.autoHideMenuBar = false;

  // ポップアップウィンドウにもスワイプナビゲーションを付ける
  attachSwipeToWindow(win);
});

// =====================================================
// 二重起動防止
// =====================================================
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  // すでに起動している状態で、別プロファイルのショートカットを起動したとき
  app.on("second-instance", async (_event, commandLine, _workingDirectory) => {
    if (!app.isReady()) return;

    const profileId = extractProfileIdFromArgv(commandLine);
    const url = extractHttpUrlFromArgv(commandLine);

    const win = await createWindow(profileId);
    if (url) {
      openUrlInExistingWindow(win, url);
    }
  });


  app.whenReady().then(async () => {
    initHistory(app);

    setupDownloadEvents();

  const initialProfileId = extractProfileIdFromArgv(process.argv);
  const win = await createWindow(initialProfileId);

  const url = extractHttpUrlFromArgv(process.argv);
  if (url) {
    openUrlInExistingWindow(win, url);
  }
    
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const p = extractProfileIdFromArgv(process.argv);
        await createWindow(p);
      }
    });

    try {
      app.setAsDefaultProtocolClient("http");
      app.setAsDefaultProtocolClient("https");
    } catch (e) {
      console.warn("[default-browser] setAsDefaultProtocolClient failed", e);
    }

    initAIBackend(ipcMain);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("open-url", async (event, url) => {
    event.preventDefault();

    const win = await createWindow(extractProfileIdFromArgv(process.argv));
    openUrlInExistingWindow(win, url);
  });
  
}

