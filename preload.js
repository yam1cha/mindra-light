// preload.js
const { contextBridge, ipcRenderer } = require("electron");

// ウインドウ制御 API
contextBridge.exposeInMainWorld("mindraWindow", {
  control: (action) => ipcRenderer.invoke("window-control", action),
  getBounds: () => ipcRenderer.invoke("window-get-bounds"),
  setPosition: (x, y) =>
    ipcRenderer.invoke("window-set-position", { x, y }),
});

// ショートカット通知 API
contextBridge.exposeInMainWorld("mindraShortcuts", {
  /**
   * main.js から送られてくるショートカットイベントを購読する
   */
  onShortcut: (handler) => {
    if (typeof handler !== "function") return;

    // 念のため既存リスナは消しておく
    ipcRenderer.removeAllListeners("mindra-shortcut");

    ipcRenderer.on("mindra-shortcut", (_event, payload) => {
      try {
        handler(payload);
      } catch (err) {
        console.error("[mindraShortcuts handler error]", err);
      }
    });
  },
});

/* ===========================================================
   サイト別コンテンツスクリプト / CSS 注入ヘルパ
   =========================================================== */

function buildNiconicoCss() {
  return `
/* === ニコニコ専用 広告・告知系をまとめて非表示（これは推論寄り） === */

/* ランキングに挟まるニコニ広告ブロック */
div.NC-MediaObject_withAction.RankingMainNicoad.NC-NicoadMediaObject {
  display: none !important;
}

/* Tailwind 化後の広告ゾーンっぽいところ（右サイド含む） */
[data-zone] {
  display: none !important;
}

/* クラス名に ad が入っている汎用枠（控えめに） */
div[class*="adBanner"],
div[class*="ad-banner"],
div[class*="ad_area"],
div[class*="ad-area"],
div[class*="adContainer"],
div[class*="ad-container"],
aside[class*="ad"],
section[class*="ad-"],
div[id^="ad_"],
div[id*="_ad_"] {
  display: none !important;
}

/* ページ上部のマルチバナー（古い Marquee 系も含めて掃除） */
.MarqueeContainer,
div[class*="marquee"],
div[id*="marquee"] {
  display: none !important;
}

/* 市場（Ichiba）系ブロック */
.IchibaContainer,
div[class*="ichiba"],
div[id*="ichiba"] {
  display: none !important;
}

/* フッター広告・おすすめ系ブロック（控えめ） */
footer div[class*="ad"],
footer section[class*="ad"],
div[class*="adFooter"],
div[id*="adFooter"] {
  display: none !important;
}
`;
}

/**
 * Yahoo!系サイト向けの軽い広告隠し。
 */
function buildYahooCss() {
  return `
/* Yahoo!ニュース等の広告枠 */
div[id^="yads-"],
div[class*="yads-"],
div[class*="adList"],
div[class*="ad-area"],
div[class*="ad-area-"],
section[class*="ad-"],
aside[class*="ad-"] {
  display: none !important;
}

/* ページ右側の長い広告カラム */
div[id*="ad_side"],
div[class*="ad_side"],
div[id*="adColumn"],
div[class*="adColumn"] {
  display: none !important;
}
`;
}

/**
 * YouTube 専用の広告強制削除スクリプト。
 * - playerResponse 内の ad 関連フィールド削除
 * - fetch / XHR 経由で返る player API の JSON からも広告フィールド削除
 * - 必要に応じて広告フェーズをスキップ
 */
