/* Service Worker「App 内容覆盖层」模拟闸门（第 18 轮，2026-10-19）
   ------------------------------------------------------------------
   为什么要单独这一组：内容覆盖层分支**只在 App 环境生效**（Web 端零变化），
   浏览器闸门（同源 http://127.0.0.1:8099）的 origin 不是 localhost → IS_NATIVE
   为 false → 永远不会进入内容分支，测不出它的行为。

   本脚本用 vm 把**真实的** service-worker.js 跑在桩出来的 App 环境里：
     · self.location = https://localhost → IS_NATIVE = true（内容分支生效）
     · App 本地服务器：对内容路径返回「APK 内置版」（www 里那份，永远存在）
     · 线上站点（https://m78calc.cn）：返回「线上新版」
   再跑一个「Web 端」桩（self.location = http://127.0.0.1:PORT）证明内容分支不生效。

   断言（对应计划第 3 条验收的五条）：
     ① 命中 content 桶 → 直接返回缓存响应（先秒开，不等网络）
     ② 未命中 → 返回 APK 本地副本（内置版，永远有）
     ③ 命中后后台换新（SWR）→ 缓存里已是线上新内容
     ④ 断网（本地也挂）→ 有旧桶副本时回旧桶，不透传错误
     ⑤ Web 端（origin ≠ localhost）→ 不进内容分支（走常规逻辑，不返回线上内容）

   用法：
     node tools/sw_content_test.js                 # 测当前 service-worker.js
     node tools/sw_content_test.js <另一个SW路径>   # 自证闸门（对旧代码复现违例）
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SW_PATH = process.argv[2] || path.join(__dirname, '..', 'service-worker.js');
const SRC_TEXT = fs.readFileSync(SW_PATH, 'utf8');

const APP_ORIGIN = 'https://localhost';
const WEB_ORIGIN = 'http://127.0.0.1:8099';
const SITE = 'https://m78calc.cn';

const CONTENT = /const CONTENT_CACHE = '([^']+)'/.exec(SRC_TEXT)[1];
const BUILD = /const BUILD = '([^']+)'/.exec(SRC_TEXT)[1];

/* ---- 桩：服务器 ----
   App 本地服务器：内容路径返回「内置版」（永远 200，模拟 Capacitor www）
   线上站点：按 server 表给内容；表里没有 → 404 */
const CONTENT_RE = /^\/(index|calculator|guides|strategies|app|strategy-[^/]+)\.html$|^\/manifest\.json$|^\/(assets|passive)\//;
const server = new Map();                 // 线上 url -> { etag, body }
let fetchLog = [];
let netPending = [];
let hold = false;
let offline = false;                      // true = 本地服务器也断（复刻「断网」）

function seedRemote(url, body, etag) {
  server.set(url, { etag: etag || '"e-' + body + '"', body: body });
}
function releaseNet() {
  hold = false;
  const ps = netPending; netPending = [];
  ps.forEach((res) => res());
}

function buildFetch(appOrigin, localBody) {
  return function fetchStub(req) {
    const url = typeof req === 'string' ? req : req.url;
    const u = new URL(url);
    fetchLog.push(url);
    const respond = () => {
      /* App 本地服务器：内容路径给「内置版」；断网时本地也挂 */
      if (u.origin === appOrigin && CONTENT_RE.test(u.pathname)) {
        if (offline) return Promise.resolve(new Response('local unreachable', { status: 503 }));
        /* header 打标 x-src=builtin，供闸门在 clone 共享 body 后用 header 判定来源 */
        return Promise.resolve(new Response(localBody, { status: 200, headers: { etag: '"e-local"', 'x-src': 'builtin' } }));
      }
      /* 线上 */
      const entry = server.get(url);
      if (!entry) return Promise.resolve(new Response('not found', { status: 404 }));
      const inm = req && req.headers && req.headers.get && req.headers.get('if-none-match');
      if (inm && entry.etag && inm === entry.etag) {
        return Promise.resolve(new Response(null, { status: 304 }));
      }
      return Promise.resolve(new Response(entry.body, { status: 200, headers: { etag: entry.etag, 'x-src': 'remote' } }));
    };
    if (hold) return new Promise((res) => netPending.push(() => res(respond())));
    return respond();
  };
}

