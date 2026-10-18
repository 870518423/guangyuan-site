/* Service Worker「App 环境取图」模拟闸门（第 17 轮，2026-10-18）
   ------------------------------------------------------------------
   为什么要单独这一组：浏览器闸门（同源 http://127.0.0.1:8099）**永远测不出** App 的问题。
   App（Capacitor）里页面 origin 是 https://localhost，本地服务器**根本没有** /images/
   与 /passive/img/ 这些图（www 同步时排除了），任何直接拿 request 去 fetch 的写法
   都会拿到 404 —— 第 16 轮的「看过即缓存」就是这样在 App 下全坏的，而浏览器同源
   fetch 正常，所以既有闸门一片全绿。

   本脚本用 vm 把**真实的** service-worker.js 跑在桩出来的 App 环境里：
     · self.location = https://localhost（SW 会据此把 SITE_BASE 定为 https://m78calc.cn）
     · 本地服务器：/images/、/passive/img/ 一律 404（复刻 App 实况）
     · 线上服务器：正常给 200 + ETag
   断言三件事：
     ① 未缓存图片的 fetch 必须打向 https://m78calc.cn/ 对应路径（不是 localhost）
     ② 命中 packs 桶时，在线请求直接拿到缓存响应（先秒开，不等网络）
     ③ 404 不透传：!ok 时先回查缓存，都没有才走裂图占位，绝不把 404 响应体给页面

   用法：
     node tools/sw_app_image_test.js                  # 测当前 service-worker.js
     node tools/sw_app_image_test.js <另一个SW路径>    # 自证闸门（对旧代码复现违例）
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SW_PATH = process.argv[2] || path.join(__dirname, '..', 'service-worker.js');
const SRC_TEXT = fs.readFileSync(SW_PATH, 'utf8');

/* App 里的页面 origin（Capacitor 用 https://localhost 加载本地 assets） */
const APP_ORIGIN = 'https://localhost';
/* 图片实际所在的线上站点 —— SW 里的 SITE_BASE 常量 */
const SITE = 'https://m78calc.cn';

const PACKS = /const PACKS_CACHE = '([^']+)'/.exec(SRC_TEXT)[1];
const RUNTIME = /const RUNTIME = '([^']+)'/.exec(SRC_TEXT)[1];
const BUILD = /const BUILD = '([^']+)'/.exec(SRC_TEXT)[1];

/* ---- 桩：服务器 ----
   App 本地服务器：图片路径一律 404（这就是 App 实况）
   线上站点：按 server 表给 200 + ETag；表里没有的 → 404 */
const IMG_RE = /^\/(images|passive\/img|assets\/guides)\//;
const server = new Map();                 // 线上 url -> { etag, body }
let fetchLog = [];                        // 所有 fetch 的 URL（按发出顺序）
let netPending = [];                      // 挂起的网络请求（用于证明「不等网络」）
let hold = false;                         // true = 网络一律挂起，需 releaseNet() 放行

function seedRemote(url, body, etag) {
  server.set(url, { etag: etag || '"e-' + body + '"', body: body });
}
function releaseNet() {
  hold = false;
  const ps = netPending; netPending = [];
  ps.forEach((res) => res());
}

function fetchStub(req) {
  const url = typeof req === 'string' ? req : req.url;
  const u = new URL(url);
  fetchLog.push(url);
  const respond = () => {
    /* App 本地服务器：图片一律 404（复刻实况；非图片路径按线上处理） */
    if (u.origin === APP_ORIGIN && IMG_RE.test(u.pathname)) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    const entry = server.get(url);
    if (!entry) return Promise.resolve(new Response('not found', { status: 404 }));
    const inm = req && req.headers && req.headers.get && req.headers.get('if-none-match');
    if (inm && entry.etag && inm === entry.etag) {
      return Promise.resolve(new Response(null, { status: 304 }));
    }
    return Promise.resolve(new Response(entry.body, { status: 200, headers: { etag: entry.etag } }));
  };
  /* 挂起时也要在放行后把**真实响应**交回去（否则 SW 拿到 undefined，
     看起来像网络异常、被 imgRefresh 静默吞掉，闸门就查不出问题） */
  if (hold) return new Promise((res) => netPending.push(() => res(respond())));
  return respond();
}

