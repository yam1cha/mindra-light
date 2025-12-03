// natural-command → universal-search / summarize / local-AI へ振り分ける DM 層

(function () {
  async function handle(text) {
    const rawText = (text || "").toString();

    // NLU
    const cmd =
      window.mindraNaturalCommand && window.mindraNaturalCommand.parse
        ? window.mindraNaturalCommand.parse(rawText)
        : { type: "chat", raw: rawText };


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
          return "要約できなかった。";
        }
        return "要約機能が使えないよ。";
      }

      // ===== Web（search/say）=====
      if (cmd.type === "web") {
        const payload = (cmd.text || cmd.raw || rawText).toString().trim();
        if (!payload) return "内容が空だよ。";

        if (typeof window.runUniversalSearch === "function") {
          // action を渡さず auto → URL で自動判別
          return window.runUniversalSearch(payload);
        }
        return "Web 操作が使えない。";
      }

      // ===== ローカルAI =====
      if (window.mindraAI && typeof window.mindraAI.ask === "function") {
        const aiRes = await window.mindraAI.ask(rawText, []);
        if (!aiRes || !aiRes.ok) return "AI の応答がなかった。";
        return (aiRes.message || aiRes.text || "").toString();
      }

      return "チャット機能が使えなかった。";
    } catch (err) {
      console.error("DISPATCH ERROR:", err);
      return "処理中にエラーが起きた。";
    }
  }

  window.mindraDispatcher = { handle };
})();
