/* ============================================================
   明日方舟风格 · 点击涟漪（ripple.js）
   ------------------------------------------------------------
   事件委托：任何按钮 / 卡片 / 带 data-ripple 的元素，按下即在
   点击点扩散一圈低不透明度白光（终端点击感，非彩色光晕）。
   ============================================================ */
(function () {
  "use strict";

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var SEL = "button, .ak-btn, a.entry, a.card, .chip, [data-ripple]";

  document.addEventListener("pointerdown", function (e) {
    var el = e.target.closest(SEL);
    if (!el || el.dataset.ripple === "off") return;
    if (el.disabled) return;

    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;

    var size = Math.max(r.width, r.height) * 1.15;
    var span = document.createElement("span");
    span.className = "ak-ripple";
    span.style.width = size + "px";
    span.style.height = size + "px";
    span.style.left = (e.clientX - r.left - size / 2) + "px";
    span.style.top = (e.clientY - r.top - size / 2) + "px";

    el.appendChild(span);
    span.addEventListener("animationend", function () { span.remove(); });
  }, { passive: true });
})();
