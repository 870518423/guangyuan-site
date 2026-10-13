/* 计算器回归验收（M6 硬指标 1/5）
   用法：
     node tools/calc_regress.js http://127.0.0.1:8920/calculator.html --save   # 采集基线
     node tools/calc_regress.js http://127.0.0.1:8920/calculator.html          # 与基线比对
   12 组断言：数值渲染、日期计算、签到、资源预测、排除规则、环形图、移动端底栏、主题配色。
   依赖：同目录 serve.js 起站 + 带 CDP 的 Chrome（默认 9222）。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8920/calculator.html";
const SAVE = process.argv.includes("--save");
const BASELINE = path.join(__dirname, "calc_baseline.json");
const CDP_PORT = Number(process.env.CDP_PORT || 9222);

const PROBE = `(function(){
  var t = function (sel) { var e = document.querySelector(sel); return e ? e.textContent.trim() : null; };
  var cards = Array.prototype.slice.call(document.querySelectorAll('.resource-card'));
  var legend = Array.prototype.slice.call(document.querySelectorAll('#donutLegend *'))
    .map(function (e) { return e.textContent.trim(); }).filter(function (s) { return /%/.test(s); });
  var cs = getComputedStyle(document.documentElement);
  return JSON.stringify({
    daysValue: t('#daysValue'),
    mondayInfo: t('#mondayInfo'),
    totalPredicted: t('#totalPredicted'),
    grandTotal: t('#grandTotal'),
    mobileGrandTotal: t('#mobileGrandTotal'),
    donutCenter: t('#donutCenterValue'),
    legendPct: legend,
    cardCount: cards.length,
    cardTitles: cards.slice(0, 4).map(function (c) { return c.textContent.replace(/\\s+/g, ' ').trim().slice(0, 18); }),
    computeDays: typeof computeDays === 'function' ? computeDays() : null,
    countMondays: typeof countMondaysInRange === 'function' ? countMondaysInRange() : null,
    signInReward: typeof getSignInReward === 'function' ? getSignInReward(1, 30) : null,
    effectiveDays: typeof getEffectiveDays === 'function'
      ? [getEffectiveDays({ isPrison: false }, 10, 2), getEffectiveDays({ isPrison: true }, 10, 2)] : null,
    dailyAvgMonthly: typeof getDailyAverage === 'function' ? getDailyAverage({ type: 'monthly', monthlyTotal: 3000 }) : null,
    excluded: typeof isExcluded === 'function'
      ? [isExcluded({ enabled: false }), isExcluded({ enabled: true })] : null,
    themeVars: {
      gold: cs.getPropertyValue('--gold').trim() || cs.getPropertyValue('--ak-gold').trim(),
      bg: cs.getPropertyValue('--bg-1').trim() || cs.getPropertyValue('--ak-bg').trim()
    },
    bodyBg: getComputedStyle(document.body).backgroundColor,
    headerTtlMinWidth: (function () {
      var h = document.querySelector('.header .ttl');
      return h ? getComputedStyle(h).minWidth : null;
    })(),
    cardBorderRadius: (function () {
      var c = document.querySelector('.resource-card');
      return c ? getComputedStyle(c).borderRadius : null;
    })(),
    hash: document.documentElement.className
  });
})()`;

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: CDP_PORT, path: p }, r => {
      let b = ""; r.on("data", c => b += c); r.on("end", () => res(JSON.parse(b)));
    }).on("error", rej);
  });
}

(async () => {
  const tabs = await get("/json");
  const page = tabs.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  const send = (m, p) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.on("message", m => { const d = JSON.parse(m); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } });
  await new Promise(r => ws.on("open", r));
  await send("Runtime.enable", {});
  await send("Page.enable", {});
  await send("Emulation.setDeviceMetricsOverride", { width: 440, height: 900, deviceScaleFactor: 2, mobile: true });

  /* 清掉 SW 与缓存，确保测的是磁盘上的最新文件 */
  await send("Page.navigate", { url: URL_ARG });
  await new Promise(r => setTimeout(r, 800));
  await send("Runtime.evaluate", { expression: `(async()=>{
      const rs = await navigator.serviceWorker.getRegistrations();
      for (const r of rs) await r.unregister();
      const ks = await caches.keys();
      for (const k of ks) await caches.delete(k);
      return 'cleared';})()`, awaitPromise: true, returnByValue: true });

  await send("Page.navigate", { url: URL_ARG + (URL_ARG.includes("?") ? "&" : "?") + "reg=1" });
  await new Promise(r => setTimeout(r, 2600));

  const r = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true });
  if (!r.result || !r.result.result || !r.result.result.value) {
    console.error("探针执行失败:", JSON.stringify(r.result && r.result.exceptionDetails || {}).slice(0, 300));
    process.exit(2);
  }
  const now = JSON.parse(r.result.result.value);

  if (SAVE) {
    fs.writeFileSync(BASELINE, JSON.stringify(now, null, 2), "utf8");
    console.log("基线已保存:", BASELINE);
    Object.keys(now).forEach(k => console.log("  " + k + " = " + JSON.stringify(now[k])));
    ws.close();
    process.exit(0);
  }

  if (!fs.existsSync(BASELINE)) { console.error("找不到基线文件，请先 --save 采集"); process.exit(2); }
  const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const keys = Object.keys(base);
  let fails = 0;
  keys.forEach(k => {
    const a = JSON.stringify(base[k]), b = JSON.stringify(now[k]);
    const ok = a === b;
    if (!ok) fails++;
    console.log((ok ? "PASS " : "FAIL ") + k + (ok ? "" : "\n      基线: " + a + "\n      现在: " + b));
  });
  console.log(fails ? "\n计算器回归：" + (keys.length - fails) + "/" + keys.length + "，有 " + fails + " 项不一致"
                     : "\n计算器回归 " + keys.length + "/" + keys.length + " 全部一致");
  ws.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("脚本错误:", e.message); process.exit(2); });
