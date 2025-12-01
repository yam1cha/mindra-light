// ==========================================================
//  WebAction Engine 統合版 + URLごとのルール
// ==========================================================

console.log("[UniversalSearch] loaded (web-action + url-rules)");

const WEB_ACTION_RULES = [
  // ChatGPT
  {
    match: /https?:\/\/(chatgpt\.com|chat\.openai\.com)\//,
    defaultAction: "chat",
    chat: {
      input: '#prompt-textarea, div#prompt-textarea',
      sendButton: 'button[data-testid="send-button"]',
    },
  },

  // Perplexity（Lexicalエディタ）
  {
    match: /https?:\/\/(www\.)?perplexity\.ai\//,
    defaultAction: "chat",
    chat: {
      // 入力欄：id="ask-input" かつ contenteditable=true
      input: [
        'div#ask-input[contenteditable="true"]',
        'div[contenteditable="true"][data-test-id="user-textbox"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][role="textbox"]',
      ].join(", "),
      // 送信ボタン
      sendButton: [
        'button[aria-label*="検索" i]',
        'button[aria-label*="search" i]',
        'button[aria-label*="ask" i]',
        'button[type="submit"]',
      ].join(", "),
    },
  },

  // Google 検索（おまけ）
  {
    match: /https?:\/\/www\.google\./,
    defaultAction: "search",
    search: {
      input: 'form[action="/search"] input[name="q"]',
    },
  },
];

// 共通ステート
window.UNIVERSAL_SEARCH = {
  lastQuery: "",
  lastResult: null,
};

// URL取得
function getWebviewUrl(wv) {
  try {
    if (typeof wv.getURL === "function") return wv.getURL();
  } catch (_) {}
  try {
    if (wv.src) return wv.src;
  } catch (_) {}
  return "";
}

// URL→ルール
function getRuleForWebview(wv) {
  const url = getWebviewUrl(wv) || "";
  for (const rule of WEB_ACTION_RULES) {
    try {
      if (rule.match && rule.match.test(url)) {
        console.log("[UniversalSearch] matched rule:", url, rule);
        return rule;
      }
    } catch (e) {
      console.warn("[UniversalSearch] rule.match error:", e);
    }
  }
  return null;
}

// 対象webview一覧
function getTargets() {
  const views = window.mindraViews || {};

  if (typeof views.getSplitWebviews === "function") {
    try {
      const split = views.getSplitWebviews();
      if (Array.isArray(split) && split.length > 0) {
        console.log(
          "[UniversalSearch] SplitView targets =",
          split.length
        );
        return split;
      }
    } catch (e) {
      console.warn("[UniversalSearch] getSplitWebviews failed:", e);
    }
  }

  try {
    const all = Array.from(document.querySelectorAll("webview"));
    if (all.length > 0) {
      console.log("[UniversalSearch] All webviews from DOM:", all.length);
      return all;
    }
  } catch (e) {
    console.warn("[UniversalSearch] DOM webview scan failed:", e);
  }

  if (typeof views.getActiveWebview === "function") {
    try {
      const active = views.getActiveWebview();
      if (active) {
        console.log("[UniversalSearch] Fallback: active only");
        return [active];
      }
    } catch (e) {
      console.warn("[UniversalSearch] getActiveWebview failed:", e);
    }
  }

  console.warn("[UniversalSearch] No webview found");
  return [];
}

