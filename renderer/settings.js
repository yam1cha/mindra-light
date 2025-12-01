// 設定画面（一般 / LLM）の UI ロジック - Ollama 専用版

(function () {
  let settings = null;
  let onSettingsChangedGlobal = null;

  function initSettingsUI(rootEl, options) {
    options = options || {};
    const store = window.MindraSettingsStore;
    if (!store) {
      console.error('MindraSettingsStore が見つからないよ');
      return;
    }

    settings = store.loadSettings();
    onSettingsChangedGlobal =
      typeof options.onSettingsChanged === "function"
        ? options.onSettingsChanged
        : null;

    rootEl.innerHTML = `
      <div class="settings-container">
        <div class="settings-tabs">
          <button class="settings-tab is-active" data-tab="general">一般</button>
          <button class="settings-tab" data-tab="llm">LLM</button>
        </div>

        <div class="settings-panels">
          <!-- 一般 -->
          <section class="settings-panel" data-panel="general">
            <h2>一般</h2>

            <div class="settings-group">
              <label for="setting-theme">テーマ</label>
              <select id="setting-theme">
                <option value="simple">シンプル</option>
                <option value="cool">クール</option>
                <option value="cute">キュート</option>
              </select>
            </div>
          </section>

          <!-- LLM（Ollama 専用） -->
          <section class="settings-panel is-hidden" data-panel="llm">
            <h2>LLM（Ollama）</h2>

            <div class="settings-group">
              <label for="setting-llm-model-select">接続できたモデル</label>
              <select id="setting-llm-model-select"></select>
              <p class="settings-help">
                過去に設定して接続できたモデルから選べます。
                変更すると設定画面が閉じて、右側のAIサイドバーで自動的に確認が始まるよ。
              </p>
            </div>

            <div class="settings-group">
              <label for="setting-llm-new-model">新しいモデルを追加</label>
              <div class="settings-inline">
                <input
                  type="text"
                  id="setting-llm-new-model"
                  placeholder="例: llama3:8b など"
                />
                <button id="setting-llm-add-model">追加して使う</button>
              </div>
              <p class="settings-help">
                ボタンを押すと右側のAIサイドバーで自動的に確認が始まるよ。
              </p>
            </div>
          </section>
        </div>
      </div>
    `;

    wireTabs(rootEl);
    bindGeneralTab(rootEl);
    bindLlmTab(rootEl);
    applySettingsToUI(rootEl);
  }

  // タブ切り替え
  function wireTabs(rootEl) {
    const tabButtons = rootEl.querySelectorAll(".settings-tab");
    const panels = rootEl.querySelectorAll(".settings-panel");

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.tab;

        tabButtons.forEach((b) =>
          b.classList.toggle("is-active", b === btn)
        );
        panels.forEach((panel) => {
          panel.classList.toggle(
            "is-hidden",
            panel.dataset.panel !== target
          );
        });
      });
    });
  }

  // 一般タブ（テーマだけ）
  function bindGeneralTab(rootEl) {
    const themeSel = rootEl.querySelector("#setting-theme");

    themeSel.addEventListener("change", () => {
      const themeId = themeSel.value;

      settings.general.theme = themeId;
      notifySettingsChanged();

      if (window.mindraTheme && typeof window.mindraTheme.setTheme === "function") {
        window.mindraTheme.setTheme(themeId);
      } else {
        document.documentElement.setAttribute("data-theme", themeId);
      }
    });
  }

  // LLMタブ（モデル履歴 + 新規追加）
  function bindLlmTab(rootEl) {
    const modelSelect = rootEl.querySelector("#setting-llm-model-select");
    const newModelInput = rootEl.querySelector("#setting-llm-new-model");
    const addModelBtn = rootEl.querySelector("#setting-llm-add-model");

    if (!settings.llm) settings.llm = {};

    // 履歴から選択 → モデル切り替え + 設定画面を閉じて LLM チェック
    modelSelect.addEventListener("change", () => {
      const value = modelSelect.value.trim();
      if (!value) return;

      // 設定・保存・バックエンド反映
      applyNewModel(rootEl, value);

      // 設定画面を閉じる
      if (typeof closeSettingsPanel === "function") {
        closeSettingsPanel();
      }

      // 右サイドバーを開く
      if (typeof setRightSidebar === "function") {
        setRightSidebar(true);
      }

      // 右サイドバー側で状態チェックを開始
      if (window.mindraRunStatusCheck) {
        window.mindraRunStatusCheck();
      }
    });

    // 新しいモデルを追加して使う
    addModelBtn.addEventListener("click", () => {
      const value = (newModelInput.value || "").trim();
      if (!value) return;

      // まずバックエンドにモデル名を伝える
      if (window.mindraAI && typeof window.mindraAI.setModel === "function") {
        window.mindraAI.setModel(value);
      }

      // 入力欄リセット
      newModelInput.value = "";

      // 設定画面を閉じる
      if (typeof closeSettingsPanel === "function") {
        closeSettingsPanel();
      }

      // 右サイドバーを強制的に開く
      if (typeof setRightSidebar === "function") {
        setRightSidebar(true);
      }

      // 右サイドバー側で状態チェックを開始
      if (window.mindraRunStatusCheck) {
        window.mindraRunStatusCheck();
      }
    });
  }

  // モデルを設定 & 履歴に反映（履歴から選んだとき用）
  function applyNewModel(rootEl, modelName) {
    if (!settings.llm) settings.llm = {};
    if (!Array.isArray(settings.llm.modelHistory)) {
      settings.llm.modelHistory = [];
    }

    settings.llm.model = modelName;
    if (!settings.llm.modelHistory.includes(modelName)) {
      settings.llm.modelHistory.unshift(modelName);
    }

    notifySettingsChanged();

    // AIバックエンドにも反映
    if (window.mindraAI && typeof window.mindraAI.setModel === "function") {
      window.mindraAI.setModel(modelName);
    }

    refreshModelOptions(rootEl);
    const select = rootEl.querySelector("#setting-llm-model-select");
    if (select) select.value = modelName;
  }

  // モデル履歴からセレクトの中身を作り直す
  function refreshModelOptions(rootEl) {
    if (!settings || !settings.llm) return;

    const modelSelect = rootEl.querySelector("#setting-llm-model-select");
    if (!modelSelect) return;

    const history = Array.isArray(settings.llm.modelHistory)
      ? settings.llm.modelHistory
      : [];
    const current = settings.llm.model || "";

    modelSelect.innerHTML = "";

    history.forEach((name) => {
      if (!name) return;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      modelSelect.appendChild(opt);
    });

    if (current && !history.includes(current)) {
      const opt = document.createElement("option");
      opt.value = current;
      opt.textContent = current;
      modelSelect.appendChild(opt);
    }

    if (current) {
      modelSelect.value = current;
    } else if (modelSelect.options.length > 0) {
      modelSelect.value = modelSelect.options[0].value;
    }
  }

  // 設定値を UI に反映
  function applySettingsToUI(rootEl) {
    if (!settings) return;

    // テーマ
    const themeId = settings.general.theme || "simple";
    rootEl.querySelector("#setting-theme").value = themeId;

    if (window.mindraTheme && typeof window.mindraTheme.setTheme === "function") {
      window.mindraTheme.setTheme(themeId);
    } else {
      document.documentElement.setAttribute("data-theme", themeId);
    }

    // モデル履歴
    refreshModelOptions(rootEl);

    // 起動時にバックエンド側にも一応モデルを同期
    const modelName = settings.llm && settings.llm.model;
    if (modelName && window.mindraAI && typeof window.mindraAI.setModel === "function") {
      window.mindraAI.setModel(modelName);
    }
  }

  // 設定保存 + コールバック
  function notifySettingsChanged() {
    if (!settings) return;
    const store = window.MindraSettingsStore;
    if (!store) return;

    store.saveSettings(settings);
    if (onSettingsChangedGlobal) {
      onSettingsChangedGlobal(settings);
    }
  }

  window.MindraSettings = {
    initSettingsUI,
    getSettings: () => settings,
  };
})();
