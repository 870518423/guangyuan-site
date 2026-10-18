// Service Worker - 奥系光元工具站 PWA
//
// 取件策略（v5 起）：
//   页面（HTML）  → 网络优先，断网时回退缓存    ← 保证"改完刷新就能看到新版"
//   其它静态资源  → 缓存优先，网络回退并写入缓存 ← 保证离线可用、二次打开快
//   预缓存（v66 起）→ **内容寻址**：桶名不带版本号，install 时逐条发条件请求
//                     （If-None-Match / If-Modified-Since），只有内容真变了才下载。
//                     详见文件末 v66 注释。
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
// v35：比对口径调整（管理者 2026-10-13）——同义改写与标点差异不再算改动。
//      akp.js 的 tokenize 改为「原文 t + 比较键 c」双字段：增加↔提高、降低↔减少、
//      角色↔目标 三组同义词与标点/空白共用比较键；比较键相同即不标注，且显示
//      采用当前版本写法；新增 AKP.__diff 调试探针供 tools/akp_diff_test.js 断言。
//      passive/index.html 说明补「不算改动」一条。两者均在预缓存清单，按规矩升版。
// v36：新增 4 个角色 —— 赛罗无限形态、赛罗无限形态（超限）（上一批产出，站点此前漏同步，
//      本次补齐）、奥特之王（BY）、捷德终极形态（本批新收录，逐字转录 + 图片采集）。
//      四个数据文件与对应 img/ 全部进预缓存清单，按硬规矩升版。
// v37：阵营页品质分组（管理者 2026-10-13）—— 奥特之星页按品质分组，超越（BY）在上、
//      究极（UL）在下，每组标题即一键折叠按钮（触摸目标 44px、aria-expanded 同步）；
//      首页阵营卡描述改为「究极（UL）/超越（BY）品质奥特之星角色的被动与版本改动收录」。
//      category.html / index.html / akp-list.css 均在预缓存清单，按硬规矩升版。
// v38：超越技支持版本对比（管理者 2026-10-13）—— akp.js 的板块渲染改为 listMode：
//      超越技数据写成 entries + texts 即与被动一样按版本渲染并参与对比，旧静态写法仍兼容；
//      奥特之王（BY）与捷德终极形态的超越技已改为多版本（含 v1/v2 历史文案）。
//      akp.js 与两个数据文件均在预缓存清单，按硬规矩升版。
// v39：被动对比改用「语义分档」（管理者 2026-10-13，参照官方公告写法）：
//      不再逐字涂抹（会把句子搅成读不通的混种句），改为整块替换 + 分档标注：
//      L1 措辞调整（不标色+淡色原文小注）/ L2 数值调整（自动写「23%调整为30%」）/
//      L3 调整为/新增/移除（整块，带前半段·后半段定位）/ L4 重做（删除线老全文+橙色新全文）。
//      数据里的 diffs 支持 t:/redo/ 手工标注；三种板块共用同一引擎。akp.js/akp.css 按硬规矩升版。
// v40：L2 数值调整改为「就地只标数值」（管理者 2026-10-14）：新文案正常显示，
//      只在变化的数值位置「旧值划掉+新值标色」，去掉「（23%调整为30%）」注记。
//      只有骨架相同的条目才这样标；骨架不同仍走 L3 整块替换。
// v41：移除数值类小注「（数值：80%→40%）」（管理者 2026-10-14）：小字只保留文字类的
//      （如 L1 措辞调整的「（原：…）」），数值变化靠就地标色表达，不再另写一行。
// v42：① 小改动不再整段划掉重写——词集相似度 ≥0.7 时只就地标注差异处
//      （「每当」改「每次」这类）；② 手写 diffs 的新增内容去掉外层括号，不再单独成块；
//      ③ 首页「角色被动版本收录」入口的角色数改为从清单实时统计（原硬编码 9 位，实际 13 位）。
// v43：切句改为「括号感知」——括号未闭合时不按句号切分。被动正文大量用
//      「（<效果名>：…。）」包裹说明且常跨句，硬切会把右括号甩到下一句末尾、
//      甚至留下孤立的「）」被当成一条独立新增标出来。
//      附带收益：梦比优斯 +11 凤凰涅槃现在能被自动判为「重做」（与官方口径一致）。
// v44：① 同义反复（增加↔提高、减少↔降低、仅标点差异）不再标注——管理者口径
//      「这种可以不用管」，直接显示当前版本文案，不加标签不加小注；
//      ② 条目名称变更纳入对比：旧名灰色删除线 + 新名，不标色。
// v45：名称变更的两种呈现——只改数字时只把数字划掉（防御屏障~~6~~8）；
//      整个改名时旧名跟在**新名右侧**（灰色删除线），保持条目头左对齐美观。
// v46：被动版本对比「精校」大改（2026-10-14 管理者逐条点名）——
//      ① 配对 DP 回溯方向修正：完全相同的句子不再被误判「新增+移除」
//         （捷德终极 +9/+11 的「赛罗不在我才会好好加油」「遭受越多的创伤才能成长！」）；
//      ② 标点一律不标色：纯新增块的两侧边缘标点移出高亮区（「，」不再标橙）；
//         变更块结尾吸收**配对的右括号**（`[特技]→<治疗>` 不再劈成 `~~[特技~~〖绿:<治疗〗>`）；
//      ③ 角色/目标 不再是同义词——管理者四处点名要求标出（无限赛罗 +9、超限 普通技/+9）；
//      ④ 手写 diffs 支持按版本给：某版本没配就**落回自动分档**（不再输出无标注纯文本）；
//      ⑤ 点名条目就地精校：捷德尊皇 +7/能量技/+11/+12、泰迦 +7/+9、泽塔 +6、
//         超限 普通技、无限赛罗 +12(=重做)、奥特之王(UL) +1 名称、奥特之父 +9 触发时机、
//         捷德终极 +9/+11 语句顺序、超限 +7 v1 名称对齐。
// v47：审核修正——① 无限赛罗 +3 v4 名称改回「形态强化」（素材图核对，非「形态切换·赛罗」）；
//      ② 超限 +7 v2 名称补「赛罗的应援·强化」+ 原文「为己方」（素材图核对）；
//      ③ 无限赛罗 +7 v2 原文「为己方」。
// v48：超限 v1 被动补录（与无限赛罗 v1 一致，仅 +12 不同，管理者确认口径）。
// v49：删除「上一版素材未收录」灰注（v3 公告图档沿用上一版文本，不再提示）。
// v50：新增四位角色——令迦、光辉赛罗、终极赛罗闪耀型、雷古洛思（奥特之星/BY）。
// v51：雷古洛思被动全量精校（对齐 2025-06-17 公告 + 游戏截图逐字核对）——
//      能量技 v2 持续15回合、+1 拆 v1/v2、+6/+7/+9/+11/+12 数值与措辞修正
//      （噤鸣/感电错别字、+9 v1 64%/35%、+11 v1 缠20%、+12 v1 结构重写），
//      +6/+9/+11 手写 diffs 全量覆盖。
// v52：令迦被动全量精校（对齐 2024-08-13 公告 + 游戏截图逐字核对）——
//      +1/+3/+6/+7/+9 拆 v1/v2（公告确认被调整），+12 两版括号归属按截图重排；
//      公告「破挡率/命中率增加3%」截图实为 5%，以截图为准；+7/+9 手写 diffs。
// v53：趣味问答题库 140 → 160 题（sources/奥特曼答题.txt 换新，新增 24 题、
//      3 题措辞更新、藤工→藤宫、去掉「戴拿（存疑）」）；题数文案改自动填充，
//      解析正则兼容「155。」式序号。
// v54：首页页脚新增 CC BY-NC 4.0 分层授权声明（原创部分可转载/须署名/禁商用，
//      引用的官方素材与转载攻略不在授权范围内）。
// v55：首页新增「新版本提示」——SW 装到新版本后弹条提示点此刷新
//      （⚠️ 提示靠 SW 文件变化触发，所以每次上线都得升版本号，否则弹不出来）。
// v56：「看过即缓存」改到独立的 RUNTIME 缓存（原先进版本缓存，一升版就被整桶清掉）；
//      静态资源改 stale-while-revalidate（先秒开再后台换新），页面/图片跨版本保留，
//      上限 400 条自动裁剪。断网时看过的页面不再被兜底成首页。
// v57：修「离线兜底成首页」——未缓存页面离线时不再返回 index.html（会导致
//      URL 与内容错乱、相对路径 404、角色页永远打不开），改为自包含的专用离线页。
//      回归测试：node tools/sw_offline_test.js（6 条断言）
// v58：被动页新增「文字版 / 原文图」视图切换（akp.js + akp.css）。
//      只叠加不替代：默认文字版，原文图用于核对原图，图片视图下禁用版本对比。
//      akp.js/akp.css 都在预缓存清单且走缓存优先 → 按硬规矩必须升版，否则用户拿不到新 JS。
// v59：原文图视图修「切过去按钮全没了」——操作条在被动 section 里，整节隐藏会连
//      按钮一起藏掉；改为该节打 .akp-sec--ctl 标记，只藏标题条与正文、保留操作条；
//      并按管理者要求删掉图片视图顶部的说明文字。
// v60：奥美迦朱雀装甲（多宇宙/BY）补全校对上线——被动补 +9/+11/+12/+18、
//      超越技补全（狱火斩/凝寒流/风旋击/裂地钻/离火/凝寒/地煞/控制效果）；
//      采集脚本排除「简介技/魔方」；_images.js 重生成（清理误入的校对切片）。
// v61：格式统一——被动板块**恒定有操作条**（版本 + 对比 + 视图切换），
//      单版本角色（如奥美迦朱雀装甲）不再少一排按钮、视图按钮也不再另挂他处；
//      「原文图」改称「原图版」。
// v62：奥美迦朱雀装甲补「简介」板块（akp.js 新增 intro 态：恒静态文本块、不参与
//      版本切换）；采集脚本把「简介技」纳入原图版（排在主动/被动/超越之后）。
//      另：被动板块长条目统一重排版——19 个角色共 58 处（+12 全部 + 同类长条目），
//      按原文语义边界插换行、**文字零改动**（去换行后与改前逐字一致，390 条比对通过）。
//      akp.js/akp.css/_images.js/数据文件都是缓存优先 → 按硬规矩必须升版。
// v63：新增角色「赛罗无限形态（银河闪耀）」（奥特之星 / BY，3 个版本：
//      v1 2026-6-16 / v2 2026-6-25 / v3 2026-7-14）；五处登记齐全
//      （_manifest / index.html / category.html / _images.js / 本 ASSETS）。
//      新角色长条目同样按 v62 起的排版规则分段。数据文件是缓存优先 → 必须升版。
// v64：对比态支持段落换行（akp.js 新增 nlPatch）：排版只插了 \n，但对比视图里
//      「整段一行」的几条快速通道（整条重做 / 纯标点同义 / 数值调整）会把 \n
//      当空白折叠、看起来还是一坨墙 → 现在统一把 \n 渲染成 <br>（首尾换行先剥掉，
//      避免段落边界在标签后留空行）。子句级分支本来就是一句一行、换行落在子句首
//      会被剥掉，不受影响。换行**依旧不算改动**（akp_diff_test 新增 6 条断言守住）。
//      akp.js 是缓存优先 → 必须升版。
// v65：原图版改「按类别建块 + 缺图向前沿用」（akp.js + akp.css）——
//      旧逻辑按版本分组，某版本没给某类别拍图（那一版该类技能确实没改、素材就没再拍）
//      时会把**整块藏掉**；管理者口径：不能因为没变化就不显示。
//      现在每类自己选版本：当前版本有图就用，没有就沿用最近一个更早版本，
//      并在标题右侧打「沿用」标记。标签解析同时支持「主动技 v1v2」（一图覆盖两版）
//      与「被动技+超越技 v2」（两类别共用一图）。
//      验收 tools/akp_imgview_test.js（33 断言 + 20 角色 × 全版本类别齐全）。
//      akp.js / akp.css 缓存优先 → 必须升版。
// v66：预缓存改「内容寻址增量更新」（管理者反馈：更新版本后依旧全部都要重新加载）
//      ——根因：以前 CACHE_NAME 里**带版本号**（guangyuan-v65），发一次版就换一个
//        空桶，install 时把 ASSETS 全量 add 一遍；不管内容有没有变，70+ 条资源
//        全部重新走一遍网络。v56 改的只是「运行时缓存不清空 + 静态资源后台换新」，
//        没有动这一条，所以体感依旧是「更新一次 = 全站重下一次」。
//      ——现在：
//        · 预缓存桶名固定为 guangyuan-static（**不带版本号**），跨版本保留；
//        · install 逐条发**条件请求**：拿桶里旧响应存的 ETag / Last-Modified 当
//          If-None-Match / If-Modified-Since，服务器回 304 就一个字节都不下，
//          继续用桶里那份（线上实测 EdgeOne 有强 ETag，未变更 → 304 / 0 字节）；
//        · 服务器不给校验器、或响应异常时，退回无条件下载 / 保留旧内容 —— 只会
//          退化成旧行为，**不会**出现「内容变了却永远拿不到」的缓存坏死；
//        · activate 只清「既不是 STATIC 也不是 RUNTIME」的桶，历史版本桶
//          （guangyuan-v65 等）会被清掉，之后每次发版都是增量。
//      ⚠️ 桶名不再变化后，浏览器检测更新 / 「新版本提示」只靠 **SW 脚本自身内容变化**
//         触发 → 每次发布仍然要改 BUILD（就下面这一行），否则不会弹提示、也不会更新。
//      ⚠️ 老用户从 v65 升上来的**第一次**仍是全量（新桶是空的），从第二次起才是增量。
//      ⚠️ 逃生舱：万一缓存被污染，把 FORCE_FULL_REFRESH 改成 true 发一版，整桶重下。
// v67：① 角色页**默认恒为文字版**（管理者反馈：银河闪耀、朱雀一进去就是原图版）——
//      akp.js 不再把视图模式写进 localStorage（旧值读出来就删掉，老手机残留的
//      image 也不会再生效）；切换按钮照旧可用，但只在当前页面有效，刷新/换角色
//      即回文字版。新增角色自动继承，不需要在数据里写任何东西。
//      ② 文字版空闲时预取当前版本的原图（akp.js，省流量模式/2G3G 不预取）。
//      ③ 长图压缩：passive/img 里「高≥1800 且（≥300KB 或 宽≥1000）」的 9 张
//         统一缩到 900 宽 + WebP q82 重编码（471K→378K 等，合计省 20%），
//         工装 tools/akp_compress_imgs.py（原图备份在 tools/_akp_img_backup）。
//         压完图 ETag 全变 → 条件请求会拉新，不会留在旧图。
//      ④ 部署配置 edgeone.json 给 /passive/img/* 加 7 天缓存（上一步）。
// v68：新增「新域名公告弹窗」assets/ak/notice.js —— 进站延时弹一次，带「不再提示」
//      复选框（localStorage 持久化，键 ak-domain-notice-2026-10-17），同一次会话
//      只弹一次（sessionStorage）。样式自包含、只取 --ak-* 令牌 → 亮暗主题自动跟随；
//      首页/计算器/攻略页/被动三页全部挂载。⚠️ 要想「对所有人重新弹一次」，
//      改 notice.js 里的 NOTICE.key（带日期当版本号）即可。
// v69：公告改口径 + 只在主页弹（管理者 2026-10-17）
//      ① 旧地址**不停用**：改成说明「域名原因可能被拦截到广告网站」，并请看到的人
//         群里相互转告；删掉「无需重新添加桌面图标」。
//      ② **只有 index.html 挂载** notice.js（二级页一律不弹；notice.js 里还用
//         NOTICE.homeOnly 按 pathname 再判一次作保险）。原「同会话只弹一次」的
//         sessionStorage 逻辑保留，防止首页反复刷新时连环弹。
//      ⚠️ notice.js 是缓存优先资源，BUILD 不动老用户看不到新文案。
// v70：修「immutable + 同名换图 = 老用户永远看不到新内容」（管理者 2026-10-17 指出）
//      ① edgeone.json 的 `/assets/*` 去掉 `immutable`、31536000 压到 **604800（7 天）**：
//         immutable 的含义是「这一年内连校验都不发」，而本项目一直是**同名覆盖**换图
//         （2026-10-13 bfdbb46 就换过 guangyuan.png / icon-512 / icon-512-maskable /
//         factions/multiverse.png），旧头会让那批老用户永久停在旧图，清 CDN 也救不回。
//         7 天与 /passive/img/* 对齐，最迟 7 天自动校验一次。
//      ② precacheOne：**没有旧副本时** fetch 带 `cache:'no-cache'` —— 默认模式会先查
//         浏览器 HTTP 缓存，桶空（首装 / 强制刷新）时会把 HTTP 缓存里的旧文件写进桶，
//         等于发版也拿不到新内容。有旧副本时仍走 If-None-Match 条件请求，保持 304 零下载。
//      ⚠️ 残留：浏览器里**已经存着的**旧 immutable 副本不会因改头而失效（最长 1 年），
//         只能靠 SW 预缓存覆盖来救；`assets/guides/**`（2MB 攻略长图）不在预缓存清单里，
//         **换这几张图请改名**（或改名后把旧名删掉）。
// v71：接入 51.la 统计（2026-10-17）—— 新增根目录 ak-analytics.js（**不进 /assets/**，
//      那里是 immutable，改了老用户拿不到新版；也不进 SW 预缓存，避免统计脚本被缓存成旧版）。
//      11 个成品页 + guide_template.html + build_strategies.py 三模板各加一行
//      `<script defer src="/ak-analytics.js"></script>`。
//      支持 `?owner=1` 本机免统计（写 localStorage `ak-owner`，`?owner=0` 取消）。
//      SW 侧无需改动：fetch 处理器开头就排除跨域与非 GET，sdk.51.la 天然不被拦截。
// v72：人间体图鉴加「光元消耗」+ 光元图换 WebP（管理者 2026-10-17）
//      ① guides.html（由 guide_template.html + build_guides.py 生成）：
//         · 特训名单里的角色名按**商店价**着色 —— 6000 金（.p6000）；未标价商店
//           统一按 11280 橙（.p11280，常量 SHOP_UNPRICED）；其它栏位不染色。
//         · 每张卡片 + 表格第 7 列 + 详情弹层都加「光元消耗」= 该角色 traits
//           全部商店价之和（0 也显示，走 .costval.zero 灰态）。
//      ② assets/guangyuan.png（480×520 / 18.6KB）→ **guangyuan.webp**
//         （256×277 / 11.1KB）：传输 -40%，解码内存 -73%；页面最大显示 72px
//         （首页 logo），256 宽在 3x 屏仍有 3.5 倍余量。引用（index / calculator /
//         calc.js / 本 SW 清单）全部换掉，旧 png 已删。
// v73：人间体图鉴接图片（2026-10-17）—— `images/humans/<id>/{base,awaken,transcend,avatar}.webp`
//      ① fetch 处理器对 `/images/**` **直接 return**，交回浏览器 HTTP 缓存（7 天）：
//         805 张图若走 RUNTIME，会把 400 条上限挤满、把页面缓存挤掉。
//      ② 这些图**不进** ASSETS 预缓存清单（10MB，会把每次安装拖死）。
//      ③ edgeone.json 新增 `/images/*` → `public, max-age=604800`（与 passive/img 同档）。
// v74：首页图标换成「成就9」水晶（2026-10-18）—— 新增 assets/logo-crystal.webp
//      （从桌面素材抠掉深底、边缘去暗边后 256×256 透明 webp），index.html 的 logo 与入口卡 ico
//      两处引用已换；**计算器页内的光元图标仍用 assets/guangyuan.webp 不动**。
// v75：首页顶部换成「梦比优斯无限形态」头像框（2026-10-18，管理者提供 216×216 素材）
//      只替换 header 的 .logo；入口卡 ico 仍是水晶、计算器内仍是 guangyuan.webp。PWA 图标暂不动。
// v76：详情页左右箭头换成游戏内翻页按钮（2026-10-18）—— assets/ak-btn/{left,right}{,-gray}.webp
//      等比缩到高 40，排在立绘下方一行；禁用时切灰色版（不再用 opacity）。
//      （新增 4 个预缓存资源才升版本；之后改样式/文案/数据不需要再动 BUILD）
// v77：站点/PWA 图标统一换成「界面图标\最终版.webp」（2026-10-18）
//      PWA 的 4 个 icon + apple-touch + favicon 全部**改名**（app-icon-*、apple-touch-app、favicon-app），
//      避免同名覆盖后已安装的桌面图标不更新；首页 logo 换 assets/logo-site.webp。
// v78：首页 h1 恢复显示；logo-site.webp 换成透明底（**同名换内容**，必须升版让预缓存刷新）
// v79：首页两个入口卡图标换素材（2026-10-18）—— assets/entry-guides.webp / entry-passive.webp
// v80：修炼数值表按新素材补全 3 处（重伤增幅 18.14 / 减能增幅 5.18 / 混乱增幅 5.58）；
//      首页攻略卡改为「3 篇攻略」并补上兵非武斗转载。
//      ⚠️ 注意：所有页面 html 都在 ASSETS 里（离线用），所以**改页面也要升 BUILD**。
/* App（Capacitor）用 https://localhost 加载本地 assets：不预缓存，避免缓存陈旧；
   资源包仍走 packs 桶 + 网络。 */
