/* 51.la 统计接入（2026-10-17）
 *
 * 位置约定：放在站点根目录，**不要**放进 /assets/。
 *   /assets/* 在 edgeone.json 里是 `max-age=31536000, immutable`，
 *   浏览器一年内连校验都不发 —— 统计脚本放进去，以后改配置老用户永远拿不到新版。
 *
 * 页面里只需一行：<script defer src="/ak-analytics.js"></script>
 *
 * 排除自己的访问（推荐）：
 *   用 https://m78calc.cn/?owner=1 打开一次 → 这台设备写入标记，从此不再上报。
 *   取消标记：用 https://m78calc.cn/?owner=0 打开一次。
 *   好处：换 IP、换网络、重启路由器都不影响，也不会误伤任何真实用户。
 */

(function () {
  var OWNER_KEY = 'ak-owner';
  var SITE_ID = '3RXNOeh31rxCrJaP';
  var SITE_CK = '3RXNOeh31rxCrJaP';

  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  }

  // ?owner=1 → 标记为本机（自己的设备，不上报）
  // ?owner=0 → 取消标记
  var q = (location.search || '').toLowerCase();
  if (q.indexOf('owner=1') > -1) { lsSet(OWNER_KEY, '1'); }
  if (q.indexOf('owner=0') > -1) { lsDel(OWNER_KEY); }

  // 自己的设备直接不加载 SDK，从源头不产生任何上报
  if (lsGet(OWNER_KEY) === '1') { return; }

  var s = document.createElement('script');
  s.charset = 'UTF-8';
  s.id = 'LA_COLLECT';              // 51.la 官方要求的固定 id
  s.src = 'https://sdk.51.la/js-sdk-pro.min.js';
  s.onload = function () {
    if (window.LA && typeof window.LA.init === 'function') {
      window.LA.init({ id: SITE_ID, ck: SITE_CK });
    }
  };
  // SDK 被拦截或加载失败时静默跳过，绝不影响页面本身
  (document.head || document.documentElement).appendChild(s);
})();
