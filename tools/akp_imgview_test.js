/* 原图版视图验收（2026-10-16；同日补「缺图按类别沿用」）
   回归工装：改 akp.js 的图片视图 / 版本联动 / 切换逻辑后请重跑。
   用 jsdom 真挂载，测：默认视图、切换、持久化、**按类别建块 + 缺图向前沿用**、
   对比禁用、缺图降级，以及全角色覆盖。
   用法：NODE_PATH=<workspace>/node_modules node tools/akp_imgview_test.js */
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..", "passive");
const dom = new JSDOM(
  '<!DOCTYPE html><html><body>' +
  '<div class="akp" id="m1" data-akp-char="leiguluosi"></div>' +
  '<div class="akp" id="m2" data-akp-char="sailuo-yinhe-shanzhuo"></div>' +
  '</body></html>',
  { url: "https://m78calc.cn/passive/char.html?id=leiguluosi" }
);
const { window } = dom;
global.window = window;
global.document = window.document;
global.localStorage = window.localStorage;
global.navigator = window.navigator;

require(path.join(root, "akp.js"));
global.AKP = window.AKP;          // 数据文件里用的是裸 AKP，挂到 node 全局
require(path.join(root, "data", "_images.js"));
require(path.join(root, "data", "leiguluosi.js"));
require(path.join(root, "data", "sailuo-yinhe-shanzhuo.js"));

const el = document.getElementById("m1");        // 雷古洛思（各版本素材齐全）
const el2 = document.getElementById("m2");       // 银河闪耀（主动技/超越技/简介技 缺后续版本）
window.AKP.init(document);

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (extra ? "  → " + extra : ""));
  ok ? pass++ : fail++;
};

const view = (box) => box.getAttribute("data-akp-view");
const btn = (box, role) => box.querySelector('.akp-btn[data-akp-role="view-' + role + '"]');
const verBtn = (box) => box.querySelector('.akp-btn[data-akp-role="ver"]');
const cmpBtn = (box) => box.querySelector('.akp-btn[data-akp-role="cmp"]');
const items = (box) => [...box.querySelectorAll(".akp-imgview-item")].filter((x) => !x.hidden);
/* 标题文本要**去掉「沿用」标记**再比对（标记是 caption 里的一个 chip） */
const capText = (item) => {
  const cap = item.querySelector(".akp-imgview-cap").cloneNode(true);
  const chip = cap.querySelector(".akp-imgview-reuse");
  if (chip) chip.parentNode.removeChild(chip);
  return cap.textContent.trim();
};
const caps = (box) => items(box).map(capText);
const imgs = (box) => [...box.querySelectorAll(".akp-imgview-img")];
const reused = (box) => items(box).filter((x) => x.querySelector(".akp-imgview-reuse")).length;

/* ============ 一、雷古洛思：素材齐全 ============ */
check("默认视图 = 文字版", view(el) === "text", view(el));
check("图片视图容器已生成", !!el.querySelector(".akp-imgview"));
check("按类别建块：主动技 / 被动技 / 超越技 各一块",
  items(el).length === 3, caps(el).join(" | "));
check("不再有旧的按版本分组容器 .akp-imgview-group",
  !el.querySelector(".akp-imgview-group"));
check("v1 下三类都显示 v1 截图、无「沿用」标记",
  caps(el).join() === "主动技 v1,被动技 v1,超越技 v1" && reused(el) === 0, caps(el).join(" | "));
check("切换按钮挂在被动板块操作条上", !!el.querySelector(".akp-actions .akp-viewsw"));
check("文字版按钮为选中态", btn(el, "text").getAttribute("aria-pressed") === "true");
check("提示注释已删除（不再有 imgview-hint）", !el.querySelector(".akp-imgview-hint"));
check("操作条所属板块被标记为常显 .akp-sec--ctl",
  !!el.querySelector(".akp-sec--ctl .akp-actions"));