const IS_NATIVE = self.location.hostname === 'localhost' || self.location.protocol === 'capacitor:';

// v81：第 14 轮 App 化改造（网站侧）正式发布
//      双版本适配（探测层 + app.css/app-shell.js）、app.html、SW 资源包通道、
//      module.json / version.json、CORS、jpg 孤件移出（-3.4MB）、App 卡片精简。
// v82：第 17 轮「策略回退 + App 图片链路修复」（管理者拍板：回到旧版本策略）
//      ① HTML 回退：删掉第 16 轮附加的「HTML 网络优先 + 回写预缓存」分支 ——
//         导航请求本就走 isDocumentRequest 网络优先，那分支只影响罕见的非导航
//         .html 子请求，却带来更弱的离线兜底与预缓存桶无 trim 的写入，得不偿失。
//      ② 图片回退缓存优先（SWR）：命中 packs 桶直接返回（第 14 轮起验证至今），
//         后台条件请求换新；只保留「未命中就去网络拉并顺手入桶」新能力。
//      ③ 修 App 裂图根因：未命中取图**必须先把 URL 重写到 SITE_BASE**（App 里
//         request 是 https://localhost、本地无图必 404）；!ok（404）先回查缓存，
//         严禁把 404 透传给页面。
//      ④ 新闸门 tools/sw_app_image_test.js（App 环境模拟，10 断言）：堵住浏览器
//         同源闸门测不出 App 问题的盲区（旧代码对它跑出 9 项违例）。
//      注：第 16 轮其余改动（预取可选、并行 6 路、返回钮滚动感知、展开按钮行内、
//      首启弹层移除）不回退，继续有效。
//      追加（同批未发布，合并进 v82）：极恶贝利亚（宇宙人/BY）四版补全正式上线 ——
//      v1 2020-1-19 / v2 2021-9-14 / v3 2022-9-22 / v4 2025-4-14；数据与 _manifest/_images 变更。
//      追加（同批未发布，合并进 v82）：首页按钮改版 —— 「添加到桌面」改名
//      「收藏本网站」（save.js 的 idle 文案统一，不再随 iOS/安卓变），旁边并排
//      新增「下载 App」按钮（直达 app/aoxi-tools-v0.1.1.apk，仅网页版显示，
//      App 内由 app.css 隐藏）。index.html / ak-components.css / save.js / app.css。
const BUILD = 'v82';
const CACHE_NAME = 'guangyuan-static';   // ⚠️ 固定名，不要再往里加版本号
const FORCE_FULL_REFRESH = false;        // 平时保持 false；出缓存事故才开一次

