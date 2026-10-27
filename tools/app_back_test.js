/* App 返回行为回归（2026-10-24）
   用法：NODE_PATH=<workspace>/node_modules node tools/app_back_test.js

   覆盖：
     1. 网页版不进入 App 模式；
     2. App 返回事件可取消，页面未处理时交还原生层；
     3. 图鉴严格按「大图 → 上一条详情 → 关闭弹层 → 页面返回」消费返回。
*/
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const GUIDE_HTML = fs.readFileSync(path.join(ROOT, "guides.html"), "utf8");
const APP_SHELL = fs.readFileSync(path.join(ROOT, "assets", "ak", "app-shell.js"), "utf8");

let pass = 0;
let fail = 0;
function check(name, ok, extra) {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (extra === undefined ? "" : "  → " + extra));
  ok ? pass++ : fail++;
}

function makeDom(url) {
  return new JSDOM(GUIDE_HTML, {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.matchMedia = window.matchMedia || function () {
        return {
          matches: false,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
        };
      };
    },
  });
}

function byGoto(document, rootSelector, name) {
  return Array.from(document.querySelectorAll(rootSelector + " [data-goto]"))
    .find((node) => node.getAttribute("data-goto") === name);
}

(async () => {
  const web = makeDom("http://127.0.0.1:8099/guides.html");
  check("网页版没有 data-app", web.window.document.documentElement.hasAttribute("data-app") === false);
  web.window.close();

  const app = makeDom("http://127.0.0.1:8099/guides.html?app=1");
  const { window } = app;
  const { document } = window;
  await new Promise((resolve) => setTimeout(resolve, 20));

  check("App 模式 data-app=1", document.documentElement.getAttribute("data-app") === "1");
  check("App 模式会挂载 app-shell.js", /assets\/ak\/app-shell\.js/.test(document.documentElement.outerHTML));
  check("图鉴脚本已完成初始化", document.querySelectorAll("#cardView [data-goto]").length > 0);

  /* 真正加载 app-shell 的返回桥（jsdom 不请求外链脚本）。 */
  window.eval(APP_SHELL);
  check("AkAppBack 已暴露", typeof window.AkAppBack === "function");
  check("无页面处理器时交还原生层", window.AkAppBack() === false);

  /* 图片版：打开 A，再通过详情内链接进入 B。 */
  const imageButton = document.querySelector('button[data-view="image"]');
  imageButton.click();
  const first = byGoto(document, "#cardView", "健一凯伊");
  check("可打开第一条详情", !!first);
  first.click();

  const second = byGoto(document, "#modal", "格朗迪");
  check("可进入第二条详情", !!second);
  second.click();

  const modal = document.getElementById("modal");
  const zoom = document.getElementById("mZoom");
  const zoomButton = document.getElementById("mZoomBtn");
  check("详情栈已建立", document.getElementById("mBack").textContent.includes("返回上一个"));
  check("立绘可打开大图", zoomButton.offsetParent !== null || !document.getElementById("mPic").hidden);
  zoomButton.click();
  check("大图已打开", zoom.hidden === false);

  check("第一次返回只关大图", window.AkAppBack() === true && zoom.hidden === true && modal.classList.contains("on"));
  check("第二次返回回上一条详情",
    window.AkAppBack() === true &&
    document.getElementById("mName").textContent === "健一凯伊" &&
    modal.classList.contains("on"));
  check("第三次返回关闭详情弹层",
    window.AkAppBack() === true && !modal.classList.contains("on"));
  check("弹层关闭后交回页面返回", window.AkAppBack() === false);

  window.close();
  console.log("\n结果：" + pass + "/" + (pass + fail) + " 通过");
  if (fail) process.exitCode = 1;
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
