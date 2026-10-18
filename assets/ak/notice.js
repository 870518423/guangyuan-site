/* ============================================================
   站点公告弹窗 · 新域名提示（2026-10-17）
   ------------------------------------------------------------
   用途：进入网站时弹一次「已启用新域名」提示，带「不再提示」复选框，
        勾选并关闭后写入 localStorage，之后访问不再弹出。

   设计约束（为什么长这样）：
   1. **自包含**：样式由本文件注入，不依赖任何页面的 CSS 文件。
      只有颜色/圆角用 var(--ak-*, 兜底值) 取站点令牌 —— 首页/计算器/
      攻略页引入了 ak-theme.css + ak-light.css，被动板块页自带同名令牌，
      所以亮暗两套主题下颜色都自动跟随，不用各页单独写样式。
   2. **不阻塞首屏**：脚本正常加载，但弹窗延到页面空闲（requestIdleCallback
      优先，回退 setTimeout）才显示，不抢首屏渲染与 LCP。
   3. **不干扰浏览**：遮罩点击、Esc、按钮都能关；解锁滚动后页面状态不变；
      同一次会话内只弹一次（sessionStorage），从首页翻到二级页不会再弹。
   4. **零成本退出**：已选「不再提示」时函数开头直接 return，
      不建 DOM、不注入 <style>。

   配置：改域名 / 改文案 / 想对所有人重新弹一次，都在下面 NOTICE 里改。
   ============================================================ */
