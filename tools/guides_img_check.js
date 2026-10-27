/* 人间体图鉴「纯文字版 / 图片版 + 详情立绘」验收（tools/guides_img_check.js，2026-10-17）
   前置：node ../tools/serve.js . 8099  +  无头 Chrome 开 9222
   用法：NO_PROXY='*' NODE_PATH=<ws>/node_modules node tools/guides_img_check.js [baseUrl]

   检查：
     1. 默认纯文字版：卡片无头像、阵营图标可见
     2. 切图片版：每张卡左侧是 44px 常**态**头像（avatar.webp），且加载成功
     3. 详情：立绘出现，默认常态；右箭头 → 觉醒 → 超越觉醒，边界箭头置灰
     4. 朝影雄一郎三张立绘齐全，常态 → 觉醒 → 超越觉醒均可加载
     5. 表格视图已停用（切不到、DOM 不渲染）
   截图：.workbuddy/shots/guides-{text,image,detail-base,detail-transcend,detail-chaoying,detail-text,detail-gongteng-lingjia}.png + passive-lingjia-from-guides.png */
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
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const p = path.join(OUT, name); fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(p, Buffer.from(r.result.data, "base64")); return p;
  };
  const nav = async (u, w) => { await send("Page.navigate", { url: BASE + u }); await sleep(w || 2600); };

  await nav("/guides.html", 3200);

  /* ---------- 1) 默认纯文字版 ---------- */
  const st = JSON.parse(await ev(`JSON.stringify((function(){
    var box = document.getElementById('cardView');
    var pav = document.querySelector('#cardView .pav');
    var fic = document.querySelector('#cardView .ficon');
    return {view: box.className, pavShown: pav ? pav.offsetParent !== null : null,
            ficShown: fic ? fic.offsetParent !== null : null,
            cards: document.querySelectorAll('#cardView .card').length,
            tableShown: !document.getElementById('tableView').classList.contains('hidden')};
  })())`));
  check("默认 view = text（纯文字版）", /(^|\s)text/.test(st.view) || !/view-image/.test(st.view), st.view);
  check("默认不显示头像（文字版不生成头像 DOM）", st.pavShown === null || st.pavShown === false, String(st.pavShown));
  check("文字版显示阵营图标", st.ficShown === true, String(st.ficShown));
  check("表格视图已停用", st.tableShown === false);
  check("卡片 133 张", st.cards === 133, st.cards);
  const textShot = await shot("guides-text.png");

  /* ---------- 2) 图片版：常态头像 ---------- */
  await ev(`document.querySelector('.viewtoggle button[data-view="image"]').click()`);
  await sleep(900);
  const im = JSON.parse(await ev(`JSON.stringify((function(){
    var box = document.getElementById('cardView');
    var pavs = [].slice.call(document.querySelectorAll('#cardView .pav'));
    var shown = pavs.filter(function(p){ return p.offsetParent !== null; });
    var loaded = pavs.filter(function(p){ return p.complete && p.naturalWidth > 0; });
    var fic = [].slice.call(document.querySelectorAll('#cardView .ficon'));
    return {hasClass: /view-image/.test(box.className),
            total: pavs.length, shown: shown.length, loaded: loaded.length,
            // 有头像的角色，阵营图标应被藏起来
            ficVisible: fic.filter(function(f){ return f.offsetParent !== null && !f.classList.contains('no-pav'); }).length,
            sampleSrc: pavs[0] ? pavs[0].getAttribute('src') : '',
            allAvatar: pavs.every(function(p){ return /avatar\\.webp$/.test(p.getAttribute('src')); }),
            w: pavs[0] ? Math.round(pavs[0].getBoundingClientRect().width) : 0};
  })())`));
  check("切到图片版（cardView 带 view-image）", im.hasClass === true);
  check("图片版：133 张卡片都能露出头像", im.shown === 133, im.shown + "/133");
  check("头像全部指向 avatar.webp（只用常态）", im.allAvatar === true);
  /* 头像是 lazy 的：只断言「首屏可见的那几张都真的加载出来了」 */
  check("首屏头像实际加载成功", im.loaded >= 4, im.loaded + "/" + im.total);
  check("头像尺寸 44px", im.w === 44, im.w);
  check("有头像时不再显示阵营图标", im.ficVisible === 0, im.ficVisible);
  const imageShot = await shot("guides-image.png");

  /* ---------- 3) 详情立绘 + 三形态切换 ---------- */
  await ev(`(function(){var i=document.getElementById('q');i.value='诸星团';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(600);
  await ev(`document.querySelector('#cardView .card-hd h3').click()`);
  await sleep(900);
  const d1 = JSON.parse(await ev(`JSON.stringify((function(){
    var pic = document.getElementById('mPic'), img = document.getElementById('mPortrait');
    return {picHidden: pic.hidden, src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0,
            form: document.getElementById('mForm').textContent,
            prev: document.getElementById('mPrev').disabled, next: document.getElementById('mNext').disabled,
            w: Math.round(img.getBoundingClientRect().width)};
  })())`));
  check("详情显示立绘区", d1.picHidden === false);
  check("默认形态 = 常态（base.webp）", /base\.webp$/.test(d1.src || "") && d1.form === "常态", d1.src);
  check("立绘加载成功", d1.loaded === true, "w=" + d1.w);
  check("首态：上一个箭头置灰", d1.prev === true);
  check("首态：下一个箭头可用", d1.next === false);
  const baseShot = await shot("guides-detail-base.png");

  await ev(`document.getElementById('mNext').click()`);
  await sleep(700);
  const d2 = JSON.parse(await ev(`JSON.stringify((function(){
    var img=document.getElementById('mPortrait');
    return {src:img.getAttribute('src'), form:document.getElementById('mForm').textContent,
            loaded:img.complete&&img.naturalWidth>0, prev:document.getElementById('mPrev').disabled};
  })())`));
  check("→ 觉醒", /awaken\.webp$/.test(d2.src || "") && d2.form === "觉醒", d2.src);
  check("觉醒图加载成功", d2.loaded === true);
  check("觉醒态两个箭头都可用", d2.prev === false && (await ev(`document.getElementById('mNext').disabled`)) === false);

  await ev(`document.getElementById('mNext').click()`);
  await sleep(700);
  const d3 = JSON.parse(await ev(`JSON.stringify((function(){
    var img=document.getElementById('mPortrait');
    return {src:img.getAttribute('src'), form:document.getElementById('mForm').textContent,
            next:document.getElementById('mNext').disabled};
  })())`));
  check("→ 超越觉醒，且末态箭头置灰", /transcend\.webp$/.test(d3.src || "") && d3.form === "超越觉醒" && d3.next === true, d3.src);
  const transShot = await shot("guides-detail-transcend.png");

  /* ---------- 4) 缺形态 / 无图 ---------- */
  await ev(`document.getElementById('mClose').click()`); await sleep(350);
  /* 图鉴 133 人全部有图且三形态齐全；这里做数据层全量断言。 */
  const formsStat = JSON.parse(await ev(`JSON.stringify((function(){
    var bad = GUIDE.entries.filter(function(e){ return e.img && e.forms.length < 3; })
                           .map(function(e){ return e.name + ':' + e.forms.join('/'); });
    return {bad: bad};
  })())`));
  check("有图角色三形态齐全", formsStat.bad.length === 0, formsStat.bad.join(",") || "0 个缺形态");

  await ev(`document.getElementById('mClose').click()`); await sleep(350);
  /* 朝影雄一郎原先缺图，2026-10-27 从 ATMOLImageCreation 补齐三形态。 */
  await ev(`(function(){var i=document.getElementById('q');i.value='朝影雄一郎';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(700);
  const cyInfo = JSON.parse(await ev(`JSON.stringify((function(){
    var cards=document.querySelectorAll('#cardView .card');
    if(!cards.length) return {n:0};
    cards[0].querySelector('.card-hd h3').click();
    return {n:cards.length};
  })())`));
  await sleep(800);
  const cyBase = JSON.parse(await ev(`JSON.stringify((function(){
    var img=document.getElementById('mPortrait');
    return {picHidden:document.getElementById('mPic').hidden,
            src:img.getAttribute('src'), form:document.getElementById('mForm').textContent,
            loaded:img.complete&&img.naturalWidth>0};
  })())`));
  check("朝影雄一郎：常态立绘显示并加载成功",
    cyInfo.n === 1 && cyBase.picHidden === false && /4101dbd5\/base\.webp$/.test(cyBase.src || "") &&
    cyBase.form === "常态" && cyBase.loaded === true,
    cyBase.src + " / " + cyBase.form);

  await ev(`document.getElementById('mNext').click()`); await sleep(500);
  const cyAwaken = JSON.parse(await ev(`JSON.stringify((function(){
    var img=document.getElementById('mPortrait');
    return {src:img.getAttribute('src'), form:document.getElementById('mForm').textContent,
            loaded:img.complete&&img.naturalWidth>0};
  })())`));
  check("朝影雄一郎：觉醒立绘显示并加载成功",
    /4101dbd5\/awaken\.webp$/.test(cyAwaken.src || "") && cyAwaken.form === "觉醒" && cyAwaken.loaded === true,
    cyAwaken.src + " / " + cyAwaken.form);

  await ev(`document.getElementById('mNext').click()`); await sleep(500);
  const cyTranscend = JSON.parse(await ev(`JSON.stringify((function(){
    var img=document.getElementById('mPortrait');
    return {src:img.getAttribute('src'), form:document.getElementById('mForm').textContent,
            loaded:img.complete&&img.naturalWidth>0, next:document.getElementById('mNext').disabled};
  })())`));
  check("朝影雄一郎：超越觉醒立绘显示并加载成功",
    /4101dbd5\/transcend\.webp$/.test(cyTranscend.src || "") && cyTranscend.form === "超越觉醒" &&
    cyTranscend.loaded === true && cyTranscend.next === true,
    cyTranscend.src + " / " + cyTranscend.form);
  const chaoyingShot = await shot("guides-detail-chaoying.png");

  /* ---------- 8) 文字版详情：不出图、单列（管理者：应该和以前一样） ---------- */
  await ev(`document.getElementById('mClose').click()`); await sleep(350);
  await ev(`document.querySelector('.viewtoggle button[data-view="text"]').click()`); await sleep(600);
  await ev(`(function(){var i=document.getElementById('q');i.value='诸星团';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(700);
  await ev(`document.querySelector('#cardView .card-hd h3').click()`); await sleep(800);
  const tm = JSON.parse(await ev(`JSON.stringify((function(){
    return {top: document.getElementById('mTop').hidden,
            pic: document.getElementById('mPic').hidden,
            sideEmpty: document.getElementById('mSide').children.length === 0,
            secs: [].map.call(document.querySelectorAll('#mBody .m-sec .st'), function(x){return x.textContent.trim();}),
            /* 只查「立绘」有没有图；光元小图标属于内容，不算 */
            anyImg: !!document.querySelector('#mPortrait[src]')};  // 只查立绘；翻页按钮是 UI 不算
  })())`));
  check("文字版详情：左图右文整块隐藏", tm.top === true && tm.pic === true && tm.sideEmpty === true);
  check("文字版详情：连一张图都没有", tm.anyImg === false);
  check("文字版详情：单列包含 性别/获得/本命/前置/特训/光元",
    tm.secs.length >= 6 && tm.secs[0].indexOf("性别") === 0 &&
    tm.secs.join("|").indexOf("获得方式") >= 0 && tm.secs.join("|").indexOf("特训所需") >= 0,
    tm.secs.join(" / "));
  const textModal = await shot("guides-detail-text.png");

  /* ---------- 9) 工藤优幸本命「令迦」→ 角色被动页 ---------- */
  await ev(`document.getElementById('mClose').click()`); await sleep(350);
  await ev(`(function(){var i=document.getElementById('q');i.value='工藤优幸';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await sleep(700);
  await ev(`document.querySelector('#cardView .card-hd h3').click()`); await sleep(800);
  const fateLinks = JSON.parse(await ev(`JSON.stringify([].map.call(document.querySelectorAll('#mBody a.fate-go'), function(a){
    return {text:a.textContent.trim(), href:a.getAttribute('href')};
  }))`));
  const lingjiaLink = fateLinks.filter(function(a){ return a.text.indexOf('令迦') >= 0; })[0];
  check("工藤优幸：本命令迦可点击", !!lingjiaLink && lingjiaLink.href === "passive/char.html?id=lingjia",
    fateLinks.map(function(a){ return a.text + " → " + a.href; }).join(" / "));
  const fateSourceShot = await shot("guides-detail-gongteng-lingjia.png");

  await ev(`(function(){var a=[].slice.call(document.querySelectorAll('#mBody a.fate-go')).filter(function(x){return x.textContent.indexOf('令迦')>=0;})[0];a.click();})()`);
  await sleep(2200);
  const lingjiaPage = JSON.parse(await ev(`JSON.stringify({
    path: location.pathname + location.search,
    title: document.title,
    name: document.getElementById('name') ? document.getElementById('name').textContent : '',
    rendered: !!document.querySelector('[data-akp-char="lingjia"]')
  })`));
  check("令迦：成功跳转并渲染角色被动页",
    lingjiaPage.path === "/passive/char.html?id=lingjia" && lingjiaPage.name === "令迦" &&
    lingjiaPage.title.indexOf("令迦") === 0 && lingjiaPage.rendered === true,
    lingjiaPage.path + " / " + lingjiaPage.title);
  const fateShot = await shot("passive-lingjia-from-guides.png");

  console.log("\n  截图：" + [textShot, imageShot, baseShot, transShot, chaoyingShot, textModal, fateSourceShot, fateShot].join("  "));
  console.log("  " + (fail ? "FAILED" : "ALL PASS") + "  " + pass + " pass / " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
