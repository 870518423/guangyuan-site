"""
重新打包 deploy.zip（EdgeOne Pages 上传用）
用法：python pack_deploy.py
生成 deploy.zip，内含站点文件，路径用正斜杠（跨平台兼容）。

[2026-10-11 修订] 原版把文件名写死在 items 列表里，新增页面（如
strategy-bingfeiwudou.html）或新增图片目录时不会自动入包，导致线上一直缺少
新资源。现改为**白名单收目录 + 自动扫描**：
  - INCLUDES: 站内允许发布的顶层文件/目录（防止把 build_*.py、*.md、
    部署计划、sources/、图标源文件等无关内容打进包里）。
  - 目录里的文件**自动递归收集**，新增页面/图片无需再改脚本。
  - EXCLUDES: 即便在 INCLUDES 的目录里也排除的文件（备份/临时/编辑器产物）。
"""
import zipfile
import os
import re
import sys
import importlib.util

# 以脚本所在目录为站点根
SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SRC, 'deploy.zip')

# 允许进包的顶层文件与目录（目录会递归收集其中所有文件）
INCLUDES = [
    'index.html',
    'calculator.html',
    'mizang-zhuanpan-calculator.html',  # 光之秘藏 / 转盘统一计算器
    'guides.html',
    'strategies.html',
    'strategy-xiulian.html',
    'strategy-dati.html',
    'strategy-bingfeiwudou.html',   # 转载攻略页
    'strategy-huluji.html',         # 老虎机抽取推荐（图片攻略）
    'strategy-ul-tier.html',        # UL 强度排行榜（图片攻略）
    'strategy-mizang.html',         # 光之秘藏（图文攻略）
    'mizang-calculator.html',       # 秘藏光元消耗计算器（验收版）
    'strategy-zhuanpan.html',       # 奥特转盘（图文攻略）
    'zhuanpan-calculator.html',     # 转盘光元消耗计算器（验收版）
    'app.html',                     # App 设置页（第 14 轮，2026-10-18）
    'app',                          # APK 安装包目录（第 15 轮，网页版「下载 App」用）
    'module.json',                  # 资源包清单（pack_deploy 自动生成，勿手改）
    'version.json',                 # 版本清单（同上）
    'content.json',                 # 内容覆盖层更新清单（第 18 轮，pack_deploy 自动生成，勿手改）
    'manifest.json',
    'service-worker.js',
    'edgeone.json',
    'ak-analytics.js',               # 51.la 统计接入（2026-10-17 新增；放根目录，
                                     #   不能进 assets/ —— 那里是 immutable，改脚本老用户拿不到）
    'assets',                        # 含 assets/guides/** 长图，递归自动收集
    'images',                        # 人间体图鉴图片（images/humans/**，2026-10-17）
    'passive',                       # 「奥系角色被动版本收录」板块（目录递归全收；
                                     #  开发用的 _模板.js / _校对预览 等不拷入本目录）
]

# 即便落在 INCLUDES 目录内也一律排除（按文件名后缀/名称判断）
EXCLUDE_SUFFIX = ('.bak', '~', '.tmp', '.swp', '.orig', '.rej')
# _模板.js 是开发用空白模板（只在真源 passive/data/ 里），不该随包发布；
# 万一被误拷进站点目录，这里兜底拦住（2026-10-13 M4 顺带加固）
EXCLUDE_NAMES = {'Thumbs.db', 'desktop.ini', '.DS_Store', '_模板.js'}

# 伤害计算器尚在本地验收，暂不进入网页部署包或 content.json。
# 后续获准发布时，删除以下两项排除即可。
PACK_EXCLUDE_FILES = {'damage-calculator.html', 'damage-calculator-linked.html'}
PACK_EXCLUDE_PREFIXES = ('assets/damage-calc/',)

# 这些扩展名属于「站点会实际请求的资源」，逐个校验存在性（缺了要报警）
EXPECTED_HTML = [n for n in INCLUDES if n.endswith('.html')]


def _is_pack_excluded(rel):
    rel = rel.replace('\\', '/')
    return rel in PACK_EXCLUDE_FILES or any(rel.startswith(p) for p in PACK_EXCLUDE_PREFIXES)