// 注入スクリプト作成
function buildInjectionScript(query, mode, rule) {
  const q = JSON.stringify(query);
  const m = JSON.stringify(mode || "auto");
  const cfg = JSON.stringify(
    rule
      ? {
          defaultAction: rule.defaultAction || null,
          search: rule.search || null,
          chat: rule.chat || null,
        }
      : null
  );

  return `
    (function(q, mode, cfg) {
      function setAndSubmit(el, finalMode, cfg) {
        if (!el) return false;

        el.focus();

        if ("value" in el) {
          el.value = q;
        }
        if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
          el.innerText = q;
        }

        try {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e) {}

        // ---- チャット動作 ----
        if (finalMode === "chat") {
          var scheduleSend = function () {
            var btnSel = cfg && cfg.chat && cfg.chat.sendButton;
            if (btnSel) {
              try {
                var btn = document.querySelector(btnSel);
                if (btn) {
                  btn.click();
                  return;
                }
              } catch (e) {}
            }

            try {
              var ev = {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
              };
              el.dispatchEvent(new KeyboardEvent("keydown", ev));
              el.dispatchEvent(new KeyboardEvent("keypress", ev));
              el.dispatchEvent(new KeyboardEvent("keyup", ev));
            } catch (e) {}
          };

          setTimeout(scheduleSend, 120);
          return true;
        }

        // ---- 検索動作 ----
        var form = el.form || (el.closest && el.closest("form"));
        if (form) {
          try {
            form.submit();
            return true;
          } catch (e) {}
        }

        try {
          var ev2 = {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
          };
          el.dispatchEvent(new KeyboardEvent("keydown", ev2));
          el.dispatchEvent(new KeyboardEvent("keypress", ev2));
          el.dispatchEvent(new KeyboardEvent("keyup", ev2));
        } catch (e) {}

        return true;
      }

      // ---- ルールから候補 ----
      var searchCandidate = null;
      var chatCandidate = null;

      if (cfg && cfg.search && cfg.search.input) {
        try {
          searchCandidate = document.querySelector(cfg.search.input);
        } catch (e) {}
      }
      if (cfg && cfg.chat && cfg.chat.input) {
        try {
          chatCandidate = document.querySelector(cfg.chat.input);
        } catch (e) {}
      }

      // ---- 汎用候補（保険）----
      var searchSelectors = [
        'form[action="/search"] input[name="q"]',
        'input[type="search"]',
        'input[role="searchbox"]',
        'input[name="q"]',
        'input[placeholder*="検索"]',
        'input[placeholder*="Search"]'
      ];
      if (!searchCandidate) {
        for (var i = 0; i < searchSelectors.length && !searchCandidate; i++) {
          try {
            var elS = document.querySelector(searchSelectors[i]);
            if (elS) searchCandidate = elS;
          } catch (e) {}
        }
      }

      var chatSelectors = [
        'textarea[placeholder*="メッセージ"]',
        'textarea[placeholder*="message"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][data-placeholder]',
        'div[contenteditable="true"]'
      ];
      if (!chatCandidate) {
        for (var j = 0; j < chatSelectors.length && !chatCandidate; j++) {
          try {
            var elC = document.querySelector(chatSelectors[j]);
            if (elC) chatCandidate = elC;
          } catch (e) {}
        }
      }

      var fallback =
        document.querySelector('input[type="text"]') ||
        document.querySelector("textarea") ||
        document.querySelector('[contenteditable="true"]');

      function decideAndRun(finalMode) {
        if (finalMode === "search") {
          if (searchCandidate) return setAndSubmit(searchCandidate, "search", cfg) ? "search" : "none";
          if (fallback)        return setAndSubmit(fallback,        "search", cfg) ? "search-fallback" : "none";
          return "none";
        }
        if (finalMode === "chat") {
          if (chatCandidate) return setAndSubmit(chatCandidate, "chat", cfg) ? "chat" : "none";
          if (fallback)      return setAndSubmit(fallback,      "chat", cfg) ? "chat-fallback" : "none";
          return "none";
        }
        return "none";
      }

      // ---- mode 分岐 ----
      if (mode === "search") {
        // チャット専用サイト（defaultAction=chat）で検索欄が無い場合はチャット扱いにする
        if (cfg && cfg.defaultAction === "chat" && !searchCandidate && chatCandidate) {
          return decideAndRun("chat");
        }
        return decideAndRun("search");
      }

      if (mode === "chat") {
        return decideAndRun("chat");
      }

      // mode === auto
      if (cfg && cfg.defaultAction === "chat" && chatCandidate) {
        return decideAndRun("chat");
      }
      if (cfg && cfg.defaultAction === "search" && searchCandidate) {
        return decideAndRun("search");
      }
      if (searchCandidate && !chatCandidate) return decideAndRun("search");
      if (chatCandidate && !searchCandidate) return decideAndRun("chat");
      if (searchCandidate && chatCandidate)  return decideAndRun("search");
      if (fallback) return decideAndRun("search");
      return "none";
    })(${q}, ${m}, ${cfg});
  `;
}

