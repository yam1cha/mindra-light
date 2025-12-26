// SplitView / レイアウト用の状態・ドラッグ・レイアウト計算まとめ

// ======================
// 状態
// ======================

// SplitView 用レイアウト矩形のキャッシュ
let lastRectList = [];

// レイアウトツリーのルート
// node = { type:"group", tabs:number[], activeTabId:number }
//      | { type:"split", direction:"vertical"|"horizontal", ratio:number, first:node, second:node }
let layoutRoot = null;

// SplitView モード状態
let splitCanvasMode = false;
let splitEmpty = false;
let splitLastTabId = null;

// SplitView のタブ配置（青ゾーン）状態
const placementState = {
  active: false,
  tabId: null,
  direction: null,
};

// タブドラッグ状態
const tabDragState = {
  downTabId: null,
  downItemEl: null,
  candidateTabId: null,
  dragging: false,
  startX: 0,
  startY: 0,
  hoverZone: null,
  blockClickOnce: false,
  ghostEl: null,
  offsetX: 0,
  offsetY: 0,
};

// SplitView 用の divider ドラッグ状態
let splitDividerEl = null;
let splitDragging = false;


// ======================
// オーバーレイ制御
// ======================

/**
 * split-overlay の表示 / 非表示を切り替える。
 * @param {boolean} active オーバーレイを表示する場合は true。
 */
function setSplitOverlayActive(active) {
  if (!window.splitOverlayEl) return;

  if (active) {
    splitOverlayEl.classList.add("active");
  } else {
    splitOverlayEl.classList.remove("active");
    if (window.splitOverlayIndicator) {
      splitOverlayIndicator.classList.remove("visible");
    }
  }

  // オーバーレイ中は webview を一旦消す
  document.querySelectorAll("webview").forEach((wv) => {
    if (active) {
      wv.dataset._prevDisplay = wv.style.display || "";
      wv.style.display = "none";
    } else {
      wv.style.display = wv.dataset._prevDisplay || "";
    }
  });
}

/**
 * 「コンテンツ領域」（タイトルバー＆サイドバーを除いた部分）を計算する。
 * @returns {{rootRect: DOMRectReadOnly, offsetX: number, offsetY: number, width: number, height: number}} 表示領域情報。
 */
function computeContentViewport() {
  // ここで毎回 root 要素を取りに行く
  const rootEl = document.getElementById("root");
  if (!rootEl) {
    // 念のためのフォールバック（何も描画できないけど落ちはしない）
    const dummyRect = { left: 0, top: 0, width: 0, height: 0 };
    return {
      rootRect: dummyRect,
      offsetX: 0,
      offsetY: 0,
      width: 0,
      height: 0,
    };
  }

  const rootRect = rootEl.getBoundingClientRect();

  let totalWidth = rootRect.width;
  let totalHeight = rootRect.height;
  let offsetX = 0;
  let offsetY = 0;

  // タイトルバー固定モードなら、その高さ分だけ上から押し出す
  const tb = document.getElementById("window-titlebar");
  const isTitlebarFixed =
    typeof titlebarFixedMode !== "undefined" && titlebarFixedMode;
  if (isTitlebarFixed && tb) {
    const tbRect = tb.getBoundingClientRect();
    const tbHeight = tbRect.height || 32;
    offsetY = tbHeight;
    totalHeight = Math.max(0, totalHeight - tbHeight);
  }

  // 左サイドバー（押し出しモード）は横に食い込ませる
  if (sidebarOpen && sidebarShrinkMode && sidebar) {
    const sbRect = sidebar.getBoundingClientRect();
    const leftWidth = sbRect.width || sidebar.offsetWidth || 0;
    if (leftWidth > 0 && leftWidth < totalWidth) {
      offsetX = leftWidth;
      totalWidth -= leftWidth;
    }
  }

  // 右 AI サイドバー
  if (rightSidebarOpen) {
    const sidebarWidth = RIGHT_SIDEBAR_WIDTH;
    if (sidebarWidth > 0 && sidebarWidth < totalWidth) {
      totalWidth = Math.max(0, totalWidth - sidebarWidth);
    }
  }

  return {
    rootRect,
    offsetX,
    offsetY,
    width: totalWidth,
    height: totalHeight,
  };
}

/**
 * 現在の layoutRoot から leaf group の絶対座標リストを計算する（SplitView オーバーレイ用）。
 * @returns {Array<{x: number, y: number, w: number, h: number, group: object}>} 描画用の矩形リスト。
 */
function computeLayoutLeafRectsForSplit() {
  if (!splitCanvasMode || !layoutRoot) return [];

  const vp = computeContentViewport();
  const contentLeft = vp.rootRect.left + vp.offsetX;
  const contentTop = vp.rootRect.top + vp.offsetY;
  const contentWidth = vp.width;
  const contentHeight = vp.height;

  const rects = [];

  function walk(node, x, y, w, h) {
    if (!node) return;
    if (node.type === "group") {
      const tabId = node.activeTabId || (node.tabs && node.tabs[0]);
      if (tabId != null) {
        rects.push({
          tabId,
          node,
          left: x,
          top: y,
          width: w,
          height: h,
          right: x + w,
          bottom: y + h,
        });
      }
      return;
    }
    if (node.type === "split") {
      const ratio = Math.min(0.9, Math.max(0.1, node.ratio || 0.5));
      if (node.direction === "horizontal") {
        const h1 = Math.round(h * ratio);
        const h2 = h - h1;
        walk(node.first, x, y, w, h1);
        walk(node.second, x, y + h1, w, h2);
      } else {
        const w1 = Math.round(w * ratio);
        const w2 = w - w1;
        walk(node.first, x, y, w1, h);
        walk(node.second, x + w1, y, w2, h);
      }
    }
  }

  walk(layoutRoot, contentLeft, contentTop, contentWidth, contentHeight);
  return rects;
}

