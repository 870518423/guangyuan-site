/* 比对引擎规则测试（tools/akp_diff_test.js）
   用法：node tools/akp_diff_test.js
   覆盖：
     1. 同义改写不计改动：增加↔提高、降低↔减少、角色↔目标
     2. 标点/空白差异不计改动，且显示采用**当前版本**写法
     3. 真实改动仍要标出（含数值替换不误切字符的旧 bug 防线）
     4. 同义词与真实数值混在一段时，只标真实变动部分
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

/* —— 1. 同义改写：不标改动，且显示当前版本写法 —— */
let h = diff("造成的所有伤害增加25%", "造成的所有伤害提高25%");
chk("增加→提高 不标注", !has(h), h);
chk("增加→提高 显示当前写法（提高）", plain(h).includes("提高") && !plain(h).includes("增加"), plain(h));

h = diff("使目标受到的伤害降低50%", "使目标受到的伤害减少50%");
chk("降低→减少 不标注", !has(h), h);
chk("降低→减少 显示当前写法（减少）", plain(h).includes("减少"), plain(h));

h = diff("对角色造成伤害", "对目标造成伤害");
chk("角色→目标 不标注", !has(h), h);

/* —— 2. 标点 / 空白 —— */
h = diff("造成伤害，持续2回合", "造成伤害。持续2回合");
chk("逗号→句号 不标注", !has(h), h);
chk("标点差异显示当前版本（句号）", plain(h).includes("。") && !plain(h).includes("，"), plain(h));
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
chk("混合段：同义词部分不标（不出现「增加（提高）」）", !/增加（含?提高/.test(t) && !/增加（/.test(t), t);
chk("混合段：只 1 处标注且为 40%", spans.length === 1 && spans[0].includes("40%"), JSON.stringify(spans));

const total = checks;
console.log(fails ? "\n比对规则测试：" + fails + " 项失败" : "\n比对规则测试：全部通过 " + total + "/" + total);
process.exit(fails ? 1 : 0);
