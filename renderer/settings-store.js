// settings-store.js
// MindraLight 設定の読み書き専用モジュール（Ollama専用版 + モデル履歴）

(function () {
  const DEFAULT_PROFILE_ID = 'profile-1';

  const saveKeyPrefix =
    (window.config && typeof window.config.SAVE_KEY_PREFIX === 'string'
      ? window.config.SAVE_KEY_PREFIX
      : '') || '';

  const profileIdFromConfig =
    (window.config && typeof window.config.profileId === 'string'
      ? window.config.profileId
      : DEFAULT_PROFILE_ID) || DEFAULT_PROFILE_ID;

  const profileId = /^profile-\d+$/.test(profileIdFromConfig)
    ? profileIdFromConfig
    : DEFAULT_PROFILE_ID;

  const SETTINGS_KEY = `${saveKeyPrefix}mindra_settings_${profileId}_v1`;
  const LEGACY_SETTINGS_KEY = `${saveKeyPrefix}mindra_settings_v1`;

  const defaultSettings = {
    general: {
      // 'cool' | 'cute' | 'simple'
      theme: 'cute',
      enableAdblock: true,   // 広告ブロック ON/OFF
      enablePopups: false,   // ポップアップウィンドウを許可するか
       // 以下は内部用。UIではいじらないけど、互換性のため残しておく
      restoreLayoutOnStartup: true,
      pinSidebar: true,
      pinTitlebar: true,
      showAiBar: true,
    },
    llm: {
      enabled: true,
      useWebSearch: false,
      temperature: 0.7,
      maxTokens: 1024,

      // 現在のモデル
      model: 'qwen2.5:7b-instruct',

      // モデル履歴
      modelHistory: ['qwen2.5:7b-instruct'],
    },
  };

  /**
   * デフォルト設定と読み込んだ設定をマージするための浅めの再帰マージ。
   * @param {Record<string, any>} target マージ先オブジェクト。
   * @param {Record<string, any>} source マージ元オブジェクト。
   * @returns {Record<string, any>} マージ済みオブジェクト。
   */
  function deepMerge(target, source) {
    const result = Array.isArray(target) ? [...target] : { ...target };
    for (const key of Object.keys(source)) {
      const srcVal = source[key];
      const dstVal = result[key];
      if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
        result[key] = deepMerge(dstVal || {}, srcVal);
      } else if (dstVal === undefined) {
        result[key] = srcVal;
      }
    }
    return result;
  }

  /**
   * JSON ベースの簡易ディープコピー。
   * @param {any} obj コピー対象。
   * @returns {any} クローン結果。
   */
  function structuredClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * モデル履歴などの整合性を保つため設定値を正規化する。
   * @param {Record<string, any>} settings 保存対象の設定。
   * @returns {Record<string, any>} 正規化済み設定。
   */
  function normalizeSettings(settings) {
    if (!settings.llm) settings.llm = {};
    const llm = settings.llm;

    if (!Array.isArray(llm.modelHistory)) {
      llm.modelHistory = [];
    }

    if (llm.model && typeof llm.model === 'string') {
      if (!llm.modelHistory.includes(llm.model)) {
        llm.modelHistory.unshift(llm.model);
      }
    } else if (llm.modelHistory.length > 0) {
      llm.model = llm.modelHistory[0];
    } else {
      llm.model = defaultSettings.llm.model;
      llm.modelHistory.push(defaultSettings.llm.model);
    }

    return settings;
  }

  /**
   * localStorage から設定を読み込む（存在しない場合はデフォルトを返す）。
   * @returns {Record<string, any>} 読み込んだ設定。
   */
  function loadSettings() {
    try {
      let raw = window.localStorage.getItem(SETTINGS_KEY);

      // 互換用：デフォルトプロファイルのみ旧キーを参照する
      if (!raw && profileId === DEFAULT_PROFILE_ID) {
        raw = window.localStorage.getItem(LEGACY_SETTINGS_KEY);
      }

      if (!raw) {
        return normalizeSettings(structuredClone(defaultSettings));
      }
      const parsed = JSON.parse(raw);
      const merged = deepMerge(parsed, defaultSettings);
      return normalizeSettings(merged);
    } catch (e) {
      console.error('[SettingsStore] Failed to load settings', e);
      return normalizeSettings(structuredClone(defaultSettings));
    }
  }

  /**
   * 設定を正規化して localStorage に保存する。
   * @param {Record<string, any>} settings 保存する設定。
   */
  function saveSettings(settings) {
    try {
      const normalized = normalizeSettings(structuredClone(settings));
      const json = JSON.stringify(normalized);
      window.localStorage.setItem(SETTINGS_KEY, json);

      // デフォルトプロファイルでは旧キーもクリアしておく
      if (profileId === DEFAULT_PROFILE_ID) {
        window.localStorage.removeItem(LEGACY_SETTINGS_KEY);
      }
    } catch (e) {
      console.error('[SettingsStore] Failed to save settings', e);
    }
  }

  /**
   * 保存済み設定をリセットする。
   */
  function resetSettings() {
    try {
      window.localStorage.removeItem(SETTINGS_KEY);

      // 旧キーも念のため削除（デフォルトプロファイルのみ）
      if (profileId === DEFAULT_PROFILE_ID) {
        window.localStorage.removeItem(LEGACY_SETTINGS_KEY);
      }
    } catch (e) {
      console.error('[SettingsStore] Failed to reset settings', e);
    }
  }

  window.MindraSettingsStore = {
    loadSettings,
    saveSettings,
    resetSettings,
    defaultSettings: () => structuredClone(defaultSettings),
  };
})();
