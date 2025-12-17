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
const settingsRoot = document.getElementById("settings-root");
const sidebarUrlInput = document.getElementById("sidebar-url-input");
const sidebarBookmarkBtn = document.getElementById("btn-sidebar-bookmark");
const btnToggleBookmarkMode = document.getElementById("btn-toggle-bookmark-mode");
const bookmarkModePane = document.getElementById("bookmark-mode-pane");
const LEFT_SIDEBAR_WIDTH = 240;
const RIGHT_SIDEBAR_WIDTH = 240;

// ===== MindraLight renderer 障害ログ（global handlers） =====
window.addEventListener("error", (event) => {
  try {
    const info = {
      message: event && event.message,
      source: event && event.filename,
      lineno: event && event.lineno,
      colno: event && event.colno,
    };
    if (event && event.error && event.error.stack) {
      info.stack = event.error.stack;
    }
    console.error("[renderer-error]", info);
  } catch (e) {
    console.error("[renderer-error-handler-failed]", e);
  }
});

// ===== MindraLight renderer 障害ログ（global handlers） =====
window.addEventListener("error", (event) => {
  try {
    const info = {
      message: event && event.message,
      source: event && event.filename,
      lineno: event && event.lineno,
      colno: event && event.colno,
    };
    if (event && event.error && event.error.stack) {
      info.stack = event.error.stack;
    }
    console.error("[renderer-error]", info);
  } catch (e) {
    console.error("[renderer-error-handler-failed]", e);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  try {
    const reason = event && event.reason;
    let info;

    if (reason && typeof reason === "object") {
      info = {
        message: reason.message,
        stack: reason.stack,
        name: reason.name,
      };
    } else {
      info = {
        message: String(reason),
        stack: null,
        name: typeof reason,
      };
    }

    console.error("[renderer-unhandledrejection]", info);
  } catch (e) {
    console.error("[renderer-unhandledrejection-handler-failed]", e);
  }
});

const CONFIG = window.config || {};

// main.js から渡される設定（なければデフォルト値）
const generalSettingsFlags =
  (CONFIG && CONFIG.generalSettingsFlags) || {
    enableAdblock: true,
    enablePopups: false,
  };

// main.js から渡された profileId（例: "profile-2"）
const STARTUP_PROFILE_ID =
  (CONFIG && typeof CONFIG.profileId === "string" && CONFIG.profileId) ||
  "profile-1";

// 起動プロファイル番号（1, 2, 3...）
let STARTUP_PROFILE_NO = 1;
const mProfile = /^profile-(\d+)$/.exec(STARTUP_PROFILE_ID);
if (mProfile) {
  const n = parseInt(mProfile[1], 10);
  if (Number.isFinite(n) && n > 0) {
    STARTUP_PROFILE_NO = n;
  }
}

// 新規タブのデフォルトプロファイル番号（表示用）
const DEFAULT_TAB_PROFILE_NO = 1;

// プロファイルごとにタブ状態を分けるキー
const TABS_STATE_KEY =
  (CONFIG.SAVE_KEY_PREFIX || "") +
  "mindraLightTabsState:" +
  STARTUP_PROFILE_ID;

// --- ブックマーク保存用キー（プロファイルごと） ---
const BOOKMARKS_STORAGE_KEY =
  (CONFIG.SAVE_KEY_PREFIX || "") +
  "mindraLightBookmarks:" +
  STARTUP_PROFILE_ID; // profile-1 / profile-2 ごとに分ける:contentReference[oaicite:1]{index=1}

// ===== ブックマークモードの開閉（左サイドバーの切り替えボタン） =====
if (btnToggleBookmarkMode && bookmarkModePane && sidebar) {
  btnToggleBookmarkMode.addEventListener("click", () => {
    // フラグを反転
    bookmarkModeVisible = !bookmarkModeVisible;

    // ボタンのON/OFF色（CSS側で .active をデザイン）
    setToggleButtonVisual(btnToggleBookmarkMode, bookmarkModeVisible);

    // サイドバーにモードクラスを付与（CSSでURL欄以下を隠す）
    sidebar.classList.toggle("bookmark-mode-on", bookmarkModeVisible);

    // レイアウト反映（New Tab / Split View / 下線の表示・非表示もここでやる）
    applyBookmarkModeLayout();

    // ツリーは「ブックマークモードONのときだけ」描画し直す
    if (bookmarkModeVisible) {
      renderBookmarkTreePane();
    }
  });
}

/**
 * BookmarkNode:
 * - フォルダ: { id, type: "folder", title, children: BookmarkNode[] }
 * - アイテム: { id, type: "item", title, url }
 */

// ルートフォルダを含むツリー全体
let bookmarkTree = null;

// 互換用：ブックマークバー用のフラット配列（全アイテム）
let bookmarks = [];

// --- ブックマーク並び替え用ドラッグ状態 ---
let draggingBookmarkId = null;
let bookmarkDragOverRow = null;

function clearBookmarkDragIndicator() {
  if (!bookmarkDragOverRow) return;
  bookmarkDragOverRow.style.borderTop = "";
  bookmarkDragOverRow.style.borderBottom = "";
  bookmarkDragOverRow.removeAttribute("data-bm-drop-pos");
  bookmarkDragOverRow = null;
}

// ID 発行
let _bookmarkIdCounter = Date.now();
function generateBookmarkId() {
  _bookmarkIdCounter += 1;
  return "bm-" + _bookmarkIdCounter;
}

function createEmptyBookmarkTree() {
  return {
    id: "root",
    type: "folder",
    title: "ブックマーク",
    children: [],
  };
}

/**
 * Node の形を整える（folder / item 判定）。
 * @param {any} node ブックマークノード候補。
 * @returns {object|null} 正規化された folder/item ノード、または無効時は null。
 */
function normalizeBookmarkNode(node) {
  if (!node || typeof node !== "object") return null;

  if (node.type === "folder") {
    return {
      id: typeof node.id === "string" ? node.id : generateBookmarkId(),
      type: "folder",
      title:
        typeof node.title === "string" && node.title
          ? node.title
          : "フォルダ",
      children: Array.isArray(node.children)
        ? node.children
            .map((c) => normalizeBookmarkNode(c))
            .filter((c) => !!c)
        : [],
    };
  }

  // item 扱い
  if (!node.url || typeof node.url !== "string") return null;
  return {
    id: typeof node.id === "string" ? node.id : generateBookmarkId(),
    type: "item",
    url: node.url,
    title:
      typeof node.title === "string" && node.title
        ? node.title
        : deriveTitleFromUrl(node.url),
  };
}

/**
 * ツリーから「全アイテム」のフラット配列を作る（バー描画用）。
 * @param {object} root ルートフォルダノード。
 * @returns {Array<{url: string, title: string}>} フラット化したブックマーク配列。
 */
function flattenBookmarksFromTree(root) {
  const result = [];
  function walk(node) {
    if (!node) return;
    if (node.type === "item") {
      result.push({ url: node.url, title: node.title });
      return;
    }
    if (node.type === "folder" && Array.isArray(node.children)) {
      node.children.forEach((c) => walk(c));
    }
  }
  walk(root);
  return result;
}

function rebuildFlatBookmarksFromTree() {
  if (!bookmarkTree) {
    bookmarks = [];
    return;
  }
  bookmarks = flattenBookmarksFromTree(bookmarkTree);
}

/**
 * 旧形式（配列）→ ツリー形式への変換。
 * @param {Array<{url: string, title?: string}>} flatArray URL の配列形式。
 * @returns {object} ルートを先頭としたブックマークツリー。
 */
function migrateFlatArrayToTree(flatArray) {
  const root = createEmptyBookmarkTree();
  flatArray
    .filter((b) => b && typeof b.url === "string" && b.url)
    .forEach((b) => {
      root.children.push({
        id: generateBookmarkId(),
        type: "item",
        url: b.url,
        title:
          typeof b.title === "string" && b.title
            ? b.title
            : deriveTitleFromUrl(b.url),
      });
    });
  return root;
}

/**
 * localStorage からブックマークツリーを読み込み、互換形式を正規化する。
 * @returns {void}
 */
function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (!raw) {
      bookmarkTree = createEmptyBookmarkTree();
      rebuildFlatBookmarksFromTree();
      return;
    }

    const data = JSON.parse(raw);

    if (Array.isArray(data)) {
      // 旧バージョン: フラット配列 → ルート直下に並べる
      bookmarkTree = migrateFlatArrayToTree(data);
    } else if (data && typeof data === "object") {
      // 新バージョン: ツリー構造
      const normalized = normalizeBookmarkNode(data);
      bookmarkTree = normalized || createEmptyBookmarkTree();
    } else {
      bookmarkTree = createEmptyBookmarkTree();
    }

    rebuildFlatBookmarksFromTree();
  } catch (err) {
    console.error("loadBookmarks error", err);
    bookmarkTree = createEmptyBookmarkTree();
    rebuildFlatBookmarksFromTree();
  }
}

// ===== ルート直下ブックマークの並び替えヘルパ =====
/**
 * draggingBookmarkId で指しているノードを、baseId の前/後ろに動かす。
 * @param {string} fromId 移動元ノード ID。
 * @param {string} baseId 基準となるノード ID。
 * @param {boolean} before true のとき baseId の前へ、false のとき後ろへ移動。
 */
function moveRootBookmarkRelative(fromId, baseId, before) {
  if (!bookmarkTree || !Array.isArray(bookmarkTree.children)) return;

  const list = bookmarkTree.children;

  const fromIndex = list.findIndex((n) => n && n.id === fromId);
  const baseIndex = list.findIndex((n) => n && n.id === baseId);

  // 見つからない or 同じ位置なら何もしない
  if (fromIndex === -1 || baseIndex === -1 || fromIndex === baseIndex) {
    return;
  }

  // 取り出し
  const [moved] = list.splice(fromIndex, 1);

  // 挿入位置計算
  let insertIndex = before ? baseIndex : baseIndex + 1;

  // 取り出した位置より右に挿入する場合は、配列が1つ詰まっているぶん補正
  if (insertIndex > fromIndex) {
    insertIndex -= 1;
  }

  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > list.length) insertIndex = list.length;

  list.splice(insertIndex, 0, moved);

  // フラット配列と保存を更新
  rebuildFlatBookmarksFromTree();
  saveBookmarks();
}

// サイドバーの「一番上より上 / 一番下より下」にドロップされたとき用
/**
 * ブックマークノードをルート直下の指定位置へ移動する。
 * @param {string} fromId 移動対象ノードの ID。
 * @param {number} insertIndex 挿入先インデックス（0〜children.length）。
 */
function moveRootBookmarkToIndex(fromId, insertIndex) {
  if (!bookmarkTree || !Array.isArray(bookmarkTree.children)) return;

  const list = bookmarkTree.children;

  const fromIndex = list.findIndex((n) => n && n.id === fromId);
  if (fromIndex === -1) {
    return;
  }

  // いったん取り出し
  const [moved] = list.splice(fromIndex, 1);

  // 範囲補正（末尾の一つ後ろ = append も許可）
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > list.length) insertIndex = list.length;

  // 取り出した位置より右側に入れるときは1つ左に詰める
  if (insertIndex > fromIndex) {
    insertIndex -= 1;
  }

  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > list.length) insertIndex = list.length;

  list.splice(insertIndex, 0, moved);

  rebuildFlatBookmarksFromTree();
  saveBookmarks();
}

