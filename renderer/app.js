const CONFIG = window.config || {};
const rootEl = document.getElementById("root");
const splitOverlayEl = document.getElementById("split-overlay");
const splitOverlayIndicator = document.getElementById("split-overlay-indicator");
const sidebar = document.getElementById("sidebar");
const sidebarHoverZone = document.getElementById("sidebar-hover-zone");
const tabListEl = document.getElementById("tab-list");
const btnToggleSidebarMode = document.getElementById("btn-toggle-sidebar-mode");
const btnToggleAI = document.getElementById("btn-toggle-ai");
const btnToggleTitlebarMode = document.getElementById("btn-toggle-titlebar-mode");
const rightSidebar = document.getElementById("right-sidebar");
const profileOverlay = document.getElementById("profile-overlay");
const profileMenuEl = document.getElementById("profile-menu");
const findBar = document.getElementById("find-bar");
const findInput = document.getElementById("find-input");
const findCountEl = document.getElementById("find-count");
const findCloseBtn = document.getElementById("find-close");
const newTabBtn = document.getElementById("btn-new-tab");
const splitViewBtn = document.getElementById("btn-split-view");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsPanel = document.getElementById("settings-panel");
const settingsCloseBtn = document.getElementById("settings-panel-close");
const btnOpenSettings = document.getElementById("btn-open-settings");
const LEFT_SIDEBAR_WIDTH = 240;
const RIGHT_SIDEBAR_WIDTH = 320;

// ★ SplitView 用のオーバーレイ要素を window にも公開しておく
window.splitOverlayEl = splitOverlayEl;
window.splitOverlayIndicator = splitOverlayIndicator;

function setupSplitDivider() {
  if (splitDividerEl) return;
  splitDividerEl = document.createElement("div");
  splitDividerEl.id = "split-divider";
  rootEl.appendChild(splitDividerEl);
}

if (newTabBtn) {
  newTabBtn.onclick = () => {
    // ★ SplitView中なら、一旦抜ける（レイアウトは保持）
    exitSplitViewPreserveLayout();

    // 通常モードとして新しいタブを開く
    createTab("https://www.google.com", true);
  };
}

if (splitViewBtn) {
  splitViewBtn.onclick = () => {
    handleSplitViewClick();
  };
}

let tabs = [];
let closedTabs = [];
let currentTabId = null;
let nextTabId = 1;
let activeWebviewId = null;
let nextWebviewId = 1;

let sidebarOpen = true;
let sidebarShrinkMode = true; // デフォルトで押し出しモード
let profileMenuOpen = false;
let rightSidebarOpen = false;
let titlebarFixedMode = true; // ★ タイトルバー固定モード（デフォルト固定）

function openSidebar() {
  sidebarOpen = true;
  if (sidebar) {
    sidebar.classList.add("sidebar-open");
  }
  applyCurrentLayout();
  updateTitlebarWidth();  // ★追加
}

function closeSidebar() {
  // 押し出しモードのときは常に開いたままにする
  if (sidebarShrinkMode) return;
  sidebarOpen = false;
  if (sidebar) {
    sidebar.classList.remove("sidebar-open");
  }
  applyCurrentLayout();
  updateTitlebarWidth();  // ★追加
}

const profileColors = {
  1: "#e57373",
  2: "#64b5f6",
  3: "#81c784",
  4: "#ffb74d",
  5: "#ba68c8",
  6: "#4dd0e1",
  7: "#ffd54f",
  8: "#a1887f",
  9: "#90caf9",
  10: "#ffcc80",
};

const TABS_STATE_KEY = (CONFIG.SAVE_KEY_PREFIX || "") + "mindraLightTabsState";

function serializeTabsState() {
  const currentIndex = tabs.findIndex((t) => t.id === currentTabId);

  return {
    tabs: tabs.map((t) => ({
      url: t.url,
      profileId: t.profileId || 1,
    })),
    currentTabIndex: currentIndex < 0 ? 0 : currentIndex,
    // ★ SplitView 部分は splitview.js 側のヘルパーに委譲
    split: serializeSplitStateForTabs(tabs, currentTabId),
    sidebar: {
      open: sidebarOpen ? 1 : 0,
      shrink: sidebarShrinkMode ? 1 : 0,
      rightOpen: rightSidebarOpen ? 1 : 0,
      titleFixed: titlebarFixedMode ? 1 : 0,
    },
  };
}

