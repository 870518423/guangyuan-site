# -*- coding: utf-8 -*-
"""
角色被动收录 · 数据体检（akp_lint.py）
================================================
用法：python tools/akp_lint.py            （在站点根目录跑，或由 pack_deploy.py 调用）
退出码：0 = 全部通过；1 = 有 ERROR（应阻断发布）

为什么要有它（审查报告 C-3）：
  11 个角色数据是手写 JS，约定（texts 缺版本=沿用最近改动、names 跟版本走、
  entry.diffs 定位规则）只靠注释传递。typo（vss2、版本键乱序、漏逗号）只在运行时
  以「显示错内容」或「数据加载失败」暴露，而「显示错内容」配合版本回退逻辑
  是最难被发现的一类问题。

检查层次（四层，逐层收紧）：
  A 文件层   manifest ↔ data/*.js 一一对应，id 不重复
  B 数据层   versions 升序无重复、键集合 ⊆ versions、date 齐全
  C 图片层   _images.js 无孤儿条目、portrait/shots 文件真实存在
  D 清单层   被动板块的页面/组件/数据文件都在 SW 预缓存清单里

范围：只读站点 passive/ 目录（及 service-worker.js 的 ASSETS），不做任何写入。
"""
import io
import os
import re
import sys

ROOT = os.environ.get('AKP_LINT_ROOT') or \
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _find_passive(root):
    """自动识别被动板块根：站点根（root/passive/）或板块根（root 本身就是）。
    这样同一份脚本既能体检站点副本，也能预检桌面真源。"""
    if os.path.isfile(os.path.join(root, 'data', '_manifest.js')):
        return root
    if os.path.isfile(os.path.join(root, 'passive', 'data', '_manifest.js')):
        return os.path.join(root, 'passive')
    return os.path.join(root, 'passive')


PASSIVE = _find_passive(ROOT)
DATA = os.path.join(PASSIVE, 'data')

# 未完成角色：允许没有 versions / 没有图片条目（不着 ERROR）
# key = manifest id；这些角色不出现在首页，数据文件可以只有骨架
UNFINISHED = {'oumeijia-zhuque', 'jiebeibeiliya'}

errors = []
warns = []
infos = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warns.append(msg)


def info(msg):
    infos.append(msg)


def read(path):
    with io.open(path, 'r', encoding='utf-8') as fh:
        return fh.read()


def strip_comments(src):
    """去掉 /* */ 与 // 注释，避免注释里的示例文本被当成真数据。"""
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = re.sub(r'(^|[^:])//[^\n]*', lambda m: m.group(1), src)
    return src


# ---------------------------------------------------------------- A 文件层
def parse_manifest(src):
    """解析 _manifest.js 的条目：id / name / file / category / tier / ready。"""
    entries = []
    body = strip_comments(src)
    for m in re.finditer(r'\{([^{}]*)\}', body):
        seg = m.group(1)
        gid = re.search(r'\bid\s*:\s*"([^"]+)"', seg)
        if not gid:
            continue
        entries.append({
            'id': gid.group(1),
            'name': (re.search(r'\bname\s*:\s*"([^"]+)"', seg) or [None, ''])[1],
            'file': (re.search(r'\bfile\s*:\s*"([^"]+)"', seg) or [None, ''])[1],
            'category': (re.search(r'\bcategory\s*:\s*"([^"]+)"', seg) or [None, ''])[1],
            'tier': (re.search(r'\btier\s*:\s*"([^"]+)"', seg) or [None, ''])[1],
            'ready': 'ready: false' not in seg.replace(' ', ''),
        })
    return entries


