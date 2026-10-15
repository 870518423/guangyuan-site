/* Service Worker 离线行为验证（2026-10-15）
   ------------------------------------------------------------------
   用 vm 把 service-worker.js 跑起来，桩掉 self / caches / fetch，
   断言「离线 + 未缓存」不再回退成首页，而是专用离线页。
   用法：node tools/sw_offline_test.js
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'service-worker.js');
const ORIGIN = 'https://m78calc.cn';

/* ---- 桩：caches ---- */
const store = new Map();               // name -> Map(url -> Response)
function cacheObj(name) {
  if (!store.has(name)) store.set(name, new Map());
  const m = store.get(name);
  return {
    put: async (req, res) => { m.set(typeof req === 'string' ? req : req.url, res); },
    match: async (req) => m.get(typeof req === 'string' ? req : req.url),
    add: async () => {},
    keys: async () => [...m.keys()].map((u) => ({ url: u })),
    delete: async (k) => m.delete(typeof k === 'string' ? k : k.url),
  };
}
const caches = {
  open: async (n) => cacheObj(n),
  match: async (req) => {
    const key = typeof req === 'string' ? req : req.url;
    for (const m of store.values()) { const r = m.get(key); if (r) return r; }
    return undefined;
  },
  keys: async () => [...store.keys()],
  delete: async (n) => store.delete(n),
};

/* ---- 桩：self ---- */
const handlers = {};
const self = {
  location: { origin: ORIGIN },
  addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
  skipWaiting: () => Promise.resolve(),
  clients: { claim: () => Promise.resolve() },
};

/* ---- 桩：fetch（模拟离线，一律失败）---- */
const fetchStub = () => Promise.reject(new TypeError('Failed to fetch'));

const ctx = vm.createContext({
  self, caches, fetch: fetchStub, console,
  Response, Request, URL, Headers, setTimeout, Promise, Math, Date,
});
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'service-worker.js' });

/* ---- 预置：版本缓存里有首页；运行时缓存里有「看过的角色页」---- */
const CACHE = /CACHE_NAME = '([^']+)'/.exec(fs.readFileSync(SRC, 'utf8'))[1];
const RUNTIME = /const RUNTIME = '([^']+)'/.exec(fs.readFileSync(SRC, 'utf8'))[1];
const homeHtml = '<!DOCTYPE html><html><head><title>奥系光元工具站</title>' +
  '<link rel="stylesheet" href="assets/ak/ak-theme.css"></head>' +
  '<body><h1>光元收益预测器</h1><span data-akp-count>17 位角色</span></body></html>';
const charHtml = '<!DOCTYPE html><html><body><h1>令迦</h1><div class="akp">被动+9</div></body></html>';

(async () => {
  await caches.open(CACHE).then((c) => c.put(ORIGIN + '/index.html',
    new Response(homeHtml, { headers: { 'Content-Type': 'text/html' } })));
  await caches.open(RUNTIME).then((c) => c.put(ORIGIN + '/passive/char.html?id=lingjia',
    new Response(charHtml, { headers: { 'Content-Type': 'text/html' } })));

  function askDoc(url) {
    const req = new Request(url, { headers: { accept: 'text/html,application/xhtml+xml' } });
    const evt = { request: req, respondWith: (p) => { evt.p = Promise.resolve(p); }, waitUntil: () => {} };
    handlers.fetch.forEach((fn) => fn(evt));
    return evt.p;
  }
  const text = (r) => r.text();
  let pass = 0, fail = 0;
  const check = (name, ok, extra) => {
    console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : ''));
    ok ? pass++ : fail++;
  };

  // 1) 看过的角色页：离线应返回角色页本身
  let r1 = await askDoc(ORIGIN + '/passive/char.html?id=lingjia');
  let t1 = await text(r1);
  check('看过的角色页离线 → 返回缓存的角色页', t1.includes('令迦') && !t1.includes('当前处于离线状态'));

  // 2) 没看过的页面：离线应返回专用离线页，而不是首页
  let r2 = await askDoc(ORIGIN + '/guides.html');
  let t2 = await text(r2);
  check('未看过的页面离线 → 返回专用离线页', t2.includes('当前处于离线状态'));
  check('未看过的页面离线 → 不再伪装成首页', !t2.includes('光元收益预测器') && !t2.includes('data-akp-count'));
  check('离线页自带返回首页入口（绝对路径）', t2.includes('href="/index.html"'));

  // 3) 首页本身：离线应正常显示首页（预缓存命中）
  let r3 = await askDoc(ORIGIN + '/index.html');
  let t3 = await text(r3);
  check('首页离线 → 正常显示首页', t3.includes('光元收益预测器'));

  // 4) 已缓存的静态资源：离线命中缓存
  await caches.open(RUNTIME).then((c) => c.put(ORIGIN + '/assets/ak/ak-theme.css',
    new Response('/* css */', { headers: { 'Content-Type': 'text/css' } })));
  const evt4 = { request: new Request(ORIGIN + '/assets/ak/ak-theme.css'),
    respondWith: (p) => { evt4.p = Promise.resolve(p); }, waitUntil: () => {} };
  handlers.fetch.forEach((fn) => fn(evt4));
  const t4 = await (await evt4.p).text();
  check('看过的静态资源离线 → 命中缓存', t4.includes('css'));

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