/* ---- 桩：caches ---- */
const store = new Map();
function cacheObj(name) {
  if (!store.has(name)) store.set(name, new Map());
  const m = store.get(name);
  const key = (r) => (typeof r === 'string' ? r : r.url);
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
  match: async () => undefined,
  keys: async () => [...store.keys()],
  delete: async (n) => store.delete(n),
};

/* ---- 桩：Request（图片走 <img>，mode = no-cors）---- */
class RequestStub {
  constructor(url, opts) {
    opts = opts || {};
    this.url = new URL(url, APP_ORIGIN).href;
    this.method = opts.method || 'GET';
    this.mode = opts.mode || 'no-cors';
    this.cache = opts.cache || 'default';
    this.headers = new Headers(opts.headers || {});
  }
}

/* ---- 桩：self（App 环境）---- */
const handlers = {};
const self = {
  location: {
    origin: APP_ORIGIN,
    hostname: 'localhost',
    protocol: 'https:',
    href: APP_ORIGIN + '/',
  },
  addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
  skipWaiting: () => Promise.resolve(),
  clients: { claim: () => Promise.resolve() },
};

const ctx = vm.createContext({
  self, caches, fetch: fetchStub, console,
  Response, Request: RequestStub, URL, Headers, setTimeout, Promise, Math, Date, JSON,
});
vm.runInContext(SRC_TEXT, ctx, { filename: path.basename(SW_PATH) });

/* ---- 驱动：发一个图片请求 ---- */
function askImage(relPath) {
  const req = new RequestStub(IMG_RE.test(relPath) ? relPath : '/images/' + relPath);
  const evt = {
    request: req,
    respondWith: (p) => { evt.p = Promise.resolve(p); },
    waitUntil: (p) => { (evt.wu = evt.wu || []).push(Promise.resolve(p)); },
  };
  (handlers.fetch || []).forEach((fn) => fn(evt));
  return evt;
}
async function settle(evt) {
  let res = null, err = null;
  evt.p.then((r) => { res = r; }).catch((e) => { err = e; });
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  if (evt.wu) await Promise.all(evt.wu);
  return { res, err };
}
const bodyOf = async (r) => {
  try { return (r && typeof r.text === 'function') ? await r.text() : null; }
  catch (e) { return null; }        // 已被读过 / 不是 Response：按空处理，不拖垮闸门
};
const packsKeys = async () => (await (await caches.open(PACKS)).keys()).map((k) => k.url);

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : ''));
  ok ? pass++ : fail++;
};