function findLeafRectAtPosition(rects, clientX, clientY) {
  for (const r of rects) {
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return r;
    }
  }
  return null;
}

/**
 * 青ゾーン矩形の更新を行い、オーバーレイに反映する。
 * @param {"left"|"right"|"top"|"bottom"|null} dir 分割方向。
 * @param {number} clientX クライアント座標 X。
 * @param {number} clientY クライアント座標 Y。
 */
function updateSplitOverlayIndicator(dir, clientX, clientY) {
  if (!window.splitOverlayEl || !window.splitOverlayIndicator) return;

  const vp = computeContentViewport();
  const rootRect = vp.rootRect;
  const contentLeft = rootRect.left + vp.offsetX;
  const contentTop = rootRect.top + vp.offsetY;
  const contentWidth = vp.width;
  const contentHeight = vp.height;

  if (contentWidth <= 0 || contentHeight <= 0) {
    splitOverlayIndicator.classList.remove("visible");
    return;
  }

  const overlayRect = splitOverlayEl.getBoundingClientRect();

  if (!splitCanvasMode || !placementState.active) {
    splitOverlayIndicator.classList.remove("visible");
    return;
  }

  // layoutRoot がまだ無い = 1個目 → 全画面
  if (!layoutRoot) {
    splitOverlayEl.classList.add("active");
    splitOverlayIndicator.classList.add("visible");

    const dx = contentLeft - overlayRect.left;
    const dy = contentTop - overlayRect.top;

    splitOverlayIndicator.style.left = dx + "px";
    splitOverlayIndicator.style.top = dy + "px";
    splitOverlayIndicator.style.width = contentWidth + "px";
    splitOverlayIndicator.style.height = contentHeight + "px";
    return;
  }

  if (!dir) {
    splitOverlayIndicator.classList.remove("visible");
    return;
  }

  // "full" は常にコンテンツ全面
  if (dir === "full") {
    splitOverlayIndicator.style.left = contentLeft - overlayRect.left + "px";
    splitOverlayIndicator.style.top = contentTop - overlayRect.top + "px";
    splitOverlayIndicator.style.width = contentWidth + "px";
    splitOverlayIndicator.style.height = contentHeight + "px";
    splitOverlayIndicator.classList.add("visible");
    return;
  }

  let zoneLeft = contentLeft;
  let zoneTop = contentTop;
  let zoneWidth = contentWidth;
  let zoneHeight = contentHeight;

  const isLeftRight = dir === "left" || dir === "right";
  const isTopBottom = dir === "top" || dir === "bottom";

  // まずマウス位置の leaf（group）を探す
  let targetRect = null;
  if (clientX != null && clientY != null) {
    const rects = computeLayoutLeafRectsForSplit();
    if (rects.length) {
      targetRect = findLeafRectAtPosition(rects, clientX, clientY);
    }
  }

  if (targetRect) {
    // 「マウス位置のタブ」の矩形の半分に青ビュー
    if (isLeftRight) {
      const halfW = targetRect.width / 2;
      zoneWidth = halfW;
      zoneHeight = targetRect.height;
      zoneLeft =
        dir === "left"
          ? targetRect.left
          : targetRect.left + targetRect.width - halfW;
      zoneTop = targetRect.top;
    } else if (isTopBottom) {
      const halfH = targetRect.height / 2;
      zoneWidth = targetRect.width;
      zoneHeight = halfH;
      zoneLeft = targetRect.left;
      zoneTop =
        dir === "top"
          ? targetRect.top
          : targetRect.top + targetRect.height - halfH;
    }
  } else {
    // leaf 上にいないときは、純縦/純横レイアウトを使って等分 or コンテンツ半分
    const pureV = countPureVerticalGroups(layoutRoot);
    const pureH = countPureHorizontalGroups(layoutRoot);

    if (isLeftRight && pureV != null) {
      const totalCols = pureV + 1;
      const colWidth = contentWidth / totalCols;
      zoneWidth = colWidth;
      zoneHeight = contentHeight;
      zoneLeft = dir === "left"
        ? contentLeft
        : contentLeft + colWidth * (totalCols - 1);
    } else if (isTopBottom && pureH != null) {
      const totalRows = pureH + 1;
      const rowHeight = contentHeight / totalRows;
      zoneWidth = contentWidth;
      zoneHeight = rowHeight;
      zoneTop = dir === "top"
        ? contentTop
        : contentTop + rowHeight * (totalRows - 1);
    } else {
      // それ以外 → コンテンツ全体の半分
      if (isLeftRight) {
        const halfW = contentWidth / 2;
        zoneWidth = halfW;
        zoneHeight = contentHeight;
        zoneLeft = dir === "left" ? contentLeft : contentLeft + halfW;
        zoneTop = contentTop;
      } else if (isTopBottom) {
        const halfH = contentHeight / 2;
        zoneWidth = contentWidth;
        zoneHeight = halfH;
        zoneLeft = contentLeft;
        zoneTop = dir === "top" ? contentTop : contentTop + halfH;
      }
    }
  }

  splitOverlayEl.classList.add("active");
  splitOverlayIndicator.classList.add("visible");
  splitOverlayIndicator.style.left = zoneLeft - overlayRect.left + "px";
  splitOverlayIndicator.style.top = zoneTop - overlayRect.top + "px";
  splitOverlayIndicator.style.width = zoneWidth + "px";
  splitOverlayIndicator.style.height = zoneHeight + "px";
}

