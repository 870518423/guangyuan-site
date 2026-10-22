# -*- coding: utf-8 -*-
"""
生成「奥系攻略」板块

输出：
  strategies.html         板块首页（子版块列表 + 搜索）
  strategy-xiulian.html   修炼数值表
  strategy-dati.html      奥特曼答题库

数据源：sources/修炼.md、sources/奥特曼答题.txt
用法：python build_strategies.py

★ 想改文案/样式，改本文件里的「可配置区」和 CSS 常量即可，不要直接改生成的 html
  （下次运行会被覆盖）。
"""
import re
import os
import io
import json
import html
import datetime

SRC = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(SRC, 'sources')
XIULIAN_MD = os.path.join(SOURCES, '修炼.md')
DATI_TXT = os.path.join(SOURCES, '奥特曼答题.txt')

# ============ 可配置区（改这里） ============
# 作者署名
AUTHOR_NAME = '故稔'
AUTHOR_URL = 'https://space.bilibili.com/505753055'
# 板块首页小字
SECTION_SUB = '收录自玩家社区 · 内容版权归原作者所有'
# 修炼页顶部说明：{lv} 会被替换成金色的「6级」
XIULIAN_NOTE = '以下数值为 {lv} 词条的非完美属性数值，数值越大越接近完美。'
# 百分号规则：除「四维」是整数面板值外，其余属性都是百分比，统一加 %
# （四维：攻击 / 特防 / 物防 / 生命）
PCT_EXCLUDE = ('攻击', '特防', '物防', '生命')
# 「同 X」的别名对照（原文简称 -> 正式属性名）
REF_ALIAS = {'全免': '全伤减免'}

# 板块卡片（新增攻略就在这里加一条）
# cat：所属大类，会以彩色描边标签显示在卡片标签第一位（区别于普通灰底标签）
SECTIONS = [
    {
        'id': 'xiulian',
        'title': '修炼数值表',
        'cat': '修炼',
        'file': 'strategy-xiulian.html',
        'icon': 'assets/strategy-book.png',
        'accent': '#fbbf24',
        'desc': '按修炼条目分组，收录四维、全伤／全免、高级属性、增幅与抗性的非完美属性数值，由低到高排列。',
        'tags': ['6级词条', '数值区间', '升序排列'],
    },
    {
        'id': 'dati',
        'title': '趣味问答题库',
        'cat': '答题',
        'file': 'strategy-dati.html',
        'icon': 'assets/strategy-book.png',
        'accent': '#38bdf8',
        'desc': '__NQ__ 道奥特曼知识题。答案默认隐藏，可当题库自测；也能一键展开当速查手册，支持题号与关键词搜索。',
        'tags': ['__NQ__ 题', '可自测', '一键展开'],
    },
    {
        # 图片型攻略：页面 strategy-bingfeiwudou.html 是手工维护的静态页，
        # 本脚本只负责把它登记进 strategies.html 列表（不重新生成页面本体）。
        'id': 'bingfeiwudou',
        'title': '并非五斗的警备队攻略',
        'cat': '警备队',
        'file': 'strategy-bingfeiwudou.html',
        'icon': 'assets/strategy-book.png',
        'accent': '#34d399',
        'desc': '转载并非五斗的警备队图文攻略：警备队商店兑换建议、源晶掉落表，以及 16 到 20 章章节怪物站位图，含三张可折叠长图。',
        'tags': ['3 张图', '警备队兑换', '章节站位'],
    },
]

# ============ 通用 CSS ============
BASE_CSS = """
  :root {
    --bg: #0a0e1a; --panel: #101828; --panel2: #0d1526;
    --border: #1e2a41; --border2: #263449;
    --text: #e6ebf5; --muted: #8b98ad; --dim: #64748b;
    --blue: #3b82f6; --gold: #fbbf24; --radius: 12px;
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                 "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", sans-serif;
    font-size: 14px; line-height: 1.6; min-height: 100vh;
  }
  .wrap { max-width: 1000px; margin: 0 auto; padding: 20px 16px 60px; }

  .back-home {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: .82rem; color: var(--muted); text-decoration: none;
    margin-bottom: 12px; padding: 5px 11px 5px 8px;
    border: 1px solid var(--border2); border-radius: 8px; background: var(--panel2);
    transition: color .15s, border-color .15s;
  }
  .back-home:hover { color: #93c5fd; border-color: var(--blue); }

  header { text-align: center; padding: 8px 0 16px; }
  header h1 {
    margin: 0 0 6px; font-size: 1.7rem; font-weight: 700; letter-spacing: .5px;
    background: linear-gradient(90deg, var(--gold), var(--blue));
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  header .sub { margin: 0; color: var(--dim); font-size: .8rem; letter-spacing: .3px; }
  header .sub b { color: var(--gold); font-weight: 600; }
"""