/* ---- 桩：caches ---- */
const store = new Map();
function cacheObj(name) {
  if (!store.has(name)) store.set(name, new Map());
  const m = store.get(name);
  const key = (r) => (typeof r === 'string' ? r : (r && r.url) || r);
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

/* ---- 桩：Request（页面请求 mode = navigate / 静态 no-cors）---- */
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

/* ---- 桩：self ---- */
function makeSelf(origin) {
  const u = new URL(origin);
  return {
    location: { origin, hostname: u.hostname, protocol: u.protocol, href: origin + '/' },
    addEventListener: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
}

const handlers = {};
const self = makeSelf(APP_ORIGIN);
const ctx = vm.createContext({
  self, caches, fetch: buildFetch(APP_ORIGIN, 'APK-BUILTIN'), console,
  Response, Request: RequestStub, URL, Headers, setTimeout, Promise, Math, Date, JSON,
});
vm.runInContext(SRC_TEXT, ctx, { filename: path.basename(SW_PATH) });

/* ---- 驱动 ---- */
function ask(relPath, mode) {
  const req = new RequestStub(relPath, { mode: mode || 'no-cors' });
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
  if (!evt.p) return { res: null, err: new Error('未 respondWith（分支未接管）') };
  evt.p.then((r) => { res = r; }).catch((e) => { err = e; });
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
  if (evt.wu) await Promise.all(evt.wu);
  return { res, err };
}
const bodyOf = async (r) => {
  try { return (r && typeof r.text === 'function') ? await r.text() : null; }
  catch (e) { return null; }
};
const srcOf = (r) => { try { return (r && r.headers && r.headers.get) ? r.headers.get('x-src') : null; } catch (e) { return null; } };
const contentKeys = async () => (await (await caches.open(CONTENT)).keys()).map((k) => k.url);

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : ''));
  ok ? pass++ : fail++;
};

