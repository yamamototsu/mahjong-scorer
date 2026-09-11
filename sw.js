// 卓上ポンづけ ── オフラインで開けるようにするための担当
//
// 麻雀店や人の家では電波が悪いことがある。アプリの本体と絵・音を先に取っておき、
// 圏外でも今までどおり開けるようにする。対局の記録はもともと端末の中なので、
// ここで用意するのは「アプリそのもの」だけ。
//
// ★ このファイルは手で置いているが、下の2行は build.js が書き替える。
//   VERSION が変わると新しい入れ物に入れ直し、古いものは捨てる。
const VERSION = "d879c3e6f7c1";
const EXTRA = ["https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js","https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"];   // React など、外から読み込むもの（build.js が入れる）

const CACHE = "ponzuke-" + VERSION;

// アプリを開くのに要るもの。音声は数が多いので、使ったときに取っておく方式にする
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./assets/table.jpg",
  "./assets/intro.jpg",
];

// あとから取っておく先（フォント・音声）。本体とは別の入れ物にして、
// アプリを更新しても消えないようにする
const RUNTIME = "ponzuke-runtime";

// 1つでも失敗すると全部が入らないので、1件ずつ入れて、失敗は見送る
const addAllSafe = async (cache, urls) => {
  await Promise.all(urls.map(async (u) => {
    try { await cache.add(new Request(u, { cache: "reload" })); } catch {}
  }));
};

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await addAllSafe(cache, SHELL.concat(EXTRA));
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map(n => {
      if (n === CACHE || n === RUNTIME) return null;
      return caches.delete(n);      // 古い版の入れ物を捨てる
    }));
    await self.clients.claim();
  })());
});

// 画面から「新しい版に切り替えて」と言われたら、待たずに交代する
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

// 取っておいたものがあればそれを返し、無ければ取りに行く。
// 取りに行けたものは次回のために control しておく
const cacheFirst = async (req, cacheName) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) { try { await cache.put(req, res.clone()); } catch {} }
  return res;
};

const isFont = (url) =>
  url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
// 音声は数が多いので、鳴らしたものだけ取っておく
const isVoice = (url) => url.pathname.includes("/assets/voice/");

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }

  // アプリを開くとき。?fr=… が付いていても同じ本体を返す
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          try { await cache.put("./index.html", fresh.clone()); } catch {}
          return fresh;
        }
      } catch {}
      // 圏外・サーバが落ちているとき
      const cache = await caches.open(CACHE);
      return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
    })());
    return;
  }

  // 自分のところの絵・アイコン・設定ファイル
  if (url.origin === self.location.origin) {
    if (isVoice(url)) { e.respondWith(cacheFirst(req, RUNTIME).catch(() => fetch(req))); return; }
    e.respondWith(cacheFirst(req, CACHE).catch(() => fetch(req)));
    return;
  }

  // 文字の形（Google Fonts）と、EXTRA に挙げた外部の部品
  if (isFont(url) || EXTRA.includes(req.url)) {
    e.respondWith(cacheFirst(req, isFont(url) ? RUNTIME : CACHE).catch(() => fetch(req)));
    return;
  }

  // それ以外（Firebase など）は素通し。圏外なら普通に失敗させる
});