function saveBookmarks() {
  try {
    if (!bookmarkTree) {
      bookmarkTree = createEmptyBookmarkTree();
    }
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarkTree));
  } catch (err) {
    console.error("saveBookmarks error", err);
  }
}

/**
 * URL に対応するアイテムをツリーから探す。
 * @param {object} node 検索開始ノード。
 * @param {string} url 照合する URL。
 * @returns {object|null} 見つかったアイテムノード、または null。
 */
function findBookmarkItemByUrl(node, url) {
  if (!node || !url) return null;

  if (node.type === "item" && node.url === url) {
    return node;
  }
  if (node.type === "folder" && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findBookmarkItemByUrl(child, url);
      if (found) return found;
    }
  }
  return null;
}

function isUrlBookmarked(url) {
  if (!url || !bookmarkTree) return false;
  return !!findBookmarkItemByUrl(bookmarkTree, url);
}

/**
 * ルート直下にブックマークアイテムを追加（フォルダ選択なし）。
 * 既存の同一 URL は削除してから追加する。
 * @param {string} url 追加する URL。
 * @param {string} title 表示タイトル。
 */
function addBookmarkToRoot(url, title) {
  if (!bookmarkTree) {
    bookmarkTree = createEmptyBookmarkTree();
  }
  if (!Array.isArray(bookmarkTree.children)) {
    bookmarkTree.children = [];
  }

  // 重複は一旦全削除してから 1 件だけ追加
  removeBookmarkByUrl(url);

  bookmarkTree.children.push({
    id: generateBookmarkId(),
    type: "item",
    url,
    title: title || deriveTitleFromUrl(url),
  });

  rebuildFlatBookmarksFromTree();
  saveBookmarks();
}

/**
 * URL に一致するアイテムを 1 件削除する。
 * @param {string} url 削除対象の URL。
 * @returns {boolean} 削除が発生した場合は true。
 */
function removeBookmarkByUrl(url) {
  if (!bookmarkTree || !url) return false;

  let removed = false;

  function walk(node) {
    if (!node || node.type !== "folder" || !Array.isArray(node.children)) {
      return;
    }
    const newChildren = [];
    for (const child of node.children) {
      if (child.type === "item" && child.url === url) {
        removed = true;
        continue;
      }
      if (child.type === "folder") {
        walk(child);
      }
      newChildren.push(child);
    }
    node.children = newChildren;
  }

  walk(bookmarkTree);

  if (removed) {
    rebuildFlatBookmarksFromTree();
    saveBookmarks();
  }
  return removed;
}

// ===== ブックマークノード共通ユーティリティ =====

/**
 * ブックマーク用簡易入力ダイアログ（prompt の代わり）。
 * @param {{title?: string, fields?: Array<{name: string, label?: string, placeholder?: string, defaultValue?: string}>}} options 表示オプション。
 * @returns {Promise<object|null>} 入力結果オブジェクト、キャンセル時は null。
 */
function openBookmarkDialog(options) {
  return new Promise((resolve) => {
    const { title, fields } = options || {};
    const overlay = document.createElement("div");
    overlay.className = "bookmark-dialog-overlay";

    const dialog = document.createElement("div");
    dialog.className = "bookmark-dialog";

    const titleEl = document.createElement("div");
    titleEl.className = "bookmark-dialog-title";
    titleEl.textContent = title || "ブックマーク編集";
    dialog.appendChild(titleEl);

    const inputs = {};

    (fields || []).forEach((field) => {
      const wrap = document.createElement("div");
      wrap.className = "bookmark-dialog-field";

      if (field.label) {
        const labelEl = document.createElement("label");
        labelEl.className = "bookmark-dialog-label";
        labelEl.textContent = field.label;
        wrap.appendChild(labelEl);
      }

      const input = document.createElement("input");
      input.className = "bookmark-dialog-input";
      input.type = "text";
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.defaultValue != null) input.value = field.defaultValue;

      wrap.appendChild(input);
      inputs[field.name] = input;
      dialog.appendChild(wrap);
    });

    const btnRow = document.createElement("div");
    btnRow.className = "bookmark-dialog-buttons";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className =
      "bookmark-dialog-btn bookmark-dialog-btn-cancel";
    cancelBtn.textContent = "キャンセル";

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "bookmark-dialog-btn bookmark-dialog-btn-ok";
    okBtn.textContent = "OK";

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    dialog.appendChild(btnRow);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function close(result) {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      resolve(result || null);
    }

    cancelBtn.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        close(null);
      }
    });

    okBtn.addEventListener("click", () => {
      const result = {};
      Object.keys(inputs).forEach((name) => {
        result[name] = inputs[name].value;
      });
      close(result);
    });

    dialog.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        okBtn.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close(null);
      }
    });

    const firstField =
      fields && fields[0] && inputs[fields[0].name];
    if (firstField) {
      firstField.focus();
      firstField.select();
    }
  });
}

/**
 * id でノードを探す。
 * @param {object} node 検索開始ノード。
 * @param {string} id 探すノードの ID。
 * @returns {object|null} 見つかったノード、または null。
 */