// ======================
// レイアウトツリー操作
// ======================

function isTabInLayout(tabId) {
  if (!layoutRoot) return false;
  let found = false;
  (function walk(node) {
    if (!node || found) return;
    if (node.type === "group") {
      if (node.tabs && node.tabs.includes(tabId)) {
        found = true;
      }
    } else if (node.type === "split") {
      walk(node.first);
      walk(node.second);
    }
  })(layoutRoot);
  return found;
}

function findFirstGroupNode(node) {
  if (!node) return null;
  if (node.type === "group") return node;
  if (node.type === "split") {
    return findFirstGroupNode(node.first) || findFirstGroupNode(node.second);
  }
  return null;
}

function ensureLayoutRootForTab(tabId) {
  const tabExists = tabs.some((t) => t.id === tabId);
  if (!tabExists) return;
  if (!layoutRoot) {
    layoutRoot = {
      type: "group",
      tabs: [tabId],
      activeTabId: tabId,
    };
    return;
  }
  if (!isTabInLayout(tabId)) {
    const g = findFirstGroupNode(layoutRoot);
    if (g) {
      g.tabs.push(tabId);
      if (!g.activeTabId) {
        g.activeTabId = tabId;
      }
    }
  }
}

function setActiveGroupForTab(tabId) {
  if (!layoutRoot) return;
  (function walk(node) {
    if (!node) return false;
    if (node.type === "group") {
      if (node.tabs && node.tabs.includes(tabId)) {
        node.activeTabId = tabId;
        return true;
      }
      return false;
    } else if (node.type === "split") {
      return walk(node.first) || walk(node.second);
    }
    return false;
  })(layoutRoot);
}

function removeTabFromLayout(tabId) {
  function helper(node) {
    if (!node) return null;
    if (node.type === "group") {
      const newTabs = (node.tabs || []).filter((id) => id !== tabId);
      if (newTabs.length === 0) {
        return null;
      }
      node.tabs = newTabs;
      if (node.activeTabId === tabId) {
        node.activeTabId = newTabs[0];
      }
      return node;
    } else if (node.type === "split") {
      node.first = helper(node.first);
      node.second = helper(node.second);
      if (!node.first && !node.second) return null;
      if (!node.first) return node.second;
      if (!node.second) return node.first;
      return node;
    }
    return node;
  }
  layoutRoot = helper(layoutRoot);
}

/**
 * 純縦レイアウトの leaf 数を数える。
 * @param {object|null} node レイアウトノード。
 * @returns {number} leaf 数。
 */
function countPureVerticalGroups(node) {
  if (!node) return null;
  if (node.type === "group") return 1;
  if (node.type === "split") {
    if (node.direction !== "vertical") return null;
    const a = countPureVerticalGroups(node.first);
    const b = countPureVerticalGroups(node.second);
    if (a == null || b == null) return null;
    return a + b;
  }
  return null;
}

/**
 * 純縦の leaf group を左→右に並べた配列で取得する。
 * @param {object|null} node レイアウトノード。
 * @returns {Array<object>} leaf group 配列。
 */
function collectVerticalGroups(node) {
  if (!node) return null;
  if (node.type === "group") return [node];
  if (node.type === "split") {
    if (node.direction !== "vertical") return null;
    const left = collectVerticalGroups(node.first);
    if (!left) return null;
    const right = collectVerticalGroups(node.second);
    if (!right) return null;
    return left.concat(right);
  }
  return null;
}

/**
 * group 配列から等分の縦 split ツリーを構築する。
 * @param {Array<object>} groups 縦方向に並べるグループ配列。
 * @returns {object|null} 新しいレイアウトノード。
 */
function buildVerticalSplitFromGroups(groups) {
  if (!groups || groups.length === 0) return null;
  if (groups.length === 1) return groups[0];

  function helper(arr) {
    if (arr.length === 1) return arr[0];

    const total = arr.length;
    const mid = Math.floor(total / 2);
    const leftArr = arr.slice(0, mid);
    const rightArr = arr.slice(mid);

    const leftNode = helper(leftArr);
    const rightNode = helper(rightArr);

    return {
      type: "split",
      direction: "vertical",
      ratio: leftArr.length / total,
      first: leftNode,
      second: rightNode,
    };
  }

  return helper(groups);
}

/**
 * 純横レイアウトの leaf 数を数える。
 * @param {object|null} node レイアウトノード。
 * @returns {number} leaf 数。
 */
function countPureHorizontalGroups(node) {
  if (!node) return null;
  if (node.type === "group") return 1;
  if (node.type === "split") {
    if (node.direction !== "horizontal") return null;
    const a = countPureHorizontalGroups(node.first);
    const b = countPureHorizontalGroups(node.second);
    if (a == null || b == null) return null;
    return a + b;
  }
  return null;
}

/**
 * 純横レイアウトの leaf group を上→下順に配列で取得する。
 * @param {object|null} node レイアウトノード。
 * @returns {Array<object>} leaf group 配列。
 */
function collectHorizontalGroups(node) {
  if (!node) return null;
  if (node.type === "group") return [node];
  if (node.type === "split") {
    if (node.direction !== "horizontal") return null;
    const top = collectHorizontalGroups(node.first);
    if (!top) return null;
    const bottom = collectHorizontalGroups(node.second);
    if (!bottom) return null;
    return top.concat(bottom);
  }
  return null;
}

