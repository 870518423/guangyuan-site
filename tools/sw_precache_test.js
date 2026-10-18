/* Service Worker 预缓存「增量更新」验证（2026-10-16 v66）
   ------------------------------------------------------------------
   背景：v66 之前 CACHE_NAME 里带版本号（guangyuan-v65），发一次版换一个空桶，
   install 时把预缓存清单无条件全量 add 一遍 → 不管内容变没变都要重下。
   v66 改成「固定桶名 + 条件请求（If-None-Match / If-Modified-Since）」。

   本脚本用 vm 跑**真实的** service-worker.js，桩掉 self / caches / fetch，
   断言发新版时只有内容真的变了的条目才重新下载，其余 304 零传输。
   v70 起另测两件事：① 空桶时每条请求必须带 cache:no-cache（否则会把浏览器
   HTTP 缓存里的旧副本当新内容写进桶）；② 有旧副本时走 If-None-Match 条件请求。
   用法：node tools/sw_precache_test.js
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'service-worker.js');
const SRC_TEXT = fs.readFileSync(SRC, 'utf8');
const ORIGIN = 'https://m78calc.cn';

const CACHE = /const CACHE_NAME = '([^']+)'/.exec(SRC_TEXT)[1];
const RUNTIME = /const RUNTIME = '([^']+)'/.exec(SRC_TEXT)[1];
const BUILD = /const BUILD = '([^']+)'/.exec(SRC_TEXT)[1];
const ASSETS = (() => {
  const block = /const ASSETS = \[([\s\S]*?)\n\];/.exec(SRC_TEXT)[1];
  return (block.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
})();

/* ---- 桩：服务器（url -> { etag, lm, body }）---- */
const server = new Map();
let fetchLog = [];      // 本次 install 发出的请求
let cacheLog = [];      // 本次 install 每条请求的 cache 模式与 If-None-Match（v70 起）
let dlBytes = 0;        // 本次 install 实际传输的字节数（模拟流量）
function seedServer(withValidators) {
  server.clear();
  // ⚠️ etag 只能用 ASCII：Node 的 Headers 会拒绝非 ASCII 的 header 值
  ASSETS.forEach((u, i) => {
    const url = new URL(u, ORIGIN).href;
    server.set(url, {
      etag: withValidators ? '"sw-test-' + i + '"' : null,
      lm: withValidators ? 'Wed, 15 Oct 2026 00:00:00 GMT' : null,
      body: 'payload-of-' + i,
    });
  });
}

/* ---- 桩：Request（相对路径按 ORIGIN 解析，Node 原生 Request 不接受相对 URL）---- */
class RequestStub {
  constructor(url, opts) {
    opts = opts || {};
    this.url = new URL(url, ORIGIN).href;
    this.method = opts.method || 'GET';
    this.mode = opts.mode || 'no-cors';
    this.cache = opts.cache || 'default';
    this.headers = new Headers(opts.headers || {});
  }
}

/* ---- 桩：fetch（支持条件请求；404 也会如实返回）---- */
function fetchStub(req) {
  const url = req.url;
  fetchLog.push(url);
  cacheLog.push({ url: url, cache: req.cache, inm: req.headers.get('if-none-match') });
  const entry = server.get(url);
  if (!entry) return Promise.resolve(new Response('missing', { status: 404 }));
  const inm = req.headers.get('if-none-match');
  const ims = req.headers.get('if-modified-since');
  const fresh = (inm && entry.etag && inm === entry.etag) ||
    (!inm && ims && entry.lm && ims === entry.lm);
  if (fresh) return Promise.resolve(new Response(null, { status: 304 }));
  const h = { 'content-type': 'text/plain' };
  if (entry.etag) h.etag = entry.etag;
  if (entry.lm) h['last-modified'] = entry.lm;
  dlBytes += entry.body.length;
  return Promise.resolve(new Response(entry.body, { status: 200, headers: h }));
}

/* ---- 桩：caches ---- */
const store = new Map();
function cacheObj(name) {
  if (!store.has(name)) store.set(name, new Map());
  const m = store.get(name);
  const key = (r) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);
  return {
    put: async (req, res) => { m.set(key(req), res); },
    match: async (req) => m.get(key(req)),
    add: async () => {},
    keys: async () => [...m.keys()].map((u) => ({ url: u })),
    delete: async (k) => m.delete(key(k)),
  };
}
const caches = {
  open: async (n) => cacheObj(n),
  match: async (req) => {
    const k = typeof req === 'string' ? new URL(req, ORIGIN).href : req.url;
    for (const m of store.values()) { const r = m.get(k); if (r) return r; }
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

const ctx = vm.createContext({
  self, caches, fetch: fetchStub, console,
  Response, Request: RequestStub, URL, Headers, setTimeout, Promise, Math, Date,
});

function runInstall() {
  const evt = { waitUntil: (p) => { evt.p = Promise.resolve(p); } };
  (handlers.install || []).forEach((fn) => fn(evt));
  return evt.p;
}
function runActivate() {
  const evt = { waitUntil: (p) => { evt.p = Promise.resolve(p); } };
  (handlers.activate || []).forEach((fn) => fn(evt));
  return evt.p;
}
async function cachedCount() {
  const c = await caches.open(CACHE);
  return (await c.keys()).length;
}

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : ''));
  ok ? pass++ : fail++;
};