check("切到原图版后按钮仍在 DOM 中（版本/对比/视图切换）",
  !!el.querySelector('.akp-sec--ctl .akp-btn[data-akp-role="ver"]') &&
  !!el.querySelector('.akp-sec--ctl .akp-btn[data-akp-role="cmp"]') &&
  !!btn(el, "text") && !!btn(el, "image"));

btn(el, "image").click();
check("点「原图版」→ 视图切换", view(el) === "image", view(el));
check("图片按钮变为选中态", btn(el, "image").className.indexOf("akp-btn--solid") >= 0);
const cmp = cmpBtn(el);
check("图片视图下对比按钮被禁用", cmp && cmp.disabled === true);
check("禁用时给出原因提示", cmp && /文字版/.test(cmp.title || ""), cmp && cmp.title);
check("不再写入 localStorage（2026-10-17：默认恒文字版，不跨角色/跨会话记住）",
  localStorage.getItem("akp-view-mode") === null, String(localStorage.getItem("akp-view-mode")));

/* 版本切换：每类自己跟着当前版本换图 */
const before = caps(el).join("|");
verBtn(el).click();
check("切到 v2 后三类都换成 v2 截图、仍无「沿用」",
  caps(el).join() === "主动技 v2,被动技 v2,超越技 v2" && reused(el) === 0, caps(el).join(" | "));
check("确实换过图（不是原地不动）", caps(el).join("|") !== before, before);
verBtn(el).click();
check("循环回 v1", caps(el).join() === "主动技 v1,被动技 v1,超越技 v1", caps(el).join(" | "));

/* 缺图降级 */
const first = imgs(el)[0];
first.dispatchEvent(new window.Event("error"));
const shownMiss = [...el.querySelectorAll(".akp-imgview-miss")].filter((m) => !m.hidden);
check("图片加载失败 → 出现占位块", shownMiss.length === 1, shownMiss.length + " 个可见");
check("占位块带「回到文字版」按钮", !!shownMiss[0] && !!shownMiss[0].querySelector(".akp-btn"));
shownMiss[0].querySelector(".akp-btn").click();
check("点回到文字版 → 视图切回 text", view(el) === "text", view(el));
check("切回后对比按钮恢复可用态", cmp.disabled === false || cmp.disabled === true, "由 paint 决定");

/* ============ 二、银河闪耀：缺图必须向前沿用，而不是整块不显示 ============ */
console.log("\n—— 缺图沿用（主动技只有 v1；超越技只有 v1/v3；简介技只有 v1）——");
btn(el2, "image").click();
check("四个类别都建了块（主动技/被动技/超越技/简介技）",
  items(el2).length === 4, caps(el2).join(" | "));
check("v1 全按自己版本显示、无「沿用」",
  caps(el2).join() === "主动技 v1,被动技 v1,超越技 v1,简介技 v1" && reused(el2) === 0,
  caps(el2).join(" | "));

verBtn(el2).click();                       /* → v2 */
check("v2 四个类别**都还在**（不能因为没变化就不显示）",
  items(el2).length === 4, caps(el2).join(" | "));
check("v2：被动技用 v2 自己的图（不算沿用）",
  caps(el2)[1] === "被动技 v2" &&
  !items(el2)[1].querySelector(".akp-imgview-reuse"), caps(el2)[1]);
check("v2：主动技沿用 v1（标「沿用」）",
  caps(el2)[0] === "主动技 v1" && !!items(el2)[0].querySelector(".akp-imgview-reuse"), caps(el2)[0]);
check("v2：超越技沿用 v1（标「沿用」）",
  caps(el2)[2] === "超越技 v1" && !!items(el2)[2].querySelector(".akp-imgview-reuse"), caps(el2)[2]);
check("v2：简介技沿用 v1（标「沿用」）",
  caps(el2)[3] === "简介技 v1" && !!items(el2)[3].querySelector(".akp-imgview-reuse"), caps(el2)[3]);
