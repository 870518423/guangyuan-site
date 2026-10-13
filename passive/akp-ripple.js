/* ============================================================
   奥系角色被动收录 · 点击涟漪（akp-ripple.js）
   ------------------------------------------------------------
   与站点 assets/ak/ripple.js 同一套做法（事件委托 + 白光扩散），
   差异：只作用于 .akp 模块内，避免和站点自己的涟漪重复触发。
   若页面已引入站点 ripple.js（它选择器里有全局 button），
   本文件会自动跳过，不产生双涟漪。
   ============================================================ */
(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var SEL = ".akp-btn, .akp-seg-i, [data-akp-ripple]";

  document.addEventListener("pointerdown", function (e) {
    var el = e.target.closest(SEL);
    if (!el || el.disabled) return;
    if (el.dataset.akpRipple === "off") return;

    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;

    var size = Math.max(r.width, r.height) * 1.15;
    var span = document.createElement("span");
    span.className = "akp-ripple";
    span.style.width = size + "px";
    span.style.height = size + "px";
    span.style.left = (e.clientX - r.left - size / 2) + "px";
    span.style.top = (e.clientY - r.top - size / 2) + "px";

    el.appendChild(span);
    span.addEventListener("animationend", function () { span.remove(); });
  }, { passive: true });
})();
