// theme.js —— 美术圣经 v1.0 视觉常量集中（语义命名，替代散落魔法数）
// 依据：design/art/art-bible.md §2 色板 / §3.1 圆角 / §4.2 字体栈 / §5 UI 组件 / §7 动画 / 附录 A 速查表
// 约定：
//  - 图形色（Graphics.fillStyle / fillGradientStyle）用 0xRRGGBB 数值；
//  - 文字色用 hexToStr(color) 转 '#RRGGBB' 字符串；
//  - 透明度单独用 *_ALPHA 常量，避免与颜色混在一起；
//  - 本文件不引用 Phaser（纯常量 + 纯函数），Node 单测可直接 import。

// ---------------- 工具 ----------------

// 0xRRGGBB 数值 -> '#RRGGBB' 字符串（Phaser Text.color / backgroundColor 用）
export function hexToStr(color) {
  return '#' + (color >>> 0).toString(16).padStart(6, '0');
}

// 颜色加深：按 ratio（0~1）把 0xRRGGBB 变暗，返回新 0xRRGGBB。
// 按钮按下反馈用（美术圣经 §5.0/§7：加深 12%~15%，无缩放）。
export function darken(color, ratio) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = 1 - ratio;
  return (Math.round(r * f) << 16) | (Math.round(g * f) << 8) | Math.round(b * f);
}

// ---------------- 字体（§4.2 完整中英双语栈，离线可用） ----------------
// 顺序含义：英文圆润字体优先 -> 中文圆润字体 -> 系统兜底。
// 英文文本命中 Nunito/Quicksand；中文文本跳过不支持的拉丁字体，命中 PingFang/YaHei/SimHei。
// v2：移除 "Comic Sans MS"（Windows 自带、数字观感差，用户反馈上一版更好看）。
export const FONT_STACK =
  '"Nunito","Quicksand","Varela Round","PingFang SC","Microsoft YaHei","SimHei","Segoe UI",system-ui,sans-serif';

// 方块数字专用字体栈（v2 新增，与通用 UI 英文/中文分离）：
// 方块数字只放拉丁数字字体，不混入 CJK；优先「圆润数字」观感：
// Arial Rounded MT Bold（Windows 自带圆体，数字干净）-> Segoe UI -> Verdana -> 系统兜底。
// 用途：view.js 中 Tile 数字 Text；其余 UI 英文/中文继续用 FONT_STACK。
export const TILE_FONT =
  '"Arial Rounded MT Bold","Segoe UI","Verdana",system-ui,sans-serif';

// ---------------- 方块色板（§2.1：2 → 2048，含空格） ----------------
// bg = 方块背景色；text = 方块数字文字色（深/白规则见 tileColorFor）。
export const TILE_COLORS = {
  0:    { bg: 0xF3E7D3, text: 0x6B5B3E }, // 空格：沙色凹陷格
  2:    { bg: 0xFFF6E3, text: 0x6B5B3E }, // 奶油白（最浅）
  4:    { bg: 0xFFEBC8, text: 0x6B5B3E }, // 麦穗黄
  8:    { bg: 0xFFC97B, text: 0x4A2A0E }, // 蜜橘
  16:   { bg: 0xFFA95E, text: 0x4A2A0E }, // 橘橙
  32:   { bg: 0xF75C40, text: 0xFFFFFF }, // 亮橘红（深底 -> 白字）
  64:   { bg: 0xE84A30, text: 0xFFFFFF }, // 深橘红（深底 -> 白字）
  128:  { bg: 0xFFE28A, text: 0x5C4700 }, // 亮黄 · 黄金段位
  256:  { bg: 0xFFD75E, text: 0x5C4700 }, // 金黄
  512:  { bg: 0xFFC93C, text: 0x5C4700 }, // 琥珀金
  1024: { bg: 0xFFBC26, text: 0x5C4700 }, // 深金黄
  2048: { bg: 0xFFB014, text: 0x5C4700 }, // 王者金（辉光角标在 view 层另处理）
};
export const TILE_FALLBACK = { bg: 0x3C3A32, text: 0xFFFFFF }; // 超 2048 兜底

// 方块数字文字色分组（用户决策②）：32/64 白字，其余数值深字
export const TILE_TEXT_DARK = 0x5C4700;  // 深字（金色系/奶油系/橘系）
export const TILE_TEXT_LIGHT = 0xFFFFFF; // 白字（32/64 深底）