function findBookmarkNodeById(node, id) {
  if (!node || !id) return null;
  if (node.id === id) return node;
  if (node.type === "folder" && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findBookmarkNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * id でノードとその親を探す。
 * @param {object} node 検索開始ノード。
 * @param {string} id 探すノードの ID。
 * @param {object|null} [parent=null] 現在の親ノード。
 * @returns {{node: object, parent: object}|null} 見つかったノードと親のペア。
 */
function findBookmarkNodeAndParentById(node, id, parent = null) {
  if (!node || !id) return null;
  if (node.id === id) {
    return { node, parent };
  }
  if (node.type === "folder" && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findBookmarkNodeAndParentById(child, id, node);
      if (found) return found;
    }
  }
  return null;
}

/**
 * id でノードを削除する。
 * @param {string} id 削除するノードの ID。
 * @returns {boolean} 削除が行われた場合は true。
 */
function removeBookmarkNodeById(id) {
  if (!bookmarkTree || !id) return false;

  let removed = false;

  function walk(node) {
    if (!node || node.type !== "folder" || !Array.isArray(node.children)) {
      return;
    }
    const newChildren = [];
    for (const child of node.children) {
      if (child.id === id) {
        removed = true;
        continue;
      }
      if (child.type === "folder") {
        walk(child);
      }
      newChildren.push(child);
    }
    node.children = newChildren;
  }

  walk(bookmarkTree);

  if (removed) {
    rebuildFlatBookmarksFromTree();
    saveBookmarks();
  }
  return removed;
}

/**
 * fromId を targetId の前/後に移動（ツリー全体で有効）。
 * @param {string} fromId 移動元ノード ID。
 * @param {string} targetId 基準となるノード ID。
 * @param {boolean} before true のとき targetId の前、false のとき後ろに移動。
 */
function moveRootBookmarkRelative(fromId, targetId, before) {
  if (!bookmarkTree || !fromId || !targetId || fromId === targetId) return;

  const fromInfo = findBookmarkNodeAndParentById(bookmarkTree, fromId);
  const targetInfo = findBookmarkNodeAndParentById(bookmarkTree, targetId);
  if (!fromInfo || !targetInfo) return;

  const fromParent = fromInfo.parent || bookmarkTree;
  const targetParent = targetInfo.parent || bookmarkTree;

  if (!Array.isArray(fromParent.children) || !Array.isArray(targetParent.children)) {
    return;
  }

  const fromIndex = fromParent.children.findIndex((c) => c.id === fromId);
  if (fromIndex < 0) return;

  const [movingNode] = fromParent.children.splice(fromIndex, 1);

  let targetIndex = targetParent.children.findIndex((c) => c.id === targetId);
  if (targetIndex < 0) {
    targetParent.children.push(movingNode);
  } else {
    // 同じフォルダ内で、前にあったものを後ろに持っていくときのズレ補正
    if (fromParent === targetParent && fromIndex < targetIndex) {
      targetIndex -= 1;
    }
    if (!before) {
      targetIndex += 1;
    }
    targetParent.children.splice(targetIndex, 0, movingNode);
  }

  rebuildFlatBookmarksFromTree();
  saveBookmarks();
}

/**
 * 任意のノードを「ルート直下」の指定インデックスへ移動（フォルダの外に出す用）。
 * @param {string} nodeId 移動するノード ID。
 * @param {number} targetIndex 挿入先インデックス。
 */
function moveRootBookmarkToIndex(nodeId, targetIndex) {
  if (!bookmarkTree) return;
  if (!Array.isArray(bookmarkTree.children)) {
    bookmarkTree.children = [];
  }

  const info = findBookmarkNodeAndParentById(bookmarkTree, nodeId);
  if (!info) return;

  const fromParent = info.parent || bookmarkTree;
  if (!Array.isArray(fromParent.children)) return;

  const fromIndex = fromParent.children.findIndex((c) => c.id === nodeId);
  if (fromIndex < 0) return;

  const [movingNode] = fromParent.children.splice(fromIndex, 1);

  let idx = targetIndex;
  if (!Number.isFinite(idx)) {
    idx = bookmarkTree.children.length;
  }
  idx = Math.max(0, Math.min(idx, bookmarkTree.children.length));

  bookmarkTree.children.splice(idx, 0, movingNode);

  rebuildFlatBookmarksFromTree();
  saveBookmarks();
}

/**
 * ブックマークをフォルダの中へ移動する。
 * @param {string} nodeId 移動するノード ID。
 * @param {string} folderId 移動先フォルダ ID。
 */
function moveBookmarkIntoFolder(nodeId, folderId) {
  if (!bookmarkTree || !nodeId || !folderId || nodeId === folderId) return;

  // まず移動対象ノードをツリーから取り外す
  let removedNode = null;

  function detach(node) {
    if (!node || node.type !== "folder" || !Array.isArray(node.children)) return;
    const newChildren = [];
    for (const child of node.children) {
      if (child.id === nodeId) {
        removedNode = child;
        continue;
      }
      if (child.type === "folder") {
        detach(child);
      }
      newChildren.push(child);
    }
    node.children = newChildren;
  }

  detach(bookmarkTree);
  if (!removedNode) return;

  // 移動先フォルダを探す
  const dest = findBookmarkNodeById(bookmarkTree, folderId);
  if (!dest || dest.type !== "folder") return;

  if (!Array.isArray(dest.children)) {
    dest.children = [];
  }

  // 末尾に追加（フォルダ内のどこに入れるかはとりあえず最後）
  dest.children.push(removedNode);

  // 反映
  rebuildFlatBookmarksFromTree();
  saveBookmarks();
}

// 新しいフォルダをルート直下に追加
async function createRootBookmarkFolder() {
  if (!bookmarkTree) {
    bookmarkTree = createEmptyBookmarkTree();
  }
  if (!Array.isArray(bookmarkTree.children)) {
    bookmarkTree.children = [];
  }

  const result = await openBookmarkDialog({
    title: "フォルダを追加",
    fields: [
      {
        name: "title",
        label: "フォルダ名",
        placeholder: "新しいフォルダ",
        defaultValue: "新しいフォルダ",
      },
    ],
  });

  if (!result) return;
  const name = (result.title || "").trim();
  if (!name) return;

  bookmarkTree.children.push({
    id: generateBookmarkId(),
    type: "folder",
    title: name,
    children: [],
  });

  rebuildFlatBookmarksFromTree();
  saveBookmarks();
  renderBookmarkTreePane();
  renderBookmarkBar();
  syncBookmarkStar();
}

// 指定ノードと同じ階層にフォルダを追加
async function createSiblingBookmarkFolder(targetId) {
  if (!bookmarkTree || !targetId) return;

  const found = findBookmarkNodeAndParentById(bookmarkTree, targetId);
  if (!found) return;

  const { node, parent } = found;
  const baseFolder =
    parent && parent.type === "folder" ? parent : bookmarkTree;

  if (!Array.isArray(baseFolder.children)) {
    baseFolder.children = [];
  }

  const result = await openBookmarkDialog({
    title: "フォルダを追加",
    fields: [
      {
        name: "title",
        label: "フォルダ名",
        placeholder: "新しいフォルダ",
        defaultValue: "新しいフォルダ",
      },
    ],
  });

  if (!result) return;
  const name = (result.title || "").trim();
  if (!name) return;

  const newFolder = {
    id: generateBookmarkId(),
    type: "folder",
    title: name,
    children: [],
  };

  const index = baseFolder.children.findIndex((c) => c.id === node.id);
  const insertIndex = index >= 0 ? index + 1 : baseFolder.children.length;
  baseFolder.children.splice(insertIndex, 0, newFolder);

  rebuildFlatBookmarksFromTree();
  saveBookmarks();
  renderBookmarkTreePane();
  renderBookmarkBar();
  syncBookmarkStar();
}

// ノード編集
async function editBookmarkNodeById(id) {
  if (!bookmarkTree || !id) return;

  const found = findBookmarkNodeAndParentById(bookmarkTree, id);
  if (!found) return;

  const { node } = found;

  if (node.type === "folder") {
    const result = await openBookmarkDialog({
      title: "フォルダを編集",
      fields: [
        {
          name: "title",
          label: "フォルダ名",
          placeholder: "フォルダ名",
          defaultValue: node.title || "",
        },
      ],
    });
    if (!result) return;
    const newTitle = (result.title || "").trim();
    if (!newTitle) return;

    node.title = newTitle;
  } else if (node.type === "item") {
    const result = await openBookmarkDialog({
      title: "ブックマークを編集",
      fields: [
        {
          name: "title",
          label: "タイトル",
          placeholder: "タイトル",
          defaultValue: node.title || "",
        },
        {
          name: "url",
          label: "URL",
          placeholder: "https://example.com/",
          defaultValue: node.url || "",
        },
      ],
    });
    if (!result) return;

    const newTitle = (result.title || "").trim();
    const newUrl = (result.url || "").trim();
    if (!newTitle || !newUrl) return;

    node.title = newTitle;
    node.url = newUrl;
  }

  rebuildFlatBookmarksFromTree();
  saveBookmarks();
  renderBookmarkTreePane();
  renderBookmarkBar();
  syncBookmarkStar();
}

// ===== URL欄 ＋ ☆ ボタンの同期 =====

/**
 * URL欄の値だけ同期する。
 * @returns {void}
 */
function syncSidebarUrlInput() {
  const input = document.getElementById("sidebar-url-input");
  if (!input) return;

  // SplitView 中は常に空欄にする（有効/無効は別関数で制御）
  if (window.splitCanvasMode) {
    input.value = "";
    return;
  }

  const tab = getActiveTab();
  input.value = tab && tab.url ? tab.url : "";
}

/**
 * ☆ボタンの見た目を現在タブの URL に合わせて更新する。
 * @returns {void}
 */
function syncBookmarkStar() {
  const sidebarBookmarkBtn = document.getElementById("btn-sidebar-bookmark");
  if (!sidebarBookmarkBtn) return;

  // SplitView 中は URL欄も止まってるので、見た目だけ初期状態に
  if (window.splitCanvasMode) {
    sidebarBookmarkBtn.textContent = "☆";
    sidebarBookmarkBtn.classList.remove("is-bookmarked");
    return;
  }

  const tab = getActiveTab();
  const url = tab && tab.url ? tab.url : "";

  if (isUrlBookmarked(url)) {
    sidebarBookmarkBtn.textContent = "★";
    sidebarBookmarkBtn.classList.add("is-bookmarked");
  } else {
    sidebarBookmarkBtn.textContent = "☆";
    sidebarBookmarkBtn.classList.remove("is-bookmarked");
  }
}

/**
 * URL欄と☆ボタンの状態をまとめて同期する。
 * @returns {void}
 */
function syncUrlAndBookmarkUI() {
  syncSidebarUrlInput();
  syncBookmarkStar();
}

// ===== ☆クリックでブックマーク追加/削除 =====

if (sidebarBookmarkBtn) {
  sidebarBookmarkBtn.addEventListener("click", () => {
    // SplitView 中は何もしない
    if (window.splitCanvasMode) return;

    const tab = getActiveTab();
    if (!tab || !tab.url) return;

    const url = tab.url;
    const title = tab.title || deriveTitleFromUrl(url);

    if (isUrlBookmarked(url)) {
      // 登録済み → 削除
      removeBookmarkByUrl(url);
    } else {
      // 未登録 → 追加
      addBookmarkToRoot(url, title);
    }

    // ☆の見た目とバーを更新
    syncBookmarkStar();
    renderBookmarkBar();
    if (bookmarkModeVisible) {
      renderBookmarkTreePane();
    }
  });
}

// ===== ブックマークバーの描画 =====

function renderBookmarkBar() {
  const container = document.getElementById("bookmark-bar");
  if (!container) return;

  container.innerHTML = "";

  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return;
  }

  bookmarks.forEach((bm) => {
    if (!bm || !bm.url) return;

    const btn = document.createElement("button");
    btn.className = "bookmark-item";

    // favicon 取得（Googleのfavicon API）
    const icon = document.createElement("img");
    icon.className = "bookmark-favicon";
    const domain = new URL(bm.url).hostname;
    icon.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    // テキスト
    const label = document.createElement("span");
    label.className = "bookmark-label";
    label.textContent = bm.title || deriveTitleFromUrl(bm.url);

    btn.appendChild(icon);
    btn.appendChild(label);

    btn.onclick = () => {
      const resolved = resolveUrlOrSearch(bm.url);
      if (!resolved) return;

      const tab = getActiveTab();
      if (tab) {
        const wv = getWebviewForTab(tab);
        if (wv) {
          try {
            wv.src = resolved;
          } catch (err) {
            console.error("bookmark navigate error", err);
          }
        }
      } else {
        createTab(resolved, true);
      }
    };

    container.appendChild(btn);
  });
}

// ===== ブックマークツリーの描画（左サイドバーの小窓） =====

// ブックマークモードの表示状態
let bookmarkModeVisible = false;

// フォルダ用 SVG アイコン（閉じているとき）
const BOOKMARK_FOLDER_ICON_CLOSED = `
  <svg viewBox="0 0 16 16" class="bookmark-folder-icon-svg">
    <path d="M2 6 L12 2 L28 6 L24 20 H2 Z"></path>
  </svg>
`;

// フォルダ用 SVG アイコン（開いているとき）
const BOOKMARK_FOLDER_ICON_OPEN = `
  <svg viewBox="0 0 16 16" class="bookmark-folder-icon-svg">
    <path d="M2 5h6l2 2h18v13H2z"></path>
  </svg>
`;

/**
 * ブックマークモード時のレイアウトを反映する。
 * @returns {void}
 */
function applyBookmarkModeLayout() {
  const hide = bookmarkModeVisible;

  // URL欄 + ☆ + DLボタン
  const urlRow = document.querySelector(".sidebar-url-row");
  if (urlRow) urlRow.style.display = hide ? "none" : "";

  // ブックマークツリーパネル
  if (bookmarkModePane) {
    bookmarkModePane.style.display = hide ? "block" : "none";
  }

  // NewTab / SplitView ボタン
  const newTabBtn = document.getElementById("btn-new-tab");
  if (newTabBtn) newTabBtn.style.display = hide ? "none" : "";

  const splitViewBtn = document.getElementById("btn-split-view");
  if (splitViewBtn) splitViewBtn.style.display = hide ? "none" : "";

  // 線の制御
  // .sidebar-divider が複数ある場合：
  //   0番目 … 上の線（常に表示）
  //   1番目以降 … 下の線（ブックマークモードのときだけ非表示）
  const dividers = document.querySelectorAll(".sidebar-divider");
  if (dividers.length > 0) {
    dividers.forEach((divider, index) => {
      if (index === 0) {
        // 一番上の線は常に表示
        divider.style.display = "";
      } else {
        // それ以外はブックマークモードのときだけ消す
        divider.style.display = hide ? "none" : "";
      }
    });
  }
}

/**
 * フォルダ開閉用 SVG アイコンを生成する。
 * @param {boolean} isOpen 開いているときは true。
 * @returns {string} SVG マークアップ文字列。
 */
