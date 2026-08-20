# -*- coding: utf-8 -*-
"""
gen_covers.py —— 生成《Simultwin》CrazyGames 上架封面（3 张）+ 预览视频首帧（2 张）

规格来源：design/rebrand/visual-identity.md §2.2（封面构图）/ §3（品牌处理）
色值来源：src/theme.js（TILE_COLORS / BOARD_FRAME / BG_GRADIENT_* / TEXT_PRIMARY / 语义色）

产出：
  assets/cover-landscape-1920x1080.png   16:9  横版封面（必填）
  assets/cover-portrait-800x1200.png     2:3   竖版封面（必填）
  assets/cover-square-800x800.png        1:1   方形封面（必填）
  assets/video-firstframe-landscape-1920x1080.png  横版视频首帧
  assets/video-firstframe-portrait-1080x1620.png   竖版视频首帧（2:3 @1080p）

设计系统（三图统一，保证跨比例可辨认为同一款游戏）：
  1. 暖奶油→蜜桃渐变底（纯扁平，无柔光 / 无投影 / 无光晕）
  2. 主视觉：两块完整的 4×4 棋盘（横版/方形左右并排，竖版上下堆叠），
     两盘在同一相对位置呈现「2→4 并行合并」瞬间（两个 2 相互滑入）
  3. 天蓝粗箭头（#7EC8E3）横扫两盘，表达「一次滑动同时驱动双盘」
  4. 标题「Simultwin」单行深海军蓝（#1F3A4D）+ 白细描边 + 小「×2」徽章
  5. ≤4 枚金色四角星点缀（不遮挡双盘）

合规：最高可见方块 ≤ 1024（无 2048 方块 / 无 "2048" 字样）；无边框；
      除标题外无任何文字；非游戏截图（原创设计稿）。

用法：python tools/gen_covers.py
本脚本只产出美术资产，不涉及任何游戏逻辑代码。
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- 色板（src/theme.js）

BG_TOP = (0xFF, 0xF9, 0xEF)        # 背景渐变·顶：暖奶油白
BG_BOTTOM = (0xFF, 0xE6, 0xD2)     # 背景渐变·底：蜜桃粉
BOARD_FRAME = (0xE7, 0xD0, 0xA8)   # 棋盘外框：暖沙色
BOARD_EMPTY = (0xF3, 0xE7, 0xD3)   # 棋盘空格：沙色
TITLE_NAVY = (0x1F, 0x3A, 0x4D)    # 标题：墨蓝灰（theme.js TEXT_PRIMARY）
BADGE = (0xFF, 0xC9, 0x4D)         # 「×2」徽章：冻结黄
BADGE_TEXT = (0x5C, 0x47, 0x00)    # 徽章文字：深字
ARROW = (0x7E, 0xC8, 0xE3)         # 同步箭头：撤销天蓝
GOLD = (0xFF, 0xB0, 0x14)          # 王者金（星芒点缀）

# 方块色板（2 → 1024；不含 2048，保证封面上永不出现 2048 方块）
TILE = {
    2:    ((0xFF, 0xF6, 0xE3), (0x6B, 0x5B, 0x3E)),
    4:    ((0xFF, 0xEB, 0xC8), (0x6B, 0x5B, 0x3E)),
    8:    ((0xFF, 0xC9, 0x7B), (0x4A, 0x2A, 0x0E)),
    16:   ((0xFF, 0xA9, 0x5E), (0x4A, 0x2A, 0x0E)),
    32:   ((0xF7, 0x5C, 0x40), (0xFF, 0xFF, 0xFF)),
    64:   ((0xE8, 0x4A, 0x30), (0xFF, 0xFF, 0xFF)),
    128:  ((0xFF, 0xE2, 0x8A), (0x5C, 0x47, 0x00)),
    256:  ((0xFF, 0xD7, 0x5E), (0x5C, 0x47, 0x00)),
    512:  ((0xFF, 0xC9, 0x3C), (0x5C, 0x47, 0x00)),
    1024: ((0xFF, 0xBC, 0x26), (0x5C, 0x47, 0x00)),
}

FONT_TITLE = r"C:\Windows\Fonts\ARLRDBD.TTF"      # Arial Rounded MT Bold（圆润，非默认字体）
FONT_FALLBACK = [r"C:\Windows\Fonts\ariblk.ttf", r"C:\Windows\Fonts\arialbd.ttf"]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets")

SS = 2   # 超采样倍数

# ---------------------------------------------------------------- 并行合并瞬间（§2.2）
# 两盘在同一相对位置放两个相邻的 2，并让它们向彼此滑入 —— 一眼看出「2→4 同时发生」。
# MERGE_H：横版/方形（左右并排，滑动方向水平）
# MERGE_V：竖版（上下堆叠，滑动方向垂直）
MERGE_H = {(1, 2): (0.18, 0.0), (1, 3): (-0.18, 0.0)}
MERGE_V = {(0, 2): (0.0, 0.18), (1, 2): (0.0, -0.18)}

# 横版 / 方形棋盘（行 1 列 2、3 为并行合并对）
GRID_A_H = [
    [4,   8,    0,   2],
    [16,  64,   2,   2],
    [32,  128,  8,   0],
    [256, 0,    4,   2],
]
GRID_B_H = [
    [8,   4,    0,   2],
    [32,  128,  2,   2],
    [64,  256,  4,   0],
    [512, 0,    2,   4],
]
# 竖版棋盘（列 2 行 0、1 为并行合并对）
GRID_A_V = [
    [4,   8,    2,   2],
    [16,  64,   2,   128],
    [32,  0,    8,   0],
    [256, 0,    4,   2],
]
GRID_B_V = [
    [8,   4,    2,   2],
    [32,  128,  2,   64],
    [64,  256,  4,   0],
    [512, 0,    2,   4],
]


def font(px, path=FONT_TITLE):
    for p in [path] + FONT_FALLBACK:
        if os.path.exists(p):
            return ImageFont.truetype(p, max(1, int(px)))
    raise RuntimeError("no font found")


def gradient(w, h, top, bottom):
    g = Image.new("RGB", (1, h))
    px = g.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return g.resize((w, h), Image.BICUBIC)


def draw_tile(size, value):
    """单个扁平糖果方块（无投影 / 无唇边 / 无高光 / 无光晕），返回 RGBA"""
    pad = int(size * 0.14)
    L = size + pad * 2
    layer = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    body, fg = TILE.get(value, TILE[1024])
    radius = int(size * 0.25)
    x0 = y0 = pad
    x1 = y1 = pad + size
    d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=body + (255,))

    # 数字（按数值位数缩放）
    s = size * 0.44
    if value >= 1000:
        s *= 0.72
    elif value >= 100:
        s *= 0.86
    f = font(s)
    txt = str(value)
    bb = f.getbbox(txt)
    tx = x0 + (size - (bb[2] - bb[0])) / 2 - bb[0]
    ty = y0 + (size - (bb[3] - bb[1])) / 2 - bb[1]
    d.text((tx, ty), txt, font=f, fill=fg + (255,))
    return layer


def draw_board(cell, grid, merge=None):
    """4×4 完整棋盘（外框 + 空格 + 扁平方块），返回 RGBA。merge 指定滑动偏移（格宽倍数）。"""
    gap = cell * 0.09
    pad = cell * 0.17
    inner = 4 * cell + 3 * gap
    B = int(inner + pad * 2)

    board = Image.new("RGBA", (B, B), (0, 0, 0, 0))
    d = ImageDraw.Draw(board)
    d.rounded_rectangle([0, 0, B - 1, B - 1], radius=int(cell * 0.30),
                        fill=BOARD_FRAME + (255,))

    for r in range(4):
        for c in range(4):
            x = pad + c * (cell + gap)
            y = pad + r * (cell + gap)
            d.rounded_rectangle([x, y, x + cell, y + cell],
                                radius=int(cell * 0.25), fill=BOARD_EMPTY + (255,))

    for r in range(4):
        for c in range(4):
            v = grid[r][c]
            if not v:
                continue
            x = pad + c * (cell + gap)
            y = pad + r * (cell + gap)
            if merge and (r, c) in merge:
                dx, dy = merge[(r, c)]
                x += dx * cell
                y += dy * cell
            t = draw_tile(int(cell), v)
            off = (t.width - cell) / 2
            board.alpha_composite(t, (int(x - off), int(y - off)))
    return board


def draw_arrow(d, x1, y1, x2, y2, width, color, alpha=255):
    """粗箭头（圆头起点 + 三角箭头），横扫双盘表达「一次滑动驱动双盘」"""
    col = color + (alpha,)
    import math as _m
    ang = _m.atan2(y2 - y1, x2 - x1)
    # 圆头起点
    d.ellipse([x1 - width / 2, y1 - width / 2, x1 + width / 2, y1 + width / 2],
              fill=col)
    # 箭杆
    L = width * 2.6
    sx = x2 - L * _m.cos(ang)
    sy = y2 - L * _m.sin(ang)
    d.line([(x1, y1), (sx, sy)], fill=col, width=width)
    # 箭头
    Wd = width * 1.4
    tip = (x2, y2)
    b1 = (x2 - L * _m.cos(ang) + Wd * _m.cos(ang + _m.pi / 2),
          y2 - L * _m.sin(ang) + Wd * _m.sin(ang + _m.pi / 2))
    b2 = (x2 - L * _m.cos(ang) + Wd * _m.cos(ang - _m.pi / 2),
          y2 - L * _m.sin(ang) + Wd * _m.sin(ang - _m.pi / 2))
    d.polygon([tip, b1, b2], fill=col)


def sparkle(draw, cx, cy, r, color=GOLD, alpha=255):
    """四角星芒（扁平小点缀，≤4 枚）"""
    thin = r * 0.24
    pts = [(cx, cy - r), (cx + thin, cy - thin), (cx + r, cy), (cx + thin, cy + thin),
           (cx, cy + r), (cx - thin, cy + thin), (cx - r, cy), (cx - thin, cy - thin)]
    draw.polygon(pts, fill=color + (alpha,))


def draw_title_lockup(canvas, cx, top_y, size):
    """标题锁字：单行「Simultwin」（#1F3A4D + 白细描边）+ 右侧小「×2」徽章。
    这是封面上**唯一允许出现的文字**（官方规定）。"""
    d = ImageDraw.Draw(canvas)

    f = font(size)
    text = "Simultwin"
    bb = f.getbbox(text)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]

    badge_h = size * 0.62
    badge_w = badge_h * 2.45
    gap = size * 0.30
    total = tw + gap + badge_w
    x0 = cx - total / 2
    y0 = top_y

    # 标题：墨蓝灰 + 白细描边
    d.text((x0 - bb[0], y0 - bb[1]), text, font=f, fill=TITLE_NAVY + (255,),
           stroke_width=max(1, int(size * 0.03)), stroke_fill=(255, 255, 255, 235))

    # 「×2」徽章（乘法符号 U+00D7）
    bcx = x0 + tw + gap + badge_w / 2
    bcy = y0 + th / 2
    d.rounded_rectangle([bcx - badge_w / 2, bcy - badge_h / 2,
                         bcx + badge_w / 2, bcy + badge_h / 2],
                        radius=badge_h / 2, fill=BADGE + (255,))
    fb = font(size * 0.34)
    bb2 = fb.getbbox("\u00d72")
    bw, bh = bb2[2] - bb2[0], bb2[3] - bb2[1]
    d.text((bcx - bw / 2 - bb2[0], bcy - bh / 2 - bb2[1]), "\u00d72",
           font=fb, fill=BADGE_TEXT + (255,))

    return y0 + th


def render(base_w, base_h, layout, scale=1.0):
    """按设计稿坐标渲染封面。base_* 为设计稿尺寸，scale 为输出倍率。"""
    W, H = int(base_w * scale), int(base_h * scale)
    u = scale  # 设计稿 px → 输出 px

    canvas = gradient(W, H, BG_TOP, BG_BOTTOM).convert("RGBA")

    if layout == "landscape":
        # 标题居中置顶；双盘左右并排；天蓝箭头水平横扫合并行
        cell = 148 * u
        ga = draw_board(cell, GRID_A_H, MERGE_H)
        gb = draw_board(cell, GRID_B_H, MERGE_H)
        cx_a, cx_b, cy = int(584 * u), int(1336 * u), int(640 * u)
        canvas.alpha_composite(ga, (cx_a - ga.width // 2, cy - ga.height // 2))
        canvas.alpha_composite(gb, (cx_b - gb.width // 2, cy - gb.height // 2))

        draw_title_lockup(canvas, int(960 * u), int(110 * u), 118 * u)

        board_top = cy - ga.height // 2
        pad = 0.17 * cell
        merge_y = board_top + pad + 1 * (cell + cell * 0.09) + cell / 2
        d = ImageDraw.Draw(canvas)
        draw_arrow(d, cx_a - ga.width // 2, merge_y,
                   cx_b + gb.width // 2, merge_y, int(26 * u), ARROW, 215)

        sparks = [(1780, 170, 16), (150, 930, 14), (120, 200, 12)]

    elif layout == "portrait":
        # 标题居中置顶；双盘上下堆叠（呼应竖屏实际布局）；天蓝箭头垂直横扫合并列
        cell = 84 * u
        ga = draw_board(cell, GRID_A_V, MERGE_V)
        gb = draw_board(cell, GRID_B_V, MERGE_V)
        cx = int(400 * u)
        cy_a, cy_b = int(530 * u), int(970 * u)
        canvas.alpha_composite(ga, (cx - ga.width // 2, cy_a - ga.height // 2))
        canvas.alpha_composite(gb, (cx - gb.width // 2, cy_b - gb.height // 2))

        draw_title_lockup(canvas, cx, int(110 * u), 80 * u)

        board_top = cy_a - ga.height // 2
        pad = 0.17 * cell
        col2_x = cx - ga.width // 2 + pad + 2 * (cell + cell * 0.09) + cell / 2
        bot_y = cy_b + gb.height // 2
        d = ImageDraw.Draw(canvas)
        draw_arrow(d, col2_x, board_top, col2_x, bot_y, int(24 * u), ARROW, 215)

        sparks = [(140, 260, 12), (660, 1140, 12)]

    else:  # square
        # 标题居中置顶；双盘左右并排；天蓝箭头水平横扫合并行
        cell = 78 * u
        ga = draw_board(cell, GRID_A_H, MERGE_H)
        gb = draw_board(cell, GRID_B_H, MERGE_H)
        cx_a, cx_b, cy = int(195 * u), int(605 * u), int(470 * u)
        canvas.alpha_composite(ga, (cx_a - ga.width // 2, cy - ga.height // 2))
        canvas.alpha_composite(gb, (cx_b - gb.width // 2, cy - gb.height // 2))

        draw_title_lockup(canvas, int(400 * u), int(80 * u), 78 * u)

        board_top = cy - ga.height // 2
        pad = 0.17 * cell
        merge_y = board_top + pad + 1 * (cell + cell * 0.09) + cell / 2
        d = ImageDraw.Draw(canvas)
        draw_arrow(d, cx_a - ga.width // 2, merge_y,
                   cx_b + gb.width // 2, merge_y, int(22 * u), ARROW, 215)

        sparks = [(90, 130, 10), (710, 700, 10)]

    sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sp)
    for (x, y, r) in sparks:
        sparkle(sd, x * u, y * u, r * u, GOLD, 230)
    canvas = Image.alpha_composite(canvas, sp)
    return canvas


def save(canvas, out_w, out_h, name):
    img = canvas.resize((out_w, out_h), Image.LANCZOS).convert("RGB")
    p = os.path.join(OUT_DIR, name)
    img.save(p, "PNG", optimize=True)
    kb = os.path.getsize(p) / 1024
    print(f"  OK {name:46s} {out_w}x{out_h}  {kb:7.1f} KB")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("生成 Simultwin 封面与视频首帧：")

    land = render(1920, 1080, "landscape", scale=SS)
    save(land, 1920, 1080, "cover-landscape-1920x1080.png")
    save(land, 1920, 1080, "video-firstframe-landscape-1920x1080.png")

    port = render(800, 1200, "portrait", scale=SS * 1.35)
    save(port, 800, 1200, "cover-portrait-800x1200.png")
    save(port, 1080, 1620, "video-firstframe-portrait-1080x1620.png")

    sq = render(800, 800, "square", scale=SS * 1.35)
    save(sq, 800, 800, "cover-square-800x800.png")

    print("完成。")


if __name__ == "__main__":
    main()
