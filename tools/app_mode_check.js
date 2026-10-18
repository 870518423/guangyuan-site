/* App 版适配层验收（第 14 轮 · tools/app_mode_check.js，2026-10-18）
   前置：node ../tools/serve.js . 8099  +  无头 Chrome 开 9222
   用法：NO_PROXY='*' NODE_PATH=<ws>/node_modules node tools/app_mode_check.js [baseUrl]

   覆盖：
     A. 网页版零变化：无 data-app、不请求 app.css / app-shell.js、首页仍是 1 列
     B. App 版：首页 2×2 + 精简文案、四个列表页两列、app.html 三区
     C. 首启弹层：只弹一次（点稍后写标记）
     D. 清单：app.css / app-shell.js / version.json / module.json 在 SW 预缓存
   截图：.workbuddy/shots/app-*.png（七态，供管理者验收）
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
  await send("Runtime.enable", {}); await send("Page.enable", {}); await send("Network.enable", {});
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
  const go = async (u, wait) => { await send("Page.navigate", { url: BASE + u }); await sleep(wait || 3000); };
  const clean = () => ev(`(function(){document.querySelectorAll('[class*=notice],[id*=notice],[class*=akn],[class*=update]').forEach(function(n){n.remove()});return true})()`);
  const cols = (sel) => ev(`(function(){var e=document.querySelector('${sel}');return e?getComputedStyle(e).gridTemplateColumns.split(' ').length:-1})()`);

  let appReqs = [];
  ws.on("message", (m) => {
    const d = JSON.parse(m);
    if (d.method === "Network.requestWillBeSent") {
      const u = d.params.request.url;
      if (u.indexOf("app.css") >= 0 || u.indexOf("app-shell") >= 0) appReqs.push(u);
    }
  });

  /* ---------- A. 网页版零变化 ---------- */
  appReqs = [];
  await go("/index.html", 3200); await clean();
  check("web 首页没有 data-app", (await ev(`document.documentElement.hasAttribute('data-app')`)) === false);
  check("web 首页不请求 app.css / app-shell.js", appReqs.length === 0, appReqs.length + " 个请求");
  check("web 首页仍是 1 列（440 宽）", (await cols(".entries")) === 1, await cols(".entries"));
  const clRow = await ev(`(function(){var t=document.querySelector('.changelog h3 span');var b=document.getElementById('clToggle');if(!t||!b)return null;return Math.abs(t.getBoundingClientRect().top-b.getBoundingClientRect().top)<8;})()`);
  check("更新记录展开按钮与标题同行（flex 行内）", clRow === true);
  check("更新记录按钮非绝对定位", (await ev(`getComputedStyle(document.getElementById('clToggle')).position`)) !== "absolute");
  const webHome = await shot("web-home.png");

  await go("/guides.html", 3200); await clean();
  check("web guides 没有 data-app", (await ev(`document.documentElement.hasAttribute('data-app')`)) === false);

  /* ---------- B. App 版 ---------- */
  await go("/index.html?app=1", 3400); await clean();
  check("app 首页 data-app=1", (await ev(`document.documentElement.getAttribute('data-app')`)) === "1");
  check("app 首页 2×2", (await cols(".entries")) === 2, await cols(".entries"));
  const copyOk = await ev(`(function(){
    var a=[].find.call(document.querySelectorAll('.entry'),function(x){return (x.getAttribute('href')||'').indexOf('calculator')>=0});
    return a ? a.querySelector('.desc').textContent.indexOf('16 项产出收益')>=0 : false;
  })()`);
  check("app 首页文案已换成精简版", copyOk === true);
  const gear = await ev(`(function(){var g=document.querySelector('.ak-app-gear');if(!g)return null;var r=g.getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top),pos:getComputedStyle(g).position};})()`);
  check("app 首页齿轮 fixed 左上", gear && gear.pos === "fixed" && gear.left < 120 && gear.top < 120, JSON.stringify(gear));
  check("app 首页更新记录默认收起", (await ev(`document.getElementById('clToggle').textContent`)) === "展开");
  const appHome = await shot("app-home.png");

  await go("/guides.html?app=1", 3600); await clean();
  check("app guides 两列", (await cols("#cardView")) === 2, await cols("#cardView"));
  const backHome = await ev(`(function(){var b=document.querySelector('.back-home');return b?getComputedStyle(b).position:'missing';})()`);
  check("guides 返回按钮①：页头 inline（非 fixed）", backHome !== "fixed", backHome);
  const fl2 = await ev(`(async function(){
    window.scrollTo(0, window.innerHeight * 1.2);
    await new Promise(function(r){setTimeout(r,450)});
    var f=document.querySelector('.ak-back-float');
    return !!(f && f.classList.contains('on'));
  })()`);
  check("guides 返回按钮②：滚过一屏左下浮出", fl2 === true);
  await shot("guides-back-floated.png");
  const fl3 = await ev(`(async function(){
    window.scrollTo(0, 0);
    await new Promise(function(r){setTimeout(r,450)});
    var f=document.querySelector('.ak-back-float');
    return !(f && f.classList.contains('on'));
  })()`);
  check("guides 返回按钮③：回顶隐藏", fl3 === true);
  check("app guides 无设置齿轮（仅主页面有）", (await ev(`!document.querySelector('.ak-app-gear')`)) === true);
  /* 浏览即缓存：页面内 fetch 一张图 → packs 桶应出现该键 */
  const cacheOk = await ev(`(async function(){
    await fetch('passive/img/factions/star.png', {cache:'no-store'});
    var c = await caches.open('guangyuan-packs');
    var ks = await c.keys();
    return ks.some(function(k){return k.url.indexOf('passive/img/factions/star.png')>=0});
  })()`);
  check("图片浏览即入 packs 桶（脱离 RUNTIME）", cacheOk === true);
  check("app guides 无设置齿轮（仅主页面有）", (await ev(`!document.querySelector('.ak-app-gear')`)) === true);
  const appGuides = await shot("app-guides.png");

  await go("/strategies.html?app=1", 3000); await clean();
  check("app strategies 两列", (await cols("#cards")) === 2, await cols("#cards"));

  await go("/passive/index.html?app=1", 3200); await clean();
  check("app passive 首页两列", (await cols(".akc-entries")) === 2, await cols(".akc-entries"));
  const appPassive = await shot("app-passive-index.png");

  await go("/passive/category.html?f=" + encodeURIComponent("奥特之星") + "&app=1", 3400); await clean();
  check("app passive 类别页两列", (await cols(".akc-list")) === 2, await cols(".akc-list"));
  const appCategory = await shot("app-passive-category.png");

  await go("/app.html?app=1", 3000); await clean();
  const zones = JSON.parse(await ev(`JSON.stringify([
    getComputedStyle(document.querySelector('#dl .web-only')).display,
    getComputedStyle(document.getElementById('packs')).display,
    getComputedStyle(document.getElementById('about')).display])`));
  check("app.html（App 内）下载内容隐藏、二区显示", zones.join(",") === "none,block,block", zones.join(","));
  check("app 内显示「检查更新」卡", (await ev(`!!document.getElementById('updBtn') && getComputedStyle(document.querySelector('#dl .app-only')).display==='block'`)) === true);
  check("app 内无 APK 下载链接", (await ev(`!document.querySelector('#dl .app-only a[href*=".apk"]')`)) === true);
  check("app 内三包描述为「并非五斗」", (await ev(`document.body.textContent.indexOf('并非五斗')>=0`)) === true);
  const appSettings = await shot("app-settings.png");

  /* ---------- D. 清单 ---------- */
  const swText = fs.readFileSync(path.join(__dirname, "..", "service-worker.js"), "utf8");
  ["app.css", "app-shell.js", "module.json", "version.json", "app.html"].forEach((f) => {
    check("SW 预缓存含 " + f, swText.indexOf(f) >= 0);
  });
  const mod = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "module.json"), "utf8"));
  check("module.json 三包齐全", ["guide", "passive", "humans"].every((k) => mod.packs[k] && mod.packs[k].count > 0),
    Object.keys(mod.packs).map((k) => k + ":" + mod.packs[k].count).join(" "));

  /* ---------- C. 首启弹层已移除（第 16 轮：浏览即缓存） ---------- */
  await go("/index.html", 2200);
  await go("/index.html?app=1", 3400);
  check("首启弹层已移除（清标记也不弹）", (await ev(`!!document.querySelector('.akp-pack-mask')`)) === false);

  /* ---------- web 端 app.html ---------- */
  await go("/app.html", 2600); await clean();
  const webZones = JSON.parse(await ev(`JSON.stringify([
    getComputedStyle(document.getElementById('packs')).display,
    getComputedStyle(document.querySelector('.webnote')).display])`));
  check("web 打开 app.html：② 区隐藏、提示条显示", webZones[0] === "none" && webZones[1] === "block", webZones.join(","));
  check("web 下载卡有可用 APK 链接", (await ev(`!!document.querySelector('#dl a[href*="aoxi-tools-v0.1.0.apk"]')`)) === true);
  check("web 设置页无「技术栈」段", (await ev(`document.body.textContent.indexOf('技术栈')<0`)) === true);
  check("web 署名 chief和小娜", (await ev(`document.body.textContent.indexOf('chief和小娜')>=0`)) === true);
  const webSettings = await shot("app-settings-web.png");

  console.log("  " + (fail ? "FAILED" : "ALL PASS") + "  " + pass + " pass / " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
