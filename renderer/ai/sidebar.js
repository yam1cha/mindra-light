// ===============================================
// Mindra Light - AI サイドバー (Ollama backend)
// UI制御 + バブル生成 + 状態チェック
// ===============================================
(function () {
  const rightSidebarMain = document.getElementById("right-sidebar-main");
  const aiStatusZone = document.getElementById("ai-status-zone");
  const aiRecheckBtn = document.getElementById("ai-recheck-btn");
  const aiStatusText = document.getElementById("ai-status-text");
  const aiInput = document.getElementById("ai-input");
  const aiSendBtn = document.getElementById("ai-send");
  const aiInputRow = document.getElementById("ai-input-row");

  // AIモード切替トグル
  const aiWebModeToggle = document.getElementById("ai-web-mode-toggle");
  const aiModeLabel = document.getElementById("ai-mode-label");
  const aiSegAi = document.getElementById("ai-seg-ai");
  const aiSegWeb = document.getElementById("ai-seg-web");

  if (
    !rightSidebarMain ||
    !aiStatusZone ||
    !aiRecheckBtn ||
    !aiStatusText ||
    !aiInput ||
    !aiSendBtn ||
    !aiInputRow ||
    !aiWebModeToggle ||
    !aiModeLabel ||
    !aiSegAi ||
    !aiSegWeb
  ) {
    console.warn("[sidebar.js] AI sidebar elements missing");
    return;
  }

  // ---- チャット領域 ----
  let chatContainer = document.getElementById("ai-chat-container");
  if (!chatContainer) {
    chatContainer = document.createElement("div");
    chatContainer.id = "ai-chat-container";
    rightSidebarMain.insertBefore(chatContainer, aiInputRow);
  }

  // ---- 状態管理 ----
  let modelReady = false;
  let checkingStatus = false;
  let generating = false;
  let lastErrorType = null;
  let lastErrorMessage = "";
  let activeModelName = "";
  const messages = [];

  // Webコマンドモード（自然文をそのまま runUniversalSearch に流す）
  let autoWebMode = false;

  // ===============================================
  // AIモード（AIチャット / Web送信）設定
  // ===============================================
  function updateAiModeLabel() {
    if (autoWebMode) {
      aiModeLabel.textContent = "送信モード";
      aiSegAi.classList.remove("active");
      aiSegWeb.classList.add("active");
    } else {
      aiModeLabel.textContent = "AIチャット";
      aiSegAi.classList.add("active");
      aiSegWeb.classList.remove("active");
    }
  }

  function loadAiModeFromSettings() {
    if (!window.MindraSettingsStore) {
      autoWebMode = false;
      return;
    }
    try {
      const store = window.MindraSettingsStore;
      const s = store.loadSettings();
      autoWebMode = !!(s.ai && s.ai.autoWebMode);
    } catch (e) {
      console.warn("[sidebar.js] loadAiModeFromSettings error", e);
      autoWebMode = false;
    }
  }

  function saveAiModeToSettings() {
    if (!window.MindraSettingsStore) return;
    try {
      const store = window.MindraSettingsStore;
      const s = store.loadSettings();
      if (!s.ai) s.ai = {};
      s.ai.autoWebMode = !!autoWebMode;
      store.saveSettings(s);
    } catch (e) {
      console.warn("[sidebar.js] saveAiModeToSettings error", e);
    }
  }

  // 設定から読み込んでトグルに反映
  loadAiModeFromSettings();
  aiWebModeToggle.checked = autoWebMode;
  updateAiModeLabel();

  // セグメントボタン → hidden checkbox に伝える
  aiSegAi.addEventListener("click", () => {
    if (!autoWebMode) return; // すでにAIモードなら何もしない
    aiWebModeToggle.checked = false;
    aiWebModeToggle.dispatchEvent(new Event("change"));
  });

  aiSegWeb.addEventListener("click", () => {
    if (autoWebMode) return; // すでに送信モードなら何もしない
    aiWebModeToggle.checked = true;
    aiWebModeToggle.dispatchEvent(new Event("change"));
  });

  // チェックボックス側が変わったとき
  aiWebModeToggle.addEventListener("change", () => {
    autoWebMode = !!aiWebModeToggle.checked;
    saveAiModeToSettings();
    updateAiModeLabel();
    applyLayout();
  });

  // ===============================================
  // 入力欄（Shift+Enter改行 + 高さ自動調整）
  // ===============================================
  aiInput.style.resize = "none";
  aiInput.style.overflow = "hidden";
  aiInput.rows = 1;

  function updateInputHeight() {
    aiInput.style.height = "auto";
    const maxHeight = 120;
    aiInput.style.height = Math.min(aiInput.scrollHeight, maxHeight) + "px";
  }

  updateInputHeight();
  aiInput.addEventListener("input", updateInputHeight);

  aiInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        e.preventDefault();
        const el = aiInput;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        el.value = el.value.slice(0, start) + "\n" + el.value.slice(end);
        el.selectionStart = el.selectionEnd = start + 1;
        updateInputHeight();
      } else {
        e.preventDefault();
        handleSend();
      }
    }
  });

  // ===============================================
  // チャットバブル生成（CSSクラス版）
  // ===============================================
  function appendMessage(role, text) {
    const row = document.createElement("div");
    row.classList.add("ai-chat-row", role === "user" ? "user" : "assistant");

    const bubble = document.createElement("div");
    bubble.classList.add(
      "ai-chat-bubble",
      role === "user" ? "user" : "assistant"
    );
    bubble.textContent = text;

    row.appendChild(bubble);
    chatContainer.appendChild(row);

    messages.push({ role, content: text });

    scrollToBottom();
  }

  // 他ファイルからチャット欄にメッセージを追加するためのフック
  window.mindraAppendAiMessage = function (role, text) {
    appendMessage(role, text);
  };

  function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // appendMessage を外部から使えるよう window に公開
  window.__mindraAppendMessage = appendMessage;

  // ===============================================
  // 送信処理
  // ===============================================
  async function handleSend() {
    const text = aiInput.value.trim();
    if (!text) return;

    aiInput.value = "";
    updateInputHeight();
    appendMessage("user", text);

    try {
      // 送信モード：Webコマンド
      if (autoWebMode && typeof window.runUniversalSearch === "function") {
        try {
          const result = await window.runUniversalSearch(text);

          if (!result) {
            appendMessage("assistant", "ブラウザに送ったよ。");
            return;
          }

          if (typeof result === "string") {
            appendMessage("assistant", result);
            return;
          }

          if (result.message) {
            appendMessage("assistant", result.message);
            return;
          }

          if (result.ok) {
            appendMessage("assistant", "処理が完了したよ。");
            return;
          }

          appendMessage(
            "assistant",
            result.error || "処理結果がよくわからなかったよ。"
          );
          return;
        } catch (e) {
          console.error("autoWebMode runUniversalSearch error:", e);
          appendMessage(
            "assistant",
            "コマンドの実行中にエラーが起きたよ。"
          );
          return;
        }
      }

      // ここから下は通常モード（AIチャット + コマンド）
      if (!window.mindraDispatcher || !window.mindraDispatcher.handle) {
        console.warn("mindraDispatcher が無い or handle が無い");
        if (window.mindraAI && window.mindraAI.ask) {
          const aiRes = await window.mindraAI.ask(text, []);
          if (aiRes && aiRes.ok) {
            appendMessage("assistant", aiRes.message || aiRes.text || "");
            return;
          }
          appendMessage("assistant", "AI 応答が得られませんでした。");
          return;
        }
        appendMessage("assistant", "内部エラー: dispatcher がありません");
        return;
      }

      const reply = await window.mindraDispatcher.handle(text);

      if (!reply) {
        appendMessage("assistant", "応答がありませんでした。");
        return;
      }
      if (typeof reply === "string") {
        appendMessage("assistant", reply);
        return;
      }
      if (reply.message) {
        appendMessage("assistant", reply.message);
      } else if (reply.ok) {
        appendMessage("assistant", "処理が完了しました。");
      } else {
        appendMessage("assistant", reply.error || "不明な結果");
      }
    } catch (err) {
      console.error("handleSend ERROR:", err);
      appendMessage("assistant", "送信中にエラーが発生しました。");
    }
  }

  aiSendBtn.addEventListener("click", handleSend);

  // ===============================================
  // レイアウト（ボタン状態・表示切替）
  // ===============================================
  function applyLayout() {
    // ---------- 送信モード（Webコマンド） ----------
    // LLM状態は一切見せない。ステータスゾーン非表示。
    if (autoWebMode) {
      aiStatusZone.style.display = "none";
      chatContainer.style.display = "flex";
      aiInputRow.style.display = "flex";

      if (generating) {
        aiInput.disabled = true;
        aiSendBtn.disabled = true;
        aiInput.placeholder = "処理中…";
      } else {
        aiInput.disabled = false;
        aiSendBtn.disabled = false;
        aiInput.placeholder = "";
      }
      return;
    }

    // ---------- AIチャットモード ----------
    if (!modelReady || checkingStatus) {
      aiStatusZone.style.display = "flex";
      chatContainer.style.display = "none";
      aiInputRow.style.display = "none";

      if (checkingStatus) {
        aiRecheckBtn.style.display = "none";
        aiStatusText.textContent = "LLMモデルを確認中…";
      } else {
        aiRecheckBtn.style.display = "inline-flex";
        aiStatusText.textContent = "接続に失敗しました";
      }
    } else {
      aiStatusZone.style.display = "none";
      chatContainer.style.display = "flex";
      aiInputRow.style.display = "flex";
    }

    if (!modelReady || checkingStatus) {
      aiInput.disabled = true;
      aiSendBtn.disabled = true;

      if (checkingStatus) {
        aiInput.placeholder = "ローカルAI確認中…";
      } else if (lastErrorType === "server-unreachable") {
        aiInput.placeholder = "Ollama が起動してないかも。";
      } else if (lastErrorType === "model-not-found") {
        aiInput.placeholder = "モデルが見つからないよ。";
      } else if (lastErrorMessage) {
        aiInput.placeholder = "AIが使えない状態だよ。";
      } else {
        aiInput.placeholder = "ローカルAIを確認中…";
      }
    } else if (generating) {
      aiInput.disabled = true;
      aiSendBtn.disabled = true;
      aiInput.placeholder = "生成中…";
    } else {
      aiInput.disabled = false;
      aiSendBtn.disabled = false;
      aiInput.placeholder = "Shift+Enterで改行";
    }
  }

  // ===============================================
  // 状態チェック（Ollamaモデル読み込み）
  // ===============================================
  async function runStatusCheck() {
    checkingStatus = true;
    modelReady = false;
    lastErrorType = null;
    lastErrorMessage = "";
    activeModelName = "";

    applyLayout();

    if (!window.mindraAI || typeof window.mindraAI.getStatus !== "function") {
      lastErrorType = "unknown";
      lastErrorMessage = "mindraAI.getStatus が見つからないよ。";
      checkingStatus = false;
      modelReady = false;
      applyLayout();
      return;
    }

    try {
      const res = await window.mindraAI.getStatus();
      if (!res || res.ok === false || !res.status) {
        lastErrorType = res?.errorType || "server-unreachable";
        lastErrorMessage =
          res?.error ||
          "Ollama が起動していないか、AIバックエンドでエラーが起きたよ。";
        checkingStatus = false;
        modelReady = false;
        applyLayout();
        return;
      }

      const st = res.status;
      activeModelName = st.model || "";

      if (st.downloaded) {
        modelReady = true;
        checkingStatus = false;
        lastErrorType = null;
        lastErrorMessage = "";
        // 成功したモデルを設定に記録
        registerSuccessfulModel(st.model || activeModelName);
        applyLayout();
        return;
      }

      if (typeof window.mindraAI.preloadModel === "function") {
        const pr = await window.mindraAI.preloadModel();
        if (!pr || pr.ok === false) {
          lastErrorType = pr?.errorType || "unknown";
          lastErrorMessage = pr?.error || "モデルの準備に失敗しちゃった…。";
          checkingStatus = false;
          modelReady = false;
          applyLayout();
          return;
        }

        modelReady = true;
        checkingStatus = false;
        lastErrorType = null;
        lastErrorMessage = "";
        // 成功したモデルを設定に記録
        registerSuccessfulModel(activeModelName);
        applyLayout();
        return;
      }

      lastErrorType = "model-not-found";
      lastErrorMessage =
        "Ollama にモデルが入ってないみたい。pull してから再チェックしてね。";
      checkingStatus = false;
      modelReady = false;
      applyLayout();
    } catch (e) {
      console.error("[sidebar.js] statusCheck error", e);
      lastErrorType = "unknown";
      lastErrorMessage = e.message || "状態チェックでエラーが出たよ…。";
      checkingStatus = false;
      modelReady = false;
      applyLayout();
    }
  }

  // 成功したモデルを設定に記録（settings-store を更新）
  function registerSuccessfulModel(modelName) {
    if (!modelName) return;
    if (!window.MindraSettingsStore) return;
    try {
      const store = window.MindraSettingsStore;
      const s = store.loadSettings();
      if (!s.llm) s.llm = {};
      if (!Array.isArray(s.llm.modelHistory)) {
        s.llm.modelHistory = [];
      }
      if (!s.llm.modelHistory.includes(modelName)) {
        s.llm.modelHistory.unshift(modelName);
      }
      s.llm.model = modelName;
      store.saveSettings(s);
    } catch (e) {
      console.warn("[sidebar.js] registerSuccessfulModel error", e);
    }
  }

  // 設定画面などから状態チェックを開始するための窓口
  window.mindraRunStatusCheck = function () {
    if (!checkingStatus) {
      runStatusCheck();
    }
  };

  // === 外部からAIモード強制切り替え用 ===
  window.__mindraSetAiChatMode = function () {
    autoWebMode = false;
    aiWebModeToggle.checked = false;
    saveAiModeToSettings();
    updateAiModeLabel();
    applyLayout();
  };
  
  // ===============================================
  // ボタンイベント
  // ===============================================
  aiRecheckBtn.addEventListener("click", () => {
    if (checkingStatus) return;
    runStatusCheck();
  });

  // ===============================================
  // 初期化
  // ===============================================
  modelReady = false;
  checkingStatus = true;
  generating = false;

  applyLayout();
  runStatusCheck();

})();
