// =====================================================
// MindraLight - X automation module (scroll / count / read)
// =====================================================
(function () {
  // X 関連コマンド共通の中断フラグ（ホスト側）
  window.__mindraXHostAbort = false;
  // --------------------------------------------------
  // 汎用待機
  // --------------------------------------------------
  function waitMs(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  // --------------------------------------------------
  // アクティブな webview 内で JS を実行
  // --------------------------------------------------
  async function evalInActiveTab(code) {
    let wv = null;

    if (typeof window.getActiveWebview === "function") {
      try {
        wv = window.getActiveWebview();
      } catch (e) {
        console.warn("[x-commands] getActiveWebview error", e);
      }
    }

    if (!wv && typeof window.currentTabId === "number") {
      const byId = document.querySelector(
        `webview[data-tab-id="${window.currentTabId}"]`
      );
      if (byId) wv = byId;
    }

    if (!wv) {
      wv = document.querySelector("webview");
    }

    if (!wv || typeof wv.executeJavaScript !== "function") {
      console.warn("[x-commands] no active webview / executeJavaScript");
      return "Xタブに JavaScript を送れなかったよ。";
    }

    try {
      return await wv.executeJavaScript(code, true);
    } catch (err) {
      console.error("[x-commands] executeJavaScript error", err);
      return "Xタブ実行中にエラーが起きたよ。";
    }
  }

  // =====================================================
  // 「新しいポストを表示」ボタンを上部で押して展開
  // =====================================================
  async function expandNewPostsAtTop() {
    const code = `
      (async function () {
        function wait(ms){return new Promise(r=>setTimeout(r,ms));}
        window.__mindraXAbort = window.__mindraXAbort || false;

        window.scrollTo({ top: 0, behavior: "instant" });
        await wait(300);

        for (let i = 0; i < 3; i++) {
          if (window.__mindraXAbort) {
            return { ok:false, reason:"aborted" };
          }

          const candidates = Array.from(
            document.querySelectorAll('button, div[role="button"], span[role="button"]')
          );

          const target = candidates.find((el) => {
            const t = (el.innerText || "").trim();
            if (!t) return false;

            // 日本語UI
            if (t.includes("件のポストを表示")) return true;
            if (t.includes("ポストを表示")) return true;

            // 英語UI
            if (/Show \\d+ posts?/i.test(t)) return true;
            if (t.includes("Show") && t.includes("posts")) return true;

            return false;
          });

          if (!target) {
            return { ok:true, clicked:false };
          }

          try { target.click(); } catch(e) {}
          await wait(1500);
        }

        return { ok:true, clicked:true };
      })();
    `;
    const res = await evalInActiveTab(code);
    if (typeof res === "string") return { ok: false, error: res };
    return res || { ok: true };
  }

  // =====================================================
  // Xホーム / フォロー中 タブを準備＋新着ポスト展開
  // =====================================================
  async function ensureXHomeTabActive() {
    if (window.splitCanvasMode) {
      return { ok: true, mode: "splitview" };
    }

    let wv = null;
    if (typeof window.getActiveWebview === "function") {
      try {
        wv = window.getActiveWebview();
      } catch (e) {
        console.warn("[x-commands] getActiveWebview error", e);
      }
    }
    if (!wv) {
      wv =
        document.querySelector(`webview[data-tab-id="${window.currentTabId}"]`) ||
        document.querySelector("webview");
    }

    const isXUrl = (url) => {
      if (!url) return false;
      try {
        const u = new URL(url);
        const h = u.hostname;
        return (
          h === "x.com" ||
          h === "www.x.com" ||
          h === "twitter.com" ||
          h === "www.twitter.com"
        );
      } catch {
        return false;
      }
    };

    const getCurrentUrl = () => {
      try {
        if (wv && typeof wv.getURL === "function") {
          return wv.getURL();
        }
      } catch {}
      return (wv && (wv.getAttribute("src") || wv.src)) || "";
    };

    let currentUrl = getCurrentUrl();
    const xUrl = "https://x.com/home";
    let mode = "existing";

    if (!isXUrl(currentUrl)) {
      mode = "opened";
      if (typeof window.createTab === "function") {
        try {
          window.createTab(xUrl, true);
        } catch (e) {
          console.error("[x-commands] createTab for X failed", e);
          return { ok: false, error: "Xのタブを開くのに失敗したよ。" };
        }
      } else if (wv) {
        try {
          wv.src = xUrl;
        } catch (e) {
          console.error("[x-commands] set src for X failed", e);
          return { ok: false, error: "Xのタブを開くのに失敗したよ。" };
        }
      } else {
        return { ok: false, error: "Xを開くタブが見つからなかったよ。" };
      }

      await waitMs(800);
    }

    const ready = await waitForXHomeFollowingReady(20000);
    if (!ready || !ready.ok) {
      return {
        ok: false,
        error:
          "Xのホーム/フォロー中で最初の投稿が表示される前にタイムアウトしたよ。",
      };
    }

    const exp = await expandNewPostsAtTop();
    if (!exp.ok && exp.reason === "aborted") {
      return { ok: false, error: "処理が中断されたよ。" };
    }

    return { ok: true, mode };
  }

  // --------------------------------------------------
  // X 内で home → フォロー中 → 最初の tweet まで待つ
  // --------------------------------------------------
  async function waitForXHomeFollowingReady(timeoutMs = 20000) {
    const code = `
      (async function () {
        function wait(ms){return new Promise(r=>setTimeout(r,ms));}
        window.__mindraXAbort = window.__mindraXAbort || false;

        function isXHost(){
          const h = location.hostname;
          return (
            h === "x.com" ||
            h === "www.x.com" ||
            h === "twitter.com" ||
            h === "www.twitter.com"
          );
        }

        async function clickHome(){
          const el =
            document.querySelector('[data-testid="AppTabBar_Home_Link"]') ||
            document.querySelector('a[href="/home"]');
          if (el) { el.click(); return true; }
          return false;
        }

        async function clickFollowing(){
          const parent =
            document.querySelector('[data-testid="ScrollSnap-List"]') || document;
          const tabs = Array.from(
            parent.querySelectorAll('a[role="tab"],div[role="tab"],[data-testid="ScrollSnap-List"] a')
          );
          const t = tabs.find((el) => {
            const label = (el.innerText || "").trim();
            return label === "フォロー中" || label === "Following";
          });
          if (t) { t.click(); return true; }
          return false;
        }

        const timeout = ${timeoutMs};
        const start = Date.now();
        let homeDone = false;
        let followDone = false;

        while (Date.now() - start < timeout) {
          if (window.__mindraXAbort) {
            return { ok:false, reason:"aborted" };
          }

          if (!isXHost()) {
            await wait(500);
            continue;
          }

          if (!homeDone) {
            await clickHome();
            homeDone = true;
            await wait(1500);
            continue;
          }

          if (!followDone) {
            const ok = await clickFollowing();
            if (ok) {
              followDone = true;
              await wait(1500);
              continue;
            }
          }

          const tw = document.querySelector('article[data-testid="tweet"]');
          if (tw) {
            return { ok: true };
          }

          await wait(500);
        }
        return { ok: false };
      })();
    `;
    const res = await evalInActiveTab(code);
    if (typeof res === "string") return { ok: false, error: res };
    if (res && res.reason === "aborted") return { ok: false, error: "処理が中断されたよ。" };
    return res || { ok: false };
  }

  // ==================================================
  // scroll 用スクリプト
  // ==================================================
  function buildXScrollScript(seconds) {
    const dur = Math.max(1, seconds | 0) * 1000;

    return `
      (async function(){
        try{
          function wait(ms){return new Promise(r=>setTimeout(r,ms));}
          window.__mindraXAbort = false;

          const vh = window.innerHeight || 800;
          const base = vh*0.6;
          const jit  = vh*0.15;

          const start = performance.now();
          while (performance.now() - start < ${dur}) {
            if (window.__mindraXAbort) {
              return { ok:false, reason:"aborted" };
            }
            const step = base + (Math.random() - 0.5) * jit;
            window.scrollBy({ top: step, behavior: "smooth" });
            let waited = 0;
            const totalWait = 1400 + Math.random() * 800;
            while (waited < totalWait) {
              if (window.__mindraXAbort) {
                return { ok:false, reason:"aborted" };
              }
              const chunk = Math.min(300, totalWait - waited);
              await wait(chunk);
              waited += chunk;
            }
          }
          return { ok: true };
        } catch(e) {
          console.error("[mindraX scroll error]", e);
          return { ok:false, error:String(e) };
        }
      })();
    `;
  }

// ===============================================
// X 用 朝の挨拶判定（LLM 呼び出し）
// ===============================================
async function mindraCheckMorningGreetingWithLLM(text) {
  const content = (text || "").trim();
  if (!content) return "[false] 空のテキストなので判定できません。";

  if (!window.mindraAI || typeof window.mindraAI.chat !== "function") {
    console.error("[x-commands] mindraAI.chat が見つからないよ");
    return "[false] LLM バックエンドを利用できないため判定できません。";
  }

  const prompt = `
あなたは X（旧Twitter）のポスト内容を理解して、分類するアシスタントです。

### タスク
次のポストが朝の挨拶を意味する内容かを判定してください。

### 朝の挨拶とは
「おはよう」「おはよー」「おは〇〇」「起きた」など

### 出力フォーマット（厳守）
- 朝の挨拶を意味する場合:
  [morning] （なぜそう判断したのかを日本語で一文で書いてください）
- それ以外の場合:
  [false] （なぜそう判断したのかを日本語で一文で書いてください）

### 判定対象のポスト本文
${content}
`;

  try {
    const res = await window.mindraAI.chat(prompt, { history: [] });

    let textRes;
    if (typeof res === "string") {
      textRes = res;
    } else if (res && typeof res.text === "string") {
      textRes = res.text;
    } else if (res && typeof res.content === "string") {
      textRes = res.content;
    } else {
      textRes = String(res ?? "");
    }

    const trimmed = textRes.trim();
    if (!trimmed) {
      return "[false] 応答が空だったため判定できません。";
    }

    return trimmed;
  } catch (e) {
    console.error("[x-commands] mindraCheckMorningGreetingWithLLM error", e);
    return "[false] LLM 呼び出しエラーが発生したため判定できません。";
  }
}

  // =====================================================
  // X タイムライン用ステップ実行ヘルパーをインストール
  //   - webview 内に window.mindraXReadStep(options) を定義
  //   - 状態は window.__mindraXReadState に保持（継続可能）
  // =====================================================
  function buildXReadStepInstallScript() {
    return `
      (function () {
        try {
          // 中断フラグ（毎回リセット）
          window.__mindraXAbort = false;

          // 状態を初期化
          window.__mindraXReadState = {
            seenKeys: new Set(),
            count: {
              normal: 0,
              reply: 0,
              retweet: 0,
              quote: 0,
              ad: 0,
              liked: 0
            },
            collected: 0,
            noNewLoops: 0,
            finished: false
          };

          function wait(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
          }

          function getTweetKey(articleEl) {
            const link = articleEl.querySelector('a[href*="/status/"]');
            if (link) {
              const href = link.getAttribute("href") || "";
              const m = href.match(/\\/status\\/(\\d+)/);
              if (m) return m[1];
              return href;
            }
            const t = articleEl.querySelector("time");
            const dt = t ? (t.getAttribute("datetime") || "") : "";
            const textEl = articleEl.querySelector('[data-testid="tweetText"]');
            const txt = textEl ? textEl.innerText : "";
            return dt + ":" + txt.slice(0, 80);
          }

          // 種別 + いいね状態
          function classifyTweet(articleEl) {
            if (!articleEl) return { kind: "normal", liked: false };

            const full = articleEl.innerText || "";

            const spans = Array.from(articleEl.querySelectorAll("span"))
              .map((s) => (s.innerText || "").trim())
              .filter((t) => t && t.length <= 120);

            const social =
              (articleEl.querySelector('[data-testid="socialContext"]')?.innerText || "")
              .trim();

            const tweet =
              (articleEl.querySelector('[data-testid="tweetText"]')?.innerText || "")
              .trim();

            const firstLine = tweet.split("\\n")[0].trim();

            const combined = (social + "\\n" + full + "\\n" + spans.join("\\n")).toLowerCase();

            const liked =
              articleEl.querySelector('[data-testid="unlike"]') ||
              articleEl.querySelector('[aria-label*="Undo like"]') ||
              articleEl.querySelector('[aria-label*="いいねを取り消す"]') ||
              articleEl.querySelector('[aria-pressed="true"][data-testid="like"]');

            // 1. 広告
            if (
              /\\bpromoted\\b/.test(combined) ||
              /\\bsponsored\\b/.test(combined) ||
              /\\bad\\b/.test(combined) ||
              /プロモーション/.test(combined)
            ) {
              return { kind: "ad", liked: !!liked };
            }

            // 2. リツイート / リポスト
            if (
              /さんがリツイート/.test(combined) ||
              /さんがリポスト/.test(combined) ||
              /\\breposted\\b/.test(combined) ||
              /\\bretweeted\\b/.test(combined) ||
              /\\brepost\\b/.test(combined) ||
              /\\bretweet\\b/.test(combined) ||
              /リツイート/.test(combined) ||
              /リポスト/.test(combined)
            ) {
              return { kind: "retweet", liked: !!liked };
            }

            // 3. 引用リツイート
            const hasQuoteCard =
              articleEl.querySelector('[data-testid="tweetCard"]') ||
              articleEl.querySelector('[data-testid="previewCard"]') ||
              articleEl.querySelector('[data-testid="card.wrapper"]');

            if (
              hasQuoteCard ||
              /引用ツイート/.test(combined) ||
              /引用/.test(combined) ||
              /quote tweet/.test(combined) ||
              /quoted post/.test(combined) ||
              /quoting/.test(combined)
            ) {
              return { kind: "quote", liked: !!liked };
            }

            // 4. リプライ
            const isReplyByText =
              /返信先/.test(combined) ||
              /への返信/.test(combined) ||
              /返信をさらに表示/.test(combined) ||   // ★追加
              /返信を表示/.test(combined) ||           // ★追加（バリエーション用）
              /replying to/.test(combined) ||
              /in reply to/.test(combined) ||
              /replied to/.test(combined) ||
              /replied/.test(combined);

            const isReplyByHandle =
              firstLine.startsWith("@") ||
              tweet.trim().startsWith("@") ||
              tweet.trim().startsWith("＠");          // 全角＠対策

            if (isReplyByText || isReplyByHandle) {
              return { kind: "reply", liked: !!liked };
            }

            // 5. スペース
            const isSpace =
              articleEl.querySelector('[data-testid="audioSpaceCard"]') ||
              articleEl.querySelector('a[href*="/i/spaces/"]') ||
              Array.from(articleEl.querySelectorAll('svg[aria-label]'))
                .some(svg => {
                  const label = (svg.getAttribute("aria-label") || "").toLowerCase();
                  return label.includes("space") || label.includes("スペース");
                });

            if (isSpace) {
              return { kind: "space", liked: !!liked };
            }

            // いいね
            const likeBtn =
              articleEl.querySelector('[data-testid="like"]') ||
              articleEl.querySelector('div[aria-label="いいね"]') ||
              articleEl.querySelector('div[aria-label="Like"]');

            //if (likeBtn) {
            //  likeBtn.click();
            //}

            // 5. 通常
            return { kind: "normal", liked: !!liked };
          }

          // ------------------------------
          // 1ステップ分だけ進める関数
          // ------------------------------
          window.mindraXReadStep = async function (options) {
            const maxTotal   = (options && options.maxTotal)   || 50;
            const maxPerStep = (options && options.maxPerStep) || 10;
            const maxNoNew   = (options && options.maxNoNew)   || 3;

            const state = window.__mindraXReadState;
            if (!state) {
              return { ok:false, error:"no-state" };
            }
            if (state.finished) {
              return { ok:true, tweets: [], count: state.count, finished: true };
            }

            const newTweets = [];
            const list = Array.from(
              document.querySelectorAll('article[data-testid="tweet"]')
            );

            for (const a of list) {
              if (newTweets.length >= maxPerStep) break;
              if (state.collected >= maxTotal) break;

              const key = getTweetKey(a);
              if (!key || state.seenKeys.has(key)) continue;
              state.seenKeys.add(key);

              // ユーザー名ブロック
              const userNameBlock = a.querySelector('div[data-testid="User-Name"]');

              let name = "";
              let handle = "";

              if (userNameBlock) {
                const spanTexts = Array.from(
                  userNameBlock.querySelectorAll("span")
                )
                  .map((el) => (el.innerText || "").trim())
                  .filter(Boolean);

                // 表示名（1個目）
                if (spanTexts.length > 0) {
                  name = spanTexts[0];
                }

                // ハンドル（@から始まるものを探す）
                const h = spanTexts.find((t) => t.startsWith("@") || t.startsWith("＠"));
                if (h) {
                  handle = h;
                }
              }

              // 投稿日時（datetime）
              let datetime = "";
              const timeEl = a.querySelector("time");
              if (timeEl) {
                // ISO形式の datetime 属性を優先
                datetime = timeEl.getAttribute("datetime") || timeEl.innerText || "";
              }

              // テキスト（本文）
              const textEl = a.querySelector('[data-testid="tweetText"]');
              const text = (textEl && textEl.innerText) || "";

              const info = classifyTweet(a);
              const type = info.kind;

              if (state.count.hasOwnProperty(type)) {
                state.count[type]++;
              } else {
                state.count.normal++;
              }
              if (info.liked) {
                state.count.liked++;
              }

              state.collected++;
              newTweets.push({
                key,
                name,
                handle,
                datetime,
                text,
                type,
                liked: !!info.liked
              });
            }

            if (newTweets.length === 0) {
              state.noNewLoops++;
            } else {
              state.noNewLoops = 0;
            }

            if (
              state.collected >= maxTotal ||
              state.noNewLoops >= maxNoNew ||
              window.__mindraXAbort
            ) {
              state.finished = true;
            } else {
              // 次のステップ用に少しスクロールしておく
              window.scrollBy({
                top: (window.innerHeight || 800) * 0.8,
                behavior: "smooth",
              });
              await wait(1000 + Math.random() * 500);
            }

            return {
              ok: true,
              tweets: newTweets,    // 今回新しく見つかったぶんだけ
              count: state.count,   // 累計
              finished: state.finished,
            };
          };

          return { ok:true };
        } catch (e) {
          console.error("[mindraX] read-step install error", e);
          return { ok:false, error:String(e) };
        }
      })();
    `;
  }

  // ==================================================
  // 指定 key のツイート詳細を開き、返信欄に text を入れるスクリプト
  // - 投稿は人間が送信ボタンを押す
  // - 入力後、最大30秒 or __mindraXAbort まで待ってからタイムラインに戻る
  // ==================================================
  function buildXOpenTweetByKeyScript(key, text) {
    const safeKey = String(key)
      .replace(/`/g, "\\`")
      .replace(/\\$/g, "\\$");

    const safeText = text == null
      ? ""
      : String(text)
          .replace(/`/g, "\\`")
          .replace(/\\$/g, "\\$")
          .replace(/\r?\n/g, "\\n"); // 改行をエスケープ

    return `
      (async function () {
        try {
          function wait(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
          }

          // article から一意キーを作る
          function getTweetKey(articleEl) {
            const link = articleEl.querySelector('a[href*="/status/"]');
            if (link) {
              const href = link.getAttribute("href") || "";
              const m = href.match(/\\/status\\/(\\d+)/);
              if (m) return m[1];
              return href;
            }
            const t = articleEl.querySelector("time");
            const dt = t ? (t.getAttribute("datetime") || "") : "";
            const textEl = articleEl.querySelector('[data-testid="tweetText"]');
            const txt = textEl ? textEl.innerText : "";
            return dt + ":" + txt.slice(0, 80);
          }


          function isReplyDetailTweet(articleEl) {
            if (!articleEl) return false;

            const textEl = articleEl.querySelector('[data-testid="tweetText"]');
            const rawText = textEl && typeof textEl.innerText === "string"
              ? textEl.innerText
              : "";
            const text = rawText || "";
            const firstLine = (text || "").split("\\n", 1)[0].trim();

            let ctxTexts = [];
            ctxTexts.push(articleEl.innerText || "");
            let p = articleEl.parentElement;
            for (let i = 0; i < 2 && p; i++) {
              ctxTexts.push(p.innerText || "");
              p = p.parentElement;
            }
            const ctx = (Array.isArray(ctxTexts) ? ctxTexts : [])
              .join("\\n")
              .toLowerCase();

            const hasReplyLabel =
              ctx.includes("返信先") ||
              ctx.includes("への返信") ||
              ctx.includes("返信をさらに表示") ||
              ctx.includes("返信を表示") ||
              ctx.includes("replying to") ||
              ctx.includes("in reply to") ||
              ctx.includes("replied to") ||
              ctx.includes("replied");

            const startsWithHandle =
              firstLine.startsWith("@") ||
              firstLine.startsWith("＠");

            const replyLink = articleEl.querySelector(
              'a[aria-label*="返信"], a[aria-label*="reply"], a[aria-label*="Reply"]'
            );

            return hasReplyLabel || startsWithHandle || !!replyLink;
          }

          // 対象ツイートを探す
          const list = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
          const target = list.find((a) => getTweetKey(a) === "${safeKey}");

          if (!target) {
            return { ok:false, reason:"not-found" };
          }

          // 中央付近までスクロール
          try { target.scrollIntoView({ behavior:"smooth", block:"center" }); } catch (e) {}
          await wait(500);

          // 詳細画面を開く
          let link = target.querySelector('a[href*="/status/"]');
          const clickable = link || target;
          try {
            clickable.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true, buttons:1 }));
          } catch (e) {
            try { clickable.click(); } catch (e2) {}
          }

          // /status/ ページになるのを待つ
          const maxOpenWait = 10000;
          const openStep = 300;
          let openWaited = 0;
          while (openWaited < maxOpenWait) {
            if (window.__mindraXAbort) {
              return { ok:false, reason:"aborted" };
            }
            if (location.pathname.includes("/status/")) break;
            await wait(openStep);
            openWaited += openStep;
          }


          // 詳細ポストの article を取得
          await wait(2000);
          const detailArticle = document.querySelector('article[data-testid="tweet"]');
          if (!detailArticle) {
            return { ok:false, reason:"no-detail-article" };
          }

          // ★ ここでリプかどうか判定
          const isReply = isReplyDetailTweet(detailArticle);
          if (isReply) {
            // リプならいいねしないで終了
          }else{
            // いいねボタンがあれば押す（既にいいね済みは data-testid="unlike" などで判定してもOK）
            const alreadyLiked =
              detailArticle.querySelector('[data-testid="unlike"]') ||
              detailArticle.querySelector('[aria-label*="いいねを取り消す"]') ||
              detailArticle.querySelector('[aria-label*="Undo like"]');

            if (!alreadyLiked) {
              const likeBtn =
                detailArticle.querySelector('[data-testid="like"]') ||
                detailArticle.querySelector('div[aria-label="いいね"]') ||
                detailArticle.querySelector('div[aria-label="Like"]');
              if (likeBtn) {
                try { likeBtn.click(); } catch (e) {}
                await wait(800);
              }
            }
          }

          await wait(2000);

          // タイムラインに戻る
          try {
            if (location.pathname.includes("/status/")) {
              window.history.back();
            }
          } catch (e) {}
          await wait(1500);

          return { ok:true };


          // 軽く待ってから返信欄を探す
          await wait(5000);


          
          function findReplyBox() {
            // data-testid="tweetTextarea_*" 直下の contenteditable を優先
            const wrappers = Array.from(
              document.querySelectorAll('div[data-testid^="tweetTextarea_"]')
            );
            for (const w of wrappers) {
              const el = w.querySelector('div[contenteditable="true"]');
              if (el) return el;
            }

            // それでも無ければ広めに探す
            const cands = Array.from(
              document.querySelectorAll('div[contenteditable="true"]')
            );
            for (const el of cands) {
              let p = el;
              while (p) {
                const tid = p.getAttribute && p.getAttribute("data-testid");
                if (tid && tid.startsWith("tweetTextarea_")) {
                  return el;
                }
                p = p.parentElement;
              }
            }

            // 最後の保険
            return (
              document.querySelector('div[contenteditable="true"][role="textbox"]') ||
              null
            );
          }

          let input = findReplyBox();
          if (!input) {
            console.warn("[mindraX] reply input not found");
            return { ok:false, reason:"no-input" };
          }

          const before = input.innerText || "";

          const txt = "${safeText}";
          try { input.focus(); } catch (e) {}

          if (txt.length > 0) {
            // できるだけ人間の入力に近い形で入れる
            try {
              // 全選択して insertText
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(input);
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand("selectAll", false, null);
              document.execCommand("insertText", false, txt);
            } catch (e) {
              // ダメなら innerText / textContent 直書き
              input.innerText = txt;
              input.textContent = txt;
            }
            // React 側に変更を伝える
            try {
              input.dispatchEvent(new InputEvent("input", { bubbles:true }));
            } catch (e) {}
          }

          await wait(3000);

          // 送信ボタンを探してクリック
          const sendBtn = document.querySelector('[data-testid="tweetButtonInline"]');
          if (sendBtn) sendBtn.click();

          await wait(3000);

          // 送信 or 中断 or タイムアウトを待つ
          const maxWait = 30000; // 30秒
          const step = 300;
          let waited = 0;

          while (waited < maxWait) {
            if (window.__mindraXAbort) {
              return { ok:false, reason:"aborted" };
            }

            if (!document.body.contains(input)) {
              // 入力欄が DOM から消えた -> 送信 or 画面遷移
              break;
            }

            const now = input.innerText || "";
            if (before !== now && now.trim() === "") {
              // 一度何か入り、その後空になった -> 送信されたとみなす
              break;
            }

            await wait(step);
            waited += step;
          }

          // タイムラインに戻る
          try {
            if (location.pathname.includes("/status/")) {
              window.history.back();
            }
          } catch (e) {}
          await wait(1500);

          return { ok:true };
        } catch (e) {
          console.error("[mindraX open-by-key reply-fill error]", e);
          return { ok:false, error:String(e) };
        }
      })();
    `;
  }

  // ==================================================
  // コマンド入口
  // ==================================================
  window.mindraXCommand = async function (payload) {
    let raw = (payload || "").trim().toLowerCase();
    if (raw.startsWith("x:")) raw = raw.slice(2).trim();

    // ---------------- x:stop ----------------
    if (["stop", "abort", "中断", "停止"].includes(raw)) {
      // ホスト側中断フラグを ON
      window.__mindraXHostAbort = true;

      // webview 側の中断フラグも ON
      try {
        await evalInActiveTab(`
          (function () {
            window.__mindraXAbort = true;
            return true;
          })();
        `);
      } catch (e) {
        console.error("[x-commands] x:stop evalInActiveTab error", e);
      }

      return "X 関連の処理を止めるように指示したよ。";
    }

    // ---------------- x:read（ステップ実行 + リアルタイム出力） ----------------
    const readMatch = raw.match(/^read(?:\s*:\s*|\s+)?(\d+)?$/);
    if (readMatch) {
      let maxTotal = parseInt(readMatch[1], 10);
      if (!maxTotal || maxTotal < 1) maxTotal = 100;

      // ★ バックグラウンドで処理する
      (async () => {
        try {
          const ensure = await ensureXHomeTabActive();
          if (!ensure.ok) {
            if (typeof window.mindraAppendAiMessage === "function") {
              window.mindraAppendAiMessage(
                "assistant",
                ensure.error || "Xタブを準備できなかったよ。"
              );
            }
            return;
          }

          // webview 側にステップヘルパーをインストール（state リセット）
          const installRes = await evalInActiveTab(
            buildXReadStepInstallScript()
          );
          if (installRes && installRes.ok === false) {
            if (typeof window.mindraAppendAiMessage === "function") {
              window.mindraAppendAiMessage(
                "assistant",
                "ステップヘルパーのインストールに失敗したよ: " +
                  (installRes.error || "")
              );
            }
            return;
          }

          const typeLabel = {
            ad: "広告",
            retweet: "リツイート",
            quote: "引用リツイート",
            reply: "リプライ",
            space: "スペース",
            normal: "通常",
          };

          let allTweets = [];
          let finalCount = {
            normal: 0,
            reply: 0,
            retweet: 0,
            quote: 0,
            ad: 0,
            liked: 0,
          };
          let finished = false;
          let opened = 0;
          let failed = 0;

          // 今回の実行用に中断フラグをリセット
          window.__mindraXHostAbort = false;

          while (!finished && !window.__mindraXHostAbort) {
            const stepResult = await evalInActiveTab(`
              (async function () {
                if (typeof window.mindraXReadStep !== "function") {
                  return { ok:false, error:"no-step" };
                }
                return await window.mindraXReadStep({
                  maxTotal: ${maxTotal},
                  maxPerStep: 5,
                  maxNoNew: 3
                });
              })();
            `);

            if (!stepResult || !stepResult.ok) {
              if (typeof window.mindraAppendAiMessage === "function") {
                window.mindraAppendAiMessage(
                  "assistant",
                  "ステップ実行中にエラーが起きたよ: " +
                    (stepResult && stepResult.error
                      ? String(stepResult.error)
                      : "")
                );
              }
              break;
            }

            const stepTweets = stepResult.tweets || [];
            finalCount = stepResult.count || finalCount;
            finished = !!stepResult.finished;

            for (let i = 0; i < stepTweets.length; i++) {
              const t = stepTweets[i];
              allTweets.push(t);

              const index = allTweets.length;
              const kind = typeLabel[t.type] || "通常";
              const likeLabel = t.liked ? "いいね済" : "未いいね";

              // 判定しない
              if (t.type === "ad" || t.type === "retweet" || t.type === "quote" || t.type === "space" || t.type === "reply" || t.liked) {
                continue;
              }

              if (typeof window.mindraAppendAiMessage === "function") {
                window.mindraAppendAiMessage(
                  "assistant",
                  [
                  `【post ${index}/${maxTotal}】 ${kind} ${likeLabel}`,
                  `${t.name} ${t.handle} ${t.datetime}`,
                  `${t.text}`,
                  ].join("\n")
                );
              }

              // 描画させる（UIに一旦制御を返す）
              await waitMs(0);

              // LLM 判定（[true]/[false]/[error] + 理由）
              const judge = await mindraCheckMorningGreetingWithLLM(t.text);

              //if (typeof window.mindraAppendAiMessage === "function") {
              //  window.mindraAppendAiMessage(
              //    "assistant",
              //    `【LLM回答】\n${judge}`
              //  );
              //}

              const norm = String(judge).toLowerCase();
              const hasFalse = norm.includes("false");
              const hasMorning = norm.includes("morning");

              // 文字列の中に "false" があったら絶対開かない
              //if (!hasFalse && hasMorning) {
              //  opened++;
                await evalInActiveTab(
                  await buildXOpenTweetByKeyScript(t.key, norm)
                );
              //}

              await waitMs(3000);
            }

            // x:stop で中断されていたら進捗は出さずに抜ける
            if (window.__mindraXHostAbort) {
              break;
            }

            // イベントループに返す（UI 更新用）
            await new Promise((resolve) => setTimeout(resolve, 0));
          }

          // 終了したのでホスト側フラグをクリア
          window.__mindraXHostAbort = false;

          const aborted = window.__mindraXHostAbort;
          const c = finalCount;
          const total =
            (c.normal || 0) +
            (c.reply || 0) +
            (c.retweet || 0) +
            (c.quote || 0) +
            (c.ad || 0);

          const summaryHeader = aborted
            ? "x:stop によって途中で中断したよ。\n"
            : "タイムラインを最大 " + maxTotal + " 件読む処理が終わったよ。\n";

          const summary =
            summaryHeader +
            `実際に取得した投稿：${total} 件\n` +
            `挨拶と判定された投稿：${opened} 件\n`;

          if (typeof window.mindraAppendAiMessage === "function") {
            window.mindraAppendAiMessage("assistant", summary);
          }
        } catch (e) {
          console.error("[x-commands] x:read background error", e);
          if (typeof window.mindraAppendAiMessage === "function") {
            window.mindraAppendAiMessage(
              "assistant",
              "x:read の処理中にエラーが出ちゃった…。"
            );
          }
        }
      })();

      // 呼び出し元にはすぐ返す（バックグラウンドで進行）
      return `タイムラインを最大 ${maxTotal} 件読むね。\n結果はここに順番に表示していくよ。`;
    }

    // ---------------- scroll ----------------
    const sm = raw.match(/^scroll(?:\s*:\s*|\s+)?(\d+)?$/);
    if (sm) {
      let sec = parseInt(sm[1], 10);
      if (!sec || sec < 1) sec = 10;

      const ensure = await ensureXHomeTabActive();
      if (!ensure.ok) {
        return ensure.error || "Xタブを準備できなかったよ。";
      }

      const res = await evalInActiveTab(buildXScrollScript(sec));
      if (typeof res === "string") {
        return "スクロール中にエラーが出たかもしれないよ。";
      }
      if (!res || !res.ok) {
        if (res && res.reason === "aborted") {
          return "スクロールを途中で止めたよ。";
        }
        return "スクロール中にエラーが出たよ。";
      }

      return `フォロー中タイムラインで約 ${sec} 秒スクロールしたよ。`;
    }

    // それ以外
    return `Xコマンド「${payload}」はまだ対応してないよ。`;
  };
})();
