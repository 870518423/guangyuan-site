// Service Worker - 奥系光元工具站 PWA
//
// 取件策略（v5 起）：
//   页面（HTML）  → 网络优先，断网时回退缓存    ← 保证"改完刷新就能看到新版"
//   其它静态资源  → 缓存优先，网络回退并写入缓存 ← 保证离线可用、二次打开快
//
// v6：人间体数据更新（马东快斗 → 东马快斗；北斗星司/飞鸟信/真角大古/东马快斗
//     新增「惊喜首充（30元档）vip3礼包」；迫水真吾新增「vip10礼包」）
const CACHE_NAME = 'guangyuan-forecast-v6';
const ASSETS = [
  './',
  './index.html',
  './calculator.html',
  './guides.html',
  './manifest.json',
  './assets/guangyuan.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-192-maskable.png',
  './assets/icon-512-maskable.png',
  './assets/apple-touch-icon.png',
  './assets/favicon-32.png',
  './assets/factions/star.png',
  './assets/factions/multiverse.png',
  './assets/factions/monster.png',
  './assets/factions/alien.png'
];

const OFFLINE_PAGE = './index.html';

// 判断该请求是不是"页面"（导航请求，或接受 text/html）
function isDocumentRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// 请求拦截
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // 只管同源请求
  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // ---- 页面：网络优先 ----
  if (isDocumentRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(OFFLINE_PAGE))
        )
    );
    return;
  }

  // ---- 静态资源：缓存优先 ----
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