/* 运行时缓存（2026-10-15 加）：「看过即缓存」专用，与预缓存分离。
   以前 fetch 成功也写进版本缓存，但每次升版本号 activate 会把旧缓存整桶删掉，
   用户攒下来的离线内容一夜清零 → 现在单独放这里，发新版不清。
   只存同源 GET，且带条目上限，避免无限膨胀。 */
const RUNTIME = 'guangyuan-runtime';
/* App 资源包专用桶（第 14 轮 v81）：固定名、activate 不清、不参与 RUNTIME 400 条裁剪 */
const PACKS_CACHE = 'guangyuan-packs';
const PACKS_MAX = 3000;   // packs 桶上限（浏览即缓存 + 预取共用），超出从最旧裁剪
/* App（Capacitor）里页面 origin 是 https://localhost，图片实际在线上：
   资源包按线上绝对 URL 下载，同时用「本地同路径」再存一份，页面请求才能命中。 */
/* 浏览器同源测试（http://127.0.0.1:8099 等）用自身 origin；
   App（https://localhost，本地无图片）才从线上站点拉。 */
const SITE_BASE = (self.location.hostname === 'localhost' && self.location.protocol === 'https:')
  ? 'https://m78calc.cn'
  : self.location.origin;
const RUNTIME_MAX = 400;          // 上限条目数，超出后从最旧的开始裁

