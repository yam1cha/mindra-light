// ==========================================================
//  Universal WebAction Engine
//  - 検索 / チャットの区別を完全撤廃
//  - 「いい感じの入力欄を1つ見つけて、文字を入れて送信」だけやる
//  - WEB_ACTION_RULES = 世界AIサービス辞典（国別）
//      * input: "mindra-dummy" → 未確認
//      * input: "mindra-ok"     → 汎用でOK
//      * input: "mindra-ng"     → 汎用でNG（専用ルートあり）
// ==========================================================

/**
 * Pseudo-selector 判定（JS 側）。
 * @param {string} sel セレクター文字列。
 * @returns {boolean} Mindra 用の擬似セレクターかどうか。
 */
function isMindraPseudoSelector(sel) {
  return sel === "mindra-dummy" || sel === "mindra-ok" || sel === "mindra-ng";
}


// ----------------------------------------------------------
// 世界 AI サイト辞典（WEB_ACTION_RULES）
//  - 1件ごとに「どこの何か」をコメントで明記
// ----------------------------------------------------------
const WEB_ACTION_RULES = [
  // ===== Global / US =====
  {
    // [US] OpenAI ChatGPT
    match: /https?:\/\/chatgpt\.com\//,
    chat: {
      input:
        '#prompt-textarea, div#prompt-textarea, textarea[role="textbox"], div[contenteditable="true"][role="textbox"]',
      sendButton: 'button[data-testid="send-button"]',
    },
  },
  {
    // [US] Anthropic Claude
    match: /https?:\/\/claude\.ai\//,
    chat: { input: "mindra-ok" },
  },
  {
    // [US] Perplexity
    match: /https?:\/\/(www\.)?perplexity\.ai\//,
    chat: { input: "mindra-ng" },
  },
  {
    // [US] Microsoft Copilot Web
    match: /https?:\/\/copilot\.microsoft\.com\//,
    chat: { input: "mindra-ok" },
  },
  {
    // [US] Bing Chat / Copilot in Bing
    match: /https?:\/\/www\.bing\.com\/chat/,
    chat: { input: "mindra-ok" },
  },
  {
    // [US] xAI Grok (grok.com)
    match: /https?:\/\/grok\.com\//,
    chat: { input: "mindra-ok" },
  },
  {
    // [US] xAI Grok on X
    match: /https?:\/\/x\.com\/i\/grok/,
    chat: { input: "mindra-ok" },
  },
  {
    // [US] Meta AI（Meta / Facebook / Instagram / Threads）
    match:
      /https?:\/\/(meta\.ai|www\.facebook\.com|www\.instagram\.com|www\.threads\.net)\//,
    chat: { input: "mindra-ng" },
  },
  {
    // [US] Character.AI
    match: /https?:\/\/(www\.)?character\.ai\//,
    chat: { input: "mindra-ok" },
  },
  {
    // [US] Replika
    match: /https?:\/\/replika\.com\//,
    chat: { input: "mindra-ok" },
  },
  {
    // [US] GitHub Copilot Chat
    match: /https?:\/\/github\.com\/copilot/,
    chat: { input: "mindra-ng" },
  },

  // ===== Google 系 =====
  {
    // [Google] Gemini
    match: /https?:\/\/gemini\.google\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [Google] 検索
    match: /https?:\/\/www\.google\./,
    search: {
      input: 'mindra-ng',
    },
  },

  // ===== Europe 系 =====
  {
    // [EU] Mistral / Chat
    match: /https?:\/\/(mistral\.ai|chat\.mistral\.ai)\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [EU] Aleph Alpha
    match: /https?:\/\/(www\.)?aleph-alpha\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [EU] DeepL Chat
    match: /https?:\/\/www\.deepl\.com\/chat/,
    chat: { input: "mindra-dummy" },
  },
  {
    // [EU] Pi (heyPi)
    match: /https?:\/\/heypi\.com\//,
    chat: { input: "mindra-dummy" },
  },

  // ===== China 系 =====
  {
    // [CN] Baidu ERNIE / 文心一言
    match: /https?:\/\/(ernie\.baidu\.com|yiyan\.baidu\.com)\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [CN] Alibaba Tongyi / Qwen
    match:
      /https?:\/\/(chat\.qwen\.ai|tongyi\.aliyun\.com|qwen\.ai|gpt\.aliyun\.com)\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [CN] DeepSeek Chat
    match: /https?:\/\/chat\.deepseek\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [CN] Tencent Hunyuan
    match: /https?:\/\/hunyuan\.tencent\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [CN] ByteDance Doubao
    match: /https?:\/\/doubao\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [CN] SenseTime 日日新
    match: /https?:\/\/ririshin\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [CN] iFlytek Spark
    match: /https?:\/\/.*xfyun\.cn\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [CN] Zhipu GLM
    match: /https?:\/\/(chatglm\.cn|bigmodel\.cn|chat\.z\.ai)\//,
    chat: {
      input: 'textarea#chat-input',

      // FIXME: GLM かどうか判定するためのフラグ
      is_glm: true,
    },
  },
  {
    // [CN] Kimi
    match: /https?:\/\/(www\.)?kimi\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [CN] MiniMax
    match: /https?:\/\/agent\.minimax\.io\//,
    chat: {
      input: 'textarea#chat-input',
    },
  },

  // ===== Japan / Korea / Asia =====
  {
    // [KR] Naver CLOVA Studio / X
    match: /https?:\/\/clovastudio\.ncloud\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [KR] Kakao / KoGPT など
    match: /https?:\/\/.*kakao\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [IN] Krutrim
    match: /https?:\/\/(www\.)?(krutrim\.com|kruti\.ai)\//,
    chat: {
      input: 'textarea.txt-primary',
    },
  },
  {
    // [IN] Hanooman
    match: /https?:\/\/(www\.)?hanooman\.ai\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [IN] Sarvam AI
    match: /https?:\/\/(www\.)?sarvam\.ai\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [IN] Bhashini / BharatGPT
    match: /https?:\/\/bhashini\.gov\.in\//,
    chat: { input: "mindra-dummy" },
  },

  // ===== Agent / Work / Biz =====
  {
    // [US] Jasper AI
    match: /https?:\/\/(www\.)?jasper\.ai\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [US] Notion AI
    match: /https?:\/\/(www\.)?notion\.so\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [US] Slack / Slack AI
    match: /https?:\/\/.*slack\.com\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [US] Zoom / AI Companion
    match: /https?:\/\/.*zoom\.us\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [US] AgentGPT
    match: /https?:\/\/agentgpt\.reworkd\.ai\//,
    chat: { input: "mindra-dummy" },
  },
  {
    // [US] Aomni / Agent系
    match: /https?:\/\/(www\.)?aomni\.com\//,
    chat: { input: "mindra-dummy" },
  },
];