// webviewごとに実行
async function runActionInWebview(wv, query, mode) {
  const url = getWebviewUrl(wv) || "";

  // ===========================
  // Perplexity 専用ルート
  // ===========================
  if (/perplexity\.ai/.test(url)) {
    const code = `(function(q) {
      console.log('[Perplexity][Mindra] start, q =', q);

      var el = document.querySelector(
        'div#ask-input[contenteditable="true"],' +
        'div[contenteditable="true"][data-test-id="user-textbox"],' +
        'div[contenteditable="true"][data-lexical-editor="true"]'
      );

      if (!el) {
        console.log('[Perplexity][Mindra] no input element found');
        return 'none';
      }

      el.focus();
      try {
        var sel = window.getSelection();
        if (sel) {
          var range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (e) {}

      try {
        // まず全削除
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // insertText を試す
        const ok = document.execCommand('insertText', false, q);

        // insertText が失敗したときだけフォールバック
        if (!ok) {
          el.textContent = q;
        }
      } catch (e) {
        // エラー時だけ fallback
        el.textContent = q;
      }

      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {}

      // ここでは送信ボタンは押さない
      console.log('[Perplexity][Mindra] typed only');

      return 'chat-perplexity-typed';
    })(${JSON.stringify(query)});`;

    try {
      if (typeof wv.executeJavaScript !== "function") {
        console.warn("[UniversalSearch][Perplexity] executeJavaScript not available");
        return "error:no-exec";
      }
      const result = await wv.executeJavaScript(code, false);
      console.log("[UniversalSearch][Perplexity] result:", result);
      return result || "none";
    } catch (e) {
      console.warn("[UniversalSearch][Perplexity] executeJavaScript error:", e);
      return "error:exception";
    }
  }

  // =====================================================
  // GitHub Copilot 専用ルート（入力だけ & 手動送信）
  // =====================================================
  if (/github\.com\/copilot/.test(url)) {
    const code = `(function(q) {
      console.log('[Copilot][Mindra] start, q =', q);

      // 入力欄の取得（メインの textarea）
      var el = document.querySelector('textarea');
      if (!el) {
        console.log('[Copilot][Mindra] no textarea found');
        return 'none';
      }

      el.focus();
      el.value = q;

      try {
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        console.log('[Copilot][Mindra] event error', e);
      }

      console.log('[Copilot][Mindra] typed only');
      return 'chat-copilot-typed';
    })(${JSON.stringify(query)});`;

    if (typeof wv.executeJavaScript !== "function") {
      return "error:no-exec";
    }
    const result = await wv.executeJavaScript(code, false);
    return result || "none";
  }

  // =====================================================
  // Microsoft Copilot (copilot.microsoft.com) — 入力のみ
  // =====================================================
  if (/copilot\.microsoft\.com/.test(url)) {
    const code = `(function(q) {
      console.log('[MS Copilot][Mindra] start, q =', q);

      var el = document.querySelector('textarea#userInput')
            || document.querySelector('textarea[data-testid="composer-input"]')
            || document.querySelector('textarea[role="textbox"]');

      if (!el) {
        console.log('[MS Copilot][Mindra] no textarea found');
        return 'none';
      }

      el.focus();
      el.value = q;

      try {
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch(e) {
        console.log('[MS Copilot][Mindra] event error', e);
      }

      console.log('[MS Copilot][Mindra] typed only');
      return 'chat-mscopilot-typed';
    })(${JSON.stringify(query)});`;

    if (typeof wv.executeJavaScript !== "function") {
      return "error:no-exec";
    }
    const result = await wv.executeJavaScript(code, false);
    return result || "none";
  }

  // =====================================================
  // Manus (manus.im/app) 専用ルート
  //  - テキストを入れる
  //  - Enter キーで送信
  // =====================================================
  if (/manus\.im\/app/.test(url)) {
    const code = `(function(q) {
      console.log('[Manus][Mindra] start, q =', q);

      // 入力欄（textarea）を探す
      var el = document.querySelector(
        'textarea[placeholder*="タスクを割り当てて"]'
      ) || document.querySelector('textarea');

      if (!el) {
        console.log('[Manus][Mindra] no textarea found');
        return 'none';
      }

      el.focus();
      el.value = q;

      try {
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        console.log('[Manus][Mindra] event error', e);
      }

      // 少し待ってから Enter キーを送る（送信トリガー想定）
      setTimeout(function() {
        try {
          var evInit = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
          };
          ['keydown', 'keypress', 'keyup'].forEach(function(t) {
            el.dispatchEvent(new KeyboardEvent(t, evInit));
          });
          console.log('[Manus][Mindra] sent Enter key');
        } catch (e) {
          console.log('[Manus][Mindra] key event error', e);
        }
      }, 150);

      return 'chat-manus';
    })(${JSON.stringify(query)});`;

    if (typeof wv.executeJavaScript !== "function") {
      console.warn("[UniversalSearch][Manus] executeJavaScript not available");
      return "error:no-exec";
    }
    const result = await wv.executeJavaScript(code, false);
    console.log("[UniversalSearch][Manus] result:", result);
    return result || "none";
  }

  // =====================================================
  // Kimi (www.kimi.com) 専用ルート
  //  - Lexical の contenteditable に入力
  //  - Enter キーで送信
  // =====================================================
  if (/kimi\.com/.test(url)) {
    const code = `(function(q) {
      console.log('[Kimi][Mindra] start, q =', q);

      var el =
        document.querySelector(
          'div[contenteditable="true"][data-lexical-editor="true"][role="textbox"]'
        ) ||
        document.querySelector(
          'div[contenteditable="true"][role="textbox"]'
        );

      if (!el) {
        console.log('[Kimi][Mindra] no editor element found');
        return 'none';
      }

      el.focus();
      try {
        var sel = window.getSelection();
        if (sel) {
          var range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (e) {
        console.log('[Kimi][Mindra] selection error', e);
      }

      try {
        try {
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
        } catch (e) {}

        var ok = false;
        try {
          ok = document.execCommand('insertText', false, q);
        } catch (e) {}

        if (!ok) {
          el.textContent = q;
        }
      } catch (e) {
        console.log('[Kimi][Mindra] insert error', e);
        el.textContent = q;
      }

      try {
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        console.log('[Kimi][Mindra] event error', e);
      }

      setTimeout(function () {
        try {
          var evInit = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
          };
          ['keydown', 'keypress', 'keyup'].forEach(function (t) {
            el.dispatchEvent(new KeyboardEvent(t, evInit));
          });
          console.log('[Kimi][Mindra] sent Enter key');
        } catch (e) {
          console.log('[Kimi][Mindra] key event error', e);
        }
      }, 150);

      return 'chat-kimi';
    })(${JSON.stringify(query)});`;

    if (typeof wv.executeJavaScript !== "function") {
      console.warn("[UniversalSearch][Kimi] executeJavaScript not available");
      return "error:no-exec";
    }

    const result = await wv.executeJavaScript(code, false);
    console.log("[UniversalSearch][Kimi] result:", result);
    return result || "none";
  }

  // ===========================
  // それ以外（ChatGPT 含む）は今まで通り
  // ===========================
  const rule = getRuleForWebview(wv);
  const code = buildInjectionScript(query, mode, rule);

  try {
    if (typeof wv.executeJavaScript !== "function") {
      console.warn("[UniversalSearch] executeJavaScript not available");
      return "error:no-exec";
    }
    const result = await wv.executeJavaScript(code, false);
    console.log(
      "[UniversalSearch] executeJavaScript result:",
      result,
      "url:",
      getWebviewUrl(wv)
    );
    return result || "none";
  } catch (e) {
    console.warn("[UniversalSearch] executeJavaScript error:", e);
    return "error:exception";
  }
}

