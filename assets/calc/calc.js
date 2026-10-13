/* ============================================================
   calculator.html · 页面逻辑（M6 拆分，2026-10-13）
   ------------------------------------------------------------
   本文件由 calculator.html 原内联 <script> 主块（原第 1195–2018 行）
   **逐字节搬出**，未做任何改写：仍是经典脚本（非模块），
   顶层 const/let 与函数声明的作用域语义与原内联写法完全一致。

   结构速览（自上而下）：
     1) 常量与默认数据   STORAGE_KEY / getDefaultData / SIGN_REWARDS
     2) 状态与持久化     loadState / saveState / getDefaultDates
     3) 日期计算         computeDays / countMondaysInRange …
     4) 签到             getSignInHits / getSignInReward
     5) 收益预测核心     getResourcePrediction / getEffectiveDays …
     6) 渲染             renderCard / renderResources / renderTotals / renderDonutChart
     7) 事件与初始化     bindEvents / handleGridEvent / init
     8) PWA 注册         文件末尾（与其他页面同款）

   ⚠️ 依赖 DOM 顺序：脚本位于 <body> 末尾的 .toast 之后，与拆分前一致。
      将来若要改成 defer/module，必须重跑 tools/calc_regress.js 验收。
   ============================================================ */

  const STORAGE_KEY = 'guangyuan-forecast-data-v2';

  // ===== 默认数据 =====
  function getDefaultData() {
    return {
      payEnabled: true,
      existingAmount: 0,
      resources: [
        // 氪金项目
        { id: 'small-card',   name: '小月卡',   type: 'daily',   daily: 175,  monthlyTotal: 0,    note: '使用月卡券', isPay: true,  showDailyAvg: false, enabled: true },
        { id: 'big-card',     name: '大月卡',   type: 'daily',   daily: 275,  monthlyTotal: 0,    note: '使用月卡券', isPay: true,  showDailyAvg: false, enabled: true },
        { id: 'light-clone',  name: '光元克隆', type: 'monthly', daily: 0,    monthlyTotal: 10000, note: '',           isPay: true,  showDailyAvg: false, enabled: true },
        { id: 'battle-pass',  name: '战令',     type: 'monthly', daily: 0,    monthlyTotal: 9400,  note: '满级',       isPay: true,  showDailyAvg: false, enabled: true },
        { id: 'lifetime-pay',  name: '终身卡（氪金）', type: 'daily', daily: 200, monthlyTotal: 0, note: '', isPay: true,  showDailyAvg: false, enabled: true },
        // 游戏内产出
        { id: 'guard',        name: '警备队',   type: 'daily',   daily: 125,  monthlyTotal: 0,    note: '', isPay: false, showDailyAvg: false, enabled: true },
        { id: 'daily-task',   name: '日常',     type: 'daily',   daily: 400,  monthlyTotal: 0,    note: '', isPay: false, showDailyAvg: false, enabled: true },
        { id: 'maintenance',  name: '维护',     type: 'weekly',  weeklyAmount: 350, weeklyDay: 2, note: '', isPay: false, enabled: true },
        { id: 'prison',       name: '监狱',     type: 'daily',   daily: 200,  monthlyTotal: 0,    note: '每周一无法获得', isPay: false, showDailyAvg: false, isPrison: true, enabled: true },
        { id: 'sign-in',      name: '签到',     type: 'signin',  signDay: 1,  note: '在第4,9,14,19,24,29号分别发放20,100,150,200,250,300光元', isPay: false, enabled: true },
        { id: 'contribution', name: '贡献榜',   type: 'monthly', daily: 0,    monthlyTotal: 2100, note: '',           isPay: false, showDailyAvg: false, showEnabledToggle: true, enabled: true },
        { id: 'flip-card',    name: '翻牌',     type: 'monthly', daily: 0,    monthlyTotal: 2500, note: '可获得2000~3000光元，取中间值2500', isPay: false, showDailyAvg: false, enabled: true },
        { id: 'lifetime-free',name: '终身卡（免费）', type: 'daily', daily: 100, monthlyTotal: 0, note: '3000 ÷ 30天', isPay: false, showDailyAvg: false, enabled: true },
        { id: 'arsenal',      name: '军械箱',   type: 'arsenal', daily: 550,  monthlyTotal: 0, multiplier: 1.7, note: '日通21、22章，且19~22章轮换，每两天1192箱子，平均一天600箱子，乘数1.7', isPay: false, showDailyAvg: false, enabled: true },
        { id: 'share',        name: '每日分享', type: 'daily',   daily: 60,   monthlyTotal: 0,    note: '', isPay: false, showDailyAvg: false, enabled: true },
        { id: 'league-guess', name: '小联赛竞猜', type: 'fixed',  fixedAmount: 1000, note: '猜对一次50光元，一次比赛可以猜20次，默认全部猜对', isPay: false, showEnabledToggle: true, enabled: true },
      ]
    };
  }

  // ===== 工具函数 =====
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatNumber(n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Math.floor(n).toLocaleString('zh-CN');
  }

  // 数字滚动：优先用 counter.js（ease-out 递增），未加载时直接落值
  function setNum(el, v) {
    if (!el) return;
    if (window.akCount) window.akCount(el, v, 560);
    else el.textContent = formatNumber(v);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function showToast(message, isError) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.className = 'toast' + (isError ? ' error' : '');
    }, 2400);
  }

  // ===== 状态加载/保存 =====
  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.resources)) return getDefaultData();
        if (typeof parsed.payEnabled !== 'boolean') parsed.payEnabled = true;
        if (typeof parsed.existingAmount !== 'number' || isNaN(parsed.existingAmount)) parsed.existingAmount = 0;
        // 向后兼容：为旧数据补充 enabled 字段
        parsed.resources.forEach(r => {
          if (typeof r.enabled !== 'boolean') r.enabled = true;
        });
        // 数据迁移 v3：维护项目从 monthly(月总量1400) 迁移为 weekly(每周二350)
        const m = parsed.resources.find(r => r.id === 'maintenance');
        if (m && m.type !== 'weekly') {
          m.type = 'weekly';
          m.weeklyAmount = 350;
          m.weeklyDay = 2;
          delete m.daily;
          delete m.monthlyTotal;
          delete m.showDailyAvg;
          m.note = '';
        }
        // 数据迁移 v4：签到从 daily(每日35) 迁移为 signin(30天循环签到)
        const si = parsed.resources.find(r => r.id === 'sign-in');
        if (si && si.type !== 'signin') {
          si.type = 'signin';
          si.signDay = 1;
          delete si.daily;
          delete si.monthlyTotal;
          delete si.showDailyAvg;
          si.note = '在第4,9,14,19,24,29号分别发放20,100,150,200,250,300光元';
        }
        // 数据迁移 v3：贡献榜补齐"计入总量"开关字段
        const c = parsed.resources.find(r => r.id === 'contribution');
        if (c) c.showEnabledToggle = true;
        // 数据迁移 v3：补齐新增的"小联赛竞猜"默认项目
        if (!parsed.resources.some(r => r.id === 'league-guess')) {
          parsed.resources.push({ id: 'league-guess', name: '小联赛竞猜', type: 'fixed', fixedAmount: 1000, note: '猜对一次50光元，一次比赛可以猜20次，默认全部猜对', isPay: false, showEnabledToggle: true, enabled: true });
        }
        return parsed;
      }
    } catch (e) {
      console.warn('读取 localStorage 失败：', e);
    }
    return getDefaultData();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('写入 localStorage 失败：', e);
      showToast('数据保存失败（可能处于隐私模式）', true);
    }
  }

  // ===== 日期与周一计算 =====
  function getDefaultDates() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29); // 29天前 → 含首尾共30天
    return { start: formatDate(start), end: formatDate(end) };
  }

  function computeDays() {
    const startStr = document.getElementById('startDate').value;
    const endStr = document.getElementById('endDate').value;
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const diff = end.getTime() - start.getTime();
    if (diff < 0) return -1;
    return Math.floor(diff / 86400000) + 1;
  }

  function countMondaysInRange() {
    const startStr = document.getElementById('startDate').value;
    const endStr = document.getElementById('endDate').value;
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      if (current.getDay() === 1) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  function countTuesdaysInRange() {
    const startStr = document.getElementById('startDate').value;
    const endStr = document.getElementById('endDate').value;
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      if (current.getDay() === 2) count++;
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  // ===== 30天循环签到 =====
  // 仅第 4/9/14/19/24/29 天有奖励；第 30 天无奖励，第 31 天进入新一轮第 1 天（每轮合计 1020）
  const SIGN_REWARDS = { 4: 20, 9: 100, 14: 150, 19: 200, 24: 250, 29: 300 };

  // 从"今日为第 startDay 天"起向后连续 windowDays 天，返回命中明细 [{ordinal,pos,reward}]
  // ordinal 为连续签到序号（跨轮时 >30，如 34/39/44），pos=(ordinal-1)%30+1 为周期内位置 1..30
  function getSignInHits(startDay, windowDays) {
    const hits = [];
    if (!(windowDays > 0)) return hits;
    const s = Math.max(1, Math.min(30, Math.floor(Number(startDay)) || 1));
    for (let w = 0; w < windowDays; w++) {
      const ordinal = s + w;
      const pos = ((ordinal - 1) % 30) + 1;
      const reward = SIGN_REWARDS[pos];
      if (reward) hits.push({ ordinal, pos, reward });
    }
    return hits;
  }

  // 窗口内命中奖励总和
  function getSignInReward(startDay, windowDays) {
    return getSignInHits(startDay, windowDays).reduce((sum, h) => sum + h.reward, 0);
  }

  // 命中明细 HTML（如：第19天 +200 · 第24天 +250 …），title 提示周期内真实位置
  function getSignInDetailHtml(startDay, windowDays) {
    const hits = getSignInHits(startDay, windowDays);
    if (!hits.length) return '<span style="color:var(--text-dim)">窗口内无奖励日</span>';
    return hits
      .map(h => `<span class="signin-hit" title="周期第${h.pos}天（30天一循环）">第${h.ordinal}天 +${h.reward}</span>`)
      .join(' · ');
  }

  // ===== 预测计算 =====
  function getResourcePrediction(resource, days, mondays) {
    if (days <= 0) return 0;
    // 任意资源：enabled === false 时不参与计算（统一规则，含氪金与贡献榜）
    if (resource.enabled === false) return 0;
    let effectiveDays = days;
    if (resource.isPrison) {
      effectiveDays = Math.max(0, days - mondays);
    }
    if (resource.type === 'monthly') {
      const monthly = Number(resource.monthlyTotal) || 0;
      return Math.floor((monthly / 30) * days);
    } else if (resource.type === 'arsenal') {
      // 军械箱：每日军械箱数量 × 乘数1.7 = 每日光元，再乘天数
      const dailyArsenal = Number(resource.daily) || 0;
      const multiplier = Number(resource.multiplier) || 1.7;
      const dailyLightYuan = Math.floor(dailyArsenal * multiplier);
      return dailyLightYuan * effectiveDays;
    } else if (resource.type === 'weekly') {
      // 维护类：每周固定一天发放一次（当前为每周二），预测 = 每次发放量 × 周二次数
      const weeklyAmount = Number(resource.weeklyAmount) || 0;
      const times = countTuesdaysInRange();
      return Math.floor(weeklyAmount * times);
    } else if (resource.type === 'fixed') {
      // 固定总量：一次性活动，不随所选天数变化
      const fixed = Number(resource.fixedAmount) || 0;
      return Math.floor(fixed);
    } else if (resource.type === 'signin') {
      // 30天循环签到：今日为第 signDay 天，窗口=所选日期跨度天数 N，累计窗口内命中奖励日
      return getSignInReward(resource.signDay, days);
    } else {
      const daily = Number(resource.daily) || 0;
      return Math.floor(daily * effectiveDays);
    }
  }

  function getArsenalDailyLight(resource) {
    const dailyArsenal = Number(resource.daily) || 0;
    const multiplier = Number(resource.multiplier) || 1.7;
    return Math.floor(dailyArsenal * multiplier);
  }

  function getDailyAverage(resource) {
    if (resource.type !== 'monthly') return 0;
    const monthly = Number(resource.monthlyTotal) || 0;
    return Math.floor(monthly / 30);
  }

  function getEffectiveDays(resource, days, mondays) {
    if (resource.isPrison) return Math.max(0, days - mondays);
    return days;
  }

  // ===== 渲染单张卡片 =====
  function renderCard(resource, days, mondays) {
    const isExcluded = (resource.enabled === false);
    const predicted = isExcluded ? 0 : getResourcePrediction(resource, days, mondays);
    const typeTag = resource.type === 'monthly'
      ? '<span class="type-tag monthly-tag">月总量</span>'
      : resource.type === 'arsenal'
        ? '<span class="type-tag arsenal-tag">军械箱</span>'
        : resource.type === 'weekly'
          ? '<span class="type-tag weekly-tag">每周二</span>'
          : resource.type === 'fixed'
            ? '<span class="type-tag fixed-tag">总量</span>'
            : resource.type === 'signin'
              ? '<span class="type-tag signin-tag">循环签到</span>'
              : '<span class="type-tag">每日</span>';

    let fields = '';

    // 单个项目开关：氪金项目 + 配置了 showEnabledToggle 的项目（贡献榜/小联赛竞猜等）
    if (resource.isPay || resource.showEnabledToggle === true) {
      fields += `
        <div class="toggle-row pay-individual-toggle">
          <label class="toggle-switch">
            <input type="checkbox" data-action="toggle-enabled" data-id="${escapeHtml(resource.id)}" ${resource.enabled !== false ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
          <span class="toggle-label">${resource.enabled !== false ? '计入总量' : '已排除'}</span>
        </div>
      `;
    }

    if (resource.type === 'monthly') {
      // 月总量输入
      fields += `
        <div class="field">
          <span class="label">月总量</span>
          <input type="number" data-action="edit-monthly" data-id="${escapeHtml(resource.id)}" value="${Number(resource.monthlyTotal) || 0}" min="0" step="1" />
        </div>
      `;
      // 每日均量开关
      fields += `
        <div class="toggle-row">
          <label class="toggle-switch">
            <input type="checkbox" data-action="toggle-daily-avg" data-id="${escapeHtml(resource.id)}" ${resource.showDailyAvg ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
          <span class="toggle-label">显示每日均量</span>
        </div>
      `;
      // 每日均量（仅当开关开启时显示）
      const dailyAvg = getDailyAverage(resource);
      fields += `
        <div class="field daily-avg-field ${resource.showDailyAvg ? 'visible' : ''}">
          <span class="label">每日均量</span>
          <span class="daily-avg-value">
            <span class="daily-avg-number">${formatNumber(dailyAvg)}</span>
            <img src="assets/guangyuan.png" alt="光元" class="icon-tiny" />
          </span>
        </div>
      `;
    } else if (resource.type === 'weekly') {
      // 维护类：每次发放量输入 + 发放次数（周二数）显示
      fields += `
        <div class="field">
          <span class="label">每次发放量</span>
          <input type="number" data-action="edit-weekly" data-id="${escapeHtml(resource.id)}" value="${Number(resource.weeklyAmount) || 0}" min="0" step="1" />
        </div>
      `;
      const tuesdays = countTuesdaysInRange();
      fields += `
        <div class="field">
          <span class="label">发放次数</span>
          <span class="effective-days-value">${tuesdays} 次</span>
        </div>
      `;
    } else if (resource.type === 'fixed') {
      // 固定总量：一次性活动，直接输入一个固定值
      fields += `
        <div class="field">
          <span class="label">总量</span>
          <input type="number" data-action="edit-fixed" data-id="${escapeHtml(resource.id)}" value="${Number(resource.fixedAmount) || 0}" min="0" step="1" />
        </div>
      `;
    } else if (resource.type === 'arsenal') {
      // 军械箱：每日军械箱数量输入
      fields += `
        <div class="field">
          <span class="label">每日军械箱</span>
          <input type="number" data-action="edit-daily" data-id="${escapeHtml(resource.id)}" value="${Number(resource.daily) || 0}" min="0" step="1" />
        </div>
      `;
      // 每日光元 = 军械箱 × 1.7（计算值，不可编辑）
      const dailyLight = getArsenalDailyLight(resource);
      fields += `
        <div class="field">
          <span class="label">每日光元</span>
          <span class="daily-avg-value">
            <span class="arsenal-daily-light">${formatNumber(dailyLight)}</span>
            <img src="assets/guangyuan.png" alt="光元" class="icon-tiny" />
          </span>
        </div>
      `;
    } else if (resource.type === 'signin') {
      // 30天循环签到：输入"当前（今日）处于周期第几天" 1~30，下方展示窗口内命中明细
      fields += `
        <div class="field">
          <span class="label">当前第几天</span>
          <input type="number" data-action="edit-sign-day" data-id="${escapeHtml(resource.id)}" value="${Number(resource.signDay) || 1}" min="1" max="30" step="1" title="今天处于30天周期中的第几天（1~30）" />
        </div>
      `;
      fields += `
        <div class="field signin-detail-field">
          <span class="label">命中明细</span>
          <span class="signin-detail">${getSignInDetailHtml(resource.signDay, days)}</span>
        </div>
      `;
    } else {
      // 每日量输入
      fields += `
        <div class="field">
          <span class="label">每日量</span>
          <input type="number" data-action="edit-daily" data-id="${escapeHtml(resource.id)}" value="${Number(resource.daily) || 0}" min="0" step="1" />
        </div>
      `;
      // 监狱显示有效天数
      if (resource.isPrison) {
        const effDays = getEffectiveDays(resource, days, mondays);
        fields += `
          <div class="field">
            <span class="label">有效天数</span>
            <span class="effective-days-value">${effDays} 天</span>
          </div>
        `;
      }
    }

    // 预测总量
    fields += `
      <div class="field">
        <span class="label">预测总量</span>
        <span class="predicted-value">
          <span class="predicted-number">${formatNumber(predicted)}</span>
          <img src="assets/guangyuan.png" alt="光元" class="icon-inline" />
        </span>
      </div>
    `;

    return `
      <div class="resource-card ${resource.isPay ? 'pay-card' : ''} ${isExcluded ? 'indiv-disabled' : ''}" data-id="${escapeHtml(resource.id)}">
        <div class="card-header">
          <div class="name">${escapeHtml(resource.name)} ${typeTag}</div>
          <button class="delete-btn" data-action="delete" data-id="${escapeHtml(resource.id)}" title="删除该资源">×</button>
        </div>
        ${resource.note ? `<div class="note">${escapeHtml(resource.note)}</div>` : ''}
        ${fields}
      </div>
    `;
  }

  // ===== 渲染所有卡片 =====
  function renderResources() {
    const days = computeDays();
    const mondays = countMondaysInRange();
    const validDays = days > 0 ? days : 0;

    const payResources = state.resources.filter(r => r.isPay);
    const freeResources = state.resources.filter(r => !r.isPay);

    document.getElementById('payGrid').innerHTML = payResources.map(r => renderCard(r, validDays, mondays)).join('');
    document.getElementById('freeGrid').innerHTML = freeResources.map(r => renderCard(r, validDays, mondays)).join('');

    // 氪金区状态：根据是否有任意氪金卡开启，决定 header 徽章；同步主开关 checkbox
    const payHeader = document.getElementById('paySectionHeader');
    const payCards = state.resources.filter(r => r.isPay);
    const anyPayEnabled = payCards.some(r => r.enabled !== false);
    const allPayEnabled = payCards.every(r => r.enabled !== false);
    const payToggleEl = document.getElementById('payToggle');
    if (payToggleEl) payToggleEl.checked = allPayEnabled;
    if (anyPayEnabled) payHeader.classList.remove('excluded');
    else payHeader.classList.add('excluded');
  }

  // ===== 渲染总计 =====
  function renderTotals() {
    const days = computeDays();
    const daysEl = document.getElementById('daysValue');
    const mondayInfoEl = document.getElementById('mondayInfo');

    if (days === -1) {
      daysEl.textContent = '结束日期早于起始日期';
      daysEl.classList.add('warning');
      mondayInfoEl.textContent = '';
    } else {
      daysEl.textContent = days + ' 天';
      daysEl.classList.remove('warning');
      const mondays = countMondaysInRange();
      if (mondays > 0) {
        mondayInfoEl.textContent = `其中周一 ${mondays} 天（监狱不产出）`;
      } else {
        mondayInfoEl.textContent = '';
      }
    }

    const validDays = days > 0 ? days : 0;
    const mondays = countMondaysInRange();
    let total = 0;
    state.resources.forEach(r => {
      total += getResourcePrediction(r, validDays, mondays);
    });

    setNum(document.getElementById('totalPredicted'), total);

    const existing = Math.floor(Number(state.existingAmount) || 0);
    const grand = total + existing;
    setNum(document.getElementById('grandTotal'), grand);
    // 同步移动端固定底栏
    setNum(document.getElementById('mobileGrandTotal'), grand);

    // 渲染圆环图
    renderDonutChart(validDays, mondays);
  }

  // ===== 圆环图（各资源预测量占比，纯 SVG 离线渲染）=====
  function renderDonutChart(validDays, mondays) {
    const DONUT_COLORS = [
      '#a855f7', '#3b82f6', '#fbbf24', '#10b981', '#ec4899',
      '#06b6d4', '#f97316', '#8b5cf6', '#22c55e', '#ef4444',
      '#0ea5e9', '#eab308', '#d946ef', '#14b8a6', '#f43f5e'
    ];
    const svg = document.getElementById('donutChart');
    const legend = document.getElementById('donutLegend');
    const centerVal = document.getElementById('donutCenterValue');
    if (!svg || !legend || !centerVal) return;

    // 计算每个 enabled 资源的预测值，并按 state 顺序预分配颜色
    const items = state.resources
      .map((r, idx) => ({
        name: r.name,
        value: getResourcePrediction(r, validDays, mondays),
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
      }))
      .filter(it => it.value > 0);

    const total = items.reduce((s, it) => s + it.value, 0);
    setNum(centerVal, total);

    if (total <= 0) {
      svg.innerHTML = `<circle cx="100" cy="100" r="80" fill="none" stroke="rgba(148,163,184,0.15)" stroke-width="22"/>`;
      legend.innerHTML = `<div class="donut-empty">暂无数据</div>`;
      return;
    }

    const R = 80;
    const C = 2 * Math.PI * R;
    let offset = 0;
    let circles = '';
    items.forEach((it, i) => {
      const len = (it.value / total) * C;
      circles += `<circle class="ak-arc" style="animation-delay:${Math.min(i * 45, 360)}ms" cx="100" cy="100" r="${R}" fill="none" stroke="${it.color}" stroke-width="22"
        stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 100 100)"/>`;
      offset += len;
    });
    svg.innerHTML = circles;
    // 重放整体进场动画（<svg> 元素被复用，需手动重启）
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      svg.style.animation = 'none'; void svg.offsetWidth; svg.style.animation = '';
    }

    // Legend：按数值降序，平铺列出所有项目（不再合并"其他"）
    const sorted = [...items].sort((a, b) => b.value - a.value);
    let legendHtml = sorted.map(it => {
      const pct = ((it.value / total) * 100).toFixed(1);
      return `<div class="legend-item">
        <span class="legend-dot" style="background:${it.color}"></span>
        <span class="legend-name">${escapeHtml(it.name)}</span>
        <span class="legend-value">${formatNumber(it.value)}<span class="legend-pct">${pct}%</span></span>
      </div>`;
    }).join('');
    legend.innerHTML = legendHtml;
  }

  function renderAll() {
    renderResources();
    renderTotals();
  }

  // ===== 局部更新（避免输入失焦）=====
  function updateCardPrediction(resource) {
    const days = computeDays();
    const mondays = countMondaysInRange();
    const validDays = days > 0 ? days : 0;
    const isExcluded = (resource.enabled === false);
    const predicted = isExcluded ? 0 : getResourcePrediction(resource, validDays, mondays);

    document.querySelectorAll(`.resource-card[data-id="${CSS.escape(resource.id)}"]`).forEach(card => {
      const numEl = card.querySelector('.predicted-number');
      if (numEl) numEl.textContent = formatNumber(predicted);
      // 监狱有效天数更新
      if (resource.isPrison) {
        const effEl = card.querySelector('.effective-days-value');
        if (effEl) effEl.textContent = getEffectiveDays(resource, validDays, mondays) + ' 天';
      }
      // 月总量的每日均量更新
      if (resource.type === 'monthly') {
        const avgEl = card.querySelector('.daily-avg-number');
        if (avgEl) avgEl.textContent = formatNumber(getDailyAverage(resource));
      }
      // 军械箱的每日光元更新
      if (resource.type === 'arsenal') {
        const lightEl = card.querySelector('.arsenal-daily-light');
        if (lightEl) lightEl.textContent = formatNumber(getArsenalDailyLight(resource));
      }
      // 循环签到的命中明细刷新（signDay 或日期窗口变化）
      if (resource.type === 'signin') {
        const detEl = card.querySelector('.signin-detail');
        if (detEl) detEl.innerHTML = getSignInDetailHtml(resource.signDay, validDays);
      }
    });
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 日期变化
    document.getElementById('startDate').addEventListener('change', () => { renderAll(); saveState(); });
    document.getElementById('endDate').addEventListener('change', () => { renderAll(); saveState(); });

    // 氪金主开关：作为"全选/全不选"快捷键，批量设置每个氪金卡的 enabled
    document.getElementById('payToggle').addEventListener('change', (e) => {
      const on = e.target.checked;
      state.resources.filter(r => r.isPay).forEach(r => { r.enabled = on; });
      state.payEnabled = on;
      renderAll();
      saveState();
      showToast(on ? '已批量纳入所有氪金项目' : '已批量排除所有氪金项目（仍可单卡开启）');
    });

    // 现有光元输入
    document.getElementById('existingAmount').addEventListener('input', (e) => {
      const val = e.target.value;
      const num = val === '' ? 0 : Math.floor(Number(val));
      state.existingAmount = isNaN(num) ? 0 : num;
      renderTotals();
      saveState();
    });

    // 资源网格事件委托
    function handleGridEvent(gridId) {
      const grid = document.getElementById(gridId);
      grid.addEventListener('input', (e) => {
        const t = e.target;
        if (t.matches('input[data-action="edit-daily"]')) {
          const id = t.dataset.id;
          const resource = state.resources.find(r => r.id === id);
          if (resource) {
            const num = t.value === '' ? 0 : Math.floor(Number(t.value));
            resource.daily = isNaN(num) ? 0 : num;
            updateCardPrediction(resource);
            renderTotals();
            saveState();
          }
        }
        if (t.matches('input[data-action="edit-monthly"]')) {
          const id = t.dataset.id;
          const resource = state.resources.find(r => r.id === id);
          if (resource) {
            const num = t.value === '' ? 0 : Math.floor(Number(t.value));
            resource.monthlyTotal = isNaN(num) ? 0 : num;
            updateCardPrediction(resource);
            renderTotals();
            saveState();
          }
        }
        if (t.matches('input[data-action="edit-weekly"]')) {
          const id = t.dataset.id;
          const resource = state.resources.find(r => r.id === id);
          if (resource) {
            const num = t.value === '' ? 0 : Math.floor(Number(t.value));
            resource.weeklyAmount = isNaN(num) ? 0 : num;
            updateCardPrediction(resource);
            renderTotals();
            saveState();
          }
        }
        if (t.matches('input[data-action="edit-fixed"]')) {
          const id = t.dataset.id;
          const resource = state.resources.find(r => r.id === id);
          if (resource) {
            const num = t.value === '' ? 0 : Math.floor(Number(t.value));
            resource.fixedAmount = isNaN(num) ? 0 : num;
            updateCardPrediction(resource);
            renderTotals();
            saveState();
          }
        }
        if (t.matches('input[data-action="edit-sign-day"]')) {
          const id = t.dataset.id;
          const resource = state.resources.find(r => r.id === id);
          if (resource) {
            if (t.value === '') return;               // 清空/输入中间态不处理，避免误写
            let v = Math.floor(Number(t.value));
            if (isNaN(v)) return;
            if (v < 1) v = 1;                         // clamp 1..30
            if (v > 30) v = 30;
            if (String(t.value) !== String(v)) t.value = v;   // 越界立即回写输入框
            resource.signDay = v;
            updateCardPrediction(resource);
            renderTotals();
            saveState();
          }
        }
      });

      grid.addEventListener('change', (e) => {
        const t = e.target;
        if (t.matches('input[data-action="toggle-daily-avg"]')) {
          const id = t.dataset.id;
          const resource = state.resources.find(r => r.id === id);
          if (resource) {
            resource.showDailyAvg = t.checked;
            // 局部切换显示，避免重渲染
            const card = t.closest('.resource-card');
            if (card) {
              const avgField = card.querySelector('.daily-avg-field');
              if (avgField) {
                if (t.checked) avgField.classList.add('visible');
                else avgField.classList.remove('visible');
              }
            }
            saveState();
          }
        }
        if (t.matches('input[data-action="toggle-enabled"]')) {
          const id = t.dataset.id;
          const resource = state.resources.find(r => r.id === id);
          if (resource) {
            resource.enabled = t.checked;
            // 局部更新：卡片变灰 + 预测清零 + 总和刷新
            const card = t.closest('.resource-card');
            if (card) {
              if (t.checked) card.classList.remove('indiv-disabled');
              else card.classList.add('indiv-disabled');
              const label = card.querySelector('.pay-individual-toggle .toggle-label');
              if (label) label.textContent = t.checked ? '计入总量' : '已排除';
            }
            // 同步氪金主开关 checkbox + header 徽章状态
            const payCards = state.resources.filter(r => r.isPay);
            const allPayOn = payCards.length > 0 && payCards.every(r => r.enabled !== false);
            const anyPayOn = payCards.some(r => r.enabled !== false);
            const ptEl = document.getElementById('payToggle');
            if (ptEl) ptEl.checked = allPayOn;
            const phEl = document.getElementById('paySectionHeader');
            if (phEl) { if (anyPayOn) phEl.classList.remove('excluded'); else phEl.classList.add('excluded'); }
            renderTotals();
            saveState();
            showToast(t.checked ? `已纳入：${resource.name}` : `已排除：${resource.name}`);
          }
        }
      });

      grid.addEventListener('click', (e) => {
        const t = e.target;
        if (t.matches('button[data-action="delete"]')) {
          const id = t.dataset.id;
          const resource = state.resources.find(r => r.id === id);
          if (!resource) return;
          if (confirm(`确定删除资源「${resource.name}」吗？`)) {
            state.resources = state.resources.filter(r => r.id !== id);
            renderAll();
            saveState();
            showToast(`已删除：${resource.name}`);
          }
        }
      });
    }

    handleGridEvent('payGrid');
    handleGridEvent('freeGrid');

    // 添加自定义资源
    document.getElementById('addBtn').addEventListener('click', () => {
      const name = prompt('请输入资源名称：');
      if (name === null) return;
      const trimmedName = name.trim();
      if (!trimmedName) {
        showToast('资源名称不能为空', true);
        return;
      }
      const typeChoice = confirm('点击「确定」添加为【每日量】资源\n点击「取消」添加为【月总量】资源');
      const type = typeChoice ? 'daily' : 'monthly';
      const valuePrompt = type === 'daily' ? '请输入每日固定获取量：' : '请输入月总量：';
      const valueStr = prompt(valuePrompt);
      if (valueStr === null) return;
      const value = Math.floor(Number(valueStr));
      if (isNaN(value) || value < 0) {
        showToast('数值必须是有效的非负整数', true);
        return;
      }
      const isPayChoice = confirm('点击「确定」归入【氪金项目】\n点击「取消」归入【游戏内产出】');
      const newResource = {
        id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        name: trimmedName,
        type: type,
        daily: type === 'daily' ? value : 0,
        monthlyTotal: type === 'monthly' ? value : 0,
        note: '自定义资源',
        isPay: isPayChoice,
        showDailyAvg: false,
        enabled: true
      };
      state.resources.push(newResource);
      renderAll();
      saveState();
      showToast(`已添加：${trimmedName}`);
    });

    // 重置默认
    document.getElementById('resetBtn').addEventListener('click', () => {
      if (confirm('确定要重置所有资源到默认状态吗？\n\n此操作将：\n• 恢复 16 个预设资源的默认数值与类型\n• 删除所有自定义资源\n• 清空现有光元数量\n• 重置氪金开关与每日均量开关\n• 重置日期为默认范围（今天往前 30 天 ~ 今天）')) {
        state = getDefaultData();
        const defaults = getDefaultDates();
        document.getElementById('startDate').value = defaults.start;
        document.getElementById('endDate').value = defaults.end;
        document.getElementById('existingAmount').value = '';
        document.getElementById('payToggle').checked = true;
        renderAll();
        saveState();
        showToast('已重置为默认状态');
      }
    });
  }

  // ===== 初始化 =====
  function init() {
    const defaults = getDefaultDates();
    document.getElementById('startDate').value = defaults.start;
    document.getElementById('endDate').value = defaults.end;

    document.getElementById('payToggle').checked = state.payEnabled;

    const existingEl = document.getElementById('existingAmount');
    if (state.existingAmount && state.existingAmount > 0) {
      existingEl.value = state.existingAmount;
    }

    bindEvents();
    renderAll();
  }

  init();

  // ===== PWA Service Worker 注册 =====
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.log('SW registration failed:', err));
    });
  }