function saveTabsState() {
  try {
    const state = serializeTabsState();
    localStorage.setItem(TABS_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("saveTabsState error", e);
  }
}

function loadTabsState() {
  try {
    const raw = localStorage.getItem(TABS_STATE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    const storedTabs = state && Array.isArray(state.tabs) ? state.tabs : [];
    if (storedTabs.length === 0) return false;

    tabs = [];
    closedTabs = [];
    currentTabId = null;
    nextTabId = 1;
    nextWebviewId = 1;
    activeWebviewId = null;

    // ★ SplitView 状態の初期化は splitview.js 側に委譲
    resetSplitStateBeforeLoad();

    // タブ復元
    storedTabs.forEach((t) => {
      const id = nextTabId++;
      const url = t.url || "https://www.google.com";
      tabs.push({
        id,
        url,
        title: deriveTitleFromUrl(url),
        profileId: t.profileId || 1,
        webviewId: null,
      });
    });

    const idx = Math.min(
      Math.max(0, state.currentTabIndex || 0),
      tabs.length - 1
    );
    const baseActiveId = tabs[idx].id;

    // --- サイドバー / タイトルバー状態の復元 ---
    if (state.sidebar) {
      const sb = state.sidebar;
      sidebarOpen = sb.open === 1;
      sidebarShrinkMode = sb.shrink === 1;
      rightSidebarOpen = sb.rightOpen === 1;
      // ★ 既存データにはない場合もあるので、未定義なら true（固定）にする
      if (sb.titleFixed === undefined) {
        titlebarFixedMode = true;
      } else {
        titlebarFixedMode = sb.titleFixed === 1;
      }
    } else {
      sidebarOpen = true;
      sidebarShrinkMode = true;
      rightSidebarOpen = false;
      titlebarFixedMode = true;
    }

    // サイドバー開閉状態を DOM に反映
    if (sidebar) {
      if (sidebarOpen) {
        sidebar.classList.add("sidebar-open");
      } else {
        sidebar.classList.remove("sidebar-open");
      }
    }
    // AI サイドバーも反映
    setRightSidebar(rightSidebarOpen);

    // ★ タイトルバーの幅と表示状態をモードに合わせて復元
    updateTitlebarWidth();
    if (titlebarFixedMode) {
      titlebar.classList.add("visible");
      titlebarVisible = true;
    } else {
      titlebar.classList.remove("visible");
      titlebarVisible = false;
    }

    // --- SplitView 状態の復元 ---
    let initialActiveId = baseActiveId;
    if (state.split) {
      // splitview.js 側で splitCanvasMode / splitEmpty / layoutRoot 等もまとめて復元
      initialActiveId = restoreSplitStateFromStored(
        state.split,
        tabs,
        baseActiveId
      );
    }

    // 起動時にアクティブにするタブ：
    setActiveTab(initialActiveId);

    // ★ サイドバーのモードボタンの色を復元状態に合わせてセット
    updateSidebarModeButtonStyle();
    updateTitlebarModeButtonStyle();
    updateSidebarUrlInputEnabled();

    return true;
  } catch (e) {
    console.error("loadTabsState error", e);
    return false;
  }
}

btnToggleSidebarMode.addEventListener("click", () => {
  sidebarShrinkMode = !sidebarShrinkMode;

  if (sidebarShrinkMode) {
    sidebarOpen = true;
    if (sidebar) sidebar.classList.add("sidebar-open");
  } else {
    sidebarOpen = false;
    if (sidebar) sidebar.classList.remove("sidebar-open");
  }

  updateSidebarModeButtonStyle();
  applyCurrentLayout();
  saveTabsState();

  updateTitlebarWidth();
});

// ★ タイトルバー固定モード切替
function updateTitlebarModeButtonStyle() {
  if (!btnToggleTitlebarMode) return;

  if (titlebarFixedMode) {
    // 固定モード → 色付き
    btnToggleTitlebarMode.style.background = "#6366f1";
    btnToggleTitlebarMode.style.color = "#fff";
  } else {
    // ホバーモード → グレー
    btnToggleTitlebarMode.style.background = "#e0e0e5";
    btnToggleTitlebarMode.style.color = "#333";
  }
}

// タイトルバー固定モード切り替えボタン
if (btnToggleTitlebarMode) {
  btnToggleTitlebarMode.addEventListener("click", () => {
    // モードをトグル
    titlebarFixedMode = !titlebarFixedMode;

    // 表示/非表示の制御
    if (titlebarFixedMode) {
      // 固定モード：常に表示
      titlebar.classList.add("visible");
      titlebarVisible = true;
    } else {
      // ホバーモード：一旦隠して、上端ホバーで表示
      titlebar.classList.remove("visible");
      titlebarVisible = false;
    }

    // ボタンの色を更新
    updateTitlebarModeButtonStyle();

    // ★ タイトルバーの左右幅を更新（サイドバー/AIバーとの間に合わせる）
    updateTitlebarWidth();

    // ★ 一番大事：レイアウトを再計算して view を押し出しし直す
    applyCurrentLayout();

    // 状態を保存
    saveTabsState();
  });
}

function updateSidebarModeButtonStyle() {
  if (!btnToggleSidebarMode) return;

  if (sidebarShrinkMode) {
    // 固定（押し出し）モード → 色付き状態
    btnToggleSidebarMode.style.background = "#6366f1";
    btnToggleSidebarMode.style.color = "#fff";
  } else {
    // オーバーレイモード → 普通のグレー
    btnToggleSidebarMode.style.background = "#e0e0e5";
    btnToggleSidebarMode.style.color = "#333";
  }
}

function setRightSidebar(open) {
  rightSidebarOpen = open;
  if (open) {
    rightSidebar.classList.add("open");
    btnToggleAI.style.background = "#6366f1";
    btnToggleAI.style.color = "#fff";
  } else {
    rightSidebar.classList.remove("open");
    btnToggleAI.style.background = "#e0e0e5";
    btnToggleAI.style.color = "#333";
  }
  // AIパネルの開閉に合わせてレイアウトを更新
  applyCurrentLayout();

  // タイトルバー幅を更新
  updateTitlebarWidth();

  // 状態を保存
  saveTabsState();
}

// 設定パネル制御
function openSettingsPanel() {
  if (!settingsOverlay) return;
  settingsOverlay.style.display = "flex";
}

function closeSettingsPanel() {
  if (!settingsOverlay) return;
  settingsOverlay.style.display = "none";
}

// ボタンで開く
if (btnOpenSettings) {
  btnOpenSettings.addEventListener("click", (e) => {
    e.stopPropagation();
    openSettingsPanel();
  });
}

// ×ボタンで閉じる
if (settingsCloseBtn) {
  settingsCloseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeSettingsPanel();
  });
}

