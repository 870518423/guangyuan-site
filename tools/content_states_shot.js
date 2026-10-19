/* 内容更新卡「三态」演示截图（第 18 轮 · 2026-10-19）
   ------------------------------------------------------------------
   目的：给管理者预览「内容更新」卡的三种 UI 状态。
   说明：真机三态由内容桶 + 线上 content.json 真实驱动，本地 serve 环境
   拉不到线上 m78calc.cn/content.json（未上传），故这里是**UI 状态演示**
   —— 直接改写 DOM 文案与按钮态呈现三种形态，供验收预览三态长什么样。
   真实数据驱动的三态在真机（第 7 条）验证。

   产出（.workbuddy/shots/）：
     content-has-new.png      发现新内容（按钮可点、显示文件数与体积）
     content-downloading.png  下载中（进度条 + 当前文件 + 百分比）
     content-updated.png      已最新（按钮灰、显示本机文件数）
     content-web.png          Web 端设置页无内容卡
   用法：同 app_mode_check 前置（serve 8099 + 无头 Chrome 9222）
     NODE_PATH=<ws>/node_modules node tools/content_states_shot.js
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const BASE = "http://127.0.0.1:8099";
const OUT = process.env.SHOT_DIR || "C:\\Users\\Admin\\WorkBuddy\\workbuddy\\.workbuddy\\shots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: 9222, path: p }, (r) => {
      let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res(JSON.parse(b)));
    }).on("error", rej);
  });
}

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
  const clean = () => ev(`(function(){[].forEach.call(document.querySelectorAll('.notice, [id*=notice], .akn, .update-toast, .toast'), function(n){n.remove()});return true})()`);
  const shot = async (name) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const p = path.join(OUT, name); fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(p, Buffer.from(r.result.data, "base64")); console.log("截图:", name);
  };

  /* ---- ① 发现新内容 ---- */
  await send("Page.navigate", { url: BASE + "/app.html?app=1&nocontent=1" });
  await sleep(2800); await clean();
  await ev(`(function(){
    var r=document.getElementById('cResult'), t=document.getElementById('cTag'),
        u=document.getElementById('cUpdBtn'), cl=document.getElementById('cClearBtn'),
        s=document.getElementById('cStat'), b=document.getElementById('cBar');
    if(r)r.innerHTML='发现新内容 <b>5 个文件</b> · 约 1.24 MB（本机已 73 个）';
    if(t)t.textContent='v84';
    if(u){u.disabled=false;}
    if(cl){cl.disabled=false;}
    if(s)s.textContent='就绪';
    if(b)b.style.width='0%';
    return true;
  })()`);
  await shot("content-has-new.png");

  /* ---- ② 下载中 ---- */
  await ev(`(function(){
    var r=document.getElementById('cResult'), u=document.getElementById('cUpdBtn'),
        cl=document.getElementById('cClearBtn'), s=document.getElementById('cStat'),
        b=document.getElementById('cBar');
    if(u){u.disabled=true;u.textContent='更新内容';}
    if(cl){cl.disabled=true;}
    if(r)r.innerHTML='发现新内容 <b>5 个文件</b> · 约 1.24 MB（本机已 73 个）';
    if(b)b.style.width='60%';
    if(s)s.innerHTML='正在下载：calculator.html（60%）';
    return true;
  })()`);
  await shot("content-downloading.png");

  /* ---- ③ 已最新 ---- */
  await ev(`(function(){
    var r=document.getElementById('cResult'), u=document.getElementById('cUpdBtn'),
        cl=document.getElementById('cClearBtn'), s=document.getElementById('cStat'),
        b=document.getElementById('cBar');
    if(r)r.textContent='已是最新内容（v84 · 本机 78 个文件）';
    if(u){u.disabled=true;}
    if(b)b.style.width='0%';
    if(s)s.textContent='就绪';
    return true;
  })()`);
  await shot("content-updated.png");

  /* ---- ④ Web 端设置页：无内容卡 ---- */
  await send("Page.navigate", { url: BASE + "/app.html" });
  await sleep(2400); await clean();
  await shot("content-web.png");

  console.log("三态 + Web 截图完成：.workbuddy/shots/content-{has-new,downloading,updated,web}.png");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