def collect():
    """返回 (arcnames, missing_top)：arcname 用正斜杠，relative to SRC。"""
    got, missing = [], []
    for item in INCLUDES:
        full = os.path.join(SRC, item)
        if os.path.isfile(full):
            if _is_dev_artifact(item) or _is_pack_excluded(item):
                continue
            got.append(item)
        elif os.path.isdir(full):
            for root, dirs, files in os.walk(full):
                for f in files:
                    if f in EXCLUDE_NAMES or f.endswith(EXCLUDE_SUFFIX):
                        continue
                    abs_path = os.path.join(root, f)
                    rel = os.path.relpath(abs_path, SRC).replace('\\', '/')
                    if _is_dev_artifact(rel) or _is_pack_excluded(rel):
                        continue
                    got.append(rel)
        else:
            missing.append(item)
    return got, missing


def _is_dev_artifact(rel):
    """开发/校对用的 `_*.html` 一律不进包（2026-10-13 加固）。
    踩坑：同步 passive 时把 `_review.html`（校对预览）、`_大幅改动审核清单.html`
    一起拷进站点，直接被递归收进包里。数据清单 `_manifest.js` / `_images.js`
    是线上必需文件，按扩展名区分，不受本条影响。"""
    name = os.path.basename(rel)
    return name.startswith('_') and name.endswith('.html')


def parse_sw_assets():
    """2026-10-13 S2（审查 C-2）：解析 service-worker.js 的 ASSETS 预缓存清单。
    SW 的 cache.addAll 是「全有或全无」——清单里任何一条线上 404 都会让
    SW 安装失败、全站更新对老用户卡死（v20/v21 两次踩坑都在这条链上）。
    这里把清单抽出来和包内容对账，缺一条就报错退出，堵死在发布前。"""
    sw_path = os.path.join(SRC, 'service-worker.js')
    with open(sw_path, 'r', encoding='utf-8') as fh:
        src = fh.read()
    m = re.search(r'const\s+ASSETS\s*=\s*\[(.*?)\];', src, re.S)
    if not m:
        return None
    items = []
    for raw in re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)):
        p = raw[2:] if raw.startswith('./') else raw
        if p and p not in ('', '/'):
            items.append(p)
    return items


def run_akp_lint():
    """2026-10-13 M1（审查 C-3）：跑被动板块数据体检 tools/akp_lint.py。
    返回 (通过?, 摘要行列表)。lint 脚本缺失或 __main__ 未执行 → 视为不通过。"""
    path = os.path.join(SRC, 'tools', 'akp_lint.py')
    if not os.path.isfile(path):
        return False, ['  找不到 tools/akp_lint.py（数据体检无法运行）']
    spec = importlib.util.spec_from_file_location('akp_lint', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    lines = []
    # 借用 lint 的内部检查流程（不重复实现），只收集结论
    import io as _io
    manifest = mod.parse_manifest(mod.read(os.path.join(mod.DATA, '_manifest.js')))
    ids = mod.check_files(manifest)
    mod.check_data(manifest)
    mod.check_images(manifest, ids)
    mod.check_sw(manifest)
    for l in mod.warns:
        lines.append('  WARN %s' % l)
    for l in mod.errors:
        lines.append('  ERROR %s' % l)
    return (not mod.errors), lines


def check_sw_build():
    """v66 附加自检（2026-10-16）：service-worker.js 的 BUILD 应比上次打包有变化。

    背景：v66 起预缓存桶名**固定**为 guangyuan-static（不再带版本号），浏览器
    判断「有没有新版本」只认 **SW 脚本自身内容有没有变**。所以 BUILD 不变就成了
    致命遗漏 —— 老用户不会触发 updatefound：既拿不到新资源，也不弹「新版本提示」。
    上次打包的 BUILD 记在 tools/.sw_build（tools 不在 INCLUDES 里，不会进包）。
    返回 (当前 build, 上次 build)，解析不到时为 (None, ...)。
    """
    sw_path = os.path.join(SRC, 'service-worker.js')
    with open(sw_path, 'r', encoding='utf-8') as fh:
        m = re.search(r"const\s+BUILD\s*=\s*'([^']+)'", fh.read())
    cur = m.group(1) if m else None
    rec = os.path.join(SRC, 'tools', '.sw_build')
    last = None
    if os.path.isfile(rec):
        with open(rec, 'r', encoding='utf-8') as fh:
            last = fh.read().strip() or None
    return cur, last


def write_sw_build(cur):
    """记录本次打包的 BUILD（仅在发生变化时调用）。"""
    if not cur:
        return
    rec = os.path.join(SRC, 'tools', '.sw_build')
    with open(rec, 'w', encoding='utf-8') as fh:
        fh.write(cur)


def check_unused_images():
    """附加自检（2026-10-16）：passive/img/<id>/ 里未被 _images.js 引用的图片。

    背景：校对切片（lj_*/pv*/q_*）与 webp→png 转换图曾两次漏进站点目录。
    采集脚本把它们排除在 _images.js 之外（所以页面不显示），但**物理文件仍会被
    目录递归收进 deploy.zip** —— 2026-10-16 实测把包从 15MB 撑到 77MB。
    这里只告警不阻断（简介技*/魔方* 属既定口径内「不展示但留档」，不算错）。
    返回 (行列表, 总字节) 或 None（无法检查）。
    """
    import urllib.parse
    idx = os.path.join(SRC, 'passive', 'data', '_images.js')
    base = os.path.join(SRC, 'passive', 'img')
    if not (os.path.isfile(idx) and os.path.isdir(base)):
        return None
    try:
        with open(idx, encoding='utf-8') as f:
            txt = f.read()
    except OSError:
        return None
    used = set()
    for m in re.finditer(r"""['"]([^'"]+\.(?:webp|png|jpe?g|gif))['"]""", txt, re.I):
        used.add(urllib.parse.unquote(m.group(1)).rsplit('/', 1)[-1])
    exts = ('webp', 'png', 'jpg', 'jpeg', 'gif')
    rows, total = [], 0
    for d in sorted(os.listdir(base)):
        p = os.path.join(base, d)
        if not os.path.isdir(p):
            continue
        for f in sorted(os.listdir(p)):
            if f.rsplit('.', 1)[-1].lower() not in exts or f in used:
                continue
            sz = os.path.getsize(os.path.join(p, f))
            total += sz
            rows.append('%s/%s  %.2fMB' % (d, f, sz / 1048576.0))
    return rows, total




# ---------------- App 资源包清单（第 14 轮，2026-10-18） ----------------
SITE_BASE = 'https://m78calc.cn'   # App 内下载资源包用（Capacitor origin 是 localhost）

# ---------------- 内容覆盖层清单（第 18 轮，2026-10-19） ----------------
# 内容文件集 = 打进 APK www 的那一批（与 sync_www.py 白名单同源）。
# 复用它导出的 collect_www_files()，改白名单只改 sync_www.py 一处，
# 线上 content.json 与 APK 内置 www 自动保持一致。
_SYNC_WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         'apk-project-v2', 'sync_www.py')


