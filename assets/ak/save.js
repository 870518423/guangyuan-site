/* ============================================================
   明日方舟风格 · 收藏本网站（save.js）—— 仅首页 index.html 使用
   ------------------------------------------------------------
   按钮文案是「收藏本网站」（2026-10-18 管理者定名；此前叫「添加到桌面」），
   实际分四种情形，逻辑互不相同：

     情形 0｜微信 / QQ 内置浏览器（UA 含 MicroMessenger / QQ 内置标识）
       → 判断必须放在最前面：这类 webview 里**安装链路整条走不通**
         （没有「添加到主屏幕」，beforeinstallprompt 更是永不触发），
         唯一出路是「换到系统浏览器」。所以弹的是「在浏览器中打开」引导：
         右上角「···」→「在浏览器打开」→ 在浏览器里再点本站页头的按钮。
         面板底部同样保留「复制网址」兜底。
         ⚠️ 微信内 beforeinstallprompt 永不触发，**不要为它挂任何等待逻辑**
            （挂等待 = 按钮永远停在"处理中"，比直接给引导更糟）。

     情形 A｜浏览器支持 PWA 安装（收到 beforeinstallprompt）
       → 点击即调起系统原生安装弹窗（Chrome / Edge / 三星浏览器等）。
         用户点「安装」→ 桌面出现图标，按钮变「已装到桌面」。
         用户点「取消」→ 不硬塞说明面板，只轻提示一句，可再次点击重试。

     情形 B｜iOS Safari（永远不触发 beforeinstallprompt）
       → 弹出与系统菜单一字不差的引导：
         「分享」按钮 → 「添加到主屏幕」→ 「添加」。
         文案随「是否已是主屏幕模式」「是否已在 Safari」动态调整，
         并按 **iOS 版本分支**——iOS 26 起 Safari 默认「紧凑」布局把分享
         按钮收进了地址栏左侧的「···」菜单，文案不同（详见 iosSteps 注释）。

     情形 C｜不支持安装 / 已被浏览器拒绝（非 HTTPS、旧内核、隐私模式、
             用户此前已忽略过安装提示等）
       → lead 明确写「当前浏览器不支持安装应用」，再给浏览器自身的收藏
         功能引导（iOS/Chrome 移动端是「☆ 收藏」，桌面端是 Ctrl+D / ⌘+D）。
         面板底部给「复制网址」兜底。

   ⚠️ 「主菜单在哪」必须按品牌区分（见 menuSpot()）：国产浏览器各家不同，
      写错了用户就会「照做也找不到按钮」。已按实机核对修正的重点是
      **vivo 自带浏览器**——它右上角是「工具箱」（设置类）不是菜单，
      主菜单在**页面下方「≡」（三条横杠）**里，「收藏网站」也在那里。

   ⚠️ 浏览器不允许网页用代码把自己加进收藏夹（无任何 API），
      所以情形 C 只能"教"，不能"代做"。情形 A 的原生安装是能做到的
      最接近「一键」的形态。
   ⚠️ 面板开合一律用 transition（不用 keyframes），否则会覆盖
      translate(-50%,-50%) 导致弹层偏向右下角。
   ============================================================ */