// 按数值取方块配色：深底（32/64）强制白字，其余用表内深字。
export function tileColorFor(v) {
  const c = TILE_COLORS[v] || TILE_FALLBACK;
  const deep = (v === 32 || v === 64);
  return { bg: c.bg, text: deep ? TILE_TEXT_LIGHT : c.text };
}

// ---------------- 背景与文字（§2.2 / §2.4 方案 A） ----------------
export const BG_GRADIENT_TOP = 0xFFF9EF;    // 背景渐变·顶部：暖奶油白
export const BG_GRADIENT_BOTTOM = 0xFFE6D2; // 背景渐变·底部：蜜桃粉（用户选定方案 A）
export const BOARD_FRAME = 0xE7D0A8;        // 棋盘外框：暖沙色（比背景深一档）
export const BOARD_EMPTY = 0xF3E7D3;        // 棋盘空格：沙色（同 TILE_COLORS[0].bg）
export const TEXT_PRIMARY = 0x1F3A4D;       // 主文字：墨蓝灰（按钮/标题）
export const TEXT_SECONDARY = 0x6B5B3E;     // 次文字：暖棕（分数/说明）
export const TEXT_LIGHT = 0x9C8F7C;         // 浅文字：次要提示/置灰辅助
export const TEXT_WHITE = 0xFFFFFF;         // 白色：深底按钮与方块数字

// ---------------- 按钮（§2.3） ----------------
export const BTN_UNDO = { bg: 0x7EC8E3, text: 0x1F3A4D };       // 撤销：天蓝 = 回退、过去
export const BTN_FREEZE = { bg: 0xFFC94D, text: 0x5C4700 };     // 冻结：奶油黄 = 暂停、按住
export const BTN_RESTART = { bg: 0xF26D5B, text: 0xFFFFFF };    // 重开：珊瑚橙 = 重新开始
export const BTN_FULLSCREEN = { bg: 0x8F7BFF, text: 0xFFFFFF }; // 全屏：蓝紫 = 设备功能
export const BTN_HOME = { bg: 0x2BC7A0, text: 0x1F3A4D };       // 首页：薄荷绿 = 回到主菜单
export const BTN_START = { bg: 0x5FC25A, text: 0xFFFFFF };      // 开始游戏/再来一局：草绿 = 行动、确认
export const BTN_LANG = { bg: 0xD8C9B5, text: 0x1F3A4D };       // 语言切换：灰米 = 次要功能
export const BTN_DISABLED = { bg: 0xC9C9C9, text: 0x7A7A7A };   // 禁用态：灰，不可点
export const BTN_DEFAULT = BTN_UNDO;                             // Button 默认配色（旧 0x8ecae6 的语义替身）

// 菜单模式按钮（§5.1）：硬核=珊瑚橙（选中），休闲=天蓝（选中）；未选中置灰
export const MODE_HARDCORE = { bg: 0xF26D5B, text: 0xFFFFFF };   // 硬核：珊瑚橙/白字
export const MODE_CASUAL = { bg: 0x7EC8E3, text: 0x1F3A4D };     // 休闲：天蓝/深字

// 按钮按下反馈（§5.0 / §7）：填充色加深比例 12%~15%（取中值 13%），无缩放。
export const PRESS_DARKEN_RATIO = 0.13;

// ---------------- 控制条按钮（ITER-V8-001：宽度响应式，竖屏窄屏自动缩窄避免重叠） ----------------
export const CONTROL_BTN_WIDTH = 120;      // 按钮基准宽（横屏/大屏）
export const CONTROL_BTN_MIN_WIDTH = 72;   // 最小宽（窄屏竖屏兜底，保持可点）
export const CONTROL_BTN_HEIGHT = 52;      // 按钮高（横竖屏一致）

// ---------------- 遮罩（§2.3） ----------------
export const FREEZE_OVERLAY = 0x1D3557;   // 冻结遮罩：深海军蓝（+白字步数）
export const FREEZE_OVERLAY_ALPHA = 0.55; // 透明度 55%
export const RETIRED_OVERLAY = 0x2A9D8F;  // 退役 DONE 标记：青绿（+白字 DONE 达标）
export const RETIRED_OVERLAY_ALPHA = 0.6; // 透明度 60%
export const OVERLAY_BG = 0x1D3557;       // 结算遮罩：深海军蓝（胜利时叠加金色标题）
export const OVERLAY_ALPHA = 0.78;        // 透明度 78%