// ----------------------------------------------------------
// 最低限ステート
// ----------------------------------------------------------
window.UNIVERSAL_SEARCH = {
  lastQuery: "",
  lastResult: null,
};


/**
 * webview の URL を取得する。
 * @param {HTMLWebViewElement} wv 対象 webview。
 * @returns {string} 取得した URL 文字列。
 */
function getWebviewUrl(wv) {
  try {
    if (typeof wv.getURL === "function") return wv.getURL();
  } catch (_) {}
  try {
    if (wv.src) return wv.src;
  } catch (_) {}
  return "";
}


/**
 * webview の URL から適用する WEB_ACTION_RULES を取得する。
 * @param {HTMLWebViewElement} wv 対象 webview。
 * @returns {object|null} マッチしたルール、見つからない場合は null。
 */
function getRuleForWebview(wv) {
  const url = getWebviewUrl(wv) || "";
  for (const rule of WEB_ACTION_RULES) {
    try {
      if (rule.match && rule.match.test(url)) {
        return rule;
      }
    } catch (_) {}
  }
  return null;
}


// ----------------------------------------------------------
// 対象webview一覧（表示中のものだけに絞る）
// ----------------------------------------------------------

/**
 * webview が画面上で「見えている」か判定する。
 * @param {HTMLWebViewElement} wv 対象 webview。
 * @returns {boolean} 表示されている場合は true。
 */
function isVisibleWebview(wv) {
  try {
    const style = window.getComputedStyle(wv);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = wv.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    return true;
  } catch (_) {
    // 何か取れなかった場合は、とりあえず true 扱い（安全側）
    return true;
  }
}