def check_files(manifest):
    ids, files = set(), set()
    for e in manifest:
        if e['id'] in ids:
            err('A1 manifest id 重复：%s' % e['id'])
        ids.add(e['id'])
        if not e['file']:
            err('A2 manifest 条目缺 file 字段：%s' % e['id'])
            continue
        files.add(os.path.basename(e['file']))
        if not os.path.isfile(os.path.join(PASSIVE, e['file'])):
            err('A3 manifest 指向的数据文件不存在：%s（id=%s）' % (e['file'], e['id']))
        else:
            src = strip_comments(read(os.path.join(PASSIVE, e['file'])))
            gid = re.search(r'\bid\s*:\s*"([^"]+)"', src)
            if not gid:
                err('A4 数据文件里找不到 id 字段：%s' % e['file'])
            elif gid.group(1) != e['id']:
                err('A5 数据文件 id 与 manifest 不一致：%s 里是 %s，manifest 写 %s'
                    % (e['file'], gid.group(1), e['id']))
    # 反向：磁盘上的数据文件都要登记
    for fn in sorted(os.listdir(DATA)):
        if fn.endswith('.js') and not fn.startswith('_') and fn not in files:
            err('A6 数据文件未登记进 _manifest.js：data/%s' % fn)
    # ASCII 命名规则（M4，2026-10-13 起新增角色一律 ASCII 命名）
    legacy = [fn for fn in sorted(os.listdir(DATA))
              if fn.endswith('.js') and not fn.startswith('_') and not fn.isascii()]
    if legacy:
        info('A7 存量中文文件名 %d 个（管理者拍板：存量不动、新增一律 ASCII，见 M4 规则）'
             % len(legacy))
    return ids


# ---------------------------------------------------------------- B 数据层
def check_data(manifest):
    for e in manifest:
        path = os.path.join(PASSIVE, e['file']) if e['file'] else None
        if not path or not os.path.isfile(path):
            continue
        src = strip_comments(read(path))
        name = e['file']

        vm = re.search(r'versions\s*:\s*\[(.*?)\]', src, re.S)
        vers = []
        dates = {}
        if vm:
            for item in re.finditer(r'\{([^{}]*)\}', vm.group(1)):
                seg = item.group(1)
                vid = re.search(r'\bid\s*:\s*"([^"]+)"', seg)
                if not vid:
                    continue
                vers.append(vid.group(1))
                d = re.search(r'\bdate\s*:\s*"([^"]*)"', seg)
                dates[vid.group(1)] = d.group(1) if d else ''

        if not vers:
            if e['id'] in UNFINISHED or not e['ready']:
                info('B0 未完成角色（跳过数据检查）：%s' % name)
                continue
            err('B1 已完成角色没有 versions：%s' % name)
            continue

        # 版本号形如 v1..vN，严格升序、无重复
        nums = []
        for v in vers:
            m = re.fullmatch(r'v(\d+)', v)
            if not m:
                err('B2 版本 id 格式不对（应为 v1/v2/…）：%s 里的 %r' % (name, v))
            else:
                nums.append(int(m.group(1)))
        if len(set(vers)) != len(vers):
            err('B3 版本 id 重复：%s → %s' % (name, vers))
        if nums != sorted(nums):
            err('B4 版本 id 未按升序书写：%s → %s' % (name, vers))
        allowed = set(vers)

        # 每个版本都要有上线日期（2026-10-13 起日期显示在标题条）
        # 未完成角色（不上首页、日期未考订）降级为 WARN，不阻断发布
        soft = e['id'] in UNFINISHED or not e['ready']
        for v in vers:
            if not dates.get(v):
                (warn if soft else err)('B5 版本缺 date 字段：%s 的 %s' % (name, v))
            elif not re.fullmatch(r'\d{4}(-\d{1,2}(-\d{1,2})?)?', dates[v]):
                (warn if soft else err)('B6 date 格式不对（应为 YYYY / YYYY-M / YYYY-M-D）：%s 的 %s = %r'
                                        % (name, v, dates[v]))

        # texts / names 的键必须 ∈ versions（防 vss2、v3 之类 typo）
        # 只认「块起始处 / 逗号后」的 `标识符:` —— 避免把正文里的 http: 之类误判成键
        keypat = re.compile(r'(?:\{|\n\s*|,\s*)([A-Za-z_$][\w$]*)\s*:')
        for key_name in ('texts', 'names'):
            for blk in re.finditer(key_name + r'\s*:\s*\{(.*?)\}', src, re.S):
                keys = keypat.findall('\n' + blk.group(1))
                for k in keys:
                    if k not in allowed:
                        err('B7 %s 的 %s 里出现非法版本键：%s（应为 %s 之一）'
                            % (name, key_name, k, '/'.join(vers)))
                if key_name == 'texts' and not keys:
                    err('B8 空的 texts 对象（既无版本键也无内容）：%s' % name)

        if 'sections' not in src:
            err('B9 数据文件没有 sections：%s' % name)
        else:
            info('B10 通过：%s（%d 版，%s）'
                 % (name, len(vers), '、'.join('%s=%s' % (v, dates.get(v, '?')) for v in vers)))