/**
 * group 配列から等分の横 split ツリーを構築する。
 * @param {Array<object>} groups 横方向に並べるグループ配列。
 * @returns {object|null} 新しいレイアウトノード。
 */
function buildHorizontalSplitFromGroups(groups) {
  if (!groups || groups.length === 0) return null;
  if (groups.length === 1) return groups[0];

  function helper(arr) {
    if (arr.length === 1) return arr[0];

    const total = arr.length;
    const mid = Math.floor(total / 2);
    const topArr = arr.slice(0, mid);
    const bottomArr = arr.slice(mid);

    const topNode = helper(topArr);
    const bottomNode = helper(bottomArr);

    return {
      type: "split",
      direction: "horizontal",
      ratio: topArr.length / total,
      first: topNode,
      second: bottomNode,
    };
  }

  return helper(groups);
}

/**
 * 指定 group を中心にその部分だけ 2 分割する。
 * @param {object} root ルートレイアウトノード。
 * @param {object} targetNode 対象グループノード。
 * @param {"horizontal"|"vertical"} dir 分割方向。
 * @param {object} newGroup 新しく追加するグループ。
 * @returns {object|null} 分割後のルートノード。
 */
function splitLayoutAroundGroup(root, targetNode, dir, newGroup) {
  if (!root || !targetNode) return root;

  if (root === targetNode) {
    if (dir === "left" || dir === "right") {
      if (dir === "left") {
        return {
          type: "split",
          direction: "vertical",
          ratio: 0.5,
          first: newGroup,
          second: targetNode,
        };
      } else {
        return {
          type: "split",
          direction: "vertical",
          ratio: 0.5,
          first: targetNode,
          second: newGroup,
        };
      }
    } else if (dir === "top" || dir === "bottom") {
      if (dir === "top") {
        return {
          type: "split",
          direction: "horizontal",
          ratio: 0.5,
          first: newGroup,
          second: targetNode,
        };
      } else {
        return {
          type: "split",
          direction: "horizontal",
          ratio: 0.5,
          first: targetNode,
          second: newGroup,
        };
      }
    }
    return root;
  }

  if (root.type === "split") {
    const newFirst = splitLayoutAroundGroup(root.first, targetNode, dir, newGroup);
    const newSecond = splitLayoutAroundGroup(root.second, targetNode, dir, newGroup);
    if (newFirst === root.first && newSecond === root.second) {
      return root;
    }
    return {
      type: root.type,
      direction: root.direction,
      ratio: root.ratio,
      first: newFirst,
      second: newSecond,
    };
  }

  return root;
}

/**
 * タブを SplitView レイアウトに追加する。
 * @param {string} tabId 追加するタブ ID。
 * @param {"left"|"right"|"top"|"bottom"} direction 追加方向。
 * @param {number} clientX 追加位置のクライアント座標 X。
 * @param {number} clientY 追加位置のクライアント座標 Y。
 */
function applyLayoutTabAddSplit(tabId, direction, clientX, clientY) {
  const tabExists = tabs.some((t) => t.id === tabId);
  if (!tabExists) return;

  const rawDir = direction || "full";

  // すでにレイアウトのどこかに同じタブがいたら一旦取り除く
  if (isTabInLayout(tabId)) {
    removeTabFromLayout(tabId);
  }

  const newGroup = {
    type: "group",
    tabs: [tabId],
    activeTabId: tabId,
  };

  // 1) SplitView が空（1個目）
  if (!layoutRoot || splitEmpty) {
    layoutRoot = newGroup;
  } else if (rawDir === "full") {
    layoutRoot = newGroup;
  } else {
    const isLeftRight = rawDir === "left" || rawDir === "right";
    const isTopBottom = rawDir === "top" || rawDir === "bottom";

    const pureV = countPureVerticalGroups(layoutRoot);
    const pureH = countPureHorizontalGroups(layoutRoot);

    if (isLeftRight && pureV != null) {
      const groups = collectVerticalGroups(layoutRoot);
      if (rawDir === "left") {
        groups.unshift(newGroup);
      } else {
        groups.push(newGroup);
      }
      layoutRoot = buildVerticalSplitFromGroups(groups);
    } else if (isTopBottom && pureH != null) {
      const groups = collectHorizontalGroups(layoutRoot);
      if (rawDir === "top") {
        groups.unshift(newGroup);
      } else {
        groups.push(newGroup);
      }
      layoutRoot = buildHorizontalSplitFromGroups(groups);
    } else {
      const rects = computeLayoutLeafRectsForSplit();
      let targetNode = null;
      if (rects.length && clientX != null && clientY != null) {
        const hit = findLeafRectAtPosition(rects, clientX, clientY);
        if (hit && hit.node) {
          targetNode = hit.node;
        }
      }

      if (targetNode) {
        layoutRoot = splitLayoutAroundGroup(layoutRoot, targetNode, rawDir, newGroup);
      } else {
        if (isLeftRight) {
          layoutRoot = {
            type: "split",
            direction: "vertical",
            ratio: 0.5,
            first: rawDir === "left" ? newGroup : layoutRoot,
            second: rawDir === "left" ? layoutRoot : newGroup,
          };
        } else if (isTopBottom) {
          layoutRoot = {
            type: "split",
            direction: "horizontal",
            ratio: 0.5,
            first: rawDir === "top" ? newGroup : layoutRoot,
            second: rawDir === "top" ? layoutRoot : newGroup,
          };
        } else {
          layoutRoot = newGroup;
        }
      }
    }
  }

  currentTabId = tabId;
  splitEmpty = false;
  splitLastTabId = tabId;
}