(async () => {
  console.log('SW ' + BUILD + '｜App 环境模拟：页面 origin ' + APP_ORIGIN + '，线上 ' + SITE +
    '\n源文件：' + path.relative(path.join(__dirname, '..'), SW_PATH));

  const REL = '/images/humans/abc123/avatar.webp';
  const REMOTE = SITE + REL;
  const LOCAL = APP_ORIGIN + REL;
  seedRemote(REMOTE, 'REMOTE-IMAGE-BYTES', '"e-remote"');

  /* ============ ① 未缓存：必须打向线上，不能打 localhost ============ */
  fetchLog = [];
  let evt = askImage(REL);
  let r = await settle(evt);
  const hitLocal = fetchLog.some((u) => u.startsWith(APP_ORIGIN + '/images/'));
  const hitRemote = fetchLog.some((u) => u === REMOTE);
  check('① 未缓存图片 → fetch 打向线上 ' + SITE + '（不是 localhost）',
    hitRemote, fetchLog.join(' | ') || '(无请求)');
  check('① 未缓存图片 → 绝不去打本地 https://localhost（那里必 404）',
    !hitLocal, hitLocal ? '仍在打本地 → App 裂图根因' : '未打本地');
  check('① 未缓存图片 → 页面拿到的是线上真图，不是 404',
    r.res && r.res.status === 200 && (await bodyOf(r.res)) === 'REMOTE-IMAGE-BYTES',
    r.res ? 'status=' + r.res.status : (r.err ? 'throw: ' + r.err.message : '(无响应)'));
  let keys = await packsKeys();
  check('① 入 packs 桶：线上键 + 本地键双份（预取与取图互相命中）',
    keys.includes(REMOTE) && keys.includes(LOCAL), keys.join(' | ') || '(空)');
  check('① 图片不进 RUNTIME 桶（805 张会挤满 400 条上限）',
    !(await (await caches.open(RUNTIME)).keys()).some((k) => k.url === REMOTE || k.url === LOCAL));

  /* ============ ② 命中缓存：在线也直接拿缓存（先秒开，不等网络）============ */
  /* 把缓存换成一份「旧内容」，线上留一份「新内容」：
     先秒开 = 本次返回必须是旧内容；SWR = 放行网络后缓存里应变成新内容。 */
  const packs = await caches.open(PACKS);
  await packs.put(LOCAL, new Response('CACHED-OLD-COPY', { status: 200, headers: { etag: '"e-cached"' } }));
  await packs.put(REMOTE, new Response('CACHED-OLD-COPY', { status: 200, headers: { etag: '"e-cached"' } }));
  seedRemote(REMOTE, 'REMOTE-NEW-BYTES', '"e-remote-new"');

  hold = true; netPending = []; fetchLog = [];
  evt = askImage(REL);
  let early = null, earlyErr = null;
  evt.p.then((x) => { early = x; }).catch((e) => { earlyErr = e; });
  for (let i = 0; i < 6; i++) await new Promise((res) => setImmediate(res));   // 网络仍全部挂起
  check('② 命中 packs 桶 → 不等网络就返回缓存响应（先秒开）',
    !earlyErr && early !== null && early !== undefined,
    early ? 'status=' + early.status : (earlyErr ? 'throw: ' + earlyErr.message : '(网络挂起中仍未返回 → 不是缓存优先)'));
  const earlyBody = await bodyOf(early);
  check('② 命中 packs 桶 → 返回的是缓存内容（缓存优先，非网络优先）',
    earlyBody === 'CACHED-OLD-COPY', String(earlyBody));
  /* 放行网络 → 后台 SWR 换新，下次打开是新的 */
  const wu = evt.wu || [];
  releaseNet();
  await Promise.all(wu);
  const afterBody = await bodyOf(await packs.match(REMOTE));
  check('② 命中后后台换新（SWR）→ 缓存里已是线上新内容',
    afterBody === 'REMOTE-NEW-BYTES', String(afterBody));
  await settle(evt);

  /* ============ ③ 404 不透传 ============ */
  /* 3a：缓存里只有「线上键」（模拟预取过），远程该图已下线（404）
         → 必须回查缓存给出旧图，不能把 404 甩给页面 */
  store.clear();
  seedRemote(REMOTE, 'x', '"e-x"');
  await (await caches.open(PACKS)).put(REMOTE,
    new Response('PREFETCHED-COPY', { status: 200, headers: { etag: '"e-prefetched"' } }));
  server.delete(REMOTE);                     // 线上这张图没了 → 404
  fetchLog = [];
  evt = askImage(REL);
  r = await settle(evt);
  check('③a 网络 404 但缓存里有（预取键）→ 回查缓存给旧图，不透传 404',
    r.res && r.res.status === 200 && (await bodyOf(r.res)) === 'PREFETCHED-COPY',
    r.res ? 'status=' + r.res.status : (r.err ? 'throw: ' + r.err.message : '(无响应)'));

  /* 3b：缓存没有、网络也 404 → 走裂图占位（抛错让 <img> onerror），
         绝不返回一个 404 响应体给页面 */
  store.clear();
  server.delete(REMOTE);
  fetchLog = [];
  evt = askImage(REL);
  r = await settle(evt);
  const is404 = r.res && r.res.status === 404;
  check('③b 既无缓存又 404 → 不返回 404 响应体（走裂图占位）',
    !is404 && !!r.err,
    r.res ? 'status=' + r.res.status + '（404 被透传了）' : ('throw → ' + (r.err && r.err.message)));

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