// ---------------- Toast（§2.3 / §5.7） ----------------
// Phaser Text.backgroundColor 需要 CSS 字符串，这里直接给字符串。
export const TOAST = { bg: '#FFF3C4', text: '#5C4700' };         // 奶油黄胶囊
export const TOAST_SUCCESS = { bg: '#2BC7A0', text: '#FFFFFF' }; // 薄荷绿（如「新纪录！」）
export const TOAST_WARNING = { bg: '#F26D5B', text: '#FFFFFF' }; // 珊瑚橙（如「撤销已用完」）

// ---------------- 棋盘侧标签（用户决策③：横屏左/右、竖屏上/下） ----------------
export const SIDE_LABEL_BG = 0x1F3A4D;      // 胶囊底：墨蓝灰（半透明）
export const SIDE_LABEL_BG_ALPHA = 0.6;     // 半透明
export const SIDE_LABEL_TEXT = 0xFFFFFF;    // 胶囊文字：白
export const SIDE_LABEL_FONT_SIZE = 13;     // 字号（px）
export const SIDE_LABEL_HEIGHT = 22;        // 胶囊高（px），圆角 = 高一半
export const SIDE_LABEL_PAD_X = 10;         // 胶囊左右内边距（px）

// ---------------- 最高分徽章（ITER-V6-REDO-001 ④：HUD 顶部正中、居中醒目） ----------------
// ITER-V7-001 ②：字号 30 -> 18（< 标题/更精致），胶囊高 42 -> 32，底透明度 0.6 -> 0.72（深底白字更清晰）。
export const BEST_BADGE_BG = 0x1F3A4D;          // 徽章底：墨蓝灰（半透明胶囊）
export const BEST_BADGE_BG_ALPHA = 0.72;        // 半透明（略加深，保证深底白字清晰可读）
export const BEST_BADGE_TEXT = 0xFFFFFF;        // 徽章文字：白
export const BEST_BADGE_FONT_SIZE = 16;         // 字号（px，收尾：18 -> 16，保证徽章 < 标题22px）
export const BEST_BADGE_HEIGHT = 32;            // 胶囊高（px），圆角 = 高一半（42 -> 32）
export const BEST_BADGE_PAD_X = 18;             // 胶囊左右内边距（px）
export const BEST_BADGE_SUCCESS_BG = 0x2BC7A0;  // 破纪录高亮：薄荷绿（同 TOAST_SUCCESS）

// ---------------- 分段切换 SegToggle（ITER-V7-001 ③：右上角 语言/难度 二选一切换） ----------------
export const SEG_BG = 0xE8E0D0;           // 整条底：浅米灰（未选中项底色）
export const SEG_ACTIVE_BG = 0x1F3A4D;    // 当前选项：墨蓝灰（theme 主色，明亮高亮）
export const SEG_ACTIVE_TEXT = 0xFFFFFF;  // 当前选项文字：白
export const SEG_INACTIVE_TEXT = 0x9C8F7C;// 未选中项文字：浅灰（同 TEXT_LIGHT，暗淡）

// ---------------- 背景渐变铺底（§2.4 方案 A：暖奶油 -> 蜜桃） ----------------
// 用一张与视口同大的渐变 Graphics 铺满全屏（横竖屏都覆盖）。
// 返回 { graphics, redraw }：redraw() 在场景 resize 路径里调用即可（不自行挂监听，避免泄漏）。
export function createBackgroundGradient(scene, depth = -10) {
  const g = scene.add.graphics().setDepth(depth);
  const redraw = () => {
    const W = scene.scale.width;
    const H = scene.scale.height;
    g.clear();
    if (typeof g.fillGradientStyle === 'function') {
      // Phaser Graphics.fillGradientStyle(topLeft, topRight, bottomLeft, bottomRight, alpha)
      g.fillGradientStyle(BG_GRADIENT_TOP, BG_GRADIENT_TOP, BG_GRADIENT_BOTTOM, BG_GRADIENT_BOTTOM, 1);
    } else {
      // 兜底：无渐变 API 时退化为顶部单色
      g.fillStyle(BG_GRADIENT_TOP, 1);
    }
    g.fillRect(0, 0, W, H);
  };
  redraw();
  return { graphics: g, redraw };
}
