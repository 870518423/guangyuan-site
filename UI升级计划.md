# 明日方舟风格 UI 升级计划

> 范围：仅作用于本目录（`明日方舟风格测试/`），原 `game-resource-forecast/` 不动一行。  
> 目标：在不破坏现有功能与数据结构的前提下，把站点的视觉与交互升级到「明日方舟式」的工业 / HUD 审美。  
> 原则：渐进增强——所有动效都有「无动画」降级，老设备 / `prefers-reduced-motion` 自动回退到纯样式。

---

## 一、设计语言提炼（向明日方舟学什么）

明日方舟 UI 的辨识度来自四件事，升级时要全程守住：

| 维度 | 它做的事                     | 我们要落地的事                                                      |
| -- | ------------------------ | ------------------------------------------------------------ |
| 几何 | 几乎不用圆角，边角锋利，卡片带切角 / 角点括号 | 圆角统一收到 ≤2px，给主卡片加四角括号装饰                                      |
| 字体 | 正文无衬线、数据等宽、编号 tabular    | 数值 / 计数 / 题号统一 `font-variant-numeric: tabular-nums` + 等宽     |
| 动效 | 短、脆、机械感；不弹跳、不花哨          | 时长 100–320ms，缓动一律 `cubic-bezier(0.4,0,0.2,1)`，禁用 back/bounce |
| 层级 | 用色块、描边、扫描线分层，少用阴影        | 去弥散阴影，改用 1px 描边 + accent 色扫描线分层                              |

**禁止项**（容易跑偏成"游戏风但不像方舟"）：

- 不用渐变背景、不用发光描边做主装饰、不用 emoji 当图标；
- 悬停不靠"上浮 + 大阴影"，而靠"描边变色 + accent 线滑入"；
- 涟漪不用彩色光晕，用低不透明白色（终端点击感）。

---

## 二、设计令牌（一次性写入 `assets/ak/ak-theme.css`，全站复用）

```css
:root {
  /* —— 背景与表面（深空钢灰，非纯黑）—— */
  --ak-bg-0: #0c0d11;   /* 页面底色 */
  --ak-bg-1: #14161c;   /* 主卡片 */
  --ak-bg-2: #1c1f27;   /* 次级表面 / 输入框 */
  --ak-bg-3: #252934;   /* 悬停表面 */

  /* —— 线条 —— */
  --ak-line:   #2a2e38;  /* 默认描边 */
  --ak-line-2: #3a3f4d;  /* 强调描边 / 悬停 */

  /* —— 文字 —— */
  --ak-text:     #e7e5e2;  /* 主 */
  --ak-text-dim: #9a988f;  /* 次 */
  --ak-text-mute:#6b6a64;  /* 弱 */

  /* —— 强调色（方舟琥珀系，非彩虹）—— */
  --ak-accent:   #ffb300;  /* 主强调 - 琥珀 */
  --ak-accent-2: #ff7a18;  /* 次强调 - 橙（按压 / 激活）*/
  --ak-warn:     #ff4d4d;
  --ak-info:     #2ec5b6;
  --ak-ok:       #7ed957;

  /* —— 几何 —— */
  --ak-radius: 2px;        /* 几乎直角 */
  --ak-radius-lg: 4px;     /* 仅大容器 */

  /* —— 动效时长 —— */
  --dur-press: 100ms;   /* 按下 */
  --dur-fast:   160ms;  /* 颜 / 边 */
  --dur-base:   220ms;  /* 标准过渡 */
  --dur-slow:   320ms;  /* 进场 / 切换 */
  --dur-decor: 1200ms;  /* 装饰循环（扫描 / 骨架）*/

  /* —— 缓动（机械感，唯一曲线）—— */
  --ease:      cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out:  cubic-bezier(0.0, 0, 0.2, 1);
  --ease-in:   cubic-bezier(0.4, 0, 1, 1);
}

/* 全站降级：用户开了「减少动态」就关掉一切非必要动画 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 三、通用动效库（6 类，含具体参数与实现）

### 3.1 按钮点击：涟漪 + 缩放

- 缩放：`active` 态 `transform: scale(0.96)`，`100ms / var(--ease)`；松开回弹 `160ms`。
- 涟漪：点击点注入 `<span class="ak-ripple">`，从 `scale(0)` 扩到 `2.5`，`opacity 0.35 → 0`，`600ms / ease-out`，一次后移除。
- 颜色：按下时背景向 `--ak-bg-3` 过渡 `120ms`。

```css
.ak-btn {
  position: relative; overflow: hidden;
  transition: transform var(--dur-press) var(--ease),
              background var(--dur-fast) var(--ease),
              border-color var(--dur-fast) var(--ease);
}
.ak-btn:active { transform: scale(0.96); background: var(--ak-bg-3); }
.ak-ripple {
  position: absolute; border-radius: 50%;
  background: rgba(255,255,255,0.35);
  pointer-events: none; transform: scale(0);
  animation: ak-ripple 600ms var(--ease-out) forwards;
}
@keyframes ak-ripple {
  to { transform: scale(2.5); opacity: 0; }
}
```

```js
// assets/ak/ripple.js —— 全站一次注入
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-ripple], .ak-btn, button, a.entry, a.card');
  if (!el || el.dataset.ripple === 'off') return;
  const r = el.getBoundingClientRect();
  const s = document.createElement('span');
  s.className = 'ak-ripple';
  const size = Math.max(r.width, r.height) * 1.1;
  s.style.width = s.style.height = size + 'px';
  s.style.left = (e.clientX - r.left - size / 2) + 'px';
  s.style.top  = (e.clientY - r.top  - size / 2) + 'px';
  el.appendChild(s);
  s.addEventListener('animationend', () => s.remove());
}, { passive: true });
```

### 3.2 页面 / 卡片进场：fade + slide，stagger

- 单元素：`opacity 0→1` + `translateY(12px→0)`，`320ms / ease-out`。
- 列表 stagger：第 N 项延迟 `min(N*40, 320)ms`，避免长列表等太久。
- 触发：`IntersectionObserver` 进入视口加 `.ak-in` 类；首屏直接加，不等待滚动。

```css
.ak-enter { opacity: 0; transform: translateY(12px); }
.ak-enter.ak-in { opacity: 1; transform: none;
  transition: opacity var(--dur-slow) var(--ease-out),
              transform var(--dur-slow) var(--ease-out); }
