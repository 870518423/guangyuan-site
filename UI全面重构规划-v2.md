# 明日方舟风格 UI 全面重构规划（v2）

> **性质**：本文档只做规划，不含任何已执行的改动。
> **范围**：仅 `明日方舟风格测试/` 目录，原 `game-resource-forecast/` 不动。
> **与 v1 的关系**：v1（`UI升级计划.md`）= 「换肤阶段」，皮肤层已全部落地；v2 = 「交互与动效深度阶段」，在换肤基础上把交互质感对齐官网标准。
> **参照**：明日方舟官网 `ak.hypergryph.com` 与终末地官网 `endfield.hypergryph.com` 的官方设计语言。

---

## 一、现状分析

### 1.1 站点结构

| 页面 | 生成方式 | 交互复杂度 | 定位 |
|---|---|---|---|
| `index.html` | 手写 | 低 | 导航首页，3 张入口卡片 + 更新记录 |
| `calculator.html` | 手写 | **高** | 光元计算器：16 项输入、6 类算法、开关、环形图 |
| `guides.html` | `build_guides.py` ← `guide_template.html` | **高** | 132 条人间体数据、搜索、互跳、详情弹层 |
| `strategies.html` | `build_strategies.py` | 低 | 攻略列表页 |
| `strategy-xiulian.html` | `build_strategies.py` | 中 | 修炼数值表，多区块折叠 |
| `strategy-dati.html` | `build_strategies.py` | 中 | 140 题答题库，逐题展开 |
| `service-worker.js` | — | — | 缓存名 `guangyuan-ak-test-v1`（与主站隔离） |
| `pack_deploy.py` | — | — | 打包 `deploy.zip` 上传 EdgeOne |

### 1.2 已落地资产（v1 成果，全部在位且全站接线）

| 资产 | 内容 | 状态 |
|---|---|---|
| `assets/ak/ak-theme.css` | 设计令牌（钢灰+琥珀色板、时长、缓动、等宽字体）+ 旧变量重映射 + 控件直角化 | ✅ 8 页全部引入 |
| `assets/ak/ak-motion.css` | 涟漪 / 进场 / 扫描线 / 骨架 shimmer / 进度条 / 四角括号 / 弹层 pop / grid 折叠 keyframes | ✅ 8 页全部引入 |
| `assets/ak/ripple.js` | 事件委托涟漪（pointerdown、passive、reduced-motion 直退） | ✅ 全站 |
| `assets/ak/transitions.js` | ① startViewTransition 站内跳转 ② rect+rAF 错峰入场（避开 IO 首屏白屏坑）③ MutationObserver 兜数据重渲染 | ✅ 全站 |
| `assets/ak/progress.js` | 顶部 2px 进度条（8% 起步、随机爬到 88%、done 后 420ms 消失） | ✅ 全站 |
| 卡片体系 | `.ak-corners` 四角括号、悬停描边变色 + 左侧琥珀线 scaleY 生长、无上浮无阴影 | ✅ index / guides / strategies |
| 弹层 | guides modal 用 `ak-pop`（fade + scale .96→1，220ms） | ✅ |
| 答题库展开 | 答案区 `ak-in` 160ms 淡入 + 箭头 rotate 180° | ✅（仅展开方向） |
| 无障碍 | `prefers-reduced-motion` 全局关停 + `.ak-js` 根类防 JS 失效白屏 + 3 秒兜底 + `<noscript>` | ✅ |

### 1.3 差距清单（对照官网逐项审计的结果，v2 要解决的）

