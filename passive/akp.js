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
  var PUNCT_RE = /[\s，。、；：？！,\.\?\!;:·…—～~\-_"“”‘’'()（）\[\]【】<>《》「」『』]/;

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
  function diffHtml(prev, cur) {
    var ops = alignTokens(tokenize(prev), tokenize(cur));
    if (!ops) {                                    /* 超长兜底：整条替换 */
      return esc(prev) + '（<span class="akp-diff akp-diff--new">' + esc(cur) + "</span>）";
    }
    return refineChunks(chunkOps(ops), 3).map(function (s) {
      if (s.same != null) return esc(s.same);
      /* 兜底：比较键已把「同义词 / 标点」归一，这里再兜一层（个别不在表内的符号）
         —— 判定「其实没变」时显示**当前版本**的写法，不标注、不回退旧写法。 */
      if (canonKey(s.old) === canonKey(s.new)) return esc(s.new);
      var t = changeType(s.old, s.new);
      if (t === "del") return '<span class="akp-diff akp-diff--del">' + esc(s.old) + "</span>";
      if (t === "new") return '<span class="akp-diff akp-diff--new">' + esc(s.new) + "</span>";
      return esc(s.old) + '（<span class="akp-diff akp-diff--' + t + '">' + esc(s.new) + "</span>）";
    }).join("");
  }

  /* 对比态：以「上一版本」正文为底，把本版落地的改动标出来。
     管理者口径：对比一律**相邻版本**（v3 比 v2、v4 比 v3）。 */
  function renderDiff(entry, verId) {
    var versions = entry.__versions;
    var idx = versions.map(function (v) { return v.id; }).indexOf(verId);
    var prevId = idx > 0 ? versions[idx - 1].id : null;
    var tp = textOf(entry, prevId || verId);
    var tc = textOf(entry, verId);

    /* 一、数据里手写了 diffs → 按手写标注（子串定位，indexOf+slice，
       不用 String.replace，避免正文里的特殊字符被当成替换模式）。 */
    if (entry.diffs && entry.diffs.length) {
      var html = esc(tp);
      entry.diffs.filter(function (d) { return !d.to || d.to === verId; }).forEach(function (d) {
        var o = esc(d.old || "");
        var i = o ? html.indexOf(o) : -1;
        if (o && i < 0) return;                    /* 找不到就不动，避免误伤 */

        if (d.t === "new" && d.new && o) {
          /* 组合块：旧片段划掉 + 紧跟橙色新全文（整段重写用，位置准确） */
          html = html.slice(0, i) +
                 '<span class="akp-diff akp-diff--del">' + o + '</span>（<span class="akp-diff akp-diff--new">' + esc(d.new) + "</span>）" +
                 html.slice(i + o.length);
        } else if (d.t === "new" && d.new) {
          /* 纯新增：追加到末尾 */
          html += '（<span class="akp-diff akp-diff--new">' + esc(d.new) + "</span>）";
        } else if (d.t === "del") {
          html = html.slice(0, i) + '<span class="akp-diff akp-diff--del">' + o + "</span>" + html.slice(i + o.length);
        } else {
          html = html.slice(0, i) + o + '（<span class="akp-diff akp-diff--' + d.t + '">' + esc(d.new) + "</span>）" + html.slice(i + o.length);
        }
      });
      return html;
    }

    if (!prevId || tp === tc) return esc(tp);

    /* 二、一方是另一方的前缀（常见于「原句 + 追加效果」）→ 逐字标更好读，
       否则会整句划掉、再把整句连同新内容抄一遍。 */
    if (tc.indexOf(tp) === 0 || tp.indexOf(tc) === 0) return diffHtml(tp, tc);

    /* 三、整段重写（相似度低）→ 整条划掉 + 橙色新全文。
       逐字标注会把句子切成一堆看不懂的小括号（2026-10-12 实测踩过）。 */
    if (simRatio(tp, tc) < 0.72) {
      return '<span class="akp-diff akp-diff--del">' + esc(tp) + "</span>" +
             '（<span class="akp-diff akp-diff--new">' + esc(tc) + "</span>）";
    }

    /* 四、小改 → token 级逐块标注 */
    return diffHtml(tp, tc);
  }

  /* ---------------- 渲染一个条目 ---------------- */
  function itemEl(entry, state, verId) {
    var wrap = mk("div", "akp-item");
    var head;

    if (entry.tag) {                     /* 主动技：标签 + 技能名（术语原样输出） */
      var tone = entry.tone === "cyan" ? "cyan" : "gold";
      head = mk("p", "akp-h akp-h--skill akp-h--skill--" + tone,
        '<span class="akp-tag">' + esc(entry.tag) + "</span>" +
        '<span class="akp-skill-name">' + esc(nameOf(entry, verId)) + "</span>");
    } else {                             /* 被动：+N + 名称 */
      head = mk("p", "akp-h",
        (entry.no ? '<span class="akp-plus">' + esc(entry.no) + "</span>" : "") + esc(nameOf(entry, verId)));
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
    if (versions && sec.type === "passive") {
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
    var hasVer = !!(versions && sec.type === "passive" &&
                    list.some(function (e) { return !!e.texts; }));
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
      var shotBox = mk("div", "akp-shots");
      var shotHd = mk("div", "akp-shots-hd");
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
       规则变化（同义词/标点不计改动）靠它做断言，改引擎时务必重跑。 */
    __diff: diffHtml
  };

  global.AKP = AKP;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init(); });
  } else {
    init();
  }
})(window);
