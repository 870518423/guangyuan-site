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

# 以脚本所在目录为站点根
SRC = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SRC, 'deploy.zip')

# 允许进包的顶层文件与目录（目录会递归收集其中所有文件）
INCLUDES = [
    'index.html',
    'calculator.html',
    'guides.html',
    'strategies.html',
    'strategy-xiulian.html',
    'strategy-dati.html',
    'strategy-bingfeiwudou.html',   # 转载攻略页（新增，勿删）
    'manifest.json',
    'service-worker.js',
    'edgeone.json',
    'assets',                        # 含 assets/guides/** 长图，递归自动收集
    'passive',                       # 「奥系角色被动版本收录」板块（目录递归全收；
                                     #  开发用的 _模板.js / _校对预览 等不拷入本目录）
]

# 即便落在 INCLUDES 目录内也一律排除（按文件名后缀/名称判断）
EXCLUDE_SUFFIX = ('.bak', '~', '.tmp', '.swp', '.orig', '.rej')
EXCLUDE_NAMES = {'Thumbs.db', 'desktop.ini', '.DS_Store'}

# 这些扩展名属于「站点会实际请求的资源」，逐个校验存在性（缺了要报警）
EXPECTED_HTML = [n for n in INCLUDES if n.endswith('.html')]


def collect():
    """返回 (arcnames, missing_top)：arcname 用正斜杠，relative to SRC。"""
    got, missing = [], []
    for item in INCLUDES:
        full = os.path.join(SRC, item)
        if os.path.isfile(full):
            got.append(item)
        elif os.path.isdir(full):
            for root, dirs, files in os.walk(full):
                for f in files:
                    if f in EXCLUDE_NAMES or f.endswith(EXCLUDE_SUFFIX):
                        continue
                    abs_path = os.path.join(root, f)
                    rel = os.path.relpath(abs_path, SRC).replace('\\', '/')
                    got.append(rel)
        else:
            missing.append(item)
    return got, missing


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


def main():
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

    return 0 if not (bad or absent or missing or sw_fail) else 1


if __name__ == '__main__':
    raise SystemExit(main())