| # | 差距 | 现状证据 | 官网对照 |
|---|---|---|---|
| G1 | **页面切换无专属动画**：`transitions.js` 调了 `startViewTransition()`，但全目录搜不到任何 `::view-transition-old/new` CSS 规则 → 实际效果是浏览器默认淡入淡出，非方舟语言 | `grep view-transition` 全目录 0 命中 | 官网板块切换有明确的「旧页上移淡出 → 新页下移淡入 + 黑色擦除」 |
| G2 | **主按钮无悬停填充反转**：官网按钮的标志性交互是黑白反转填充块滑入，当前按钮只有描边变色 | `ak-theme.css` §6 | 官网 VIEW MORE / 导航按钮均为填充反转 |
| G3 | **开关仍是 iOS 胶囊**：`border-radius:22px`、圆形滑块，与全站直角语言冲突 | `calculator.html` L246-273 | 方舟基建开关为直角块状 + 琥珀激活 |
| G4 | **修炼表折叠硬切**：`.blk.folded .grp { display:none }`，无任何过渡 | `strategy-xiulian.html` L90 | 官网手风琴均为平滑展开 |
| G5 | **答题库只动画「开」不动画「关」**：`.qa` 用 display 切换，关闭瞬间消失 | `strategy-dati.html` L114-118 | — |
| G6 | **环形图无进场动画**：`stroke-dashoffset` 是静态赋值 | `calculator.html` L1701 | 终末地官网数据图表均有描绘动画 |
| G7 | **骨架屏零使用**：`.ak-skel` 类定义了但全站没有任何页面用它 | `grep ak-skel *.html` 0 命中 | 官网加载干员/图库时有占位 |
| G8 | **数字无滚动反馈**：计算结果、总数直接跳变 | calculator/grands | 终末地官网数字计数器递增 |
| G9 | **modal 只动画「开」**：关闭时 `classList.remove('on')` 瞬移消失 | `guides.html` L566 | — |
| G10 | **悬停微动效不完整**：卡片描边 ✅、箭头位移仅 index 有；图标 scale、chip 边框、链接下划线滑入均缺失 | 各页抽查 | 官网导航项 hover 有下划线滑入 + 文字变琥珀 |
| G11 | **无中英双语标签 / 编号系统**：官网的「大英文装饰字 + 小中文」与 01/03 编号是辨识度核心，全站没有 | 各页 | 官网全局；终末地 Si // 01 |

---

## 二、目标设计语言（两官网提炼 → 本站准则）

### 2.1 明日方舟官网（ak.hypergryph.com）取什么

- **黑白高对比 + 琥珀警示色**：底色近黑钢灰，按钮/强调用黑白反转与琥珀 `#ffb300`，红色仅留给错误态；
- **几何**：几乎无圆角、切角卡片、四角括号、1px 描边分层（v1 已建，保持）；
- **按钮交互范式**：hover 时**填充块从左滑入、文字颜色反转**（黑底白字 → 白底黑字），active 轻缩；
- **排印**：中英双语标签（英文大写装饰 + 中文小字）、等宽编号、tabular 数字；
- **动效气质**：短、脆、机械，无弹跳无花哨（v1 已定，保持）。

### 2.2 终末地官网（endfield.hypergryph.com）取什么

- **编号系统**：`Si // 01`、`01 / 35` 式的等宽编号贯穿卡片与轮播 → 本站给导航卡片、攻略板块、答题题号统一编号语言；
- **更柔的叙事过渡**：板块级切换允许比按钮更长的时长（320–480ms）、更平缓的 ease-out，体现「工业但丝滑」；
- **数据可视化动效**：图表描绘（draw-in）、数字递增计数；
- **浅色克制**：终末地整体更亮更留白 → 本站不换浅色底（主站是深色工具站），但吸收其「留白 + 大字距 + 细分隔线」的克制感。

### 2.3 合成准则（v2 全程守则）

1. 按钮级反馈 ≤220ms，板块级过渡 320–480ms，装饰循环 ≥1200ms —— 三档分明不混淆；
2. 悬停永远「描边 / 填充 / 位移 ≤3px」三选一或组合，**禁止上浮 + 阴影**（v1 铁律延续）；
3. 所有新动效必须同时提供：`prefers-reduced-motion` 关停、无 JS 降级、关闭方向动画；
4. 每页新增装饰元素（双语标签、编号、括号）≤2 类，克制优先。

---

## 三、动效规范与具体参数

> 缓动沿用 v1 令牌：`--ease: cubic-bezier(.4,0,.2,1)`、`--ease-out: cubic-bezier(0,0,.2,1)`、`--ease-in: cubic-bezier(.4,0,1,1)`。

### 3.1 按钮点击：涟漪 + 缩放（场景①）

