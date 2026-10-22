/* 第 19 轮「App UI 视觉同步」验收（tools/app_ui_sync_shot.js，2026-10-22）
   前置：工作区根起 serve（明日方舟风格测试 → 8099）+ 无头 Chrome 9222
   用法：NO_PROXY='*' NODE_PATH=<ws>/node_modules node tools/app_ui_sync_shot.js

   验证：app.css 第 ⑥ 区令牌/面层是否真生效（暗/亮双主题），
        且 app.html 设置页与被动详情页保持旧观感（网页端也未刷新）。
   截图：.workbuddy/shots/r19-*.png（供管理者与网页版并排对比）
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const BASE = (process.argv[2] || "http://127.0.0.1:8099").replace(/\/$/, "");
const OUT = process.env.SHOT_DIR || "C:\\Users\\Admin\\WorkBuddy\\workbuddy\\.workbuddy\\shots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: 9222, path: p }, (r) => {
      let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res(JSON.parse(b)));
    }).on("error", rej);
  });
}
let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + n + (extra !== undefined ? "  → " + extra : ""));
  ok ? pass++ : fail++;
};

(async () => {
  const tabs = await get("/json");
  const page = tabs.find((t) => t.type === "page") || tabs[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  const send = (m, p) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } });
  await new Promise((r) => ws.on("open", r));
  await send("Runtime.enable", {}); await send("Page.enable", {});
  await send("Emulation.setDeviceMetricsOverride", { width: 440, height: 950, deviceScaleFactor: 2, mobile: true });

  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return "__ERR__ " + JSON.stringify(r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const p = path.join(OUT, name); fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(p, Buffer.from(r.result.data, "base64")); return name;
  };
  const go = async (u, wait) => { await send("Page.navigate", { url: BASE + u }); await sleep(wait || 3200); };
  const clean = () => ev(`(function(){document.querySelectorAll('[class*=notice],[id*=notice],[class*=akn],[class*=update]').forEach(function(n){n.remove()});return true})()`);
  const setTheme = async (t) => { await ev(`(function(){try{localStorage.setItem('ak-theme','${t}')}catch(e){}return true})()`); };
  const cs = (sel, prop) => ev(`(function(){var e=document.querySelector('${sel}');return e?getComputedStyle(e).${prop}:null;})()`);

  console.log("App 视觉同步验收（440 宽，暗 → 亮）｜源：app.css 第 ⑥ 区");

  /* ---------- App 首页 · 暗色 ---------- */
  await setTheme("dark");
  await go("/index.html?app=1", 3400); await clean();
  check("A1 暗色页面底 = #091317（青黑，非旧 #0c0d11）",
    (await cs("body", "backgroundColor")) === "rgb(9, 19, 23)", await cs("body", "backgroundColor"));
  check("A2 入口卡方角 3px（旧 ~10px）", (await cs(".entry", "borderRadius")) === "3px", await cs(".entry", "borderRadius"));
  check("A3 入口卡线框 #294248", (await cs(".entry", "borderTopColor")) === "rgb(41, 66, 72)", await cs(".entry", "borderTopColor"));
  check("A4 英文眉标 = 青色等宽", (await cs(".ak-label-en", "color")) === "rgb(81, 228, 230)", await cs(".ak-label-en", "color"));
  check("A5 齿轮钮方角 3px", (await cs(".ak-app-gear", "borderRadius")) === "3px", await cs(".ak-app-gear", "borderRadius"));
  check("A6 更新记录时间戳 = 青", (await cs(".changelog time", "color")) === "rgb(81, 228, 230)", await cs(".changelog time", "color"));
  check("A7 首页仍 2×2（布局未动）",
    ((await cs(".entries", "gridTemplateColumns")) || "").split(" ").length === 2, await cs(".entries", "gridTemplateColumns"));
  await shot("r19-app-home-dark.png");

  /* ---------- App 首页 · 亮色 ---------- */
  await setTheme("light");
  await go("/index.html?app=1", 3400); await clean();
  check("B1 亮色页面底 = #e9f1ed", (await cs("body", "backgroundColor")) === "rgb(233, 241, 237)", await cs("body", "backgroundColor"));
  check("B2 亮色入口卡面 = #f4f8f5", (await cs(".entry", "backgroundColor")) === "rgb(244, 248, 245)", await cs(".entry", "backgroundColor"));
  check("B3 亮色眉标 = 深青 #087e88", (await cs(".ak-label-en", "color")) === "rgb(8, 126, 136)", await cs(".ak-label-en", "color"));
  await shot("r19-app-home-light.png");

  /* ---------- App guides · 暗色（布局 + 新面层） ---------- */
  await setTheme("dark");
  await go("/guides.html?app=1", 3600); await clean();
  check("C1 guides 卡方角 3px", (await cs("#cardView .card", "borderRadius")) === "3px", await cs("#cardView .card", "borderRadius"));
  check("C2 guides 仍两列（布局未动）",
    ((await cs("#cardView", "gridTemplateColumns")) || "").split(" ").length === 2, await cs("#cardView", "gridTemplateColumns"));
  await shot("r19-app-guides-dark.png");

  /* ---------- App calculator · 暗色 ---------- */
  await go("/calculator.html?app=1", 3600); await clean();
  check("D1 计算器产出数字 = 青", (await cs(".total-value", "color")) === "rgb(81, 228, 230)", await cs(".total-value", "color"));
  check("D2 计算器头部方角 3px", (await cs(".header", "borderRadius")) === "3px", await cs(".header", "borderRadius"));
  await shot("r19-app-calc-dark.png");

  /* ---------- App 设置页 · 保持旧观感（网页端也未刷新） ---------- */
  await go("/app.html?app=1", 3200); await clean();
  check("E1 设置页底 = 旧 #0c0d11（不在 aoxi-refresh 范围）",
    (await cs("body", "backgroundColor")) === "rgb(12, 13, 17)", await cs("body", "backgroundColor"));
  await shot("r19-app-settings-dark.png");

  /* ---------- 被动详情页 · 保持旧观感 ---------- */
  await go("/passive/category.html?app=1&f=%E5%A5%A5%E7%89%B9%E4%B9%8B%E6%98%9F", 3200); await clean();
  check("F1 被动阵营页底 = 旧 #0c0d11（不在 aoxi-refresh 范围）",
    (await cs("body", "backgroundColor")) === "rgb(12, 13, 17)", await cs("body", "backgroundColor"));

  /* ---------- 网页版对照（同宽度下的新 UI 基准） ---------- */
  await go("/index.html", 3400); await clean();
  check("G1 网页版暗色底与 App 一致（#091317）",
    (await cs("body", "backgroundColor")) === "rgb(9, 19, 23)", await cs("body", "backgroundColor"));
  await shot("r19-web-home-dark.png");
  await setTheme("light");
  await go("/index.html", 3400); await clean();
  await shot("r19-web-home-light.png");

  console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("闸门异常：" + (e && e.stack || e)); process.exit(1); });