```

### 3.3 悬停微动效（方舟式：不靠阴影，靠描边 + accent 线）

- 卡片：`border-color` `--ak-line → --ak-line-2`，`220ms`；左侧 accent 条从 `width:0` 滑到 `3px`，`220ms / ease-out`；不抬升（不 `translateY`），保持工业感。
- 标题图标：`transform scale(1.08)`，`180ms`。
- 右上角箭头：`translateX(0 → 3px)` + `opacity 0.5 → 1`，`180ms`。
- 次要文字：`opacity 0.7 → 1`，`160ms`。

```css
.ak-card { border-left: 0 solid transparent;
  transition: border-color var(--dur-base) var(--ease); }
.ak-card:hover { border-color: var(--ak-line-2); }
.ak-card:hover::before { /* 左侧 accent 滑入 */
  content: ''; position: absolute; left: 0; top: 12%; bottom: 12%;
  width: 3px; background: var(--ak-accent);
  animation: ak-slide-y 220ms var(--ease-out);
}
@keyframes ak-slide-y { from { transform: scaleY(0); } to { transform: scaleY(1); } }
```

### 3.4 加载：骨架屏 + 顶部进度条

- 骨架屏：占位块 `linear-gradient` shimmer，`1200ms` 循环，方向左→右。

```css
.ak-skel {
  background: linear-gradient(90deg,
    var(--ak-bg-2) 0%, var(--ak-bg-3) 50%, var(--ak-bg-2) 100%);
  background-size: 200% 100%;
  animation: ak-shimmer var(--dur-decor) infinite linear;
}
@keyframes ak-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
```

- 顶部进度条：`fixed` 顶部 `2px` 高，`width 0→90%`（数据未到）→`100%`（完成）后淡出；带一条 accent 色扫描高光。

```css
#ak-progress { position: fixed; top: 0; left: 0; height: 2px; width: 0;
  background: var(--ak-accent); z-index: 9999; opacity: 0.9;
  transition: width var(--dur-slow) var(--ease), opacity var(--dur-fast) var(--ease); }