// グレーな背景部分クリックで閉じる
if (settingsOverlay) {
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) {
      closeSettingsPanel();
    }
  });
}

function updateTitlebarWidth() {
  const titlebar = document.getElementById("window-titlebar");
  const hoverZone = document.getElementById("top-hover-zone");
  if (!titlebar || !hoverZone) return;

  // 左側：タイトルバー固定モード中に「サイドバーが開いているとき」は、その分ずらす
  let leftOffset = 0;
  if (titlebarFixedMode && sidebarOpen && sidebar) {
    const sbRect = sidebar.getBoundingClientRect();
    const leftWidth = sbRect.width || sidebar.offsetWidth || LEFT_SIDEBAR_WIDTH;
    leftOffset = leftWidth;
  }

  // 右側：AIサイドバーが開いているときだけ、その分を引く
  let rightOffset = 0;
  if (rightSidebarOpen) {
    rightOffset = RIGHT_SIDEBAR_WIDTH;
  }

  // タイトルバーの表示範囲を「サイドバーの間」だけにする
  titlebar.style.left = leftOffset + "px";
  titlebar.style.right = rightOffset + "px";

  // ホバーゾーンも同じ幅にしておく
  hoverZone.style.left = leftOffset + "px";
  hoverZone.style.right = rightOffset + "px";
}

if (sidebarHoverZone) {
  sidebarHoverZone.addEventListener("mouseenter", () => {
    // 押し出しモードのときは常時表示なので、ホバーでは何もしない
    if (!sidebarShrinkMode) {
      openSidebar();
    }
  });
}

if (sidebar) {
  sidebar.addEventListener("mouseleave", (e) => {
    const to = e.relatedTarget;
    if (!to || !sidebar.contains(to)) {
      closeSidebar();
    }
  });
}

btnToggleAI.addEventListener("click", () => {
  setRightSidebar(!rightSidebarOpen);
});

function deriveTitleFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "(New Tab)";
  }
}

function shouldIgnoreNavigationUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (host === "ads.nicovideo.jp" || host === "ad.nicovideo.jp") {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function resolveUrlOrSearch(raw) {
  const text = (raw || "").trim();
  if (!text) return null;

  if (/^https?:\/\//i.test(text)) return text;
  if (text.includes(" ") || !text.includes(".")) {
    const q = encodeURIComponent(text);
    return "https://www.google.com/search?q=" + q;
  }
  return "https://" + text;
}

function getActiveTab() {
  return tabs.find((t) => t.id === currentTabId) || null;
}

function getActiveWebview() {
  const tab = getActiveTab();
  if (!tab || !tab.webviewId) return null;
  return document.getElementById(tab.webviewId) || null;
}

function getWebviewByTabId(tabId) {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return null;
  return getWebviewForTab(tab);
}

function syncSidebarUrlInput() {
  const input = document.getElementById("sidebar-url-input");
  if (!input) return;

  // ★ SplitView 中は常に空欄にする（有効/無効は別関数で制御）
  if (splitCanvasMode) {
    input.value = "";
    return;
  }

  const tab = getActiveTab();
  input.value = tab && tab.url ? tab.url : "";
}

function renderTabs() {
  tabListEl.innerHTML = "";

  tabs.forEach((tab) => {
    const item = document.createElement("div");

    const isActive = tab.id === currentTabId;
    const inSplit = splitCanvasMode;

    item.className = "tab-item";
    if (isActive && !inSplit) item.classList.add("active");

    item.dataset.tabId = String(tab.id);

    const left = document.createElement("div");
    left.className = "tab-item-left";

    const dot = document.createElement("span");
    dot.className = "tab-profile-dot";
    const pid = tab.profileId && profileColors[tab.profileId] ? tab.profileId : 1;
    dot.style.backgroundColor = profileColors[pid];

    const titleSpan = document.createElement("span");
    titleSpan.className = "tab-item-title";
    titleSpan.textContent = tab.title;

    left.appendChild(dot);
    left.appendChild(titleSpan);

    const rightBox = document.createElement("div");
    rightBox.style.display = "flex";
    rightBox.style.alignItems = "center";
    rightBox.style.gap = "4px";

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close-btn";
    closeBtn.textContent = "×";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    };

    rightBox.appendChild(closeBtn);

    item.appendChild(left);
    item.appendChild(rightBox);

    item.addEventListener("mousedown", handleTabMouseDown);

    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSidebar();
      openProfileMenu(tab.id, e.clientX, e.clientY);
    });

    item.onclick = () => {
      if (tabDragState.blockClickOnce) return;

      setSplitOverlayActive(false);

      // ★ SplitView から通常表示に戻る処理はヘルパーにまとめる
      exitSplitViewPreserveLayout();

      // 通常タブとして表示
      setActiveTab(tab.id);
    };

    tabListEl.appendChild(item);
  });
}