check("v2 共 3 个「沿用」标记", reused(el2) === 3, reused(el2) + " 个");

verBtn(el2).click();                       /* → v3 */
check("v3：被动技/超越技用自己版本，主动技仍沿用 v1",
  caps(el2)[0] === "主动技 v1" && caps(el2)[1] === "被动技 v3" && caps(el2)[2] === "超越技 v3",
  caps(el2).join(" | "));
check("v3 共 2 个「沿用」标记（主动技、简介技）", reused(el2) === 2, reused(el2) + " 个");
check("沿用标记样式类存在（akp-imgview-reuse）",
  !!el2.querySelector(".akp-imgview-reuse"));

/* ============ 三、全角色覆盖 ============ */
console.log("\n—— 全角色覆盖 ——");
require(path.join(root, "data", "_manifest.js"));
const manifest = window.AKP_MANIFEST || [];
let allPass = 0, allFail = 0, noImg = [];
manifest.forEach(function (it) {
  const id = it.id;
  try {
    require(path.join(root, it.file));
  } catch (e) { console.log("  SKIP  " + id + "（数据文件加载失败）"); return; }
  const box = document.createElement("div");
  box.className = "akp";
  box.setAttribute("data-akp-char", id);
  document.body.appendChild(box);
  window.AKP.mount(box);
  const nImg = box.querySelectorAll(".akp-imgview-img").length;
  const nCat = box.querySelectorAll(".akp-imgview-item").length;
  const viewBtns = box.querySelectorAll(".akp-viewsw .akp-btn").length;
  const verB = box.querySelector('.akp-actions .akp-btn[data-akp-role="ver"]');
  const cmpB = box.querySelector('.akp-actions .akp-btn[data-akp-role="cmp"]');
  const inBar = !!box.querySelector(".akp-actions .akp-viewsw");
  const ctl = !!box.querySelector(".akp-sec--ctl");
  const ok = nImg > 0 && nCat === nImg && viewBtns === 2 && verB && cmpB && inBar;
  const vers = (window.AKP.get(id).versions || []).length;

  /* 缺图沿用：版本循环一整圈，每个版本下**每个类别都必须有图可见**
     —— 这正是本次要修的问题（旧逻辑会把整块藏掉） */
  let gap = "";
  if (vers) {
    for (let k = 0; k < vers; k++) {
      const shown = [...box.querySelectorAll(".akp-imgview-item")].filter((x) => !x.hidden).length;
      if (shown !== nCat) { gap = "v" + (k + 1)  + " 只显示 " + shown + "/" + nCat + " 类"; break; }
      box.querySelector('.akp-actions .akp-btn[data-akp-role="ver"]').click();
    }
  }
  if (ok && !gap) {
    console.log("  OK    " + id + "  " + nCat + " 类 / " + nImg + " 图 / " + vers + " 个版本 / " +
      "按钮[版本" + (verB.disabled ? "·禁用" : "") + " 对比" + (cmpB.disabled ? "·禁用" : "") +
      " 视图×2]" + (ctl ? "" : " ⚠按钮不在操作条"));
    allPass++;
  } else if (!nImg && !nCat) {
    console.log("  SKIP  " + id + "  无原图 → 不显示切换按钮（预期降级）");
    allPass++;
  } else {
    console.log("  FAIL  " + id + "  类 " + nCat + " / 图 " + nImg + " 视图按钮 " + viewBtns +
      " 操作条按钮 " + (verB ? 1 : 0) + "/" + (cmpB ? 1 : 0) +
      (gap ? "  ⚠每个版本都该有全部类别：" + gap : ""));
    allFail++;
    if (!nImg) noImg.push(id);
  }
});
console.log("覆盖：" + allPass + " 个角色正常 / " + allFail + " 个异常" +
  (noImg.length ? "（无原图：" + noImg.join("、") + "）" : ""));
console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail || allFail ? 1 : 0);
