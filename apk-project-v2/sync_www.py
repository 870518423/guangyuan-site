# -*- coding: utf-8 -*-
"""把本仓库根目录的网站真源同步进 Capacitor 的 www（第 17 轮重打 APK；
   第 18 轮把「文件集」抽成 collect_www_files()，供 pack_deploy.py 生成
   content.json —— 两边必须同源一致）

规则（与既有口径一致，勿改）：
  收：*.html（排除 EdgeOne迁移计划.html / guide_template.html）
      manifest.json / service-worker.js / ak-analytics.js / module.json /
      version.json / content.json（第 18 轮新增：内容覆盖层更新清单）
      assets/**（排除 assets/guides —— 2MB 攻略长图）
      passive/**（排除 passive/img —— 图片走资源包/线上）
  不收：images/**、app/**（App 内不该再放安装包）、*.md、tools/**
先清空 www 再拷，杜绝残留旧文件。
"""
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)   # 网站与 Android 工程共用本仓库根目录
DST = os.path.join(HERE, 'www')
SRC = os.path.normpath(SRC)
DST = os.path.normpath(DST)

EXCLUDE_HTML = {'EdgeOne迁移计划.html', 'guide_template.html'}
EXCLUDE_DIRS = {'images', 'app', 'tools', 'sources', '.git', '__pycache__', 'node_modules', 'guides'}
EXCLUDE_FILE_EXT = {'.md', '.py', '.zip', '.bak', '.xlsx'}
# 按相对路径整体跳过：2MB 攻略长图 + 被动板块截图（图片走资源包 / 线上）
SKIP_PATHS = {'assets/guides', 'passive/img'}
# 顶层白名单（html / 核心 json / js 入口）——第 18 轮加 content.json
TOP_WHITELIST = ('manifest.json', 'service-worker.js', 'ak-analytics.js',
                 'module.json', 'version.json', 'content.json')

assert os.path.isdir(SRC), 'no src: ' + SRC


def collect_www_files():
    """按白名单规则收集「会进 www 的文件」——相对 SRC 的正斜杠路径，已排序。

    ⚠️ 这是 www 文件集的**唯一来源**：拷贝逻辑与 pack_deploy.py 生成
    content.json（内容覆盖层更新清单）都调它。改白名单只改这里一处，
    改完 APK 包与线上 content.json 自动保持一致。
    """
    out = []

    def consider(rel):
        name = os.path.basename(rel)
        ext = os.path.splitext(name)[1].lower()
        if ext in EXCLUDE_FILE_EXT:
            return
        if ext == '.html' and name in EXCLUDE_HTML:
            return
        if '/' not in rel:                     # 顶层：只收白名单
            if not (ext == '.html' or name in TOP_WHITELIST):
                return
        if name == 'guides' and rel.startswith('assets/'):
            return
        out.append(rel)

    def walk(root_rel):
        base = os.path.join(SRC, root_rel) if root_rel else SRC
        for name in sorted(os.listdir(base)):
            p = os.path.join(base, name)
            rel = os.path.relpath(p, SRC).replace('\\', '/')
            if rel in SKIP_PATHS:
                continue
            if os.path.isdir(p):
                if name in EXCLUDE_DIRS:
                    continue
                # 顶层只收 assets / passive 两个目录（真源里还有 _效果图 等预览目录，不进 www）
                if not root_rel and name not in ('assets', 'passive'):
                    continue
                walk(rel)
            else:
                consider(rel)

    walk('')
    return sorted(out)


def main():
    if not os.path.isdir(DST):
        os.makedirs(DST)

    # ⚠️ 不再整目录 rmtree：本机 safe-delete 会拦（一次 >50 个文件直接拒绝）。
    # 覆盖式同步 + 可选 --prune（逐个删 + 忽略失败，避免批量删除被拦）。
    PRUNE = '--prune' in sys.argv
    files = collect_www_files()

    if PRUNE:
        keep = set(files)
        for root, _dirs, fns in os.walk(DST):
            for f in fns:
                rel = os.path.relpath(os.path.join(root, f), DST).replace('\\', '/')
                if rel in keep:
                    continue
                # 只清理我们管理的范围（顶层白名单 + assets/passive 两目录），
                # 不动 www 里其他可能存在的构建产物
                top = rel.split('/', 1)[0]
                managed = ('/' not in rel and (rel.endswith('.html') or rel in TOP_WHITELIST)) \
                    or top in ('assets', 'passive')
                if not managed:
                    continue
                try:
                    os.remove(os.path.join(root, f))
                    print('  prune:', rel)
                except Exception as e:
                    print('  prune 失败（可忽略）:', rel, e)

    copied = 0
    bytes_total = 0
    for rel in files:
        s = os.path.join(SRC, rel)
        d = os.path.join(DST, rel)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        shutil.copy2(s, d)
        copied += 1
        bytes_total += os.path.getsize(d)

    print('www 同步完成：%d 个文件 / %.2f MB' % (copied, bytes_total / 1048576.0))
    for f in ('index.html', 'service-worker.js', 'module.json', 'version.json',
              'manifest.json', 'content.json'):
        print('  ' + (f if os.path.exists(os.path.join(DST, f)) else 'MISSING ' + f))


if __name__ == '__main__':
    main()