function createFolderToggleIconSvg(isOpen) {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");

  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");

  svg.classList.add("bookmark-tree-folder-icon");

  const path = document.createElementNS(svgNS, "path");

  // 開閉状態でフォルダを切り替え
  if (isOpen) {
    // 開いたフォルダ
    path.setAttribute(
      "d",
      "M2 6h6l2 2h8l-2.5 9H2z"
    );
  } else {
    // 閉じたフォルダ
    path.setAttribute(
      "d",
      "M2 5h6l2 2h8v10H2z"
    );
  }

  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

function renderBookmarkTreePane() {
  if (!bookmarkModePane) return;

  bookmarkModePane.innerHTML = "";

  if (!bookmarkTree || !Array.isArray(bookmarkTree.children)) {
    return;
  }

  const rootLabel = document.createElement("div");
  rootLabel.className = "bookmark-tree-root-label";
  rootLabel.textContent = bookmarkTree.title || "ブックマーク";

  const list = buildBookmarkTreeList(bookmarkTree.children, 0);

  bookmarkModePane.appendChild(rootLabel);
  bookmarkModePane.appendChild(list);
}

/**
 * ブックマークツリーを再帰的に描画する。
 * @param {Array<object>} nodes 表示するノード配列。
 * @param {number} [depth=0] 現在の深さ。
 * @returns {DocumentFragment} 描画結果のフラグメント。
 */
function buildBookmarkTreeList(nodes, depth = 0) {
  const ul = document.createElement("ul");
  ul.className = depth === 0 ? "bookmark-tree-root" : "bookmark-tree-children";

  if (!Array.isArray(nodes)) return ul;

  nodes.forEach((node) => {
    if (!node || !node.id) return;

    const li = document.createElement("li");
    li.className = "bookmark-tree-item";

    const row = document.createElement("div");
    row.className = "bookmark-tree-row";
    row.dataset.bmId = node.id;
    if (depth === 0) {
      // ルート直下だけ depth=0 を付けておく（サイドバー全体ドロップ用）
      row.dataset.bmDepth = "0";
    }

    // ===== フォルダ =====
    if (node.type === "folder") {
      row.classList.add("bookmark-tree-row-folder");

      // フォルダアイコン（ここだけで開閉）
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "bookmark-folder-toggle-btn";
      toggleBtn.innerHTML = createFolderToggleIconSvg(true);
      row.appendChild(toggleBtn);

      const titleSpan = document.createElement("span");
      titleSpan.className = "bookmark-tree-title";
      titleSpan.textContent = node.title || "フォルダ";
      row.appendChild(titleSpan);

      // 右クリックメニュー（フォルダ）
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        hideContentMenu();
        showBookmarkContextMenu(e.clientX, e.clientY, node.id);
      });

      // 並べ替え用 DnD（フォルダ自身もドラッグ対象）
      setupBookmarkRowDnD(row, node.id);

      li.appendChild(row);

      // 子要素
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "bookmark-tree-folder-children";

      if (Array.isArray(node.children) && node.children.length > 0) {
        const childList = buildBookmarkTreeList(node.children, depth + 1);
        childrenWrap.appendChild(childList);
      }
      li.appendChild(childrenWrap);

      // 開閉状態
      let isOpen = true;
      function updateFolderOpen() {
        childrenWrap.style.display = isOpen ? "" : "none";
        toggleBtn.innerHTML = createFolderToggleIconSvg(isOpen);
      }

      // ★ フォルダの開閉はアイコンのみで行う
      toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isOpen = !isOpen;
        updateFolderOpen();
      });

      updateFolderOpen();
    }
    // ===== アイテム =====
    else if (node.type === "item") {
      row.classList.add("bookmark-tree-row-item");

      const icon = createBookmarkFaviconElement(node.url);
      row.appendChild(icon);

      const titleSpan = document.createElement("span");
      titleSpan.className = "bookmark-tree-title";
      titleSpan.textContent =
        node.title || (node.url ? deriveTitleFromUrl(node.url) : "");
      row.appendChild(titleSpan);

      // 左クリックで開く
      row.addEventListener("click", () => {
        if (!node.url) return;
        const resolved = resolveUrlOrSearch(node.url);
        if (!resolved) return;

        const tab = getActiveTab();
        if (tab) {
          const wv = getWebviewForTab(tab);
          if (wv) {
            try {
              wv.src = resolved;
            } catch (err) {
              console.error("set webview src error", err);
            }
          }
        } else {
          createTab(resolved, true);
        }
      });

      // 右クリックメニュー（アイテム）
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        hideContentMenu();
        showBookmarkContextMenu(e.clientX, e.clientY, node.id);
      });

      // 並べ替え用 DnD
      setupBookmarkRowDnD(row, node.id);

      li.appendChild(row);
    }

    ul.appendChild(li);
  });

  return ul;
}

function setupBookmarkRowDnD(row, nodeId) {
  row.draggable = true;

  row.addEventListener("dragstart", (e) => {
    draggingBookmarkId = nodeId;
    const dt = e.dataTransfer;
    if (dt) {
      dt.effectAllowed = "move";
      dt.setData("text/plain", String(nodeId));
    }
  });

  row.addEventListener("dragend", () => {
    draggingBookmarkId = null;
    clearBookmarkDragIndicator();
  });

  row.addEventListener("dragover", (e) => {
    if (!draggingBookmarkId || draggingBookmarkId === nodeId) return;
    e.preventDefault();

    const targetNode =
      bookmarkTree && findBookmarkNodeById(bookmarkTree, nodeId);

    let dropPos = "before";

    if (targetNode && targetNode.type === "folder") {
      // フォルダ行に乗っているときは、必ず「中に入れる」
      dropPos = "into";
    } else {
      // 通常アイテム：上下で before / after
      const rect = row.getBoundingClientRect();
      dropPos = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    }

    clearBookmarkDragIndicator();
    bookmarkDragOverRow = row;

    // 見た目
    if (dropPos === "before") {
      row.style.borderTop = "2px solid rgba(255,255,255,0.9)";
      row.style.borderBottom = "";
    } else if (dropPos === "after") {
      row.style.borderTop = "";
      row.style.borderBottom = "2px solid rgba(255,255,255,0.9)";
    } else {
      // into のときは上下両方に線
      row.style.borderTop = "2px solid rgba(255,255,255,0.9)";
      row.style.borderBottom = "2px solid rgba(255,255,255,0.9)";
    }

    row.dataset.bmDropPos = dropPos;
  });

  row.addEventListener("dragleave", (e) => {
    if (e.relatedTarget && row.contains(e.relatedTarget)) return;
    clearBookmarkDragIndicator();
  });

  row.addEventListener("drop", (e) => {
    if (!draggingBookmarkId || draggingBookmarkId === nodeId) {
      clearBookmarkDragIndicator();
      return;
    }

    e.preventDefault();

    const targetNode =
      bookmarkTree && findBookmarkNodeById(bookmarkTree, nodeId);
    const dropPos = row.dataset.bmDropPos || "before";

    if (targetNode && targetNode.type === "folder") {
      // フォルダ行 → フォルダの中に移動
      moveBookmarkIntoFolder(draggingBookmarkId, nodeId);
    } else {
      // 通常行 → ルート並び替え
      const before = dropPos !== "after";
      moveRootBookmarkRelative(draggingBookmarkId, nodeId, before);
    }

    draggingBookmarkId = null;
    clearBookmarkDragIndicator();

    // 反映
    renderBookmarkTreePane();
    renderBookmarkBar();
    syncBookmarkStar();
  });
}

// ===== ダウンロードステータス（URL欄右のアイコン制御） =====
const downloadStatusBtn = document.getElementById("download-status-btn");
const downloadProgressRing =
  downloadStatusBtn &&
  downloadStatusBtn.querySelector(".dl-progress-ring");

const downloadPanel = document.getElementById("download-panel");
const downloadListEl = document.getElementById("download-list");
const downloadPanelClose = document.getElementById("download-panel-close");
let downloadItems = [];
let isDownloadPanelHidden = false;

const DOWNLOAD_RING_LENGTH = 56;

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  if (!bytes || Number.isNaN(bytes) || bytes < 0) return "―";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function ensureDownloadPanelVisibility(visible, options = {}) {
  if (!downloadPanel) return;
  const { manual = false, force = false } = options;

  if (visible) {
    if (!force && isDownloadPanelHidden) return;
    isDownloadPanelHidden = false;
    downloadPanel.style.display = "block";
  } else {
    downloadPanel.style.display = "none";
    if (manual) {
      isDownloadPanelHidden = true;
    }
  }
}

function renderDownloadItems() {
  if (!downloadListEl) return;

  downloadListEl.innerHTML = "";

  if (!downloadItems || downloadItems.length === 0) {
    ensureDownloadPanelVisibility(false);
    return;
  }

  downloadItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "download-item";

    const header = document.createElement("div");
    header.className = "download-item-header";
    header.textContent = item.fileName || "ダウンロード中";
    row.appendChild(header);

    const status = document.createElement("div");
    status.className = "download-item-status";
    const statusLabel = document.createElement("span");
    statusLabel.textContent = (() => {
      if (item.state === "completed") return "完了";
      if (item.state === "cancelled") return "キャンセル";
      if (item.state === "interrupted") return "中断";
      return "ダウンロード中";
    })();

    const percent = (() => {
      if (item.state === "completed") return 100;
      const total = item.total || 0;
      if (total <= 0) return 0;
      return Math.min(100, Math.round(((item.received || 0) / total) * 100));
    })();

    const progressText = document.createElement("span");
    progressText.textContent = `${formatBytes(item.received || 0)} / ${formatBytes(
      item.total || 0,
    )}`;

    status.appendChild(statusLabel);
    status.appendChild(progressText);
    row.appendChild(status);

    const bar = document.createElement("div");
    bar.className = "download-progress-bar";
    const inner = document.createElement("div");
    inner.className = "download-progress-inner";
    inner.style.width = `${percent}%`;
    bar.appendChild(inner);
    row.appendChild(bar);

    const actions = document.createElement("div");
    actions.className = "download-item-actions";

    const openBtn = document.createElement("button");
    openBtn.textContent = "フォルダを開く";
    openBtn.disabled = item.state !== "completed";
    openBtn.onclick = async () => {
      if (!window.mindraDownloads || typeof window.mindraDownloads.openFolder !== "function") return;
      try {
        const res = await window.mindraDownloads.openFolder(item && item.savePath);
        if (!res || !res.ok) {
          console.error("open downloads folder failed", res && res.error);
        }
      } catch (e) {
        console.error("open downloads folder error", e);
      }
    };
    actions.appendChild(openBtn);

    const dismissBtn = document.createElement("button");
    dismissBtn.textContent = "中断";
    dismissBtn.disabled = item.state !== "progressing";
    dismissBtn.onclick = async () => {
      if (!window.mindraDownloads || typeof window.mindraDownloads.cancel !== "function") {
        return;
      }
      try {
        const res = await window.mindraDownloads.cancel(item.id);
        if (!res || !res.ok) {
          console.error("cancel download failed", res && res.error);
        }
      } catch (e) {
        console.error("cancel download error", e);
      }
    };
    actions.appendChild(dismissBtn);

    row.appendChild(actions);

    downloadListEl.appendChild(row);
  });

  ensureDownloadPanelVisibility(true);
}

function upsertDownloadItem(payload) {
  const id = (payload && payload.id) || `dl-${Date.now()}`;
  const existingIndex = downloadItems.findIndex((d) => d.id === id);
  const existing = existingIndex >= 0 ? downloadItems[existingIndex] : {};

  const updated = {
    id,
    fileName: (payload && payload.fileName) || existing.fileName || "ダウンロード",
    url: (payload && payload.url) || existing.url,
    total:
      payload && typeof payload.total === "number"
        ? payload.total
        : typeof existing.total === "number"
          ? existing.total
          : 0,
    received:
      payload && typeof payload.received === "number"
        ? payload.received
        : typeof existing.received === "number"
          ? existing.received
          : 0,
    savePath: (payload && payload.savePath) || existing.savePath || "",
    state: (payload && payload.state) || existing.state || "progressing",
  };

  if (existingIndex >= 0) {
    downloadItems[existingIndex] = updated;
  } else {
    downloadItems = [updated, ...downloadItems];
  }

  renderDownloadItems();
}

if (downloadProgressRing) {
  // 初期状態：リングは全部「隠れた」状態
  downloadProgressRing.style.strokeDasharray = DOWNLOAD_RING_LENGTH;
  downloadProgressRing.style.strokeDashoffset = DOWNLOAD_RING_LENGTH;
}