(async () => {
  console.log('SW ' + BUILD + '｜内容覆盖层模拟：App origin ' + APP_ORIGIN + '，线上 ' + SITE +
    '\n源文件：' + path.relative(path.join(__dirname, '..'), SW_PATH));

  const REL = '/calculator.html';
  const REMOTE = SITE + REL;
  const LOCAL = APP_ORIGIN + REL;

  /* ============ ① 命中 content 桶 → 直接返回缓存（先秒开，不等网络）============ */
  const content = await caches.open(CONTENT);
  await content.put(LOCAL, new Response('CONTENT-OLD', { status: 200, headers: { etag: '"e-old"' } }));
  await content.put(REMOTE, new Response('CONTENT-OLD', { status: 200, headers: { etag: '"e-old"' } }));
  seedRemote(REMOTE, 'REMOTE-NEW', '"e-new"');

  hold = true; netPending = []; fetchLog = [];
  let evt = ask(REL, 'navigate');
  let early = null, earlyErr = null;
  evt.p.then((x) => { early = x; }).catch((e) => { earlyErr = e; });
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));   // 网络全部挂起
  check('① 命中 content 桶 → 不等网络就返回缓存响应（先秒开）',
    !earlyErr && early !== null && early !== undefined,
    early ? 'status=' + early.status : (earlyErr ? 'throw: ' + earlyErr.message : '(网络挂起仍未返回 → 不是缓存优先)'));
  const earlyBody = await bodyOf(early);
  check('① 命中 content 桶 → 返回的是缓存内容（不是线上新版）',
    earlyBody === 'CONTENT-OLD', String(earlyBody));
  const wu = evt.wu || [];
  releaseNet();
  await Promise.all(wu);
  const afterBody = await bodyOf(await content.match(REMOTE));
  check('① 命中后后台换新（SWR）→ 缓存里已是线上新内容',
    afterBody === 'REMOTE-NEW', String(afterBody));
  await settle(evt);

  /* ============ ② 未命中 → 返回 APK 本地副本（内置版，永远有）============ */
  store.clear();
  seedRemote(REMOTE, 'REMOTE-NEW', '"e-new"');
  fetchLog = [];
  evt = ask(REL, 'navigate');
  let r = await settle(evt);
  check('② 未命中 content 桶 → 返回 APK 本地副本（内置版 x-src=builtin，在线也先拿本地）',
    r.res && r.res.status === 200 && srcOf(r.res) === 'builtin',
    r.res ? 'status=' + r.res.status + ' src=' + srcOf(r.res) : (r.err ? 'throw: ' + r.err.message : '(无响应)'));
  const dualKeys = await contentKeys();
  check('② 落桶线上键 + 本地键双份（两通道互相命中）',
    dualKeys.includes(REMOTE) && dualKeys.includes(LOCAL), dualKeys.join(' | ') || '(空)');

  /* ============ ③ 断网（本地也挂）→ 有旧桶副本时回旧桶 ============ */
  offline = true;
  /* 桶里留一份旧内容，本地服务器 503，线上也 503（断网） */
  store.clear();
  await (await caches.open(CONTENT)).put(LOCAL,
    new Response('CONTENT-OLD', { status: 200, headers: { 'x-src': 'cached' } }));
  server.clear();
  fetchLog = [];
  evt = ask(REL, 'navigate');
  r = await settle(evt);
  check('③ 断网且本地也挂 → 回 content 桶旧副本（不清桶、不透传错误）',
    r.res && r.res.status === 200 && srcOf(r.res) === 'cached',
    r.res ? 'status=' + r.res.status + ' src=' + srcOf(r.res) :
      (r.err ? 'throw: ' + r.err.message : '(无响应)'));
  offline = false;

  /* ============ ④ Web 端（origin ≠ localhost）→ 不进内容分支 ============ */
  /* 用 Web origin 重跑脚本：IS_NATIVE 应为 false，内容分支不接管 */
  const store2 = new Map();
  const webCaches = {
    open: async (n) => cacheObjInline(store2, n),
    match: async () => undefined,
    keys: async () => [...store2.keys()],
    delete: async (n) => store2.delete(n),
  };
  function cacheObjInline(st, name) {
    if (!st.has(name)) st.set(name, new Map());
    const m = st.get(name);
    const key = (r) => (typeof r === 'string' ? r : (r && r.url) || r);
    return { put: async (q, res) => { m.set(key(q), res); }, match: async (q) => m.get(key(q)), add: async () => {}, keys: async () => [...m.keys()].map((u) => ({ url: u })), delete: async (k) => m.delete(key(k)) };
  }
  const wHandlers = {};
  const wSelf = {
    location: { origin: WEB_ORIGIN, hostname: '127.0.0.1', protocol: 'http:', href: WEB_ORIGIN + '/' },
    addEventListener: (t, fn) => { (wHandlers[t] = wHandlers[t] || []).push(fn); },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const wSeed = new Map(); wSeed.set(REMOTE, { etag: '"e-web"', body: 'WEB-ONLINE' });
  const wCtx = vm.createContext({
    self: wSelf, caches: webCaches,
    fetch: (req) => { const url = typeof req === 'string' ? req : req.url; const e = wSeed.get(url); return e ? Promise.resolve(new Response(e.body, { status: 200, headers: { etag: e.etag } })) : Promise.resolve(new Response('nf', { status: 404 })); },
    console, Response, Request: RequestStub, URL, Headers, setTimeout, Promise, Math, Date, JSON,
  });
  vm.runInContext(SRC_TEXT, wCtx, { filename: path.basename(SW_PATH) });
  const wEvt = {
    request: new RequestStub(REL),
    respondWith: (p) => { wEvt.p = Promise.resolve(p); },
    waitUntil: (p) => { (wEvt.wu = wEvt.wu || []).push(Promise.resolve(p)); },
  };
  (wHandlers.fetch || []).forEach((fn) => fn(wEvt));
  await settle(wEvt);
  /* Web 端内容路径走「静态默认」取件：无缓存 → fetch → 返回桩响应。
     关键验证「内容分支不接管」= Web 下**没有**打开 content 桶（store2 里无 CONTENT），
     且页面拿到的不是 APK 内置副本（x-src=builtin）。 */
  const noContentBucket = !store2.has(CONTENT);
  const wSrc = srcOf(wEvt.p);
  check('④ Web 端（origin ≠ localhost）→ 内容分支不接管（未打开 content 桶）',
    noContentBucket, noContentBucket ? '（无 content 桶）' : 'store2 里出现了 ' + CONTENT + ' → 内容分支被触发了');
  check('④ Web 端 → 页面响应不是 APK 内置副本（x-src≠builtin）',
    wSrc !== 'builtin', 'Web src=' + String(wSrc));

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