| 子项 | 现状 | 目标参数 | 改动点 |
|---|---|---|---|
| 按下缩放 | `scale(.96)` 100ms ✅ | **保持**：`scale(.96)`，`100ms / var(--ease)` | 无 |
| 松开回弹 | 依赖同一 transition | 显式 `160ms / var(--ease-out)` 回到 `scale(1)` | ak-theme.css §6 拆分 active→hover 时序 |
| 涟漪 | 600ms ✅ | **保持**：`scale(0)→2.5`、`opacity .32→0`、`600ms / --ease-out`，`animationend` 自移除 | 无（已达标） |
| 按下色变 | 背景→`--ak-bg-3` 120ms ✅ | 保持 | 无 |
| **新增：主按钮填充反转** | 无 | hover 时 `::before` 白色填充块 `scaleX(0)→1`（`transform-origin:left`），`220ms / var(--ease-out)`；文字同步 `color: var(--ak-bg-0)` `160ms`；active 时填充块瞬时满格 + `scale(.97)`；离开 hover 填充块 `scaleX(1)→0`（`transform-origin:right`，方向感：从哪来回哪去）`180ms / --ease-in` | 新增 `.ak-btn-solid` 组件类，用于「开始计算」「显示全部」等每页 ≤1 个主按钮 |

### 3.2 页面切换平滑过渡（场景②）

| 子项 | 现状 | 目标参数 |
|---|---|---|
| 旧页退出 | 无规则（浏览器默认交叉淡入淡出） | `::view-transition-old(root)`：`opacity 1→0` + `translateY(0→-8px)`，**180ms / var(--ease-in)** |
| 新页进入 | 同上 | `::view-transition-new(root)`：`opacity 0→1` + `translateY(12px→0)`，**320ms / var(--ease-out)** |
| 切换扫描线 | 无 | 切换瞬间页面顶部 2px 琥珀线 `scaleX(0)→1` 横扫一次，`320ms / --ease-out`，`z-index:10000`，`animationend` 移除（JS 已有 startViewTransition 钩子，在回调里注入即可） |
| 降级链 | body.page-in ✅ | 保持：不支持 view-transition 的浏览器走 `body.page-in`（ak-in 320ms）；再不济无 JS 直接显示 |
| 时机 | ✅ 已拦截同源链接 | 保持（transitions.js §1 不动） |

**实现要点**：规则写入 `ak-motion.css`，需包 `@supports (view-transition-name: none)`；`::view-transition-old/new` 不能被 `prefers-reduced-motion` 全局规则命中（伪元素根外层），需单独补一条 reduce 时改 0.001ms。

### 3.3 悬停微动效（场景③）

| 对象 | 触发 | 具体参数 | 现状 |
|---|---|---|---|
| 入口/数据卡片 | hover | 描边 `--ak-line→--ak-line-2` `220ms`；左侧琥珀线 `scaleY(.3→1)` `220ms / --ease-out`；四角括号同帧变琥珀 | ✅ 已有，保持 |
| 卡片内图标 | hover 父卡片 | `scale(1.08)`，`180ms / var(--ease)` | ❌ 新增 |
| 「→」箭头 | hover 父卡片 | `translateX(0→3px)` + `opacity .5→1`，`180ms` | 仅 index 有，推广到 strategies/guides |
| chip / 标签 | 单独 hover | `border-color → var(--ak-accent)` + `color → --ak-accent`，`160ms` | ❌ 新增 |
| 文字链接 | hover | 下划线 `scaleX(0→1)`（`transform-origin:left`），`160ms / --ease-out`，替代当前的 dashed border 直接变色 | ❌ 新增 |
| 输入框 | focus | 描边→琥珀 + 背景→`--ak-bg-3`，`220ms` | ✅ 已有 |
| 表格行（修炼表） | hover | `background → --ak-bg-2`，`160ms` | ❌ 新增 |

**移动端纪律**：所有 hover 类动效包在 `@media (hover: hover) and (pointer: fine)` 内，触屏不触发（避免「粘滞悬停」）。

### 3.4 加载状态：骨架屏 + 进度指示（场景④）

