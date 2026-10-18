# -*- coding: utf-8 -*-
"""角色截图「长图」压缩工具（2026-10-17，管理者授权）

为什么需要
------------------------------------------------------------------
管理者反馈「下载奥美珈的图片很慢」。排查发现 `passive/img/` 里的技能长图是
**游戏截图原始分辨率**（最大 1200x5739 / 471KB、1280x2321 / 236KB），手机上
既要下载又要解码（6.9MP 解码几百 ms、占约 28MB 内存）。
缓存规则只能减"等待"，减不了"体积"，所以要压图。

规则（以后照此执行）
------------------------------------------------------------------
1. 只压「又长又大」的：**高 >= MIN_H(1800)** 且（**体积 >= MIN_BYTES(300KB)**
   **或 宽 >= MIN_W(1000)**）。
   其余长图（568~935 宽、100~195KB）一律不动 —— 它们才 100~190KB，压了省不了
   多少，却会让被动技的文字发虚（原图版的用途就是核对原文），得不偿失。
   角色图（portrait）与短截图同理不压。
2. 宽度超过 MAX_W(900) 才等比缩到 900；**绝不放大**（891 宽的图只重编码不缩放）。
3. 重编码参数：WebP `quality=82, method=6`（method=6 压得最实，慢一点无所谓）。
4. 压完若体积**没有变小**，立即回滚（不让"压缩"变成"膨胀"）。
5. 写临时文件再 `os.replace` 覆盖，避免中途失败留下半截文件。
6. **不备份**：素材真源在桌面的素材目录，站点 `passive/img/` 只是拷贝。
   ⚠️ 因此：从真源重新拷贝素材进站点后，必须重跑本脚本（否则压缩会被冲掉）。
   需要留底时用 `--backup`，原图会移到 `tools/_akp_img_backup/<角色目录>/`。

用法
------------------------------------------------------------------
    python tools/akp_compress_imgs.py            # 只看会压哪些（--report）
    python tools/akp_compress_imgs.py --apply    # 真的压
    python tools/akp_compress_imgs.py --apply --backup
"""
import os
import sys

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'passive', 'img')
BACKUP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_akp_img_backup')

MAX_W = 900          # 宽超过这个就等比缩到它（不放大）
MIN_W = 1000         # 宽达到这个才算「宽图」（配合长高一起判定）
MIN_H = 1800         # 高达到这个算长图
MIN_BYTES = 300 * 1024
QUALITY = 82
METHOD = 6
EXTS = ('.webp', '.jpg', '.jpeg', '.png')


def need(path):
    """返回 (要不要压, 原尺寸, 原因)。"""
    from PIL import Image
    size = os.path.getsize(path)
    with Image.open(path) as im:
        w, h = im.size
    if h < MIN_H:
        return False, (w, h), ''
    if size >= MIN_BYTES:
        return True, (w, h), 'big %.0fKB' % (size / 1024.0)
    if w >= MIN_W:
        return True, (w, h), 'wide %d' % w
    return False, (w, h), ''


def main():
    from PIL import Image
    apply = '--apply' in sys.argv
    backup = '--backup' in sys.argv
    rows = []
    for d in sorted(os.listdir(BASE)):
        p = os.path.join(BASE, d)
        if not os.path.isdir(p):
            continue
        for f in sorted(os.listdir(p)):
            if not f.lower().endswith(EXTS):
                continue
            fp = os.path.join(p, f)
            ok, (w, h), why = need(fp)
            if ok:
                rows.append((os.path.join(d, f), fp, w, h, os.path.getsize(fp), why))
    rows.sort(key=lambda r: -r[4])

    if not rows:
        print('没有需要压缩的图（阈值：高>=%d 或 >=%dKB）' % (MIN_H, MIN_BYTES / 1024))
        return

    print('%d 张待处理，合计 %.2fMB  →  %s' %
          (len(rows), sum(r[4] for r in rows) / 1048576.0,
           '执行压缩' if apply else '仅预览（加 --apply 才真的压）'))
    tot_before = tot_after = 0
    print('%-46s %10s %10s %11s' % ('file', 'before', 'after', 'pixels'))
    for rel, fp, w, h, before, why in rows:
        tot_before += before
        if not apply:
            print('%-46s %9.0fK %10s %6sx%-5d  %s'
                  % (rel, before / 1024.0, '(未压)', w, h, why))
            continue
        try:
            with Image.open(fp) as im:
                im.load()
                nw = min(w, MAX_W)
                nh = round(h * nw / float(w)) if nw != w else h
                out = im.resize((nw, nh), Image.LANCZOS) if (nw, nh) != (w, h) else im.copy()
            tmp = fp + '.tmp'
            out.save(tmp, 'WEBP', quality=QUALITY, method=METHOD)
            after = os.path.getsize(tmp)
            if after >= before:
                os.remove(tmp)
                print('%-46s %9.0fK %10s %6sx%-5d  (压缩后没变小，回滚)'
                      % (rel, before / 1024.0, '-', w, h))
                tot_after += before
                continue
            if backup:
                bd = os.path.join(BACKUP, os.path.dirname(rel))
                if not os.path.isdir(bd):
                    os.makedirs(bd)
                os.replace(fp, os.path.join(bd, os.path.basename(rel)))
            os.replace(tmp, fp)
            tot_after += after
            print('%-46s %9.0fK %9.0fK %6dx%-5d  -%.0f%%'
                  % (rel, before / 1024.0, after / 1024.0, nw, nh,
                     (1 - after / float(before)) * 100))
        except Exception as e:
            print('%-46s  失败: %s' % (rel, e))
            tot_after += before

    if apply:
        print('\n合计 %.2fMB → %.2fMB（省 %.2fMB，%.0f%%）'
              % (tot_before / 1048576.0, tot_after / 1048576.0,
                 (tot_before - tot_after) / 1048576.0,
                 (1 - tot_after / float(tot_before)) * 100 if tot_before else 0))


if __name__ == '__main__':
    main()