// グローバルに公開しておく（他のファイルから呼べるように）
window.mindraDownloadStatus = {
  // ダウンロード開始
  start() {
    if (!downloadStatusBtn || !downloadProgressRing) return;
    downloadStatusBtn.classList.remove("is-complete");
    downloadStatusBtn.classList.add("is-loading");
    this.setProgress(0);
  },

  // 進捗更新（0〜100）
  setProgress(percent) {
    if (!downloadProgressRing) return;
    const p = Math.max(0, Math.min(100, percent || 0));
    const offset = DOWNLOAD_RING_LENGTH * (1 - p / 100);
    downloadProgressRing.style.strokeDashoffset = offset;
  },

  // 完了
  done() {
    if (!downloadStatusBtn || !downloadProgressRing) return;
    this.setProgress(100);
    downloadStatusBtn.classList.remove("is-loading");
    downloadStatusBtn.classList.add("is-complete");
  },

  // キャンセル／エラーなど → 元に戻す
  reset() {
    if (!downloadStatusBtn || !downloadProgressRing) return;
    downloadStatusBtn.classList.remove("is-loading", "is-complete");
    downloadProgressRing.style.strokeDashoffset = DOWNLOAD_RING_LENGTH;
  },
};

if (downloadPanelClose) {
  downloadPanelClose.addEventListener("click", () => {
    ensureDownloadPanelVisibility(false, { manual: true });
  });
}

// ===== ダウンロード進捗 IPC リスナー =====
// preload.js で mindraDownloadEvents が expose されている前提
if (window.mindraDownloadEvents && window.mindraDownloadStatus) {
  try {
    // 開始
    window.mindraDownloadEvents.onStarted((payload) => {
      window.mindraDownloadStatus.start();
      upsertDownloadItem({ ...payload, state: "progressing" });
    });

    // 進捗
    window.mindraDownloadEvents.onUpdated((payload) => {
      const total = payload && payload.total ? payload.total : 0;
      const received = payload && payload.received ? payload.received : 0;

      let percent = 0;
      if (total > 0) {
        percent = (received / total) * 100;
      }
      window.mindraDownloadStatus.setProgress(percent);
      upsertDownloadItem(payload);
    });

    // 完了・中断
    window.mindraDownloadEvents.onDone((payload) => {
      const state = payload && payload.state;

      if (state === "completed") {
        window.mindraDownloadStatus.done();
      } else {
        // "cancelled", "interrupted" など
        window.mindraDownloadStatus.reset();
      }
      upsertDownloadItem(payload);
    });
  } catch (e) {
    console.error("setup mindraDownloadEvents failed", e);
  }
}

// ダウンロード完了状態でクリックしたらダウンロードフォルダを開く
if (downloadStatusBtn) {
  downloadStatusBtn.addEventListener("click", async () => {
    if (
      downloadPanel &&
      downloadPanel.style.display === "none" &&
      downloadItems &&
      downloadItems.length > 0
    ) {
      ensureDownloadPanelVisibility(true, { force: true });
      return;
    }

    // 「完了」状態でなければ何もしない（ぐるぐる中や未使用時は無反応）
    if (!downloadStatusBtn.classList.contains("is-complete")) {
      return;
    }

    if (window.mindraDownloads && typeof window.mindraDownloads.openFolder === "function") {
      try {
        const res = await window.mindraDownloads.openFolder();
        if (!res || !res.ok) {
          console.error("open downloads folder failed", res && res.error);
        }
      } catch (e) {
        console.error("open downloads folder error", e);
      }
    }
  });
}

// SplitView 用のオーバーレイ要素を window にも公開しておく
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
    // SplitView中なら、一旦抜ける（レイアウトは保持）
    exitSplitViewPreserveLayout();
    // ボタンの見た目も同期
    updateSplitViewButtonStyle();

    // 通常モードとして新しいタブを開く
    createTab("https://www.google.com", true);
  };
}

if (splitViewBtn) {
  splitViewBtn.onclick = () => {
    handleSplitViewClick();        // 実際の分割処理
    updateSplitViewButtonStyle();  // splitCanvasMode の状態を見て見た目反映
  };
}