// 超出上限时裁掉最早的条目（cache.keys() 为插入顺序）
function trimRuntime() {
  return caches.open(RUNTIME).then((cache) =>
    cache.keys().then((keys) => {
      if (keys.length <= RUNTIME_MAX) return;
      return Promise.all(
        keys.slice(0, keys.length - RUNTIME_MAX).map((k) => cache.delete(k))
      );
    })
  );
}
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
  './assets/guangyuan.webp',
  './assets/logo-crystal.webp',
  './assets/logo-site.webp',      // 首页顶部站点徽标（2026-10-18）
  './assets/entry-guides.webp',   // 首页「人间体大全」入口图标（2026-10-18）
  './assets/entry-passive.webp',  // 首页「角色被动收录」入口图标（2026-10-18）
  './assets/ak/app.css',          // App 版适配层（第 14 轮）
  './assets/ak/app-shell.js',
  './app.html',                   // App 设置页
  './module.json',                // 资源包清单（App 内下载用）
  './version.json',
  './assets/ak-btn/left.webp',
  './assets/ak-btn/left-gray.webp',
  './assets/ak-btn/right.webp',
  './assets/ak-btn/right-gray.webp',
  './assets/app-icon-192.png',
  './assets/app-icon-512.png',
  './assets/app-icon-192-maskable.png',
  './assets/app-icon-512-maskable.png',
  './assets/apple-touch-app.png',
  './assets/favicon-app.png',
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
  './assets/ak/notice.js',
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
  './passive/data/sailuo-wuxian.js',
  './passive/data/sailuo-wuxian-chaoxian.js',
  './passive/data/aotewang-by.js',
  './passive/data/jiede-zhongji.js',
  './passive/data/lingjia.js',
  './passive/data/guanghui-sailuo.js',
  './passive/data/sailuo-shinyaoxing.js',
  './passive/data/leiguluosi.js',
  './passive/data/sailuo-yinhe-shanzhuo.js',
  './passive/img/factions/star.png',
  './passive/img/factions/multiverse.png',
  './passive/img/factions/alien.png',
  './passive/img/factions/monster.png',
  /* —— 计算器页面拆分产物（M6，v34）：从 calculator.html 内联块逐字节搬出 —— */
  './assets/calc/calc-base.css',
  './assets/calc/calc-override.css',
  './assets/calc/calc.js'
];

