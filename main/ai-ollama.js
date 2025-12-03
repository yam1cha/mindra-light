// =============================================
// Mindra Light - ローカルLLM (Ollama) バックエンド
// ---------------------------------------------
// - Electron main プロセスで Ollama の REST API を叩く
// - 右AIサイドバーとは IPC でやり取りするだけ
// - モデルのダウンロードや常駐は Ollama 側に任せる
// =============================================

const { app } = require("electron");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const http = require("http");

// デフォルト設定（必要なら環境変数で上書き）
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.MINDRA_AI_MODEL || "qwen2.5:7b-instruct";

// ステータス用ファイル
let statusFilePath = null;
let statusCache = null;

function ensureStatusFilePath() {
  if (!statusFilePath) {
    const userData = app.getPath("userData");
    statusFilePath = path.join(userData, "ai-model-status.json");
  }
  return statusFilePath;
}

async function readStatus() {
  const file = ensureStatusFilePath();
  if (statusCache) return statusCache;
  try {
    const buf = await fsp.readFile(file, "utf8");
    statusCache = JSON.parse(buf);
  } catch (_) {
    statusCache = {
      downloading: false,
      downloaded: false,
      model: OLLAMA_MODEL,
      lastPreloadAt: null,
      lastError: null,
      lastErrorType: null, // "server-unreachable" | "model-not-found" | "unknown"
    };
  }
  // モデル名だけは毎回最新に合わせる（なければデフォルト）
  if (!statusCache.model) statusCache.model = OLLAMA_MODEL;
  return statusCache;
}

