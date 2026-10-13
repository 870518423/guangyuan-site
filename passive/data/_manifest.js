/* ============================================================
   角色清单（_manifest.js）
   ------------------------------------------------------------
   首页卡片与角色页都读这份清单。新增角色时的完整步骤：
     1) 数据文件放进 data/<id>.js（⚠️ 2026-10-13 M4 定规：文件名一律 ASCII，
        照抄 data/_模板.js；存量中文文件名保留不动，但不要再新增）
     2) 在下面数组里加一行 { id, name, file, category, tier }
     3) index.html 的底部加一行 <script src="data/<id>.js"></script>
   （char.html 不用改 —— 它按 id 从本清单里找文件动态加载）
   改完跑一次数据体检：python tools/akp_lint.py（pack_deploy.py 第五项自检也会跑）

   ready: false = **首页暂时不列出**（角色还没做完）。
     数据文件与角色页都保留，直接访问 char.html?id=xxx 仍能看；
     做完把 ready 去掉即可自动出现在首页。
   ============================================================ */
window.AKP_MANIFEST = [
  { id: "aotefuzhi-zhenzhili", name: "奥特之父真之力（突破）", file: "data/奥特之父真之力（突破）.js", category: "奥特之星", tier: "UL" },
  { id: "aotewang-ul", name: "奥特之王（UL）", file: "data/奥特之王（UL）.js", category: "奥特之星", tier: "UL" },
  { id: "jiede-zunhuang", name: "捷德尊皇形态（捷德之证）", file: "data/捷德尊皇形态（捷德之证）.js", category: "奥特之星", tier: "UL" },
  { id: "leiou-pifeng", name: "雷欧王者披风（突破）", file: "data/雷欧王者披风（突破）.js", category: "奥特之星", tier: "UL" },
  { id: "libute", name: "利布特", file: "data/利布特.js", category: "奥特之星", tier: "UL" },
  { id: "mengbiyousi-fenghuang", name: "梦比优斯凤凰勇气（突破）", file: "data/梦比优斯凤凰勇气（突破）.js", category: "奥特之星", tier: "UL" },
  { id: "taijia-sanchosuterimu", name: "泰迦三重斯特利姆", file: "data/泰迦三重斯特利姆.js", category: "奥特之星", tier: "UL" },
  { id: "yinhechusheng", name: "捷德银河初升", file: "data/捷德银河初升.js", category: "奥特之星", tier: "UL" },
  { id: "zeta-delta", name: "泽塔德尔塔天爪", file: "data/泽塔德尔塔天爪.js", category: "奥特之星", tier: "UL" },
  { id: "jiebeibeiliya", name: "极恶贝利亚", file: "data/极恶贝利亚.js", category: "宇宙人", tier: "BY", ready: false },
  { id: "oumeijia-zhuque", name: "奥美迦朱雀装甲", file: "data/奥美迦朱雀装甲.js", category: "多宇宙", tier: "BY", ready: false },
];