function generateTabUid() {
  return "tab_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

let tabs = [];
let closedTabs = [];
let currentTabId = null;
let nextTabId = 1;
let activeWebviewId = null;
let nextWebviewId = 1;

// タブ履歴の上限
const MAX_TAB_HISTORY_ENTRIES = 500;

let sidebarOpen = true;       // 左サイドバー
let sidebarShrinkMode = true; // 左サイドバー押し出しモード
let rightSidebarOpen = true;  // 右サイドバー
let titlebarFixedMode = true; // タイトルバー
let profileMenuOpen = false;

function openSidebar() {
  sidebarOpen = true;
  if (sidebar) {
    sidebar.classList.add("sidebar-open");
  }
  applyCurrentLayout();
  updateTitlebarWidth();
}

function closeSidebar() {
  // 押し出しモードのときは常に開いたままにする
  if (sidebarShrinkMode) return;
  sidebarOpen = false;
  if (sidebar) {
    sidebar.classList.remove("sidebar-open");
  }
  applyCurrentLayout();
  updateTitlebarWidth();
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

// ===== タブ履歴ヘルパー =====

function ensureTabHistoryFields(tab) {
  if (!Array.isArray(tab.historyEntries)) {
    tab.historyEntries = [];
  }
  if (typeof tab.historyIndex !== "number") {
    tab.historyIndex =
      tab.historyEntries.length > 0 ? tab.historyEntries.length - 1 : -1;
  }
}

function addHistoryEntry(tab, url) {
  ensureTabHistoryFields(tab);
  const title = deriveTitleFromUrl(url);

  // 未来側が残っていたら切り捨て（ブランチ）
  if (
    tab.historyIndex >= 0 &&
    tab.historyIndex < tab.historyEntries.length - 1
  ) {
    tab.historyEntries = tab.historyEntries.slice(0, tab.historyIndex + 1);
  }

  const last = tab.historyEntries[tab.historyEntries.length - 1];
  if (last && last.url === url) {
    // 同じURLなら上書きだけ
    last.title = title;
    last.ts = Date.now();
    tab.historyIndex = tab.historyEntries.length - 1;
    return;
  }

  tab.historyEntries.push({
    url,
    title,
    ts: Date.now(),
  });

  if (tab.historyEntries.length > MAX_TAB_HISTORY_ENTRIES) {
    const diff = tab.historyEntries.length - MAX_TAB_HISTORY_ENTRIES;
    tab.historyEntries.splice(0, diff);
  }

  tab.historyIndex = tab.historyEntries.length - 1;
}

function serializeTabsState() {
  const currentIndex = tabs.findIndex((t) => t.id === currentTabId);

  return {
    tabs: tabs.map((t) => {
      if (!t.uid) {
        t.uid = generateTabUid();
      }
      return {
        uid: t.uid,
        url: t.url,
        profileId: t.profileId || DEFAULT_TAB_PROFILE_NO,
        // タブごとの履歴も保存
        historyEntries: Array.isArray(t.historyEntries)
          ? t.historyEntries
          : [],
        historyIndex:
          typeof t.historyIndex === "number" ? t.historyIndex : -1,
      };
    }),
    currentTabIndex: currentIndex < 0 ? 0 : currentIndex,
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

    resetSplitStateBeforeLoad();

    // タブ復元
    storedTabs.forEach((t) => {
      const id = nextTabId++;

      // URL の初期値
      let url = t.url || "https://www.google.com";

      // 履歴の復元（なければURL1件だけの履歴を作る）
      let historyEntries = Array.isArray(t.historyEntries)
        ? t.historyEntries
        : null;
      let historyIndex =
        typeof t.historyIndex === "number" ? t.historyIndex : null;

      if (!historyEntries || historyEntries.length === 0) {
        const title0 = deriveTitleFromUrl(url);
        historyEntries = [
          {
            url,
            title: title0,
            ts: Date.now(),
          },
        ];
        historyIndex = 0;
      } else {
        if (
          historyIndex == null ||
          historyIndex < 0 ||
          historyIndex >= historyEntries.length
        ) {
          historyIndex = historyEntries.length - 1;
        }
        const entry = historyEntries[historyIndex];
        if (entry && entry.url) {
          url = entry.url;
        }
      }

      const title = deriveTitleFromUrl(url);
      const uid =
        typeof t.uid === "string" && t.uid
          ? t.uid
          : generateTabUid();

      // loadTabsState 内のタブ復元部分
      tabs.push({
        id,
        uid,
        url,
        title,
        profileId: t.profileId || DEFAULT_TAB_PROFILE_NO,
        webviewId: null,
        historyEntries,
        historyIndex,
        _suppressNextHistory: false,
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
      // 既存データにはない場合もあるので、未定義なら true（固定）にする
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

    // タイトルバーの幅と表示状態をモードに合わせて復元
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

    // サイドバーのモードボタンの色を復元状態に合わせてセット
    updateSidebarModeButtonStyle();
    updateTitlebarModeButtonStyle();
    updateSplitViewButtonStyle();
    updateSidebarUrlInputEnabled();
    updateBookmarkModeButtonStyle();
    applyBookmarkModeLayout();

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

    // タイトルバーの左右幅を更新（サイドバー/AIバーとの間に合わせる）
    updateTitlebarWidth();

    // レイアウトを再計算して view を押し出しし直す
    applyCurrentLayout();

    // 状態を保存
    saveTabsState();
  });
}

/**
 * 見た目は CSS に任せて active クラスだけ切り替える。
 * @param {HTMLElement|null} btn 対象ボタン要素。
 * @param {boolean} isOn 有効状態。
 */
function setToggleButtonState(btn, isOn) {
  if (!btn) return;
  btn.classList.toggle("active", !!isOn);

  // インラインスタイルは使わない（テーマごとの CSS に任せる）
  btn.style.background = "";
  btn.style.color = "";
}

/**
 * トグル系ボタンの見た目制御（共通）。
 * @param {HTMLElement|null} btn 対象ボタン要素。
 * @param {boolean} on 有効状態。
 */
function setToggleButtonVisual(btn, on) {
  if (!btn) return;

  // CSS クラスにまかせるので、インライン style はリセット
  btn.classList.toggle("active", !!on);
  btn.style.background = "";
  btn.style.color = "";
}

function updateSidebarModeButtonStyle() {
  if (!btnToggleSidebarMode) return;
  setToggleButtonVisual(btnToggleSidebarMode, sidebarShrinkMode);
}

function updateTitlebarModeButtonStyle() {
  if (!btnToggleTitlebarMode) return;
  setToggleButtonVisual(btnToggleTitlebarMode, titlebarFixedMode);
}

/**
 * ブックマークモード切り替えボタンの見た目を更新する。
 * @returns {void}
 */
function updateBookmarkModeButtonStyle() {
  if (!btnToggleBookmarkMode) return;
  setToggleButtonVisual(btnToggleBookmarkMode, bookmarkModeVisible);
}

function updateRightSidebarWidthStyles() {
  if (!rightSidebar) return;
  rightSidebar.style.width = RIGHT_SIDEBAR_WIDTH + "px";
}

function setRightSidebar(open) {
  rightSidebarOpen = open;

  if (open) {
    rightSidebar.classList.add("open");
  } else {
    rightSidebar.classList.remove("open");
  }

  updateRightSidebarWidthStyles();

  // AI ボタンの見た目は CSS にまかせる
  setToggleButtonVisual(btnToggleAI, open);

  // レイアウトとタイトルバー幅更新
  applyCurrentLayout();
  updateTitlebarWidth();
}

/**
 * Split View ボタンの見た目を更新する。
 * @returns {void}
 */
function updateSplitViewButtonStyle() {
  if (!splitViewBtn) return;
  // splitCanvasMode は splitview.js 側と共有してるフラグ
  setToggleButtonVisual(splitViewBtn, splitCanvasMode);
}

/**
 * 設定（テーマ/LLM）が変わったときにアプリ側へ反映する。
 * @param {object} newSettings 設定モジュールからの更新内容。
 */
function applySettingsFromSettingsModule(newSettings) {
  if (!newSettings || !newSettings.general) return;

  const theme = newSettings.general.theme || "cool";
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * 設定パネルの表示を切り替える。
 * @returns {void}
 */
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

  let leftOffset = 0;

  // 左サイドバーが見えている時は、固定/ホバーどちらでもタイトルバーを短くする
  if (sidebarOpen && sidebar) {
    const sbRect = sidebar.getBoundingClientRect();
    const leftWidth = sbRect.width || sidebar.offsetWidth || LEFT_SIDEBAR_WIDTH;

    // 押し出し固定（shrinkMode=true）のとき → 押し出し量としても使われる
    // ホバー（shrinkMode=false）のとき → タイトルバーだけ短くする
    leftOffset = leftWidth;
  }

  // 右側：AIサイドバーが開いているときだけ、その分を削る
  let rightOffset = 0;
  if (rightSidebarOpen) {
    rightOffset = RIGHT_SIDEBAR_WIDTH;
  }

  // タイトルバーとホバーゾーンに反映
  titlebar.style.left = leftOffset + "px";
  titlebar.style.right = rightOffset + "px";

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

  // SplitView 中は常に空欄にする（有効/無効は別関数で制御）
  if (splitCanvasMode) {
    input.value = "";
    return;
  }

  const tab = getActiveTab();
  input.value = tab && tab.url ? tab.url : "";
}

/**
 * ☆ボタンの見た目を現在タブの URL に合わせて更新する。
 * @returns {void}
 */
function syncBookmarkStar() {
  if (!sidebarBookmarkBtn) return;

  // SplitView 中は URL欄も止まってるので、見た目だけ初期状態に
  if (splitCanvasMode) {
    sidebarBookmarkBtn.textContent = "☆";
    sidebarBookmarkBtn.classList.remove("is-bookmarked");
    return;
  }

  const tab = getActiveTab();
  const url = tab && tab.url ? tab.url : "";

  if (isUrlBookmarked(url)) {
    sidebarBookmarkBtn.textContent = "★";
    sidebarBookmarkBtn.classList.add("is-bookmarked");
  } else {
    sidebarBookmarkBtn.textContent = "☆";
    sidebarBookmarkBtn.classList.remove("is-bookmarked");
  }
}

/**
 * URL欄と☆ボタンの状態をまとめて同期する。
 * @returns {void}
 */
function syncUrlAndBookmarkUI() {
  syncSidebarUrlInput();
  syncBookmarkStar();
}

/**
 * ブックマークバーの描画。
 * @returns {void}
 */
function renderBookmarkBar() {
  const container = document.getElementById("bookmark-bar");
  if (!container) return;

  container.innerHTML = "";

  if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
    return;
  }

  bookmarks.forEach((bm) => {
    if (!bm || !bm.url) return;

    const btn = document.createElement("button");
    btn.className = "bookmark-item";

    // favicon 取得（Googleのfavicon API）
    const icon = document.createElement("img");
    icon.className = "bookmark-favicon";
    icon.src = `https://www.google.com/s2/favicons?domain=${bm.url}&sz=32`;

    // テキスト
    const label = document.createElement("span");
    label.className = "bookmark-label";
    label.textContent = bm.title || deriveTitleFromUrl(bm.url);

    btn.appendChild(icon);
    btn.appendChild(label);

    btn.onclick = () => {
      const resolved = resolveUrlOrSearch(bm.url);
      if (!resolved) return;

      const tab = getActiveTab();
      if (tab) {
        const wv = getWebviewForTab(tab);
        if (wv) {
          try {
            wv.src = resolved;
          } catch (err) {
            console.error("bookmark navigate error", err);
          }
        }
      } else {
        createTab(resolved, true);
      }
    };

    container.appendChild(btn);
  });
}

// ===== ブックマークツリーの描画（左サイドバーの小窓） =====

function renderBookmarkTreePane() {
  if (!bookmarkModePane) return;

  bookmarkModePane.innerHTML = "";

  if (!bookmarkTree || !Array.isArray(bookmarkTree.children)) {
    return;
  }

  const rootLabel = document.createElement("div");
  rootLabel.className = "bookmark-tree-root-label";
  rootLabel.textContent = bookmarkTree.title || "ブックマーク";

  const list = buildBookmarkTreeList(bookmarkTree.children, 0);

  bookmarkModePane.appendChild(rootLabel);
  bookmarkModePane.appendChild(list);
}

if (bookmarkModePane) {
  bookmarkModePane.addEventListener("contextmenu", (e) => {
    // ブックマークモードじゃなければ何もしない
    if (!bookmarkModeVisible) return;

    // アイテム上なら、そのアイテム側の handler が処理する
    const row = e.target.closest && e.target.closest(".bookmark-tree-row");
    if (row) return;

    e.preventDefault();
    hideContentMenu();
    showBookmarkContextMenu(e.clientX, e.clientY, null);
  });
}

function buildBookmarkTreeList(nodes, depth) {
  const ul = document.createElement("ul");
  ul.className = "bookmark-tree-level depth-" + depth;

  nodes.forEach((node) => {
    if (!node) return;

    const li = document.createElement("li");
    li.className = "bookmark-tree-node bookmark-type-" + node.type;

    const row = document.createElement("div");
    row.className = "bookmark-tree-row";

    if (node.type === "folder") {
      // ---- フォルダ行 ----
      let isOpen = true;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "bookmark-tree-folder-toggle";
      toggle.appendChild(createFolderToggleIconSvg(isOpen));

      const label = document.createElement("span");
      label.className = "bookmark-tree-label";
      label.textContent = node.title || "フォルダ";

      row.appendChild(toggle);
      row.appendChild(label);
      row.classList.add("is-folder");
      li.appendChild(row);

      let childrenList = null;
      if (Array.isArray(node.children) && node.children.length > 0) {
        childrenList = buildBookmarkTreeList(node.children, depth + 1);
        childrenList.classList.add("bookmark-tree-children");
        li.appendChild(childrenList);
      }

      function setOpen(next) {
        isOpen = !!next;
        if (childrenList) {
          childrenList.style.display = isOpen ? "block" : "none";
        }
        toggle.innerHTML = "";
        toggle.appendChild(createFolderToggleIconSvg(isOpen));
        li.classList.toggle("is-open", isOpen);
      }

      const toggleHandler = (ev) => {
        ev.stopPropagation();
        setOpen(!isOpen);
      };

      // クリック／ダブルクリックで開閉
      toggle.addEventListener("click", toggleHandler);
      label.addEventListener("click", toggleHandler);
      row.addEventListener("dblclick", toggleHandler);

      // 右クリックメニュー（フォルダ）
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        hideContentMenu();
        showBookmarkContextMenu(e.clientX, e.clientY, node.id);
      });

      // 初期状態は開いた状態
      setOpen(true);
    } else if (node.type === "item") {
      // ---- 普通のブックマーク ----
      const icon = document.createElement("img");
      icon.className = "bookmark-tree-favicon";
      if (node.url) {
        icon.src = `https://www.google.com/s2/favicons?domain=${node.url}&sz=16`;
      }

      const label = document.createElement("span");
      label.className = "bookmark-tree-label";
      label.textContent =
        node.title || (node.url ? deriveTitleFromUrl(node.url) : "リンク");

      row.appendChild(icon);
      row.appendChild(label);
      row.classList.add("is-item");
      row.style.cursor = "pointer";

      // 左クリックでその URL を開く
      row.addEventListener("click", () => {
        if (!node.url) return;
        const resolved = resolveUrlOrSearch(node.url);
        if (!resolved) return;

        const tab = getActiveTab();
        if (tab) {
          const wv = getWebviewForTab(tab);
          if (wv) {
            try {
              wv.src = resolved;
            } catch (err) {
              console.error("set webview src error", err);
            }
          }
        } else {
          createTab(resolved, true);
        }
      });

      // 右クリックメニュー（アイテム）
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        hideContentMenu();
        showBookmarkContextMenu(e.clientX, e.clientY, node.id);
      });

      li.appendChild(row);
    }

    // （ルート直下だけ data-bm-depth="0" を付けて、既存の「サイドバー全体ドロップ」のロジックをそのまま使う）
    row.dataset.bmId = String(node.id);
    if (depth === 0) {
      row.dataset.bmDepth = "0";
    } else {
      // 深い階層はサイドバー境界判定から除外したいので消しておく
      if ("bmDepth" in row.dataset) {
        delete row.dataset.bmDepth;
      }
    }
    if (typeof setupBookmarkRowDnD === "function") {
      setupBookmarkRowDnD(row, node.id);
    }

    // li をリストに追加
    ul.appendChild(li);
  });

  return ul;
}

// --- 左サイドバーのタブ並び替え用ドラッグ状態 ---
let sidebarDraggingTabId = null;
let sidebarDragOverItem = null;

function clearSidebarDragIndicator() {
  if (!sidebarDragOverItem) return;
  sidebarDragOverItem.style.borderTop = "";
  sidebarDragOverItem.style.borderBottom = "";
  sidebarDragOverItem.removeAttribute("data-drop-pos");
  sidebarDragOverItem = null;
}

/**
 * 左タブのドラッグ＆ドロップ設定を行う。
 * @param {HTMLElement} item ドラッグ対象のタブ要素。
 * @param {object} tab タブのデータオブジェクト。
 */
function setupSidebarTabDragHandlers(item, tab) {
  // タブ自体をドラッグ可能に
  item.draggable = true;

  item.addEventListener("dragstart", (e) => {
    // × ボタンからのドラッグは無効
    if (e.target && e.target.closest(".tab-close-btn")) {
      e.preventDefault();
      return;
    }

    sidebarDraggingTabId = tab.id;

    const dt = e.dataTransfer;
    if (dt) {
      dt.effectAllowed = "move";
      dt.setData("text/plain", String(tab.id));
    }
  });

  item.addEventListener("dragend", () => {
    sidebarDraggingTabId = null;
    clearSidebarDragIndicator();
  });

  item.addEventListener("dragover", (e) => {
    if (sidebarDraggingTabId == null) return;
    if (sidebarDraggingTabId === tab.id) return;

    e.preventDefault(); // drop を許可

    const rect = item.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;

    clearSidebarDragIndicator();
    sidebarDragOverItem = item;

    // 上に入るか下に入るかで境界線だけ出す
    item.style.borderTop = before ? "2px solid rgba(255,255,255,0.9)" : "";
    item.style.borderBottom = !before
      ? "2px solid rgba(255,255,255,0.9)"
      : "";
    item.dataset.dropPos = before ? "before" : "after";
  });

  item.addEventListener("dragleave", (e) => {
    // 子要素に移っただけなら消さない
    if (e.relatedTarget && item.contains(e.relatedTarget)) return;
    clearSidebarDragIndicator();
  });

  item.addEventListener("drop", (e) => {
    if (sidebarDraggingTabId == null) return;
    if (sidebarDraggingTabId === tab.id) {
      clearSidebarDragIndicator();
      return;
    }

    e.preventDefault();

    const fromId = sidebarDraggingTabId;
    const fromIndex = tabs.findIndex((t) => t.id === fromId);
    const toIndex = tabs.findIndex((t) => t.id === tab.id);
    if (fromIndex === -1 || toIndex === -1) {
      clearSidebarDragIndicator();
      sidebarDraggingTabId = null;
      return;
    }

    const rect = item.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;

    let insertIndex = before ? toIndex : toIndex + 1;

    // いったん取り出す
    const [moved] = tabs.splice(fromIndex, 1);

    // 取り出した分 index がずれるので補正
    if (insertIndex > fromIndex) insertIndex--;

    tabs.splice(insertIndex, 0, moved);

    sidebarDraggingTabId = null;
    clearSidebarDragIndicator();

    // 並び替えを反映
    renderTabs();
    saveTabsState();
  });
}

