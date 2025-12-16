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

    // 2カラムレイアウト用スタイルを注入
    injectLayoutStylesOnce();

    rootEl.innerHTML = `
      <div class="settings-container">
        <div class="settings-panels">
          <!-- 一般 -->
          <section class="settings-panel" data-panel="general">
            <h2>一般</h2>

            <div class="settings-group">
              <label for="setting-theme">テーマ</label>
              <select id="setting-theme" class="settings-select">
                <option value="simple">simple</option>
                <option value="cool">cool</option>
                <option value="cute">cute</option>
                <option value="mint">mint</option>
                <option value="emerald">emerald</option>
                <option value="zenith">zenith</option>
                <option value="aurora">aurora</option>
              </select>
            </div>

            <div class="settings-group">
              <label>
                <input type="checkbox" id="setting-enable-adblock" />
                広告ブロックを有効にする
              </label>
              <p class="settings-help">
                EasyList などのルールを使って広告をブロックするよ。
              </p>
            </div>

            <div class="settings-group">
              <label>
                <input type="checkbox" id="setting-enable-popups" />
                ポップアップウィンドウを許可する
              </label>
              <p class="settings-help">
                オフにするとポップアップは開かず、新しいタブとして開くようにするよ。
              </p>
            </div>

            <div class="settings-group">
              <label class="settings-label">プロファイル一覧</label>
              <div class="settings-row">
                <select id="setting-profile-list" class="settings-select">
                </select>
                <button id="setting-profile-delete" class="settings-button">
                  選択したプロファイルを削除
                </button>
              </div>
              <p class="settings-help">
                デフォルトの <code>profile-1</code> は削除できないよ。
              </p>
            </div>

            <div class="settings-group">
              <label class="settings-label">プロファイル</label>
              <div class="settings-row">
                <button id="setting-add-profile-shortcut" class="settings-button">
                  プロファイルの追加
                </button>
              </div>
              <p class="settings-help">
                デスクトップに新しいプロファイル用ショートカットを作るよ。
              </p>
            </div>

            <!-- 障害ログフォルダを開く -->
            <div class="settings-group">
              <label class="settings-label">ログ</label>
              <div class="settings-row">
                <button id="setting-open-logs" class="settings-button">
                  障害ログフォルダを開く
                </button>
              </div>
              <p class="settings-help">
                障害が起きたときのログファイルが入っているフォルダを開くよ。
              </p>
            </div>
          </section>

          <!-- LLM（Ollama 専用） -->
          <!-- is-hidden を削除して常に右側に表示 -->
          <section class="settings-panel" data-panel="llm">
            <h2>LLM（Ollama）</h2>

            <div class="settings-group">
              <label for="setting-llm-model-select">接続できたモデル</label>
              <select id="setting-llm-model-select" class="settings-select"></select>
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
                <button id="setting-llm-add-model" class="settings-button">
                  追加して使う
                </button>
              </div>
              <p class="settings-help">
                ボタンを押すと右側のAIサイドバーで自動的に確認が始まるよ。
              </p>
            </div>
          </section>
        </div>
      </div>
    `;

    wireTabs(rootEl);          // .settings-tab が無ければ何もしない
    bindGeneralTab(rootEl);
    bindLlmTab(rootEl);
    applySettingsToUI(rootEl);
  }

  // 2カラムレイアウト用スタイル
  function injectLayoutStylesOnce() {
    const id = "mindra-settings-layout-style";
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      #settings-panel {
        max-width: 900px !important;
        width: 900px !important;
      }
      .settings-container {
        padding: 12px 16px;
      }
      /* 左：一般 / 右：LLM の2カラム */
      .settings-panels {
        display: flex;
        gap: 16px;
        align-items: flex-start;
        min-width: 720px;
        gap: 24px !important;
      }
      .settings-panel {
        flex: 1 1 0;
        min-width: 340px;
      }
      @media (max-width: 720px) {
        .settings-panels {
          flex-direction: column;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // タブ切り替え（今の HTML には .settings-tab が無いので実質何もしない）
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

  // 一般タブ（テーマ + 広告ブロック + ポップアップ + ログ + プロファイル）
  function bindGeneralTab(rootEl) {
    const themeSel = rootEl.querySelector("#setting-theme");
    const adblockChk = rootEl.querySelector("#setting-enable-adblock");
    const popupChk = rootEl.querySelector("#setting-enable-popups");
    const openLogsBtn = rootEl.querySelector("#setting-open-logs");
    const addProfileBtn = rootEl.querySelector(
      "#setting-add-profile-shortcut"
    );
    const profileListSel = rootEl.querySelector("#setting-profile-list");
    const profileDeleteBtn = rootEl.querySelector("#setting-profile-delete");

    // 安全ガード
    if (!settings || !settings.general) {
      settings = settings || {};
      settings.general = settings.general || {};
    }

    // 初期値反映
    if (adblockChk) {
      adblockChk.checked = !!settings.general.enableAdblock;
    }
    if (popupChk) {
      popupChk.checked = !!settings.general.enablePopups;
    }

    // テーマ変更
    if (themeSel) {
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

    // 広告ブロック ON/OFF
    if (adblockChk) {
      adblockChk.addEventListener("change", () => {
        settings.general.enableAdblock = adblockChk.checked;
        notifySettingsChanged();

        if (window.mindraSettingsBridge && window.mindraSettingsBridge.updateGeneralFlags) {
          window.mindraSettingsBridge.updateGeneralFlags({
            enableAdblock: settings.general.enableAdblock,
          });
        }
      });
    }

    // ポップアップ ON/OFF
    if (popupChk) {
      popupChk.addEventListener("change", () => {
        settings.general.enablePopups = popupChk.checked;
        notifySettingsChanged();

        if (window.mindraSettingsBridge && window.mindraSettingsBridge.updateGeneralFlags) {
          window.mindraSettingsBridge.updateGeneralFlags({
            enablePopups: settings.general.enablePopups,
          });
        }
      });
    }

    // 障害ログフォルダを開く
    if (openLogsBtn) {
      openLogsBtn.addEventListener("click", async () => {
        if (
          !window.mindraLogs ||
          typeof window.mindraLogs.openFolder !== "function"
        ) {
          alert("ごめん…ログフォルダを開く機能がまだ有効になってないみたい。");
          return;
        }
        try {
          const res = await window.mindraLogs.openFolder();
          if (!res || !res.ok) {
            const msg = (res && res.error) || "ログフォルダを開けなかったよ…。";
            console.error("[settings] open logs folder error:", msg);
            alert("ログフォルダを開けなかったよ…\n" + msg);
          }
        } catch (e) {
          console.error("[settings] openLogsBtn click error:", e);
          alert("ログフォルダを開く途中でエラーが出ちゃった…。");
        }
      });
    }

    // プロファイルショートカット追加
    if (addProfileBtn) {
      addProfileBtn.addEventListener("click", async () => {
        if (
          !window.mindraSettingsBridge ||
          typeof window.mindraSettingsBridge.createProfileShortcut !== "function"
        ) {
          console.error("mindraSettingsBridge.createProfileShortcut が見つからないよ");
          alert("ごめん…ショートカット機能がまだ有効になってないみたい。");
          return;
        }

        try {
          const result = await window.mindraSettingsBridge.createProfileShortcut();
          if (result && result.ok) {
            alert(
              `プロファイル「${result.profileId}」のショートカットを作ったよ！\n` +
              `${result.shortcutPath}`
            );
            // 一覧を更新
            await reloadProfileList();
          } else {
            console.error("profile:create-shortcut failed:", result);
            alert("ショートカットの作成に失敗しちゃった…。");
          }
        } catch (e) {
          console.error(e);
          alert("ショートカットの作成中にエラーが出ちゃった…。");
        }
      });
    }

    // プロファイル一覧の読み込み
    async function reloadProfileList() {
      if (!profileListSel) return;

      // デフォルト profile-1 を先頭に固定で入れる
      const options = [];

      options.push({
        id: "profile-1",
        label: "profile-1 (デフォルト)",
        deletable: false,
      });

      if (
        window.mindraSettingsBridge &&
        typeof window.mindraSettingsBridge.listProfiles === "function"
      ) {
        try {
          const res = await window.mindraSettingsBridge.listProfiles();
          if (res && res.ok && Array.isArray(res.profiles)) {
            res.profiles.forEach((p) => {
              if (!p || !p.id) return;
              options.push({
                id: p.id,
                label: p.exists
                  ? `${p.id}（ショートカットあり）`
                  : `${p.id}（ショートカット見つからず）`,
                deletable: true,
              });
            });
          }
        } catch (e) {
          console.error("profile:list error", e);
        }
      }

      profileListSel.innerHTML = "";
      options.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.id;
        o.textContent = opt.label;
        profileListSel.appendChild(o);
      });
    }

    // プロファイル削除
    if (profileDeleteBtn) {
      profileDeleteBtn.addEventListener("click", async () => {
        if (!profileListSel) return;
        const profileId = profileListSel.value;

        if (!profileId) return;

        if (profileId === "profile-1") {
          alert("デフォルトの profile-1 は削除できないよ。");
          return;
        }

        if (
          !window.mindraSettingsBridge ||
          typeof window.mindraSettingsBridge.deleteProfile !== "function"
        ) {
          alert("ごめん…プロファイル削除の機能がまだ有効になってないみたい。");
          return;
        }

        const ok = confirm(
          `本当に「${profileId}」を削除する？\n` +
            "このプロファイルのショートカットとログイン情報が消えるよ。"
        );
        if (!ok) return;

        try {
          const res = await window.mindraSettingsBridge.deleteProfile(profileId);
          if (res && res.ok) {
            alert(`「${profileId}」を削除したよ。`);
            await reloadProfileList();
          } else {
            console.error("profile:delete failed", res);
            alert("プロファイルの削除に失敗しちゃった…。");
          }
        } catch (e) {
          console.error(e);
          alert("プロファイル削除中にエラーが出ちゃった…。");
        }
      });
    }

    // 起動時に一覧を読み込み
    reloadProfileList();
  }

  // LLMタブ（モデル履歴 + 新規追加）
  function bindLlmTab(rootEl) {
    const modelSelect = rootEl.querySelector("#setting-llm-model-select");
    const newModelInput = rootEl.querySelector("#setting-llm-new-model");
    const addModelBtn = rootEl.querySelector("#setting-llm-add-model");

    if (!settings.llm) settings.llm = {};

    // 履歴から選択 → モデル切り替え + 設定画面を閉じて LLM チェック
    if (modelSelect) {
      modelSelect.addEventListener("change", () => {
        const value = modelSelect.value.trim();
        if (!value) return;

        applyNewModel(rootEl, value);

        if (typeof closeSettingsPanel === "function") {
          closeSettingsPanel();
        }
        if (typeof setRightSidebar === "function") {
          setRightSidebar(true);
        }
        if (window.mindraRunStatusCheck) {
          window.mindraRunStatusCheck();
        }
      });
    }

    // 新しいモデルを追加して使う
    if (addModelBtn) {
      addModelBtn.addEventListener("click", () => {
        const value = (newModelInput.value || "").trim();
        if (!value) return;

        if (window.mindraAI && typeof window.mindraAI.setModel === "function") {
          window.mindraAI.setModel(value);
        }

        newModelInput.value = "";

        if (typeof closeSettingsPanel === "function") {
          closeSettingsPanel();
        }
        if (typeof setRightSidebar === "function") {
          setRightSidebar(true);
        }
        if (window.__mindraSetAiChatMode) {
          window.__mindraSetAiChatMode();
        }
        if (window.mindraRunStatusCheck) {
          window.mindraRunStatusCheck();
        }
      });
    }
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
    if (window.__mindraSetAiChatMode) {
      window.__mindraSetAiChatMode();
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
    const themeId = (settings.general && settings.general.theme) || "simple";
    const themeSel = rootEl.querySelector("#setting-theme");
    if (themeSel) themeSel.value = themeId;

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

    // 一般設定フラグも main に同期
    if (window.mindraSettingsBridge && window.mindraSettingsBridge.updateGeneralFlags) {
      window.mindraSettingsBridge.updateGeneralFlags({
        enableAdblock: !!(settings.general && settings.general.enableAdblock),
        enablePopups: !!(settings.general && settings.general.enablePopups),
      });
    }

    // チェックボックス側にも反映（再オープン時用）
    const adblockChk = rootEl.querySelector("#setting-enable-adblock");
    const popupChk = rootEl.querySelector("#setting-enable-popups");
    if (adblockChk) adblockChk.checked = !!(settings.general && settings.general.enableAdblock);
    if (popupChk) popupChk.checked = !!(settings.general && settings.general.enablePopups);
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