function getTargets() {
  const views = window.mindraViews || {};

  // splitview があるならまずそこから（その中でも表示されているものだけ）
  if (typeof views.getSplitWebviews === "function") {
    try {
      const split = views.getSplitWebviews();
      if (Array.isArray(split) && split.length > 0) {
        const visibleSplit = split.filter(isVisibleWebview);
        if (visibleSplit.length > 0) return visibleSplit;
        // 全部不可視だった場合はそのまま split を返さず、下のフォールバックに回す
      }
    } catch (_) {}
  }

  // 全 webview から「見えているもの」だけ
  try {
    const all = Array.from(document.querySelectorAll("webview"));
    if (all.length > 0) {
      const visible = all.filter(isVisibleWebview);
      if (visible.length > 0) return visible;
      return all; // 全部不可視扱いなら一応 all を返す
    }
  } catch (_) {}

  // 最後の保険：アクティブ webview 単体
  if (typeof views.getActiveWebview === "function") {
    try {
      const active = views.getActiveWebview();
      if (active) return [active];
    } catch (_) {}
  }

  return [];
}


/**
 * 注入スクリプト（search/chat 完全統一版）を生成する。
 * @param {string} query 入力するクエリ文字列。
 * @param {object|null} rule WEB_ACTION_RULES のマッチ結果。
 * @returns {string} 実行するスクリプト文字列。
 */
function buildInjectionScript(query, rule) {
  const q = JSON.stringify(query);
  const cfg = JSON.stringify(
    rule
      ? {
          search: rule.search || null,
          chat: rule.chat || null,
        }
      : null
  );

  return `
    (function(q, cfg) {
      function isPseudo(sel) {
        return sel === 'mindra-dummy' || sel === 'mindra-ok' || sel === 'mindra-ng';
      }

      function typeAndSend(el, cfg) {
        if (!el) return false;

        el.focus();
        document.execCommand('insertText', false, q);

        try {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e) {}

        // ここから少し待ってから送信する
        setTimeout(function () {
          var sent = false;

          // ルールに sendButton があれば優先してクリック
          var btnSel = cfg && cfg.chat && cfg.chat.sendButton;
          if (btnSel && !isPseudo(btnSel)) {
            try {
              var btn = document.querySelector(btnSel);
              if (btn) {
                btn.click();
                sent = true;
              }
            } catch (e) {}
          }

          // クリックで送れなかった場合は Enter で送信
          if (!sent) {
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
          }

          // さらに保険として、フォーム経由なら submit も試す
          // FIXME: GLM ではトップページに戻ってしまうので実行しない（Claude では Enter で送信できないので実行する必要がある）
          if (!cfg?.chat?.is_glm) {
            try {
              var form = el.form;
              if (form) {
                form.submit();
              }
            } catch (e) {}
          }
        }, 150); // ← ここでちょっと待つ

        // 非同期送信なので true 固定でOK
        return true;
      }

      // ===== ルール由来の優先セレクタ =====
      var ruleSelectors = [];
      if (cfg && cfg.search && cfg.search.input && !isPseudo(cfg.search.input)) {
        ruleSelectors.push(cfg.search.input);
      }
      if (cfg && cfg.chat && cfg.chat.input && !isPseudo(cfg.chat.input)) {
        ruleSelectors.push(cfg.chat.input);
      }

      // ===== 汎用セレクタ =====
      var unifiedSelectors = [
        // 検索系
        'form[action="/search"] input[name="q"]',
        'input[type="search"]',
        'input[role="searchbox"]',
        'input[name="q"]',
        'input[placeholder*="検索"]',
        'input[placeholder*="Search"]',

        // チャット系
        'textarea[placeholder*="メッセージ"]',
        'textarea[placeholder*="message"]',
        'textarea[role="textbox"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-lexical-editor="true"]',
        'div[contenteditable="true"][data-placeholder]',
        'div[contenteditable="true"]'
      ];

      // ===== 候補の決定 =====
      var target = null;

      // 1) ルールで指定されているセレクタを優先
      for (var i = 0; i < ruleSelectors.length && !target; i++) {
        try {
          var elRule = document.querySelector(ruleSelectors[i]);
          if (elRule) target = elRule;
        } catch (_) {}
      }

      // 2) ルールで見つからなければ汎用セレクタから探す
      if (!target) {
        for (var j = 0; j < unifiedSelectors.length && !target; j++) {
          try {
            var elU = document.querySelector(unifiedSelectors[j]);
            if (elU) target = elU;
          } catch (_) {}
        }
      }

      // 3) 最後の保険
      if (!target) {
        target =
          document.querySelector('input[type="text"]') ||
          document.querySelector("textarea") ||
          document.querySelector('[contenteditable="true"]');
      }

      if (!target) {
        return "none";
      }

      var ok = typeAndSend(target, cfg || {});
      return ok ? "ok" : "none";
    })(${q}, ${cfg});
  `;
}