function attachWebviewEvents(wv, tabId) {
  if (!wv) return;

  wv.addEventListener("did-finish-load", () => {
    const css = `
        *::-webkit-scrollbar {
          width: 8px !important;
          height: 8px !important;
        }
        *::-webkit-scrollbar-track {
          background: transparent !important;
        }
        *::-webkit-scrollbar-thumb {
          background: rgba(120,120,120,0.45) !important;
          border-radius: 999px !important;
        }
        *::-webkit-scrollbar-thumb:hover {
          background: rgba(120,120,120,0.8) !important;
        }
      `;
    try {
      wv.insertCSS(css);
    } catch (e) {
      console.error("insertCSS failed (did-finish-load)", e);
    }
  });

  wv.addEventListener("did-navigate", (e) => {
    if (shouldIgnoreNavigationUrl(e.url)) return;

    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.url = e.url;
    tab.title = deriveTitleFromUrl(e.url);
    if (tab.id === currentTabId) syncSidebarUrlInput();
    renderTabs();
    saveTabsState();
  });

  wv.addEventListener("did-navigate-in-page", (e) => {
    if (shouldIgnoreNavigationUrl(e.url)) return;

    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.url = e.url;
    tab.title = deriveTitleFromUrl(e.url);
    if (tab.id === currentTabId) syncSidebarUrlInput();
    renderTabs();
    saveTabsState();
  });

  wv.addEventListener("found-in-page", (e) => {
    updateFindCount(e.result);
  });

  // webview 内で右クリックされたとき
  wv.addEventListener("context-menu", (e) => {
    try {
      // ★ プロファイルメニュー表示中は閉じるだけ
      if (profileMenuOpen) {
        e.preventDefault();
        hideProfileMenu();
        return;
      }

      const params = e.params || {};
      const x = typeof params.x === "number" ? params.x : 0;
      const y = typeof params.y === "number" ? params.y : 0;
      hideContentMenu();
      showContentMenu(x, y, tabId);
    } catch (err) {
      console.error("webview context-menu error", err);
    }
  });
}

function createWebviewForTab(tab) {
  const wv = document.createElement("webview");
  const wid = "wv-" + nextWebviewId++;
  wv.id = wid;

  const profileId = tab.profileId || 1;
  wv.setAttribute("partition", "persist:profile-" + profileId);
  wv.setAttribute("allowpopups", "");
  wv.src = tab.url || "https://www.google.com";

  wv.style.visibility = "hidden";
  wv.style.opacity = "0";
  wv.style.pointerEvents = "none";

  attachWebviewEvents(wv, tab.id);
  rootEl.appendChild(wv);

  tab.webviewId = wid;
  return wv;
}

function getWebviewForTab(tab) {
  if (!tab) return null;
  if (tab.webviewId) {
    const existed = document.getElementById(tab.webviewId);
    if (existed) return existed;
  }
  return createWebviewForTab(tab);
}

document.getElementById("win-min").onclick = () => window.mindraWindow.control("minimize");
document.getElementById("win-max").onclick = () => window.mindraWindow.control("maximize");
document.getElementById("win-close").onclick = () => window.mindraWindow.control("close");

const topHoverZone = document.getElementById("top-hover-zone");
const titlebar = document.getElementById("window-titlebar");

let titlebarVisible = false;
let mouseDownInTitlebar = false;

function showTitlebar() {
  if (titlebarVisible) return;
  titlebar.classList.add("visible");
  titlebarVisible = true;
}

function hideTitlebar() {
  if (!titlebarVisible) return;
  if (mouseDownInTitlebar) return;
  titlebar.classList.remove("visible");
  titlebarVisible = false;
}

