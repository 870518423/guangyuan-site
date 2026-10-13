/* ============================================================
   明日方舟风格 · 数字递增（counter.js）
   ------------------------------------------------------------
   把元素文本从「当前值」滚动到「目标值」，ease-out 收敛，
   连续调用会打断上一次动画（不会竞态）。
   用法：window.akCount(el, 12345, 560);
        el 若带 dataset.akVal 则以其为起点（否则按 0 起）。
   开了「减少动态」时直接落终值。
   ============================================================ */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return "0";
    return Math.floor(n).toLocaleString("zh-CN");
  }

  function readFrom(el) {
    var raw = el.dataset.akVal;
    if (raw === undefined) return 0;
    var n = Number(String(raw).replace(/[^\d-]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function roll(el, to, dur) {
    if (!el) return;
    to = Math.floor(Number(to) || 0);
    dur = dur === undefined ? 560 : dur;
    var from = readFrom(el);
    el.dataset.akVal = String(to);

    if (reduce || dur <= 0 || from === to) {
      if (el._akRaf) { cancelAnimationFrame(el._akRaf); el._akRaf = null; }
      el.textContent = fmt(to);
      return;
    }
    if (el._akRaf) { cancelAnimationFrame(el._akRaf); el._akRaf = null; }

    var t0 = performance.now();
    function tick(t) {
      var p = (t - t0) / dur;
      if (p > 1) p = 1;
      var e = 1 - Math.pow(1 - p, 3);          /* ease-out cubic */
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) {
        el._akRaf = requestAnimationFrame(tick);
      } else {
        el.textContent = fmt(to);
        el._akRaf = null;
      }
    }
    el._akRaf = requestAnimationFrame(tick);
  }

  window.akCount = roll;
})();