function buildYouTubeAdblockScript() {
  return `
(() => {
  try {
    const logPrefix = "[MindraLight YouTubeAdblock]";

    // 広告っぽいフィールドを片っ端から削るヘルパ
    function stripAds(obj, depth = 0) {
      if (!obj || typeof obj !== "object" || depth > 5) return;

      const adKeys = [
        "adPlacements",
        "adPlacementsList",
        "adSlot",
        "adSlots",
        "playerAds",
        "adInfo",
        "adsInfo",
        "adSignalsInfo",
        "adTag",
        "ytAd",
        "adBreaks",
        "adParams",
      ];

      for (const k of Object.keys(obj)) {
        const lower = k.toLowerCase();
        if (adKeys.some((ak) => lower.indexOf(ak.toLowerCase()) !== -1)) {
          try {
            delete obj[k];
          } catch (_) {}
          continue;
        }
        const v = obj[k];
        if (typeof v === "object" && v) {
          stripAds(v, depth + 1);
        }
      }
    }

    // ytInitialPlayerResponse をフック
    try {
      let _origPlayerResp = null;
      const hasOrig = Object.prototype.hasOwnProperty.call(window, "ytInitialPlayerResponse");
      const origDesc = hasOrig ? Object.getOwnPropertyDescriptor(window, "ytInitialPlayerResponse") : null;

      Object.defineProperty(window, "ytInitialPlayerResponse", {
        configurable: true,
        enumerable: true,
        get() {
          return _origPlayerResp;
        },
        set(v) {
          try {
            if (v && typeof v === "object") {
              stripAds(v);
            }
          } catch (_) {}
          _origPlayerResp = v;
        },
      });

      if (origDesc && origDesc.value && typeof origDesc.value === "object") {
        try {
          stripAds(origDesc.value);
          _origPlayerResp = origDesc.value;
        } catch (_) {}
      }
    } catch (e) {
      console.warn(logPrefix, "ytInitialPlayerResponse hook failed:", e);
    }

    // fetch をフックして player API の JSON を書き換える
    try {
      const nativeFetch = window.fetch;
      window.fetch = async function(...args) {
        try {
          const res = await nativeFetch.apply(this, args);
          const url = (args[0] && args[0].url) || args[0];

          const isPlayer =
            typeof url === "string" &&
            (url.includes("/youtubei/v1/player") ||
             url.includes("get_video_info") ||
             url.includes("api/player"));

          if (!isPlayer || !res || !res.clone) {
            return res;
          }

          const clone = res.clone();
          let text;
          try {
            text = await clone.text();
          } catch {
            return res;
          }

          if (!text || text.length < 10) {
            return res;
          }

          let json;
          try {
            json = JSON.parse(text);
          } catch {
            return res;
          }

          try {
            stripAds(json);
          } catch (_) {}

          const newText = JSON.stringify(json);
          const newRes = new Response(newText, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
          });
          return newRes;
        } catch (e) {
          console.warn(logPrefix, "fetch hook error:", e);
          return nativeFetch.apply(this, args);
        }
      };
    } catch (e) {
      console.warn(logPrefix, "fetch override failed:", e);
    }

    // XHR をフックして player API の JSON を書き換える
    try {
      const NativeXHR = window.XMLHttpRequest;
      function PatchedXHR() {
        const xhr = new NativeXHR();
        const origOpen = xhr.open;
        const origSend = xhr.send;

        let _url = "";
        xhr.open = function(method, url, async, user, password) {
          _url = url || "";
          return origOpen.call(this, method, url, async, user, password);
        };

        xhr.send = function(body) {
          this.addEventListener("readystatechange", function() {
            try {
              if (this.readyState !== 4) return;
              const url = _url || "";
              const isPlayer =
                url.includes("/youtubei/v1/player") ||
                url.includes("get_video_info") ||
                url.includes("api/player");

              if (!isPlayer) return;
              if (!this.responseText) return;

              let json;
              try {
                json = JSON.parse(this.responseText);
              } catch {
                return;
              }
              stripAds(json);
              const newText = JSON.stringify(json);
              Object.defineProperty(this, "responseText", {
                configurable: true,
                enumerable: true,
                get() {
                  return newText;
                },
              });
            } catch (_) {
              // ignore
            }
          });
          return origSend.call(this, body);
        };

        return xhr;
      }
      window.XMLHttpRequest = PatchedXHR;
    } catch (e) {
      console.warn(logPrefix, "XMLHttpRequest override failed:", e);
    }

    // 広告フェーズっぽい状態をざっくりスキップする
    try {
      setInterval(() => {
        try {
          const video = document.querySelector("video");
          if (!video) return;

          // 再生中で、残り時間に対して再生位置がおかしい（広告中っぽい）ときに飛ばす
          if (!video.paused && !video.ended && video.duration < 4000 && video.currentTime > 0.0) {
            video.currentTime = video.duration || 10000;
          }

          // プレミアム誘導のオーバーレイなども非表示に
          const adOverlays = document.querySelectorAll(
            ".video-ads, .ytp-ad-overlay-slot, .ytp-ad-player-overlay, .ytp-ad-module"
          );
          adOverlays.forEach((el) => {
            el.style.setProperty("display", "none", "important");
            el.style.setProperty("visibility", "hidden", "important");
            el.style.setProperty("opacity", "0", "important");
          });
        } catch (_) {}
      }, 1000);
    } catch (e) {
      console.warn(logPrefix, "ad skip interval error:", e);
    }
  } catch (e) {
    console.warn("[MindraLight YouTubeAdblock] failed to initialize:", e);
  }
})();
`;
}

/**
 * URL に応じて注入すべき CSS / JS を返す。
 * - css: string | null
 * - js: string | null
 */
function getInjectionForUrlRaw(urlString) {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();

    // YouTube: 強めの広告ブロック
    if (
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be"
    ) {
      return {
        css: null,
        js: buildYouTubeAdblockScript(),
      };
    }

    // ニコニコ
    if (
      host === "www.nicovideo.jp" ||
      host === "nicovideo.jp" ||
      host.endsWith(".nicovideo.jp")
    ) {
      return {
        css: buildNiconicoCss(),
        js: null,
      };
    }

    // Yahoo!系
    if (
      host.endsWith(".yahoo.co.jp") ||
      host === "yahoo.co.jp" ||
      host.endsWith(".yahoo.com")
    ) {
      return {
        css: buildYahooCss(),
        js: null,
      };
    }

    // デフォルト：なにもしない
    return { css: null, js: null };
  } catch (e) {
    console.warn("[mindraContentScripts] getInjectionForUrlRaw error:", e);
    return { css: null, js: null };
  }
}

// renderer（index.html 側）から使うための API として公開
contextBridge.exposeInMainWorld("mindraContentScripts", {
  /**
   * URL 文字列を渡すと、そのページに対して注入すべき CSS / JS を返す。
   *
   * 例:
   *   const inj = window.mindraContentScripts.getInjectionForUrl(currentUrl);
   *   if (inj.css) webview.insertCSS(inj.css);
   *   if (inj.js) webview.executeJavaScript(inj.js);
   */
  getInjectionForUrl: (url) => {
    if (typeof url !== "string" || !url) {
      return { css: null, js: null };
    }
    return getInjectionForUrlRaw(url);
  },
});
