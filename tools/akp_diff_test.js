/* 比对引擎规则测试（tools/akp_diff_test.js）
   用法：node tools/akp_diff_test.js
   覆盖：
     1. 同义改写不计改动：增加↔提高、降低↔减少（⚠️ 角色↔目标自 2026-10-14 起**要标**）
     2. 标点/空白差异不计改动，且显示采用**当前版本**写法
     3. 真实改动仍要标出（含数值替换不误切字符的旧 bug 防线）
     4. 同义词与真实数值混在一段时，只标真实变动部分
     5. 语义分档（2026-10-13）：L1 措辞调整带淡色原文小注、L2 自动写「A调整为B」、
        「减免」不归入「减少」（减少只与降低同义）、完全相同不标注
   依赖：akp.js 暴露的 AKP.__diff（调试探针）。 */
const fs = require("fs");
const path = require("path");

const AKP_PATH = path.join(__dirname, "..", "passive", "akp.js");
const CSRC = fs.existsSync(AKP_PATH)
  ? AKP_PATH
  : path.join(__dirname, "akp.js");

/* 极简 DOM 桩：akp.js 载入时会读 document.readyState 并调 init() */
global.window = global;
global.document = {
  readyState: "complete",
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} })
};
require(CSRC);
const diff = global.AKP && global.AKP.__diff;
if (typeof diff !== "function") {
  console.error("拿不到 AKP.__diff（akp.js 是否已暴露调试探针？）");
  process.exit(2);
}

