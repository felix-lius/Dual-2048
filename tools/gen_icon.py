# -*- coding: utf-8 -*-
"""
gen_icon.py —— 生成《Simultwin》CrazyGames 上架图标 assets/icon-512.png

规范来源：design/rebrand/visual-identity.md §1.3（内嵌 SVG 线稿）与 §1.4（量产规则）
色值来源：src/theme.js（TILE_COLORS / BOARD_FRAME / BG_GRADIENT_*）

设计：双 2×2 迷你棋盘并排（左：2,4 / 空,8；右：4,2 / 8,空），
      中央「×2」胶囊徽章（#FFC94D），暖奶油→蜜桃渐变底满铺。
      纯扁平：方块无投影 / 无唇边 / 无高光 / 无光晕 / 无星芒（品牌签名）。

用法：python tools/gen_icon.py
输出：assets/icon-512.png（512×512 PNG-24）
      assets/icon-512-rounded.png（自带 22% 圆角版，备用）
      assets/icon-512-alpha.png（透明底版，仅双棋盘+徽章，备用）

本脚本只产出美术资产，不涉及任何游戏逻辑代码。
"""

import os
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- 配置

SIZE = 512          # 最终输出边长
SS = 4              # 超采样倍数（渲染 2048 再降采样，获得平滑抗锯齿）
S = SIZE * SS

# 色板（严格取自 src/theme.js）
BG_TOP = (0xFF, 0xF9, 0xEF)      # 背景渐变·顶：暖奶油白
BG_BOTTOM = (0xFF, 0xE6, 0xD2)   # 背景渐变·底：蜜桃粉
BOARD_FRAME = (0xE7, 0xD0, 0xA8)  # 棋盘托盘：暖沙色
BOARD_EMPTY = (0xF3, 0xE7, 0xD3)  # 空格：沙色
BADGE = (0xFF, 0xC9, 0x4D)        # 「×2」胶囊徽章：冻结黄
BADGE_TEXT = (0x5C, 0x47, 0x00)   # 徽章文字：深字（theme.js 深字规则）

# 方块色板（仅用 2/4/8，视觉标识中的迷你棋盘数值）
TILE = {
    2: ((0xFF, 0xF6, 0xE3), (0x6B, 0x5B, 0x3E)),   # 奶油白 / 深棕
    4: ((0xFF, 0xEB, 0xC8), (0x6B, 0x5B, 0x3E)),   # 麦穗黄 / 深棕
    8: ((0xFF, 0xC9, 0x7B), (0x4A, 0x2A, 0x0E)),   # 蜜橘 / 深棕
}

# 字体候选：Arial Rounded MT Bold（圆润，theme.js TILE_FONT 首选）→ 粗体系列兜底
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\ARLRDBD.TTF",
    r"C:\Windows\Fonts\ariblk.ttf",    # Arial Black：最厚重，小尺寸最抗缩放
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\verdanab.ttf",
]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets")


def load_font(px):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, px)
    raise RuntimeError("未找到可用粗体字体，请在 FONT_CANDIDATES 增补路径")


def make_gradient(w, h, top, bottom):
    """垂直线性渐变背景"""
    grad = Image.new("RGB", (1, h))
    px = grad.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return grad.resize((w, h), Image.BICUBIC)


def center_text(d, cx, cy, text, font, fill):
    """按字形实际包围盒精确居中（避免基线偏移）"""
    bb = font.getbbox(text)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    d.text((cx - w / 2 - bb[0], cy - h / 2 - bb[1]), text, font=font, fill=fill)