def _collect_www_files():
    if os.path.isfile(_SYNC_WWW):
        spec = importlib.util.spec_from_file_location('_sync_www', _SYNC_WWW)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        if hasattr(mod, 'collect_www_files'):
            return mod.collect_www_files()
    # sync_www.py 缺失时降级：直接扫本站点顶层 html + assets/passive（近似口径），
    # 并如实打印告警（正常应命中上方精确路径）
    print('  WARN 未找到 apk-project-v2/sync_www.py，content.json 用近似口径生成')
    fallback = []
    for item in ('index.html', 'calculator.html', 'guides.html', 'strategies.html',
                 'strategy-xiulian.html', 'strategy-dati.html',
                 'strategy-bingfeiwudou.html', 'strategy-huluji.html',
                 'strategy-ul-tier.html', 'strategy-mizang.html',
                 'mizang-calculator.html', 'strategy-zhuanpan.html',
                 'zhuanpan-calculator.html', 'mizang-zhuanpan-calculator.html', 'app.html',
                 'manifest.json', 'service-worker.js', 'ak-analytics.js',
                 'module.json', 'version.json', 'content.json'):
        p = os.path.join(SRC, item)
        if os.path.isfile(p):
            fallback.append(item)
    for item in ('assets', 'passive'):
        base = os.path.join(SRC, item)
        if os.path.isdir(base):
            for dp, _d, fns in os.walk(base):
                for fn in fns:
                    rel = os.path.relpath(os.path.join(dp, fn), SRC).replace('\\', '/')
                    fallback.append(rel)
    return sorted(fallback)