# 作者署名条
AUTHOR_CSS = """
  .author {
    display: flex; align-items: center; flex-wrap: wrap; gap: 9px;
    background: linear-gradient(90deg, rgba(251,191,36,.10), rgba(251,191,36,.02));
    border: 1px solid rgba(251,191,36,.30);
    border-radius: var(--radius);
    padding: 11px 14px; margin-bottom: 16px;
  }
  .author .lab { font-size: .72rem; color: var(--muted); letter-spacing: 1px; }
  .author a {
    display: inline-flex; align-items: center; gap: 5px;
    color: var(--gold); font-size: .96rem; font-weight: 650;
    text-decoration: none; border-bottom: 1px dashed rgba(251,191,36,.55);
  }
  .author a:hover { color: #fde68a; border-bottom-color: #fde68a; }
  .author a::after { content: "↗"; font-size: .78rem; opacity: .8; }
  .author .hint { margin-left: auto; font-size: .74rem; color: var(--dim); }
  @media (max-width: 560px) { .author .hint { margin-left: 0; width: 100%; } }
"""


# ============ 解析：修炼.md ============
def clean_title(s):
    s = html.unescape(s)
    s = s.replace('&#x20;', ' ').replace('&nbsp;', ' ')
    s = s.replace('*', '').replace('`', '')
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def split_ref(name):
    """「破挡（同暴击）」-> ('破挡', '暴击')"""
    m = re.search(r'[（(]\s*同\s*(.+?)\s*[)）]', name)
    if m:
        return name[:m.start()].strip(), m.group(1).strip()
    return name, ''


def parse_xiulian(path):
    text = io.open(path, encoding='utf-8').read()
    blocks = []
    blk = grp = sub = item = None

    def ensure_block():
        nonlocal blk
        if blk is None:
            blk = {'name': '', 'groups': []}
            blocks.append(blk)
        return blk

    def ensure_group():
        nonlocal grp
        if grp is None:
            grp = {'name': '', 'subs': []}
            ensure_block()['groups'].append(grp)
        return grp

    def ensure_sub():
        nonlocal sub
        if sub is None:
            sub = {'name': '', 'items': []}
            ensure_group()['subs'].append(sub)
        return sub

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        # 数值行
        if re.fullmatch(r'[\d\s.]+', line) and re.search(r'\d', line):
            if item is not None:
                item['values'] = line.split()
            continue
        m = re.match(r'^(#{1,6})\s*(.*)$', line)
        if not m:
            continue
        level, title = len(m.group(1)), clean_title(m.group(2))
        if not title:
            continue
        if level in (2, 3):
            # 文档大标题 / 副标题，不参与结构（如「[🦐の记录]修炼…」）
            continue
        if level == 1:
            blk = {'name': title, 'groups': []}
            blocks.append(blk)
            grp = sub = item = None
        elif level == 4:
            grp = {'name': title, 'subs': []}
            ensure_block()['groups'].append(grp)
            sub = item = None
        elif level == 5:
            sub = {'name': title, 'items': []}
            ensure_group()['subs'].append(sub)
            item = None
        else:  # level >= 6：属性名
            base, ref = split_ref(title)
            item = {'name': base, 'ref': ref, 'raw': title, 'values': []}
            ensure_sub()['items'].append(item)

    # 填充「同 X」且本身没数值的条目
    lookup = {}
    for b in blocks:
        for g in b['groups']:
            for s in g['subs']:
                for it in s['items']:
                    if it['values']:
                        lookup[it['name']] = it['values']
    filled = []
    for b in blocks:
        for g in b['groups']:
            for s in g['subs']:
                for it in s['items']:
                    if not it['values'] and it['ref']:
                        key = REF_ALIAS.get(it['ref'], it['ref'])
                        if key in lookup:
                            it['values'] = list(lookup[key])
                            filled.append((it['name'], key))
    return blocks, filled


def need_pct(name):
    return name not in PCT_EXCLUDE


def fmt_val(v, pct):
    return v + '%' if pct else v


# ============ 解析：奥特曼答题.txt ============
def parse_dati(path):
    text = io.open(path, encoding='utf-8').read()
    items = []
    cur = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        m = re.match(r'^\s*(\d+)\s*[.、。]\s*(.+)$', line)
        if m:
            cur = {'no': int(m.group(1)), 'q': m.group(2).strip(), 'a': ''}
            items.append(cur)
        elif cur is not None:
            frag = re.sub(r'\s{2,}', '  ', line.strip())
            cur['a'] = (cur['a'] + ' ' + frag).strip() if cur['a'] else frag
    # 重复题标注
    seen = {}
    for it in items:
        key = it['q']
        if key in seen:
            it['dup'] = seen[key]
        else:
            seen[key] = it['no']
    return items


