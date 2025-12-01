// 役割: natural-command の結果に応じて各モジュールへ振り分ける（DM層）

(function () {
  async function handle(text) {
    const rawText = (text || "").toString();

    // natural-command がいる前提で NLU
    const cmd =
      window.mindraNaturalCommand && window.mindraNaturalCommand.parse
        ? window.mindraNaturalCommand.parse(rawText)
        : { type: "chat", raw: rawText };

    console.log("DISPATCH CMD:", cmd);

    try {
      // ===== 要約 =====
      if (cmd.type === "summarize") {
        if (
          window.mindraSummarizer &&
          window.mindraSummarizer.summarizeActivePage
        ) {
          const res = await window.mindraSummarizer.summarizeActivePage();
          if (res && res.ok !== false) {
            return (res.summary || res.text || "").toString();
          }
          return "要約できませんでした。";
        }
        return "要約機能が利用できません。";
      }

      // ===== 検索 (search / search:) =====
      if (cmd.type === "search") {
        const q = (cmd.query || cmd.raw || rawText || "").toString().trim();
        if (!q) {
          return "検索キーワードが見つからなかったよ。";
        }

        if (typeof window.runUniversalSearch === "function") {
          return window.runUniversalSearch(q, { action: "search" });
        }
        return "検索機能が利用できません。";
      }

      // ===== say =====
      // → ブラウザ内の ChatGPT / Perplexity / Kimi などにメッセージを送る
      if (cmd.type === "say") {
        const msg = (cmd.message || cmd.raw || rawText || "").toString().trim();
        if (!msg) {
          return "送るメッセージが空だったよ。";
        }

        if (typeof window.runUniversalSearch === "function") {
          return window.runUniversalSearch(msg, { action: "chat" });
        }
        return "チャット入力機能が利用できません。";
      }

      // ===== fallback: 普通のローカルチャット =====
      if (window.mindraAI && typeof window.mindraAI.ask === "function") {
        const aiRes = await window.mindraAI.ask(rawText, []);
        if (!aiRes || !aiRes.ok) {
          return "AI からの応答が得られなかったよ。";
        }
        return (aiRes.message || aiRes.text || "").toString();
      }

      return "チャット機能が使えなかったよ。";
    } catch (err) {
      console.error("DISPATCH ERROR:", err);
      return "処理中にエラーが発生したよ。";
    }
  }

  window.mindraDispatcher = { handle };
})();
