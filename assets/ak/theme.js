/* ============================================================
   明日方舟风格 · 主题切换（theme.js）
   ------------------------------------------------------------
   职责：
   1. 读 localStorage('ak-theme')，把 data-theme 写到 <html> 上
      （真正"首帧前"设值的是各页 <head> 里的引导脚本，见下）；
   2. 在页面右上角注入一个固定定位的切换按钮；
   3. 点击 → 亮色 / 暗色互切，立即生效并写入 localStorage；
   4. 同步 <meta name="theme-color">，让移动端浏览器 UI 跟着变。

   注意：多页站点，跳转后每个页面都会重新执行本脚本并从
   localStorage 读回选择，所以「切换后进二级页不改变选择」。
   引导脚本（放在各页 <head> 最前面，早于样式表）：
     <script>(function(){try{var t=localStorage.getItem('ak-theme');
       document.documentElement.setAttribute('data-theme',
       t==='light'?'light':'dark');}catch(e){document.documentElement
       .setAttribute('data-theme','dark');}})();</script>
   ============================================================ */
(function () {
  "use strict";

  var KEY = "ak-theme";
  var root = document.documentElement;

  function read() {
    try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; }
    catch (e) { return "dark"; }
  }
  function write(t) {
    try { localStorage.setItem(KEY, t); } catch (e) { /* 隐私模式等，忽略 */ }
  }
  function current() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function apply(t, persist) {
    root.setAttribute("data-theme", t);

    var btn = document.getElementById("ak-theme-toggle");
    if (btn) {
      var toLight = t !== "light";
      var tip = toLight ? "切换到亮色主题" : "切换到暗色主题";
      btn.setAttribute("title", tip);
      btn.setAttribute("aria-label", tip);
      btn.setAttribute("aria-pressed", t === "light" ? "true" : "false");
      var label = btn.querySelector(".ak-tt-label");
      if (label) label.textContent = toLight ? "亮色" : "暗色";
      var icon = btn.querySelector(".ak-tt-icon");
      if (icon) icon.setAttribute("data-mode", t);
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "light" ? "#eef0f3" : "#0c0d11");

    if (persist) write(t);
  }

  function build() {
    if (document.getElementById("ak-theme-toggle")) return;

    var btn = document.createElement("button");
    btn.id = "ak-theme-toggle";
    btn.type = "button";
    btn.className = "ak-theme-toggle";
    btn.innerHTML =
      '<span class="ak-tt-icon" aria-hidden="true">' +
        '<svg viewBox="0 0 16 16" width="14" height="14">' +
          '<circle class="ak-tt-sun" cx="8" cy="8" r="3.3"></circle>' +
          '<g class="ak-tt-rays">' +
            '<line x1="8" y1="0.7" x2="8" y2="2.5"></line>' +
            '<line x1="8" y1="13.5" x2="8" y2="15.3"></line>' +
            '<line x1="0.7" y1="8" x2="2.5" y2="8"></line>' +
            '<line x1="13.5" y1="8" x2="15.3" y2="8"></line>' +
            '<line x1="2.85" y1="2.85" x2="4.1" y2="4.1"></line>' +
            '<line x1="11.9" y1="11.9" x2="13.15" y2="13.15"></line>' +
            '<line x1="2.85" y1="13.15" x2="4.1" y2="11.9"></line>' +
            '<line x1="11.9" y1="4.1" x2="13.15" y2="2.85"></line>' +
          '</g>' +
          '<path class="ak-tt-moon" d="M10.4 1.9a6.1 6.1 0 1 0 3.5 8.7 4.7 4.7 0 0 1-3.5-8.7z"></path>' +
        '</svg>' +
      '</span>' +
      '<span class="ak-tt-label">亮色</span>';

    btn.addEventListener("click", function () {
      apply(current() === "light" ? "dark" : "light", true);
    });

    var siteHead = root.hasAttribute("data-app") ? null : document.querySelector(".aoxi-site-head__inner");
    (siteHead || document.body).appendChild(btn);
    apply(current(), false);
  }

  /* 兜底：如果 <head> 引导脚本没跑（比如被某些环境拦掉），这里补一次 */
  if (!root.getAttribute("data-theme")) apply(read(), false);

  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