let fails = 0;
const has = (h) => /akp-diff/.test(h);
let checks = 0;
const chk = (name, cond, extra) => {
  checks++;
  console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  [" + extra + "]"));
  if (!cond) fails++;
};
const plain = (h) => h.replace(/<[^>]+>/g, "");
/* 主文案 = 去掉「（原：…）」淡色小注后的正文（L1 措辞调整会带旧文案小注） */
const main = (h) => h.replace(/<span class="akp-was">[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, "");

/* —— 1. 同义改写：不标改动，且显示当前版本写法 —— */
let h = diff("造成的所有伤害增加25%", "造成的所有伤害提高25%");
chk("增加→提高 不标注", !has(h), h);
chk("增加→提高 主文案用当前写法（提高）", main(h).includes("提高") && !main(h).includes("增加"), main(h));

h = diff("使目标受到的伤害降低50%", "使目标受到的伤害减少50%");
chk("降低→减少 不标注", !has(h), h);
chk("降低→减少 显示当前写法（减少）", plain(h).includes("减少"), plain(h));

/* ⚠️ 2026-10-14 管理者改口径：角色/目标 **要标出来**
   （无限赛罗 +9、超限 普通技/+9 四处点名），不再归同义词。
   故原「角色→目标 不标注」断言反转为「必须标注」并校验两侧都出现。 */
h = diff("对角色造成伤害", "对目标造成伤害");
chk("角色→目标 标注", has(h), h);
chk("角色→目标 旧写划掉、新写标色", h.includes("akp-diff--del") && h.includes("akp-diff--adj"), h);

/* —— 2. 标点 / 空白 —— */
h = diff("造成伤害，持续2回合", "造成伤害。持续2回合");
chk("逗号→句号 不标注", !has(h), h);
chk("标点差异主文案用当前版本（句号）", main(h).includes("。") && !main(h).includes("，"), main(h));
h = diff("攻击+1000，命中率+10%", "攻击+1000 命中率+10%");
chk("增删标点 不标注", !has(h), h);

/* —— 3. 真实改动仍要标出 —— */
h = diff("攻击+3200", "攻击+5000");
chk("数值改动 仍标注", has(h), h);
h = diff("降低23%", "降低30%");
chk("23%→30% 整块替换（旧 bug 防线）", has(h) && plain(h).includes("30%") && !/（0）/.test(plain(h)), plain(h));
h = diff("造成的所有伤害减少50%", "受到的伤害减少30%");
chk("实质内容改写 仍标注", has(h), h);

/* —— 4. 同义词 + 真实数值混在同一段：只标真实变动 —— */
h = diff("造成的所有伤害增加25%，持续3回合", "造成的所有伤害提高40%，持续3回合");
const t = plain(h);
const spans = h.match(/<span class="akp-diff[^>]*">[^<]*<\/span>/g) || [];
/* 2026-10-14 起 L2 只标数值：旧值划掉 + 新值标色 = 两处标注，不含文字部分 */
chk("混合段：同义词部分不标（不出现「增加（提高）」）", !/增加（含?提高/.test(t) && !/增加（/.test(t), t);
chk("混合段：只标数值（25%划掉 + 40%标红）",
  spans.length === 2 && spans[0].includes("25%") && spans[1].includes("40%"), JSON.stringify(spans));

/* —— 5. 语义分档（2026-10-13 管理者口径） —— */
/* 2026-10-14 起：骨架数值都相同的同义反复（增加↔提高、减少↔降低、标点差异）
   按管理者口径「这种可以不用管」——不标注、不加标签、不加小注，直接显示当前文案 */
h = diff("受到的所有伤害降低5%", "受到的所有伤害减少5%");
chk("同义反复不标注、不加小注", !has(h) && !/akp-dlv/.test(h) && !/akp-was/.test(h), h);

h = diff("造成的所有伤害增加5%。受到的所有伤害减少5%", "造成的所有伤害增加5%，受到的所有伤害减少5%");
chk("仅标点差异：整条都不标注", !has(h) && !/akp-dlv/.test(h), h);

h = diff("使自身暴击率增加20%，持续2回合", "使自身暴击率增加50%，持续2回合");
chk("L2 数值调整：只在数值位置标注（不整段标色）",
  /akp-dlv--2/.test(h) &&
  /akp-diff--buff">50%</.test(h) &&
  !/akp-diff--buff">[^<]*暴击率/.test(h), h);

h = diff("使目标免伤率减少20%", "使目标免伤率减免20%");
chk("「减免」不属于「减少」（仍算改动）", has(h), h);

h = diff("每次攻击时，提升自身伤害10%，持续2回合", "每次攻击时，提升自身伤害10%，持续2回合");
chk("完全相同 → 不标注", !has(h) && !/akp-dlv/.test(h), h);

h = diff("免疫<眩晕>效果。每回合第一次受能量技攻击时，使自身破挡率和命中率均增加50%，持续2回合",
         "免疫<眩晕>效果。受到的所有伤害减少50%");
chk("官方同款：后半段调整为（整块替换，不是逐字涂抹）",
  /后半段/.test(h) && /akp-diff--del/.test(h) && !/均增加到的所有伤害/.test(plain(h)), plain(h));

/* —— 换行（长条目排版）口径（2026-10-16 管理者确认）——
   排版只插 \n、一个字都不改，所以：
     · 只多/少换行 → **不算改动**（不得出现任何 akp-diff 染色或 akp-dlv 标记）
     · 换行在对比态要**渲染成真正的折行 <br>**，让对比视图也按段断开
     · 首尾换行必须剥掉，否则段落边界会在标签后留下多余空行 */
const NL = "第一段文字，说明效果。\n第二段文字，说明机制。\n第三段文字，补充限制。";
let hn = diff(NL.replace(/\n/g, ""), NL);
chk("只加换行 → 不算改动", !has(hn) && !/akp-dlv/.test(hn), hn);
chk("对比态把换行渲染成折行 <br>（2 处）", (hn.match(/<br>/g) || []).length === 2, hn);
chk("折行不留多余空行（无 <br><br>、不以 <br> 起止）",
  !/<br><br>/.test(hn) && !/^<br>/.test(hn) && !/<br>$/.test(hn), hn);
hn = diff(NL, NL.replace(/\n/g, ""));
chk("只减换行 → 不算改动", !has(hn) && !/akp-dlv/.test(hn), hn);
hn = diff(NL, NL.replace("第二段文字", "第二段描述"));
/* 子句级分支本来就是「一个子句一行」(.akp-dline)，
   而排版的换行点全都落在 。／； 之后 → 换行正好是下一个子句的首字符，
   nlPatch 会把它当首尾换行剥掉：既不会多出空行，段落也已由子句行体现。
   所以这一路**不该出现 <br>**，只该出现「只标真实改动 + 每段各占一行」。 */
chk("换行 + 真实改动 → 只标真实改动，每段各占一行（3 个 dline）、无多余空行",
  has(hn) && /akp-diff--/.test(hn) && (hn.match(/akp-dline/g) || []).length === 3 &&
  !/<br>/.test(hn) && !/<br><br>/.test(hn), hn);
/* 而「整段一行」的快速通道（重做 / 纯标点同义）才需要 <br> 来分段 */
hn = diff(NL.replace(/\n/g, ""), "第一段文字，说明效果。\n第二段文字，说明机制。\n第三段文字，补充限制。");
chk("快速通道（内容等价、只有换行差）→ 仍按段折行 <br>×2",
  !has(hn) && (hn.match(/<br>/g) || []).length === 2, hn);

const total = checks;
console.log(fails ? "\n比对规则测试：" + fails + " 项失败" : "\n比对规则测试：全部通过 " + total + "/" + total);
process.exit(fails ? 1 : 0);