// ★ ホバーモードのときだけ発動
topHoverZone.addEventListener("mouseenter", () => {
  if (!titlebarFixedMode) {
    showTitlebar();
  }
});

titlebar.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  mouseDownInTitlebar = true;
});

window.addEventListener("mouseup", () => {
  mouseDownInTitlebar = false;
});

titlebar.addEventListener("mouseleave", () => {
  if (titlebarFixedMode) return;
  setTimeout(() => {
    hideTitlebar();
  }, 30);
});

window.addEventListener("mousemove", (e) => {
  if (titlebarFixedMode) return; // ★ 固定モードなら自動非表示しない
  if (!titlebarVisible) return;
  if (mouseDownInTitlebar) return;
  if (e.clientY > 24) {
    hideTitlebar();
  }
});

window.addEventListener("blur", () => {
  if (titlebarFixedMode) return; // ★ 固定モードなら隠さない
  hideTitlebar();
});


function setActiveTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;

  currentTabId = id;

  // ★ SplitView に「すでに入っているタブ」のときだけ activeTabId を更新する
  if (splitCanvasMode && layoutRoot) {
    setActiveGroupForTab(id);
  }

  applyCurrentLayout();
  syncSidebarUrlInput();
  saveTabsState();
}

function switchTab(id) {
  setActiveTab(id);
}

function createTab(url = "https://www.google.com", activate = true) {
  const id = nextTabId++;
  const tab = {
    id,
    url,
    title: deriveTitleFromUrl(url),
    profileId: 1,
    webviewId: null,
  };
  tabs.push(tab);

  if (activate) {
    setActiveTab(id);
  } else {
    renderTabs();
    saveTabsState();
  }
}

function closeTab(id) {
  const index = tabs.findIndex((t) => t.id === id);
  if (index === -1) return;
  const tab = tabs[index];
  const wasActive = tab.id === currentTabId;

  // SplitView の中身を閉じたときの状態更新
  handleTabClosedForSplitView(id);

  if (tab.webviewId) {
    const wv = document.getElementById(tab.webviewId);
    if (wv) wv.remove();
    if (activeWebviewId === tab.webviewId) activeWebviewId = null;
  }

  closedTabs.push({ url: tab.url, title: tab.title, profileId: tab.profileId });
  tabs.splice(index, 1);

  removeTabFromLayout(id);

  if (tabs.length === 0) {
    layoutRoot = null;
    createTab("https://www.google.com", true);
    return;
  }

  if (wasActive) {
    const newIndex = Math.max(0, index - 1);
    setActiveTab(tabs[newIndex].id);
  } else {
    applyCurrentLayout();
    saveTabsState();
  }
}

function restoreClosedTab() {
  const last = closedTabs.pop();
  if (!last) return;
  const id = nextTabId++;
  const tab = {
    id,
    url: last.url,
    title: last.title,
    profileId: last.profileId || 1,
    webviewId: null,
  };
  tabs.push(tab);
  setActiveTab(id);
  saveTabsState();
}

const sidebarUrlInput = document.getElementById("sidebar-url-input");
sidebarUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const resolved = resolveUrlOrSearch(sidebarUrlInput.value);
    if (!resolved) return;
    const tab = getActiveTab();
    if (tab) {
      tab.url = resolved;
      tab.title = deriveTitleFromUrl(resolved);
      const wv = getWebviewForTab(tab);
      if (wv) wv.src = resolved;
      renderTabs();
      syncSidebarUrlInput();
      saveTabsState();
    } else {
      createTab(resolved, true);
    }
  }
});

function updateSidebarUrlInputEnabled() {
  if (!sidebarUrlInput) return;

  if (splitCanvasMode) {
    // SplitView中 → URLを空にして入力不可
    sidebarUrlInput.value = "";
    sidebarUrlInput.disabled = true;
    sidebarUrlInput.placeholder = "";
    sidebarUrlInput.style.background = "#f0f0f0";
  } else {
    // 通常モード → 入力可能
    sidebarUrlInput.disabled = false;
    sidebarUrlInput.placeholder = "URL を入力 / 検索";
    sidebarUrlInput.style.background = "#ffffff";

    // ★ここ大事：現在のタブのURLを復元
    const activeTab = tabs.find(t => t.id === currentTabId);
    if (activeTab && activeTab.lastUrl) {
      sidebarUrlInput.value = activeTab.lastUrl;
    } else {
      sidebarUrlInput.value = "";
    }
  }
}
let findQuery = "";
let findActive = false;

function openFindBar(initialText) {
  findBar.style.display = "flex";
  findActive = true;
  if (typeof initialText === "string") {
    findInput.value = initialText;
  }
  findInput.focus();
  findInput.select();
  findCountEl.textContent = "";
}

