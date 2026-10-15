/* ============================================================
   奥系角色被动收录 · 组件（akp.js）
   ------------------------------------------------------------
   用法（三步）：
     1. 页面引入 akp.css / akp-ripple.js / akp.js
     2. 每个角色一个数据文件，调用 AKP.register({...})
     3. HTML 放一个挂载点：
        <div class="akp" data-akp-char="jiebeibeiliya"></div>
        AKP 会在 DOMContentLoaded 时自动挂载所有挂载点。

   挂载点可选属性：
     data-akp-char   角色 id（必填）
     data-akp-tools  1=显示顶部工具条（字号四档 + 全部折叠），默认 1
     data-akp-sec    只渲染指定板块，逗号分隔（skill,passive,exceed），默认全部
     data-akp-note   1=底部显示脚注，默认 1
     data-akp-fold   1=被动板块默认带折叠按钮，默认 1
     data-akp-shots  0=不显示底部的「技能截图原图」下载链接，默认 1

   图片清单来自 data/_images.js（key = 角色 id，由 tools/akp_collect_imgs.js 生成）。

   术语约定：【普通技】【能量技】是固定术语，显示时原样输出，不做任何改名。
   ============================================================ */
(function (global) {
  "use strict";

  var REG = {};        /* id -> 角色数据 */
  var ORDER = [];      /* 注册顺序，供 index 列表用 */

  /* ---------------- 小工具 ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");   /* 2026-10-13 S4：补引号，防未来拼属性逃逸 */
  }
  function mk(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* ---------------- 注册 ---------------- */
  function register(data) {
    if (!data || !data.id) throw new Error("AKP.register: 缺少 id");
    if (REG[data.id]) return REG[data.id];
    REG[data.id] = data;
    ORDER.push(data.id);
    return data;
  }

  /* ---------------- 版本状态 ----------------
     管理者口径（2026-10-12）：
       · 版本切换与「对比」是**两件独立的事**，各占一个按钮；
       · 对比一律针对**相邻的两个版本** —— v3 比 v2、v4 比 v3，而不是 v1 比最新版。
     所以状态就是两个独立维度（共享在同角色各板块之间）：
       VS = { cur: 当前版本下标, cmp: 是否开启对比 }
     —— 不再需要预先枚举状态序列，加 v5/v6 都不用改代码。 */

  /* ---------------- 条目文本取值 ---------------- */
  function textOf(entry, verId) {
    if (entry.texts) {
      var t = entry.texts[verId];
      if (t) return t;
      /* 该版本没写 → 没有变动 = 维持「最近一次改动」后的状态
         （取 ≤ 当前版本中最近的键；2026-10-13 修正：原先回退到最早的 v1，
          雷欧 v4 被动没有 v4 键，被错回退成 v1 的奥特之眼文本，
          正确应沿用 v3 的破挡100%。「最近」语义对「只有 v1」的条目结果相同，
          对「中途新增/中途改过」的条目更符合管理者口径：
          没写上的被动其实就是没有变动。 */
      var cur = parseInt(String(verId).replace(/\D/g, ""), 10) || 0;
      /* 2026-10-13 S1（审查 A-1）：回退改为「比较版本号取最大」，
         不再依赖对象键的书写顺序 —— 数据乱序书写（如先补 v3 再回补 v1）
         也能正确取到 ≤cur 中最大的版本。 */
      var best = null, bestKv = -1, first = null;
      for (var k in entry.texts) {
        if (!Object.prototype.hasOwnProperty.call(entry.texts, k) || !entry.texts[k]) continue;
        if (first === null) first = entry.texts[k];
        var kv = parseInt(String(k).replace(/\D/g, ""), 10) || 0;
        if (kv <= cur && kv >= bestKv) { bestKv = kv; best = entry.texts[k]; }
      }
      if (best !== null) return best;
      if (first !== null) return first;
      return "";
    }
    return entry.text || "";
  }

  /* 条目名按版本取值（2026-10-13 管理者口径：雷欧 +4 v1 是「奥特之眼10」、
     v2 起改名「王者祝福」——名字跟着版本走，不能全版本显示同一个名）。
     数据写法：names: { v1: "旧名", v2: "新名" }；没写 names 或该版本没写，
     就沿用「最近一次改名」的名字（≤当前版本的最大键），再不行回退 name 字段。 */
  function nameOf(entry, verId) {
    var names = entry.names;
    if (names && typeof names === "object") {
      var cur = parseInt(String(verId).replace(/\D/g, ""), 10) || 0;
      /* 同 S1：比较版本号取最大，不依赖键书写顺序 */
      var best = null, bestKv = -1, first = null;
      for (var k in names) {
        if (!Object.prototype.hasOwnProperty.call(names, k) || !names[k]) continue;
        if (first === null) first = names[k];
        var kv = parseInt(String(k).replace(/\D/g, ""), 10) || 0;
        if (kv <= cur && kv >= bestKv) { bestKv = kv; best = names[k]; }
      }
      if (best !== null) return best;
      if (first !== null) return first;
    }
    return entry.name || "";
  }

  /* ---------------- 文本对齐（token 级） ----------------
     ⚠️ 为什么必须按 token 对齐，而不是逐字符：
       字符级 LCS 在「降低23% → 降低30%」上会误匹配到中间的「3」，于是把
       「2」单独判成删除、把「0」判成新增，渲染出来就成了「末尾凭空多一个
       （0）」—— 2026-10-12 管理者实测撞到（尊皇 +4 明明是 23→30）。
       把数字（含小数与 %）整体当作一个 token 后，这类数值替换自然变成
       一个整块，显示为「降低23%（30%）」。

     2026-10-13 管理者口径补充：**同义改写与标点差异都不算改动**——
       · 增加 ↔ 提高、降低 ↔ 减少、角色 ↔ 目标（同一个意思，换了个说法）
       · 逗号、句号等标点与空白（排版差异）
     实现：每个 token 除原文 t 之外带一个「比较键」c；**比较键相同即视为没变**。
     展示永远用原文，且这类「没变但写法不同」的 token 统一显示**当前版本**的写法
     （v2 里写成「提高」就显示「提高」，不会退回 v1 的「增加」）。 */
  var SYN = [["增加", "提高"], ["降低", "减少"], ["角色", "目标"]];
  /* ⚠️ 2026-10-14：补入中文书名/尖括号 〈〉 —— 游戏文案同一效果名常写成
     [物理] / 〈物理〉 / 「终结印记」/ <终结印记> 混用；不归一就会把
     「[物理] → 〈物理〉」当成真改动标出来（管理者：括号改写不需大改）。 */
  var PUNCT_RE = /[\s，。、；：？！,\.\?\!;:·…—～~\-_"“”‘’'()（）\[\]【】<>〈〉《》「」『』]/;

  function tokenize(s) {
    var str = String(s == null ? "" : s);
    var out = [], i = 0;
    while (i < str.length) {
      var hit = null, k, w;
      for (k = 0; k < SYN.length && !hit; k++) {
        for (w = 0; w < SYN[k].length; w++) {
          if (str.substr(i, SYN[k][w].length) === SYN[k][w]) {
            hit = { t: SYN[k][w], c: "\u0000syn" + k };   /* 同义词组内比较键相同 */
            break;
          }
        }
      }
      if (hit) { out.push(hit); i += hit.t.length; continue; }
      var num = str.slice(i).match(/^\d+(?:\.\d+)?%?/);
      if (num) { out.push({ t: num[0], c: num[0] }); i += num[0].length; continue; }
      var ch = str.charAt(i);
      if (PUNCT_RE.test(ch)) { out.push({ t: ch, c: "\u0000punct" }); i++; continue; }
      out.push({ t: ch, c: ch });
      i++;
    }
    return out;
  }

  /* 整段「比较键」串：用于判断一段文字是否其实没变（同义词 / 标点归一后相同） */
  function canonKey(s) {
    return tokenize(s).map(function (k) { return k.c; }).join("\u0001");
  }

  /* 两个 token 数组的 LCS → 操作序列（same / del / ins，按原文顺序）。
     比较用比较键 c；same 操作同时带回两边原文，便于取「当前版本」的写法。 */
  function alignTokens(a, b) {
    var n = a.length, m = b.length;
    if (n * m > 4000000) return null;              /* 太长不硬算，避免卡顿 */
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (var r = 1; r <= n; r++) {
      for (var c = 1; c <= m; c++) {
        dp[r][c] = a[r - 1].c === b[c - 1].c
          ? dp[r - 1][c - 1] + 1
          : Math.max(dp[r - 1][c], dp[r][c - 1]);
      }
    }
    var ops = [], x = n, y = m;
    while (x > 0 && y > 0) {
      if (a[x - 1].c === b[y - 1].c) { ops.push(["same", a[x - 1], b[y - 1]]); x--; y--; }
      else if (dp[x - 1][y] >= dp[x][y - 1]) { ops.push(["del", a[x - 1]]); x--; }
      else { ops.push(["ins", b[y - 1]]); y--; }
    }
    while (x > 0) { ops.push(["del", a[x - 1]]); x--; }
    while (y > 0) { ops.push(["ins", b[y - 1]]); y--; }
    ops.reverse();
    return ops;
  }

  /* 把操作序列切成「公共段 / 变更段」；变更段内的 del 与 ins 合成一个替换块 */
  function chunkOps(ops) {
    var segs = [], i = 0;
    while (i < ops.length) {
      if (ops[i][0] === "same") {
        var s = "";
        /* 公共段取**当前版本**的写法（比较键相同、原文可能不同：增加→提高、，→。） */
        while (i < ops.length && ops[i][0] === "same") { s += (ops[i][2] || ops[i][1]).t; i++; }
        segs.push({ same: s });
      } else {
        var od = "", nw = "";
        while (i < ops.length && ops[i][0] !== "same") {
          if (ops[i][0] === "del") od += ops[i][1].t; else nw += ops[i][1].t;
          i++;
        }
        segs.push({ old: od, new: nw });
      }
    }
    return segs;
  }

  /* 碎片合并：两块变更之间只剩一两个字符的公共段时（典型如中文里插了个逗号），
     把三块并成一块。否则会出现「（，）对目标（造成）目标最大（其）」这种
     一截一截、读不下去的标注。 */
  function refineChunks(segs, minSame) {
    var out = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.same != null && s.same.length < minSame && out.length && i + 1 < segs.length) {
        var prev = out[out.length - 1], next = segs[i + 1];
        if (prev && prev.old != null && next && next.old != null) {
          prev.old += s.same + next.old;
          prev.new += s.same + next.new;
          i++;                                    /* 跳过 next */
          continue;
        }
      }
      out.push(s.same != null ? { same: s.same } : { old: s.old, new: s.new });
    }
    return out;
  }

  /* 两段文字的相似度（token 级 LCS 归一化）。用于判断「整段重写」还是「小改」 */
  function simRatio(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    var ta = tokenize(a), tb = tokenize(b);
    var ops = alignTokens(ta, tb);
    if (!ops) return 0;
    var same = 0;
    ops.forEach(function (o) { if (o[0] === "same") same++; });
    return (2 * same) / (ta.length + tb.length);
  }

  /* 变更块的着色类型：两边数字个数相同 → 逐项比，全涨=增强(红)、其余=调整(绿) */
  function changeType(oldStr, newStr) {
    if (!oldStr) return "new";
    if (!newStr) return "del";
    var na = (oldStr.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    var nb = (newStr.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!na.length || na.length !== nb.length) return "adj";
    var up = false, down = false;
    for (var i = 0; i < na.length; i++) {
      if (nb[i] > na[i]) up = true;
      else if (nb[i] < na[i]) down = true;
    }
    return (up && !down) ? "buff" : "adj";
  }

  /* 直接按 token 流生成对比 HTML。
     不用「字符串 replace」是因为原文里可能有重复子串，会替错位置；
     token 流自带顺序，天然不会错位。 */
  /* ============ 语义分档对比（2026-10-13 管理者口径） ============
     参照官方公告「角色调整」段的写法：条目级、只说变动点、动词固定
     （调整为 / 新增 / 移除 / 重做），**不做逐字涂抹** —— 逐字会把新旧文字
     交错成读不通的混种句（实测「使自身破挡率和命中率均增加到的所有伤害
     减少50%」「暴击伤害增加20%25%」）。
     方向保持我们自己的：**老版本 → 新版本**（官方是新比旧，不照搬）。

     分档：
       L0 完全相同 → 淡色带过
       L1 措辞调整：骨架与数值都一样，只是换了说法 → 显示新文案 + 淡色原文小注，不标色
       L2 数值调整：骨架一样、数值变了 → 自动写「由 20% 调整为 50%」
       L3 内容调整：骨架变了 → 老整块划掉 + 新整块给出（调整/新增/移除）
       L4 重做：整条换掉 → 删除线老全文 + 橙色新全文（沿用现有样式） */

  /* 语义词典：方向词归一，等价词归一。
     ⚠️ 口径铁律：↑ 增加/提高/增强/提升 同义；↓ **只有** 减少/降低 同义
        —— 「减免」「减轻」等不在此列（管理者 2026-10-13）。 */
  var UP_WORDS   = ["增加", "提高", "增强", "提升"];
  var DOWN_WORDS = ["减少", "降低"];
  var EQ_GROUPS  = [
    ["解除", "驱散", "清除", "移除"],
    /* ⚠️ 2026-10-14：原含 ["角色","目标"]，但管理者在四处点名要求把
       「角色 → 目标」「目标 → 角色」**标出来**（无限赛罗 +9、超限 普通技/+9），
       归同义词会让它们静默消失 → 移除该组，按普通词处理。 */
    ["持续", "维持"],
    ["每回合", "每个回合"],
    ["上阵出场时", "上场时", "入场时"],
    /* ⚠️ 2026-10-14：经验证，把这一组**去掉尾字「时」**会连带改变一批未点名条目的
       渲染（奥特之父 +7 由「重做」塌成「新增+移除」、捷德尊皇 能量技 数值调整错位、
       捷德银河初升 +9 变样），得不偿失。故**保留原样**；
       「受到能量技攻击时 → 受到能量技攻击后」只在点名的奥特之父 +9 用手写 diffs 解决。 */
    ["受击时", "受到攻击时", "受到主动技攻击时", "受到能量技攻击时"]
  ];
  var W2T = {};
  UP_WORDS.forEach(function (w) { W2T[w] = "↑"; });
  DOWN_WORDS.forEach(function (w) { W2T[w] = "↓"; });
  EQ_GROUPS.forEach(function (g) {
    g.forEach(function (w) { if (!W2T[w]) W2T[w] = g[0]; });
  });
  /* 游戏术语词表（2026-10-14 新增）：这些多字词在对比时必须作为**整体**对齐，
     否则「行动 → 施放主动技」会被逐字错配成「~~行~~〖施放主〗动〖技〗」
     （管理者实测：奥王 +11 王者制裁、捷德尊皇 +7）。
     只影响「分词颗粒度」，不改变语义（skel 是 token 串接，结果不变）。 */
  var TERMS = [
    "主动技", "能量技", "普通技", "特技", "物理", "施放", "释放", "行动",
    "攻击力", "攻击", "受击", "格挡率", "格挡", "闪避率", "闪避",
    "暴击伤害", "暴击率", "暴击", "命中率", "破挡率", "抗暴率", "免伤率",
    "生命百分比", "生命上限", "生命值", "生命",
    "治疗", "伤害", "目标", "角色", "回合", "全场", "场上", "己方", "敌方",
    "全体", "单体", "横排", "直线", "十字", "前排", "后排", "随机", "概率",
    "效果", "状态", "层数", "能量", "防御", "韧性", "受到", "造成", "获得",
    "恢复", "免疫", "叠加", "触发", "解除", "驱散", "清除", "移除", "持续"
  ];
  /* 长词优先，避免「增加」被单字切走 */
  var DICT_WORDS = Object.keys(W2T).concat(TERMS)
    .filter(function (w, i, arr) { return w && arr.indexOf(w) === i; })
    .sort(function (a, b) { return b.length - a.length; });
  var STOPW = "的了和与在将把被并且则若如每各其之中后前内外均都还就才";
  /* 标点/空白：不参与语义比较（管理者口径：标点增删不算改动） */
  var SEM_PUNCT = /^[\s，。、；：？！,,\.?!;:·…—～~\-_"“”‘’'()（）\[\]【】<>〈〉《》「」『』]$/;

  /* 分词：数字整体、词典词整体、其余逐字 */
  function semTokenize(s) {
    var src = String(s == null ? "" : s), out = [], i = 0, k, m, hit;
    while (i < src.length) {
      hit = null;
      for (k = 0; k < DICT_WORDS.length; k++) {
        if (src.substr(i, DICT_WORDS[k].length) === DICT_WORDS[k]) { hit = DICT_WORDS[k]; break; }
      }
      m = src.slice(i).match(/^\d+(?:\.\d+)?%?/);
      if (m) { out.push(m[0]); i += m[0].length; continue; }
      if (hit) { out.push(hit); i += hit.length; continue; }
      out.push(src[i]); i++;
    }
    return out;
  }
  function semOf(t) {
    return SEM_PUNCT.test(t) ? null : (W2T[t] || t);
  }
  /* 语义 token：方向词归一、等价词归一、丢标点与虚词、丢数字 */
  function semTokens(s) {
    return semTokenize(s).map(semOf).filter(function (t) {
      return t && !/^\d/.test(t) && STOPW.indexOf(t) < 0;
    });
  }
  function skel(s) { return semTokens(s).join(""); }
  function tokSet(s) { return semTokens(s).slice().sort(); }
  /* 词集 Jaccard：语序调换、虚词增删不影响判定
     （「为目标解除」↔「解除目标」是同一种描述） */
  function jac(a, b) {
    var A = tokSet(a), B = tokSet(b), i = 0, j = 0, hit = 0;
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) { hit++; i++; j++; }
      else if (A[i] < B[j]) i++; else j++;
    }
    return hit / ((A.length + B.length - hit) || 1);
  }
  function lcsRatio(a, b) {
    var A = skel(a), B = skel(b), m = A.length, n = B.length, i, j, best = 0, prev = [];
    for (j = 0; j <= n; j++) prev.push(0);
    for (i = 1; i <= m; i++) {
      var cur = [0];
      for (j = 1; j <= n; j++) {
        if (A[i - 1] === B[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
        else cur[j] = 0;
      }
      prev = cur;
    }
    return best / (Math.min(m, n) || 1);
  }
  /* 切子句：先按「。」切句（括号未闭合时不切），再按「；」切分点。
     ⚠️ 为什么要在意括号：被动正文里大量用「（<效果名>：…。）」包裹效果说明，
        括号常常跨句。若按「。」硬切，右括号会被切到下一句末尾，
        变成「…每场战斗限触发1次。）」这种错位，甚至留下孤立的「）」
        被当成一条独立的新增内容标出来（管理者 2026-10-14）。 */
  function clauses(s) {
    var src = String(s == null ? "" : s);
    var OPEN = "（([", CLOSE = "）)]";
    var sents = [], depth = 0, start = 0, i, ch;
    for (i = 0; i < src.length; i++) {
      ch = src[i];
      if (OPEN.indexOf(ch) >= 0) depth++;
      else if (CLOSE.indexOf(ch) >= 0) depth = (depth > 0) ? depth - 1 : 0;
      else if ((ch === "。" || ch === "！" || ch === "？") && depth === 0) {
        sents.push(src.slice(start, i + 1)); start = i + 1;
      }
    }
    if (start < src.length) sents.push(src.slice(start));

    var out = [];
    sents.forEach(function (sent) {
      var parts = sent.split("；");
      parts.forEach(function (p, idx) {
        if (p) out.push(idx < parts.length - 1 ? p + "；" : p);
      });
    });
    /* 合并「只含括号/标点」的碎片子句到前一条。
       按「。」切句时会把跨句的括号切碎，留下孤立的「）」，
       它被当成一条独立的新增内容标出来，纯属噪音（管理者 2026-10-14）。 */
    var cleaned = [];
    out.forEach(function (c) {
      var bare = c.replace(/[\s，。、；：？！,,\.?!;:·…—～~\-_"“”‘’'()（）\[\]【】《》「」『』]/g, "");
      if (!bare && cleaned.length) cleaned[cleaned.length - 1] += c;
      else cleaned.push(c);
    });
    return cleaned;
  }
  function nums(s) { return String(s == null ? "" : s).match(/\d+(?:\.\d+)?%?/g) || []; }
  /* 新版里出现一段「与旧版任何一句都不像」的长效果块 → 也是重做
     （短句不触发，避免把「后半段调整为：受到的所有伤害减少50%」误判成重做） */
  function hasNewBlock(A, B) {
    return B.some(function (b) {
      var cn = (b.match(/[\u4e00-\u9fa5]/g) || []).length;
      if (cn < 30) return false;
      return A.every(function (a) { return jac(a, b) < 0.5; });
    });
  }
  function isRedo(o, w) {
    var r = lcsRatio(o, w);
    if (r < 0.15) return true;
    /* ⚠️ 2026-10-14 收紧：旧版只要「出现一个与旧版任何子句都不像的长块」就判重做，
       把大量「一段重写 + 一段微调」的正常条目（泽塔 +6、捷德尊皇 +7、
       无限赛罗超限 普通技）也误标成重做。现要求**整条相似度也偏低**（<0.45）
       才配合长块判重做。 */
    if (r < 0.45 && hasNewBlock(clauses(o), clauses(w))) return true;
    return false;
  }
  /* 子句配对（2026-10-14 增补「跨子句合并」）：
     旧版只做 1↔1 配对，遇到「一个 A 子句对应相邻两个 B 子句」就会整条错位 ——
     泽塔 +6「受到能量技攻击时，立刻增加自身1点能量。」对应新版
     「全场每有一名目标施放能量技后，……；额外增加自身1点能量。」就是这种。
     现改为允许 1↔1 / 1↔2 / 2↔1 / 2↔2 四种成组方式，用 DP 取全局最优
     （组内相似度之和最大，未配对子句记小惩罚）。
     返回 [{a, b, i}]：a/b 是（可能拼接过的）子句文本，i 是 A 侧首个子句下标。 */
  function pairClauses(A, B) {
    var n = A.length, m = B.length;
    var cache = {};
    function J(i, k, j, l) {
      var key = i + ":" + k + ":" + j + ":" + l;
      if (cache[key] == null) cache[key] = jac(A.slice(i, k).join(""), B.slice(j, l).join(""));
      return cache[key];
    }
    var GAP = 0.1;                       /* 未配对子句的惩罚（鼓励尽量配上） */
    var dp = [], back = [], i, j;
    for (i = 0; i <= n; i++) { dp.push(new Float64Array(m + 1)); back.push(new Array(m + 1)); }
    for (j = 0; j <= m; j++) back[0][j] = null;
    for (i = 0; i <= n; i++) back[i][0] = null;
    for (i = 1; i <= n; i++) dp[i][0] = dp[i - 1][0] - GAP;
    for (j = 1; j <= m; j++) dp[0][j] = dp[0][j - 1] - GAP;
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        var best = dp[i - 1][j - 1] + J(i - 1, i, j - 1, j), b = [1, 1];
        /* ⚠️ 2026-10-14 修复：这两条「跳过」分支的回溯方向原先写反了
           （dp[i-1][j] 记成 [0,1]、dp[i][j-1] 记成 [1,0]），
           于是回溯路径与 DP 值不一致 —— 明明 jac=1 的同一句也会被拆成
           「新增 + 移除」（管理者实测：捷德终极 +9/+11 的「赛罗不在我才会好好加油」
           和「遭受越多的创伤才能成长！」被整句划掉）。方向必须与回溯时的
           x -= ka / y -= kb 对应：从 dp[i-1][j] 来 → 消耗 A[i-1] → ka=1,kb=0。
           注：dp 值本身是对的，只有方向标反了，所以此前很多条目「看起来还行」。 */
        var v = dp[i - 1][j] - GAP; if (v > best) { best = v; b = [1, 0]; }     /* A 多出一句 → 移除 */
        v = dp[i][j - 1] - GAP; if (v > best) { best = v; b = [0, 1]; }         /* B 多出一句 → 新增 */
        if (i >= 2 && j >= 2) { v = dp[i - 2][j - 2] + J(i - 2, i, j - 2, j); if (v > best) { best = v; b = [2, 2]; } }
        if (j >= 2) { v = dp[i - 1][j - 2] + J(i - 1, i, j - 2, j); if (v > best) { best = v; b = [1, 2]; } }
        if (i >= 2) { v = dp[i - 2][j - 1] + J(i - 2, i, j - 1, j); if (v > best) { best = v; b = [2, 1]; } }
        dp[i][j] = best; back[i][j] = b;
      }
    }
    var pairs = [], x = n, y = m;
    while (x > 0 || y > 0) {
      var bk = (x > 0 && y > 0) ? back[x][y] : (x > 0 ? [1, 0] : [0, 1]);
      if (!bk) break;
      var ka = bk[0], kb = bk[1];
      var a = ka ? A.slice(x - ka, x).join("") : null;
      var bTxt = kb ? B.slice(y - kb, y).join("") : null;
      pairs.push({ a: a, b: bTxt, i: x - ka });
      x -= ka; y -= kb;
    }
    pairs.reverse();
    return pairs;
  }
  /* 一对子句的分档（2026-10-14 重写）：
       · 就地算出「变更块」；一块都没有 = 同义反复/标点差异 → 不标注
       · 数值变了、且非数值文字几乎没动 → 数值调整（只标数值）
       · 变更占比 ≤0.55 → 就地标注（调整为）；否则整块替换 */
  function classify(a, b) {
    if (!a) return { lv: 3, kind: "new" };
    if (!b) return { lv: 3, kind: "del" };
    if (a === b) return { lv: 0 };
    var chg = inlineSegs(a, b).filter(function (s) { return !s.same; });
    if (!chg.length) return { lv: 0 };
    var na = nums(a), nb = nums(b);
    var numeric = na.length > 0 && na.length === nb.length;
    var textChg = 0;
    if (numeric) {
      chg.forEach(function (s) {
        textChg += Math.max(plainLen(s.old.replace(NUM_G, "")), plainLen(s["new"].replace(NUM_G, "")));
      });
    }
    if (numeric && textChg <= 5) {
      /* 数值确实变了、且非数值文字几乎没动 → 数值调整（只标数值）。
         若数值也没变，说明改的是文字（如「减少」→「减免」），落到下面按占比判。 */
      var sameNum = na.every(function (v, i) { return v === nb[i]; });
      if (!sameNum) return { lv: 3, kind: "inline", num: true };
    }
    var total = Math.max(plainLen(a), plainLen(b)) || 1, size = 0;
    chg.forEach(function (s) { size += Math.max(plainLen(s.old), plainLen(s["new"])); });
    if (size / total <= 0.55) return { lv: 3, kind: "inline" };
    return { lv: 3, kind: "block" };
  }
  /* ⚠️ 数值类小注（「（数值：80%→40%）」）已于 2026-10-14 移除：
     管理者要求小字只保留文字类的（如 L1 的「（原：…）」），数值变化靠就地标色表达。 */
  /* ============ 标点透明的「就地对比」引擎（2026-10-14 重写） ============
     旧版把标点也当 token 参与对齐，于是：
       · 「[物理] ↔ 〈物理〉」这种纯括号改写会因 LCS 多解错配成
         「[~~〈~~物理~~〉~~〖]〗」（管理者：方括号改〈〉不需要大改）；
       · 逗号/句号的增删会被单独标色（管理者：逗号不需要单独标黄、
         <治疗> 的右中括号不需要变成绿色）。
     现改为：**先剥掉标点与空白再对齐**，标点位置用原串下标映射回来，
     于是「纯标点差异」天然不产生任何变更块。
     再叠一层**多重集差集过滤**：只有整对子句里「A 独有 / B 独有」的规范化
     token 才算真改动 —— 这样
       ·「降低目标格挡率50% → 使目标格挡率减少50%」这种同义换位不标注；
       ·「行动 → 施放主动技」这种整体替换能整块落位（术语词表起了作用）。
     （对应管理者 2026-10-14 逐条指出的「错位」「整段划掉」「标点标色」问题。） */
  var NUM_G = /\d+(?:\.\d+)?%?/g;
  var PUNCT_G = /[\s，。、；：？！,.?!;:·…—～~\-_"“”‘’'()（）\[\]【】<>〈〉《》「」『』]/g;
  var PUNCT_ONE = /^[\s，。、；：？！,.?!;:·…—～~\-_"“”‘’'()（）\[\]【】<>〈〉《》「」『』]$/;
  function isPunctChar(ch) { return PUNCT_ONE.test(ch); }
  /* 右括号 → 配对的左括号（变更块结尾吸收配对右括号时用） */
  var PUNCT_PAIR = { "）": "（", ")": "(", "]": "[", "〉": "〈", "》": "《", "」": "「", "』": "『", "】": "【", ">": "<" };
  function plainLen(s) { return String(s == null ? "" : s).replace(PUNCT_G, "").length; }
  /* 剥标点：返回 {t: 纯文字, m: 每个字符在原串中的下标} */
  function stripPunct(s) {
    var str = String(s == null ? "" : s), t = "", m = [];
    for (var i = 0; i < str.length; i++) {
      if (!isPunctChar(str[i])) { t += str[i]; m.push(i); }
    }
    return { t: t, m: m };
  }
  /* 词级 + 字级分词（带在**剥标点串**里的下标 s/e） */
  function wtok(str) {
    var out = [], i = 0, k, hit, m;
    while (i < str.length) {
      hit = null;
      for (k = 0; k < DICT_WORDS.length; k++) {
        if (str.substr(i, DICT_WORDS[k].length) === DICT_WORDS[k]) { hit = DICT_WORDS[k]; break; }
      }
      if (hit) { out.push({ t: hit, s: i, e: i + hit.length }); i += hit.length; continue; }
      m = str.slice(i).match(/^\d+(?:\.\d+)?%?/);
      if (m) { out.push({ t: m[0], s: i, e: i + m[0].length }); i += m[0].length; continue; }
      out.push({ t: str.charAt(i), s: i, e: i + 1 }); i++;
    }
    return out;
  }
  function akey(t) { return W2T[t] || t; }
  /* 整对子句的规范化 token 多重集差集（同义/语序/标点都不算差） */
  function multExtra(a, b) {
    var ma = {}, mb = {}, i, t;
    var ta = wtok(stripPunct(a).t), tb = wtok(stripPunct(b).t);
    for (i = 0; i < ta.length; i++) { t = akey(ta[i].t); ma[t] = (ma[t] || 0) + 1; }
    for (i = 0; i < tb.length; i++) { t = akey(tb[i].t); mb[t] = (mb[t] || 0) + 1; }
    var da = {}, db = {};
    for (t in ma) if (ma[t] > (mb[t] || 0)) da[t] = 1;
    for (t in mb) if (mb[t] > (ma[t] || 0)) db[t] = 1;
    return { da: da, db: db };
  }
  function hasExtra(str, D) {
    var toks = wtok(stripPunct(str).t);
    for (var i = 0; i < toks.length; i++) if (D[akey(toks[i].t)]) return true;
    return false;
  }
  /* 两个 token 序列的 LCS 对齐 → 前向 op 列表 */
  function alignSeq(ta, tb) {
    var n = ta.length, m = tb.length, i, j;
    if (n * m > 4000000) return null;
    var dp = [];
    for (i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (i = 1; i <= n; i++) for (j = 1; j <= m; j++)
      dp[i][j] = (akey(ta[i - 1].t) === akey(tb[j - 1].t)) ? dp[i - 1][j - 1] + 1
                                                          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    var ops = [], x = n, y = m;
    while (x > 0 && y > 0) {
      if (akey(ta[x - 1].t) === akey(tb[y - 1].t)) { ops.push(["same", x - 1, y - 1]); x--; y--; }
      else if (dp[x - 1][y] >= dp[x][y - 1]) { ops.push(["del", x - 1, -1]); x--; }
      else { ops.push(["ins", -1, y - 1]); y--; }
    }
    while (x > 0) { x--; ops.push(["del", x, -1]); }
    while (y > 0) { y--; ops.push(["ins", -1, y]); }
    ops.reverse();
    return ops;
  }
  /* token 在原串里的下标区间（只含自身字符，不含夹在中间的标点） */
  function spansOf(tokens, map) {
    var sp = [];
    for (var i = 0; i < tokens.length; i++) sp.push([map[tokens[i].s], map[tokens[i].e - 1] + 1]);
    return sp;
  }
  /* 就地对比分段：返回 [{same,text} | {old,new}] */
  function inlineSegs(a, b) {
    var sa = String(a == null ? "" : a), sb = String(b == null ? "" : b);
    if (sa === sb) return [{ same: true, text: sb }];
    var A = stripPunct(sa), B = stripPunct(sb);
    if (!A.t.length || !B.t.length) {
      return A.t.length === B.t.length ? [{ same: true, text: sb }]
        : [{ old: A.t.length ? sa : "", "new": B.t.length ? sb : "" }];
    }
    var ta = wtok(A.t), tb = wtok(B.t), ops = alignSeq(ta, tb);
    if (!ops) return [{ old: sa, "new": sb }];
    var spA = spansOf(ta, A.m), spB = spansOf(tb, B.m);
    var EX = multExtra(sa, sb);
    var segs = [], curA = 0, curB = 0, i = 0, p, q, j;
    while (i < ops.length) {
      if (ops[i][0] === "same") {
        p = ops[i][1]; q = ops[i][2];
        while (i < ops.length && ops[i][0] === "same") { p = ops[i][1]; q = ops[i][2]; i++; }
        segs.push({ same: true, text: sb.slice(curB, spB[q][1]) });
        curA = spA[p][1]; curB = spB[q][1];
      } else {
        var aEnd = -1, bEnd = -1, aSeen = false, bSeen = false;
        j = i;
        while (j < ops.length && ops[j][0] !== "same") {
          if (ops[j][0] === "del") { aEnd = spA[ops[j][1]][1]; aSeen = true; }
          else { bEnd = spB[ops[j][2]][1]; bSeen = true; }
          j++;
        }
        var oTxt = aSeen ? sa.slice(curA, aEnd) : "";
        var nTxt = bSeen ? sb.slice(curB, bEnd) : "";
        /* ⚠️ 2026-10-14：块首的标点本来就会被带进来（curA/curB 落在上一 token 的末尾），
           块尾却不会 —— 于是「[特技] → <治疗>」会渲染成 `~~[特技~~〖绿:<治疗〗>`（括号被劈开，
           管理者点名「<治疗> 的右尖括号不需要变绿」）。这里把块尾**配对的右括号**补进来，
           让成对括号留在同一块里（逗号/句号仍不吸收，交给 tidySegs 按「标点不标色」处理）。
           只在块内已有**未闭合**的同型左括号时才吸收，避免把外层括号误吞。 */
        var absorb = function (txt, s, end) {
          var ch = s.charAt(end), o = PUNCT_PAIR[ch];
          if (!o) return false;
          var k = txt.lastIndexOf(o);
          if (k < 0) return false;
          return txt.slice(k + 1).indexOf(ch) < 0;   /* 左括号之后还没闭合过 */
        };
        if (aSeen) while (aEnd < sa.length && absorb(oTxt, sa, aEnd)) { aEnd++; oTxt = sa.slice(curA, aEnd); }
        if (bSeen) while (bEnd < sb.length && absorb(nTxt, sb, bEnd)) { bEnd++; nTxt = sb.slice(curB, bEnd); }
        /* 多重集差集过滤：两边都没有「独有 token」→ 只是同义/语序 → 不标注 */
        if (!hasExtra(oTxt, EX.da) && !hasExtra(nTxt, EX.db)) {
          if (nTxt) segs.push({ same: true, text: nTxt });
        } else {
          segs.push({ old: oTxt, "new": nTxt });
        }
        if (aSeen) curA = aEnd;
        if (bSeen) curB = bEnd;
        i = j;
      }
    }
    if (curB < sb.length) segs.push({ same: true, text: sb.slice(curB) });
    return tidySegs(segs);
  }
  /* 收尾：合并相邻 same、把变更块之间 ≤1 字的残渣并进去、把两侧相同的标点挪出变更块 */
  function tidySegs(segs) {
    var out = [], i, s;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      if (s.same) {
        var p0 = out[out.length - 1];
        if (p0 && p0.same) { p0.text += s.text; continue; }
        out.push({ same: true, text: s.text });
      } else out.push({ old: s.old, "new": s["new"] });
    }
    var out2 = [];
    for (i = 0; i < out.length; i++) {
      s = out[i];
      var prev = out2[out2.length - 1], next = out[i + 1];
      if (s.same && plainLen(s.text) <= 1 && prev && !prev.same && next && !next.same) {
        prev.old += s.text + next.old;
        prev["new"] += s.text + next["new"];
        i++;
        continue;
      }
      out2.push(s);
    }
    var out3 = [];
    out2.forEach(function (g) {
      if (g.same) { out3.push(g); return; }
      var oldT = g.old, newT = g["new"], lead = "", trail = "", k = 0;
      while (k < oldT.length && k < newT.length && oldT[k] === newT[k] && isPunctChar(oldT[k])) {
        lead += oldT[k]; k++;
      }
      var o = oldT.slice(k), w = newT.slice(k);
      while (o.length && w.length && o.charAt(o.length - 1) === w.charAt(w.length - 1) &&
             isPunctChar(o.charAt(o.length - 1))) {
        trail = o.charAt(o.length - 1) + trail; o = o.slice(0, -1); w = w.slice(0, -1);
      }
      /* ⚠️ 2026-10-14（管理者逐条点名）：**标点一律不标色**。
         但只对「纯新增 / 纯删除」的块生效 —— 只在单侧出现的边缘标点移出高亮区、
         按普通文字显示（用当前版本的标点）。
         不做「两侧都有内容」的替换块：那种块一旦把新侧开头的「（<」挪到删除块前面，
         句子顺序会被打乱（实测「（<正面迎击>：… ← 。每当自身」会碎成
         「（<~~每当自身~~〖绿:正面迎击>：…〗」），反而比标点染色更糟。 */
      var tail = "", head = "";
      if (!o) {                                   /* 纯新增：剥新侧边缘标点（删除线内的标点不用管） */
        while (w.length && isPunctChar(w.charAt(w.length - 1))) { tail = w.charAt(w.length - 1) + tail; w = w.slice(0, -1); }
        while (w.length && isPunctChar(w.charAt(0))) { head += w.charAt(0); w = w.slice(1); }
      }
      if (lead || head) out3.push({ same: true, text: lead + head });
      if (o === w) { if (w) out3.push({ same: true, text: w }); }
      else if (o || w) out3.push({ old: o, "new": w });
      if (tail || trail) out3.push({ same: true, text: tail + trail });
    });
    var out4 = [];
    out3.forEach(function (g) {
      var pp = out4[out4.length - 1];
      if (g.same && pp && pp.same) { pp.text += g.text; return; }
      out4.push(g);
    });
    return out4;
  }
  function inlineHtml(a, b) {
    return inlineSegs(a, b).map(function (s) {
      if (s.same) return esc(s.text);
      var r = "";
      if (s.old) r += '<span class="akp-diff akp-diff--del">' + esc(s.old) + "</span>";
      if (s["new"]) r += '<span class="akp-diff akp-diff--' + changeType(s.old, s["new"]) + '">' +
        esc(s["new"]) + "</span>";
      return r;
    }).join("");
  }
  /* 数值调整专用：**只在数值位置标注**，其余文字直接采用当前版本写法
     （官方公告同款；管理者 2026-10-14：没必要整段标红，标在数值上就够了）。 */
  function numOnlyDiff(oldT, newT) {
    var on = String(oldT == null ? "" : oldT).match(NUM_G) || [];
    var nn = String(newT == null ? "" : newT).match(NUM_G) || [];
    if (on.length !== nn.length || !on.length) return null;
    var src = String(newT == null ? "" : newT), out = "", i = 0, k = 0;
    src.replace(NUM_G, function (m, off) {
      out += esc(src.slice(i, off));
      if (on[k] === m) out += esc(m);
      else out += '<span class="akp-diff akp-diff--del">' + esc(on[k]) + "</span>" +
        '<span class="akp-diff akp-diff--' +
        (parseFloat(m) > parseFloat(on[k]) ? "buff" : "adj") + '">' + esc(m) + "</span>";
      i = off + m.length; k++;
      return m;
    });
    out += esc(src.slice(i));
    return out;
  }

  /* 重做样式（L4）：删除线老全文 + 橙色新全文 */
  function redoHtml(prev, cur) {
    return '<span class="akp-dline"><span class="akp-dlv akp-dlv--4">重做</span></span>' +
      '<span class="akp-dline"><span class="akp-diff akp-diff--del">' + esc(prev) + "</span></span>" +
      '<span class="akp-dline"><span class="akp-diff akp-diff--new">' + esc(cur) + "</span></span>";
  }
  function renderSemDiff(prev, cur) {
    if (prev === cur) return esc(cur);

    /* 整条级快速通道：语义骨架相同（已丢标点、已归同义词、已过滤虚词）
       → 只是措辞或数值差异，**不要切子句**。
       切子句是按句末标点切句的，标点一变就把句子拆开，反而把「逗号→句号」
       这种纯标点差异放大成结构变化（2026-10-13 实测踩到）。 */
    if (skel(prev) === skel(cur)) {
      var n0 = nums(prev), m0 = nums(cur);
      var same0 = n0.length === m0.length && n0.every(function (v, i) { return v === m0[i]; });
      if (same0) {
        /* 只有标点 / 虚词 / 同义词的差异（增加↔提高、减少↔降低…）
           → 按管理者口径「这种可以不用管」：直接显示当前版本文案，不标注、不加小注 */
        return esc(cur);
      }
      return '<span class="akp-dline"><span class="akp-dlv akp-dlv--2">数值调整</span>' +
        (numOnlyDiff(prev, cur) || inlineHtml(prev, cur)) + "</span>";
    }

    if (isRedo(prev, cur)) return redoHtml(prev, cur);
    var A = clauses(prev), B = clauses(cur);
    var out = "";
    pairClauses(A, B).forEach(function (p) {
      var c = classify(p.a, p.b);
      var pos = "";
      if (c.lv !== 0 && A.length > 1 && p.i >= 0) {
        pos = p.i === 0 ? "前半段" : (p.i >= A.length - 1 ? "后半段" : "中段");
      }
      if (c.lv === 0) {
        out += '<span class="akp-dline akp-ctx">' + esc(p.b) + "</span>";
      } else if (c.kind === "new") {
        out += '<span class="akp-dline"><span class="akp-dlv akp-dlv--3">新增</span>' +
          '<span class="akp-diff akp-diff--new">' + esc(p.b) + "</span></span>";
      } else if (c.kind === "del") {
        out += '<span class="akp-dline"><span class="akp-dlv akp-dlv--3">移除</span>' +
          '<span class="akp-diff akp-diff--del">' + esc(p.a) + "</span></span>";
      } else if (c.kind === "inline") {
        /* 就近标注差异处：改动占比不大 → 不整段划掉重写
           （管理者 2026-10-14：「每当」改「每次」这种区别没必要整段重写） */
        out += '<span class="akp-dline"><span class="akp-dlv akp-dlv--' + (c.num ? "2" : "3") + '">' +
          pos + (c.num ? "数值调整" : "调整为") + "</span>" +
          (c.num ? (numOnlyDiff(p.a, p.b) || inlineHtml(p.a, p.b)) : inlineHtml(p.a, p.b)) + "</span>";
      } else {
        /* 改动占比大 → 整块替换：老整块划掉 + 新整块给出 */
        out += '<span class="akp-dline"><span class="akp-dlv akp-dlv--' + (c.num ? "2" : "3") + '">' +
          pos + (c.num ? "数值调整" : "调整为") +
          '</span><span class="akp-diff akp-diff--del">' + esc(p.a) +
          '</span><span class="akp-diff akp-diff--' + changeType(p.a, p.b) + '">' +
          esc(p.b) + "</span></span>";
      }
    });
    return out;
  }

  function diffHtml(prev, cur) {
    return renderSemDiff(prev, cur);
  }

  /* 手写 diffs 的单个区块渲染：与自动分档同款标签 + 同款配色（2026-10-14 统一）。 */
  function chip(text, lv) {
    return '<span class="akp-dlv akp-dlv--' + lv + '">' + esc(text) + "</span>";
  }
  function regionHtml(d) {
    if (d.t === "del" || (!d.new && d.old)) {
      return chip(d.lb || "移除", 3) + '<span class="akp-diff akp-diff--del">' + esc(d.old) + "</span>";
    }
    if (d.t === "new" && !d.old) {
      return chip(d.lb || "新增", 3) + '<span class="akp-diff akp-diff--new">' + esc(d.new) + "</span>";
    }
    var c = classify(d.old || "", d.new || "");
    if (!d.lb && c.kind === "block") {
      return chip("调整为", 3) + '<span class="akp-diff akp-diff--del">' + esc(d.old) +
        '</span><span class="akp-diff akp-diff--' + changeType(d.old, d.new) + '">' + esc(d.new) + "</span>";
    }
    var num = d.lb === "数值调整" || (!d.lb && !!c.num);
    var body = num ? (numOnlyDiff(d.old, d.new) || inlineHtml(d.old, d.new)) : inlineHtml(d.old, d.new);
    return chip(d.lb || (num ? "数值调整" : "调整为"), num ? 2 : 3) + body;
  }

  /* 对比态：以「上一版本」正文为底，把本版落地的改动标出来。
     管理者口径：对比一律**相邻版本**（v3 比 v2、v4 比 v3）。 */
  function renderDiff(entry, verId) {
    var versions = entry.__versions;
    var idx = versions.map(function (v) { return v.id; }).indexOf(verId);
    var prevId = idx > 0 ? versions[idx - 1].id : null;
    var tp = textOf(entry, prevId || verId);
    var tc = textOf(entry, verId);

    /* 一、数据里手写了 diffs → 按手写标注（子串定位，indexOf + slice，
       不用 String.replace，避免正文里的特殊字符被当成替换模式）。
       字段：{ to?: 版本, t: "buff|adj|new|del|redo", old, new, before?, lb? }
         · old 非空 → 在「上一版正文」里定位 old，用 new 就地替换；
         · old 为空 → 插到 before 之前（没有 before 就接在末尾）；
         · lb → 显式指定标签文字（数值调整 / 调整为 / 新增 / 移除）。
       2026-10-14 管理者要求：手写 diffs 也要有「数值调整 / 调整为 / 新增」标签，
       且渲染样式与自动分档保持一致（原先只有配色、没有标签）。 */
    if (entry.diffs && entry.diffs.length) {
      var ds = entry.diffs.filter(function (d) { return !d.to || d.to === verId; });
      /* ⚠️ 2026-10-14：手写 diffs 是**按版本**给的（d.to 指定目标版本）。
         若本版没有任何匹配条目，说明本版没手写 → **落回自动分档**，
         不能直接输出「上一版正文 + 零标注」的纯文本（那样该版本就没有对比信息了）。 */
      if (!ds.length) return diffHtml(tp, tc);
      /* 手工标注 t:"redo"：机器分不清「真·重做」和「整条描述统一」时，
         在数据里写一行指定（{ to: "v3", t: "redo" }），直接走重做样式。 */
      if (ds.some(function (d) { return d.t === "redo"; })) return redoHtml(tp, tc);

      var regions = [];
      ds.forEach(function (d) {
        var start, end;
        if (d.old) {
          start = tp.indexOf(d.old);
          if (start < 0) return;                   /* 定位不到就跳过，避免误伤 */
          end = start + d.old.length;
        } else if (d.before) {
          start = tp.indexOf(d.before);
          if (start < 0) start = tp.length;
          end = start;
        } else {
          start = end = tp.length;
        }
        regions.push({ d: d, start: start, end: end });
      });
      regions.sort(function (x, y) { return x.start - y.start || x.end - y.end; });
      var html = "", cur = 0;
      regions.forEach(function (r) {
        if (r.start < cur) return;                 /* 与前一个区块重叠 → 跳过 */
        html += esc(tp.slice(cur, r.start)) + regionHtml(r.d);
        cur = r.end;
      });
      html += esc(tp.slice(cur));
      return html;
    }

    if (!prevId || tp === tc) return esc(tp);

    /* 语义分档（L0–L4）：不再逐字涂抹，也不再按「前缀 / 相似度」分支处理 */
    return diffHtml(tp, tc);
  }

  /* ---------------- 渲染一个条目 ---------------- */
  function itemEl(entry, state, verId) {
    var wrap = mk("div", "akp-item");
    var head;

    /* 条目名称：对比态下若上一版名字不同 → 旧名灰色删除线 + 新名
       （管理者 2026-10-14：名称变更要显示出来，但**不标色**，只用灰色删除线） */
    var nm = nameOf(entry, verId);
    var nameHtml = esc(nm);
    if (state.kind === "diff" && entry.__versions) {
      var vs = entry.__versions.map(function (v) { return v.id; });
      var vi = vs.indexOf(verId);
      var pvId = vi > 0 ? vs[vi - 1] : null;
      var pvNm = pvId ? nameOf(entry, pvId) : null;
      if (pvNm && pvNm !== nm) {
        var strip = function (s) { return s.replace(/\d+/g, ""); };
        if (strip(pvNm) === strip(nm) && /\d/.test(pvNm) && /\d/.test(nm)) {
          /* 只是数字变了（防御屏障6 → 防御屏障8）：文字照常，只把旧数字划掉 */
          var iA = pvNm.search(/\d/), iB = nm.search(/\d/);
          nameHtml = esc(nm.slice(0, iB)) +
            '<del class="akp-namedel">' + esc(pvNm.slice(iA)) + "</del>" +
            esc(nm.slice(iB));
        } else {
          /* 整个改名：新名在前，**旧名放在右侧**（灰色删除线），保持条目头左对齐美观 */
          nameHtml = esc(nm) + '<del class="akp-namedel">' + esc(pvNm) + "</del>";
        }
      }
    }

    if (entry.tag) {                     /* 主动技：标签 + 技能名（术语原样输出） */
      var tone = entry.tone === "cyan" ? "cyan" : "gold";
      head = mk("p", "akp-h akp-h--skill akp-h--skill--" + tone,
        '<span class="akp-tag">' + esc(entry.tag) + "</span>" +
        '<span class="akp-skill-name">' + nameHtml + "</span>");
    } else {                             /* 被动：+N + 名称 */
      head = mk("p", "akp-h",
        (entry.no ? '<span class="akp-plus">' + esc(entry.no) + "</span>" : "") + nameHtml);
    }
    wrap.appendChild(head);

    /* 正文 */
    if (state.kind === "diff") {
      if (entry.isNew) {
        wrap.className = "akp-item akp-item--new";
        wrap.appendChild(mk("p", "akp-d", "（本版新增）" + esc(textOf(entry, verId))));
      } else {
        wrap.appendChild(mk("p", "akp-d", renderDiff(entry, verId)));
      }
    } else {
      var t = textOf(entry, verId);
      if (entry.isNew && !t) return null;         /* 该版本还没有这条 */
      if (entry.isNew) wrap.className = "akp-item akp-item--new";
      var parts = String(t).split("\n");
      parts.forEach(function (p) { wrap.appendChild(mk("p", "akp-d", esc(p))); });
    }
    return wrap;
  }

  /* ---------------- 渲染一个板块 ---------------- */
  /* versions 每项字段：
       id        'v1' / 'v2' / 'v3'
       badge     标题条右上角显示的徽标，如 'v1 原始'
       btnLabel  按钮里引用它时的写法，如 'v2（加强后）'；省略则用 id */
  function vLabel(v) { return v.btnLabel || v.id; }

  function sectionEl(sec, data, opts) {
    var versions = (data.versions && data.versions.length > 1) ? data.versions : null;
    var root = mk("section", "akp-sec akp-sec--" + (sec.type || "prose"));

    /* 标题条 */
    var bar = mk("div", "akp-bar");
    bar.appendChild(mk("span", "akp-bar-label", esc(sec.title || "")));
    if (sec.badge) bar.appendChild(mk("span", "akp-badge", esc(sec.badge)));
    var verBadge = null, dateEl = null;
    /* 控件只放在「被动」板块（管理者规则：控件只在被动行）。
       2026-10-13 版式调整：日期占用标题条右端（原版本徽标位，同字体）；
       版本徽标下移到操作条左端（「被动」二字正下方），与查看/对比按钮平行。 */
    /* 2026-10-16 改：**被动板块恒定有操作条**（版本 + 对比 + 视图切换）。
       以前只有多版本角色才有操作条，单版本角色（如奥美迦朱雀装甲）整排按钮消失，
       视图切换按钮只能另找地方挂 → 格式被擅自改了。现在一律保留：
       单版本时版本/对比按钮照常显示，只是 disabled（v1 没有上一版，也没有下一版）。 */
    if (sec.type === "passive") {
      verBadge = mk("span", "akp-ver", "");
      dateEl = mk("span", "akp-ver akp-ver--date", "");
    }
    root.appendChild(bar);

    /* 内容容器（被动板块外面套折叠层） */
    var body = mk("div", "akp-body");
    var foldWrap = null;
    if (sec.type === "passive" && opts.fold) {
      foldWrap = mk("div", "akp-fold");
      var inner = mk("div", "akp-fold-inner");
      inner.appendChild(body);
      foldWrap.appendChild(inner);
    }

    /* 版本区操作条（只有本板块真的含多版本条目时才出现）
       ⚠️ **按钮只出现在「被动」板块**（管理者 2026-10-12：按钮只保留在被动那一行即可）。
       版本状态仍是全角色共享的，所以点被动的按钮，技能的正文会一起切。
       2026-10-12 按管理者设想拆成**两个独立按钮**：
         · 版本按钮（主按钮）：在当前版本上循环 v1 → v2 → … → vN → v1
         · 对比按钮：开启 / 关闭「与上一版对比」（v1 没有上一版 → 禁用） */
    var list = sec.items || sec.entries || [];
    /* 板块渲染模式（2026-10-13 扩展）：超越技原本是静态文本（heading + paras），
       不参与版本对比；现在若数据里写成 `entries`（带 texts），即与被动一样
       按版本渲染并支持对比。旧的静态写法继续兼容。
       prose 恒为静态。 */
    var listMode = sec.type === "prose" ? false
                 : (sec.type === "exceed" ? !!list.length : true);
    var hasVer = !!(sec.type === "passive" &&
                    (versions ? list.some(function (e) { return !!e.texts; }) : true));
    var verBtn = null, cmpBtn = null;
    if (hasVer) {
      var actions = mk("div", "akp-actions");
      verBtn = mk("button", "akp-btn akp-btn--solid", "");
      verBtn.type = "button";
      verBtn.setAttribute("data-akp-role", "ver");
      cmpBtn = mk("button", "akp-btn", "");
      cmpBtn.type = "button";
      cmpBtn.setAttribute("data-akp-role", "cmp");
      actions.appendChild(verBadge);          /* 版本号：「被动」正下方，与按钮平行 */
      actions.appendChild(verBtn);
      actions.appendChild(cmpBtn);
      bar.appendChild(dateEl);                /* 日期：标题条右端（原版本徽标位） */
      root.appendChild(actions);
    }

    /* 共享状态由整个角色持有 —— 管理者要求「主动技和被动技一起切换」：
       同一角色下所有板块共用一个 VS，点任一板块的按钮都会联动。 */
    var VS = opts.verState || { cur: 0, cmp: false };
    if (VS.cmp == null) VS.cmp = false;
    var registry = opts.registry || null;

    if (!listMode) {
      if (sec.heading) body.appendChild(mk("p", "akp-big", esc(sec.heading)));
      (sec.paras || []).forEach(function (p) { body.appendChild(mk("p", "akp-d", esc(p))); });
    }

    function paint() {
      var vi = VS.cur;
      /* ⚠️ 单版本角色 versions 是 null，不能直接读 .length（会 TypeError 崩掉整块） */
      if (!versions || vi >= versions.length) vi = 0;
      var curId = versions ? versions[vi].id : null;
      var prevId = (versions && vi > 0) ? versions[vi - 1].id : null;
      var inDiff = !!(prevId && VS.cmp);            /* v1 没有上一版 → 永远不是对比态 */

      /* 正文 */
      if (listMode) {
        var st = inDiff ? { kind: "diff", i: vi } : { kind: "ver", i: vi };
        body.innerHTML = "";
        /* 超越技板块可带 heading（如技能名 / 激活条件），按版本重绘时一并重建 */
        if (sec.heading) body.appendChild(mk("p", "akp-big", esc(sec.heading)));
        if (versions) list.forEach(function (e) { e.__versions = versions; });
        list.forEach(function (e) {
          var n = itemEl(e, st, curId);
          if (n) body.appendChild(n);
        });
      }

      if (!hasVer) return;

      /* 单版本角色（versions 为 null）：按钮照常显示，只是不可点。
         徽标写 v1（数据里没有 versions 就用「v1」这个约定名）。 */
      if (!versions) {
        verBadge.textContent = "v1";
        verBadge.className = "akp-ver akp-ver--cur";
        if (dateEl) dateEl.textContent = "";
        verBtn.disabled = true;
        verBtn.textContent = "查看 v1";
        cmpBtn.disabled = true;
        cmpBtn.textContent = "对比上一版";
        cmpBtn.setAttribute("aria-pressed", "false");
        return;
      }

      /* 徽标：非对比态显当前版本；对比态显「上一版 → 当前版 对比」 */
      if (inDiff) {
        verBadge.textContent = versions[vi - 1].badge + " → " + versions[vi].badge + " 对比";
        verBadge.className = "akp-ver akp-ver--diff";
      } else {
        verBadge.textContent = versions[vi].badge;
        verBadge.className = "akp-ver akp-ver--cur";
      }
      /* 日期：当前版本的上线日期（数据文件 versions[].date，缺省不显示） */
      dateEl.textContent = versions[vi].date || "";

      /* 按钮一：切到下一版（循环） */
      var nk = (vi + 1) % versions.length;
      verBtn.textContent = "查看 " + vLabel(versions[nk]);

      /* 按钮二：对比开关（v1 无上一版 → 禁用） */
      if (prevId) {
        cmpBtn.disabled = false;
        cmpBtn.textContent = inDiff ? "关闭对比" : "与 " + vLabel(versions[vi - 1]) + " 对比";
        cmpBtn.setAttribute("aria-pressed", inDiff ? "true" : "false");
      } else {
        cmpBtn.disabled = true;
        cmpBtn.textContent = "对比上一版";
        cmpBtn.setAttribute("aria-pressed", "false");
      }

      /* 联动：改共享状态后让**所有**板块重绘（主动技 + 被动技一起切） */
      function repaint() {
        if (registry && registry.length) registry.forEach(function (f) { f(); });
        else paint();
      }
      verBtn.onclick = function () { VS.cur = (VS.cur + 1) % versions.length; repaint(); };
      cmpBtn.onclick = function () { VS.cmp = !VS.cmp; repaint(); };
    }

    root.appendChild(foldWrap || body);
    paint();
    if (registry) registry.push(paint);      /* 供联动重绘 */
    root.__fold = foldWrap;
    return root;
  }

  /* ---------------- 视图模式：文字版 / 原图版（2026-10-16 加）----------------
     ⚠️ 只做「切换」，不替代文字版：版本对比（增强/调整/新增/移除着色）、
        全文搜索、读屏朗读、字号自选都只在文字层存在，图片层没有这些能力。
        所以默认是文字版，原文图只给想核对原文的玩家用。
     状态：localStorage['akp-view-mode']，默认 text；切换靠根元素 data-akp-view
     + CSS 显隐，不重建 DOM（保住滚动位置和折叠状态）。 */
  var VIEW_KEY = "akp-view-mode";
  var viewMode = "text";
  try {
    var __sv = localStorage.getItem(VIEW_KEY);
    if (__sv === "image" || __sv === "text") viewMode = __sv;
  } catch (e) {}
  var VIEW_PAINT = [];
  function setView(m) {
    viewMode = (m === "image") ? "image" : "text";
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch (e) {}
    VIEW_PAINT.forEach(function (f) { try { f(); } catch (e) {} });
  }

  /* ---------------- 挂载 ---------------- */
  function mount(el) {
    var id = el.getAttribute("data-akp-char");
    var data = REG[id];
    if (!data) {
      el.innerHTML = '<p class="akp-note">未找到角色数据：' + esc(id) + "</p>";
      return null;
    }
    /* 版本状态 + 重绘登记表：同一角色下所有板块共享，实现「一起切换」 */
    var verState = { cur: 0, cmp: false };
    var registry = [];
    var opts = {
      tools: el.getAttribute("data-akp-tools") !== "0",
      note: el.getAttribute("data-akp-note") !== "0",
      fold: el.getAttribute("data-akp-fold") !== "0",
      verState: verState,
      registry: registry
    };
    var only = el.getAttribute("data-akp-sec");
    var want = only ? only.split(",").map(function (s) { return s.trim(); }) : null;

    el.innerHTML = "";
    var folds = [];

    /* 顶部工具条 */
    if (opts.tools) {
      var tools = mk("div", "akp-tools");
      tools.appendChild(mk("span", "akp-tools-label", "字号"));
      var seg = mk("div", "akp-seg");
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", "字号");
      [["小", 0.86], ["标准", 1], ["大", 1.18], ["特大", 1.4]].forEach(function (p) {
        var b = mk("button", "akp-seg-i", p[0]);
        b.type = "button";
        b.setAttribute("data-scale", p[1]);
        b.setAttribute("aria-pressed", p[1] === 1 ? "true" : "false");
        seg.appendChild(b);
      });
      tools.appendChild(seg);

      var FOLDABLE = (data.sections || []).some(function (s) { return s.type === "passive"; });
      var foldBtn = null;
      if (opts.fold && FOLDABLE) {
        foldBtn = mk("button", "akp-btn akp-tools-push", "全部折叠");
        foldBtn.type = "button";
        tools.appendChild(foldBtn);
      }
      el.appendChild(tools);

      /* 字号交互（localStorage 记忆，键名与站点主题键互不干扰） */
      var KEY = "akp-fs";
      function apply(s, save) {
        el.style.setProperty("--akp-scale", s);
        [].forEach.call(seg.children, function (b) {
          b.setAttribute("aria-pressed", b.getAttribute("data-scale") === String(s) ? "true" : "false");
        });
        if (save) { try { localStorage.setItem(KEY, s); } catch (e) {} }
      }
      var saved = null;
      try { saved = localStorage.getItem(KEY); } catch (e) {}
      if (saved) apply(saved, false);
      seg.addEventListener("click", function (e) {
        var b = e.target.closest(".akp-seg-i");
        if (b) apply(b.getAttribute("data-scale"), true);
      });

      /* 折叠交互 */
      var folded = false;
      if (foldBtn) {
        foldBtn.onclick = function () {
          folded = !folded;
          folds.forEach(function (f) { if (f) f.classList.toggle("is-folded", folded); });
          foldBtn.textContent = folded ? "全部展开" : "全部折叠";
        };
      }
    }

    /* 板块 */
    (data.sections || []).forEach(function (sec) {
      if (want && want.indexOf(sec.type) < 0) return;
      var s = sectionEl(sec, data, opts);
      folds.push(s.__fold);
      el.appendChild(s);
    });

    /* 技能截图原图（第 5 轮口径①：原图放在底部供下载）
       清单来自 data/_images.js（生成文件），key 是角色 id。
       放在折叠层之外，避免「全部折叠」后连下载入口都看不到。 */
    var pics = (global.AKP_IMAGES || {})[id];
    if (pics && pics.shots && pics.shots.length && el.getAttribute("data-akp-shots") !== "0") {
      var shotBox = mk("div", "akp-shots");      var shotHd = mk("div", "akp-shots-hd");
      shotHd.appendChild(mk("span", "akp-shots-label", "技能截图原图"));
      shotHd.appendChild(mk("span", "akp-shots-hint", "点击下载"));
      shotBox.appendChild(shotHd);
      var shotList = mk("div", "akp-shots-list");
      pics.shots.forEach(function (s) {
        var a = mk("a", "akp-btn akp-shot", esc(s.label));
        a.href = s.src;
        a.setAttribute("download", "");
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener");
        shotList.appendChild(a);
      });
      shotBox.appendChild(shotList);
      el.appendChild(shotBox);
    }

    /* ---- 原图版视图（2026-10-16 加，仅叠加，不替代文字版）---- */
    var hasShots = !!(pics && pics.shots && pics.shots.length);
    if (hasShots && el.getAttribute("data-akp-imgview") !== "0") {
      var imgView = mk("div", "akp-imgview");

      /* 按版本分组：标签末尾带 vN 的只在该版本出现，无版本标注的常显 */
      var groups = [];
      pics.shots.forEach(function (s) {
        var m = /(v\d+)\s*$/.exec(s.label || "");
        var v = m ? m[1] : null;
        var item = mk("figure", "akp-imgview-item");
        item.appendChild(mk("figcaption", "akp-imgview-cap", esc(s.label)));
        var im = document.createElement("img");
        im.className = "akp-imgview-img";
        im.loading = "lazy";
        im.decoding = "async";
        im.alt = (s.label || "技能截图") + " 原图";
        /* 缺图 / 404 降级：占位文案 + 一键回文字版，不留破图 */
        im.onerror = function () {
          var miss = mk("div", "akp-imgview-miss", "该版本素材未收录");
          var back = mk("button", "akp-btn", "回到文字版");
          back.type = "button";
          back.onclick = function () { setView("text"); };
          miss.appendChild(back);
          item.replaceChild(miss, im);
        };
        im.src = s.src;
        item.appendChild(im);
        var g = null;
        for (var i = 0; i < groups.length; i++) if (groups[i].ver === v) { g = groups[i]; break; }
        if (!g) {
          g = { ver: v, box: mk("div", "akp-imgview-group") };
          groups.push(g);
          imgView.appendChild(g.box);
        }
        g.box.appendChild(item);
      });
      el.appendChild(imgView);

      /* 切换按钮：一律挂在「被动」板块的操作条上（多版本、单版本都一样，格式统一）。
         ⚠️ 操作条在 section 内部，图片视图要**保留这一节**（否则按钮全被藏起来，
         用户切过去就切不回来了）→ 给该节打标记，CSS 只藏正文不藏操作条。 */
      var actBar = el.querySelector(".akp-actions");
      if (actBar && actBar.parentNode) actBar.parentNode.className += " akp-sec--ctl";
      var swWrap = mk("div", "akp-viewsw");
      swWrap.setAttribute("role", "group");
      swWrap.setAttribute("aria-label", "视图切换");
      [["text", "文字版"], ["image", "原图版"]].forEach(function (p) {
        var b = mk("button", "akp-btn", p[1]);
        b.type = "button";
        b.setAttribute("data-akp-role", "view-" + p[0]);
        b.onclick = function () { setView(p[0]); };
        swWrap.appendChild(b);
      });
      actBar.appendChild(swWrap);   /* 操作条恒定存在（单版本角色也会建） */

      var versionsAll = data.versions || [];
      function applyView() {
        el.setAttribute("data-akp-view", viewMode);
        var cur = versionsAll.length
          ? versionsAll[Math.min(verState.cur, versionsAll.length - 1)].id : null;
        groups.forEach(function (g) { g.box.hidden = !!(g.ver && cur && g.ver !== cur); });
        var tbs = el.querySelectorAll(".akp-viewsw .akp-btn");
        [].forEach.call(tbs, function (b) {
          var on = b.getAttribute("data-akp-role") === "view-" + viewMode;
          b.setAttribute("aria-pressed", on ? "true" : "false");
          b.className = on ? "akp-btn akp-btn--solid" : "akp-btn";
        });

        /* 图片视图下禁用「对比」（diff 只存在于文字层），并说明原因；
           切回文字版时让各板块重绘，由 paint() 恢复按钮本来的可用状态
           （v1 无上一版 → 仍然是禁用的）。 */
        var cmp = el.querySelector('.akp-btn[data-akp-role="cmp"]');
        if (cmp) {
          if (viewMode === "image") {
            cmp.disabled = true;
            cmp.title = "原图版不支持版本对比，请切回「文字版」";
          } else {
            cmp.removeAttribute("title");
            if (registry) registry.forEach(function (f) { if (f !== applyView) f(); });
          }
        }
      }
      applyView();
      VIEW_PAINT.push(applyView);
      /* 版本切换后图片跟着换：登记进联动重绘 */
      if (registry) registry.push(applyView);
    }

    /* 脚注 */
    if (opts.note && data.note !== false) {
      var n = el.getAttribute("data-akp-note-text") || data.noteText ||
        "字体固定，字号可在顶部自选；被动板块可用「全部折叠」收起。";
      el.appendChild(mk("p", "akp-note", esc(n)));
    }
    return el;
  }

  function init(scope) {
    var nodes = (scope || document).querySelectorAll(".akp[data-akp-char]");
    [].forEach.call(nodes, mount);
  }

  var AKP = {
    register: register,
    init: init,
    mount: mount,
    get: function (id) { return REG[id]; },
    list: function () { return ORDER.map(function (id) { return REG[id]; }); },
    /* 仅供自动化测试使用（tools/akp_diff_test.js）：比对引擎的输出探针。
       规则变化（同义词/标点不计改动）靠它做断言，改引擎时务必重跑。
       __render：完整条目级对比（含手写 diffs 分支），供 tools/akp_dump.js 离线核对。 */
    __diff: diffHtml,
    __render: renderDiff,
    /* 仅供自动化测试 / 离线核对（tools/akp_diff_test.js、tools/_akp_probe.js）：
       把分档内部函数暴露出来，便于定位「为什么这句被判成重做 / 错位」。 */
    __dbg: {
      jac: jac, skel: skel, semTokens: semTokens, clauses: clauses,
      pairClauses: pairClauses, classify: classify, isRedo: isRedo,
      lcsRatio: lcsRatio, inlineSegs: inlineSegs, multExtra: multExtra
    }
  };

  global.AKP = AKP;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); });
  } else {
    init();
  }
})(window);