// ======================
// SplitView 状態の保存・復元ヘルパー
// ======================

// localStorage 保存用に split 部分だけシリアライズ
/**
 * layout にはタブの id ではなく uid を保存する。
 * @param {Array<object>} tabs タブ情報配列。
 * @param {string|null} currentTabId アクティブタブ ID。
 * @returns {object} シリアライズ済み SplitView 状態。
 */
function serializeSplitStateForTabs(tabs, currentTabId) {
  const currentIndex = tabs.findIndex((t) => t.id === currentTabId);

  let lastTabIndex = -1;
  if (splitLastTabId != null) {
    const idx = tabs.findIndex((t) => t.id === splitLastTabId);
    if (idx >= 0) lastTabIndex = idx;
  }

  // id -> uid マッピングを準備（uid が無いタブにはここで発行）
  const idToUid = new Map();
  tabs.forEach((t) => {
    if (!t) return;
    if (!t.uid && typeof generateTabUid === "function") {
      t.uid = generateTabUid();
    }
    if (typeof t.id === "number" && t.uid) {
      idToUid.set(t.id, t.uid);
    }
  });

  const convertNodeToUidLayout = (node) => {
    if (!node || typeof node !== "object") return null;
    if (node.type === "group") {
      const ids = Array.isArray(node.tabs) ? node.tabs : [];
      const uids = ids
        .map((id) => idToUid.get(id))
        .filter((uid, index, arr) => !!uid && arr.indexOf(uid) === index);
      if (uids.length === 0) return null;

      let activeUid = null;
      if (node.activeTabId != null) {
        activeUid = idToUid.get(node.activeTabId) || null;
      }
      if (!activeUid) {
        activeUid = uids[0];
      }

      return {
        type: "group",
        tabs: uids,
        // activeTabId フィールドだが、中身は uid を入れて保存する
        activeTabId: activeUid,
      };
    } else if (node.type === "split") {
      const dir =
        node.direction === "horizontal" ? "horizontal" : "vertical";
      const rawRatio =
        typeof node.ratio === "number" && !Number.isNaN(node.ratio)
          ? node.ratio
          : 0.5;
      const ratio = Math.min(Math.max(rawRatio, 0.1), 0.9);
      const first = convertNodeToUidLayout(node.first);
      const second = convertNodeToUidLayout(node.second);
      if (!first && !second) return null;
      if (!first) return second;
      if (!second) return first;
      return {
        type: "split",
        direction: dir,
        ratio,
        first,
        second,
      };
    }
    return null;
  };

  const uidLayout = layoutRoot ? convertNodeToUidLayout(layoutRoot) : null;

  return {
    mode: splitCanvasMode ? 1 : 0,
    empty: splitEmpty ? 1 : 0,
    lastTabIndex,
    layout: uidLayout,
  };
}

/**
 * loadTabsState 前に SplitView 状態を完全リセットする。
 * @returns {void}
 */
function resetSplitStateBeforeLoad() {
  splitCanvasMode = false;
  splitEmpty = false;
  splitLastTabId = null;
  layoutRoot = null;
}

// localStorage から復元した split オブジェクトを元に、SplitView 状態を復元
/**
 * SplitView 状態を保存データから復元する。
 * @param {object|null} splitState 保存済み SplitView 状態。
 * @param {Array<object>} tabs タブ情報配列。
 * @param {string} baseActiveId 復元失敗時に使用するタブ ID。
 * @returns {string} 復元後にアクティブにすべきタブ ID。
 */
function restoreSplitStateFromStored(splitState, tabs, baseActiveId) {
  if (!splitState || typeof splitState !== "object") {
    // なにも復元できない → 通常の active に任せる
    splitCanvasMode = false;
    splitEmpty = false;
    splitLastTabId = null;
    layoutRoot = null;
    return baseActiveId;
  }

  // 空フラグ
  splitEmpty = !!splitState.empty;

  // lastTabIndex から splitLastTabId を復元
  if (
    typeof splitState.lastTabIndex === "number" &&
    splitState.lastTabIndex >= 0 &&
    splitState.lastTabIndex < tabs.length
  ) {
    splitLastTabId = tabs[splitState.lastTabIndex].id;
  } else {
    splitLastTabId = null;
  }

  // layoutRoot を復元（存在しないタブを掃除）
  const sanitizeLayout = (node) => {
  if (!node || typeof node !== "object") return null;
  if (node.type === "group") {
    const uids = Array.isArray(node.tabs) ? node.tabs : [];

    // uid -> id 変換（存在しない uid は捨てる）
    const validIds = [];
    uids.forEach((uid) => {
      const t = tabs.find((tab) => tab && tab.uid === uid);
      if (t && typeof t.id === "number" && !validIds.includes(t.id)) {
        validIds.push(t.id);
      }
    });

    if (validIds.length === 0) return null;

    let activeId = null;
    if (node.activeTabId) {
      const activeTab = tabs.find(
        (tab) => tab && tab.uid === node.activeTabId
      );
      if (activeTab) {
        activeId = activeTab.id;
      }
    }
    if (!activeId) {
      activeId = validIds[0];
    }

    return {
      type: "group",
      tabs: validIds,
      activeTabId: activeId,
    };
  } else if (node.type === "split") {
    const dir =
      node.direction === "horizontal" ? "horizontal" : "vertical";
    const rawRatio =
      typeof node.ratio === "number" && !Number.isNaN(node.ratio)
        ? node.ratio
        : 0.5;
    const ratio = Math.min(Math.max(rawRatio, 0.1), 0.9);
    const first = sanitizeLayout(node.first);
    const second = sanitizeLayout(node.second);
    if (!first && !second) return null;
    if (!first) return second;
    if (!second) return first;
    return {
      type: "split",
      direction: dir,
      ratio,
      first,
      second,
    };
  }
  return null;
};
  if (splitState.layout) {
    layoutRoot = sanitizeLayout(splitState.layout);
  } else {
    layoutRoot = null;
  }

  const modeFlag = splitState.mode === 1;
  // SplitViewモードで終了していて、かつ空でなく中身タブが分かるときだけ復元
  splitCanvasMode = modeFlag && !splitEmpty && !!splitLastTabId;

  // 起動時にアクティブにするタブ:
  //  - SplitViewを復元できた → splitLastTabId
  //  - それ以外 → baseActiveId
  const initialActiveId =
    splitCanvasMode && splitLastTabId != null ? splitLastTabId : baseActiveId;

  return initialActiveId;
}