// エントリポイント
window.runUniversalSearch = async function (query, modeOrOptions) {
  console.log(
    "[UniversalSearch] query =",
    query,
    "modeOrOptions =",
    modeOrOptions
  );

  let action = "auto";
  if (typeof modeOrOptions === "string") {
    action = modeOrOptions;
  } else if (modeOrOptions && typeof modeOrOptions === "object") {
    if (modeOrOptions.action) action = modeOrOptions.action;
  }

  const targets = getTargets();
  console.log("[UniversalSearch] targets count =", targets.length);

  let msg;

  if (targets.length === 0) {
    msg = "対象のタブが見つからなくて、操作できなかったよ。";

    window.UNIVERSAL_SEARCH.lastQuery = query;
    window.UNIVERSAL_SEARCH.lastResult = {
      total: NaN,
      targets: 0,
      action,
    };

    window.dispatchUniversalSearchResult(msg);
    return msg;
  }

  let successCount = 0;
  const statuses = [];

  for (const wv of targets) {
    const status = await runActionInWebview(wv, query, action);
    statuses.push(status);
    if (status && !String(status).startsWith("error") && status !== "none") {
      successCount++;
    }
  }

  // 実際に何をやったかを status から推定
  let effectiveAction = action;
  if (successCount > 0) {
    if (statuses.some((s) => String(s).startsWith("chat"))) {
      effectiveAction = "chat";
    } else if (statuses.some((s) => String(s).startsWith("search"))) {
      effectiveAction = "search";
    }
  }

  window.UNIVERSAL_SEARCH.lastQuery = query;
  window.UNIVERSAL_SEARCH.lastResult = {
    total: NaN,
    targets: targets.length,
    action: effectiveAction,
    statuses,
  };

  if (successCount === 0) {
    msg = "いい感じの入力欄が見つからなくて、何もできなかったよ。";
  } else {
    if (effectiveAction === "chat") {
      msg = `「${query}」ってメッセージを送ったよ（たぶん）。`;
    } else if (effectiveAction === "search") {
      msg = `「${query}」を検索したよ。`;
    } else {
      msg = `「${query}」を入力しておいたよ。`;
    }
  }

  window.dispatchUniversalSearchResult(msg);
  return msg;
};

// 結果をAIバーへ通知
window.dispatchUniversalSearchResult = function (msg) {
  if (window.mindraAI?.receiveSearchResult) {
    window.mindraAI.receiveSearchResult(msg);
  } else {
    console.log("[UniversalSearch] AI not ready:", msg);
  }
};