// ----------------------------------------------------------
//  runActionInWebview ：専用ルート → 汎用ルート
// ----------------------------------------------------------
async function runActionInWebview(wv, query) {
  const url = getWebviewUrl(wv) || "";

  // ========= Google 検索（トップ / 結果 共通） 専用ルート ==========
  if (/https?:\/\/www\.google\./.test(url)) {
    const code = `(function(q){
      // トップページ・検索結果ページ両方に対応するため、textarea / input 両方を見る
      var input =
        document.querySelector('form[action="/search"] textarea[name="q"]') ||
        document.querySelector('form[action="/search"] input[name="q"]') ||
        document.querySelector('textarea[name="q"]') ||
        document.querySelector('input[name="q"]');
      if (!input) return "google:no-input";

      input.focus();
      if ("value" in input) {
        input.value = q;
      } else {
        input.textContent = q;
      }

      try {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}

      setTimeout(function () {
        try {
          // 検索実行ボタンいろいろ
          var btn =
            document.querySelector('button[aria-label="検索"]') ||
            document.querySelector('button[aria-label="Google 検索"]') ||
            document.querySelector('button[aria-label="Search"]') ||
            document.querySelector('input[name="btnK"][type="submit"]');

          if (btn) {
            btn.click();
          } else if (input.form) {
            // フォームがあれば submit
            input.form.submit();
          } else {
            // それでもダメなら Enter を投げる
            var evInit = {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true
            };
            ['keydown','keypress','keyup'].forEach(function(t){
              input.dispatchEvent(new KeyboardEvent(t, evInit));
            });
          }
        } catch (_) {}
      }, 150);

      return "google:ok";
    })(${JSON.stringify(query)});`;

    try {
      if (typeof wv.executeJavaScript !== "function") return "error:no-exec";
      const result = await wv.executeJavaScript(code, false);
      return result || "none";
    } catch (_) {
      return "error:exception";
    }
  }

  // ========= Perplexity 専用ルート ==========
  if (/perplexity\.ai/.test(url)) {
    const code = `(function(q) {
      var el = document.querySelector(
        'div#ask-input[contenteditable="true"],' +
        'div[contenteditable="true"][data-test-id="user-textbox"],' +
        'div[contenteditable="true"][data-lexical-editor="true"]'
      );
      if (!el) return 'none';

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
      } catch (_) {}

      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        var ok = false;
        try { ok = document.execCommand('insertText', false, q); } catch (_) {}
        if (!ok) el.textContent = q;
      } catch (_) {
        el.textContent = q;
      }

      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}

      setTimeout(function () {
        try {
          var btn =
            document.querySelector('button[type="submit"]') ||
            document.querySelector('button[aria-label*="Send"]') ||
            document.querySelector('button[aria-label*="send"]');

          if (btn) {
            btn.click();
            return;
          }

          // 最後の保険：Enter
          var ev = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
          };
          ['keydown','keypress','keyup'].forEach(function(t){
            el.dispatchEvent(new KeyboardEvent(t, ev));
          });
        } catch (_) {}
      }, 150);

      return 'chat-perplexity-typed';
    })(${JSON.stringify(query)});`;

    try {
      if (typeof wv.executeJavaScript !== "function") return "error:no-exec";
      const result = await wv.executeJavaScript(code, false);
      return result || "none";
    } catch (_) {
      return "error:exception";
    }
  }

  // ========= Meta AI 専用ルート ==========
  if (/(meta\.ai|facebook\.com|instagram\.com|threads\.net)/.test(url)) {
    const code = `(function(q) {
      var el =
        document.querySelector('div[contenteditable="true"][role="textbox"]') ||
        document.querySelector('div[contenteditable="true"]');
      if (!el) return 'none';

      el.focus();
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, q);
      } catch (_) {
        el.textContent = q;
      }

      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}

      // 送信ボタンを探してクリック（Meta 対策・強化版）
      setTimeout(function () {
        try {
          var btn =
            document.querySelector('div[role="button"][aria-label*="送信"]') ||
            document.querySelector('div[role="button"][aria-label*="Send"]') ||
            document.querySelector('div[role="button"] svg')?.closest('div[role="button"]') ||
            document.querySelector('button[type="submit"]');

          if (btn) {
            btn.click();
            return;
          }

          // 最後の保険：Enter（Meta は効かないこと多いが一応）
          var ev = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
          };
          ['keydown','keypress','keyup'].forEach(function(t){
            el.dispatchEvent(new KeyboardEvent(t, ev));
          });
        } catch (_) {}
      }, 200);

      return 'chat-meta-sent';
    })(${JSON.stringify(query)});`;

    if (typeof wv.executeJavaScript !== "function") return "error:no-exec";
    const result = await wv.executeJavaScript(code, false);
    return result || "none";
  }

  // ========= GitHub Copilot 専用ルート ==========
  if (/github\.com\/copilot/.test(url)) {
    const code = `(function(q) {
      var el = document.querySelector('textarea');
      if (!el) return 'none';

      el.focus();
      el.value = q;

      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}

      return 'chat-copilot-typed';
    })(${JSON.stringify(query)});`;

    if (typeof wv.executeJavaScript !== "function") return "error:no-exec";
    const result = await wv.executeJavaScript(code, false);
    return result || "none";
  }

  // ========= Manus 専用ルート ==========
  if (/manus\.im\/app/.test(url)) {
    const code = `(function(q) {
      var el =
        document.querySelector('textarea[placeholder*="タスクを割り当てて"]') ||
        document.querySelector('textarea');
      if (!el) return 'none';

      el.focus();
      el.value = q;

      try {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}

      setTimeout(() => {
        try {
          var evInit = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
          };
          ['keydown', 'keypress', 'keyup'].forEach(t => {
            el.dispatchEvent(new KeyboardEvent(t, evInit));
          });
        } catch (_) {}
      }, 150);

      return 'chat-manus';
    })(${JSON.stringify(query)});`;

    if (typeof wv.executeJavaScript !== "function") return "error:no-exec";
    const result = await wv.executeJavaScript(code, false);
    return result || "none";
  }

  // ========= ここから汎用ルート ==========
  const rule = getRuleForWebview(wv);
  const code = buildInjectionScript(query, rule);

  try {
    if (typeof wv.executeJavaScript !== "function") return "error:no-exec";
    const result = await wv.executeJavaScript(code, false);
    return result || "none";
  } catch (_) {
    return "error:exception";
  }
}