def build_content_manifest(build):
    """生成 content.json：内容文件清单（路径/字节/哈希）+ contentVersion。
    与 version.json 同口径，不进 SW 预缓存、每次走网络（App 内比对更新用）。"""
    import hashlib
    # 第 19 轮（2026-10-19）：这三份是「每次走网络」的实时清单，**不是内容文件**。
    #   ① 自列会让指纹比对永远差几项（content.json 写完才落盘，记下的是上一版指纹）；
    #   ② 把它们列进内容清单 = 允许 App 把它们塞进内容桶，违反铁律 8。
    LIVE_MANIFESTS = ('content.json', 'version.json', 'module.json')
    files = [f for f in _collect_www_files() if f not in LIVE_MANIFESTS and not _is_pack_excluded(f)]
    items = []
    total = 0
    for rel in files:
        full = os.path.join(SRC, rel)
        if not os.path.isfile(full):
            continue          # 真源里没有但 sync_www 白名单允许的项（如 guides 在真源有）
        with open(full, 'rb') as fh:
            data = fh.read()
        total += len(data)
        items.append({
            'path': rel,
            'bytes': len(data),
            'hash': hashlib.md5(data).hexdigest(),
        })
    manifest = {
        'contentVersion': build,
        'generated': __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M'),
        'count': len(items),
        'bytes': total,
        'files': items,
    }
    import json as _json
    with open(os.path.join(SRC, 'content.json'), 'w', encoding='utf-8') as fh:
        _json.dump(manifest, fh, ensure_ascii=False, separators=(',', ':'))
    print('  内容清单 content.json：%d 个文件 / %.2f MB / 版本 %s'
          % (len(items), total / 1048576.0, build))
    return manifest

PACK_DEFS = [
    ('guide',   '攻略资源包',       ['assets/guides'],   ('.webp', '.png')),
    ('passive', '角色被动图鉴包',   ['passive/img'],     ('.webp', '.png')),
    ('humans',  '人间体图鉴包',     ['images/humans'],   ('.webp',)),
]


def read_apk_version():
    """读 APK 的 versionName，写进 version.json 的 apk 字段（第 19 轮，2026-10-19）。
    为什么要它：App 的「检查更新」要能分清两件事——「应用本身要重装」和「只是内容有更新」。
    build/contentVersion 都是内容与内核的版本，跟安装包无关；拿它们判断重装会把每次
    内容热更都误报成「请下载安装包」。app 字段缺省时 App 一律按「无需重装」处理。"""
    gradle = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          'apk-project-v2', 'android', 'app', 'build.gradle')
    try:
        import re as _re
        txt = open(gradle, encoding='utf-8').read()
        m = _re.search(r'versionName\s+"([^"]+)"', txt)
        if m:
            return m.group(1)
    except Exception:
        pass
    return None


def read_apk_notes(apk_ver):
    """读取当前 APK 版本的更新公告，写入 version.json.apkNotes。"""
    if not apk_ver:
        return []
    path = os.path.join(SRC, 'app', 'release-notes.json')
    try:
        import json as _json
        with open(path, encoding='utf-8') as fh:
            data = _json.load(fh)
        notes = data.get(apk_ver, [])
        if not isinstance(notes, list):
            return []
        return [str(x).strip() for x in notes if str(x).strip()][:8]
    except Exception:
        return []


def build_pack_manifests():
    """生成 module.json / version.json（App 内按包下载用），并打印统计。"""
    import hashlib
    import datetime

    build = 'unknown'
    sw = os.path.join(SRC, 'service-worker.js')
    if os.path.isfile(sw):
        import re as _re
        m = _re.search(r"const BUILD = '([^']+)'", open(sw, encoding='utf-8').read())
        if m:
            build = m.group(1)

    packs = {}
    for pid, name, roots, exts in PACK_DEFS:
        files = []
        for root in roots:
            base = os.path.join(SRC, root)
            if not os.path.isdir(base):
                continue
            for dp, _, fns in os.walk(base):
                for fn in sorted(fns):
                    if not fn.lower().endswith(exts):
                        continue
                    rel = os.path.relpath(os.path.join(dp, fn), SRC).replace('\\', '/')
                    files.append(rel)
        files.sort()
        total = 0
        h = hashlib.md5()
        for rel in files:
            full = os.path.join(SRC, rel)
            sz = os.path.getsize(full)
            total += sz
            h.update(rel.encode('utf-8'))
            h.update(str(sz).encode())
            with open(full, 'rb') as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b''):
                    h.update(chunk)
        packs[pid] = {
            'name': name,
            'count': len(files),
            'bytes': total,
            'version': h.hexdigest()[:10],
            'files': [SITE_BASE.rstrip('/') + '/' + f for f in files],
        }

    module = {
        'build': build,
        'generated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
        'packs': packs,
    }
    content = build_content_manifest(build)
    apk_ver = read_apk_version()
    apk_notes = read_apk_notes(apk_ver)
    version = {
        'build': build,
        'contentVersion': content['contentVersion'],   # 第 18 轮：内容覆盖层版本（取 BUILD 号）
        'apk': apk_ver,                                # 第 19 轮：安装包版本（判断是否需重装）
        'apkNotes': apk_notes,                         # App 检查更新时展示的当前 APK 更新公告
        'generated': module['generated'],
        'packs': {k: {'version': v['version'], 'count': v['count'], 'bytes': v['bytes']} for k, v in packs.items()},
    }
    import json as _json
    with open(os.path.join(SRC, 'module.json'), 'w', encoding='utf-8') as fh:
        _json.dump(module, fh, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(SRC, 'version.json'), 'w', encoding='utf-8') as fh:
        _json.dump(version, fh, ensure_ascii=False, separators=(',', ':'))
    for pid, v in packs.items():
        print('  资源包 %-8s %4d 个 / %6.2f MB / 版本 %s' % (pid, v['count'], v['bytes'] / 1048576, v['version']))
    print('  安装包版本 apk = %s（写入 version.json.apk，App 判断是否需重装）'
          % (apk_ver or '未读到 → App 端按「无需重装」处理'))
    return packs

