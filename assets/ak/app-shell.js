/* ============================================================
   App 版外壳（第 14 轮 · 2026-10-18）
   ------------------------------------------------------------
   只在 html[data-app] 下运行（由各页面 head 的内联探测脚本注入 data-app）。
   网页版：本文件**根本不会被请求**（探测脚本提前 return）。

   做的事：
     ① 首页 4 张卡换成精简文案（布局在 app.css）
     ② 右上角齿轮 → app.html（下载 / 资源设置）
     ③「添加到桌面」按钮 → 「检查更新」（触发 SW update）
     ④ 首次启动弹「资源包」弹层（只弹一次，localStorage 标记）
     ⑤ 暴露 window.AkApp 供 app.html 复用
   ============================================================ */
(function () {
  "use strict";
  if (!document.documentElement.hasAttribute("data-app")) return;

  var PROMPT_KEY = "ak-pack-prompt";      // 首次弹层标记
  var BASE = (function () {
    // passive/ 下的页面需要 ../ 前缀
    return location.pathname.indexOf("/passive/") >= 0 ? "../" : "";
  })();

  /* 三包定义（与 module.json / pack_deploy 保持一致） */
  var PACKS = [
    { id: "guide", name: "攻略资源包", size: "约 2 MB", desc: "并非五斗 3 张高清攻略长图", def: true },
    { id: "passive", name: "角色被动图鉴包", size: "约 10.3 MB", desc: "20 个角色的被动版本截图", def: true },
    { id: "humans", name: "人间体图鉴包", size: "约 19.6 MB", desc: "132 位人间体的三形态立绘与头像", def: false }
  ];

  /* ① 首页文案（按 href 精确匹配，网页版不受影响） */
  var COPY = {
    "calculator.html": "按日期测算 16 项产出收益，含氪金开关与占比图",
    "guides.html": "132 位人间体：本命/获得/前置/特训，可互跳反查",
    "strategies.html": "修炼数值表 · 问答题库 · 转载攻略，署名可搜索",
    "passive/index.html": "20 角色全版本被动：版本对比 + 改动着色 + 原图下载"
  };
  function rewriteHomeCopy() {
    var cards = document.querySelectorAll(".entry, a.entry");
    [].forEach.call(cards, function (a) {
      var href = (a.getAttribute("href") || "").replace(/^\.\//, "");
      var txt = COPY[href];
      if (!txt) return;
      var desc = a.querySelector(".desc");
      if (desc) desc.textContent = txt;
    });
  }

  /* ② 设置入口（只在站内首页）
     管理者 2026-10-18：二级页不浮动，返回/主题按钮已够用。
     第 19 轮修正（2026-10-19 管理者报障）：passive/index.html 也以 index.html 结尾，
     曾被误判成「首页」→ 齿轮浮在「角色被动版本收录」标题左上角。 */
  function addGear() {
    var isSubPage = /\/passive\//.test(location.pathname);
    var isHome = /(^|\/)index\.html$/.test(location.pathname) || /\/$/.test(location.pathname);
    if (isSubPage || !isHome || document.querySelector(".ak-app-gear")) return;
    var b = document.createElement("button");
    b.className = "ak-app-gear";
    b.type = "button";
    b.setAttribute("aria-label", "App 设置");
    b.title = "App 设置";
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="3.2"/>' +
      '<path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09A1.7 1.7 0 0 0 20.96 10H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z"/>' +
      '</svg>';
    b.addEventListener("click", function () { location.href = BASE + "app.html"; });
    document.body.appendChild(b);
  }

  /* ③「添加到桌面」→「检查更新」 */
  function swapSaveButton() {
    var btn = document.getElementById("ak-save-btn");
    if (!btn) return;
    var label = btn.querySelector(".ak-save-label");
    if (label) label.textContent = "检查更新";
    var ico = btn.querySelector(".ak-save-ico");
    if (ico) ico.style.display = "none";
    btn.addEventListener("click", function () {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        if (!rs.length) return;
        rs[0].update().then(function () {
          btn.dataset.done = "1";
          if (label) label.textContent = "已检查";
          setTimeout(function () { if (label) label.textContent = "检查更新"; }, 1600);
        });
      });
    }, true);
  }

  /* 对外接口 */
  window.AkApp = { BASE: BASE, PACKS: PACKS };

  function init() {
    var isGuides = /(^|\/)guides\.html$/.test(location.pathname);
    if (isGuides) {
      document.documentElement.setAttribute("data-page", "guides");
      /* 滚动感知返回按钮（第 16 轮）：页头 inline 跟随滚走，滚过约一屏后左下浮出圆形按钮 */
      var fb = document.createElement("a");
      fb.className = "ak-back-float";
      fb.href = "index.html";
      fb.setAttribute("aria-label", "返回首页");
      fb.title = "返回首页";
      fb.innerHTML = "&uarr;";
      var attach = function () { document.body.appendChild(fb); };
      if (document.body) attach(); else document.addEventListener("DOMContentLoaded", attach);
      var onScroll = function () {
        fb.classList.toggle("on", window.scrollY > window.innerHeight * 0.9);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    rewriteHomeCopy();
    addGear();
    swapSaveButton();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* ============================================================
   AkPack：资源包接口（页面侧）
   ------------------------------------------------------------
   与 service-worker.js 的 akpack-* 消息通信；packs 桶名固定
   `guangyuan-packs`，页面也能直接用 Cache API 查状态。
   ============================================================ */
(function () {
  "use strict";
  if (!document.documentElement.hasAttribute("data-app")) return;

  var PACK_PREFIX = { guide: "/assets/guides/", passive: "/passive/img/", humans: "/images/humans/" };

  function active() {
    if (!("serviceWorker" in navigator)) return Promise.reject(new Error("浏览器不支持 Service Worker"));
    return navigator.serviceWorker.ready.then(function (r) {
      if (!r.active) throw new Error("Service Worker 尚未激活");
      return r.active;
    });
  }

  function call(msg, onProgress) {
    return active().then(function (act) {
      return new Promise(function (resolve, reject) {
        var ch = new MessageChannel();
        var settled = false;
        var timer = setTimeout(function () {
          if (!settled) { settled = true; reject(new Error("超时：Service Worker 无响应")); }
        }, 120000);
        ch.port1.onmessage = function (e) {
          var d = e.data || {};
          if (d.type === "progress") {
            if (onProgress) onProgress({ pct: d.pct || 0, name: (d.file || "").split("/").pop(), done: d.done, total: d.total });
            return;
          }
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (d.type === "error") { reject(new Error(d.message || "下载失败")); return; }
          resolve(d);
        };
        act.postMessage(msg, [ch.port2]);
      });
    });
  }

  window.AkPack = {
    /* 直接查 Cache API，判断某包是否已有文件 */
    has: function (id) {
      if (!("caches" in window)) return Promise.resolve(false);
      var pref = PACK_PREFIX[id];
      if (!pref) return Promise.resolve(false);
      return caches.open("guangyuan-packs").then(function (c) {
        return c.keys();
      }).then(function (keys) {
        return keys.some(function (k) { return k.url.indexOf(pref) >= 0; });
      }).catch(function () { return false; });
    },
    download: function (ids, onProgress) {
      return call({ type: "akpack-download", ids: ids || [] }, onProgress);
    },
    status: function () {
      return call({ type: "akpack-status" }).then(function (d) {
        return { packs: d.packs || {}, task: d.task || null, protocol: d.protocol || 1 };
      });
    },
    remove: function (id) {
      return call({ type: "akpack-remove", id: id });
    },
    removeAll: function () {
      return call({ type: "akpack-removeAll" });
    }
  };

  /* 图片裂图 → 资源包占位（替代破图） */
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (!img || img.tagName !== "IMG" || img.dataset.akFail) return;
    var src = img.currentSrc || img.src || "";
    if (src.indexOf("/images/") < 0 && src.indexOf("/passive/img/") < 0 && src.indexOf("/assets/guides/") < 0) return;
    img.dataset.akFail = "1";
    var ph = document.createElement("div");
    ph.className = "ak-pack-ph";
    ph.textContent = "未缓存 · 联网后查看";
    if (img.parentNode) img.parentNode.replaceChild(ph, img);
  }, true);
})();

/* ============================================================
   AkContent：内容覆盖层接口（页面侧）（第 18 轮引入 · 第 19 轮单源化）
   ------------------------------------------------------------
   与 content 桶 `guangyuan-content` 直接读写。SW 覆盖层已建桶：
   命中任意键即返回（在线离线都能看）；未命中先试线上、失败回 APK
   内置版（这就是「内容包=披甲」的兜底 — 清桶即回内置版）。
   信息比对外径（第 19 轮起**以 content 桶为唯一事实源**）：
     · 线上 content.json 的 files[]（path/bytes/hash）+ contentVersion
     · 本机 content 桶逐文件 cache.match（键 = 页面请求同款 localhost 键，
        中文自动百分号编码，与 SW/页面三处同源）
     · 指纹随文件走：下载时构造带 `x-ak-hash` 头的新 Response 写桶，
        差分 = 读响应头与清单 hash 比对 —— 不再依赖第二账本
     · localStorage[ak-content-index] 降级为**只读兼容**：仅当桶内条目
        没有 x-ak-hash 头（SW 后台换新写入的裸响应）时才查它；无台账可查
        时**信桶不误报**（防「永远差 N 个文件」死循环的根）
   第 19 轮修的问题：
     ① 中文文件名百分号编码 ≠ 清单原文 → 永远差 11 个（D7 已修，保留）；
     ② 下载只写线上键 + 判定靠 localStorage 台账（第二账本）→ 台账/桶/请求键
        三处不同源 = 「11 文件死循环」根因域 → 本轮单源化；
     ③ 下载原子化：fetch → ok → 双键 put → 记指纹，任一步失败进 failed
        并自动重试一轮；全部成功才算完成。
   ============================================================ */
(function () {
  "use strict";
  if (!document.documentElement.hasAttribute("data-app")) return;
  var CONTENT_CACHE = "guangyuan-content";
  var INDEX_KEY = "ak-content-index";   // 兼容台账（只读降级）：{ files: { path: md5 } }
  var SITE_URL = "https://m78calc.cn";
  var LOC = (typeof location !== "undefined" && location.origin) ? location.origin : "https://localhost";

  function fetchRemoteManifest() {
    return fetch(SITE_URL + "/content.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("清单获取失败 " + r.status); return r.json(); })
      .catch(function () { return null; });
  }
  /* 兼容台账（只读降级）：仅用于没有 x-ak-hash 头的旧条目。 */
  function readIndex() {
    try {
      var o = JSON.parse(localStorage.getItem(INDEX_KEY) || "null");
      return (o && o.files) || {};
    } catch (e) { return {}; }
  }
  function writeIndex(files) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify({ files: files })); } catch (e) {}
  }
  function clearIndex() {
    try { localStorage.removeItem(INDEX_KEY); } catch (e) {}
  }

  /* 清单 path → 两个桶键：页面请求同款 localhost 键 + 线上键（与 SW 双键一致） */
  function keysOf(path) {
    return {
      local: new URL("/" + path, LOC).href,
      remote: new URL(path, SITE_URL + "/").href
    };
  }
  function openContent() {
    if (!("caches" in window)) return Promise.resolve(null);
    return caches.open(CONTENT_CACHE).catch(function () { return null; });
  }

  function bucketPaths() {
    if (!("caches" in window)) return Promise.resolve([]);
    return caches.open(CONTENT_CACHE).then(function (c) { return c.keys(); })
      .then(function (ks) {
        /* 键的 pathname 归一成与 content.json files[].path 一致的写法（清码 + 去斜杠），
           再按文件去重（双键制下同一文件有 localhost / 线上两个键）。 */
        var seen = {};
        var out = [];
        ks.forEach(function (k) {
          var p = new URL(k.url).pathname;
          p = p.charAt(0) === "/" ? p.slice(1) : p;
          try { p = decodeURIComponent(p); } catch (e) {}
          if (!seen[p]) { seen[p] = 1; out.push(p); }
        });
        return out;
      })
      .catch(function () { return []; });
  }

  /* 逐清单文件判差：桶（页面请求同款键）为唯一事实源，指纹读 x-ak-hash 头；
     没头的旧条目查兼容台账；台账也没有 → 信桶不误报（防死循环）。 */
  function judge(files, cache, idx) {
    var diffs = [];
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        if (!cache) { diffs.push(f); return; }
        var k = keysOf(f.path);
        return cache.match(k.local)
          .catch(function () { return null; })
          .then(function (hit) { return hit || cache.match(k.remote).catch(function () { return null; }); })
          .then(function (hit) {
            if (!hit) { diffs.push(f); return; }
            var h = null;
            try { h = hit.headers && hit.headers.get ? hit.headers.get("x-ak-hash") : null; } catch (e) {}
            if (h) { if (h !== f.hash) diffs.push(f); return; }   // 桶内指纹与清单不符 → 真更新
            var l = idx[f.path];
            if (l === undefined) return;                           // 无指纹可查 → 信桶（防死循环）
            if (l !== f.hash) diffs.push(f);                       // 旧条目 + 台账说不一致 → 更新
          });
      });
    });
    return chain.then(function () { return diffs; });
  }

  /* 给响应盖上 x-ak-hash 指纹章（指纹随文件走）；Response 不可用时原样返回 */
  function stampHash(r, hash) {
    try {
      var h = { "x-ak-hash": hash };
      if (r.headers && r.headers.forEach) {
        r.headers.forEach(function (v, k) { if (String(k).toLowerCase() !== "x-ak-hash") h[k] = v; });
      } else if (r.headers && r.headers.get) {
        var ct = r.headers.get("content-type"); if (ct) h["content-type"] = ct;
        var et = r.headers.get("etag"); if (et) h["etag"] = et;
      }
      return new Response(r.body, { status: r.status, headers: h });
    } catch (e) { return r; }
  }

  window.AkContent = {
    status: function () {
      return Promise.all([fetchRemoteManifest(), openContent(), bucketPaths()]).then(function (rs) {
        var man = rs[0], cache = rs[1], cur = rs[2], idx = readIndex();
        var files = (man && man.files) || [];
        var out = {
          ok: !!man,
          remoteVersion: (man && man.contentVersion) || null,
          remoteCount: files.length,
          remoteBytes: (man && man.bytes) || 0,
          localCount: cur.length,
          diff: []
        };
        if (!man) return out;
        /* 老用户兼容（只读降级的一次性补齐）：无台账且桶里有条目 →
           按清单指纹补台账，避免把「桶里已有」误判成要重下。 */
        var prep;
        if (!Object.keys(idx).length && cache && cur.length) {
          var present = {};
          cur.forEach(function (p) { present[p] = 1; });
          files.forEach(function (f) { if (present[f.path]) idx[f.path] = f.hash; });
          writeIndex(idx);
          prep = Promise.resolve();
        } else {
          prep = Promise.resolve();
        }
        return prep.then(function () { return judge(files, cache, idx); })
          .then(function (diffs) { out.diff = diffs; return out; });
      }).catch(function () {
        return { ok: false, remoteVersion: null, remoteCount: 0, remoteBytes: 0, localCount: 0, diff: [] };
      });
    },
    download: function (onProgress) {
      var self = this;
      return self.status().then(function (st) {
        var todo = st.diff;
        if (!todo.length) return { downloaded: 0, total: 0, bytes: 0, failed: [] };
        var index = readIndex();
        var CONCURRENCY = 3;

        /* 单文件原子化：fetch → ok → 构造带 x-ak-hash 的新 Response → 双键 put →
           记指纹。任一步失败抛错，由外层计入 failed。 */
        function one(it) {
          var url = SITE_URL + "/" + it.path;
          var k = keysOf(it.path);
          return fetch(url, { cache: "no-cache", credentials: "omit" }).then(function (r) {
            if (!r || !r.ok) throw new Error("HTTP " + (r ? r.status : 0));
            var stamped = stampHash(r, it.hash);
            return caches.open(CONTENT_CACHE).then(function (c) {
              return Promise.all([c.put(k.local, stamped.clone()), c.put(k.remote, stamped)]);
            });
          }).then(function () {
            index[it.path] = it.hash;
          });
        }
        function run(list, label) {
          var total = list.length, done = 0, okN = 0, bytes = 0, idx2 = 0;
          var failed = [];
          function next() {
            if (idx2 >= total) return Promise.resolve();
            var it = list[idx2++];
            return one(it).then(function () {
              okN++; bytes += it.bytes || 0;
            }).catch(function () { failed.push(it); }).then(function () {
              done++;
              if (onProgress) onProgress({ pct: Math.round(done / total * 100), name: it.path.split("/").pop(), done: done, total: total });
              return next();
            });
          }
          var arms = [];
          for (var i = 0; i < Math.min(CONCURRENCY, total); i++) arms.push(next());
          return Promise.all(arms).then(function () {
            return { okN: okN, bytes: bytes, failed: failed };
          });
        }
        return run(todo, "first").then(function (r1) {
          /* 失败自动重试一轮（有界，最多两遍）——网络抖动不留给用户手点 */
          if (!r1.failed.length) {
            writeIndex(index);
            return { downloaded: r1.okN, total: todo.length, bytes: r1.bytes, failed: [] };
          }
          return run(r1.failed, "retry").then(function (r2) {
            writeIndex(index);
            return { downloaded: r1.okN + r2.okN, total: todo.length, bytes: r1.bytes + r2.bytes, failed: r2.failed.map(function (f) { return f.path; }) };
          });
        });
      });
    },
    clear: function () {
      if (!("caches" in window)) return Promise.reject(new Error("环境不支持"));
      clearIndex();     /* 台账与桶必须同步清，否则「清完还说已是最新」 */
      return caches.delete(CONTENT_CACHE);
    },
    paths: bucketPaths
  };
})();
