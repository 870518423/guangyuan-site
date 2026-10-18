# -*- coding: utf-8 -*-
"""
人间体图鉴 · 图片落位与压缩（2026-10-17）
================================================================
把桌面真源的三形态立绘 / 常态头像，压成站点用尺寸并落到
`images/humans/<id>/`，同时生成 `manifest.json` 供 build_guides.py 取用。

用法：
    python tools/build_human_imgs.py                # 增量（已存在且源没变就跳过）
    python tools/build_human_imgs.py --force        # 全部重压
    python tools/build_human_imgs.py --dry-run      # 只统计，不写盘

真源（管理者维护）：
    C:\\Users\\Admin\\Desktop\\奥系道具图片\\奥系人间体\\
        立绘\\<角色>\\常态.webp | 觉醒.webp | 超越觉醒.webp
        头像\\<角色>\\常态.webp | 觉醒.webp | 超越觉醒.webp
    头像**只用常态**（管理者口径：列表里只显示常态头像）。

落位（全 ASCII，避免中文路径在 CDN / URL 编码上的坑）：
    images/humans/<id>/base.webp      常态
    images/humans/<id>/awaken.webp    觉醒
    images/humans/<id>/transcend.webp 超越觉醒
    images/humans/<id>/avatar.webp    常态头像（96×96）

id = 角色目录名的 md5 前 8 位 —— **加角色 / 改名都不会让其它角色的 URL 变化**，
不会像「顺序编号」那样一插就全体失效。

尺寸（2026-10-17 管理者改口径）：
    **立绘等比缩到长边 420、q86**（约 40KB/张，403 张 ≈ 16MB）——
    绝不裁、不拉伸（2026-10-17 曾强制 240×240 把非方图压扁，已修）；
    详情里显示 340 左右够清晰，点开可全屏看同一张。
    头像等比缩到长边 96（圆形 cover 显示，192→96 视觉无差），约 1.6MB。
"""
import os
import sys
import json
import shutil
import hashlib
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
SRC = r"C:\Users\Admin\Desktop\奥系道具图片\奥系人间体"
OUT = os.path.join(SITE, "images", "humans")
MANIFEST = os.path.join(OUT, "manifest.json")

FORMS = [("常态", "base"), ("觉醒", "awaken"), ("超越觉醒", "transcend")]
PORTRAIT_W = 420    # 等比缩到长边 420（不裁不拉伸，可按需改档；0 = 原图直出）
PORTRAIT_Q = 86     # 立绘 webp 质量（点击看大图用同一张，所以别压太狠）
AVATAR_W = 96       # 头像长边


def char_id(name):
    return hashlib.md5(name.encode("utf-8")).hexdigest()[:8]


def square_fit(im, size):
    """裁掉透明边（人物到底图里的位置不正时会缩在左上角，2026-10-18 修），
    再等比缩进 size×size，居中贴到透明画布 —— 圆形头像裁切时人物才是居中的。"""
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    im.thumbnail((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas


def webp(src, dst, max_side, quality=82):
    """max_side=0 → 原图直出（只拷贝，不动像素）；否则**等比**缩到长边 max_side。
    ⚠️ 绝不强制成正方形：非正方形原图那样会被压扁（2026-10-17 踩过）。"""
    if not max_side:
        shutil.copy2(src, dst)
        return os.path.getsize(dst)
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    scale = max_side / float(max(w, h))
    if scale < 1:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    im.save(dst, "WEBP", quality=quality, method=4)
    return os.path.getsize(dst)


def main():
    force = "--force" in sys.argv
    dry = "--dry-run" in sys.argv
    if not os.path.isdir(SRC):
        sys.exit("找不到真源目录：" + SRC)

    lil_dir = os.path.join(SRC, "立绘")
    ava_dir = os.path.join(SRC, "头像")
    names = sorted(d for d in os.listdir(lil_dir) if os.path.isdir(os.path.join(lil_dir, d)))

    chars = {}
    tot = 0
    done = 0
    skipped = 0
    missing = []

    for name in names:
        cid = char_id(name)
        out_dir = os.path.join(OUT, cid)
        forms = []
        typo = []
        for cn, en in FORMS:
            s = os.path.join(lil_dir, name, cn + ".webp")
            if not os.path.isfile(s):
                typo.append(cn)
                continue
            forms.append(en)
            d = os.path.join(out_dir, en + ".webp")
            if dry:
                continue
            os.makedirs(out_dir, exist_ok=True)
            if not force and os.path.isfile(d) and os.path.getmtime(d) >= os.path.getmtime(s):
                skipped += 1
                tot += os.path.getsize(d)
                continue
            tot += webp(s, d, PORTRAIT_W, PORTRAIT_Q)
            done += 1

        # 头像只用常态
        ava_src = os.path.join(ava_dir, name, "常态.webp")
        has_avatar = os.path.isfile(ava_src)
        if has_avatar and not dry:
            d = os.path.join(out_dir, "avatar.webp")
            if force or not os.path.isfile(d) or os.path.getmtime(d) < os.path.getmtime(ava_src):
                _im = square_fit(Image.open(ava_src).convert("RGBA"), AVATAR_W)
                _im.save(d, "WEBP", quality=82, method=4)
                tot += os.path.getsize(d)
                done += 1
            else:
                skipped += 1
                tot += os.path.getsize(d)

        chars[name] = {"id": cid, "forms": forms, "avatar": has_avatar}
        if typo:
            missing.append((name, typo))

    if dry:
        print("角色 %d 个｜立绘 %d 张｜缺形态 %d 人" % (
            len(names), sum(len(v["forms"]) for v in chars.values()), len(missing)))
        print("缺形态：", missing)
        return

    os.makedirs(OUT, exist_ok=True)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({
            "generated": __import__("datetime").date.today().isoformat(),
            "portrait": {"size": PORTRAIT_W, "quality": PORTRAIT_Q, "note": "等比缩到长边，保持比例"},
            "avatar": {"size": AVATAR_W, "note": "等比缩到长边 96"},
            "chars": chars,
        }, f, ensure_ascii=False, indent=1)

    print("角色 %d 个｜新压 %d 张｜跳过 %d 张｜合计 %.1f MB" % (len(names), done, skipped, tot / 1048576))
    if missing:
        print("缺形态（箭头会置灰）：", missing)
    print("清单 →", MANIFEST)


if __name__ == "__main__":
    main()
