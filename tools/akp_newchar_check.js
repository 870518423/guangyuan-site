/* 新角色专项验收（tools/akp_newchar_check.js）
   用法：node tools/akp_newchar_check.js <baseUrl> [id1 id2 ...]
     例：node tools/akp_newchar_check.js http://127.0.0.1:8940/passive aotewang-by jiede-zhongji
   默认 baseUrl = http://127.0.0.1:8920/passive，默认校验最近新增的 4 个角色。
   检查：首页统计与清单一致、阵营页含全部已收录角色、每个角色页的日期/按钮/立绘/条目渲染、
        以及对比态下「同义词不被标注」（管理者口径）。 */
/* 新增角色专项验收：奥特之王（BY）/ 捷德终极形态 / 赛罗两形态
   检查：清单与列表数量、角色页渲染、版本按钮、日期显示、对比口径（同义词/标点不标） */
const http = require("http");
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
  const BASE = (process.argv[2] || "http://127.0.0.1:8920/passive").replace(/\/$/, "");
  const checks = []; let fails = 0;
  const ok = (n, c, extra) => { checks.push((c ? "PASS " : "FAIL ") + n + (extra ? "  [" + extra + "]" : "")); if (!c) fails++; };

  /* 1. 首页与阵营页数量 = 清单 ready 数 */
  await send("Page.navigate", { url: BASE + "/index.html" });
  await new Promise(r => setTimeout(r, 2600));
  const home = JSON.parse(await ev(`JSON.stringify((function(){
    return {
      stat: (document.querySelector('.entry .meta')||{}).textContent || '',
      ready: (window.AKP_MANIFEST||[]).filter(function(m){return m.ready!==false;}).length,
      total: (window.AKP_MANIFEST||[]).length
    };})())`));
  ok("首页统计与清单一致", home.stat.indexOf(home.ready + " 位角色") >= 0, home.stat + " / ready=" + home.ready);
  /* 清单总数：15→17（2026-10-13 超限/奥王BY/捷德终极）→19（2026-10-14 令迦/光辉赛罗/终极赛罗闪耀型/雷古洛思）。
     新增 ready 角色后同步改这里；「首页统计与清单一致」是动态断言，不用改。 */
  ok("清单条目数=19", home.total === 19, "total=" + home.total);

  await send("Page.navigate", { url: BASE + "/category.html?f=" + encodeURIComponent("奥特之星") });
  await new Promise(r => setTimeout(r, 2400));
  const cat = JSON.parse(await ev(`JSON.stringify((function(){
    var names = [].map.call(document.querySelectorAll('.akc-name'), function(e){return e.textContent.trim();});
    var tiers = [].map.call(document.querySelectorAll('.akc-tier'), function(e){return e.textContent.trim();});
    return { cards: document.querySelectorAll('.akc-card').length, names: names, tiers: tiers };})())`));
  ok("阵营页含两个新角色", cat.names.indexOf("奥特之王（BY）") >= 0 && cat.names.indexOf("捷德终极形态") >= 0,
     cat.names.join("/"));
  ok("两个新角色 tier 标签为 BY", cat.tiers.filter(t => t === "BY").length >= 2, cat.tiers.join("/"));
  ok("阵营页含赛罗两形态（补同步生效）",
     cat.names.indexOf("赛罗无限形态") >= 0 && cat.names.indexOf("赛罗无限形态（超限）") >= 0, "");

  /* 2. 逐角色页：版本按钮、日期、对比渲染 */
  var IDS = process.argv.slice(3);
  if (!IDS.length) IDS = ["aotewang-by", "jiede-zhongji", "sailuo-wuxian", "sailuo-wuxian-chaoxian"];
  for (const cid of IDS) {
    await send("Page.navigate", { url: BASE + "/char.html?id=" + cid });
    await new Promise(r => setTimeout(r, 2400));
    const base = JSON.parse(await ev("JSON.stringify((function(){var d=window.AKP&&AKP.get(" + JSON.stringify(cid) + ");return d?{last:d.versions[d.versions.length-1].id,first:d.versions[0].date}:{};})())"));
    const expectVer = base.last || "v1", firstDate = base.first || "";
    const st = JSON.parse(await ev(`JSON.stringify((function(){
      var d = document.querySelector('.akp-sec--passive .akp-bar .akp-ver--date');
      var b = document.querySelector('.akp-actions [data-akp-role="ver"]');
      var portrait = document.querySelector('.akp-portrait img, .akp-hero img, img[src*="角色图"]');
      return {
        date: d ? d.textContent.trim() : null,
        verBtn: b ? b.textContent.trim() : null,
        portrait: portrait ? (portrait.getAttribute('src')||'') : '',
        entries: document.querySelectorAll('.akp-item').length,
        sections: document.querySelectorAll('.akp-sec').length
      };})())`));
    ok(cid + " 日期显示 " + firstDate, st.date === firstDate, String(st.date));
    ok(cid + " 版本按钮可用（指向下一版）", /^查看 v\d+$/.test(String(st.verBtn)), String(st.verBtn));
    ok(cid + " 立绘已加载", /img\//.test(st.portrait), st.portrait);
    ok(cid + " 渲染出条目", st.entries >= 5, "entries=" + st.entries);

    /* 切到最新版本并开对比：不应出现「同义词/标点」被标注 */
    for (let i = 0; i < 6; i++) {
      const cur = await ev(`(document.querySelector('.akp-actions .akp-ver')||{}).textContent`);
      if (String(cur).trim() === expectVer) break;
      await ev(`document.querySelector('.akp-actions [data-akp-role="ver"]').click()`);
      await new Promise(r => setTimeout(r, 320));
    }
    await ev(`document.querySelector('.akp-actions [data-akp-role="cmp"]').click()`);
    await new Promise(r => setTimeout(r, 600));
    /* 口径：**同义改写被标出来** 才算问题（提高↔增加、降低↔减少）。
       ⚠️ 2026-10-14 修：原来只要有个 diff 块正好等于「提高」就报错，
       会误伤「额外~~提高~~〖绿:使〗自身命中率增加30%」这类**真改动**
       （旧写法被换成「使…增加」）。改为只看**相邻两块的同义对**。
       角色/目标 同日改口径为「要标」，故不在同义集里。 */
    const bad = await ev(`(function(){
      var syn = {"增加":"提高","提高":"增加","降低":"减少","减少":"降低"};
      var ns = [].slice.call(document.querySelectorAll('.akp-sec--passive .akp-diff'));
      var hit = [];
      for (var i = 0; i < ns.length - 1; i++) {
        var a = ns[i].textContent.trim(), b = ns[i+1].textContent.trim();
        if (syn[a] && syn[b] === a) hit.push(a + "→" + b);
      }
      return JSON.stringify(hit);
    })()`);
    const badArr = JSON.parse(bad || "[]");
    ok(cid + " 对比中无同义词被标注", badArr.length === 0, badArr.join("|"));
  }

  console.log(checks.join("\n"));
  console.log(fails ? "\n新增角色专项：" + fails + " 项失败" : "\n新增角色专项：全部通过 " + checks.length + "/" + checks.length);
  ws.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("脚本错误:", e.message); process.exit(2); });