/* 离线兜底页（2026-10-15 重写）
   ------------------------------------------------------------------
   ⚠️ 以前这里是 `const OFFLINE_PAGE = './index.html'`，离线且该页面没有缓存时，
      直接把首页 HTML 塞回去。后果：
        · 地址栏是 /passive/char.html，内容却是首页 → 上下文完全错乱；
        · 首页 HTML 里的相对路径（assets/、data/…）会以 /passive/ 为基准去取 →
          CSS/JS/图片全 404，页面彻底崩坏（这就是「脱机后界面错位」的真因）；
        · char.html 自己的渲染逻辑根本不会执行，角色页永远显示不出来。
   现在改成返回一个**自包含的离线页**：不引用任何相对资源、不伪装成别的页面、
   明确告诉你「当前离线且此页未缓存」，并给出返回首页 / 重试两个出路。 */
function offlineResponse() {
  const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>离线 · 奥系光元工具站</title><style>' +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    'background:#101828;color:#e6edf7;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;' +
    'padding:24px;box-sizing:border-box}' +
    '.c{max-width:420px;text-align:center}' +
    'h1{margin:0 0 10px;font-size:1.15rem;color:#fbd33c;letter-spacing:1px}' +
    'p{margin:0 0 20px;font-size:.88rem;line-height:1.9;color:#9fb0c9}' +
    'a{display:inline-block;margin:0 6px;padding:11px 18px;border-radius:10px;font-size:.86rem;' +
    'text-decoration:none;background:#fbd33c;color:#1a1206;font-weight:600}' +
    'a.ghost{background:transparent;color:#9fb0c9;border:1px solid #2a3550}' +
    '</style></head><body><div class="c">' +
    '<h1>当前处于离线状态</h1>' +
    '<p>这个页面你之前没有打开过，所以没有缓存可供离线显示。<br>' +
    '连上网络后再试一次就好，看过的页面离线也能看。</p>' +
    '<a href="/index.html">返回首页</a>' +
    '<a class="ghost" href="javascript:location.reload()">重试</a>' +
    '</div></body></html>';
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-AKP-Offline': '1' }
  });
}

