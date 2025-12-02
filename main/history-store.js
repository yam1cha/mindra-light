// main/history-store.js
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");

let history = [];
let historyPath = null;
let saveTimer = null;

const SAVE_DELAY_MS = 2000;   // 2秒まとめ書き
const MAX_ENTRIES = 5000;     // 履歴上限（古いのから捨てる）

function initHistory(app) {
  try {
    const userData = app.getPath("userData");
    historyPath = path.join(userData, "history.json");
    loadHistorySync();
  } catch (e) {
    console.error("[history] init error:", e);
    history = [];
    historyPath = null;
  }
}

function loadHistorySync() {
  if (!historyPath) return;
  try {
    if (!fsSync.existsSync(historyPath)) {
      history = [];
      return;
    }
    const text = fsSync.readFileSync(historyPath, "utf8");
    const json = JSON.parse(text);
    if (Array.isArray(json)) {
      history = json;
    } else {
      history = [];
    }
  } catch (e) {
    console.error("[history] load error:", e);
    history = [];
  }
}

function scheduleSave() {
  if (!historyPath) return;
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      const data = JSON.stringify(history, null, 2);
      await fs.writeFile(historyPath, data, "utf8");
    } catch (e) {
      console.error("[history] save error:", e);
    }
  }, SAVE_DELAY_MS);
}

function addEntry(raw) {
  if (!raw || !raw.url) return;

  const now = Date.now();
  const entry = {
    url: raw.url,
    title: raw.title || null,
    ts: raw.ts || now,
    source: raw.source || "webview",   // "main" / "webview" など
  };

  // 直前と完全に同じ URL ならスキップ（リロード連発防止）
  const last = history[history.length - 1];
  if (last && last.url === entry.url && last.title === entry.title) {
    return;
  }

  history.push(entry);

  // 上限超えたら古いのから削除
  if (history.length > MAX_ENTRIES) {
    const diff = history.length - MAX_ENTRIES;
    history.splice(0, diff);
  }

  scheduleSave();
}

function getRecent(options = {}) {
  const limit = typeof options.limit === "number" ? options.limit : 200;
  if (!Array.isArray(history) || history.length === 0) return [];
  const start = Math.max(0, history.length - limit);
  // 新しい順に返す
  return history.slice(start).reverse();
}

module.exports = {
  initHistory,
  addEntry,
  getRecent,
};