function closeFindBar() {
  findActive = false;
  findBar.style.display = "none";
  findInput.value = "";
  findCountEl.textContent = "";
  const wv = getActiveWebview();
  if (wv && wv.stopFindInPage) {
    try {
      wv.stopFindInPage("clearSelection");
    } catch {}
  }
}

function updateFindCount(result) {
  if (!result || !findActive) return;
  if (!result.finalUpdate) return;

  if (typeof result.matches === "number" && result.matches > 0) {
    const current = result.activeMatchOrdinal || 1;
    findCountEl.textContent = current + " / " + result.matches;
  } else {
    findCountEl.textContent = "0 / 0";
  }
}

function startFind() {
  const wv = getActiveWebview();
  if (!wv || !wv.findInPage) return;

  if (!findActive) {
    openFindBar(findQuery);
  }

  const text = findInput.value.trim();
  if (!text) return;

  findQuery = text;
  try {
    wv.findInPage(findQuery);
  } catch (e) {
    console.error("findInPage error", e);
  }
}

function findNext(forward = true) {
  const wv = getActiveWebview();
  if (!wv || !wv.findInPage) return;

  if (!findActive) {
    openFindBar(findQuery);
  }
  const text = findInput.value.trim();
  if (!text) return;

  findQuery = text;
  try {
    wv.findInPage(findQuery, { forward, findNext: true });
  } catch (e) {
    console.error("findInPage error", e);
  }
}

findInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey) {
      findNext(false);
    } else {
      findNext(true);
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeFindBar();
  }
});

findCloseBtn.addEventListener("click", () => {
  closeFindBar();
});

let zoomFactor = 1.0;

function setZoom(factor) {
  zoomFactor = Math.max(0.25, Math.min(3.0, factor));
  const wv = getActiveWebview();
  if (wv && wv.setZoomFactor) {
    wv.setZoomFactor(zoomFactor);
  }
}

function goBack(targetTabId = null) {
  const wv = targetTabId != null ? getWebviewByTabId(targetTabId) : getActiveWebview();
  try {
    if (wv && wv.canGoBack && wv.canGoBack()) {
      wv.goBack();
    }
  } catch {}
}

function goForward(targetTabId = null) {
  const wv = targetTabId != null ? getWebviewByTabId(targetTabId) : getActiveWebview();
  try {
    if (wv && wv.canGoForward && wv.canGoForward()) {
      wv.goForward();
    }
  } catch {}
}

function reload(normal = true) {
  const wv = getActiveWebview();
  if (!wv) return;
  if (!normal && wv.reloadIgnoringCache) {
    wv.reloadIgnoringCache();
  } else {
    wv.reload();
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen && document.exitFullscreen();
  }
}

function openDevTools() {
  const wv = getActiveWebview();
  if (wv && wv.openDevTools) {
    wv.openDevTools();
  }
}

let profileMenuTargetTabId = null;

function buildProfileMenu() {
  profileMenuEl.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const item = document.createElement("div");
    item.className = "profile-menu-item";

    const dot = document.createElement("span");
    dot.className = "profile-menu-dot";
    if (profileColors[i]) {
      dot.style.backgroundColor = profileColors[i];
    }

    const label = document.createElement("span");
    label.className = "profile-menu-label";
    label.textContent = `プロファイル${i}`;

    item.appendChild(dot);
    item.appendChild(label);

    // クリックでプロファイル変更
    item.addEventListener("click", () => {
      if (profileMenuTargetTabId != null) {
        applyProfileToTab(profileMenuTargetTabId, i);
      }
      hideProfileMenu();
      closeSidebar();
    });

    profileMenuEl.appendChild(item);
  }
}

function openProfileMenu(tabId, x, y) {
  // まずコンテンツメニューが出てたら消す
  if (typeof hideContentMenu === "function") {
    hideContentMenu();
  }

  profileMenuTargetTabId = tabId;
  profileMenuOpen = true;
  buildProfileMenu();

  profileOverlay.style.display = "block";

  // 一度表示してサイズを取る
  profileMenuEl.style.display = "block";

  const sidebarRect = sidebar.getBoundingClientRect();

  // 基本位置：サイドバーの右横
  let left = Math.max(sidebarRect.right + 4, x);
  let top = y;

  // メニューの実際の幅・高さ
  const menuRect = profileMenuEl.getBoundingClientRect();
  const menuWidth = menuRect.width;
  const menuHeight = menuRect.height;

  // 右端にはみ出さないように補正
  const margin = 4;
  if (left + menuWidth > window.innerWidth - margin) {
    left = window.innerWidth - menuWidth - margin;
  }
  if (left < margin) {
    left = margin;
  }

  // 下端にはみ出さないように補正
  if (top + menuHeight > window.innerHeight - margin) {
    top = window.innerHeight - menuHeight - margin;
  }
  if (top < margin) {
    top = margin;
  }

  profileMenuEl.style.left = left + "px";
  profileMenuEl.style.top = top + "px";
}