(async () => {
  vm.runInContext(SRC_TEXT, ctx, { filename: 'service-worker.js' });

  console.log('SW ' + BUILD + '｜预缓存清单 ' + ASSETS.length + ' 条｜桶名 ' + CACHE);
  check('预缓存桶名不再带版本号（v66 硬要求）', !/v\d+$/.test(CACHE), CACHE);

  // ---------- 1) 首次安装：桶是空的，全量下载（属正常）----------
  seedServer(true);
  fetchLog = []; cacheLog = []; dlBytes = 0;
  await runInstall();
  const firstBytes = dlBytes;
  check('首次安装 → 全量下载（空桶，正常）', dlBytes > 0 && (await cachedCount()) === ASSETS.length,
    ASSETS.length + ' 条 / ' + firstBytes + ' 字节');
  /* v70：空桶时若不强制 no-cache，浏览器会把 HTTP 缓存里的旧副本当新内容写进桶 */
  check('首装（空桶）→ 每条请求都是 cache:no-cache（不吃 HTTP 缓存旧副本）',
    cacheLog.length === ASSETS.length && cacheLog.every((x) => x.cache === 'no-cache'),
    cacheLog.filter((x) => x.cache === 'no-cache').length + '/' + cacheLog.length);

  // ---------- 2) 发新版但内容没变：应全部命中 304，零下载 ----------
  fetchLog = []; cacheLog = []; dlBytes = 0;
  await runInstall();
  check('内容未变 → 零字节下载（全 304）', dlBytes === 0, dlBytes + ' 字节');
  check('内容未变 → 仍逐条问过服务器（不会漏更新）', fetchLog.length === ASSETS.length,
    fetchLog.length + ' 条请求');
  check('有旧副本 → 走 If-None-Match 条件请求（保住 304 零下载）',
    cacheLog.length === ASSETS.length && cacheLog.every((x) => !!x.inm),
    cacheLog.filter((x) => x.inm).length + '/' + cacheLog.length);

  // ---------- 3) 只改一个文件：只重下这一个 ----------
  const changed = new URL('/passive/akp.js', ORIGIN).href;
  server.set(changed, { etag: '"e-changed"', lm: 'Thu, 16 Oct 2026 10:00:00 GMT', body: 'new-akp-js-payload' });
  fetchLog = []; dlBytes = 0;
  await runInstall();
  check('只改 1 个文件 → 只重下这 1 个（其余 304）',
    dlBytes === 'new-akp-js-payload'.length, dlBytes + ' 字节（全量是 ' + firstBytes + '）');
  const c = await caches.open(CACHE);
  const stored = await c.match(new RequestStub('/passive/akp.js'));
  check('改动的文件 → 缓存里已是新内容', stored && (await stored.text()) === 'new-akp-js-payload');

  // ---------- 4) 再发新版：又回到零下载（证明不是一次性）----------
  fetchLog = []; dlBytes = 0;
  await runInstall();
  check('第二次发版（无改动）→ 依旧零下载', dlBytes === 0, dlBytes + ' 字节');

  // ---------- 5) 服务器不给 ETag：安全退化成无条件下载 ----------
  seedServer(false);
  fetchLog = []; dlBytes = 0;
  await runInstall();
  check('服务器无校验器 → 退化成全量下载（不会缓存坏死）', dlBytes > 0, dlBytes + ' 字节');

  // ---------- 6) 离线安装：有旧副本就沿用，install 不失败 ----------
  seedServer(true);
  await runInstall();
  const beforeOffline = await cachedCount();
  const realFetch = ctx.fetch;
  ctx.fetch = () => Promise.reject(new TypeError('Failed to fetch'));
  fetchLog = []; dlBytes = 0;
  let installOk = true;
  try { await runInstall(); } catch (e) { installOk = false; }
  ctx.fetch = realFetch;
  check('离线发版 → install 不失败、旧缓存保留', installOk && (await cachedCount()) === beforeOffline,
    beforeOffline + ' 条');

  // ---------- 7) activate：预缓存桶与运行时桶都不被清 ----------
  store.set('guangyuan-v65', new Map());   // 模拟老版本遗留桶
  await caches.open(RUNTIME).then((c) => c.put(ORIGIN + '/passive/char.html?id=lingjia',
    new Response('<b>令迦</b>', { headers: { 'Content-Type': 'text/html' } })));
  await runActivate();
  const keys = await caches.keys();
  check('activate 保留预缓存桶', keys.includes(CACHE));
  check('activate 保留运行时缓存（看过即缓存）', keys.includes(RUNTIME));
  check('activate 清掉历史版本桶', !keys.includes('guangyuan-v65'), keys.join(', '));

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
