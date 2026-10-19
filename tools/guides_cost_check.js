/* 人间体图鉴「光元消耗 / 商店价着色」验收（tools/guides_cost_check.js，2026-10-17）
   前置：node ../tools/serve.js . 8099  +  无头 Chrome 开 9222
   用法：NO_PROXY='*' NODE_PATH=<ws>/node_modules node tools/guides_cost_check.js [baseUrl]

   检查：
     1. 132 张卡片每张都有「光元消耗」行；表格多出第 7 列且每行有值
     2. 特训名单里：6000 → .p6000（金）、未标价商店 → .p11280（橙）；其它栏位不误染
     3. 卡片上的数值 / 标题明细 = 该角色 traits 价格之和（与 GUIDE 数据独立复算）
     4. 光元图标已换成 webp 且能成功加载
     5. 详情弹层也有「光元消耗」
   截图：.workbuddy/shots/guides-cost-{card,table,modal}.png */
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
  const page = tabs.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  const send = (m, p) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.on("message", (m) => { const d = JSON.parse(m); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } });
  await new Promise((r) => ws.on("open", r));
  await send("Runtime.enable", {}); await send("Page.enable", {});
  await send("Emulation.setDeviceMetricsOverride", { width: 440, height: 1000, deviceScaleFactor: 2, mobile: true });

  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return "__ERR__ " + JSON.stringify(r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const shot = async (name, clip) => {
    const r = await send("Page.captureScreenshot", clip ? { format: "png", clip: clip } : { format: "png" });
    const p = path.join(OUT, name); fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(p, Buffer.from(r.result.data, "base64")); return p;
  };

  await send("Page.navigate", { url: BASE + "/guides.html" });
  await sleep(3500);

  /* ---------- 1) 结构与数量 ---------- */
  const st = JSON.parse(await ev(`JSON.stringify((function(){
    var cards = [].slice.call(document.querySelectorAll('#cardView .card'));
    var rows = [].slice.call(document.querySelectorAll('#tbody tr'));
    var cost = document.querySelectorAll('#cardView .costval');
    var ths = [].slice.call(document.querySelectorAll('thead th')).map(function(t){return t.textContent.trim();});
    var tds = rows.length ? rows[0].children.length : 0;
    return {cards:cards.length, rows:rows.length, cost:cost.length, ths:ths, tds:tds,
            p6:document.querySelectorAll('#cardView .tag.nam.p6000').length,
            p11:document.querySelectorAll('#cardView .tag.nam.p11280').length,
            plainNam:document.querySelectorAll('#cardView .tag.nam:not(.p6000):not(.p11280)').length};
  })())`));
  check("卡片 132 张", st.cards === 132, st.cards);
  check("每张卡片都有「光元消耗」", st.cost === st.cards, st.cost + "/" + st.cards);
  check("表格表头多出「光元消耗」列", st.ths.length === 7 && st.ths[6] === "光元消耗", st.ths.join("|"));
  check("特训名单出现金色（6000）标签", st.p6 > 0, st.p6 + " 个");
  check("特训名单出现橙色（11280）标签", st.p11 > 0, st.p11 + " 个");

  /* ---------- 2) 着色范围：只有特训栏染色 ---------- */
  const scope = JSON.parse(await ev(`JSON.stringify((function(){
    var bad = 0;
    [].slice.call(document.querySelectorAll('#cardView .row')).forEach(function(r){
      var k = (r.querySelector('.k')||{}).textContent || '';
      var dyed = r.querySelectorAll('.tag.nam.p6000,.tag.nam.p11280').length;
      if (k !== '特训所需' && dyed) bad++;
    });
    return {bad:bad};
  })())`));
  check("非「特训所需」栏位没有误染色", scope.bad === 0, scope.bad + " 处");

  /* ---------- 3) 数值复算（页面里独立算一遍再比 DOM） ---------- */
  const calc = JSON.parse(await ev(`JSON.stringify((function(){
    var by = Object.create(null);
    GUIDE.entries.forEach(function(e){ by[e.name]=e; });
    function price(n){
      var e = by[n]; if(!e) return 0;
      var p = 0, shop = false;
      (e.how||[]).forEach(function(x){
        var m = /(\\d{3,6})\\s*光元/.exec(x); if (m && !p) p = +m[1];
        if (x.indexOf('商店') >= 0) shop = true;
      });
      return p || (shop ? 11280 : 0);
    }
    var bad = [], zeros = 0, n = 0;
    [].slice.call(document.querySelectorAll('#cardView .card')).forEach(function(card){
      var name = (card.querySelector('.card-hd h3')||{}).textContent || '';
      var e = by[name]; if(!e) return;
      var want = (e.traits||[]).reduce(function(s,t){ return s + price(t); }, 0);
      var dom = card.querySelector('.costval');
      var got = parseInt((dom ? dom.textContent : '').replace(/[^0-9]/g,''), 10) || 0;
      n++;
      if (want !== got) bad.push(name + ':' + want + '≠' + got);
      if (!want) zeros++;
    });
    return {n:n, bad:bad.slice(0,5), nbad:bad.length, zeros:zeros};
  })())`));
  check("132 张卡片的光元消耗全部等于价格之和", calc.nbad === 0, "复算 " + calc.n + " 张，不一致 " + calc.nbad);
  check("无消耗的角色显示 0（不是空白）", calc.zeros > 0, calc.zeros + " 张");

  /* ---------- 4) 明细 tooltip ---------- */
  const tip = JSON.parse(await ev(`JSON.stringify((function(){
    var el = [].slice.call(document.querySelectorAll('#cardView .costval')).filter(function(x){return x.title;})[0];
    return {title: el ? el.title : ''};
  })())`));
  check("多角色相加时 title 给出明细", /\d+ \+ \d+ = \d+/.test(tip.title), tip.title);

  /* ---------- 5) 光元图标 → webp 且加载成功 ---------- */
  const ico = JSON.parse(await ev(`JSON.stringify((function(){
    var im = document.querySelector('#cardView .costval img');
    return {src: im ? im.getAttribute('src') : '', ok: !!(im && im.complete && im.naturalWidth > 0), w: im ? im.naturalWidth : 0};
  })())`));
  check("光元图标指向 webp", /guangyuan\.webp$/.test(ico.src), ico.src);
  check("光元图标实际加载成功", ico.ok === true, "naturalWidth=" + ico.w);

  /* ---------- 6) 截图（卡片 / 文字版 / 弹层） ----------
     ⚠️ 2026-10-19 修正：页面视图切换早已定为「文字版 / 图片版」（原「表格视图」已移除，
     只剩空 thead/tbody 壳，数据行不再渲染）。旧脚本还点 [data-view=table] → 按钮不存在
     → null.click 抛错 → 误报。改为验证两种现有视图下光元消耗都完整呈现。 */
  const cardShot = await shot("guides-cost-card.png");
  await ev(`document.querySelector('.viewtoggle button[data-view="text"]').click()`);
  await sleep(600);
  const textCost = await ev(`document.querySelectorAll('#cardView .costval').length`);
  check("文字版下光元消耗完整（132）", textCost === 132, textCost);
  const textShot = await shot("guides-cost-text.png");
  await ev(`document.querySelector('.viewtoggle button[data-view="image"]').click()`);
  await sleep(500);
  await ev(`document.querySelector('#cardView .card-hd h3').click()`);
  await sleep(700);
  const modal = JSON.parse(await ev(`JSON.stringify((function(){
    var secs = [].slice.call(document.querySelectorAll('#mBody .m-sec .st')).map(function(x){return x.textContent.trim();});
    return {open: document.getElementById('modal').classList.contains('on'), secs:secs,
            cost: (document.querySelector('#mBody .costval')||{}).textContent||''};
  })())`));
  check("详情弹层打开", modal.open === true);
  check("弹层里有「光元消耗」小节", modal.secs.indexOf("光元消耗") >= 0, modal.secs.join(" | "));
  const modalShot = await shot("guides-cost-modal.png");

  /* ---------- 7) 最高价角色：确认金/橙两色同时可见 ---------- */
  await ev(`document.getElementById('mClose').click()`);
  await sleep(350);
  await ev(`(function(){var i=document.getElementById('q');i.value='工藤优幸';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(600);
  const hi = JSON.parse(await ev(`JSON.stringify((function(){
    var cards = [].slice.call(document.querySelectorAll('#cardView .card'));
    var c = cards[0];
    if (!c) return {n:0};
    var v = c.querySelector('.costval');
    return {n:cards.length,
            name:(c.querySelector('.card-hd h3')||{}).textContent||'',
            cost:parseInt(((v||{}).textContent||'').replace(/[^0-9]/g,''),10)||0,
            p6:c.querySelectorAll('.p6000').length, p11:c.querySelectorAll('.p11280').length};
  })())`));
  check("搜索「工藤优幸」首张即本人且显示 56,400", hi.name === "工藤优幸" && hi.cost === 56400,
    hi.name + " / " + hi.cost + " / 命中 " + hi.n + " 张（含把他写进特训的）");
  check("该卡片 5 个特训角色全部按商店价着色", hi.p6 + hi.p11 === 5, "金 " + hi.p6 + " / 橙 " + hi.p11);
  await ev(`document.querySelector('#cardView .card').scrollIntoView({block:'center'})`);
  await sleep(400);
  const hiShot = await shot("guides-cost-high.png");

  console.log("\n  截图：" + [cardShot, textShot, modalShot, hiShot].join("  "));
  console.log("  " + (fail ? "FAILED" : "ALL PASS") + "  " + pass + " pass / " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