function hideProfileMenu() {
  profileMenuEl.style.display = "none";
  profileOverlay.style.display = "none";
  profileMenuOpen = false;
}

function applyProfileToTab(tabId, profileId) {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (tab.profileId === profileId) return;

  tab.profileId = profileId;

  if (tab.webviewId) {
    const old = document.getElementById(tab.webviewId);
    if (old) old.remove();
    if (activeWebviewId === tab.webviewId) activeWebviewId = null;
    tab.webviewId = null;
  }

  if (tab.id === currentTabId) {
    setActiveTab(tab.id);
  } else {
    renderTabs();
    saveTabsState();
  }
}

profileOverlay.addEventListener("click", () => {
  hideProfileMenu();
  closeSidebar();
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && profileMenuOpen) {
    hideProfileMenu();
  }
});

function disableWebviewPointerEventsForMenu() {
  document.querySelectorAll("webview").forEach((wv) => {
    if (!wv) return;
    if (wv.dataset._prevPointerEventsForMenu === undefined) {
      wv.dataset._prevPointerEventsForMenu = wv.style.pointerEvents || "";
    }
    wv.style.pointerEvents = "none";
  });
}

function restoreWebviewPointerEventsForMenu() {
  document.querySelectorAll("webview").forEach((wv) => {
    if (!wv) return;
    if (wv.dataset._prevPointerEventsForMenu !== undefined) {
      wv.style.pointerEvents = wv.dataset._prevPointerEventsForMenu;
      delete wv.dataset._prevPointerEventsForMenu;
    } else {
      if (!wv.style.pointerEvents) {
        wv.style.pointerEvents = "auto";
      }
    }
  });
}

/* === コンテンツ右クリックメニュー === */

// 右クリックされたタブID（なければ null）
let contentMenu = null;
let contentMenuTargetTabId = null;

function ensureContentMenu() {
  if (contentMenu) return;

  contentMenu = document.createElement("div");
  contentMenu.style.position = "fixed";
  contentMenu.style.minWidth = "160px";

  /* --- ★ 明るいグレーの普通のメニュー風に変更 ★ --- */
  contentMenu.style.background = "#f2f2f2";
  contentMenu.style.color = "#222";
  contentMenu.style.border = "1px solid #cccccc";
  contentMenu.style.borderRadius = "4px";
  contentMenu.style.boxShadow = "0 4px 8px rgba(0,0,0,0.15)";
  contentMenu.style.padding = "4px 0";
  contentMenu.style.fontSize = "13px";
  contentMenu.style.userSelect = "none";
  contentMenu.style.zIndex = "1950";
  contentMenu.style.display = "none";

  document.body.appendChild(contentMenu);

  // メニュー以外をクリックしたら閉じる
  document.addEventListener("mousedown", (e) => {
    if (!contentMenu || contentMenu.style.display !== "block") return;
    if (!contentMenu.contains(e.target)) {
      hideContentMenu();
    }
  });
}

function hideContentMenu() {
  if (!contentMenu) return;
  contentMenu.style.display = "none";
  contentMenu.innerHTML = "";
  contentMenuTargetTabId = null;
  // メニューを閉じたので webview クリックを元に戻す
  restoreWebviewPointerEventsForMenu();
}

function addContentMenuItem(label, handler) {
  const item = document.createElement("div");
  item.textContent = label;
  item.style.padding = "6px 12px";
  item.style.cursor = "pointer";
  item.style.whiteSpace = "nowrap";

  item.addEventListener("mouseenter", () => {
    item.style.background = "#e5e5e5";
  });
  item.addEventListener("mouseleave", () => {
    item.style.background = "transparent";
  });
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    hideContentMenu();
    if (handler) handler();
  });

  contentMenu.appendChild(item);
}

// tabId を対象に戻る/進むを行う（webview を直接触る）
function performTabHistory(tabId, direction) {
  if (tabId == null) return;
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const wv = getWebviewForTab(tab);
  if (!wv) return;

  try {
    if (direction === "back") {
      if (wv.canGoBack && wv.canGoBack()) wv.goBack();
    } else {
      if (wv.canGoForward && wv.canGoForward()) wv.goForward();
    }
  } catch (e) {
    console.error("history navigation error", e);
  }
}