// ======================
// レイアウト適用
// ======================

function hideAllWebviews() {
  document.querySelectorAll("webview").forEach((wv) => {
    wv.style.visibility = "hidden";
    wv.style.opacity = "0";
    wv.style.pointerEvents = "none";
  });
}

function applyCurrentLayout() {
  // ここで毎回 root を取得（グローバル変数 rootEl をやめる）
  const rootEl = document.getElementById("root");
  if (!rootEl) return;

  const rect = rootEl.getBoundingClientRect();
  let totalWidth = rect.width;
  let totalHeight = rect.height;
  let contentOffsetX = 0;
  let contentOffsetY = 0;

  // タイトルバー固定モードのときは、そのぶんだけ上から押し出す
  const tb = document.getElementById("window-titlebar");
  const isTitlebarFixed =
    typeof titlebarFixedMode !== "undefined" && titlebarFixedMode;
  if (isTitlebarFixed && tb) {
    const tbRect = tb.getBoundingClientRect();
    const tbHeight = tbRect.height || 32;
    contentOffsetY = tbHeight;
    totalHeight = Math.max(0, totalHeight - tbHeight);
  }

  // 左サイドバー（押し出しモード）は横幅から引く
  if (sidebarOpen && sidebarShrinkMode && sidebar) {
    const sbRect = sidebar.getBoundingClientRect();
    const leftWidth = sbRect.width || sidebar.offsetWidth || 0;
    if (leftWidth > 0 && leftWidth < totalWidth) {
      contentOffsetX = leftWidth;
      totalWidth = totalWidth - leftWidth;
    }
  }

  // 右側の AI サイドバー
  if (rightSidebarOpen) {
    const sidebarWidth = RIGHT_SIDEBAR_WIDTH; // #right-sidebar の幅
    if (sidebarWidth > 0 && sidebarWidth < totalWidth) {
      totalWidth = Math.max(0, totalWidth - sidebarWidth);
    }
  }

  renderTabs();

  if (!tabs.length) {
    hideAllWebviews();
    updateSplitViewButtonState();
    return;
  }

  // SplitView 真っ黒キャンバス状態
  if (splitCanvasMode && splitEmpty) {
    document.querySelectorAll("webview").forEach((wv) => {
      wv.style.visibility = "hidden";
      wv.style.opacity = "0";
      wv.style.pointerEvents = "none";
    });
    updateSplitViewButtonState();
    return;
  }

  // SplitView 無効 or レイアウトが未設定 → 現在のタブを全画面で表示
  let effectiveRoot = layoutRoot;
  if (!splitCanvasMode || !layoutRoot) {
    const tab = getActiveTab();
    if (!tab) {
      hideAllWebviews();
      updateSplitViewButtonState();
      return;
    }
    effectiveRoot = {
      type: "group",
      tabs: [tab.id],
      activeTabId: tab.id,
    };
  }

  const rects = [];

  function walk(node, x, y, w, h) {
    if (!node) return;
    if (node.type === "group") {
      const activeId = node.activeTabId || (node.tabs && node.tabs[0]);
      if (activeId == null) return;
      rects.push({
        tabId: activeId,
        x,
        y,
        width: w,
        height: h,
      });
      return;
    }
    if (node.type === "split") {
      const ratio = Math.min(0.9, Math.max(0.1, node.ratio || 0.5));
      if (node.direction === "horizontal") {
        const h1 = Math.round(h * ratio);
        const h2 = h - h1;
        walk(node.first, x, y, w, h1);
        walk(node.second, x, y + h1, w, h2);
      } else {
        const w1 = Math.round(w * ratio);
        const w2 = w - w1;
        walk(node.first, x, y, w1, h);
        walk(node.second, x + w1, y, w2, h);
      }
    }
  }

  walk(effectiveRoot, 0, 0, totalWidth, totalHeight);

  if (!rects.length) {
    hideAllWebviews();
    updateSplitViewButtonState();
    return;
  }

  const visibleIds = new Set();

  for (const r of rects) {
    const tab = tabs.find((t) => t.id === r.tabId);
    if (!tab) continue;

    const wv = getWebviewForTab(tab);
    if (!wv) continue;

    wv.style.left = contentOffsetX + r.x + "px";
    wv.style.top = contentOffsetY + r.y + "px";
    wv.style.width = r.width + "px";
    wv.style.height = r.height + "px";
    wv.style.visibility = "visible";
    wv.style.opacity = "1";
    wv.style.pointerEvents = "auto";

    visibleIds.add(wv.id);
  }

  document.querySelectorAll("webview").forEach((wv) => {
    if (!visibleIds.has(wv.id)) {
      wv.style.visibility = "hidden";
      wv.style.opacity = "0";
      wv.style.pointerEvents = "none";
    }
  });

  updateSplitViewButtonState();
}

