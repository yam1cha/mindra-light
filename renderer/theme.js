// Mindra Light テーマ管理（色切り替え用）

(function () {
  // ★ デフォルトテーマ（起動時に saved がなければこれになる）
  const DEFAULT_THEME_ID = "cute";

  // ★ 利用可能なテーマ一覧
  const THEMES = {
    simple: {
      id: "simple",
      label: "simple",
    },
    cool: {
      id: "cool",
      label: "cool",
    },
    cute: {
      id: "cute",
      label: "cute",
    },
    mint: {
      id: "mint",
      label: "mint",
    },
    emerald: {
      id: "emerald",
      label: "emerald",
    },
    zenith: {
      id: "zenith",
      label: "zenith",
    },
    aurora: {
      id: "aurora",
      label: "aurora",
    },
  };

  // 実際に <html data-theme="..."> を書き換える
  function applyTheme(themeId) {
    const docEl = document.documentElement;
    if (!docEl) return;
    docEl.setAttribute("data-theme", themeId);
  }

  // 起動時に一度だけ呼ばれる
  function initTheme() {
    let id = DEFAULT_THEME_ID;
    try {
      const saved = window.localStorage.getItem("mindra.theme");
      if (saved && THEMES[saved]) {
        id = saved;
      }
    } catch {
      // localStorage 使えなくても落とさない
    }
    applyTheme(id);
  }

  // テーマ変更（＋保存）
  function setTheme(themeId) {
    if (!THEMES[themeId]) return;
    applyTheme(themeId);
    try {
      window.localStorage.setItem("mindra.theme", themeId);
    } catch {
      // 無視
    }
  }

  // 現在のテーマ情報を返す
  function getTheme() {
    const id =
      document.documentElement.getAttribute("data-theme") ||
      DEFAULT_THEME_ID;
    // { id: "cool", label: "クール" } みたいなオブジェクトを返す
    return THEMES[id] || THEMES[DEFAULT_THEME_ID];
  }

  // テーマの一覧（設定 UI 作るとき用）
  function listThemes() {
    return Object.values(THEMES);
  }

  // DOM 準備できたら自動で初期テーマ適用
  window.addEventListener("DOMContentLoaded", initTheme);

  // グローバルに出しておく
  window.mindraTheme = {
    THEMES,
    initTheme,
    setTheme,
    getTheme,
    listThemes,
  };

  // デバッグしやすいようにショートカットも
  window.setTheme = setTheme;
})();