function showContentMenu(x, y, tabId = null) {
  ensureContentMenu();
  contentMenu.innerHTML = "";

  // このメニューで操作する対象タブ
  contentMenuTargetTabId =
    tabId != null ? tabId : currentTabId != null ? currentTabId : null;

  const targetId = contentMenuTargetTabId;

  if (splitCanvasMode) {
    // SplitView 中: 右クリックした側のタブに対して動く
    addContentMenuItem("戻る", () => {
      performTabHistory(targetId, "back");
    });
    addContentMenuItem("進む", () => {
      performTabHistory(targetId, "forward");
    });
    addContentMenuItem("分割解除", () => {
      splitCancelForTab(targetId);
    });
  } else {
    // 通常表示: 右クリック（＝ほぼアクティブタブ）に対して
    addContentMenuItem("戻る", () => {
      performTabHistory(targetId, "back");
    });
    addContentMenuItem("進む", () => {
      performTabHistory(targetId, "forward");
    });
    addContentMenuItem("タブを閉じる", () => {
      if (targetId != null) {
        closeTab(targetId);
      }
    });
  }

  const menuWidth = 180;
  const menuHeight = contentMenu.childElementCount * 26 + 8;

  let posX = x;
  let posY = y;

  if (posX + menuWidth > window.innerWidth) {
    posX = window.innerWidth - menuWidth - 4;
  }
  if (posY + menuHeight > window.innerHeight) {
    posY = window.innerHeight - menuHeight - 4;
  }

  contentMenu.style.left = posX + "px";
  contentMenu.style.top = posY + "px";
  contentMenu.style.display = "block";

  // メニューが出ている間は webview 側のクリックを止める
  disableWebviewPointerEventsForMenu();
}

// 背景（document）で右クリックされたとき
document.addEventListener("contextmenu", (e) => {
  // ★ プロファイルメニューが開いているときは、
  //    どこを右クリックしても「閉じるだけ」にする
  if (profileMenuOpen) {
    e.preventDefault();
    hideProfileMenu();
    return;
  }

  // サイドバーやプロフィールメニュー、検索バー、AIサイドバー上は
  // 右クリックしてもなにも出さない
  if (
    (sidebar && sidebar.contains(e.target)) ||
    (profileMenuEl && profileMenuEl.contains(e.target)) ||
    (findBar && findBar.contains(e.target)) ||
    (rightSidebar && rightSidebar.contains(e.target))
  ) {
    e.preventDefault(); // ブラウザの標準メニューも出さない
    return;
  }

  // 通常のカスタムコンテキストメニュー
  e.preventDefault();
  hideContentMenu();
  showContentMenu(e.clientX, e.clientY, currentTabId);
});

// Esc でメニューを閉じる
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideContentMenu();
    closeSettingsPanel();
  }
});

/* === ショートカット === */

if (window.mindraShortcuts && window.mindraShortcuts.onShortcut) {
  window.mindraShortcuts.onShortcut((payload) => {
    const { type, index, url } = payload || {};
    switch (type) {
      case "new-tab":
        // ★ SplitView中なら抜けてレイアウト保持
        exitSplitViewPreserveLayout();
        createTab("https://www.google.com", true);
        break;
      case "new-tab-with-url":
        if (url) createTab(url, true);
        break;
      case "close-tab":
        if (currentTabId != null) closeTab(currentTabId);
        break;
      case "restore-tab":
        restoreClosedTab();
        break;
      case "close-window":
        window.mindraWindow.control("close");
        break;
      case "next-tab":
        if (tabs.length > 0) {
          const idx = tabs.findIndex((t) => t.id === currentTabId);
          const nextIdx = (idx + 1) % tabs.length;
          switchTab(tabs[nextIdx].id);
        }
        break;
      case "prev-tab":
        if (tabs.length > 0) {
          const idx = tabs.findIndex((t) => t.id === currentTabId);
          const prevIdx = (idx - 1 + tabs.length) % tabs.length;
          switchTab(tabs[prevIdx].id);
        }
        break;
      case "tab-index": {
        const i = (index || 1) - 1;
        if (tabs[i]) switchTab(tabs[i].id);
        break;
      }
      case "tab-last":
        if (tabs.length > 0) switchTab(tabs[tabs.length - 1].id);
        break;
      case "nav-back":
        goBack();
        break;
      case "nav-forward":
        goForward();
        break;
      case "reload":
        reload(true);
        break;
      case "reload-hard":
        reload(false);
        break;
      case "find":
        openFindBar(findQuery);
        startFind();
        break;
      case "find-next":
        findNext(true);
        break;
      case "find-prev":
        findNext(false);
        break;
      case "zoom-in":
        setZoom(zoomFactor + 0.1);
        break;
      case "zoom-out":
        setZoom(zoomFactor - 0.1);
        break;
      case "zoom-reset":
        setZoom(1.0);
        break;
      case "fullscreen":
        toggleFullscreen();
        break;
      case "devtools":
        openDevTools();
        break;
    }
  });
}

setupSplitDivider();

const loaded = loadTabsState();
if (!loaded) {
  // デフォルト状態（初回起動など）
  sidebarOpen = true;
  sidebarShrinkMode = true;
  rightSidebarOpen = false;
  createTab("https://www.google.com", true);
}
updateSidebarUrlInputEnabled();

// 左サイドバーの状態を反映
if (sidebarShrinkMode) {
  openSidebar();
} else if (sidebarOpen) {
  openSidebar();
} else {
  closeSidebar();
}

// AIサイドバーの状態を反映
if (rightSidebar) {
  setRightSidebar(rightSidebarOpen);
}