// ウィンドウリサイズ時はレイアウト再計算
window.addEventListener("resize", () => {
  applyCurrentLayout();
});


// ======================
// タブドラッグ（SplitView 用）
// ======================

function handleTabMouseDown(e) {
  if (e.button !== 0) return;
  if (e.target.closest(".tab-close-btn")) return;

  const item = e.currentTarget;
  const id = Number(item.dataset.tabId);
  if (!id) return;

  tabDragState.downTabId = id;
  tabDragState.downItemEl = item;
  tabDragState.startX = e.clientX;
  tabDragState.startY = e.clientY;
  tabDragState.dragging = false;
  tabDragState.candidateTabId = splitCanvasMode ? id : null;

  const rect = item.getBoundingClientRect();
  tabDragState.offsetX = e.clientX - rect.left;
  tabDragState.offsetY = e.clientY - rect.top;
}

document.addEventListener("mousemove", (e) => {
  if (tabDragState.downTabId == null) return;
  if (!splitCanvasMode) return;
  if (tabDragState.candidateTabId == null) return;
  if (!window.splitOverlayEl) return;

  // ドラッグ開始判定
  if (!tabDragState.dragging) {
    const dx = e.clientX - tabDragState.startX;
    const dy = e.clientY - tabDragState.startY;

    const elUnder = document.elementFromPoint(e.clientX, e.clientY);
    const stillOnSameTab =
      elUnder && elUnder.closest
        ? elUnder.closest(".tab-item") === tabDragState.downItemEl
        : false;

    if (Math.abs(dx) < 3 && Math.abs(dy) < 3 && stillOnSameTab) {
      return;
    }

    // ドラッグ開始
    tabDragState.dragging = true;
    placementState.active = true;
    placementState.tabId = tabDragState.candidateTabId;
    placementState.direction = "full";
    setSplitOverlayActive(true);

    document.body.style.cursor = "grabbing";
    if (tabDragState.downItemEl) {
      tabDragState.downItemEl.classList.add("tab-drag-source");
    }

    if (tabDragState.downItemEl) {
      const rect = tabDragState.downItemEl.getBoundingClientRect();
      const ghost = tabDragState.downItemEl.cloneNode(true);
      ghost.classList.add("tab-drag-ghost");
      ghost.style.position = "fixed";
      ghost.style.left = rect.left + "px";
      ghost.style.top = rect.top + "px";
      ghost.style.width = rect.width + "px";
      ghost.style.pointerEvents = "none";
      ghost.style.opacity = "0.85";
      ghost.style.transform = "scale(1.02)";
      ghost.style.zIndex = "2500";
      document.body.appendChild(ghost);
      tabDragState.ghostEl = ghost;
    }
  }

  if (tabDragState.dragging && tabDragState.ghostEl) {
    const gx = e.clientX - tabDragState.offsetX;
    const gy = e.clientY - tabDragState.offsetY;
    tabDragState.ghostEl.style.left = gx + "px";
    tabDragState.ghostEl.style.top = gy + "px";
  }

  const vp = computeContentViewport();
  const rootRect = vp.rootRect;
  const contentLeft = rootRect.left + vp.offsetX;
  const contentTop = rootRect.top + vp.offsetY;
  const contentWidth = vp.width;
  const contentHeight = vp.height;

  // コンテンツ領域外なら青ゾーン消す
  if (
    e.clientX < contentLeft ||
    e.clientX > contentLeft + contentWidth ||
    e.clientY < contentTop ||
    e.clientY > contentTop + contentHeight
  ) {
    placementState.direction = null;
    updateSplitOverlayIndicator(null, e.clientX, e.clientY);
    return;
  }

  let dir = null;

  if (!layoutRoot) {
    dir = "full";
  } else {
    let targetRect = null;
    const rects = computeLayoutLeafRectsForSplit();
    if (rects.length) {
      targetRect = findLeafRectAtPosition(rects, e.clientX, e.clientY);
    }

    if (targetRect) {
      const cx = targetRect.left + targetRect.width / 2;
      const cy = targetRect.top + targetRect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      if (Math.abs(dx) > Math.abs(dy)) {
        dir = dx < 0 ? "left" : "right";
      } else {
        dir = dy < 0 ? "top" : "bottom";
      }
    } else {
      const cx = contentLeft + contentWidth / 2;
      const cy = contentTop + contentHeight / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      if (Math.abs(dx) > Math.abs(dy)) {
        dir = dx < 0 ? "left" : "right";
      } else {
        dir = dy < 0 ? "top" : "bottom";
      }
    }
  }

  placementState.direction = dir;
  updateSplitOverlayIndicator(dir, e.clientX, e.clientY);
});