// 判断该请求是不是"页面"（导航请求，或接受 text/html）
function isDocumentRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

/* ============================================================
   图片取件（第 14 轮建，第 17 轮定稿）
   ------------------------------------------------------------
   ① **缓存优先（SWR）**：命中 packs 桶就立即返回 —— 在线离线都能看，
      不进网络（第 14 轮起验证至今的行为）；同时 waitUntil 一次**后台条件请求**
      换新（304 = 零下载），失败静默。先秒开、下次打开是新的。
   ② **未命中才走网络，且 fetch 前必须把 URL 换到 SITE_BASE**：
      App（Capacitor）里页面 origin 是 https://localhost，本地服务器根本没有
      这些图，直接拿 request 去 fetch 必 404 —— 这就是第 16 轮「看过即缓存
      在 App 下实际是坏的」的根因。浏览器同源时 SITE_BASE 就是自身 origin，
      重写等于不变。
   ③ **!ok（404 等）必须先回查缓存，严禁把 404 原样透传给页面**：
      第 16 轮就是 404 被原样返回（且 catch 只在断网抛错时才查缓存）→ App 裂图。
   ============================================================ */
function imgRemoteHref(url) {
  return new URL(url.pathname + url.search, SITE_BASE).href;
}
function imgLocalHref(url) {
  return new URL(url.pathname + url.search, self.location.origin).href;
}

/* 一份图存两把钥匙：线上键（预取通道用的绝对 URL）+ 本地键（页面请求用的 URL）。
   这样「按线上 URL 预取」和「按页面 URL 取图」互相都能命中。 */
async function putImage(cache, remote, local, res) {
  try {
    await cache.put(remote, res.clone());
    if (local !== remote) {
      try { await cache.put(local, res.clone()); } catch (e) {}
    }
  } catch (e) {}
  try { await trimPacks(); } catch (e) {}
}

async function imgCacheHit(cache, request, remote, local) {
  let hit = null;
  try { hit = await cache.match(request); } catch (e) { hit = null; }
  if (!hit && remote !== request.url) { try { hit = await cache.match(remote); } catch (e) {} }
  if (!hit && local !== request.url) { try { hit = await cache.match(local); } catch (e) {} }
  return hit;
}

/* 命中后的后台换新（SWR）：有旧副本 → 带 ETag/Last-Modified 条件请求，
   304 就一个字节都不下。任何失败都静默，旧内容继续可用。 */
async function imgRefresh(cache, hit, remote, local) {
  try {
    const cond = condHeaders(hit);
    const res = await fetch(remote, cond ? { headers: cond, credentials: 'omit' } : { credentials: 'omit' });
    if (res.status === 304) return;
    if (res && res.ok) await putImage(cache, remote, local, res);
  } catch (e) { /* 离线或失败：保持旧内容 */ }
}

/* 未命中：走网络 → 成功入 packs 桶 → 失败/404 先回查缓存 → 都没有才让页面走裂图占位 */
async function imgFetch(cache, request, remote, local) {
  let res = null;
  try { res = await fetch(remote, { credentials: 'omit' }); } catch (e) { res = null; }
  if (res && res.ok) {
    const copy = res.clone();
    await putImage(cache, remote, local, res);
    return copy;
  }
  const fb = await imgCacheHit(cache, request, remote, local);
  if (fb) return fb;
  // 真的拿不到：抛错让 <img> 走 onerror（页面显示「未缓存 · 联网后查看」），
  // 绝不把 404 响应体透传出去。
  throw new Error('image unavailable: ' + remote);
}

// 安装：预缓存核心资源
// 2026-10-13 M2（审查 D-1）：原来用 cache.addAll(ASSETS) —— 它是「全有或全无」，
// 任何一条资源 404 都会让整个 install 失败，老用户被永久卡在旧版本（且静默）。
// 改成逐条处理 + 单条 catch：个别资源取不到只打印警告，其余照常入缓存、
// install 照常完成。发布前的对账（pack_deploy.py 第四项自检 + akp_lint.py 第五项）
// 仍然是第一道防线，这里只是纵深防御。
//
// 2026-10-16 v66：逐条处理的同时加「条件请求」——见上方 v66 注释。
//   有旧副本 → 带上 ETag 问服务器「变了吗」→ 304 就跳过（零下载）；
//   没旧副本 / 服务器不给校验器 → 直接下载（首次安装仍是全量，属正常）。
function condHeaders(oldRes) {
  const h = {};
  const etag = oldRes.headers.get('etag');
  const lm = oldRes.headers.get('last-modified');
  if (etag) h['If-None-Match'] = etag;
  else if (lm) h['If-Modified-Since'] = lm;
  return h;
}

