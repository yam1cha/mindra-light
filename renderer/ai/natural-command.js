// 自然文コマンド → 構造化コマンド（NLU層）

(function () {
  function normalize(text) {
    return (text || "").replace(/\s+/g, "").toLowerCase();
  }

  // ===== 検索クエリの抽出 =====
  function extractSearchQuery(text) {
    if (!text) return "";

    let q = text;

    // 末尾の「検索して」系を削る
    q = q.replace(
      /(を)?(検索して?|検索)\s*$/gi,
      ""
    );

    return q.trim();
  }

  // ===== say（旧 web_chat）用メッセージの抽出 =====
  function extractSayMessage(text) {
    if (!text) return "";

    let msg = text;

    // 末尾の「〜って◯◯」を削る
    msg = msg.replace(
      /(って送って|って送信して|って伝えて|って言って|と言って|っておくって)\s*$/g,
      ""
    );

    return msg.trim();
  }

  function parse(text) {
    const raw = text || "";
    const trimmed = raw.trim();
    const n = normalize(trimmed);

    // -------------------------
    // プレフィックス系（生コマンド）
    // -------------------------

    // search:◯◯
    if (/^search:/i.test(trimmed)) {
      const q = trimmed.replace(/^search:/i, "").trim();
      return {
        type: "search",
        raw,
        query: q,
      };
    }

    // say:◯◯
    if (/^say:/i.test(trimmed)) {
      const msg = trimmed.replace(/^say:/i, "").trim();
      return {
        type: "say",
        raw,
        message: msg,
      };
    }

    // -------------------------
    // 日本語自然文コマンド
    // -------------------------

    // ===== 要約 =====
    if (
      n === "要約" ||
      n === "要約して" ||
      n.endsWith("を要約して") ||
      n.endsWith("要約して") ||
      n.endsWith("要約") ||
      n.includes("ページ要約") ||
      n.includes("本文要約") ||
      n.includes("記事要約")
    ) {
      return { type: "summarize", raw };
    }

    // ===== say（ブラウザ側に「こう言って」と送る）=====
    if (
      n.endsWith("っておくって") ||
      n.endsWith("っておくれ") ||
      n.endsWith("って送って") ||
      n.endsWith("って送信して") ||
      n.endsWith("って伝えて") ||
      n.endsWith("って言って") ||
      n.endsWith("と言って") ||
      /.+って伝えて$/.test(n) ||
      /.+って言って$/.test(n)
    ) {
      return {
        type: "say",
        raw,
        message: extractSayMessage(raw),
      };
    }

    // ===== 検索 =====
    if (
      n.includes("検索して") ||
      n.includes("を検索") ||
      /.+を検索$/.test(n) ||
      /.+検索して$/.test(n) 
    ) {
      return {
        type: "search",
        raw,
        query: extractSearchQuery(raw),
      };
    }

    // ===== fallback: 通常チャット =====
    return { type: "chat", raw };
  }

  window.mindraNaturalCommand = { parse };
})();
