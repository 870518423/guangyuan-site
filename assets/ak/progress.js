/* ============================================================
   明日方舟风格 · 顶部进度条（progress.js）
   ------------------------------------------------------------
   页面 <body data-ak-progress> 时自动启动，window.load 后收尾；
   数据驱动页（人间体 / 答题库）可在渲染前后手动调用：
     akProgress.start();  ...渲染...  akProgress.done();
   ============================================================ */
(function () {
  "use strict";

  var el = null;
  var timer = null;

  function node() {
    if (!el) {
      el = document.createElement("div");
      el.id = "ak-progress";
      document.body.appendChild(el);
    }
    return el;
  }

  var api = {
    start: function () {
      var n = node();
      n.classList.remove("done");
      n.classList.add("on");
      var p = 8;
      n.style.width = p + "%";
      clearInterval(timer);
      timer = setInterval(function () {
        p = Math.min(p + Math.random() * 10, 88);
        n.style.width = p + "%";
      }, 240);
      return api;
    },
    set: function (v) {
      node().style.width = Math.max(0, Math.min(100, v)) + "%";
      return api;
    },
    done: function () {
      clearInterval(timer);
      var n = node();
      n.style.width = "100%";
      n.classList.add("done");
      setTimeout(function () {
        n.classList.remove("on");
        n.style.width = "0";
      }, 420);
      return api;
    }
  };

  window.akProgress = api;

  if (document.body && document.body.hasAttribute("data-ak-progress")) {
    api.start();
    window.addEventListener("load", function () {
      setTimeout(function () { api.done(); }, 150);
    });
  }
})();