(function () {
  "use strict";
  /* App（Capacitor）里没有域名问题，直接不弹（第 14 轮，2026-10-18） */
  if (document.documentElement.hasAttribute("data-app")) return;

  var NOTICE = {
    /* localStorage 键名：带日期 = 版本号。想「对所有人重新弹一次」，
       把这个键名改一下（比如换成今天的日期）即可，老用户的「不再提示」自动失效。 */
    key: "ak-domain-notice-2026-10-17",
    sessionKey: "ak-domain-notice-s",
    domain: "m78calc.cn",
    url: "https://m78calc.cn/",
    oldDomain: "page.m78calc.dpdns.org",
    delay: 700,          // 页面空闲后再等这么久（ms），避免与首屏动画抢帧
    onlyOffsite: false,  // true = 只在「非新域名」的地址上弹（旧地址专用）
    /* 只在主页弹（管理者 2026-10-17：「进入主页的时候弹就可以了」）。
       现在只有 index.html 挂了这个脚本；这里再判一次路径当保险，万一以后
       有人把脚本加到二级页也不会乱弹。 */
    homeOnly: true
  };

  /* ---------- 0) 早退：已勾「不再提示」 ---------- */
  function ls(fn, d) { try { return fn(); } catch (e) { return d; } }
  if (ls(function () { return localStorage.getItem(NOTICE.key); }, null) === "off") return;
  if (ls(function () { return sessionStorage.getItem(NOTICE.sessionKey); }, null) === "1") return;
  if (NOTICE.onlyOffsite && location.hostname === NOTICE.domain) return;
  /* 只认站点根（/ 或 /index.html）；/passive/index.html 之类不算主页 */
  if (NOTICE.homeOnly) {
    var p = location.pathname.replace(/\/+$/, "");
    if (p !== "" && p !== "/index.html") return;
  }

  /* ---------- 1) 样式（只注入一次） ---------- */
  var CSS = [
    ".akn-mask{position:fixed;inset:0;z-index:10004;display:flex;align-items:center;justify-content:center;",
    "padding:calc(20px + env(safe-area-inset-top,0px)) 18px calc(20px + env(safe-area-inset-bottom,0px));",
    "background:rgba(4,5,8,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);",
    "opacity:0;transition:opacity .2s cubic-bezier(.4,0,.2,1);}",

    ".akn-mask.is-in{opacity:1;}",
    ".akn-mask.is-out{opacity:0;}",

    ".akn-panel{position:relative;width:100%;max-width:400px;overflow:hidden;",
    "background:var(--ak-bg-1,#14161c);color:var(--ak-text,#e7e5e2);",
    "border:1px solid var(--ak-line-2,#3a3f4d);border-radius:var(--ak-radius,2px);",
    "box-shadow:0 24px 60px rgba(0,0,0,.55);",
    "transform:translateY(10px) scale(.985);opacity:0;",
    "transition:transform .22s cubic-bezier(0,0,.2,1),opacity .22s cubic-bezier(0,0,.2,1);}",
    ".akn-mask.is-in .akn-panel{transform:none;opacity:1;}",
    ".akn-mask.is-out .akn-panel{transform:translateY(6px) scale(.99);opacity:0;}",

    /* 顶部琥珀条：与站点吸顶条 / 主按钮同一强调色 */
    ".akn-panel::before{content:\"\";position:absolute;left:0;right:0;top:0;height:2px;",
    "background:var(--ak-accent,#ffb300);}",

    ".akn-hd{padding:22px 22px 0;}",
    ".akn-kicker{display:block;font-size:.66rem;letter-spacing:2px;line-height:1.4;",
    "color:var(--ak-accent,#ffb300);text-transform:uppercase;margin-bottom:8px;}",
    ".akn-hd h2{margin:0;font-size:1.12rem;font-weight:700;letter-spacing:.5px;line-height:1.45;}",

    ".akn-bd{padding:12px 22px 0;font-size:.86rem;line-height:1.75;",
    "color:var(--ak-text-dim,#9a988f);}",
    ".akn-bd p{margin:0 0 12px;}",

    /* 域名：大字 + 可点，触摸目标 >= 44px */
    ".akn-domain{display:flex;align-items:center;justify-content:center;gap:8px;",
    "min-height:52px;margin:2px 0 12px;padding:8px 14px;text-decoration:none;",
    "font-size:1.28rem;font-weight:700;letter-spacing:.6px;",
    "color:var(--ak-accent,#ffb300);background:var(--ak-bg-2,#1c1f27);",
    "border:1px solid var(--ak-line,#2a2e38);border-radius:var(--ak-radius,2px);",
    "transition:border-color .16s,background .16s;}",
    ".akn-domain:hover,.akn-domain:focus-visible{border-color:var(--ak-accent,#ffb300);outline:none;}",
    ".akn-domain span{font-size:.95rem;font-weight:400;color:var(--ak-text-dim,#9a988f);}",

    ".akn-tip{font-size:.78rem;color:var(--ak-text-mute,#6b6a64);}",

    ".akn-ft{display:flex;align-items:center;gap:12px;padding:4px 22px 20px;}",

    /* 复选框：自绘，label 整行 >= 44px 可点 */
    ".akn-chk{display:flex;align-items:center;gap:9px;min-height:44px;margin-right:auto;",
    "font-size:.82rem;color:var(--ak-text-dim,#9a988f);cursor:pointer;user-select:none;",
    "-webkit-user-select:none;}",
    ".akn-chk input{position:absolute;opacity:0;width:1px;height:1px;margin:0;}",
    ".akn-box{position:relative;flex:0 0 18px;width:18px;height:18px;",
    "border:1px solid var(--ak-line-2,#3a3f4d);border-radius:1px;",
    "background:var(--ak-bg-0,#0c0d11);transition:border-color .16s,background .16s;}",
    ".akn-box::after{content:\"\";position:absolute;left:5px;top:1px;width:5px;height:10px;",
    "border:solid var(--ak-bg-0,#0c0d11);border-width:0 2px 2px 0;",
    "transform:rotate(45deg) scale(0);transition:transform .14s cubic-bezier(0,0,.2,1);}",
    ".akn-chk input:checked+.akn-box{background:var(--ak-accent,#ffb300);border-color:var(--ak-accent,#ffb300);}",
    ".akn-chk input:checked+.akn-box::after{transform:rotate(45deg) scale(1);}",
    ".akn-chk input:focus-visible+.akn-box{outline:2px solid var(--ak-accent,#ffb300);outline-offset:2px;}",

    /* 主按钮：照 ak-btn-solid 的观感（触屏常显实心琥珀，桌面 hover 反色） */
    ".akn-ok{position:relative;overflow:hidden;isolation:isolate;flex:0 0 auto;",
    "min-width:104px;min-height:44px;padding:0 18px;",
    "font-family:inherit;font-size:.86rem;font-weight:600;letter-spacing:.5px;cursor:pointer;",
    "color:var(--ak-bg-0,#0c0d11);background:var(--ak-accent,#ffb300);",
    "border:1px solid var(--ak-accent,#ffb300);border-radius:var(--ak-radius,2px);",
    "transition:transform .1s,filter .16s;}",
    ".akn-ok:hover{filter:brightness(1.06);}",
    ".akn-ok:active{transform:scale(.97);}",
    ".akn-ok:focus-visible{outline:2px solid var(--ak-accent,#ffb300);outline-offset:3px;}",

    /* 窄屏：按钮撑满一行，复选框在其上方 */
    "@media (max-width:340px){.akn-ft{flex-wrap:wrap;}.akn-ok{width:100%;}.akn-chk{width:100%;}}",

    /* 尊重「减少动效」 */
    "@media (prefers-reduced-motion:reduce){.akn-mask,.akn-panel,.akn-box::after{transition:none;}",
    ".akn-mask{opacity:1;}.akn-panel{transform:none;opacity:1;}}"
  ].join("");

  function injectCSS() {
    if (document.getElementById("akn-style")) return;
    var s = document.createElement("style");
    s.id = "akn-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- 2) 构建弹窗 ---------- */
  var mask, panel, okBtn, chk, lastFocus, prevOverflow, prevPad;

  function build() {
    mask = document.createElement("div");
    mask.className = "akn-mask";

    panel = document.createElement("div");
    panel.className = "akn-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "akn-title");
    panel.setAttribute("aria-describedby", "akn-desc");
    panel.innerHTML =
      '<div class="akn-hd">' +
        '<span class="akn-kicker">Site Notice · 站点公告</span>' +
        '<h2 id="akn-title">本站已启用新域名</h2>' +
      '</div>' +
      '<div class="akn-bd" id="akn-desc">' +
        /* 2026-10-17 管理者改口径：旧地址**不停用**，原因是域名可能被拦截到广告站；
           也不再提「无需重新添加桌面图标」。 */
        '<p>旧地址（' + NOTICE.oldDomain + '）因域名原因，访问时可能被拦截或跳转到广告网站。建议改用下面的新域名访问。</p>' +
        '<a class="akn-domain" href="' + NOTICE.url + '" target="_blank" rel="noopener noreferrer">' +
          NOTICE.domain + '&nbsp;<span>点击访问 →</span>' +
        '</a>' +
        '<p>看到本公告的各位，烦请在群内相互转告一声，谢谢。</p>' +
        '<p class="akn-tip">本站为个人整理的免费工具站，非游戏官方站点。</p>' +
      '</div>' +
      '<div class="akn-ft">' +
        '<label class="akn-chk">' +
          '<input type="checkbox" id="akn-nomore">' +
          '<span class="akn-box" aria-hidden="true"></span>' +
          '<span>不再提示</span>' +
        '</label>' +
        '<button class="akn-ok" type="button">我知道了</button>' +
      '</div>';

    mask.appendChild(panel);
    document.body.appendChild(mask);

    okBtn = panel.querySelector(".akn-ok");
    chk = panel.querySelector("#akn-nomore");

    okBtn.addEventListener("click", close);
    mask.addEventListener("click", function (e) { if (e.target === mask) close(); });

    document.addEventListener("keydown", function (e) {
      if (!mask || !mask.parentNode) return;
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      /* 焦点陷阱：Tab 只在弹窗内循环，别跑到背后的页面上去 */
      var items = panel.querySelectorAll('a[href], button, input:not([type="hidden"])');
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ---------- 3) 开关 ---------- */
  function lockScroll() {
    prevOverflow = document.documentElement.style.overflow;
    prevPad = document.documentElement.style.paddingRight;
    /* 补偿滚动条宽度，避免锁滚动时页面横向跳一下 */
    var sw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = "hidden";
    if (sw > 0) document.documentElement.style.paddingRight = sw + "px";
  }
  function unlockScroll() {
    document.documentElement.style.overflow = prevOverflow || "";
    document.documentElement.style.paddingRight = prevPad || "";
  }

  function open() {
    if (mask) return;
    lastFocus = document.activeElement;
    injectCSS();
    build();
    lockScroll();
    ls(function () { sessionStorage.setItem(NOTICE.sessionKey, "1"); });
    /* 双 rAF：等首帧样式落地再加 .is-in，过渡才生效 */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        mask.classList.add("is-in");
        try { okBtn.focus({ preventScroll: true }); } catch (e) { okBtn.focus(); }
      });
    });
  }

  function close() {
    if (!mask) return;
    /* 勾了「不再提示」才持久化；没勾 = 只关这一次 */
    if (chk && chk.checked) {
      ls(function () { localStorage.setItem(NOTICE.key, "off"); });
    }
    mask.classList.add("is-out");
    mask.classList.remove("is-in");
    var t = setTimeout(done, 260);
    mask.addEventListener("transitionend", function () { clearTimeout(t); done(); }, { once: true });
    function done() {
      if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
      mask = panel = okBtn = chk = null;
      unlockScroll();
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
    }
  }

  /* ---------- 4) 等页面空闲再弹 ---------- */
  function schedule() {
    var go = function () { setTimeout(open, NOTICE.delay); };
    if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 2500 });
    else setTimeout(go, 900);
  }

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
})();
