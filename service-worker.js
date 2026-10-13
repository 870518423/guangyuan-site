// Service Worker - 奥系光元工具站 PWA
//
// 取件策略（v5 起）：
//   页面（HTML）  → 网络优先，断网时回退缓存    ← 保证"改完刷新就能看到新版"
//   其它静态资源  → 缓存优先，网络回退并写入缓存 ← 保证离线可用、二次打开快
//
// v6：人间体数据更新（马东快斗 → 东马快斗；北斗星司/飞鸟信/真角大古/东马快斗
//     新增「惊喜首充（30元档）vip3礼包」；迫水真吾新增「vip10礼包」）
// v7：新增「奥系攻略」板块（strategies.html / strategy-xiulian.html / strategy-dati.html）
// v8：攻略板块换用透明书本图标 assets/strategy-book.png
// v9：书本图标补回被误裁的金色书签（同名文件更新，需换缓存版本才会刷新）
// v12：斯菲亚虚体的前置「斯菲亚」标注为角色卡，不再误链到人间体「斯菲亚」
// v13（本目录实验版）：明日方舟风格皮肤层 assets/ak/*（缓存名与主站隔离）
// v14（v2 交互重建）：页面切换 view-transition、折叠 grid 方案、骨架屏、数字滚动
// v15（v3 主题系统）：亮色主题 ak-light.css + 右上角切换开关 theme.js（localStorage 持久化）
// v16（第 4 轮）：首页「收藏本站」——assets/ak/save.js（优先调起 PWA 安装，回落手动说明面板）
// v17：按钮与页头提示改为「添加到桌面」口径（去掉 Ctrl+D 键盘说法），save.js 同步改名
// v18：按钮从页脚上方挪到页头副标题下方；去掉那行提示小字（ak-components.css 间距同步调整）
// v19（安装链路修复）：index.html 补 manifest / apple-touch-icon / SW 注册（此前只有
//      calculator.html 注册，从首页进入的新访客拿不到 SW → 浏览器判定不可安装，
//      于是永远不出现原生安装弹窗）；save.js 重写为跨浏览器分支文案（iOS 分享→添加
//      到主屏幕 / Android 各自菜单路径 / 不支持时改为引导收藏）；manifest 补 id·scope·lang
// v20（第 1 轮计划）：新增图片型攻略页 strategy-bingfeiwudou.html（并非五斗的警备队攻略）；
//     站点大图压缩（guangyuan.png 153→18KB、icon-512 147→21KB、icon-512-maskable 94→13KB）。
//     ⚠️ 攻略三张长图**不进**预缓存（WebP 合计约 2MB，按需加载即可），只缓存页面本体与页面图标。
// v21（第 2 轮计划）：缓存版本号从 v9 修正为与注释同步的 v20 —— 此前注释一路写到
//      v20，CACHE_NAME 却停在 v9，老用户切新版时缓存名不变、旧缓存不会被清，
//      新攻略页可能命中旧的离线回退。本次一并升到 v21，确保刷新即拿到新版。
// v22：第 3 张攻略长图换新版（16到20章怪物站位图，各章补血量标注）。
//      ⚠️ 图片走的是「缓存优先」，文件名未变 → **必须升缓存版本**，否则老用户
//      会一直拿到缓存里的旧站位图。HTML 里 width/height 同步由 1780x3869
//      改为 1779x3871（占位比例对得上，避免展开时高度跳动）。
// v23（第 3 轮计划）：save.js 与 ak-components.css 都是「缓存优先」资源，故必须升版。
//      · save.js 新增微信/QQ 内置浏览器检测与「在浏览器中打开」专属引导
//        （情形 0，排在所有分支最前）；iOS 文案按版本分支（iOS 26+ 默认紧凑
//        布局把「分享」收进了「···」菜单，旧文案会让人找不到按钮）；
//        不支持场景 lead 明确化。
//      · ak-components.css §12：面板触摸目标统一 ≥44px、宽度改 min(440px,92vw)、
//        加 max-height 内部滚动、底部避让 safe-area。开合仍用 transition（禁 keyframes）。
// v24：vivo 自带浏览器文案修正（管理者实机反馈）。UA 含 VivoBrowser → brand "vivo"。
//      ⚠️ 关键：vivo 浏览器右上角是「工具箱」（设置类）不是菜单，主菜单在
//      **页面下方「≡」（三条横杠）**，「收藏网站」在那里 → 旧文案「点右上角『⋮』」
//      对它是错的，用户照做找不到。新增 menuSpot() 按品牌统一给「菜单在哪」，
//      vivo / samsung / huawei / xiaomi / firefox / 其余 各一套；
//      拿不准的品牌写宽（「右上角『⋮』或底部『≡』」）而不是指错位置。
// v25：①**修 isQQBuiltIn() 误判**——原判据含 MQQBrowser，而 **QQ 浏览器（独立 App）
//      的 UA 里也有 MQQBrowser**，会被错当成 QQ 内置浏览器、把用户错误地劝去
//      「换浏览器打开」。现只认 `QQ/<版本号>` 这一个 token（QQ 内置必有、QQ 浏览器没有）。
//      ②未核实品牌的兜底文案改为中性描述（同时给出「≡」与「⋮」「⋯」两种位置），
//      不再默认指「右上角」。
// v26：新增「角色被动版本收录」板块（passive/ 目录）。
//      · 主页加第四张入口卡片，链接 passive/index.html；
//      · 板块三页（阵营目录 / 阵营角色列表 / 角色页）+ 组件 CSS/JS + 角色数据
//        进预缓存（纯文本合计约 120KB）；**角色立绘与技能截图（60 张约 4.2MB）
//        不进预缓存**（与攻略长图同口径：走「缓存优先」按需缓存即可）。
// v27：板块名统一为「角色被动版本收录」（去掉「奥系」前缀）—— 主页卡片、
//      更新记录与 passive 三页的标题同步改名。passive/index.html 是「网络优先」
//      页面本不受缓存影响，但 SW 文件自身与说明注释有变动，按硬规矩一并升版。
// v28：passive/index.html 顶部新增「← 返回主页」按钮（仅 /passive/ 目录内显示，
//      桌面独立预览时隐藏），页面在预缓存清单中，按规矩升版。
// v29：雷欧数据按管理者口径重构为 4 版（被动改动集中在 v1–v3、主动技 v1/v2
//      一致、v3/v4 再两调）；akp.js 新增 names 按版本取名 + textOf 回退语义
//      修正为「沿用最近一次改动」（旧逻辑错回 v1）；_images.js 雷欧截图标签
//      对齐实际版本。三者均在预缓存清单中，按硬规矩升版。
// v30：雷欧 v2 补入调整公告图（被动技_v2.webp，王者祝福首版破挡42%）；
//      原 v2/v3 素材图后移为 v3/v4；主动技_v1 改名 v1v2（v1/v2 共用）、
//      原 v2/v3 后移为 v3/v4；雷欧 data 的 +4 v2 文本改为公告内容，
//      其余条目按「公告只提 +4 变动」重排（v2 沿用 v1）。
// v31：被动板块版式调整 —— 日期（versions[].date，取自登场/加强时间表）
//      显示在标题条右端（原版本徽标位，同字体同色）；版本徽标下移到操作条
//      左端（「被动」正下方），与查看/对比按钮平行。9 个角色数据文件补入
//      date 字段，akp.js/akp.css 同步改动，均在预缓存清单中，按硬规矩升版。
// v32：短期整改五项（审查报告 S1–S5）——
//      S1 akp.js textOf/nameOf 回退改为比较版本号取最大（不再依赖键书写顺序）；
//      S3 category.html decodeURIComponent 容错（畸形参数不再白屏）；
//      S4 全站 4 处 esc() 补引号转义（含 index.html，文档原写两处）；
//      S5 缓存名去 test 残留：guangyuan-ak-test-v31 → guangyuan-v32（本次起用新名）；
//      S2 对账自检在 pack_deploy.py（不改 SW 内容但属同批发布）。
//      akp.js / index.html / category.html / char.html 均在预缓存清单，按硬规矩升版。
// v33：中期整改 M1–M4（审查报告第三部分）——
//      M1 新增 tools/akp_lint.py 数据体检，并挂进 pack_deploy.py 第五项自检
//         （manifest↔数据↔图片↔SW 清单四层一致性；脚本本身不进包）；
//      M2 install 由 cache.addAll 改为逐条 add+catch（单条失败不再拖垮整次安装）；
//      M3 passive 三页补 theme-color/manifest/apple-touch-icon/favicon 等 PWA meta，
//         manifest.json 描述补「角色被动版本收录」；
//      M4 新角色数据文件 ASCII 命名规则落档（_模板.js / _manifest.js 注释）。
//      passive 三页与 manifest.json 均在预缓存清单，SW 自身亦有改动，按硬规矩升版。
// v34：M6 执行——calculator.html 拆分（2025 行 → 148 行）。三个产物逐字节搬出：
//      assets/calc/calc-base.css（页面基础样式）、assets/calc/calc-override.css
//      （对 ak-components 的覆盖层，级联位置敏感）、assets/calc/calc.js（826 行逻辑）。
//      内联块 3（3 行微调）与两个引导脚本（主题首帧 / ak-js 兜底）保持内联：
//      抽取会推迟执行，破坏防闪色与兜底时机。三者均入预缓存，按硬规矩升版。
//      验收：tools/calc_regress.js 20/20 一致 + 双主题全页截图 0 差异像素。
const CACHE_NAME = 'guangyuan-v34';
const ASSETS = [
  './',
  './index.html',
  './calculator.html',
  './guides.html',
  './strategies.html',
  './strategy-xiulian.html',
  './strategy-dati.html',
  './strategy-bingfeiwudou.html',
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
  './assets/factions/alien.png',
  './assets/strategy-book.png',
  './assets/ak/ak-theme.css',
  './assets/ak/ak-motion.css',
  './assets/ak/ak-components.css',
  './assets/ak/ak-light.css',
  './assets/ak/ripple.js',
  './assets/ak/transitions.js',
  './assets/ak/progress.js',
  './assets/ak/counter.js',
  './assets/ak/theme.js',
  './assets/ak/save.js',
  /* —— passive/ 角色被动版本收录（v26）—— */
  './passive/index.html',
  './passive/category.html',
  './passive/char.html',
  './passive/akp.css',
  './passive/akp.js',
  './passive/akp-ripple.js',
  './passive/akp-list.css',
  './passive/data/_manifest.js',
  './passive/data/_images.js',
  './passive/data/利布特.js',
  './passive/data/奥特之父真之力（突破）.js',
  './passive/data/奥特之王（UL）.js',
  './passive/data/捷德尊皇形态（捷德之证）.js',
  './passive/data/捷德银河初升.js',
  './passive/data/泽塔德尔塔天爪.js',
  './passive/data/雷欧王者披风（突破）.js',
  './passive/data/梦比优斯凤凰勇气（突破）.js',
  './passive/data/泰迦三重斯特利姆.js',
  './passive/data/极恶贝利亚.js',
  './passive/data/奥美迦朱雀装甲.js',
  './passive/img/factions/star.png',
  './passive/img/factions/multiverse.png',
  './passive/img/factions/alien.png',
  './passive/img/factions/monster.png',
  /* —— 计算器页面拆分产物（M6，v34）：从 calculator.html 内联块逐字节搬出 —— */
  './assets/calc/calc-base.css',
  './assets/calc/calc-override.css',
  './assets/calc/calc.js'
];

const OFFLINE_PAGE = './index.html';

// 判断该请求是不是"页面"（导航请求，或接受 text/html）
function isDocumentRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

// 安装：预缓存核心资源
// 2026-10-13 M2（审查 D-1）：原来用 cache.addAll(ASSETS) —— 它是「全有或全无」，
// 任何一条资源 404 都会让整个 install 失败，老用户被永久卡在旧版本（且静默）。
// 现在改成逐条 add + 单条 catch：个别资源取不到只打印警告，其余照常入缓存、
// install 照常完成。发布前的对账（pack_deploy.py 第四项自检 + akp_lint.py 第五项）
// 仍然是第一道防线，这里只是纵深防御。
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(ASSETS.map((url) =>
        cache.add(url).catch((e) => {
          console.warn('[SW] 预缓存失败（其余照常，不影响本次安装）:', url, e && e.message);
          return null;
        })
      ));
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