document.addEventListener("mouseup", (e) => {
  const wasDragging = tabDragState.dragging;
  const candidateTabId = tabDragState.candidateTabId;
  const dir = placementState.direction;

  let dropValid = false;
  if (
    splitCanvasMode &&
    wasDragging &&
    candidateTabId != null &&
    dir &&
    window.splitOverlayIndicator
  ) {
    const indRect = splitOverlayIndicator.getBoundingClientRect();
    if (indRect.width > 0 && indRect.height > 0) {
      if (
        e.clientX >= indRect.left &&
        e.clientX <= indRect.right &&
        e.clientY >= indRect.top &&
        e.clientY <= indRect.bottom
      ) {
        dropValid = true;
      }
    }
  }

  setSplitOverlayActive(false);
  placementState.active = false;
  placementState.direction = null;

  if (splitCanvasMode && wasDragging && candidateTabId != null && dropValid) {
    const candidateTab = tabs.find((t) => t.id === candidateTabId);
    if (candidateTab) {
      applyLayoutTabAddSplit(candidateTabId, dir || "full", e.clientX, e.clientY);
      splitEmpty = false;
      splitLastTabId = candidateTabId;
      applyCurrentLayout();
      saveTabsState();
    }
  }

  if (tabDragState.ghostEl) {
    tabDragState.ghostEl.remove();
    tabDragState.ghostEl = null;
  }
  if (tabDragState.downItemEl) {
    tabDragState.downItemEl.classList.remove("tab-drag-source");
  }
  document.body.style.cursor = "";

  tabDragState.downTabId = null;
  tabDragState.downItemEl = null;
  tabDragState.candidateTabId = null;
  tabDragState.dragging = false;
  tabDragState.hoverZone = null;
});

function updateSplitViewButtonState() {
  if (!splitViewBtn) return;
  if (splitCanvasMode) {
    splitViewBtn.classList.add("split-active");
  } else {
    splitViewBtn.classList.remove("split-active");
  }
}

function handleSplitViewClick() {
  if (splitCanvasMode) return;

  // SplitView モード ON
  splitCanvasMode = true;
  updateSidebarUrlInputEnabled();

  if (splitLastTabId != null && tabs.some((t) => t.id === splitLastTabId)) {
    // 以前の SplitView 内容あり → そのタブを全画面 SplitView で表示
    splitEmpty = false;
    setActiveTab(splitLastTabId);
  } else {
    // ★ 初回 or SplitView 内容なし → 「レイアウトは空」にして真っ黒キャンバスから始める
    splitEmpty = true;
    layoutRoot = null;
    splitLastTabId = null;

    applyCurrentLayout();
    saveTabsState();
    updateSidebarUrlInputEnabled();
  }
}

/**
 * 指定タブだけを SplitView から外す（残りは維持）。
 * @param {string} tabId 対象タブ ID。
 */
function splitCancelForTab(tabId) {
  if (!splitCanvasMode) return;
  if (tabId == null) return;

  // 解除対象タブが実在しないなら何もしない
  const tabExists = tabs.some((t) => t.id === tabId);
  if (!tabExists) return;

  // ① まずレイアウトツリーからこのタブを取り除く
  removeTabFromLayout(tabId);

  // ② layoutRoot が「縦だけレイアウト」なら、残った列数に応じて比率を等分し直す
  const verticalGroups = collectVerticalGroups(layoutRoot);
  if (verticalGroups && verticalGroups.length > 0) {
    layoutRoot = buildVerticalSplitFromGroups(verticalGroups);
  }

  // ②b layoutRoot が「横だけレイアウト」なら等分し直す
  const horizontalGroups = collectHorizontalGroups(layoutRoot);
  if (horizontalGroups && horizontalGroups.length > 0) {
    layoutRoot = buildHorizontalSplitFromGroups(horizontalGroups);
  }

  // ③ 残っているタブを探す（最初に見つかった group の activeTabId or 先頭）
  let remainingTabId = null;
  if (layoutRoot) {
    const g = findFirstGroupNode(layoutRoot);
    if (g && Array.isArray(g.tabs) && g.tabs.length > 0) {
      remainingTabId = g.activeTabId || g.tabs[0];
    }
  }

  // ④ SplitView 自体は続けるので splitCanvasMode は true のまま
  //    タブが残っていなければ「黒画面状態」にする
  if (!layoutRoot || remainingTabId == null) {
    splitEmpty = true; // 黒画面モード
    splitLastTabId = null; // 中身なし
    // currentTabId はそのままでもOK（サイドバーのハイライト用）
  } else {
    // まだレイアウトにタブがある → そのタブをSplitViewの表示対象にする
    currentTabId = remainingTabId;
    splitEmpty = false;
  }

  // オーバーレイは消しておく
  setSplitOverlayActive(false);

  // レイアウト反映＆保存
  applyCurrentLayout();
  saveTabsState();
}

// ======================
// SplitView 汎用ヘルパー
// ======================

// 「SplitViewモードから抜けるけど、レイアウトは保存」
// - 今映っているタブを splitLastTabId として覚える
/**
 * SplitView を終了し、現在のレイアウトを保持する。
 * @returns {void}
 */
function exitSplitViewPreserveLayout() {
  if (!splitCanvasMode) return;

  if (!splitEmpty && currentTabId != null) {
    splitLastTabId = currentTabId;
  }

  splitCanvasMode = false;
  saveTabsState();
  updateSidebarUrlInputEnabled();
}

// タブを閉じたときの SplitView 状態更新
/**
 * SplitView 中にタブを閉じたときの片側空状態を処理する。
 * @param {string} closedTabId 閉じたタブ ID。
 */
function handleTabClosedForSplitView(closedTabId) {
  if (!splitCanvasMode) return;
  if (splitEmpty) return;
  if (closedTabId !== splitLastTabId) return;

  splitEmpty = true;
  splitLastTabId = null;
  saveTabsState();
}