#ak-progress.done { width: 100%; opacity: 0; }
```

- 触发：guides / strategy-dati 等数据驱动页，在 `<script>` 渲染前 `progress=30%`，渲染完 `done`。

### 3.5 页面切换过渡（轻量方案，无路由库）

- 方案：`view-transition` API（支持的浏览器）+ 降级到 `body` 进场动画。
- 进场：`fade + slide`（同 3.2）。
- 不引入 SPA 框架，保留多 HTML 结构；切页时给 `<body>` 加 `.page-in`。

```css
@supports (view-transition-name: none) {
  ::view-transition-old(root) { animation: ak-out 200ms var(--ease-in) forwards; }
  ::view-transition-new(root) { animation: ak-in 320ms var(--ease-out); }
  @keyframes ak-out { to { opacity: 0; transform: translateY(-8px); } }
  @keyframes ak-in  { from { opacity: 0; transform: translateY(12px); } }
}
body.page-in { animation: ak-in 320ms var(--ease-out); }
```

```js
// assets/ak/transitions.js
if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    document.startViewTransition(() => {
      location.href = a.href;
    });
  });
} else {
  document.body.classList.add('page-in');
}
```

### 3.6 方舟特色装饰（克制使用，每页 ≤2 处）

- **四角括号**：主卡片四角各一个 10×10 的 L 形 1px 线，`--ak-line-2` 色，悬停变 accent。
- **扫描线**：大标题下方一条 2px accent 线，`scaleX(0→1)` `320ms / ease-out` 进场一次。
- **终端分割线**：`1px solid --ak-line`，中间嵌一个 4×4 实心方块节点（accent 色）。
- **数据角标**：右上角用等宽字体显示编号（如 `01 / 03`），`--ak-text-mute`。

---

## 四、各页面改动清单

### 4.1 `index.html`（导航页）

- 引入 `ak-theme.css` + `ripple.js` + `transitions.js`。
- 三张卡片改 `.ak-card`：去圆角到 `2px`，加四角括号，悬停按 3.3。
- header 标题下加扫描线（3.6）；副标题改等宽 tabular。
- 阵营计数已删（本轮无）；页脚作者链接改 `.ak-btn` 样式 + 涟漪。
- 更新记录列表逐条 stagger 进场（3.2），`time` 改等宽 + accent。
- 进场动画：首屏卡片 + 更新记录按 `40ms` stagger。

### 4.2 `calculator.html`（计算器，交互最重）

- 输入框：聚焦 `border-color → --ak-accent`，`220ms`，无阴影改用 `inset` 描边。
- 氪金 / 算法开关：改 `.ak-toggle`（直角块状，激活填 accent 色，过渡 `160ms`）。
- 计算按钮：`.ak-btn` + 涟漪（3.1）。
- 结果区：数值 tabular-nums；首次渲染用骨架屏（3.4）占位 600ms 内。
- 收益占比环形图：进场 `stroke-dashoffset` 从满到目标，`800ms / ease-out`。
- 顶部加 `#ak-progress` 进度条，数据计算时显示。

### 4.3 `guides.html`（人间体大全，数据量大）

- 数据由 `build_guides.py` 生成，**只改模板 `guide_template.html` 与内联脚本**，不动数据结构。
- 卡片网格进场 stagger（3.2），但**首屏只 stagger 前 12 张**，其余用 IO 滚动触发（避免 132 张全 stagger 卡顿）。
- 详情弹层：打开 `fade + scale(0.96→1)` `220ms`，背景 `backdrop-filter: blur(2px)`。
- 标签：人间体名 `.ak-tag`（直角、悬停 accent 边）；角色卡标签加角标 `CARD`（等宽小字）。
- 搜索框：聚焦 accent 描边；输入时结果用 `opacity` 淡入 `120ms`，不重排闪烁。
- 顶部 `#ak-progress`：JSON 解析前 30% → 渲染完 done。

### 4.4 `strategies.html`（攻略列表）

- 卡片改 `.ak-card`，标签区分类显示：`cat` 标签（修炼 / 答题）用 accent 描边块，普通标签用 `--ak-line` 块。
- 搜索框同 guides。
- 卡片进场 stagger。

### 4.5 `strategy-xiulian.html`（修炼数值表）

- 折叠块 `h2` 点击：展开 `max-height` 过渡 `320ms`（注意：max-height 过渡需预估上限值，或改用 `grid-template-rows: 0fr → 1fr` 现代方案，更平滑）。
- 数值格子 `.v`：进场按行 stagger `20ms`，`opacity + translateY(4px)`。
- 「6级」金色保留，但改等宽字体。

### 4.6 `strategy-dati.html`（答题库）

- 题目展开：`max-height` 或 `grid-template-rows` 过渡 `220ms`；箭头 `rotate(180deg)`。
- 答案显隐：`opacity + max-height`，`180ms`。
- 「显示全部 / 隐藏全部」按钮：`.ak-btn` + 涟漪，操作时每条 `stagger 8ms` 依次展开（视觉很爽，但限 140 题内可控）。
- 搜索结果：`opacity` 淡入。

---

## 五、涉及文件清单

### 新增（全部放 `assets/ak/`，与原图标资产分离）

| 文件                         | 作用                            |
| -------------------------- | ----------------------------- |
| `assets/ak/ak-theme.css`   | 设计令牌 + 通用组件类 + 降级 media query |
| `assets/ak/ak-motion.css`  | 6 类动效 keyframes 与工具类          |
| `assets/ak/ripple.js`      | 全局点击涟漪（~30 行）                 |
| `assets/ak/transitions.js` | 页面切换 + 进场触发（~40 行）            |
| `assets/ak/progress.js`    | 顶部进度条控制器（~20 行）               |