| 场景 | 方案 | 具体参数 |
|---|---|---|
| **guides 132 卡首次渲染** | 渲染前先铺 **12 张骨架卡**（与真实卡同尺寸网格，`.ak-skel` shimmer：高光带 `translateX(-100%→100%)`，`1200ms / linear` 无限循环）；数据就绪后骨架整层 `opacity 1→0` `180ms` 淡出、真实卡片按既有 stagger 进场 | 骨架结构由内联 JS 生成（约 15 行），不进 HTML |
| **calculator 点击计算后** | 结果区先出 3 行骨架行（shimmer 同上），`≥120ms` 且数据就绪后交换；避免「点了没反应」 | 交换时结果行 `opacity 0→1` + `translateY(4px→0)`，`160ms / --ease-out` |
| **环形图** | `stroke-dasharray` 不变，`stroke-dashoffset` 从「满周长」过渡到目标值：`800ms / var(--ease-out)`；分段之间天然形成顺时针描绘感 | `transition: stroke-dashoffset 800ms var(--ease-out)`，赋值前强制 reflow |
| **顶部进度条** | 保持现有实现（8%→随机爬升至 88%→done 100%→420ms 淡出） | ✅ 已达标；仅需把 guides/dati 的「解析前 start / 渲染完 done」接线核实一遍 |
| **图片（阵营图标等）** | `loading="lazy"` + onload 后 `opacity 0→1` `320ms / --ease-out` | ❌ 新增 |
| **数字滚动** | `grand-total`、环形图中心值：rAF 递增，`600ms / ease-out`，从旧值到新值；首次从 0 起 | ❌ 新增 `counter.js`（约 30 行） |

### 3.5 专项交互参数

| 专项 | 现状 | 目标参数 |
|---|---|---|
| **toggle 开关（计算器）** | iOS 胶囊 22px 圆角 | 轨道 `40×22`、`border-radius: 2px`、1px `--ak-line-2` 描边；滑块 `14×14` 方块、`border-radius: 1px`；滑块位移 `translateX(0→18px)` **`180ms / var(--ease)`**；激活轨道填充 `--ak-accent`、滑块变 `--ak-bg-0`（色块反转），`160ms`；关闭态轨道 `--ak-bg-2`、滑块 `--ak-text-mute` |
| **修炼表区块折叠** | `display:none` 硬切 | 改 `grid-template-rows: 0fr↔1fr` + 内层 `overflow:hidden; min-height:0`（ak-motion.css 已有 `.ak-fold` 工具类，**接上即可**）；**`320ms / var(--ease)`**；三角箭头 `rotate(0↔-90deg)` `220ms`；展开时内部 `.grp` 行按 `20ms/行` stagger 淡入（已有 `ak-in`，保留） |
| **答题库逐题展开** | 开=ak-in 160ms ✅；关=瞬间消失 | `.qa` 同样改 grid 折叠方案，**开 `220ms / --ease-out`、关 `160ms / --ease-in`**；箭头 rotate 保持 180ms |
| **guides modal** | 开=ak-pop 220ms ✅；关=瞬移 | 关闭：先加 `.closing`（`opacity 1→0` + `scale(1→.97)`，`160ms / --ease-in`），`animationend` 后再 `remove('on')` 惯性隐藏；背景遮罩同步 fade `160ms` |
| **搜索结果重渲染** | 直接替换 | 输入防抖 120ms 后，结果容器整体 `opacity .4→1` `120ms` 提示刷新（不重放全列表 stagger，transitions.js 已有防重放逻辑，保持） |

---

## 四、涉及文件清单

### 4.1 新增（2 个）

| 文件 | 内容 | 预估行数 |
|---|---|---|
| `assets/ak/ak-components.css` | v2 组件层：`.ak-btn-solid` 填充反转按钮、`.ak-toggle` 直角开关、双语标签 `.ak-label-en`、编号 `.ak-no`、链接下划线滑入、表格行 hover、骨架卡模板样式 | ~120 |
| `assets/ak/counter.js` | rAF 数字递增工具（含 reduced-motion 直赋终值） | ~30 |

（骨架卡生成逻辑很短，直接内联进 guides 的渲染脚本，不单独开文件。）

### 4.2 修改（8 个）

| 文件 | 改动内容 | 量级 |
|---|---|---|
| `assets/ak/ak-motion.css` | ① 补 `::view-transition-old/new` 规则（含 @supports 与 reduce 特判）② `.ak-fold` 补关闭方向时序 ③ `.ak-pop` 补 `.closing` 关闭态 | 中 |
| `assets/ak/ak-theme.css` | hover 微动效集中层：图标 scale、箭头位移、chip 琥珀边、链接下划线（全部包 `hover:hover` media query） | 中 |
| `index.html` | 主按钮（页脚作者链接不算，导航卡「进入」已是卡片整体）无需大改；补卡片内图标 hover、更新记录年份编号化 | 小 |
| `calculator.html` | toggle 直角化覆盖、结果区骨架、环形图描绘动画、数字递增、表单行 hover | **大** |
| `guide_template.html` | 骨架卡渲染、图片淡入、modal 关闭动画、搜索防抖淡入 | 中 |
| `build_strategies.py` | 三个模板注入：修炼/dati 折叠改 grid 方案（模板 HTML 结构调整 + 内联 JS 两行）、双语标题与编号标签、`ak-components.css` 引用；改完重跑生成三页 | 中 |
| `service-worker.js` | `ASSETS` 增 2 个新文件；缓存名 `guangyuan-ak-test-v1 → guangyuan-ak-test-v2` | 小 |
| `pack_deploy.py` | `items` 增 `assets/ak/ak-components.css`、`assets/ak/counter.js` | 小 |

