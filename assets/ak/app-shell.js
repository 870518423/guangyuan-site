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
   AkContent：内容覆盖层接口（页面侧）（第 18 轮 · 2026-10-19）
   ------------------------------------------------------------
   与 content 桶 `guangyuan-content` 直接读写。SW 覆盖层已建桶：
   命中任意键即返回（在线离线都能看）；未命中回 APK 内置版
   （这就是「内容包=披甲」的兜底 — 清桶即回内置版）。
   信息比对外径：
     · 线上 content.json 的 files[]（path/bytes/hash）+ contentVersion
     · 本机 content 桶当前 key 的 pathname 集合（决定「有没有」）
     · 本机指纹台账 localStorage[ak-content-index]（决定「是不是同一份」）
   差量下载：桶里没有 **或** 指纹与清单不一致（内容改过）才拉线上副本写桶。
   第 19 轮（2026-10-19）修的两个问题：
     ① 中文文件名（passive/data/*.js 共 11 个）在 URL 里是百分号编码，未清码
        → 与清单原文永不相等 → 每次「检查更新」都报同样的 11 个文件、反复重下；
     ② 只判「文件在不在」不判「内容变没变」→ 同名文件改了也发现不了。
       现改为比 md5 指纹，清单换新（pack_deploy 重算指纹）后即成真正的增量更新。
   ============================================================ */
(function () {
  "use strict";
  if (!document.documentElement.hasAttribute("data-app")) return;
  var CONTENT_CACHE = "guangyuan-content";
  var INDEX_KEY = "ak-content-index";   // 本机指纹台账：{ files: { path: md5 } }
  var SITE_URL = "https://m78calc.cn";
  var manCache = null;

  function fetchRemoteManifest() {
    return fetch(SITE_URL + "/content.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("清单获取失败 " + r.status); return r.json(); })
      .catch(function () { return null; });
  }
  /* 本机指纹台账：记「已下载并已写桶」的文件指纹。
     只查桶里有没有是不够的——同名文件内容改了看不出来（管理者 2026-10-19 报障根因之一）。 */
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

  function bucketPaths() {
    if (!("caches" in window)) return Promise.resolve([]);
    return caches.open(CONTENT_CACHE).then(function (c) { return c.keys(); })
      .then(function (ks) {
        /* pathname 形如 /index.html、/assets/ak/app.css —— 归一到与 content.json
           files[].path（相对路径，无前导斜杠）一致的写法再比对。 */
        return ks.map(function (k) {
          var p = new URL(k.url).pathname;
          p = p.charAt(0) === "/" ? p.slice(1) : p;
          /* 第 19 轮修正：URL 里的中文是百分号编码（%E6%9E%81…），必须清码，
             否则与清单原文（极恶贝利亚.js）永不相等 → 每次都被判「缺失」。 */
          try { p = decodeURIComponent(p); } catch (e) {}
          return p;
        });
      })
      .catch(function () { return []; });
  }

  window.AkContent = {
    status: function () {
      return Promise.all([fetchRemoteManifest(), bucketPaths()]).then(function (rs) {
        var man = rs[0], cur = rs[1], idx = readIndex();
        var files = (man && man.files) || [];
        var out = {
          ok: !!man,
          remoteVersion: (man && man.contentVersion) || null,
          remoteCount: files.length,
          remoteBytes: (man && man.bytes) || 0,
          localCount: cur.length,
          diff: []
        };
        /* 老版本升级上来时没有台账（第 19 轮之前只有「桶里有没有」这一把尺子）：
           若桶里已有同名文件，就按清单指纹补齐台账，避免一次性重下全部 79 个。
           之后清单再换新（指纹变）就能正常识别为「有更新」。 */
        if (man && !Object.keys(idx).length && cur.length) {
          var present = {};
          cur.forEach(function (p) { present[p] = 1; });
          files.forEach(function (f) { if (present[f.path]) idx[f.path] = f.hash; });
          writeIndex(idx);
        }
        /* 差分 = 桶里没有 或 指纹与清单不一致（内容改过） */
        out.diff = files.filter(function (f) {
          return cur.indexOf(f.path) < 0 || idx[f.path] !== f.hash;
        });
        return out;
      }).catch(function () {
        return { ok: false, remoteVersion: null, remoteCount: 0, remoteBytes: 0, localCount: 0, diff: [] };
      });
    },
    download: function (onProgress) {
      var self = this;
      return self.status().then(function (st) {
        var todo = st.diff;
        if (!todo.length) return { downloaded: 0, total: 0, bytes: 0, failed: [] };
        var total = todo.length, done = 0, ok = 0, bytes = 0, idx = 0;
        var failed = [];
        var index = readIndex();
        var CONCURRENCY = 3;
        /* 第 19 轮：单个文件失败不再被算成「下载成功」（原来 done 无差别自增，
           失败也报「更新完成 11/11」）。只有确实写进桶才记指纹。 */
        function one(it) {
          var url = SITE_URL + "/" + it.path;
          return fetch(url, { cache: "no-cache", credentials: "omit" }).then(function (r) {
            if (!r || !r.ok) throw new Error("HTTP " + (r ? r.status : 0));
            return caches.open(CONTENT_CACHE).then(function (c) { return c.put(url, r); });
          }).then(function () {
            ok++;
            bytes += it.bytes || 0;
            index[it.path] = it.hash;
          }).catch(function () { failed.push(it.path); });
        }
        function next() {
          if (idx >= total) return Promise.resolve();
          var it = todo[idx++];
          return one(it).then(function () {
            done++;
            if (onProgress) onProgress({ pct: Math.round(done / total * 100), name: it.path.split("/").pop(), done: done, total: total });
            return next();
          });
        }
        var arms = [];
        for (var i = 0; i < Math.min(CONCURRENCY, total); i++) arms.push(next());
        return Promise.all(arms).then(function () {
          if (ok > 0) writeIndex(index);
          return { downloaded: ok, total: total, bytes: bytes, failed: failed };
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