async function precacheOne(url) {
  const cache = await caches.open(CACHE_NAME);
  const req = new Request(url);
  let old = null;
  try { old = await cache.match(req); } catch (e) { old = null; }

  let res;
  try {
    const cond = old ? condHeaders(old) : null;
    /* ⚠️ 为什么「没旧副本」时必须带 cache:'no-cache'（2026-10-17 修）：
       默认 cache 模式会**先查浏览器 HTTP 缓存**；桶里空的时候（首次安装、
       FORCE_FULL_REFRESH、或老用户新桶）就会直接吃到 HTTP 缓存里那份可能很旧的
       文件并写进预缓存桶 → 等于「发版了也拿不到新内容」。
       有旧副本时走 If-None-Match 条件请求（本身就是验证请求，会回源），保持 304 语义，
       所以不加 no-cache，避免把浏览器自动加的 ETag 和我们手写的重复。 */
    const opt = cond ? { headers: cond } : { cache: 'no-cache' };
    res = await fetch(new Request(url, opt));
  } catch (e) {
    // 离线：手里有旧的就沿用（不拖垮安装），没有也只警告
    if (!old) console.warn('[SW] 预缓存失败（首次且取不到）:', url, e && e.message);
    return false;
  }
  if (res.status === 304) return false;                 // 内容没变 → 零下载
  if (!res.ok) {
    if (old) return false;                              // 异常响应：保住旧内容
    console.warn('[SW] 预缓存响应异常:', url, res.status);
    return false;
  }
  try { await cache.put(req, res.clone()); }
  catch (e) { console.warn('[SW] 写入缓存失败:', url, e && e.message); }
  return true;
}

self.addEventListener('install', (event) => {
  if (IS_NATIVE) {                 // App 内 assets 已在安装包里，不需要预缓存
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    (FORCE_FULL_REFRESH ? caches.delete(CACHE_NAME) : Promise.resolve())
      .then(() => Promise.all(ASSETS.map((url) =>
        precacheOne(url).catch((e) => {
          console.warn('[SW] 预缓存异常（其余照常，不影响本次安装）:', url, e && e.message);
          return false;
        })
      )))
      .then((rs) => {
        const n = rs.filter(Boolean).length;
        console.log('[SW] ' + BUILD + ' 预缓存完成：实际更新 ' + n + '/' + ASSETS.length +
          ' 条' + (n < ASSETS.length ? '（其余命中 304，未重复下载）' : ''));
      })
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        // ⚠️ CACHE_NAME（预缓存，v66 起为固定名）与 RUNTIME（看过即缓存）都不清：
        //    发新版不该把用户攒的离线内容清掉，也不该把没变的静态资源重下一遍。
        //    历史版本桶（guangyuan-v65 等老名字）会在这里被一次性清掉。
        keys.filter((k) => k !== CACHE_NAME && k !== RUNTIME && k !== PACKS_CACHE).map((k) => caches.delete(k))
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

  /* ---- APK 安装包（第 15 轮）：一次性下载，走网络且不写任何缓存 ---- */
  if (url.pathname.endsWith('.apk')) return;

  /* ---- 图片类资源（第 14 轮 v81 建，第 17 轮定稿）----
     ① 命中 packs 桶 → 直接返回（在线离线都能看），后台条件请求换新（SWR）；
     ② 未命中 → 走网络，**URL 换到 SITE_BASE**（App 本地无图、直接 fetch 必 404
        是第 16 轮 App 裂图的根因），成功后入 packs 桶（remote + local 双键）；
     ③ !ok（404）**先回查缓存**，严禁把 404 透传给页面。
     ⚠️ 只进 packs 桶、**不进 RUNTIME**：805 张图若走 RUNTIME 会把 400 条上限
        挤满，反倒把页面缓存挤掉。 */
  if (/^\/(images|passive\/img|assets\/guides)\//.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(PACKS_CACHE);
      const remote = imgRemoteHref(url);
      const local = imgLocalHref(url);
      const hit = await imgCacheHit(cache, request, remote, local);
      if (hit) {
        event.waitUntil(imgRefresh(cache, hit, remote, local));
        return hit;
      }
      return imgFetch(cache, request, remote, local);
    })());
    return;
  }

  // ---- 页面：网络优先，看过即缓存（写进 RUNTIME，跨版本保留）----
  if (isDocumentRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, clone)).then(trimRuntime);
          }
          return response;
        })
        .catch(() =>
          // 断网：先看有没有看过这份页面（RUNTIME 里），没有才给专用离线页
          caches.match(request).then((cached) => cached || offlineResponse())
        )
    );
    return;
  }

  // ---- 静态资源：stale-while-revalidate（先看缓存秒开，同时后台换新）----
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // 后台刷新一次，下次打开就是新的；失败静默（离线时保持旧内容可用）
        event.waitUntil(
          fetch(request)
            .then((response) => {
              if (response && response.ok) {
                const clone = response.clone();
                return caches.open(RUNTIME).then((cache) => cache.put(request, clone));
              }
            })
            .then(trimRuntime)
            .catch(() => {})
        );
        return cached;
      }
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, clone)).then(trimRuntime);
        }
        return response;
      });
    })
  );
});

