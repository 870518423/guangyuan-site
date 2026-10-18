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
    { id: "guide", name: "攻略资源包", size: "约 2 MB", desc: "兵非武斗 3 张高清攻略长图", def: true },
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

  /* ② 右上角齿轮 */
  function addGear() {
    if (document.querySelector(".ak-app-gear")) return;
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

  /* ⑤ 首启弹层 */
  function buildPrompt() {
    if (document.querySelector(".akp-pack-mask")) return;
    var mask = document.createElement("div");
    mask.className = "akp-pack-mask";
    var rows = PACKS.map(function (p) {
      return '<label class="akp-pack-row">' +
        '<input type="checkbox" data-pack="' + p.id + '"' + (p.def ? " checked" : "") + '>' +
        '<span class="txt"><span class="t1">' + p.name + '</span>' +
        '<span class="t2">' + p.size + ' · ' + p.desc + '</span></span>' +
        '</label>';
    }).join("");
    mask.innerHTML = '<div class="akp-pack-sheet" role="dialog" aria-modal="true" aria-label="下载离线资源包">' +
      '<h3>下载离线资源包</h3>' +
      '<p class="sub">App 内首次使用，可先下载常用资源，断网也能看图。也可以稍后到「设置」里再下。</p>' +
      rows +
      '<div class="akp-pack-actions">' +
      '<button class="ghost" type="button" data-act="later">稍后</button>' +
      '<button class="solid" type="button" data-act="go">开始下载</button>' +
      '</div></div>';
    document.body.appendChild(mask);
    requestAnimationFrame(function () { mask.classList.add("on"); });

    mask.addEventListener("click", function (e) {
      var act = e.target.getAttribute && e.target.getAttribute("data-act");
      if (act === "later") { finish(); }
      else if (act === "go") {
        var ids = [];
        mask.querySelectorAll("input[data-pack]").forEach(function (i) { if (i.checked) ids.push(i.dataset.pack); });
        finish();
        if (window.AkPack && ids.length) window.AkPack.download(ids);
        else location.href = BASE + "app.html";
      } else if (e.target === mask) {
        finish();
      }
    });

    function finish() {
      try { localStorage.setItem(PROMPT_KEY, "1"); } catch (e) {}
      mask.classList.remove("on");
      setTimeout(function () { mask.remove(); }, 200);
    }
  }
  function maybePrompt() {
    var isHome = /(^|\/)index\.html$/.test(location.pathname) || /\/$/.test(location.pathname);
    if (!isHome) return;
    var done = false;
    try { done = localStorage.getItem(PROMPT_KEY) === "1"; } catch (e) {}
    if (done) return;
    setTimeout(buildPrompt, 600);
  }

  /* 对外接口 */
  window.AkApp = { BASE: BASE, PACKS: PACKS, prompt: buildPrompt };

  function init() {
    rewriteHomeCopy();
    addGear();
    swapSaveButton();
    maybePrompt();
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
      return call({ type: "akpack-status" }).then(function (d) { return d.packs || {}; });
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
    ph.textContent = "资源包未下载 · 去设置页";
    ph.addEventListener("click", function () { location.href = (window.AkApp ? window.AkApp.BASE : "") + "app.html"; });
    if (img.parentNode) img.parentNode.replaceChild(ph, img);
  }, true);
})();