# ---------------------------------------------------------------- C 图片层
def parse_images(src):
    """解析 _images.js：id -> {'portrait':.., 'shots':[...]}（用括号配对粗解析）。"""
    out = {}
    body = strip_comments(src)
    for m in re.finditer(r'"([a-z0-9-]+)"\s*:\s*\{', body):
        cid = m.group(1)
        i = body.index('{', m.start())
        depth, j = 0, i
        while j < len(body):
            if body[j] == '{':
                depth += 1
            elif body[j] == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        seg = body[i:j + 1]
        portrait = re.search(r'"portrait"\s*:\s*"([^"]+)"', seg)
        shots = re.findall(r'"src"\s*:\s*"([^"]+)"', seg)
        out[cid] = {'portrait': portrait.group(1) if portrait else '', 'shots': shots}
    return out


def check_images(manifest, ids):
    p = os.path.join(DATA, '_images.js')
    if not os.path.isfile(p):
        err('C1 缺少 data/_images.js')
        return
    imgs = parse_images(read(p))
    for cid, v in imgs.items():
        if cid not in ids:
            err('C2 _images.js 有孤儿条目（manifest 里没有这个 id）：%s' % cid)
        if not v['portrait']:
            err('C3 缺 portrait（立绘）路径：%s' % cid)
        for rel in ([v['portrait']] if v['portrait'] else []) + v['shots']:
            if not os.path.isfile(os.path.join(PASSIVE, rel)):
                err('C4 图片文件不存在：%s（角色 %s）' % (rel, cid))
        if not v['shots']:
            warn('C5 该角色没有任何截图条目：%s' % cid)
    for e in manifest:
        if e['id'] in UNFINISHED or not e['ready'] or not e['file']:
            continue
        if os.path.isfile(os.path.join(PASSIVE, e['file'])) and e['id'] not in imgs:
            err('C6 已完成角色缺 _images 条目：%s' % e['id'])
    info('C7 图片层：%d 个角色条目、%d 张图，逐一验存'
         % (len(imgs), sum(len(v['shots']) + 1 for v in imgs.values())))


# ---------------------------------------------------------------- D 清单层
def check_sw(manifest):
    sw_path = os.path.join(ROOT, 'service-worker.js')
    if not os.path.isfile(sw_path):
        # 对板块根（桌面真源）单独体检时没有 SW，这不是缺陷 → 跳过清单层
        info('D1 当前目录没有 service-worker.js（板块根预检模式），跳过 SW 清单对账')
        return
    src = read(sw_path)
    m = re.search(r'const\s+ASSETS\s*=\s*\[(.*?)\];', src, re.S)
    if not m:
        err('D2 service-worker.js 里解析不到 ASSETS 清单')
        return
    listed = set()
    for raw in re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)):
        rel = raw[2:] if raw.startswith('./') else raw
        if rel and rel != '/':
            listed.add(rel)

    need = ['passive/index.html', 'passive/category.html', 'passive/char.html',
            'passive/akp.css', 'passive/akp.js', 'passive/akp-ripple.js',
            'passive/akp-list.css', 'passive/data/_manifest.js', 'passive/data/_images.js']
    for e in manifest:
        if e['file']:
            need.append('passive/' + e['file'])
    for rel in need:
        if rel not in listed:
            err('D3 未进入 SW 预缓存清单：%s' % rel)
    info('D4 清单层：SW 预缓存 %d 条，被动板块必需文件 %d 项全部在列' % (len(listed), len(need)))


def main():
    print('== 角色被动收录 · 数据体检 ==')
    print('站点根：%s' % ROOT)
    mpath = os.path.join(DATA, '_manifest.js')
    if not os.path.isfile(mpath):
        print(' [ERROR] 找不到 %s' % mpath)
        return 1
    manifest = parse_manifest(read(mpath))
    ids = check_files(manifest)
    check_data(manifest)
    check_images(manifest, ids)
    check_sw(manifest)

    for l in infos:
        print('  · %s' % l)
    for l in warns:
        print('  WARN %s' % l)
    for l in errors:
        print('  ERROR %s' % l)
    if errors:
        print('\n体检未通过：%d 个 ERROR、%d 个 WARN' % (len(errors), len(warns)))
        return 1
    print('\n体检通过：0 ERROR、%d WARN（%d 个角色已收录）' % (len(warns), len(manifest)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
