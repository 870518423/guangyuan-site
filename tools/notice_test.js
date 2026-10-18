/* 新域名公告弹窗验收（tools/notice_test.js）
   回归工装：改 assets/ak/notice.js 或各页挂载后请重跑。
   前置：① node ../tools/serve.js . 8099  ② 无头 Chrome 开 9222
   用法：NO_PROXY='*' NODE_PATH=<workspace>/node_modules node tools/notice_test.js [baseUrl]
   检查：按时弹出 / 文案与 a11y / 不勾只关一次 / 勾选持久化 / 同会话不重复 /
        滚动锁与位置不变 / 亮暗两套配色 / **只在主页弹（二级页一律不弹）** /
        已选「不再提示」时零注入
   截图：.workbuddy/shots/notice-{dark,light,home}.png */
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const OUT = process.env.SHOT_DIR || "C:\\Users\\Admin\\WorkBuddy\\workbuddy\\.workbuddy\\shots";
const BASE = (process.argv[2] || "http://127.0.0.1:8099").replace(/\/$/, "");

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: 9222, path: p }, (r) => {
      let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res(JSON.parse(b)));
    }).on("error", rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await send("Runtime.enable", {});
  await send("Page.enable", {});
  await send("Emulation.setDeviceMetricsOverride", { width: 440, height: 900, deviceScaleFactor: 2, mobile: true });

  const ev = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return "__ERR__ " + JSON.stringify(r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const nav = async (url, wait) => {
    await send("Page.navigate", { url });
    await sleep(wait || 600);
  };
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const p = path.join(OUT, name);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(p, Buffer.from(r.result.data, "base64"));
    return p;
  };

  /* ---------- 0) 清场地：注销 SW + 清缓存 + 清两个存储 ---------- */
  await nav(BASE + "/index.html", 1200);
  await ev(`(async function(){
    try{ var rs = await navigator.serviceWorker.getRegistrations(); for (var i=0;i<rs.length;i++) await rs[i].unregister(); }catch(e){}
    try{ var ks = await caches.keys(); for (var j=0;j<ks.length;j++) await caches.delete(ks[j]); }catch(e){}
    try{ localStorage.clear(); sessionStorage.clear(); }catch(e){}
    return 1;
  })()`);
  await nav(BASE + "/index.html", 2600);   // 等 idle + delay(700)

  /* ---------- 1) 按时弹出 ---------- */
  const shown = await ev(`!!document.querySelector('.akn-mask.is-in')`);
  check("进站后自动弹出", shown === true);

  /* ---------- 2) 结构与 a11y ---------- */
  const info = JSON.parse(await ev(`JSON.stringify((function(){
    var m=document.querySelector('.akn-mask'), p=document.querySelector('.akn-panel');
    if(!m||!p) return {none:true};
    var r=p.getBoundingClientRect(), d=document.querySelector('.akn-domain');
    var cs=getComputedStyle(p);
    return {
      role:p.getAttribute('role'), modal:p.getAttribute('aria-modal'),
      labelled:p.getAttribute('aria-labelledby') && !!document.getElementById(p.getAttribute('aria-labelledby')),
      described:p.getAttribute('aria-describedby') && !!document.getElementById(p.getAttribute('aria-describedby')),
      title:(document.getElementById('akn-title')||{}).textContent||'',
      domainText:(d||{}).textContent||'', href:(d||{}).href||'',
      w:Math.round(r.width), left:Math.round(r.left), right:Math.round(window.innerWidth-r.right),
      z:getComputedStyle(m).zIndex,
      chk:!!document.querySelector('#akn-nomore'), chkChecked:(document.querySelector('#akn-nomore')||{}).checked,
      overflow:document.documentElement.style.overflow,
      btnH:Math.round((document.querySelector('.akn-ok')||{getBoundingClientRect:function(){return {height:0};}}).getBoundingClientRect().height),
      chkH:Math.round((document.querySelector('.akn-chk')||{getBoundingClientRect:function(){return {height:0};}}).getBoundingClientRect().height),
      bg:cs.backgroundColor
    };})())`));
  check("对话框语义 role/aria-modal", info.role === "dialog" && info.modal === "true");
  check("aria-labelledby / describedby 指向真实节点", info.labelled && info.described);
  check("标题为「本站已启用新域名」", /本站已启用新域名/.test(info.title || ""), info.title);
  check("域名文本正确", (info.domainText || "").indexOf("m78calc.cn") === 0, info.domainText);
  check("域名可点击跳新地址", info.href === "https://m78calc.cn/", info.href);
  check("面板≤400 且水平居中", info.w <= 400 && Math.abs(info.left - info.right) <= 2, "w=" + info.w + " l/r=" + info.left + "/" + info.right);
  check("层级高于既有保存面板(10001)", parseInt(info.z, 10) >= 10004, info.z);
  check("主按钮触摸目标 ≥44px", info.btnH >= 44, info.btnH + "px");
  check("复选行触摸目标 ≥44px", info.chkH >= 44, info.chkH + "px");
  check("默认不勾选", info.chk === true && info.chkChecked === false);
  check("弹窗期间锁滚动", info.overflow === "hidden", info.overflow);
  const shotDark = await shot("notice-dark.png");

  /* ---------- 3) 未勾选时只关这一次 ---------- */
  const scrolled = await ev(`(function(){window.scrollTo(0,300);return Math.round(window.scrollY);})()`);
  await ev(`document.querySelector('.akn-ok').click()`);
  await sleep(450);
  const afterClose = JSON.parse(await ev(`JSON.stringify({
    mask:!!document.querySelector('.akn-mask'),
    ls:localStorage.getItem('ak-domain-notice-2026-10-17'),
    ss:sessionStorage.getItem('ak-domain-notice-s'),
    overflow:document.documentElement.style.overflow,
    pad:document.documentElement.style.paddingRight,
    y:Math.round(window.scrollY)
  })`));
  check("点「我知道了」关闭弹窗", afterClose.mask === false);
  check("未勾选不写持久化", afterClose.ls === null, String(afterClose.ls));
  check("关闭后解锁滚动", afterClose.overflow === "" && afterClose.pad === "", "overflow=" + afterClose.overflow + " pad=" + afterClose.pad);
  check("关闭后页面位置不变", afterClose.y === scrolled, afterClose.y + " vs " + scrolled);
  check("同一次会话已留标记", afterClose.ss === "1");

  /* ---------- 4) 同会话翻页不再弹 ---------- */
  await nav(BASE + "/calculator.html", 2200);
  check("同会话换页不再重复弹", (await ev(`!!document.querySelector('.akn-mask')`)) === false);

  /* ---------- 5) 勾选后持久化，之后再也不弹 ---------- */
  await ev(`sessionStorage.clear();localStorage.removeItem('ak-domain-notice-2026-10-17');`);
  await nav(BASE + "/index.html", 2500);
  check("新会话重新弹出", (await ev(`!!document.querySelector('.akn-mask.is-in')`)) === true);
  await ev(`(function(){var c=document.querySelector('#akn-nomore');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.akn-ok').click();})()`);
  await sleep(450);
  check("勾选后写入 localStorage", (await ev(`localStorage.getItem('ak-domain-notice-2026-10-17')`)) === "off");
  await nav(BASE + "/index.html", 2400);
  check("再次访问不再弹出", (await ev(`!!document.querySelector('.akn-mask')`)) === false);
  check("早退时不注入样式（零成本）", (await ev(`!!document.getElementById('akn-style')`)) === false);

  /* ---------- 6) 亮色主题 ---------- */
  await ev(`localStorage.removeItem('ak-domain-notice-2026-10-17');localStorage.setItem('ak-theme','light');sessionStorage.clear();`);
  await nav(BASE + "/index.html", 2600);
  const light = JSON.parse(await ev(`JSON.stringify((function(){
    var p=document.querySelector('.akn-panel');
    if(!p) return {none:true};
    var c=getComputedStyle(p), b=getComputedStyle(document.querySelector('.akn-ok'));
    return {theme:document.documentElement.getAttribute('data-theme'), bg:c.backgroundColor, fg:c.color,
            btnBg:b.backgroundColor, btnFg:b.color};})())`));
  const lum = (rgb) => { const m = (rgb || "").match(/\d+/g); if (!m) return -1; return (m[0] * 0.299 + m[1] * 0.587 + m[2] * 0.114); };
  check("亮色主题：面板为浅底", light.theme === "light" && lum(light.bg) > 200, light.bg);
  check("亮色主题：正文为深字（对比度足够）", lum(light.fg) < 80, light.fg);
  const shotLight = await shot("notice-light.png");

  /* ---------- 7) 只在主页弹（管理者 2026-10-17：进入主页时弹就可以了） ---------- */
  await ev(`localStorage.setItem('ak-theme','dark');localStorage.removeItem('ak-domain-notice-2026-10-17');sessionStorage.clear();`);
  await nav(BASE + "/index.html", 2600);
  check("主页仍然弹出", (await ev(`!!document.querySelector('.akn-mask.is-in')`)) === true);
  const shotP = await shot("notice-home.png");

  /* 每页都清一次存储再进，确保不是 sessionStorage 帮的忙 */
  const OTHERS = ["calculator.html", "guides.html", "strategies.html",
    "strategy-dati.html", "passive/index.html", "passive/category.html",
    "passive/char.html?id=leiguluosi"];
  for (const pg of OTHERS) {
    await ev(`sessionStorage.clear();localStorage.removeItem('ak-domain-notice-2026-10-17');`);
    await nav(BASE + "/" + pg, 2400);
    check("非主页不弹：" + pg, (await ev(`!!document.querySelector('.akn-mask')`)) === false);
  }

  /* 文件级：确认只有首页挂了脚本（防止以后又被批量加到二级页） */
  const root = path.join(__dirname, "..");
  const htmls = fs.readdirSync(root).filter((f) => /\.html$/.test(f))
    .map((f) => path.join(root, f))
    .concat(fs.readdirSync(path.join(root, "passive")).filter((f) => /\.html$/.test(f)).map((f) => path.join(root, "passive", f)));
  const mounted = htmls.filter((p) => /notice\.js/.test(fs.readFileSync(p, "utf8")))
    .map((p) => path.basename(p)).sort();
  check("全站只有 index.html 挂载 notice.js", mounted.length === 1 && mounted[0] === "index.html", mounted.join(","));

  /* ---------- 8) 收尾：恢复默认存储，避免污染其他验收 ---------- */
  await ev(`try{localStorage.clear();sessionStorage.clear();}catch(e){}`);

  console.log("\n  截图：" + [shotDark, shotLight, shotP].join("  "));
  console.log("  " + (fail ? "FAILED" : "ALL PASS") + "  " + pass + " pass / " + fail + " fail");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
