// settings-store.js
// MindraLight 設定の読み書き専用モジュール（Ollama専用版 + モデル履歴）

(function () {
  const SETTINGS_KEY = 'mindra_settings_v1';

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

  function structuredClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

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

  function loadSettings() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
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

  function saveSettings(settings) {
    try {
      const normalized = normalizeSettings(structuredClone(settings));
      const json = JSON.stringify(normalized);
      window.localStorage.setItem(SETTINGS_KEY, json);
    } catch (e) {
      console.error('[SettingsStore] Failed to save settings', e);
    }
  }

  function resetSettings() {
    try {
      window.localStorage.removeItem(SETTINGS_KEY);
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
