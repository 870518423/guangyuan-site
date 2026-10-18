/* 阵营页「品质分组 + 一键折叠」验收（tools/akp_catgroup_check.js）
   用法：node tools/akp_catgroup_check.js [baseUrl]     默认 http://127.0.0.1:8099/passive
   检查：首页阵营卡描述文案、按品质分组（超越 BY 在上 / 究极 UL 在下）、
        组内卡片数、标题按钮触摸高度 ≥44px、折叠与展开、aria-expanded 同步、无横向溢出。
   管理者口径（2026-10-13）：BY = 超越品质、UL = 究极品质；BY 组排在上方。 */
/* 品质分组 + 一键折叠 验收 */
const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: 9222, path: p }, r => {
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
  await send("Runtime.enable", {}); await send("Page.enable", {});
  await send("Emulation.setDeviceMetricsOverride", { width: 440, height: 900, deviceScaleFactor: 2, mobile: true });
  const ev = async (e) => {
    const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const BASE = (process.argv[2] || "http://127.0.0.1:8099/passive").replace(/\/$/, "");
  /* 先把「视图模式」钉回文字版再开始断言：该值持久化在 localStorage，
     手动切过原图版后跑验收，会因「原图版会藏起正文」而误报（2026-10-16 踩到）。
     做法：借脚本自己的第一次导航之前先访问一次站点源把值改掉；
     不用 addScriptToEvaluateOnNewDocument，避免在共用浏览器里留下长期注入。 */
  await send("Page.navigate", { url: BASE + "/index.html" });
  await new Promise(r => setTimeout(r, 900));
  await ev("try{localStorage.setItem('akp-view-mode','text');}catch(e){}");

  const checks = []; let fails = 0;
  const ok = (n, c, extra) => { checks.push((c ? "PASS " : "FAIL ") + n + (extra ? "  [" + extra + "]" : "")); if (!c) fails++; };

  /* ---- 首页描述文案 ---- */
  await send("Page.navigate", { url: BASE + "/index.html" });
  await new Promise(r => setTimeout(r, 2400));
  const desc = await ev(`(document.querySelector('.entry .desc')||{}).textContent || ''`);
  ok("首页描述已更新为「究极（UL）/超越（BY）」",
     desc.indexOf("究极（UL）/超越（BY）品质奥特之星角色") >= 0, desc.trim());

  /* ---- 阵营页分组 ---- */
  await send("Page.navigate", { url: BASE + "/category.html?f=" + encodeURIComponent("奥特之星") });
  await new Promise(r => setTimeout(r, 2600));
  const g = JSON.parse(await ev(`JSON.stringify((function(){
    var secs = [].slice.call(document.querySelectorAll('.akc-tiergroup'));
    return {
      n: secs.length,
      labels: secs.map(function(s){return s.querySelector('.akc-group-label').textContent.trim();}),
      counts: secs.map(function(s){return s.querySelectorAll('.akc-card').length;}),
      btnH: secs.length ? Math.round(secs[0].querySelector('.akc-group').getBoundingClientRect().height) : 0,
      labels_btn: secs.map(function(s){return s.querySelector('.akc-group-toggle').textContent.trim();}),
      aria: secs.map(function(s){return s.querySelector('.akc-group').getAttribute('aria-expanded');}),
      listGap: (function(){var l=document.querySelector('.akc-list'); return l?getComputedStyle(l).rowGap:null;})()
    };})())`));
  ok("分为 2 组", g.n === 2, "n=" + g.n + " labels=" + g.labels.join(","));
  ok("BY 组排在最上方", g.labels[0] === "超越（BY）", g.labels.join(" / "));
  ok("UL 组排在下方", g.labels[1] === "究极（UL）", g.labels.join(" / "));
  /* 卡片计数：2026-10-14 新增令迦/光辉赛罗/终极赛罗闪耀型/雷古洛思（均奥特之星/BY）→ BY 6、合计 17；
     2026-10-16 新增赛罗无限形态（银河闪耀）（奥特之星/BY）→ BY 7、合计 18（UL 11 不变；
     极恶贝利亚 ready:false 不上阵营页）。新增角色后同步改这里。 */
  ok("两组卡片数合计=18", (g.counts[0] + g.counts[1]) === 18, g.counts.join("+"));
  ok("BY 组含 7 位、UL 组含 11 位", g.counts[0] === 7 && g.counts[1] === 11, g.counts.join("+"));
  ok("分组标题按钮触摸高度 ≥44px", g.btnH >= 44, g.btnH + "px");
  ok("初始状态为展开（aria-expanded=true）", g.aria.every(a => a === "true"), g.aria.join(","));
  ok("初始按钮文案为「折叠」", g.labels_btn.every(t => t === "折叠"), g.labels_btn.join(","));

  /* ---- 点击折叠 BY 组 ---- */
  await ev(`document.querySelectorAll('.akc-group')[0].click()`);
  await new Promise(r => setTimeout(r, 600));
  const folded = JSON.parse(await ev(`JSON.stringify((function(){
    var s = document.querySelectorAll('.akc-tiergroup')[0];
    var body = s.querySelector('.akc-foldbody');
    var first = s.querySelector('.akc-card');
    var ulBody = document.querySelectorAll('.akc-tiergroup')[1].querySelector('.akc-foldbody');
    return {
      folded: s.classList.contains('is-folded'),
      bodyH: Math.round(body.getBoundingClientRect().height),
      cardVisibleH: Math.round(first.getBoundingClientRect().height),
      toggle: s.querySelector('.akc-group-toggle').textContent.trim(),
      aria: s.querySelector('.akc-group').getAttribute('aria-expanded'),
      ulBodyH: Math.round(ulBody.getBoundingClientRect().height),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };})())`));
  ok("BY 组已折叠（高度归零）", folded.folded && folded.bodyH === 0, "bodyH=" + folded.bodyH);
  ok("折叠后按钮文案变「展开」", folded.toggle === "展开", folded.toggle);
  ok("aria-expanded 同步为 false", folded.aria === "false", String(folded.aria));
  ok("折叠 BY 不影响 UL 组", folded.ulBodyH > 100, "ulBodyH=" + folded.ulBodyH);
  ok("无横向溢出", folded.overflowX <= 0, String(folded.overflowX));

  /* 截图：BY 折叠态 */
  const shot1 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(process.env.TEMP + "\\cat_folded.png", Buffer.from(shot1.result.data, "base64"));

  /* ---- 再展开 ---- */
  await ev(`document.querySelectorAll('.akc-group')[0].click()`);
  await new Promise(r => setTimeout(r, 700));
  const back = JSON.parse(await ev(`JSON.stringify((function(){
    var s = document.querySelectorAll('.akc-tiergroup')[0];
    return { h: Math.round(s.querySelector('.akc-foldbody').getBoundingClientRect().height),
             toggle: s.querySelector('.akc-group-toggle').textContent.trim() };})())`));
  ok("再点击可展开回原状", back.h > 100 && back.toggle === "折叠", "h=" + back.h + " toggle=" + back.toggle);

  /* ---- 折叠 UL 组（下方那组） ---- */
  await ev(`document.querySelectorAll('.akc-group')[1].click()`);
  await new Promise(r => setTimeout(r, 600));
  const ulFold = JSON.parse(await ev(`JSON.stringify((function(){
    var s = document.querySelectorAll('.akc-tiergroup')[1];
    return { h: Math.round(s.querySelector('.akc-foldbody').getBoundingClientRect().height),
             by: Math.round(document.querySelectorAll('.akc-tiergroup')[0].querySelector('.akc-foldbody').getBoundingClientRect().height) };})())`));
  ok("UL 组也能独立折叠", ulFold.h === 0 && ulFold.by > 100, "ul=" + ulFold.h + " by=" + ulFold.by);

  const shot2 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(process.env.TEMP + "\\cat_ul_folded.png", Buffer.from(shot2.result.data, "base64"));

  console.log(checks.join("\n"));
  console.log(fails ? "\n分组折叠验收：" + fails + " 项失败" : "\n分组折叠验收：全部通过 " + checks.length + "/" + checks.length);
  ws.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("脚本错误:", e.message); process.exit(2); });
