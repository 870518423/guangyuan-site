/* ============================================================
   明日方舟风格 · 页面切换与进场（transitions.js）
   ------------------------------------------------------------
   1. 站内跳转：支持 view-transition 的浏览器走原生淡入淡出；
   2. 列表错峰入场：用「几何判定 + requestAnimationFrame」而不是
      IntersectionObserver —— IO 的回调时机不可控（首屏可能白一片），
      rect 判定是确定性的，首屏必然显形；
   3. 搜索 / 筛选导致的重渲染不重放动画（否则每敲一个字整列表都在闪）。
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EASE = "opacity var(--dur-slow) var(--ease-out), transform var(--dur-slow) var(--ease-out)";
  var pending = [];
  var ticking = false;

  window.__akReady = 1;

  /* ---------- 1. 站内跳转过渡 ---------- */
  if (document.startViewTransition && !reduce) {
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href]");
      if (!a) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      if (a.host !== location.host) return;
      var url;
      try { url = new URL(a.href, location); } catch (err) { return; }
      if (url.href === location.href) return;
      e.preventDefault();
      document.startViewTransition(function () { location.href = url.href; });
    });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      document.body.classList.add("page-in");
    });
  }

  /* ---------- 2. 显形工具 ---------- */
  function showInstant(kids) {
    kids.forEach(function (k) {
      k.style.transition = "none";
      k.style.transitionDelay = "0ms";
      k.style.opacity = "1";
      k.style.transform = "none";
    });
  }

  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.top < window.innerHeight + 80 && r.bottom > -80;
  }

  function step(n) { return n > 40 ? [30, 180] : [40, 320]; }

  /* 收集待显形子项（容器只需扫描一次） */
  function scan(root) {
    var boxes = (root || document).querySelectorAll("[data-stagger]");
    Array.prototype.forEach.call(boxes, function (box) {
      var kids = Array.prototype.slice.call(box.children);
      if (!kids.length) return;

      if (box.dataset.akStaggered === "1" || reduce) {
        showInstant(kids);
        box.dataset.akStaggered = "1";
        return;
      }
      box.dataset.akStaggered = "1";

      kids.forEach(function (k, i) {
        if (k.style.opacity !== "1") pending.push({ el: k, n: kids.length });
      });
    });
    flush();
  }

  /* 把当前进入视口的元素排队显形 */
  function flush() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (!pending.length) return;

      var rest = [];
      var batch = 0;

      pending.forEach(function (item) {
        if (!item.el.isConnected) return;              /* 列表重渲染后旧节点，直接丢弃 */
        if (inView(item.el)) {
          var cfg = step(item.n);
          item.el.style.transition = EASE;
          item.el.style.transitionDelay = Math.min(batch * cfg[0], cfg[1]) + "ms";
          item.el.style.opacity = "1";
          item.el.style.transform = "none";
          batch++;
        } else {
          rest.push(item);
        }
      });

      pending = rest;
    });
  }

  function boot() { injectScan(); scan(document); }

  /* ---------- 页面顶部扫描线：每次进入新页面横扫一次 ---------- */
  function injectScan() {
    if (reduce) return;
    if (!document.body) return;
    var bar = document.createElement("div");
    bar.id = "ak-scan";
    document.body.appendChild(bar);
    bar.addEventListener("animationend", function () { bar.remove(); });
  }

  window.akStagger = boot;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.addEventListener("scroll", flush, { passive: true });
  window.addEventListener("resize", flush, { passive: true });

  /* 3. 数据驱动页会重新填列表：这里兜住 */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", observe);
  } else {
    observe();
  }

  function observe() {
    var timer = null;
    var mo = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var t = records[i].target;
        if (t.nodeType === 1 && t.hasAttribute && t.hasAttribute("data-stagger")) {
          clearTimeout(timer);
          timer = setTimeout(boot, 30);
          return;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();