async function writeStatus(patch) {
  const file = ensureStatusFilePath();
  const base = await readStatus();
  const next = { ...base, ...patch };
  statusCache = next;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function getCurrentModelName() {
  const st = await readStatus();
  return st && st.model ? st.model : OLLAMA_MODEL;
}

// シンプルな HTTP POST(JSON) ヘルパー
function postJson(pathname, payload, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(pathname, OLLAMA_BASE_URL);
      const body = JSON.stringify(payload);

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              // エラーレスポンスも本文を付けて返す
              return reject(
                new Error(
                  `HTTP ${res.statusCode} from Ollama ${url.pathname}: ${data.slice(
                    0,
                    500
                  )}`
                )
              );
            }
            try {
              const json = JSON.parse(data || "{}");
              resolve(json);
            } catch (err) {
              reject(
                new Error(
                  `Failed to parse JSON from Ollama ${url.pathname}: ${err.message}`
                )
              );
            }
          });
        }
      );

      req.on("error", (err) => {
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy(new Error("Ollama request timeout"));
      });

      req.write(body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// エラーをざっくり分類して UI に渡す用
function classifyError(err) {
  console.error("[ai-ollama] error:", err);
  const msg = String(err && err.message ? err.message : err || "").toLowerCase();

  if (
    msg.includes("econnrefused") ||
    msg.includes("connect econnrefused") ||
    msg.includes("enoent") ||
    msg.includes("failed to fetch") ||
    msg.includes("request timeout")
  ) {
    return {
      type: "server-unreachable",
      message:
        "Ollama サーバーに接続できないみたい。Ollama が起動しているか確認してね。",
    };
  }

  if (msg.includes("model") && msg.includes("not found")) {
    return {
      type: "model-not-found",
      message:
        "指定されたモデルが Ollama に存在しないみたい。「ollama pull xxx」で取得してから試してね。",
    };
  }

  return {
    type: "unknown",
    message: err && err.message ? err.message : "不明なエラーが発生したよ。",
  };
}

// ---------------------------------------------
// モデルのプリロード
// ---------------------------------------------
async function preloadModelInternal(modelOverride) {
  const modelName =
    typeof modelOverride === "string" && modelOverride.trim()
      ? modelOverride.trim()
      : await getCurrentModelName();

  await writeStatus({
    downloading: true,
    downloaded: false,
    model: modelName,
    lastPreloadAt: new Date().toISOString(),
    lastError: null,
    lastErrorType: null,
  });

  try {
    const payload = {
      model: modelName,
      prompt: "",
      stream: false,
    };

    // Ollama の /api/generate を軽く叩いて、モデルをメモリに載せる用途
    await postJson("/api/generate", payload);

    await writeStatus({
      downloading: false,
      downloaded: true,
      lastError: null,
      lastErrorType: null,
    });

    return { ok: true };
  } catch (err) {
    const info = classifyError(err);
    await writeStatus({
      downloading: false,
      downloaded: false,
      lastError: info.message,
      lastErrorType: info.type,
    });

    return { ok: false, error: info.message, errorType: info.type };
  }
}

// ---------------------------------------------
// チャット本体
// ---------------------------------------------
async function chatInternal(message, history = []) {
  const apiMessages = [];

  apiMessages.push({
    role: "system",
    content:
      "You are a helpful AI assistant running locally via Ollama. If the user speaks Japanese, reply in natural Japanese.",
  });

  for (const m of history) {
    if (!m || typeof m.content !== "string") continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    apiMessages.push({ role, content: m.content });
  }

  apiMessages.push({ role: "user", content: message });

  const modelName = await getCurrentModelName();

  const payload = {
    model: modelName,
    messages: apiMessages,
    stream: false,
  };

  const res = await postJson("/api/chat", payload);
  const text =
    res && res.message && typeof res.message.content === "string"
      ? res.message.content
      : "";

  if (!text) {
    throw new Error("Empty response from Ollama /api/chat");
  }

  return text;
}

// ---------------------------------------------
// IPC 初期化
// ---------------------------------------------
function initAIBackend(ipcMain) {
  ipcMain.handle("mindra-ai:get-status", async () => {
    try {
      const st = await readStatus();
      return { ok: true, status: st };
    } catch (err) {
      console.error("[ai-ollama] get-status error:", err);
      const info = classifyError(err);
      return {
        ok: false,
        error: info.message,
        errorType: info.type,
      };
    }
  });

  // モデル名を変える IPC
  ipcMain.handle("mindra-ai:set-model", async (_event, modelName) => {
    try {
      const name =
        typeof modelName === "string" && modelName.trim()
          ? modelName.trim()
          : null;
      if (!name) {
        throw new Error("modelName is required");
      }

      const st = await writeStatus({
        model: name,
        downloaded: false,
        downloading: false,
        lastError: null,
        lastErrorType: null,
      });

      return { ok: true, status: st };
    } catch (err) {
      console.error("[ai-ollama] set-model error:", err);
      const info = classifyError(err);
      return {
        ok: false,
        error: info.message,
        errorType: info.type,
      };
    }
  });

  ipcMain.handle("mindra-ai:preload", async () => {
    return preloadModelInternal();
  });

  ipcMain.handle("mindra-ai:chat", async (_event, payload) => {
    try {
      const { message, history = [] } = payload || {};
      if (!message || typeof message !== "string") {
        throw new Error("message is required");
      }
      const text = await chatInternal(message, history);
      return { ok: true, text };
    } catch (err) {
      console.error("[ai-ollama] chat error:", err);
      const info = classifyError(err);
      return { ok: false, error: info.message, errorType: info.type };
    }
  });


  ipcMain.handle("ollama-try-add-model", async (e, modelName) => {
    // 現状モデルを覚えておく
    const prev = currentModel;

    // モデルセット
    const okSet = await setModelInternal(modelName);

    if (!okSet) {
      // サイドバーにエラーだけ流す
      writeStatus({
        downloading: false,
        downloaded: false,
        model: modelName,
        lastError: "モデルをセットできません",
        lastErrorType: "model-set-failed"
      });
      return { ok: false };
    }

    // preloadModel()で実際に接続チェック
    const okLoad = await preloadModel();

    if (!okLoad) {
      // ダメなら元のモデルに戻す
      await setModelInternal(prev);

      // エラーをサイドバーに表示
      writeStatus({
        downloading: false,
        downloaded: false,
        model: modelName,
        lastError: "Ollama で取得できません",
        lastErrorType: "model-not-found"
      });
      return { ok: false };
    }

    // 成功！
    // 設定履歴に登録
    const s = window.MindraSettingsStore.loadSettings();
    if (!s.llm.modelHistory.includes(modelName)) {
      s.llm.modelHistory.unshift(modelName);
    }
    s.llm.model = modelName;
    window.MindraSettingsStore.saveSettings(s);

    // サイドバー用ステータス
    writeStatus({
      downloading: false,
      downloaded: true,
      model: modelName,
      lastError: null,
      lastErrorType: null
    });

    return { ok: true };
  });

}

module.exports = {
  initAIBackend,
};
