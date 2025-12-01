// summarizer.js
// Mindra Light - ページ要約機能（仮実装）
// Webview の内容を取得 → 要約API（ローカルAI）へ送信 → 結果を返す

async function summarizeActivePage() {
  try {
    const wv = document.querySelector("webview[style*='visibility: visible']");
    if (!wv) throw new Error("Active WebView not found");

    const pageText = await wv.executeJavaScript(`
      (function () {
        const content = document.querySelector("#mw-content-text");
        if (!content) return document.body.innerText || "";
        return content.innerText || "";
      })();
    `);

    if (!pageText || pageText.trim().length === 0) {
      return { ok: false, error: "ページのテキストが取得できませんでした" };
    }

    // 不要部分（参考文献・脚注・外部リンク）を自動カット
    let cleaned = pageText;

    // よくある Wikipedia の終端見出し
    const removeSections = [
      "参考文献",
      "脚注",
      "出典",
      "外部リンク",
      "関連項目",
    ];

    for (const section of removeSections) {
      const idx = cleaned.indexOf(section);
      if (idx !== -1) {
        cleaned = cleaned.substring(0, idx).trim();
      }
    }

    cleaned = cleaned.replace(/目次[\\s\\S]*?\\n\\n/, "");

    // 要約プロンプトを作成
    const prompt = `
    次の文章を **日本語だけ** で要約してください。

    ▼絶対に守るルール
    ・最初に「以下は要約です」などの前置き文を書かない  
    ・結論から簡潔に書く  
    ・Wikipedia特有の「参考文献」「脚注」「出典」「外部リンク」は含めない  
    ・本文の要点のみを 5〜8 文でまとめる  
    ・英語は1文字も書かない  

    ▼本文
    ${cleaned}
    `;

    // ローカルAI（Ollama）へ投げる
    if (!window.mindraAI || typeof window.mindraAI.chat !== "function") {
      return { ok: false, error: "AIバックエンドが利用できません" };
    }

    const res = await window.mindraAI.chat(prompt, { history: [] });

    if (typeof res === "string") {
      return { ok: true, summary: res };
    }

    if (res && res.ok && typeof res.text === "string") {
      return { ok: true, summary: res.text };
    }

    return { ok: false, error: res?.error || "要約に失敗しました" };
  } catch (e) {
    console.error("[summarizer.js] summarizeActivePage error", e);
    return { ok: false, error: e.message };
  }
}

// 他ファイルから使えるよう export
window.mindraSummarizer = {
  summarizeActivePage,
};