// ----------------------------------------------------------
// エントリ（第2引数は互換のため受け取るだけで無視）
// ----------------------------------------------------------
window.runUniversalSearch = async function (query, _ignored) {
  const targets = getTargets();

  if (targets.length === 0) {
    const msg =
      "いい感じの入力欄が見つからなくて、操作できなかったよ。";
    window.UNIVERSAL_SEARCH.lastQuery = query;
    window.UNIVERSAL_SEARCH.lastResult = { targets: 0 };
    window.dispatchUniversalSearchResult(msg);
    return msg;
  }

  let successCount = 0;

  for (const wv of targets) {
    const status = await runActionInWebview(wv, query);
    if (status && !String(status).startsWith("error") && status !== "none") {
      successCount++;
    }
  }

  const msg =
    successCount === 0
      ? "いい感じの入力欄が見つからなくて、何もできなかったよ。"
      : "送信したよ。";

  window.UNIVERSAL_SEARCH.lastQuery = query;
  window.UNIVERSAL_SEARCH.lastResult = { targets: targets.length };

  window.dispatchUniversalSearchResult(msg);
  return msg;
};


// ----------------------------------------------------------
// AI サイドバーへ結果通知
// ----------------------------------------------------------
window.dispatchUniversalSearchResult = function (msg) {
  if (window.mindraAI?.receiveSearchResult) {
    window.mindraAI.receiveSearchResult(msg);
  } else {
    //_ignore
  }
};