(function () {
  "use strict";

  var btn = document.getElementById("ak-save-btn");
  if (!btn) return;

  var deferred = null;       // 暂存的 beforeinstallprompt 事件
  var bipSeen = false;       // 是否收到过 beforeinstallprompt
  var installed = false;     // 是否已安装（appinstalled 或 standalone 判定）
  var panel = null;
  var mask = null;
  var stepsEl = null;
  var leadEl = null;
  var hintEl = null;
  var toastEl = null;
  var toastTimer = null;

  /* ---------------- 环境判定 ---------------- */

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
           window.matchMedia("(display-mode: fullscreen)").matches ||
           window.matchMedia("(display-mode: minimal-ui)").matches ||
           window.navigator.standalone === true;
  }

  /* iOS：iPhone / iPad / iPod，另含 iPadOS 13+ 伪装成 Macintosh 的情况 */
  function isIOS() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  }

  /* iOS 大版本号：UA 里形如 "CPU iPhone OS 26_0 like Mac OS X"。
     取不到（iPadOS 伪装成 Macintosh 时 UA 不带 OS 号）返回 0，
     调用方按「旧版」处理——旧版文案成立区间更宽，是更安全的一侧。 */
  function iosMajor() {
    var m = (navigator.userAgent || "").match(/OS (\d+)[._]\d+/);
    return m ? parseInt(m[1], 10) : 0;
  }

  /* 微信内置浏览器：UA 含 MicroMessenger。
     用途仅是「给更贴合的引导」，被伪造也无实害。 */
  function isWeChat() {
    return /MicroMessenger/i.test(navigator.userAgent || "");
  }

  /* 手机 QQ **内置**浏览器（从聊天窗口点开链接的那个 webview）。
     🔑 判据只用 `QQ/<版本号>` 这一个 token，**不能**把 MQQBrowser / QQBrowser 也算进来：
       · QQ 内置（Android）：`… MQQBrowser/6.5 … QQ/8.9.63.10165`  ← 两个 token 都有
       · QQ 内置（iOS）   ：`… Mobile/15E148 … QQ/8.9.63.10165`     ← 只有 `QQ/`
       · **QQ 浏览器（独立 App）**：`… MQQBrowser/12.6 …`           ← 只有 MQQBrowser，**没有 `QQ/`**
     QQ 浏览器是独立 App，**能正常安装 PWA**；若把它误判成内置浏览器，
     就会错误地把用户劝去「换浏览器打开」（2026-10-11 复查时发现并修掉）。
     ⚠️ 另需限定移动端：桌面端 UA 也可能带 QQBrowser，同样不该误判。 */
  function isQQBuiltIn() {
    var ua = navigator.userAgent || "";
    if (!/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
    return /QQ\/[\d.]/.test(ua);
  }

  /* 是否落在「安装链路走不通」的内置浏览器里（微信 / 手机 QQ） */
  function inAppBrowser() {
    if (isWeChat()) return "wechat";
    if (isQQBuiltIn()) return "qq";
    return "";
  }

  /* 浏览器品牌：各家菜单路径不一样，认错了用户就会「照做也找不到按钮」 */
  function browserBrand() {
    var ua = navigator.userAgent || "";
    if (/VivoBrowser|vivoBrowser/i.test(ua)) return "vivo";
    if (/HuaweiBrowser|HarmonyOS/i.test(ua)) return "huawei";
    if (/MiuiBrowser|XiaoMi/i.test(ua)) return "xiaomi";
    if (/SamsungBrowser/i.test(ua)) return "samsung";
    if (/EdgA?\//i.test(ua)) return "edge";
    if (/Firefox|FxiOS/i.test(ua)) return "firefox";
    if (/CriOS|Chrome/i.test(ua)) return "chrome";
    return "other";
  }

  /* 主菜单在哪 —— 这是「照做也找不到」的最常见原因，必须按品牌区分。
     依据：2026-10-11 管理者用 vivo 自带浏览器**实机核对**：
       · vivo 自带浏览器：右上角那个是「工具箱」（设置类），**不是菜单**；
         真正的主菜单是**页面下方的「≡」（三条横杠）**，「收藏网站」在里面。
         → 对它说「点右上角『⋮』」是错的（旧文案就栽在这）。
       · 三星：右下角「≡」。华为 / 小米：底部「≡」或「⋮」。
     至于**没逐个核实过的品牌**（UC / 夸克 / QQ 浏览器 / 360 / 百度 / 荣耀 / OPPO / 魅族 …），
     一律走最后那行**中性兜底**：把两种常见位置都讲出来，让用户自己对号入座。
     → 原则：**只对核实过的品牌指具体位置；没把握就写宽**，
       宁可让用户多点一下，也别斩钉截铁指错地方（那是"照着做也找不到"）。 */
  function menuSpot() {
    var b = browserBrand();
    if (b === "vivo") return "页面下方的「≡」菜单（三条横杠）";
    if (b === "samsung") return "右下角的「≡」菜单";
    if (b === "huawei" || b === "xiaomi") return "底部的「≡」或「⋮」菜单";
    if (b === "firefox") return "右上角的「⋮」菜单";
    return "浏览器的菜单按钮（「≡」三条横杠，或「⋮」「⋯」三个点）——" +
           "多数在页面底部或右上角，挨个看一眼就能找到";
  }

  function platform() {
    if (isIOS()) return "ios";
    if (/Android|HarmonyOS/i.test(navigator.userAgent || "")) return "android";
    return "desktop";
  }

  /* ---------------- 轻提示条 ---------------- */

  function toast(msg, ms) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "ak-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, ms || 2600);
  }

  /* ---------------- 各情形的引导文案 ----------------
     返回 { title, lead, steps[] }，steps 为空时面板隐藏步骤列表 */

  /* 情形 B 的 iOS 分步文案 —— 按 iOS 版本分支
     ------------------------------------------------------------
     版本覆盖依据（2026-10-11 核对）：
       · iOS 13 ~ 25（iPhone）：Safari 底部固定工具栏，点一下地址栏后
         「分享」按钮就在**底部**。→ 说「底部的分享按钮」成立。
       · iOS 26+（iPhone）：Safari 改为三种标签布局，**默认是「紧凑」
         （Compact）**——分享 / 书签 / 标签图标被收进**地址栏左侧的「···」
         菜单**里；用户也可在「设置 → App → Safari → 标签」改回「底部」
         或「顶部」。→ 仍只说「底部的分享按钮」会让用户**找不到按钮**，
         所以 26+ 必须把两条路都讲出来。
       · iPad（各版本）：Safari 的「分享」在**顶部**工具栏。
     取不到版本号（iosMajor() === 0，例如 iPadOS 伪装成 Macintosh）时
     按旧版处理——旧版文案的成立区间更宽，是更安全的一侧。
     注：iOS 26 的「添加到主屏幕」面板多了一个「作为网页 App 打开」开关，
     打开后图标以独立窗口全屏启动（无地址栏），这正是本站想要的效果，
     故 26+ 顺手提示打开它。
     ------------------------------------------------------------ */
  function iosSteps() {
    var ua = navigator.userAgent || "";
    var isPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var v = iosMajor();
    var head;

    if (isPad) {
      head = "点浏览器顶部的「分享」按钮（一个方框＋向上箭头）";
    } else if (v >= 26) {
      head = "点地址栏旁的「···」按钮，在菜单里选「分享」" +
             "（若你把标签栏设成了「底部」，底部会直接显示分享图标，点它即可）";
    } else {
      head = "点浏览器底部的「分享」按钮（一个方框＋向上箭头）";
    }

    var steps = [
      head,
      "在弹出菜单里向下滑，找到「添加到主屏幕」并点它"
    ];
    steps.push(v >= 26
      ? "把「作为网页 App 打开」开关打开（全屏启动、没有地址栏），再点右上角「添加」"
      : "确认名称后点右上角「添加」，图标就出现在主屏幕上了");
    return steps;
  }

  function androidSteps() {
    var b = browserBrand();
    if (b === "vivo") {
      /* vivo 自带浏览器：主菜单在**页面下方**（三条横杠），右上角是「工具箱」。
         菜单里有没有「添加到桌面」随版本而异，所以两条路都写出来。 */
      return [
        "点" + menuSpot() + "——不是右上角的「工具箱」，那个是设置入口",
        "看菜单里有没有「添加到桌面」（有的版本叫「创建快捷方式」），有就点它",
        "如果没有，选「收藏网站」把本站存起来，以后从收藏列表一样能进来"
      ];
    }
    if (b === "samsung") {
      return [
        "点浏览器右下角的「≡」菜单",
        "选「添加页面到」→「主屏幕」",
        "点「添加」，图标就出现在主屏幕上了"
      ];
    }
    if (b === "huawei" || b === "xiaomi") {
      return [
        "点浏览器底部的「≡」或「⋮」菜单",
        "选「添加到主屏幕」",
        "确认后图标就出现在主屏幕上了"
      ];
    }
    if (b === "firefox") {
      return [
        "点浏览器右上角的「⋮」菜单",
        "选「安装」或「添加到主屏幕」",
        "确认后图标就出现在主屏幕上了"
      ];
    }
    return [
      "点" + menuSpot(),
      "选「安装应用」或「添加到主屏幕」",
      "确认后图标就出现在主屏幕上了"
    ];
  }

  function desktopSteps() {
    var isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);
    var b = browserBrand();
    if (b === "firefox") {
      return [
        "Firefox 不支持把网页装成桌面应用",
        "请改用 Edge 或 Chrome 打开本站，地址栏会出现「安装」图标",
        "或按 " + (isMac ? "⌘ + D" : "Ctrl + D") + " 把本站加入书签"
      ];
    }
    return [
      "看地址栏右侧是否有一个「⊕ / 显示器」形状的安装图标，点它即可装成桌面应用",
      "没有该图标时，按 " + (isMac ? "⌘ + D" : "Ctrl + D") + " 把本站加入书签",
      "收藏后从书签栏点开，同样能随时进来"
    ];
  }

  /* 情形 0：微信 / 手机 QQ 内置浏览器
     这类 webview 里安装链路整条走不通（没有「添加到主屏幕」，
     beforeinstallprompt 也永不触发），唯一出路是「换到系统浏览器打开」，
     所以这里教的是"怎么出去"，不是"怎么装"。 */
  function inAppContent(which) {
    var app = which === "wechat" ? "微信" : "QQ";
    return {
      title: "在浏览器中打开",
      lead: app + "内暂不能安装本站——" + app +
            "内置浏览器不提供「添加到主屏幕」，需要换到系统浏览器再装：",
      steps: [
        "点右上角的「···」按钮",
        "在菜单里选「在浏览器打开」",
        "在浏览器里打开本站后，再点页头的「收藏本网站」"
      ],
      hint: "懒得切浏览器的话，可以先点下面的「复制网址」，粘贴到浏览器地址栏打开。"
    };
  }

  /* 情形 C：完全不能安装 → lead 先明确「当前浏览器不支持安装」，
     再给"改用收藏"的路子（标题仍是「保存本站」，主旨是保存不是安装）。 */
  function fallbackContent(p) {
    if (p === "ios") {
      return {
        title: "保存本站",
        lead: "当前浏览器不支持把本站安装到主屏幕，可以改用「加入书签」保存：",
        steps: [
          "点浏览器底部的「分享」按钮（方框＋向上箭头）",
          "在菜单里选「加入书签」",
          "以后从书签列表就能直接进来"
        ]
      };
    }
    if (p === "android") {
      /* vivo 自带浏览器的「收藏网站」在页面下方「≡」里，且菜单里没有「☆ 收藏」这个叫法
         → 单独给一套，避免用户照着「右上角『⋮』」白找 */
      if (browserBrand() === "vivo") {
        return {
          title: "保存本站",
          lead: "当前浏览器不支持把本站安装到桌面，可以改用「收藏网站」保存：",
          steps: [
            "点" + menuSpot() + "——不是右上角的「工具箱」，那个是设置入口",
            "选「收藏网站」把本站存进收藏",
            "以后从收藏列表就能直接进来"
          ]
        };
      }
      return {
        title: "保存本站",
        lead: "当前浏览器不支持把本站安装到桌面，可以改用「收藏」保存：",
        steps: [
          "点" + menuSpot(),
          "选「☆ 收藏」或「添加书签」把本站存进收藏",
          "以后从收藏列表就能直接进来"
        ]
      };
    }
    return {
      title: "保存本站",
      lead: "当前浏览器不支持把本站安装为桌面应用，可以改用书签保存：",
      steps: desktopSteps().slice(1)   // 去掉"装成桌面应用"那条，只留收藏相关
    };
  }

  /* 情形 A 被取消 / 情形 B 的辅助说明 */
  function installContent(p) {
    if (p === "ios") {
      return {
        title: "添加到主屏幕",
        lead: "iPhone / iPad 需要手动添加一次，跟着做即可：",
        steps: iosSteps()
      };
    }
    if (p === "android") {
      return {
        title: "添加到桌面",
        lead: "系统没有自动弹出安装窗口，手动添加一次：",
        steps: androidSteps()
      };
    }
    return {
      title: "添加到桌面",
      lead: "系统没有自动弹出安装窗口，手动添加一次：",
      steps: desktopSteps()
    };
  }

  /* ---------------- 说明面板 ---------------- */

  function buildPanel() {
    if (panel) return;

    mask = document.createElement("div");
    mask.className = "ak-save-mask";

    panel = document.createElement("div");
    panel.className = "ak-save-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "ak-save-title");
    panel.innerHTML =
      '<div class="ak-sp-hd">' +
        '<h3 id="ak-save-title">保存本站</h3>' +
        '<button class="ak-sp-close" type="button" aria-label="关闭">✕</button>' +
      '</div>' +
      '<div class="ak-sp-bd">' +
        '<p class="ak-sp-lead"></p>' +
        '<ol class="ak-sp-list"></ol>' +
        '<p class="ak-sp-hint"></p>' +
      '</div>' +
      '<div class="ak-sp-ft">' +
        '<button class="ak-btn ak-btn-solid ak-sp-copy" type="button">复制网址</button>' +
      '</div>';

    document.body.appendChild(mask);
    document.body.appendChild(panel);

    stepsEl = panel.querySelector(".ak-sp-list");
    leadEl = panel.querySelector(".ak-sp-lead");
    hintEl = panel.querySelector(".ak-sp-hint");

    panel.querySelector(".ak-sp-close").addEventListener("click", closePanel);
    mask.addEventListener("click", closePanel);
    panel.querySelector(".ak-sp-copy").addEventListener("click", copyLink);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel();
    });
  }

  function openPanel(content) {
    buildPanel();
    var p = platform();

    panel.querySelector("#ak-save-title").textContent = content.title;
    leadEl.textContent = content.lead;

    if (content.steps && content.steps.length) {
      stepsEl.innerHTML = content.steps.map(function (t) {
        return "<li>" + t + "</li>";
      }).join("");
      stepsEl.style.display = "";
    } else {
      stepsEl.innerHTML = "";
      stepsEl.style.display = "none";
    }

    /* 只在真正「教收藏」的场景补一句安慰，避免文案噪音 */
    hintEl.textContent = content.hint || "";

    mask.classList.add("on");
    panel.classList.add("on");
    document.body.classList.add("ak-save-open");
    window.akSavePanelOpen = true;
  }

  function closePanel() {
    if (!panel) return;
    mask.classList.remove("on");
    panel.classList.remove("on");
    document.body.classList.remove("ak-save-open");
    window.akSavePanelOpen = false;
  }

  /* ---------------- 复制网址 ---------------- */

  function copyLink() {
    var url = location.href;

    function ok() { toast("网址已复制，粘贴到收藏夹即可"); }

    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, url.length);
      try { document.execCommand("copy"); ok(); }
      catch (e) { toast(url, 6000); }
      ta.remove();
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(ok, fallback);
    } else {
      fallback();
    }
  }

  /* ---------------- 按钮状态 ---------------- */

  function setLabel(text) {
    var label = btn.querySelector(".ak-save-label");
    if (label) label.textContent = text;
    btn.setAttribute("aria-label", text);
  }

  function markInstalled(text) {
    installed = true;
    btn.classList.add("is-done");
    btn.classList.remove("is-ready");
    setLabel(text || "已装到桌面");
  }

  /* 管理者 2026-10-18：按钮描述统一为「收藏本网站」，不再随系统叫法变来变去
     （iOS 原本单独叫「添加到主屏幕」）；点开后的说明面板里仍按各浏览器的实际
     叫法给步骤，那里面该写「添加到主屏幕」的地方照旧。 */
  function calibrateIdleLabel() {
    if (installed) return;
    btn.classList.remove("is-done");
    setLabel("收藏本网站");
  }

  /* ---------------- 事件绑定 ---------------- */

  if (isStandalone()) markInstalled("已在桌面");
  else calibrateIdleLabel();

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    bipSeen = true;
    if (!installed) btn.classList.add("is-ready");
  });

  window.addEventListener("appinstalled", function () {
    deferred = null;
    markInstalled("已装到桌面");
    toast("已添加到桌面 / 主屏幕");
  });

  btn.addEventListener("click", function () {
    /* 情形 3：已经在桌面模式（APK / 已安装）→ 只提示 */
    if (isStandalone() || installed) {
      toast("本站已经在你桌面上了，直接从这里打开就行");
      return;
    }

    /* 情形 0：微信 / 手机 QQ 内置浏览器 → 优先给「在浏览器中打开」引导。
       必须排在 deferred 判定之前：这类 webview 里安装整条走不通，
       就算万一拿到假的安装事件也不该调起（只会失败），引导换浏览器才是正解。 */
    var inApp = inAppBrowser();
    if (inApp) {
      openPanel(inAppContent(inApp));
      return;
    }

    /* 情形 1：有原生安装提示 → 直接调起系统弹窗 */
    if (deferred) {
      var d = deferred;
      deferred = null;
      btn.classList.remove("is-ready");

      try { d.prompt(); } catch (e) { /* 极少数内核会抛错，落到说明面板 */ }

      if (d.userChoice && d.userChoice.then) {
        d.userChoice.then(function (res) {
          if (res && res.outcome === "accepted") {
            /* appinstalled 通常随后触发，这里不抢它的口径 */
            markInstalled("已装到桌面");
          } else {
            /* 用户主动取消：不硬塞长篇说明，只轻提示，可再次点击重试 */
            toast("已取消，需要时可以再点一次");
          }
        }).catch(function () { /* 忽略 */ });
      }
      return;
    }

    /* 情形 2：iOS —— 永远没有 beforeinstallprompt，给系统菜单的精确引导 */
    if (isIOS()) {
      openPanel(installContent("ios"));
      return;
    }

    /* 情形 3：非 iOS 且拿不到安装事件。
       若浏览器其实支持安装（bipSeen 说明曾拿到过事件，可能刚被取消）→ 给安装引导；
       否则判定为不支持安装 → 主旨转为「收藏网站」。 */
    if (bipSeen) {
      openPanel(installContent(platform()));
    } else {
      var fb = fallbackContent(platform());
      fb.hint = "提示：换用 Chrome 或 Edge 打开本站，就能把图标添加到桌面。";
      openPanel(fb);
    }
  });

  /* 供本地验证用（无头截图时可在控制台调用） */
  window.akSave = {
    open: openPanel,
    close: closePanel,
    install: function () { openPanel(installContent(platform())); },
    fallback: function () { var c = fallbackContent(platform()); c.hint = "提示：换用 Chrome 或 Edge 打开本站，就能把图标添加到桌面。"; openPanel(c); },
    inapp: function () { var a = inAppBrowser(); if (a) openPanel(inAppContent(a)); },
    state: function () {
      return { platform: platform(), brand: browserBrand(), ios: isIOS(),
               iosMajor: iosMajor(), wechat: isWeChat(), qq: isQQBuiltIn(),
               inAppBrowser: inAppBrowser(),
               standalone: isStandalone(), bipSeen: bipSeen, deferred: !!deferred,
               installed: installed };
    }
  };
})();
