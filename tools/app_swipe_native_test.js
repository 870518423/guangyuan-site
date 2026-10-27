/* 原生左边缘右滑返回静态回归（2026-10-25）
   用法：node tools/app_swipe_native_test.js
   真机手势仍需验收；这里防止关键实现被误删或阈值退回。 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const JAVA = fs.readFileSync(path.join(
  ROOT, "apk-project-v2", "android", "app", "src", "main", "java", "com", "aoxi", "tools", "MainActivity.java"
), "utf8");

let pass = 0;
let fail = 0;
function check(name, ok) {
  console.log((ok ? "  PASS  " : "  FAIL  ") + name);
  ok ? pass++ : fail++;
}
function number(name) {
  const match = new RegExp(name + "\\s*=\\s*([0-9.]+)f").exec(JAVA);
  return match ? Number(match[1]) : NaN;
}

const edge = number("SWIPE_EDGE_DP");
const min = number("SWIPE_MIN_DP");
const ratio = number("SWIPE_RATIO");
const maxMs = Number((/SWIPE_MAX_MS\s*=\s*(\d+)L/.exec(JAVA) || [])[1]);

check("使用 Activity.dispatchTouchEvent 观察完整手势", /public boolean dispatchTouchEvent\(MotionEvent event\)[\s\S]*observeSwipeGesture\(event\)[\s\S]*requestBack\(true\)/.test(JAVA));
check("不再依赖 WebView 的 setOnTouchListener", !/setOnTouchListener/.test(JAVA));
check("边缘触发区至少 32dp", edge >= 32);
check("最短右滑距离不超过 64dp", min > 0 && min <= 64);
check("水平方向判定不过严", ratio > 1 && ratio <= 1.5);
check("手势时限至少 900ms", maxMs >= 900);
check("竖向滚动会取消返回", /SWIPE_VERTICAL_CANCEL_DP/.test(JAVA) && /trackingSwipe = false/.test(JAVA));
check("系统手势排除区设在 DecorView", /View decor = getWindow\(\)\.getDecorView\(\);[\s\S]*decor\.setSystemGestureExclusionRects/.test(JAVA));
check("窗口重新获得焦点时刷新排除区", /onWindowFocusChanged[\s\S]*updateSystemGestureExclusion/.test(JAVA));

console.log("\n结果：" + pass + "/" + (pass + fail) + " 通过");
if (fail) process.exitCode = 1;