### 修改（在副本内，逐页加 `<link>` / `<script>` 与 class 改造）

| 文件                      | 改动量                                        | 备注                                            |
| ----------------------- | ------------------------------------------ | --------------------------------------------- |
| `index.html`            | 中                                          | 引 3 个 css/js；卡片 / 页脚 / 更新记录改造                 |
| `calculator.html`       | 大                                          | 输入框 / 开关 / 按钮 / 结果区 / 环形图                     |
| `guide_template.html`   | 中                                          | guides.html 的模板；改后重跑 `build_guides.py`        |
| `strategies.html`       | 由 `build_strategies.py` 生成，改 `TPL_INDEX`   |                                               |
| `strategy-xiulian.html` | 由 `build_strategies.py` 生成，改 `TPL_XIULIAN` |                                               |
| `strategy-dati.html`    | 由 `build_strategies.py` 生成，改 `TPL_DATI`    |                                               |
| `build_strategies.py`   | 中                                          | 三个模板字符串注入 ak 类名与资产引用                          |
| `build_guides.py`       | 小                                          | `guide_template.html` 改完无需改 py 逻辑             |
| `service-worker.js`     | 小                                          | `ASSETS` 加 5 个新文件；版本号 `v12 → v13`（副本独立，不影响线上） |
| `pack_deploy.py`        | 小                                          | `items` 加 `assets/ak/*`                       |

### 不动

- 数据源 Excel、`sources/*.md`、`manifest.json`（图标不变）、所有 `assets/factions/*` 与 `strategy-book.png`。

---

## 六、改动顺序与里程碑

```
M0  建副本 + 本计划                ✅ 已完成
M1  写 ak-theme.css + ak-motion.css（令牌与 6 类动效，先在 index.html 验证）
M2  ripple.js + transitions.js + progress.js（三个小脚本）
M3  index.html 全量改造 → 验收基础语言
M4  calculator.html（交互最重，单独一个里程碑）
M5  guide_template.html + build_guides.py 重跑 → guides.html
M6  build_strategies.py 三个模板 → strategies / xiulian / dati 三页
M7  service-worker.js + pack_deploy.py（缓存与打包）
M8  联调：132 张卡片 stagger 性能、骨架屏时序、reduced-motion 降级
M9  验收 → 用户拍板是否合并回主目录
```


```

**为什么 M3 放最前**：导航页结构最简单，先在它上面把"设计令牌 + 动效库"跑通，确认审美方向对，再推广到重交互页，避免在 calculator 上改一半发现风格不对要返工。

**为什么 M5/M6 留到后**：生成器驱动的页面改的是模板字符串，一旦基础语言在 M3 定稿，这几页是"套用"工作，风险低、速度快。

---

## 七、风险与降级

| 风险 | 应对 |
|---|---|
| 132 张卡片全 stagger 卡顿 | 首屏只 stagger 前 12 张，其余 IntersectionObserver；低端机直接关 stagger（`ak-motion.css` 里按 `deviceMemory` 或宽度判断）|
| `view-transition` 兼容性 | 已 `@supports` 降级到 `body.page-in`；不支持的浏览器走 fade |
| `prefers-reduced-motion` 用户 | 顶部 media query 统一关停，仅保留颜色过渡 |
| 涟漪在移动端误触 | `pointerdown` + `passive`，且仅在 `pointer: fine` 设备启用 hover 类动效 |
| 副本独立 SW 版本与线上冲突 | 副本 `service-worker.js` 用 `ak-test-v1`，与主站 `v12` 隔离，互不影响 |
| `max-height` 折叠动画跳变 | 修炼表 / 答题库改用 `grid-template-rows: 0fr/1fr`（Chromium 已支持，Safari 16+ 支持）|

---

## 八、验收标准（M3 定稿时用这把尺子量）

- [ ] 卡片悬停：描边变色 + 左侧 accent 线滑入，**无上浮、无阴影**；
- [ ] 按钮按下：缩到 0.96 + 涟漪从点击点扩散，松开回弹；
- [ ] 页面进入：标题扫描线一次、卡片 fade+slide stagger；
- [ ] 数值 / 题号：等宽 + tabular-nums；
- [ ] 圆角：全站 ≤4px；
- [ ] 配色：只有琥珀 / 橙 / 钢灰 / 一两个语义色，无渐变、无彩虹；
- [ ] 开「减少动态」：上述全部静止，功能不受影响。
```