def main():
    print('生成资源包清单 …')
    build_pack_manifests()
    got, missing = collect()

    if os.path.exists(OUT):
        os.remove(OUT)

    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
        for rel in sorted(got):
            zf.write(os.path.join(SRC, rel), arcname=rel)

    with zipfile.ZipFile(OUT, 'r') as zf:
        names = zf.namelist()

    print(f'deploy.zip: {os.path.getsize(OUT)} bytes, {len(names)} entries')

    bad = [n for n in names if '\\' in n]
    print('  WARN backslash paths: %s' % bad if bad else '  OK: all forward-slash paths')

    if missing:
        print('  WARN 以下顶层项不存在，未入包: %s' % missing)

    # 页面清单自检：确认每张 .html 都在包里
    absent = [h for h in EXPECTED_HTML if h not in names]
    print('  HTML 页面: %d/%d 入包%s'
          % (len(EXPECTED_HTML) - len(absent), len(EXPECTED_HTML),
             ('  缺: %s' % absent) if absent else ''))

    imgs = [n for n in names if n.startswith('assets/')]
    guides = [n for n in imgs if n.startswith('assets/guides/')]
    print('  assets 合计 %d 个文件，其中攻略长图 %d 个' % (len(imgs), len(guides)))
    sp = [n for n in names if 'strategy-' in n]
    print('  攻略页: %s' % sp)

    # SW 预缓存清单对账（S2，第四项自检）：清单里的每一条都必须在包里
    sw_assets = parse_sw_assets()
    sw_fail = False
    if sw_assets is None:
        print('  WARN service-worker.js 里没解析到 ASSETS 清单，跳过对账')
    else:
        lost = [a for a in sw_assets if a not in names]
        print('  SW 预缓存清单: %d 条，对账 %s'
              % (len(sw_assets), ('缺 %s' % lost) if lost else '全部在包内'))
        sw_fail = bool(lost)

    # SW 版本号自检（v66，第七项）：桶名固定后，「有新版」只靠 BUILD 变化来触发
    sw_build, last_build = check_sw_build()
    if sw_build is None:
        print('  WARN service-worker.js 里没解析到 BUILD 常量（v66 起必须保留）')
    elif sw_build == last_build:
        print('  WARN SW BUILD 仍是 %s（与上次打包相同）→ 老用户不会触发更新、'
              '也不弹新版本提示；本次若改过任何资源请把 BUILD 加一（纯重打包可忽略）'
              % sw_build)
    else:
        print('  SW BUILD: %s（上次：%s）' % (sw_build, last_build or '无记录'))
        write_sw_build(sw_build)

    # 数据体检（M1，第五项自检）：manifest/数据/图片/SW 清单四层一致性
    lint_ok, lint_lines = run_akp_lint()
    print('  数据体检（被动板块）: %s' % ('通过' if lint_ok else '未通过'))
    for l in lint_lines[:12]:
        print(l)

    # 未引用图片自检（2026-10-16，第六项）：只告警不阻断
    try:
        unused = check_unused_images()
    except Exception as e:                      # 自检自身出错绝不能拖垮打包
        unused = None
        print('  WARN 未引用图片自检异常: %s' % e)
    if unused:
        urows, utotal = unused
        flag = '   ← 体积可疑，查是否混入校对切片' if utotal > 5 * 1048576 else ''
        print('  未引用图片: %d 个 / %.2fMB%s' % (len(urows), utotal / 1048576.0, flag))
        for r in urows[:8]:
            print('    ' + r)
        if len(urows) > 8:
            print('    …另有 %d 个' % (len(urows) - 8))

    return 0 if not (bad or absent or missing or sw_fail or not lint_ok) else 1


if __name__ == '__main__':
    raise SystemExit(main())
