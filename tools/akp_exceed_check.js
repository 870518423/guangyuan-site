/* 超越技版本对比专项验收（tools/akp_exceed_check.js）
   用法：node tools/akp_exceed_check.js [baseUrl] [id...]
     默认 baseUrl = http://127.0.0.1:8920/passive；默认校验两个带超越技多版本数据的角色。
   检查：超越技板块存在、随版本切换正文、开对比后有标注、v3/v4（无素材）沿用 v2、
        与被动板块的版本状态联动（同一角色共享 VS）。
   管理者口径（2026-10-13）：超越技也要能对比。 */
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
  let IDS = process.argv.slice(3);
  if (!IDS.length) IDS = ["aotewang-by", "jiede-zhongji"];

  const checks = []; let fails = 0;
  const ok = (n, c, extra) => { checks.push((c ? "PASS " : "FAIL ") + n + (extra ? "  [" + extra + "]" : "")); if (!c) fails++; };

  for (const cid of IDS) {
    await send("Page.navigate", { url: BASE + "/char.html?id=" + cid });
    await new Promise(r => setTimeout(r, 2500));

    /* 取该角色超越技的版本集合，确定「有素材的版本」 */
    const info = JSON.parse(await ev(`JSON.stringify((function(){
      var d = AKP.get(${JSON.stringify(cid)});
      var ex = (d.sections||[]).filter(function(s){return s.type==='exceed';})[0];
      var ent = ex ? (ex.entries||ex.items||[])[0] : null;
      return {
        hasExceed: !!ex,
        title: ex ? (ex.title||'') : '',
        heading: ex ? (ex.heading||'') : '',
        verKeys: ent && ent.texts ? Object.keys(ent.texts) : [],
        versions: (d.versions||[]).map(function(v){return v.id;}),
        hasParagraphs: !!(ex && ex.paras && ex.paras.length),
        nEnt: ex ? (ex.entries||ex.items||[]).length : 0
      };})())`));
    ok(cid + " 具备超越技板块", info.hasExceed === true, info.title);
    ok(cid + " 超越技已改为多版本数据（无 paras）", info.verKeys.length >= 2 && !info.hasParagraphs,
       "verKeys=" + info.verKeys.join(",") + " paras=" + info.hasParagraphs);

    const verSec = '.akp-sec--exceed';
    /* 逐版本切换：正文应随版本变化 */
    const texts = {};
    for (let i = 0; i < info.versions.length; i++) {
      const t = await ev(`(function(){
        var s = document.querySelector('${verSec}');
        if (!s) return null;
        return s.querySelector('.akp-body') ? s.querySelector('.akp-body').textContent.trim() : s.textContent.trim();
      })()`);
      texts[info.versions[i]] = String(t || "").slice(0, 60);
      if (i < info.versions.length - 1) {
        await ev(`(function(){var b=document.querySelector('.akp-actions [data-akp-role="ver"]'); b&&b.click();})()`);
        await new Promise(r => setTimeout(r, 320));
      }
    }
    const uniq = new Set(Object.values(texts));
    ok(cid + " 正文随版本切换而变化", uniq.size >= 2, uniq.size + " 种文案");

    /* v3/v4（无素材）应沿用 v2：对捷德终极形态验证 */
    if (cid === "jiede-zhongji") {
      ok("捷德 v3 沿用 v2（无超越技素材）", texts.v3 === texts.v2, "v2=" + texts.v2 + " | v3=" + texts.v3);
      ok("捷德 v4 沿用 v2", texts.v4 === texts.v2, "v4=" + texts.v4);
      ok("捷德 v5 与 v2 不同（改版）", texts.v5 !== texts.v2, "v5=" + texts.v5);
    }

    /* 回到最新版本 → 开对比：超越技应出现标注 */
    let guard = 0;
    while (guard++ < 8) {
      const cur = await ev(`(function(){var e=document.querySelector('.akp-actions .akp-ver');return e?e.textContent.trim():'';})()`);
      if (cur.indexOf(info.versions[info.versions.length - 1]) >= 0) break;
      await ev(`document.querySelector('.akp-actions [data-akp-role="ver"]').click()`);
      await new Promise(r => setTimeout(r, 300));
    }
    await ev(`document.querySelector('.akp-actions [data-akp-role="cmp"]').click()`);
    await new Promise(r => setTimeout(r, 700));
    const diff = JSON.parse(await ev(`JSON.stringify((function(){
      var s = document.querySelector('${verSec}');
      return { spans: s ? s.querySelectorAll('.akp-diff').length : -1,
               hasMarker: s ? /（/.test(s.textContent) : false };})())`));
    ok(cid + " 对比态下超越技有改动标注", diff.spans > 0, "spans=" + diff.spans);
    ok(cid + " 对比态正文仍可读（含改动展示）", diff.hasMarker === true, "");
  }

  console.log(checks.join("\n"));
  console.log(fails ? "\n超越技对比验收：" + fails + " 项失败" : "\n超越技对比验收：全部通过 " + checks.length + "/" + checks.length);
  ws.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("脚本错误:", e.message); process.exit(2); });