### 4.3 不动

- 数据源（Excel、`sources/*.md`）、`build_guides.py` 的数据逻辑、`manifest.json`、`assets/factions/*` 等图片资源、`ripple.js` / `transitions.js` / `progress.js`（三个 JS 已达标，v2 不碰）。

---

## 五、改动顺序与分阶段实施方案

> 编号 P 系列与 v1 的 M 系列区分。每阶段独立可验收、可单独上线（打一个 deploy.zip 验证一次）。原则：**先全局 CSS 后页面专项，先低成本高收益后重交互**。

### P0 — 页面切换 + 关闭方向动画（纯 CSS 层，~0.5 天，收益最大）

1. `ak-motion.css` 补 `::view-transition-old/new` + 顶部扫描线 keyframes；
2. `.ak-pop` 补 `.closing`；guides modal 的 JS 关闭函数加一行（延迟 remove）；
3. 答题库 `.qa` 关闭方向：先仅加 CSS（display 换 grid 需要模板改动，留 P3）。
- **验收**：任一页跳转能看到「旧页上移淡出→新页下移淡入+顶部琥珀扫描」；modal 关闭有收缩淡出。

### P1 — 悬停微动效全站补齐（~0.5 天）

1. `ak-theme.css` 集中加 hover 层（图标/箭头/chip/链接下划线/表行）；
2. `index.html`、`build_strategies.py` 模板补齐箭头与图标结构类名。
- **验收**：鼠标划过任何可点元素 300ms 内必有且只有一种「描边/填充/位移」反馈；触屏设备无粘滞悬停。

### P2 — 按钮体系 + 开关（~1 天）

1. 新建 `ak-components.css`：`.ak-btn-solid` 填充反转按钮；
2. calculator 的「计算」、答题库「显示全部/隐藏全部」升级为主按钮；
3. calculator toggle 胶囊→直角块（纯 CSS 覆盖，不动 HTML 结构）。
- **验收**：主按钮悬停有黑白反转填充滑入；开关动画干脆无回弹；开关在暗色下激活态一眼可辨。

### P3 — 折叠体系（修炼表 + 答题库，~1 天）

1. `build_strategies.py` 中 TPL_XIULIAN / TPL_DATI 的折叠结构改 `grid-template-rows`（HTML 结构 + 类名调整）；
2. 重跑 `生成攻略板块.bat`，回读三页验证生成正确。
- **验收**：修炼表区块开合平滑无跳变；答题库单题开合双向有动画；「显示全部」批量展开每题错峰 ≤8ms 不卡顿。

### P4 — 计算器数据反馈（~1 天）

1. 环形图 `stroke-dashoffset` 描绘动画；
2. `counter.js` 数字递增（grand-total、环形图中心值）；
3. 结果区骨架行（点击计算 → ≥120ms 骨架 → 结果淡入）。
- **验收**：点计算后 100ms 内有视觉反馈；数值滚动 600ms 内完成且可被连续点击打断重置；环形图顺时针描绘 800ms。

### P5 — 骨架屏 + 双语标签收尾（~1 天）

1. guides 首屏 12 张骨架卡 + 图片 lazy 淡入；
2. 各页标题补英文小标签（如「光元收益预测器 / FORECAST TERMINAL」）与编号（卡片 01/03、板块编号）；
3. `service-worker.js` 升 `ak-test-v2`、`pack_deploy.py` 增新文件；全站联调（132 卡 stagger + 骨架 + 搜索组合场景）。
- **验收**：见下节总验收。

> 总投入约 4–5 个工作日。P0/P1 是纯 CSS 低风险高感知，优先做；P2–P4 每项独立，可按兴致调整顺序；P5 必须最后（收尾 + 缓存版本）。

