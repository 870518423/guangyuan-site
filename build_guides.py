# -*- coding: utf-8 -*-
"""
一键生成「奥系人间体大全」查询页
================================================
用法：
    python build_guides.py                     # 用默认表格路径
    python build_guides.py "D:\\某处\\人间体大全.xlsx"

流程：
    读 Excel（4 个阵营子表） → 解析成 JSON → 填入 guide_template.html → 输出 guides.html

表格列约定（4 张子表一致，表头第 1 行，数据从第 2 行开始）：
    A 人间体名称 | B 本命 | C 获得方式 | D 前置要求 | E~I 特训人间体（最多 5 个）

改完表格后重跑本脚本即可，不需要手工改网页。
"""
import json
import os
import sys
import datetime

try:
    import openpyxl
except ImportError:
    sys.exit("缺少依赖：请先安装 openpyxl（pip install openpyxl）")

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = r"C:\Users\Admin\Desktop\奥系道具图片\人间体大全（含特训及条件）.xlsx"
TEMPLATE = os.path.join(HERE, "guide_template.html")
OUT = os.path.join(HERE, "guides.html")

# 阵营 → 图标 / 主题色（改图标只需换这里的文件名）
FACTIONS = [
    {"name": "奥特之星", "icon": "assets/factions/star.png",       "color": "#fbbf24"},
    {"name": "多宇宙",   "icon": "assets/factions/multiverse.png", "color": "#38bdf8"},
    {"name": "怪兽",     "icon": "assets/factions/monster.png",    "color": "#34d399"},
    {"name": "宇宙人",   "icon": "assets/factions/alien.png",      "color": "#a78bfa"},
]

# 多值分隔符：换行 + 全角逗号 + 顿号
SEPS = "\n，、"

COL_NAME, COL_FATE, COL_HOW, COL_PREQ = 0, 1, 2, 3
TRAIT_RANGE = (4, 9)  # E~I


def split_multi(value):
    """把一格里的多值拆成列表，去空、去重、保留顺序。"""
    if value is None:
        return []
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    parts = []
    for chunk in text.split("\n"):
        for piece in chunk.replace("，", "\u0001").replace("、", "\u0001").split("\u0001"):
            piece = piece.strip().strip("，、,;；").strip()
            if piece and piece not in parts:
                parts.append(piece)
    return parts


def load_entries(src):
    wb = openpyxl.load_workbook(src, data_only=True)
    known = {f["name"] for f in FACTIONS}
    entries = []
    per_faction = {}

    for ws in wb.worksheets:
        title = ws.title.strip()
        faction = title if title in known else title
        got = 0
        for row in ws.iter_rows(min_row=2, max_row=ws.max_row,
                                min_col=1, max_col=TRAIT_RANGE[1],
                                values_only=True):
            name = row[COL_NAME]
            if name is None or not str(name).strip():
                continue
            name = str(name).strip()
            traits = []
            for cell in row[TRAIT_RANGE[0]:TRAIT_RANGE[1]]:
                for t in split_multi(cell):
                    if t not in traits:
                        traits.append(t)
            entries.append({
                "name": name,
                "faction": faction,
                "fate": split_multi(row[COL_FATE]),
                "how": split_multi(row[COL_HOW]),
                "prereq": split_multi(row[COL_PREQ]),
                "traits": traits,
            })
            got += 1
        per_faction[faction] = got
        print(f"  [{title}] {got} 条")

    return entries, per_faction


def find_source(explicit):
    """定位表格：优先用命令行传入的路径；否则用默认路径；再否则自动在桌面里找。"""
    if explicit:
        if os.path.isfile(explicit):
            return explicit
        sys.exit(f"找不到表格文件：{explicit}")
    if os.path.isfile(DEFAULT_SRC):
        return DEFAULT_SRC
    # 默认路径失效时（比如文件被改名），在桌面里自动找最新的「人间体*.xlsx」
    cands = []
    for folder in (os.path.join(os.path.expanduser("~"), "Desktop"),
                   os.path.join(os.path.expanduser("~"), "Desktop", "奥系道具图片")):
        if not os.path.isdir(folder):
            continue
        for fn in os.listdir(folder):
            low = fn.lower()
            if low.endswith(".xlsx") and "人间体" in fn and not fn.startswith("~$"):
                cands.append(os.path.join(folder, fn))
    if cands:
        cands.sort(key=os.path.getmtime, reverse=True)
        picked = cands[0]
        print(f"注意：默认表格不存在，已自动改用：{picked}")
        if len(cands) > 1:
            print("      （同目录下还有其它候选，如需指定请把表格拖到「生成攻略页.bat」上）")
        return picked
    sys.exit(
        "找不到表格文件。\n"
        f"  默认路径：{DEFAULT_SRC}\n"
        "  解决办法：把 Excel 表格直接拖到「生成攻略页.bat」上运行，"
        "或在命令行里把路径作为参数传进来。"
    )


def main():
    src = find_source(sys.argv[1] if len(sys.argv) > 1 else None)
    if not os.path.isfile(TEMPLATE):
        sys.exit(f"找不到模板文件：{TEMPLATE}")

    print("读取表格：", src)
    entries, per_faction = load_entries(src)
    if not entries:
        sys.exit("没有解析到任何条目，请检查表格结构。")

    data = {
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "source": os.path.basename(src),
        "factions": FACTIONS,
        "entries": entries,
    }
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    with open(TEMPLATE, "r", encoding="utf-8") as fh:
        tpl = fh.read()
    if "/*__GUIDE_DATA__*/" not in tpl:
        sys.exit("模板里找不到数据占位符 /*__GUIDE_DATA__*/")
    html = tpl.replace("/*__GUIDE_DATA__*/ null", payload)

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(html)

    size = os.path.getsize(OUT)
    print("\n生成完成：", OUT)
    print(f"  条目总数：{len(entries)}")
    for f in FACTIONS:
        print(f"    {f['name']}: {per_faction.get(f['name'], 0)}")
    print(f"  输出体积：{size:,} 字节（约 {size/1024:.1f} KB）")
    no_trait = [e["name"] for e in entries if not e["traits"]]
    if no_trait:
        print(f"  提示：{len(no_trait)} 条没有任何特训人间体 → {', '.join(no_trait[:8])}")


if __name__ == "__main__":
    main()
