/* App 真实链路模拟（工装，2026-10-23）：需 serve 在 localhost:8099 + 无头 Chrome 9222
   ⚠️ 会真实访问线上 m78calc.cn，且必须用 localhost 域名访问（hostname=localhost → SW 判为 App 环境）
   清桶 → status → download → 浏览若干页（触发 SW 内容分支后台换新）→ status → 开新攻略页 */
const http = require('http');
const WebSocket = require('ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9222, path: p }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res(JSON.parse(b))); }).on('error', rej);
  });
}
(async () => {
  const tabs = await get('/json');
  const page = tabs.find((t) => t.type === 'page') || tabs[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  const logs = [];
  const send = (m, p) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.on('message', (m) => {
    const d = JSON.parse(m);
    if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; return; }
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('CONSOLE-ERR: ' + (d.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 160));
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (d.params.exceptionDetails.text || '').slice(0, 120));
  });
  await new Promise((r) => ws.on('open', r));
  await send('Runtime.enable', {}); await send('Page.enable', {}); await send('Network.enable', {});
  await send('Emulation.setDeviceMetricsOverride', { width: 440, height: 950, deviceScaleFactor: 2, mobile: true });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return '__ERR__ ' + (r.result.exceptionDetails.text || '') + ' ' + ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 300);
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const go = async (u, wait) => { await send('Page.navigate', { url: u }); await sleep(wait || 3000); };

  await go('http://localhost:8099/app.html?app=1', 5000);
  console.log('origin', await ev('location.origin'), '| controller', await ev('!!navigator.serviceWorker.controller'));

  console.log('\n[0] 清桶+清台账（模拟首装）');
  console.log(await ev(`(async()=>{ await caches.delete('guangyuan-content'); localStorage.removeItem('ak-content-index'); const c=await caches.open('guangyuan-content'); const ks=await c.keys(); return 'content桶=' + ks.length; })()`));

  console.log('\n[1] status');
  console.log(await ev(`window.AkContent.status().then(s=>JSON.stringify({remote:s.remoteCount,local:s.localCount,diff:s.diff.length}))`));

  console.log('\n[2] download');
  console.log(await ev(`window.AkContent.download(function(){}).then(d=>JSON.stringify({done:d.downloaded,total:d.total,failed:d.failed.length}))`));

  console.log('\n[3] 立刻 status（下载后未浏览）');
  console.log(await ev(`window.AkContent.status().then(s=>JSON.stringify({diff:s.diff.length,paths:s.diff.map(d=>d.path).slice(0,8)}))`));

  console.log('\n[4] 浏览 3 个页面（触发 SW 内容分支 + 后台换新覆盖桶）');
  for (const u of ['/index.html?app=1', '/passive/index.html?app=1', '/guides.html?app=1']) {
    await go('http://localhost:8099' + u, 4500);
    console.log('   visited', u, '| title', (await ev('document.title') || '').slice(0, 30));
  }

  console.log('\n[5] 浏览后 status（关键：SW 覆盖裸响应后是否仍收敛）');
  console.log(await ev(`window.AkContent.status().then(async s=>{
    const out={diff:s.diff.length, detail:[]};
    for (const f of s.diff.slice(0,6)) {
      const c = await caches.open('guangyuan-content');
      const lk = new URL('/'+f.path, location.origin).href;
      const rk = new URL(f.path, 'https://m78calc.cn/').href;
      const hl = await c.match(lk), hr = await c.match(rk);
      const hh = (r)=>{try{return r&&r.headers?r.headers.get('x-ak-hash'):null}catch(e){return 'ERR'}};
      out.detail.push({path:f.path, localHit:!!hl, localHash:hh(hl), remoteHit:!!hr, remoteHash:hh(hr), manifest:f.hash.slice(0,8)});
    }
    return JSON.stringify(out);
  })`));
  console.log('   台账条数:', await ev(`(()=>{try{const o=JSON.parse(localStorage.getItem('ak-content-index')||'{}');return Object.keys(o.files||{}).length}catch(e){return 'ERR'}})()`));
  console.log('   桶键数:', await ev(`caches.open('guangyuan-content').then(c=>c.keys()).then(k=>k.length)`));

  console.log('\n[6] 打开新增攻略篇（v91）');
  await go('http://localhost:8099/strategy-huluji.html?app=1', 5000);
  console.log('   title:', await ev('document.title'), '| bodyLen:', await ev('document.body?document.body.innerText.length:0'));
  console.log('   含“老虎机”:', await ev(`document.body?document.body.innerText.indexOf('老虎机')>=0:false`));

  console.log('\n[7] 首页是否为 v91 内容（新 UI 标记 + 更新记录日期）');
  await go('http://localhost:8099/index.html?app=1', 5000);
  console.log('   aoxi-refresh:', await ev(`document.body.className`));
  console.log('   更新记录首条:', await ev(`(document.querySelector('.changelog time')||{}).textContent`));

  if (logs.length) { console.log('\n错误日志:'); logs.slice(0, 12).forEach((l) => console.log('  ' + l)); }
  process.exit(0);
})().catch((e) => { console.log('异常：', e && e.stack || e); process.exit(1); });
