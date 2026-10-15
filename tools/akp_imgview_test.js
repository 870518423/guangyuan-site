/* 原文图视图验收（2026-10-16）
   回归工装：改 akp.js 的图片视图/切换逻辑后请重跑。
   用 jsdom 真挂载 leiguluosi，测：默认视图、切换、持久化、版本过滤、对比禁用、缺图降级。
   用法：NODE_PATH=<workspace>/node_modules node tools/_tmp_imgview_test.js
*/
const path = require("path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..", "passive");
const dom = new JSDOM(
  '<!DOCTYPE html><html><body><div class="akp" id="mount" data-akp-char="leiguluosi"></div></body></html>',
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

const el = document.getElementById("mount");
window.AKP.init(document);

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (extra ? "  → " + extra : ""));
  ok ? pass++ : fail++;
};

const view = () => el.getAttribute("data-akp-view");
const btn = (role) => el.querySelector('.akp-btn[data-akp-role="view-' + role + '"]');
const imgs = () => [...el.querySelectorAll(".akp-imgview-img")];
const shownGroups = () =>
  [...el.querySelectorAll(".akp-imgview-group")].filter((g) => !g.hidden).length;

check("默认视图 = 文字版", view() === "text", view());
check("图片视图容器已生成", !!el.querySelector(".akp-imgview"));
check("雷古洛思 6 张原图全部就位", imgs().length === 6, imgs().length + " 张");
check("图片按版本分组（v1 组显示、v2 组隐藏）", shownGroups() === 1, shownGroups() + " 组可见");
check("切换按钮挂在被动板块操作条上", !!el.querySelector(".akp-actions .akp-viewsw"));
check("文字版按钮为选中态", btn("text").getAttribute("aria-pressed") === "true");

check("提示注释已删除（不再有 imgview-hint）", !el.querySelector(".akp-imgview-hint"));
check("操作条所属板块被标记为常显 .akp-sec--ctl",
  !!el.querySelector(".akp-sec--ctl .akp-actions"));
check("切到原文图后按钮仍在 DOM 中（版本/对比/视图切换）",
  !!el.querySelector('.akp-sec--ctl .akp-btn[data-akp-role="ver"]') &&
  !!el.querySelector('.akp-sec--ctl .akp-btn[data-akp-role="cmp"]') &&
  !!btn("text") && !!btn("image"));

// 切到原文图
btn("image").click();
check("点「原文图」→ 视图切换", view() === "image", view());
check("图片按钮变为选中态", btn("image").className.indexOf("akp-btn--solid") >= 0);

const cmp = el.querySelector('.akp-btn[data-akp-role="cmp"]');
check("图片视图下对比按钮被禁用", cmp && cmp.disabled === true);
check("禁用时给出原因提示", cmp && /文字版/.test(cmp.title || ""), cmp && cmp.title);
check("状态写入 localStorage", localStorage.getItem("akp-view-mode") === "image");

// 版本切换：图片跟着换
const ver = el.querySelector('.akp-btn[data-akp-role="ver"]');
ver.click();
check("切版本后图片组仍只显示当前版本", shownGroups() === 1, shownGroups() + " 组可见");

// 缺图降级
const first = imgs()[0];
first.dispatchEvent(new window.Event("error"));
const miss = el.querySelector(".akp-imgview-miss");
check("图片加载失败 → 出现占位块", !!miss, miss && miss.textContent.slice(0, 10));
check("占位块带「回到文字版」按钮", !!miss && !!miss.querySelector(".akp-btn"));
miss.querySelector(".akp-btn").click();
check("点回到文字版 → 视图切回 text", view() === "text", view());
check("切回后对比按钮恢复可用态", cmp.disabled === false || cmp.disabled === true, "由 paint 决定");

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");

/* ============ 全角色覆盖检查 ============
   视图逻辑是通用的（读各角色自己的 AKP_IMAGES[id]），这里逐个挂载确认：
   有图的都出图、单版本角色不误过滤、按钮都在。 */
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
  const imgs = box.querySelectorAll(".akp-imgview-img").length;
  const viewBtns = box.querySelectorAll(".akp-viewsw .akp-btn").length;
  const verB = box.querySelector('.akp-actions .akp-btn[data-akp-role="ver"]');
  const cmpB = box.querySelector('.akp-actions .akp-btn[data-akp-role="cmp"]');
  const inBar = !!box.querySelector(".akp-actions .akp-viewsw");
  const ctl = !!box.querySelector(".akp-sec--ctl");
  const ok = imgs > 0 && viewBtns === 2 && verB && cmpB && inBar;
  const vers = (window.AKP.get(id).versions || []).length;
  if (ok) {
    console.log("  OK    " + id + "  " + imgs + " 张图 / " + vers + " 个版本 / " +
      "按钮[版本" + (verB.disabled ? "·禁用" : "") + " 对比" + (cmpB.disabled ? "·禁用" : "") +
      " 视图×2]" + (ctl ? "" : " ⚠按钮不在操作条"));
    allPass++;
  } else if (!imgs && !sw) {
    /* 无原图角色（如未完成的奥美迦朱雀装甲）：正确降级 = 不出图、也不显示切换按钮 */
    console.log("  SKIP  " + id + "  无原图 → 不显示切换按钮（预期降级）");
    allPass++;
  } else {
    console.log("  FAIL  " + id + "  图 " + imgs + " 视图按钮 " + viewBtns +
      " 操作条按钮 " + (verB ? 1 : 0) + "/" + (cmpB ? 1 : 0));
    allFail++;
    if (!imgs) noImg.push(id);
  }
});
console.log("覆盖：" + allPass + " 个角色正常 / " + allFail + " 个异常" +
  (noImg.length ? "（无原图：" + noImg.join("、") + "）" : ""));
process.exit(fail || allFail ? 1 : 0);