/* ============================================================
   App 资源包通道（第 14 轮 · v81，2026-10-18）
   ------------------------------------------------------------
   页面侧（app-shell.js 的 AkPack）发消息 → 这里逐文件 fetch 进 packs 桶，
   每下完一个就通过 MessageChannel 回传进度（App 内需要 CORS，见 edgeone.json）。

   消息：
     akpack-status    → { type:'status', packs:{ guide:{count,bytes}, ... } }
     akpack-download  → 参数 { ids:[...] }，进度走 port
     akpack-remove    → { id }
     akpack-removeAll
   ============================================================ */
async function readModuleManifest() {
  try {
    const r = await fetch('./module.json', { cache: 'no-cache' });
    return r.ok ? await r.json() : { packs: {} };
  } catch (e) {
    return { packs: {} };
  }
}

async function trimPacks() {
  const cache = await caches.open(PACKS_CACHE);
  const keys = await cache.keys();
  if (keys.length <= PACKS_MAX) return;
  const excess = keys.length - PACKS_MAX;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

function packIdOf(url) {
  if (url.indexOf('/images/humans/') >= 0) return 'humans';
  if (url.indexOf('/passive/img/') >= 0) return 'passive';
  if (url.indexOf('/assets/guides/') >= 0) return 'guide';
  return 'other';
}

async function packsStatus() {
  const cache = await caches.open(PACKS_CACHE);
  const keys = await cache.keys();
  const counts = {};
  for (const k of keys) {
    const id = packIdOf(k.url);
    counts[id] = (counts[id] || 0) + 1;
  }
  /* 字节数用 module.json 的声明值按已下载文件比例估算：
     读每个 response 的 body 太慢，而 Cache 里 header 不一定带 content-length。 */
  const man = await readModuleManifest();
  const out = {};
  Object.keys(counts).forEach((id) => {
    const meta = (man.packs && man.packs[id]) || null;
    const n = counts[id];
    const bytes = meta && meta.count ? Math.round(meta.bytes * Math.min(1, n / meta.count)) : 0;
    out[id] = { count: n, bytes: bytes, total: meta ? meta.count : n };
  });
  return out;
}

var packTask = null;   // 运行中的下载任务（页面重进可附着显示）

async function downloadPacks(ids, port) {
  const man = await readModuleManifest();
  const cache = await caches.open(PACKS_CACHE);
  const queue = [];
  (ids || []).forEach((id) => {
    const p = man.packs && man.packs[id];
    if (p && Array.isArray(p.files)) p.files.forEach((f) => queue.push({ id: id, url: f }));
  });
  const total = queue.length;
  if (!total) {
    port && port.postMessage({ type: 'done', empty: true });
    return;
  }
  packTask = { ids: (ids || []).slice(), done: 0, total: total, file: '', bytes: 0, pct: 0 };
  let done = 0, bytes = 0, idx = 0;
  /* 并行 6 路（第 16 轮）：慢网络下较串行明显提速；断点续传不变（已缓存键跳过）。 */
  const CONCURRENCY = 6;
  async function worker() {
    while (idx < queue.length) {
      const it = queue[idx++];
      if (packTask) packTask.file = (it.url.split('/').pop() || '');
      /* 清单里是线上绝对 URL；同源测试（SITE_BASE === origin）时把路径重写到本地，
         否则 new URL 的 base 对绝对 URL 无效、仍会打到线上（CORS 拦截）。 */
      let remote = new URL(it.url, SITE_BASE);
      if (SITE_BASE === self.location.origin && remote.origin !== self.location.origin) {
        remote = new URL(remote.pathname + remote.search, self.location.origin);
      }
      const local = new URL(remote.pathname + remote.search, self.location.origin).href;
      let hit = null;
      try { hit = await cache.match(remote.href); } catch (e) {}
      if (!hit) {
        try {
          const res = await fetch(remote.href, { cache: 'no-cache', credentials: 'omit' });
          if (res && res.ok) {
            bytes += parseInt(res.headers.get('content-length') || '0', 10) || 0;
            await cache.put(remote.href, res.clone());
            if (local !== remote.href) {
              try { await cache.put(local, res.clone()); } catch (e) {}
            }
          }
        } catch (e) {
          port && port.postMessage({ type: 'error', id: it.id, file: it.url, message: String(e && e.message || e) });
        }
      }
      done++;
      if (packTask) { packTask.done = done; packTask.bytes = bytes; packTask.pct = Math.round(done / total * 100); }
      port && port.postMessage({
        type: 'progress', id: it.id, file: it.url,
        done: done, total: total, bytes: bytes,
        pct: Math.round(done / total * 100)
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  await trimPacks();
  packTask = null;
  port && port.postMessage({ type: 'done', done: done, total: total, bytes: bytes });
}

async function removePack(id) {
  const cache = await caches.open(PACKS_CACHE);
  const keys = await cache.keys();
  const todel = keys.filter((k) => packIdOf(k.url) === id);
  await Promise.all(todel.map((k) => cache.delete(k)));
  return todel.length;
}

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  const port = (event.ports && event.ports[0]) || null;
  if (msg.type === 'akpack-status') {
    event.waitUntil(packsStatus().then((packs) => port && port.postMessage({ type: 'status', packs: packs })));
  } else if (msg.type === 'akpack-download') {
    event.waitUntil(downloadPacks(msg.ids, port));
  } else if (msg.type === 'akpack-remove') {
    event.waitUntil(removePack(msg.id).then((n) => port && port.postMessage({ type: 'removed', id: msg.id, n: n })));
  } else if (msg.type === 'akpack-removeAll') {
    event.waitUntil(caches.delete(PACKS_CACHE).then(() => port && port.postMessage({ type: 'removedAll' })));
  }
});