---

## 六、验收要点

### 6.1 功能性验收（每阶段过一遍）

- [ ] 所有原有功能回归：计算、搜索、互跳、折叠、弹层、PWA 离线缓存不受影响；
- [ ] 连续快速操作（连点计算、连开连关折叠、搜索时狂敲键盘）无动画卡死、无 DOM 泄漏（涟漪 span / 骨架节点均自清理）；
- [ ] `service-worker.js` 新版本号生效：老缓存自动清、新文件（ak-components.css / counter.js）离线可用。

### 6.2 动效审美验收（对照官网的「尺子」）

- [ ] **按钮**：按下 0.96 缩放 + 点击点涟漪；主按钮悬停填充反转滑入（方向感：左进右出）；全站无一处弹跳曲线；
- [ ] **切换**：页面跳转 = 旧页上移淡出(180ms) + 新页下移淡入(320ms) + 顶部扫描线一次；时长比符合「退出快于进入」；
- [ ] **悬停**：反馈在 300ms 内出现、≤3px 位移、无上浮无阴影；同一元素不叠加两种以上动效；
- [ ] **加载**：任何 >100ms 的等待都有占位或进度；骨架屏尺寸与真实内容一致（无布局跳动 CLS）；环形图描绘顺时针、数字递增单调不回跳；
- [ ] **气质抽检**：随机截图任意一页，满足——圆角 ≤4px、只有琥珀/橙/钢灰+语义色、等宽数字、直角开关、无彩虹无渐变无 emoji 图标。

### 6.3 性能验收

- [ ] DevTools Performance 录制 guides 滚动 + calculator 计算：无长任务 >50ms 由动画引起；动画全部走 transform/opacity（无 layout 属性过渡）；
- [ ] 132 卡页面在「骨架→stagger→搜索重渲染」组合操作下保持可交互（主线程阻塞 <100ms）；
- [ ] 中端安卓（或 DevTools 4x CPU 节流）下动画无肉眼掉帧。

### 6.4 降级验收

- [ ] 系统开「减少动态」：所有新动效静止，功能完整（涟漪/填充反转/骨架 shimmer/数字滚动直赋终值）；
- [ ] 禁用 JS：内容全部可见（`.ak-js` 兜底机制对新增骨架同样成立——骨架由 JS 生成，无 JS 时根本不会出现，天然安全）；
- [ ] 不支持 view-transition / grid-template-rows 折叠的旧浏览器：分别退到 page-in 淡入、瞬时开合，不白屏不错位。

### 6.5 移动端验收

- [ ] 触屏无粘滞悬停；涟漪不影响滚动（passive 保持）；
- [ ] 320px 窄屏：直角开关、填充反转按钮、骨架卡均不错位；
- [ ] APK WebView（Capacitor）内抽查 calculator 与 guides 各一遍。

---

## 七、风险与预案

| 风险 | 预案 |
|---|---|
| `::view-transition` 伪元素不被 reduce 全局规则覆盖 | 在 ak-motion.css 内单独写一条 reduce 特判，P0 验收必测 |
| grid 折叠在旧 WebView（APK 内核）不支持 | `@supports (grid-template-rows: 0fr)` 包裹过渡，不支持则回退 display 硬切（现状无损） |
| 骨架卡与真实卡尺寸不一致导致跳动 | 骨架卡直接复用真实卡的 class + `aria-hidden`，只换内容为 shimmer 块 |
| 数字递增与连续点击竞态 | counter.js 每次启动先 cancel 上一个 rAF，直赋终值兜底 |
| 填充反转按钮在移动端无 hover | 移动端主按钮常显填充态（`hover:none` media query 下直接实心），不依赖 hover 才能识别 |
| 生成器改动后忘记重跑 | P3/P5 完成后必须执行 `生成攻略板块.bat` / `生成攻略页.bat` 并回读 HTML 抽查关键类名存在 |
| SW 缓存版本遗漏 | P5 清单里最后一项，打包 deploy.zip 前核对 `CACHE_NAME` 与 `ASSETS` 列表 |

---

*规划完。经确认后按 P0→P5 顺序逐阶段实施，每阶段产出后可用无头 Chrome 截图（`--virtual-time-budget ≥ 8000`）+ 真机抽查验收。*