def build(transparent_bg=False):
    """构建图标画布（超采样尺寸）。设计稿坐标同 §1.3 SVG（512 画布），再乘 SS。"""
    if transparent_bg:
        canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    else:
        canvas = make_gradient(S, S, BG_TOP, BG_BOTTOM).convert("RGBA")

    d = ImageDraw.Draw(canvas)

    def rr(x, y, w, h, radius, fill):
        """按 512 设计稿坐标绘制圆角矩形（自动乘 SS）"""
        d.rounded_rectangle(
            [x * SS, y * SS, (x + w) * SS, (y + h) * SS],
            radius=radius * SS, fill=fill)

    def draw_cell(x, y, w, body, digit=None, fg=None):
        """单个扁平糖果格：无投影 / 无唇边 / 无高光（§1.4 Effects: None）"""
        rr(x, y, w, w, w * 0.25, body)
        if digit is not None:
            f = load_font(int(34 * SS))  # SVG 数字字号 34（512 设计稿）
            center_text(d, (x + w / 2) * SS, (y + w / 2) * SS, digit, f, fg)

    def draw_board(x, y, w, cells):
        """2×2 迷你棋盘：托盘 + 格子（§1.3）"""
        rr(x, y, w, w, 14, BOARD_FRAME)
        for (cx, cy_, body, digit, fg) in cells:
            draw_cell(x + cx, y + cy_, 77, body, digit, fg)

    # ---- 左迷你棋盘：2,4 / 空,8（§1.3 坐标）----
    left_cells = [
        (5, 5, TILE[2][0], "2", TILE[2][1]),
        (90, 5, TILE[4][0], "4", TILE[4][1]),
        (5, 90, BOARD_EMPTY, None, None),
        (90, 90, TILE[8][0], "8", TILE[8][1]),
    ]
    draw_board(62, 126, 172, left_cells)

    # ---- 右迷你棋盘（配对 / 镜像）：4,2 / 8,空 ----
    right_cells = [
        (5, 5, TILE[4][0], "4", TILE[4][1]),
        (90, 5, TILE[2][0], "2", TILE[2][1]),
        (5, 90, TILE[8][0], "8", TILE[8][1]),
        (90, 90, BOARD_EMPTY, None, None),
    ]
    draw_board(278, 126, 172, right_cells)

    # ---- 中央「×2」胶囊徽章（乘法符号 U+00D7，§1.3）----
    rr(196, 322, 120, 64, 32, BADGE)
    badge_font = load_font(int(40 * SS))
    center_text(d, 256 * SS, (322 + 32) * SS, "\u00d72", badge_font, BADGE_TEXT)

    return canvas


def save(canvas, filename, rounded=False, keep_alpha=False):
    img = canvas.resize((SIZE, SIZE), Image.LANCZOS)

    if rounded:
        # 自带 22% 圆角版本（备用，主文件不裁圆角，避免平台二次裁切出白边）
        mask = Image.new("L", (SIZE * SS, SIZE * SS), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, SIZE * SS - 1, SIZE * SS - 1],
            radius=int(SIZE * SS * 0.22), fill=255)
        mask = mask.resize((SIZE, SIZE), Image.LANCZOS)
        img.putalpha(mask)
    elif not keep_alpha:
        # 主文件：不透明底（PNG-24，无 alpha 漂浮问题）
        bg = Image.new("RGB", (SIZE, SIZE), BG_TOP)
        bg.paste(img, (0, 0), img)
        img = bg

    path = os.path.join(OUT_DIR, filename)
    img.save(path, "PNG", optimize=True)
    kb = os.path.getsize(path) / 1024
    print(f"  ✓ {filename:26s} {img.size[0]}x{img.size[1]}  {img.mode:5s}  {kb:6.1f} KB")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("生成 Simultwin 图标资产：")

    opaque = build(transparent_bg=False)
    save(opaque, "icon-512.png")                      # 主文件（上架用）
    save(opaque, "icon-512-rounded.png", rounded=True)  # 自带圆角备用版

    alpha = build(transparent_bg=True)
    save(alpha, "icon-512-alpha.png", keep_alpha=True)  # 透明底备用版

    print("完成。主文件：assets/icon-512.png")


if __name__ == "__main__":
    main()
