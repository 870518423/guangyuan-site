/* App 检查更新回归（2026-10-24）
   用法：NODE_PATH=<workspace>/node_modules node tools/app_update_test.js

   覆盖：
     1. 原生 versionName 优先于包内旧 version.json，v0.2.1 不再误报 0.2.1；
     2. 无原生桥时，页面 meta 版本仍能阻止同类误报；
     3. 线上安装包更新时显示安装包公告；
     4. 仅内容有更新、以及全部最新时也显示公告；
     5. 线上公告缺失时回退到 APK 内置公告；
     6. 公告文本经过 HTML 转义；
     7. Android 侧确实注册了只读 AKNativeApp 版本桥。
*/
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const APP_HTML = fs.readFileSync(path.join(ROOT, "app.html"), "utf8");
const MAIN_ACTIVITY = fs.readFileSync(path.join(
  ROOT, "apk-project-v2", "android", "app", "src", "main", "java", "com", "aoxi", "tools", "MainActivity.java"
), "utf8");

let pass = 0;
let fail = 0;
function check(name, ok, extra) {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (extra === undefined ? "" : "  → " + extra));
  ok ? pass++ : fail++;
}

function updateScript() {
  const marker = "/* 检查更新（App 内）";
  const at = APP_HTML.indexOf(marker);
  if (at < 0) throw new Error("找不到检查更新脚本");
  const open = APP_HTML.lastIndexOf("<script>", at);
  const close = APP_HTML.indexOf("</script>", at);
  if (open < 0 || close < 0) throw new Error("检查更新脚本边界异常");
  return APP_HTML.slice(open + "<script>".length, close);
}

const SCRIPT = updateScript();
const NOTES = ["新增返回手势。", "修复版本误判。"];

function response(data) {
  return Promise.resolve({ json: () => Promise.resolve(data) });
}

async function runCase(opts) {
  const dom = new JSDOM(
    "<!doctype html><html data-app=\"1\"><head>" +
      (opts.meta ? `<meta name="ak-app-version" content="${opts.meta}">` : "") +
      "</head><body><div id=\"curVer\">" + (opts.pageVersion || "v0.2.1") + "</div>" +
      "<div id=\"updResult\">点击下方按钮，检查站点是否有新版本。</div>" +
      "<button id=\"updBtn\">检查更新</button></body></html>",
    { url: "https://localhost/app.html", runScripts: "outside-only", pretendToBeVisual: true }
  );
  const { window } = dom;
  window.fetch = (url) => {
    const target = String(url);
    if (target === "https://m78calc.cn/version.json") return response(opts.remote);
    if (target === "version.json") return response(opts.local || { apk: "0.2.0" });
    return Promise.reject(new Error("unexpected fetch " + target));
  };
  if (opts.native) window.AKNativeApp = { getVersionName: () => opts.native };
  if (opts.contentDiff !== undefined) {
    window.AkContent = {
      status: () => window.Promise.resolve({ ok: true, diff: new Array(opts.contentDiff).fill({}) }),
    };
  }
  window.eval(SCRIPT);
  const btn = window.document.getElementById("updBtn");
  const result = window.document.getElementById("updResult");
  btn.click();
  for (let i = 0; i < 40 && (btn.disabled || result.textContent === "正在检查…"); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return {
    text: result.textContent,
    html: result.innerHTML,
    document: window.document,
    close: () => window.close(),
  };
}

(async () => {
  let out = await runCase({
    native: "0.2.1",
    meta: "0.2.0",
    pageVersion: "v0.2.0",
    local: { apk: "0.2.0" },
    remote: { apk: "0.2.1", contentVersion: "v91", apkNotes: NOTES },
  });
  check("原生 0.2.1 + 线上 0.2.1 不误报新安装包", !out.text.includes("发现新安装包"), out.text);
  check("已是最新时显示 v0.2.1 更新公告", out.text.includes("v0.2.1 更新内容") && out.text.includes(NOTES[0]));
  out = await runCase({
    native: "0.2.2",
    meta: "0.2.2",
    pageVersion: "v0.2.2",
    local: { apk: "0.2.2", apkNotes: ["0.2.2 内置公告"] },
    remote: { apk: "0.2.1", contentVersion: "v91" },
  });
  check("已安装版本高于线上时显示 0.2.2 公告", out.text.includes("v0.2.2 更新内容") && !out.text.includes("v0.2.1 更新内容"), out.text);
  out.close();
  out.close();

  out = await runCase({
    meta: "0.2.1",
    pageVersion: "v0.2.1",
    local: { apk: "0.2.0" },
    remote: { apk: "0.2.1", contentVersion: "v91", apkNotes: NOTES },
  });
  check("无原生桥时用 meta 0.2.1 也不误报", !out.text.includes("发现新安装包"), out.text);
  out.close();

  out = await runCase({
    native: "0.2.1",
    local: { apk: "0.2.1", apkNotes: ["APK 内置公告"] },
    remote: { apk: "0.2.1", contentVersion: "v92" },
  });
  check("线上公告缺失时回退到 APK 内置公告", out.text.includes("v0.2.1 更新内容") && out.text.includes("APK 内置公告"), out.text);
  out.close();

  out = await runCase({
    native: "0.2.0",
    local: { apk: "0.2.0" },
    remote: { apk: "0.2.1", contentVersion: "v91", apkNotes: NOTES },
  });
  check("原生 0.2.0 + 线上 0.2.1 正确提示新安装包", out.text.includes("发现新安装包") && out.text.includes("0.2.0"));
  check("发现新安装包时附带公告", out.text.includes("v0.2.1 更新内容") && out.text.includes(NOTES[1]));
  out.close();

  out = await runCase({
    native: "0.2.1",
    local: { apk: "0.2.0" },
    remote: { apk: "0.2.1", contentVersion: "v91", apkNotes: NOTES },
    contentDiff: 2,
  });
  check("仅内容更新时也附带公告", out.text.includes("发现新内容") && out.text.includes("v0.2.1 更新内容"));
  out.close();

  out = await runCase({
    native: "0.2.10",
    local: { apk: "0.2.0" },
    remote: { apk: "0.2.9", contentVersion: "v91", apkNotes: ["旧公告"] },
  });
  check("版本按数字段比较，0.2.10 不误判低于 0.2.9", !out.text.includes("发现新安装包"));
  out.close();

  out = await runCase({
    native: "0.2.1",
    local: { apk: "0.2.0" },
    remote: { apk: "0.2.1", contentVersion: "v91", apkNotes: ["<img src=x onerror=alert(1)>"] },
  });
  check("公告按纯文本显示且 HTML 被转义", out.document.querySelector("#updResult img") === null && out.html.includes("&lt;img"));
  out.close();

  check("Android 注册 AKNativeApp", /addJavascriptInterface\([^\n]+"AKNativeApp"\)/.test(MAIN_ACTIVITY));
  check("原生桥注册时读取系统安装版本", /NativeAppBridge\(installedVersionName\(\)\)/.test(MAIN_ACTIVITY));
  check("安装版本来自 PackageManager.versionName", /getPackageInfo\(getPackageName\(\), 0\)\.versionName/.test(MAIN_ACTIVITY));
  check("原生桥只读方法返回 versionName", /@JavascriptInterface\s+public String getVersionName\(\)\s*\{\s*return versionName;\s*\}/.test(MAIN_ACTIVITY));

  console.log("\n结果：" + pass + "/" + (pass + fail) + " 通过");
  if (fail) process.exitCode = 1;
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