let sidebarListDnDInitialized = false;

// --- サイドバー全体（タブの外の空白部分も含む）でのドラッグ受付 ---
let sidebarContainerDnDInitialized = false;

function setupSidebarContainerDnD() {
  if (!sidebar || sidebarContainerDnDInitialized) return;
  sidebarContainerDnDInitialized = true;

  sidebar.addEventListener("dragover", (e) => {
    // ==== タブ並び替え中 ====
    if (sidebarDraggingTabId != null) {
      const items = Array.from(tabListEl.querySelectorAll(".tab-item"));
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      const y = e.clientY;
      const firstRect = first.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();

      clearSidebarDragIndicator();

      // 一番上より上 → 先頭
      if (y < firstRect.top) {
        e.preventDefault();
        sidebarDragOverItem = first;
        first.style.borderTop = "2px solid rgba(255,255,255,0.9)";
        first.dataset.dropPos = "before";
        return;
      }

      // 一番下より下 → 末尾
      if (y > lastRect.bottom) {
        e.preventDefault();
        sidebarDragOverItem = last;
        last.style.borderBottom = "2px solid rgba(255,255,255,0.9)";
        last.dataset.dropPos = "after";
        return;
      }

      // その間は各 tab-item の dragover が処理
      return;
    }

    // ==== ブックマーク並び替え中 ====
    if (!bookmarkModeVisible || !bookmarkModePane || !draggingBookmarkId)
      return;

    const rows = Array.from(
      bookmarkModePane.querySelectorAll(
        ".bookmark-tree-row[data-bm-depth='0']"
      )
    );
    if (rows.length === 0) return;

    const first = rows[0];
    const last = rows[rows.length - 1];

    const y = e.clientY;
    const firstRect = first.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();

    clearBookmarkDragIndicator();

    // 一番上より上 → 先頭に入れるガイド
    if (y < firstRect.top) {
      e.preventDefault();
      bookmarkDragOverRow = first;
      first.style.borderTop = "2px solid rgba(255,255,255,0.9)";
      first.dataset.bmDropPos = "before";
      return;
    }

    // 一番下より下 → 末尾に入れるガイド
    if (y > lastRect.bottom) {
      e.preventDefault();
      bookmarkDragOverRow = last;
      last.style.borderBottom = "2px solid rgba(255,255,255,0.9)";
      last.dataset.bmDropPos = "after";
      return;
    }
    // その間は各 bookmark-row の dragover が処理
  });

  sidebar.addEventListener("drop", (e) => {
    // ==== タブ並び替え完了 ====
    if (sidebarDraggingTabId != null) {
      const items = Array.from(tabListEl.querySelectorAll(".tab-item"));
      if (items.length === 0) {
        sidebarDraggingTabId = null;
        clearSidebarDragIndicator();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];

      const y = e.clientY;
      const firstRect = first.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();

      let fromId = sidebarDraggingTabId;
      let fromIndex = tabs.findIndex((t) => t.id === fromId);
      if (fromIndex === -1) {
        sidebarDraggingTabId = null;
        clearSidebarDragIndicator();
        return;
      }

      let insertIndex = null;

      if (y < firstRect.top) {
        insertIndex = 0;
      } else if (y > lastRect.bottom) {
        insertIndex = tabs.length;
      } else {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const [moved] = tabs.splice(fromIndex, 1);
      if (insertIndex > fromIndex) insertIndex--;
      tabs.splice(insertIndex, 0, moved);

      sidebarDraggingTabId = null;
      clearSidebarDragIndicator();

      renderTabs();
      saveTabsState();
      return;
    }

    // ==== ブックマーク並び替え完了 ====
    if (!bookmarkModeVisible || !draggingBookmarkId) return;

    const rows = Array.from(
      bookmarkModePane.querySelectorAll(
        ".bookmark-tree-row[data-bm-depth='0']"
      )
    );
    if (rows.length === 0) {
      draggingBookmarkId = null;
      clearBookmarkDragIndicator();
      return;
    }

    const first = rows[0];
    const last = rows[rows.length - 1];

    const y = e.clientY;
    const firstRect = first.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();

    const children =
      bookmarkTree && Array.isArray(bookmarkTree.children)
        ? bookmarkTree.children
        : null;
    if (!children) {
      draggingBookmarkId = null;
      clearBookmarkDragIndicator();
      return;
    }

    let insertIndex = null;

    // サイドバー内で「一番上より上」→ 先頭
    if (y < firstRect.top) {
      insertIndex = 0;
    }
    // 「一番下より下」→ 末尾
    else if (y > lastRect.bottom) {
      insertIndex = children.length;
    } else {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    moveRootBookmarkToIndex(draggingBookmarkId, insertIndex);

    draggingBookmarkId = null;
    clearBookmarkDragIndicator();

    renderBookmarkTreePane();
    renderBookmarkBar();
    syncBookmarkStar();
  });
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
    const pid =
      tab.profileId && profileColors[tab.profileId] ? tab.profileId : 1;
    dot.style.backgroundColor = profileColors[pid];

    const textBox = document.createElement("div");
    textBox.className = "tab-item-text";

    const titleSpan = document.createElement("span");
    titleSpan.className = "tab-item-title";
    titleSpan.textContent = tab.title;

    const urlSpan = document.createElement("span");
    urlSpan.className = "tab-item-url";
    urlSpan.textContent = tab.url || "";

    textBox.appendChild(titleSpan);
    textBox.appendChild(urlSpan);

    left.appendChild(dot);
    left.appendChild(textBox);

    const rightBox = document.createElement("div");
    rightBox.style.display = "flex";
    rightBox.style.alignItems = "center";
    rightBox.style.gap = "4px";

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close-btn";
    closeBtn.textContent = "×";
    // × ボタン自体はドラッグ対象にしない
    closeBtn.draggable = false;
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    };

    rightBox.appendChild(closeBtn);

    item.appendChild(left);
    item.appendChild(rightBox);

    // 並び替え用ドラッグイベントを設定
    setupSidebarTabDragHandlers(item, tab);

    // SplitView 用のドラッグ開始（既存処理）はそのまま保持
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

      // SplitView から通常表示に戻る処理はヘルパーにまとめる
      exitSplitViewPreserveLayout();

      // ボタンの見た目も更新
      updateSplitViewButtonStyle();

      // 通常タブとして表示
      setActiveTab(tab.id);
    };

    tabListEl.appendChild(item);
  });
  setupSidebarContainerDnD();
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

  function handleNavigation(url) {
    if (shouldIgnoreNavigationUrl(url)) return;

    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // 戻る／進むなど、履歴移動で発生したナビゲーションは履歴を追加しない
    if (tab._suppressNextHistory) {
      tab._suppressNextHistory = false;
      tab.url = url;
      tab.title = deriveTitleFromUrl(url);
      if (tab.id === currentTabId) syncUrlAndBookmarkUI();
      renderTabs();
      saveTabsState();
      return;
    }

    // 通常ナビゲーション → 履歴に積む
    addHistoryEntry(tab, url);

    tab.url = url;
    tab.title = deriveTitleFromUrl(url);
    if (tab.id === currentTabId) syncUrlAndBookmarkUI();
    renderTabs();
    saveTabsState();
  }

  wv.addEventListener("did-navigate", (e) => {
    handleNavigation(e.url);
  });

  wv.addEventListener("did-navigate-in-page", (e) => {
    handleNavigation(e.url);
  });

  wv.addEventListener("found-in-page", (e) => {
    updateFindCount(e.result);
  });

  // webview 内で右クリックされたとき
  wv.addEventListener("context-menu", (e) => {
    try {
      // プロファイルメニュー表示中は閉じるだけ
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
  if (!tab) return null;

  const wv = document.createElement("webview");
  const wid = "wv-" + nextWebviewId++;
  wv.id = wid;

  // SplitView 検索のために必要
  wv.dataset.tabId = tab.id;

  // プロファイルIDが入ってなければ起動プロファイル番号で補う
  if (!tab.profileId) {
    tab.profileId = DEFAULT_TAB_PROFILE_NO;
  }
  const profileId = tab.profileId || DEFAULT_TAB_PROFILE_NO;

  let partitionSuffix = `profile-${profileId}`;
  if (STARTUP_PROFILE_ID !== `profile-${profileId}`) {
    partitionSuffix = `${STARTUP_PROFILE_ID}-profile-${profileId}`;
  }

  wv.setAttribute("partition", `persist:${partitionSuffix}`);
 
  wv.setAttribute("allowpopups", "");
/*
  // ポップアップ制御：設定フラグに連動させる
  try {
    if (generalSettingsFlags && generalSettingsFlags.enablePopups) {
      // ポップアップ許可
      wv.setAttribute("allowpopups", "");
    } else {
      // ポップアップ禁止 → allowpopups は付けない
      // （Electron の仕様上、属性が無い＝ポップアップ不可）
    }
  } catch (e) {
    console.error("apply allowpopups failed", e);
  }
*/

  wv.src = tab.url || "https://www.google.com";

  // 最初は非表示（レイアウト計算が終わってから表示）
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

document.getElementById("win-min").onclick = () =>
  window.mindraWindow.control("minimize");
document.getElementById("win-max").onclick = () =>
  window.mindraWindow.control("maximize");
document.getElementById("win-close").onclick = () =>
  window.mindraWindow.control("close");

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

// ホバーモードのときだけ発動
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
  if (titlebarFixedMode) return;
  if (!titlebarVisible) return;
  if (mouseDownInTitlebar) return;
  if (e.clientY > 24) {
    hideTitlebar();
  }
});

window.addEventListener("blur", () => {
  if (titlebarFixedMode) return;
  hideTitlebar();
});

function setActiveTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) return;

  currentTabId = id;

  // SplitView に「すでに入っているタブ」のときだけ activeTabId を更新する
  if (splitCanvasMode && layoutRoot) {
    setActiveGroupForTab(id);
  }

  applyCurrentLayout();
  syncUrlAndBookmarkUI();
  saveTabsState();
}

function switchTab(id) {
  setActiveTab(id);
}