# ============ 页面 1：板块首页 ============
TPL_INDEX = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>奥系攻略</title>
<meta name="theme-color" content="#0a0e1a">
<meta name="description" content="奥系攻略板块：修炼数值表、趣味问答题库等玩家社区攻略收录">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="assets/apple-touch-app.png">
<link rel="icon" href="assets/favicon-app.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="奥系工具站">
<!-- 主题引导：首帧前定好亮/暗，避免闪色（早于样式表执行） -->
<script>(function(){try{var t=localStorage.getItem('ak-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();</script>
<style>__CSS__
  .search-row { position: relative; display: flex; align-items: center; margin-bottom: 14px; }
  .search-row input {
    width: 100%; height: 44px; padding: 0 40px 0 15px;
    background: var(--panel2); border: 1px solid var(--border2);
    border-radius: var(--radius); color: var(--text); font-size: .92rem; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .search-row input::placeholder { color: var(--dim); }
  .search-row input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
  .search-row input::-webkit-search-cancel-button { display: none; }
  #clearQ {
    position: absolute; right: 7px; width: 30px; height: 30px;
    border: 0; border-radius: 50%; background: transparent;
    color: var(--dim); font-size: .9rem; cursor: pointer; display: none;
  }
  #clearQ.on { display: block; }
  #clearQ:hover { color: var(--text); background: var(--border); }

  .count { color: var(--muted); font-size: .8rem; margin: 0 0 12px; }
  .count b { color: var(--text); font-variant-numeric: tabular-nums; }

  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 13px; }
  .card {
    display: block; text-decoration: none; color: inherit;
    position: relative; overflow: hidden;
    background: linear-gradient(160deg, var(--panel), var(--panel2));
    border: 1px solid var(--border); border-left: 3px solid var(--accent);
    border-radius: 14px; padding: 16px 17px 15px;
    transition: transform .16s, border-color .16s, box-shadow .16s;
  }
  .card::after {
    content: ""; position: absolute; right: -50px; top: -50px;
    width: 160px; height: 160px; border-radius: 50%;
    background: radial-gradient(circle, var(--accent), transparent 68%);
    opacity: .09; transition: opacity .16s;
  }
  .card:hover { transform: translateY(-3px); border-color: var(--border2); box-shadow: 0 12px 30px rgba(0,0,0,.4); }
  .card:hover::after { opacity: .17; }
  .card-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
  .card-hd img { width: 34px; height: 34px; object-fit: contain; flex: 0 0 34px; border-radius: 8px; }
  .card-hd h3 { margin: 0; font-size: 1.06rem; font-weight: 680; flex: 1; min-width: 0; }
  .card-hd .go { color: var(--accent); opacity: .5; font-size: 1rem; }
  .card:hover .go { opacity: 1; }
  .card .desc { margin: 0 0 11px; color: var(--muted); font-size: .83rem; line-height: 1.72; }
  .card .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .card .tags span {
    font-size: .72rem; padding: 2px 9px; border-radius: 6px;
    background: rgba(255,255,255,.05); color: #b6c2d4;
  }
  /* 大类标签（修炼 / 答题…）：透明底 + 主题色描边，与普通灰底标签区分 */
  .card .tags span.cat {
    background: transparent; border: 1px solid var(--accent);
    color: var(--accent); font-weight: 650; padding: 1px 8px;
  }
  .empty { text-align: center; color: var(--dim); padding: 40px 0; font-size: .88rem; }
  footer { margin-top: 34px; text-align: center; color: var(--dim); font-size: .76rem; line-height: 2; }
  footer .hr { height: 1px; background: var(--border); margin: 0 0 18px; }
</style>
<link rel="stylesheet" href="assets/ak/ak-theme.css">
<link rel="stylesheet" href="assets/ak/ak-motion.css">
<script>(function(){var d=document.documentElement;d.classList.add("ak-js");try{if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)d.classList.add("aoxi-motion-ready");}catch(e){}window.__akReady=0;setTimeout(function(){if(!window.__akReady){document.querySelectorAll("[data-stagger]>*").forEach(function(e){e.style.transition="none";e.style.opacity="1";e.style.transform="none";});}},3000);})();</script>
<noscript><style>[data-stagger]>*{opacity:1!important;transform:none!important}</style></noscript>
<style>
  /* 明日方舟风格覆盖：直角、描边、扫描线、等宽数字 */
  .card { background: var(--ak-bg-1); }
  .card:hover { background: var(--ak-bg-2); }
  header h1 { letter-spacing: 2px; }
  .author { border-radius: var(--ak-radius); }
  .q { background: var(--ak-bg-1); }
  /* 折叠：grid-template-rows 方案（比 max-height / display 更平滑） */
  .blk:not(.folded) .blk-inner { animation: ak-in var(--dur-base) var(--ease-out) both; }
  .blk-fold { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 320ms var(--ease); }
  .blk.folded .blk-fold { grid-template-rows: 0fr; transition: grid-template-rows 200ms var(--ease-in); }
  .blk-fold > .blk-inner { overflow: hidden; min-height: 0; }
  /* 答题：答案区开合双向过渡（开 220ms 慢于关 160ms）
     注意：裁剪层 .qa-clip 不能带 padding —— border-box 下 padding 会把
     折叠到 0 的行撑出一截，答案会"渗"出来。padding 留在深层 .qa 上。 */
  .q .qa-fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 160ms var(--ease-in); }
  .q.open .qa-fold { grid-template-rows: 1fr; transition: grid-template-rows 220ms var(--ease-out); }
  .q .qa-fold > .qa-clip { overflow: hidden; min-height: 0; }
  .card .tags span.cat { font-family: var(--ak-mono); }
  footer { border-top: 0; }
</style>
<link rel="stylesheet" href="assets/ak/ak-components.css">
<link rel="stylesheet" href="assets/ak/ak-light.css">
<script defer src="/ak-analytics.js"></script>
<link rel="stylesheet" href="assets/ak/aoxi-site-refresh.css">
</head>
<body class="aoxi-refresh aoxi-strategies" data-ak-progress>
<header class="aoxi-site-head"><div class="aoxi-site-head__inner">
  <a class="aoxi-site-brand" data-aoxi-intro="rise" href="index.html" aria-label="奥系工具站首页"><img src="assets/logo-site.webp" alt=""><span><small>AOXI / INDEX</small></span></a>
  <nav class="aoxi-site-nav" data-aoxi-intro="right" aria-label="主导航">
      <a href="index.html"><span>首页</span><small>HOME</small></a>
      <a href="calculator.html"><span>计算器</span><small>CALCULATOR</small></a>
      <a href="guides.html"><span>图鉴</span><small>GUIDES</small></a>
      <a href="strategies.html" aria-current="page"><span>攻略</span><small>STRATEGIES</small></a>
      <a href="passive/index.html"><span>被动</span><small>PASSIVE</small></a>
  </nav>
  <details class="aoxi-mobile-nav" data-aoxi-intro="right"><summary><strong>菜单</strong><small>MENU</small></summary><nav class="aoxi-mobile-links" aria-label="手机导航">
        <a href="index.html"><span>首页</span><small>HOME</small></a>
        <a href="calculator.html"><span>计算器</span><small>CALCULATOR</small></a>
        <a href="guides.html"><span>图鉴</span><small>GUIDES</small></a>
        <a href="strategies.html" aria-current="page"><span>攻略</span><small>STRATEGIES</small></a>
        <a href="passive/index.html"><span>被动</span><small>PASSIVE</small></a>
  </nav></details>
</div></header>
<div class="wrap" data-stagger>
  <a class="back-home" href="index.html">← 返回首页</a>

  <header data-aoxi-intro="rise">
    <h1 data-aoxi-intro="left">奥系攻略</h1>
    <span class="ak-label-en">Strategy Archive</span>
    <p class="sub">__SUB__</p>
  </header>

  <div class="search-row">
    <input id="q" type="search" placeholder="搜索攻略名称、简介或标签…" autocomplete="off">
    <button id="clearQ" type="button" aria-label="清空">✕</button>
  </div>
  <p class="count">共 <b id="n">0</b> 篇攻略</p>

  <div class="cards" id="cards" data-stagger></div>
  <div class="empty" id="empty" style="display:none">没有匹配的攻略，换个词试试</div>

  <footer>
    <div class="hr"></div>
    <div>__SUB__</div>
    <div>攻略内容以原作者发布为准，游戏内数据以实际为准</div>
  </footer>
</div>

<script>
const SECTIONS = __DATA__;
const cardsEl = document.getElementById('cards');
const emptyEl = document.getElementById('empty');
const nEl = document.getElementById('n');
const qEl = document.getElementById('q');
const clearEl = document.getElementById('clearQ');

function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function render(list){
  cardsEl.innerHTML = list.map(s => `
    <a class="card" href="${esc(s.file)}" style="--accent:${esc(s.accent)}">
      <div class="card-hd">
        <img src="${esc(s.icon)}" alt="">
        <h3>${esc(s.title)}</h3>
        <span class="go">→</span>
      </div>
      <p class="desc">${esc(s.desc)}</p>
      <div class="tags">${s.cat ? `<span class="cat">${esc(s.cat)}</span>` : ''}${s.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
    </a>`).join('');
  nEl.textContent = list.length;
  emptyEl.style.display = list.length ? 'none' : 'block';
}

function apply(){
  const k = qEl.value.trim().toLowerCase();
  clearEl.classList.toggle('on', !!k);
  if (!k) return render(SECTIONS);
  render(SECTIONS.filter(s =>
    (s.title + ' ' + s.desc + ' ' + s.tags.join(' ')).toLowerCase().indexOf(k) !== -1
  ));
}

qEl.addEventListener('input', apply);
clearEl.addEventListener('click', () => { qEl.value = ''; apply(); qEl.focus(); });
render(SECTIONS);
</script>
<script src="assets/ak/ripple.js"></script>
<script src="assets/ak/transitions.js"></script>
<script src="assets/ak/progress.js"></script>
<script src="assets/ak/theme.js"></script>
</body>
</html>
"""


# ============ 页面 2：修炼数值表 ============
TPL_XIULIAN = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>修炼数值表 · 奥系攻略</title>
<meta name="theme-color" content="#0a0e1a">
<meta name="description" content="修炼数值表：6级词条的非完美属性数值，四维、全伤全免、高级属性、增幅与抗性">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="assets/apple-touch-app.png">
<link rel="icon" href="assets/favicon-app.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="奥系工具站">
<!-- 主题引导：首帧前定好亮/暗，避免闪色（早于样式表执行） -->
<script>(function(){try{var t=localStorage.getItem('ak-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();</script>
<style>__CSS____AUTHORCSS__
  .note {
    background: var(--panel2); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 11px 14px; margin: 0 0 16px;
    color: var(--muted); font-size: .84rem; line-height: 1.75;
  }
  .note .lv { color: var(--gold); font-weight: 700; }
  .bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .bar button {
    border: 1px solid var(--border2); background: var(--panel2); color: var(--muted);
    font-size: .78rem; padding: 6px 13px; border-radius: 8px; cursor: pointer;
    font-family: inherit; transition: all .15s;
  }
  .bar button:hover { color: var(--text); border-color: var(--blue); }
  .bar .tip { margin-left: auto; font-size: .74rem; color: var(--dim); }

  .blk {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 14px; padding: 14px 16px 16px; margin-bottom: 13px;
  }
  .blk > h2 {
    margin: 0; font-size: 1.02rem; font-weight: 680; color: var(--gold);
    cursor: pointer; display: flex; align-items: center; gap: 8px;
    user-select: none; letter-spacing: .3px;
  }
  .blk > h2::before { content: "▾"; font-size: .8rem; opacity: .8; transition: transform .15s; }
  .blk.folded > h2::before { transform: rotate(-90deg); }

  .grp { margin-top: 12px; }
  .grp > h3 {
    margin: 0 0 8px; font-size: .78rem; font-weight: 600; letter-spacing: 2px;
    color: var(--dim); text-transform: uppercase;
    display: flex; align-items: center; gap: 9px;
  }
  .grp > h3::after { content: ""; flex: 1; height: 1px; background: var(--border); }
  .sub { margin-bottom: 6px; }
  .sub > h4 {
    margin: 10px 0 6px; font-size: .82rem; font-weight: 600; color: #93c5fd;
    padding-left: 9px; border-left: 2px solid rgba(59,130,246,.5);
  }
  .row { display: flex; gap: 10px; align-items: flex-start; padding: 5px 0; }
  .row + .row { border-top: 1px dashed rgba(38,52,73,.5); }
  .row .k {
    flex: 0 0 96px; font-size: .84rem; color: var(--text);
    padding-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row .k em { font-style: normal; color: var(--dim); font-size: .72rem; margin-left: 3px; }
  .row .vals { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 5px 7px; }
  .row .vals .v {
    color: var(--gold); font-size: .88rem; font-variant-numeric: tabular-nums;
    background: rgba(251,191,36,.07); border: 1px solid rgba(251,191,36,.18);
    border-radius: 6px; padding: 1px 7px; letter-spacing: .2px;
  }
  @media (max-width: 620px) {
    .row { flex-direction: column; gap: 4px; }
    .row .k { flex: none; }
  }
  footer { margin-top: 30px; text-align: center; color: var(--dim); font-size: .76rem; line-height: 2; }
</style>
<link rel="stylesheet" href="assets/ak/ak-theme.css">
<link rel="stylesheet" href="assets/ak/ak-motion.css">
<script>document.documentElement.className+=(" ak-js");window.__akReady=0;setTimeout(function(){if(!window.__akReady){document.querySelectorAll("[data-stagger]>*").forEach(function(e){e.style.transition="none";e.style.opacity="1";e.style.transform="none";});}},3000);</script>
<noscript><style>[data-stagger]>*{opacity:1!important;transform:none!important}</style></noscript>
<style>
  /* 明日方舟风格覆盖：直角、描边、扫描线、等宽数字 */
  .card { background: var(--ak-bg-1); }
  .card:hover { background: var(--ak-bg-2); }
  header h1 { letter-spacing: 2px; }
  .author { border-radius: var(--ak-radius); }
  .q { background: var(--ak-bg-1); }
  /* 折叠：grid-template-rows 方案（比 max-height / display 更平滑） */
  .blk:not(.folded) .blk-inner { animation: ak-in var(--dur-base) var(--ease-out) both; }
  .blk-fold { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 320ms var(--ease); }
  .blk.folded .blk-fold { grid-template-rows: 0fr; transition: grid-template-rows 200ms var(--ease-in); }
  .blk-fold > .blk-inner { overflow: hidden; min-height: 0; }
  /* 答题：答案区开合双向过渡（开 220ms 慢于关 160ms）
     注意：裁剪层 .qa-clip 不能带 padding —— border-box 下 padding 会把
     折叠到 0 的行撑出一截，答案会"渗"出来。padding 留在深层 .qa 上。 */
  .q .qa-fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 160ms var(--ease-in); }
  .q.open .qa-fold { grid-template-rows: 1fr; transition: grid-template-rows 220ms var(--ease-out); }
  .q .qa-fold > .qa-clip { overflow: hidden; min-height: 0; }
  .card .tags span.cat { font-family: var(--ak-mono); }
  footer { border-top: 0; }
</style>
<link rel="stylesheet" href="assets/ak/ak-components.css">
<link rel="stylesheet" href="assets/ak/ak-light.css">
<script defer src="/ak-analytics.js"></script>
</head>
<body data-ak-progress>
<div class="wrap">
  <a class="back-home" href="strategies.html">← 返回奥系攻略</a>

  <header>
    <h1>修炼数值表</h1>
    <span class="ak-label-en">Cultivation Values</span>
    <p class="sub">__SUB__</p>
  </header>

  __AUTHOR__

  <p class="note">__NOTE__</p>

  <div class="bar">
    <button id="toggleAll" type="button">全部折叠</button>
    <span class="tip">点击小标题可单独展开 / 收起</span>
  </div>

  <div id="body" data-stagger>__BODY__</div>

  <footer>原文数据未作删改，以作者发布内容为准</footer>
</div>

<script>
document.querySelectorAll('.blk > h2').forEach(h => {
  h.addEventListener('click', () => h.parentElement.classList.toggle('folded'));
});
const btn = document.getElementById('toggleAll');
let allFolded = false;
btn.addEventListener('click', () => {
  allFolded = !allFolded;
  document.querySelectorAll('.blk').forEach(b => b.classList.toggle('folded', allFolded));
  btn.textContent = allFolded ? '全部展开' : '全部折叠';
});
</script>
<script src="assets/ak/ripple.js"></script>
<script src="assets/ak/transitions.js"></script>
<script src="assets/ak/progress.js"></script>
<script src="assets/ak/theme.js"></script>
</body>
</html>
"""


# ============ 页面 3：奥特曼答题库 ============
TPL_DATI = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>趣味问答题库 · 奥系攻略</title>
<meta name="theme-color" content="#0a0e1a">
<meta name="description" content="趣味问答题库：__NQ__ 道奥特曼知识题，答案默认隐藏，可自测也可一键展开速查">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="assets/apple-touch-app.png">
<link rel="icon" href="assets/favicon-app.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="奥系工具站">
<!-- 主题引导：首帧前定好亮/暗，避免闪色（早于样式表执行） -->
<script>(function(){try{var t=localStorage.getItem('ak-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();</script>
<style>__CSS____AUTHORCSS__
  .tools { margin-bottom: 13px; }
  .search-row { position: relative; display: flex; align-items: center; }
  .search-row input {
    width: 100%; height: 44px; padding: 0 40px 0 15px;
    background: var(--panel2); border: 1px solid var(--border2);
    border-radius: var(--radius); color: var(--text); font-size: .92rem; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  .search-row input::placeholder { color: var(--dim); }
  .search-row input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
  .search-row input::-webkit-search-cancel-button { display: none; }
  #clearQ {
    position: absolute; right: 7px; width: 30px; height: 30px;
    border: 0; border-radius: 50%; background: transparent;
    color: var(--dim); font-size: .9rem; cursor: pointer; display: none;
  }
  #clearQ.on { display: block; }
  #clearQ:hover { color: var(--text); background: var(--border); }
  .bar { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
  .bar button {
    border: 1px solid var(--border2); background: var(--panel2); color: var(--muted);
    font-size: .78rem; padding: 6px 13px; border-radius: 8px; cursor: pointer;
    font-family: inherit; transition: all .15s;
  }
  .bar button:hover { color: var(--text); border-color: var(--blue); }
  .bar .count { margin-left: auto; color: var(--muted); font-size: .78rem; }
  .bar .count b { color: var(--text); font-variant-numeric: tabular-nums; }

  .list { display: flex; flex-direction: column; gap: 7px; }
  .q {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 10px; overflow: hidden;
  }
  .q .qh {
    display: flex; align-items: flex-start; gap: 10px; width: 100%;
    padding: 11px 13px; background: transparent; border: 0; cursor: pointer;
    text-align: left; font-family: inherit; color: var(--text); font-size: .9rem;
  }
  .q .qh:hover { background: rgba(255,255,255,.025); }
  .q .no {
    flex: 0 0 auto; min-width: 30px; color: var(--gold); font-size: .82rem;
    font-variant-numeric: tabular-nums; padding-top: 1px; opacity: .9;
  }
  .q .qt { flex: 1; min-width: 0; line-height: 1.6; }
  .q .dup {
    flex: 0 0 auto; font-size: .66rem; color: var(--dim);
    border: 1px solid var(--border2); border-radius: 5px; padding: 0 5px; margin-top: 2px;
  }
  .q .ar { flex: 0 0 auto; color: var(--dim); font-size: .8rem; transition: transform .15s; }
  .q.open .ar { transform: rotate(180deg); }
  .q .qa {
    padding: 0 13px 12px 53px;
    color: var(--gold); font-size: .92rem; font-weight: 600; line-height: 1.7;
  }
  .q .qa .k { color: var(--dim); font-weight: 400; font-size: .78rem; margin-right: 6px; }
  .empty { text-align: center; color: var(--dim); padding: 40px 0; font-size: .88rem; }
  footer { margin-top: 30px; text-align: center; color: var(--dim); font-size: .76rem; line-height: 2; }
  @media (max-width: 620px) { .q .qa { padding-left: 13px; } }
</style>
<link rel="stylesheet" href="assets/ak/ak-theme.css">
<link rel="stylesheet" href="assets/ak/ak-motion.css">
<script>document.documentElement.className+=(" ak-js");window.__akReady=0;setTimeout(function(){if(!window.__akReady){document.querySelectorAll("[data-stagger]>*").forEach(function(e){e.style.transition="none";e.style.opacity="1";e.style.transform="none";});}},3000);</script>
<noscript><style>[data-stagger]>*{opacity:1!important;transform:none!important}</style></noscript>
<style>
  /* 明日方舟风格覆盖：直角、描边、扫描线、等宽数字 */
  .card { background: var(--ak-bg-1); }
  .card:hover { background: var(--ak-bg-2); }
  header h1 { letter-spacing: 2px; }
  .author { border-radius: var(--ak-radius); }
  .q { background: var(--ak-bg-1); }
  /* 折叠：grid-template-rows 方案（比 max-height / display 更平滑） */
  .blk:not(.folded) .blk-inner { animation: ak-in var(--dur-base) var(--ease-out) both; }
  .blk-fold { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 320ms var(--ease); }
  .blk.folded .blk-fold { grid-template-rows: 0fr; transition: grid-template-rows 200ms var(--ease-in); }
  .blk-fold > .blk-inner { overflow: hidden; min-height: 0; }
  /* 答题：答案区开合双向过渡（开 220ms 慢于关 160ms）
     注意：裁剪层 .qa-clip 不能带 padding —— border-box 下 padding 会把
     折叠到 0 的行撑出一截，答案会"渗"出来。padding 留在深层 .qa 上。 */
  .q .qa-fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 160ms var(--ease-in); }
  .q.open .qa-fold { grid-template-rows: 1fr; transition: grid-template-rows 220ms var(--ease-out); }
  .q .qa-fold > .qa-clip { overflow: hidden; min-height: 0; }
  .card .tags span.cat { font-family: var(--ak-mono); }
  footer { border-top: 0; }
</style>
<link rel="stylesheet" href="assets/ak/ak-components.css">
<link rel="stylesheet" href="assets/ak/ak-light.css">
<script defer src="/ak-analytics.js"></script>
</head>
<body data-ak-progress>
<div class="wrap">
  <a class="back-home" href="strategies.html">← 返回奥系攻略</a>

  <header>
    <h1>趣味问答题库</h1>
    <span class="ak-label-en">Quiz Database</span>
    <p class="sub">__SUB__</p>
  </header>

  __AUTHOR__

  <div class="tools">
    <div class="search-row">
      <input id="q" type="search" placeholder="搜索题号或题目关键词…" autocomplete="off">
      <button id="clearQ" type="button" aria-label="清空">✕</button>
    </div>
    <div class="bar">
      <button id="showAll" type="button" class="ak-btn-solid">显示全部答案</button>
      <button id="hideAll" type="button">隐藏全部答案</button>
      <span class="count">共 <b id="n">0</b> 题</span>
    </div>
  </div>

  <div class="list" id="list" data-stagger></div>
  <div class="empty" id="empty" style="display:none">没有匹配的题目</div>

  <footer>题目与答案原文未作删改，以作者发布内容为准</footer>
</div>

<script>
const QUIZ = __DATA__;
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const nEl = document.getElementById('n');
const qEl = document.getElementById('q');
const clearEl = document.getElementById('clearQ');

function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

let allOpen = false;   // 「显示全部答案」模式：搜索 / 筛选后依然保持展开

function render(list){
  listEl.innerHTML = list.map(it => `
    <div class="q" data-no="${it.no}">
      <button class="qh" type="button">
        <span class="no">${it.no}</span>
        <span class="qt">${esc(it.q)}</span>
        ${it.dup ? `<span class="dup">同第${it.dup}题</span>` : ''}
        <span class="ar">▾</span>
      </button>
      <div class="qa-fold"><div class="qa-clip"><div class="qa"><span class="k">答案</span>${esc(it.a)}</div></div></div>
    </div>`).join('');
  nEl.textContent = list.length;
  emptyEl.style.display = list.length ? 'none' : 'block';
  listEl.querySelectorAll('.q').forEach(q => {
    q.querySelector('.qh').addEventListener('click', () => q.classList.toggle('open'));
    if (allOpen) q.classList.add('open');   // 重渲染后延续「显示全部」状态
  });
}

function apply(){
  const k = qEl.value.trim().toLowerCase();
  clearEl.classList.toggle('on', !!k);
  if (!k) return render(QUIZ);
  render(QUIZ.filter(it =>
    String(it.no) === k || (it.q + ' ' + it.a).toLowerCase().indexOf(k) !== -1
  ));
}

document.getElementById('showAll').addEventListener('click', () => {
  allOpen = true;
  const qs = listEl.querySelectorAll('.q');
  qs.forEach((q, i) => {
    const fold = q.querySelector('.qa-fold');
    if (fold) fold.style.transitionDelay = Math.min(i * 8, 400) + 'ms';   // 逐题错峰展开
    q.classList.add('open');
  });
  setTimeout(() => qs.forEach(q => {
    const fold = q.querySelector('.qa-fold');
    if (fold) fold.style.transitionDelay = '';
  }), 1000);
});
document.getElementById('hideAll').addEventListener('click', () => {
  allOpen = false;
  listEl.querySelectorAll('.q').forEach(q => {
    const fold = q.querySelector('.qa-fold');
    if (fold) fold.style.transitionDelay = '';
    q.classList.remove('open');
  });
});
qEl.addEventListener('input', apply);
clearEl.addEventListener('click', () => { qEl.value = ''; apply(); qEl.focus(); });
render(QUIZ);
</script>
<script src="assets/ak/ripple.js"></script>
<script src="assets/ak/transitions.js"></script>
<script src="assets/ak/progress.js"></script>
<script src="assets/ak/theme.js"></script>
</body>
</html>
"""


def author_block():
    return (
        '<div class="author">'
        '<span class="lab">作者</span>'
        '<a href="{url}" target="_blank" rel="noopener noreferrer">{name}</a>'
        '<span class="hint">点击前往作者的 B 站主页</span>'
        '</div>'
    ).format(url=html.escape(AUTHOR_URL, quote=True), name=html.escape(AUTHOR_NAME))



# ---- App 版探测脚本（第 14 轮，2026-10-18）----
# 生成页也要带，否则重建后 app 模式失效。纯字符串后处理，不影响模板占位符。
APP_PROBE = (
    '<script>(function(){try{var q=location.search.indexOf("app=1")>-1;'
    'var c=window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform();'
    'if(!q&&!c)return;var d=document.documentElement;d.setAttribute("data-app","1");'
    'var l=document.createElement("link");l.rel="stylesheet";l.href="assets/ak/app.css";document.head.appendChild(l);'
    'var s=document.createElement("script");s.src="assets/ak/app-shell.js";s.defer=true;document.head.appendChild(s);'
    '}catch(e){}})();</script>'
)


def with_probe(html):
    """在防闪色脚本之后插入 App 探测（幂等）。"""
    if 'setAttribute("data-app","1")' in html:
        return html
    key = "localStorage.getItem('ak-theme')"
    i = html.find(key)
    if i < 0:
        return html
    j = html.find('</script>', i)
    if j < 0:
        return html
    j += len('</script>')
    return html[:j] + '\n' + APP_PROBE + html[j:]


def build():
    # --- 修炼 ---
    blocks, filled = parse_xiulian(XIULIAN_MD)
    parts = []
    for b in blocks:
        inner = []
        for g in b['groups']:
            gs = []
            for s in g['subs']:
                rows = []
                for it in s['items']:
                    pct = need_pct(it['name'])
                    vals = ''.join(
                        '<span class="v">%s</span>' % html.escape(fmt_val(v, pct))
                        for v in it['values']
                    )
                    ref = ('<em>（同%s）</em>' % html.escape(it['ref'])) if it['ref'] else ''
                    rows.append(
                        '<div class="row"><div class="k">%s%s</div>'
                        '<div class="vals">%s</div></div>'
                        % (html.escape(it['name']), ref, vals)
                    )
                head = ('<h4>%s</h4>' % html.escape(s['name'])) if s['name'] else ''
                gs.append('<div class="sub">%s%s</div>' % (head, ''.join(rows)))
            ghead = ('<h3>%s</h3>' % html.escape(g['name'])) if g['name'] else ''
            inner.append('<div class="grp">%s%s</div>' % (ghead, ''.join(gs)))
        parts.append(
            '<section class="blk"><h2>%s</h2>'
            '<div class="ak-fold blk-fold"><div class="blk-inner">%s</div></div></section>'
            % (html.escape(b['name']), ''.join(inner))
        )
    xiulian_body = ''.join(parts)

    total_rows = sum(
        len(s['items']) for b in blocks for g in b['groups'] for s in g['subs']
    )

    note = html.escape(XIULIAN_NOTE).replace('{lv}', '<b class="lv">6级</b>')

    xiulian_html = (
        TPL_XIULIAN
        .replace('__CSS__', BASE_CSS)
        .replace('__AUTHORCSS__', AUTHOR_CSS)
        .replace('__AUTHOR__', author_block())
        .replace('__SUB__', html.escape(SECTION_SUB))
        .replace('__NOTE__', note)
        .replace('__BODY__', xiulian_body)
    )
    io.open(os.path.join(SRC, 'strategy-xiulian.html'), 'w', encoding='utf-8').write(with_probe(xiulian_html))

    # --- 答题 ---
    quiz = parse_dati(DATI_TXT)
    # 题数自动填充（__NQ__）：题库增删后不必再手改描述文案
    nq = str(len(quiz))
    for _sec in SECTIONS:
        if _sec.get('id') == 'dati':
            _sec['desc'] = _sec['desc'].replace('__NQ__', nq)
            _sec['tags'] = [t.replace('__NQ__', nq) for t in _sec['tags']]
    dati_html = (
        TPL_DATI
        .replace('__CSS__', BASE_CSS)
        .replace('__AUTHORCSS__', AUTHOR_CSS)
        .replace('__AUTHOR__', author_block())
        .replace('__SUB__', html.escape(SECTION_SUB))
        .replace('__NQ__', nq)
        .replace('__DATA__', json.dumps(quiz, ensure_ascii=False))
    )
    io.open(os.path.join(SRC, 'strategy-dati.html'), 'w', encoding='utf-8').write(with_probe(dati_html))

    # --- 板块首页 ---
    idx_html = (
        TPL_INDEX
        .replace('__CSS__', BASE_CSS)
        .replace('__SUB__', html.escape(SECTION_SUB))
        .replace('__DATA__', json.dumps(SECTIONS, ensure_ascii=False))
    )
    io.open(os.path.join(SRC, 'strategies.html'), 'w', encoding='utf-8').write(with_probe(idx_html))

    # --- 报告 ---
    def size(p):
        return os.path.getsize(os.path.join(SRC, p))

    print('生成完成 %s' % datetime.date.today())
    print('  修炼数值表: %d 个大组 / %d 条属性行' % (len(blocks), total_rows))
    if filled:
        print('  自动补齐「同X」空数值: ' + ', '.join('%s←%s' % f for f in filled))
    print('  答题库: %d 题（重复标注 %d 题）'
          % (len(quiz), sum(1 for q in quiz if q.get('dup'))))
    print('  strategies.html        %7d 字节' % size('strategies.html'))
    print('  strategy-xiulian.html  %7d 字节' % size('strategy-xiulian.html'))
    print('  strategy-dati.html     %7d 字节' % size('strategy-dati.html'))


if __name__ == '__main__':
    build()