function createTab(url = "https://www.google.com", activate = true) {
  const id = nextTabId++;
  const uid = generateTabUid();
  const title = deriveTitleFromUrl(url);
  const tab = {
    id,
    uid,
    url,
    title,
    profileId: DEFAULT_TAB_PROFILE_NO,
    webviewId: null,
    historyEntries: [],
    historyIndex: -1,
    _suppressNextHistory: false,
  };
  // 初期URLを履歴に追加
  addHistoryEntry(tab, url);

  tabs.unshift(tab);

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

  closedTabs.push({
    url: tab.url,
    title: tab.title,
    profileId: tab.profileId,
  });
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
  const uid = generateTabUid();

  const url = last.url || "https://www.google.com";
  const title = last.title || deriveTitleFromUrl(url);

  const tab = {
    id,
    uid,
    url,
    title,
    profileId: last.profileId || DEFAULT_TAB_PROFILE_NO,
    webviewId: null,
    historyEntries: [],
    historyIndex: -1,
    _suppressNextHistory: false,
  };
  addHistoryEntry(tab, url);

  tabs.push(tab);
  setActiveTab(id);
  saveTabsState();
}

// URL欄 Enter でナビゲーション
sidebarUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const resolved = resolveUrlOrSearch(sidebarUrlInput.value);
    if (!resolved) return;

    const tab = getActiveTab();
    if (tab) {
      // URL入力 → webview に投げて、実際の履歴追加は did-navigate 側で行う
      const wv = getWebviewForTab(tab);
      if (wv) {
        try {
          wv.src = resolved;
        } catch (err) {
          console.error("set webview src error", err);
        }
      }
      // 入力欄はそのまま（ナビ後に did-navigate で同期）
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

    // ☆ボタンも消す
    if (sidebarBookmarkBtn) {
      sidebarBookmarkBtn.style.visibility = "hidden";
      sidebarBookmarkBtn.disabled = true;
    }
  } else {
    // 通常モード → 入力可能
    sidebarUrlInput.disabled = false;
    sidebarUrlInput.placeholder = "URL を入力 / 検索";
    sidebarUrlInput.style.background = "#ffffff";

    const activeTab = tabs.find((t) => t.id === currentTabId);
    sidebarUrlInput.value = activeTab && activeTab.url ? activeTab.url : "";

    // ☆ボタンを表示＆状態同期
    if (sidebarBookmarkBtn) {
      sidebarBookmarkBtn.style.visibility = "visible";
      sidebarBookmarkBtn.disabled = false;
      syncBookmarkStar();
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

// ----- 戻る／進む（履歴スタック優先） -----

function goBack(targetTabId = null) {
  const tabId = targetTabId != null ? targetTabId : currentTabId;
  const tab = tabs.find((t) => t.id === tabId);

  if (tab) {
    ensureTabHistoryFields(tab);
    if (tab.historyIndex > 0) {
      const newIndex = tab.historyIndex - 1;
      const entry = tab.historyEntries[newIndex];
      if (entry && entry.url) {
        const wv = getWebviewForTab(tab);
        if (wv) {
          tab.historyIndex = newIndex;
          tab.url = entry.url;
          tab.title = entry.title || deriveTitleFromUrl(entry.url);
          tab._suppressNextHistory = true;
          try {
            wv.src = entry.url;
          } catch {}

          if (tab.id === currentTabId) syncUrlAndBookmarkUI();
          renderTabs();
          saveTabsState();
          return;
        }
      }
    }
  }

  // 履歴スタックで動かせなかったときは webview の標準履歴にフォールバック
  const wv =
    targetTabId != null ? getWebviewByTabId(targetTabId) : getActiveWebview();
  try {
    if (wv && wv.canGoBack && wv.canGoBack()) {
      wv.goBack();
    }
  } catch {}
}

function goForward(targetTabId = null) {
  const tabId = targetTabId != null ? targetTabId : currentTabId;
  const tab = tabs.find((t) => t.id === tabId);

  if (tab) {
    ensureTabHistoryFields(tab);
    if (
      tab.historyIndex >= 0 &&
      tab.historyIndex < tab.historyEntries.length - 1
    ) {
      const newIndex = tab.historyIndex + 1;
      const entry = tab.historyEntries[newIndex];
      if (entry && entry.url) {
        const wv = getWebviewForTab(tab);
        if (wv) {
          tab.historyIndex = newIndex;
          tab.url = entry.url;
          tab.title = entry.title || deriveTitleFromUrl(entry.url);
          tab._suppressNextHistory = true;
          try {
            wv.src = entry.url;
          } catch {}

          if (tab.id === currentTabId) syncUrlAndBookmarkUI();
          renderTabs();
          saveTabsState();
          return;
        }
      }
    }
  }

  // 履歴スタックに進む先がなければ webview 標準にフォールバック
  const wv =
    targetTabId != null ? getWebviewByTabId(targetTabId) : getActiveWebview();
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
    document.documentElement.requestFullscreen &&
      document.documentElement.requestFullscreen();
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
// ブックマーク用ターゲット
let bookmarkContextTargetId = null;

function ensureContentMenu() {
  if (contentMenu) return;

  contentMenu = document.createElement("div");
  contentMenu.id = "content-menu";
  contentMenu.className = "content-menu";

  document.body.appendChild(contentMenu);

  document.addEventListener("mousedown", (e) => {
    if (!contentMenu || contentMenu.style.display === "none") return;
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
  item.className = "content-menu-item";

  item.addEventListener("click", (e) => {
    e.stopPropagation();
    hideContentMenu();
    if (handler) handler();
  });

  contentMenu.appendChild(item);
}

function showBookmarkContextMenu(x, y, nodeId = null) {
  ensureContentMenu();
  contentMenu.innerHTML = "";

  bookmarkContextTargetId = nodeId || null;

  if (nodeId) {
    const node =
      bookmarkTree && bookmarkContextTargetId
        ? findBookmarkNodeById(bookmarkTree, bookmarkContextTargetId)
        : null;

    // アイテムなら「新しいタブで開く」
    if (node && node.type === "item" && node.url) {
      addContentMenuItem("新しいタブで開く", () => {
        const resolved = resolveUrlOrSearch(node.url);
        if (!resolved) return;
        createTab(resolved, true);
      });
    }

    // 共通：編集
    addContentMenuItem("編集", () => {
      editBookmarkNodeById(nodeId);
      renderBookmarkTreePane();
      renderBookmarkBar();
      syncBookmarkStar();
    });

    // 共通：削除
    addContentMenuItem("削除", () => {
      if (!window.confirm("このブックマークを削除しますか？")) return;
      removeBookmarkNodeById(nodeId);
      renderBookmarkTreePane();
      renderBookmarkBar();
      syncBookmarkStar();
    });

    // 同じ階層にフォルダ追加
    addContentMenuItem("フォルダを追加", () => {
      createSiblingBookmarkFolder(nodeId);
      renderBookmarkTreePane();
    });
  } else {
    // 空き領域 → ルート直下にフォルダ追加
    addContentMenuItem("フォルダを追加", () => {
      createRootBookmarkFolder();
      renderBookmarkTreePane();
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
}

function performTabHistory(tabId, direction) {
  if (tabId == null) return;

  if (direction === "back") {
    goBack(tabId);
  } else {
    goForward(tabId);
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
    addContentMenuItem("再読み込み", () => {
      reload(true);
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
    addContentMenuItem("再読み込み", () => {
      reload(true);
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
  //  プロファイルメニューが開いているときは、
  //  どこを右クリックしても「閉じるだけ」にする
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
        // SplitView中なら抜けてレイアウト保持
        exitSplitViewPreserveLayout();
        updateSplitViewButtonStyle();
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
  rightSidebarOpen = true;
  titlebarFixedMode = true;

  // サイドバーを見た目上も「開いた状態」に
  if (sidebar) {
    sidebar.classList.add("sidebar-open");
  }

  // タイトルバー固定モードなので、最初から表示しておく
  if (titlebar) {
    titlebar.classList.add("visible");
    titlebarVisible = true;
  }

  createTab("https://www.google.com", true);
}

// 起動直後にボタンの色とURL入力状態を反映
updateSidebarModeButtonStyle();
updateTitlebarModeButtonStyle();
updateSplitViewButtonStyle();
updateSidebarUrlInputEnabled();
updateBookmarkModeButtonStyle();
applyBookmarkModeLayout();

// 起動時にブックマークをロード＆表示
loadBookmarks();
renderBookmarkBar();
syncUrlAndBookmarkUI();

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

// 設定画面の初期化
if (window.MindraSettings && settingsRoot) {
  window.MindraSettings.initSettingsUI(settingsRoot, {
    onSettingsChanged: applySettingsFromSettingsModule,
  });

  // 起動時に一回だけ設定を反映（テーマなど）
  const current =
    window.MindraSettings.getSettings && window.MindraSettings.getSettings();
  if (current) {
    applySettingsFromSettingsModule(current);
  }
}

// ===== SplitView の全 WebView を取得 =====
window.getSplitWebviews = function () {
  const result = [];

  // layoutRoot はアプリ全体のレイアウトツリー
  if (!window.layoutRoot) {
    console.warn("layoutRoot が見つかりません");
    return result;
  }

  function walk(node) {
    if (!node) return;

    // タブを表示するノード
    if (node.type === "tab" && node.tabId) {
      const wv = document.querySelector(
        `webview[data-tab-id="${node.tabId}"]`
      );
      if (wv) result.push(wv);
    }

    // SplitView（左右）
    if (node.type === "split") {
      walk(node.left);
      walk(node.right);
    }
  }

  walk(window.layoutRoot);

  return result;
};

// =========================================================
// フォーカス＆ショートカット修復パッチ
// =========================================================

// webview が blur したら即座に focus を戻す
document.addEventListener('DOMContentLoaded', () => {
  const webviews = document.querySelectorAll('webview');
  webviews.forEach(wv => {
    wv.addEventListener('blur', () => {
      setTimeout(() => {
        const activeEl = document.activeElement;
        const tag = activeEl && activeEl.tagName;
        const interactiveTags = ["INPUT", "TEXTAREA", "BUTTON", "SELECT", "OPTION"];

        // 右サイドバーの入力欄など、ユーザーが意図的にフォーカスした要素があれば奪わない
        if (
          activeEl &&
          activeEl !== wv &&
          (interactiveTags.includes(tag) || activeEl.isContentEditable)
        ) {
          return;
        }

        try { wv.focus(); } catch (e) {}
      }, 0);
    });
  });
});

// window がキーを受け取ったが webview がフォーカスされてない時 → 転送
/*
window.addEventListener('keydown', (e) => {
  const activeWV =
    document.querySelector('webview.active') ||
    document.querySelector('webview[style*="visibility: visible"]') ||
    document.querySelector('webview:last-of-type');
  if (!activeWV) return;

  // Ctrl/Shift/Alt の修飾キー状態を渡す
  const modifiers = [];
  if (e.ctrlKey) modifiers.push('ctrl');
  if (e.shiftKey) modifiers.push('shift');
  if (e.altKey) modifiers.push('alt');

  try {
    activeWV.sendInputEvent({
      type: 'keyDown',
      keyCode: e.key,
      modifiers
    });
  } catch (_) {}
});
*/