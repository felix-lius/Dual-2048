// interaction.js —— 场景级矩形命中管理器（ITER-V9-REWRITE-001）
// 彻底抛弃 Phaser 自带交互命中体系（交互开关 / 命中区 / 顶层优先）（原点、深度、容器尺寸与
// 命中区不同步极易踩坑，历次补丁式修复无法根治），改为：
//   纯几何矩形 + 场景 input 上「唯一一个」全局 pointerdown 处理器。
// 命中规则：从有序数组 末→首（顶层→底层）遍历，找到第一个 enabled && visible &&
//           pointInRect(pointer.x, pointer.y) 的项 → 调 onClick() → 置 consumed=true（本手势已被按钮消费）。
// 本文件不引用 Phaser 全局（Node 单测可直接 import）。
import { BTN_DISABLED, hexToStr } from './theme.js';

// 点是否在矩形内（含边界，与 Phaser.Geom.Rectangle.Contains 语义一致）
export function pointInRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

export class InteractionManager {
  constructor(scene) {
    this.scene = scene;
    this.items = [];       // 有序数组：尾部 = 顶层（z 序，后注册在顶层）
    this.consumed = false; // 当前指针手势是否已被按钮消费（供 input.js 查询）

    this._onPointerDown = (pointer) => {
      this.consumed = false;
      // 顶层（末）→ 底层（首）：第一个可命中项消费本手势，命中后不再向下穿透
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        if (!it.enabled || !it.visible) continue;
        if (pointInRect(pointer.x, pointer.y, it.rect)) {
          this.consumed = true;
          it.onClick(pointer);
          return;
        }
      }
    };

    if (scene && scene.input && typeof scene.input.on === 'function') {
      scene.input.on('pointerdown', this._onPointerDown);
    }
  }

  // 注册一个矩形命中项。rect = { x, y, w, h }（左上角 + 宽高，场景坐标）。
  // opts: { enabled, visible }（默认均 true）。
  // 返回控件句柄：{ rect, onClick, enabled, visible, setEnabled(b), setVisible(v), setRect(r), destroy() }
  register(rect, onClick, opts = {}) {
    const item = {
      rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      onClick,
      enabled: opts.enabled !== false,
      visible: opts.visible !== false,
      setEnabled(b) { this.enabled = b; return this; },
      setVisible(v) { this.visible = v; return this; },
      setRect(r) { this.rect = { x: r.x, y: r.y, w: r.w, h: r.h }; return this; },
      destroy: () => {
        const i = this.items.indexOf(item);
        if (i >= 0) this.items.splice(i, 1);
      },
    };
    this.items.push(item);
    return item;
  }

  // 供 input.js 判定：本 pointerdown 手势是否已被按钮消费（消费后不再当滑动/点击）
  isConsumed() { return this.consumed; }

  // 供 input.js / 上层在需要时显式复位（正常流程 pointerdown 处理器每次会自动复位）
  resetConsumed() { this.consumed = false; }

  destroy() {
    if (this.scene && this.scene.input && typeof this.scene.input.off === 'function') {
      this.scene.input.off('pointerdown', this._onPointerDown);
    }
    this.items.length = 0;
  }
}

// 取场景级 InteractionManager：场景未显式创建时自动补建
// （Button/SegToggle 首个构造时触发，保证 manager 先于任何指针监听存在）。
export function getInteractionManager(scene) {
  if (!scene.interactions) scene.interactions = new InteractionManager(scene);
  return scene.interactions;
}

// 纯绘制：圆角矩形 + 居中文本。无任何动态效果（无 scale / 变色 / 定时器 / tween）。
// 样式只有两态：normal（cfg.bg + cfg.textColor）与 disabled（灰：
//   cfg.disabledBg / cfg.disabledTextColor，缺省取 BTN_DISABLED 常量）。
// rect 为场景坐标左上角 + 宽高；text 会被 setPosition 到矩形中心（origin 0.5）。
export function drawButton(graphics, text, rect, cfg = {}) {
  graphics.clear();
  const enabled = cfg.enabled !== false;
  const bg = enabled ? cfg.bg : (cfg.disabledBg != null ? cfg.disabledBg : BTN_DISABLED.bg);
  const textColor = enabled
    ? cfg.textColor
    : (cfg.disabledTextColor != null ? cfg.disabledTextColor : hexToStr(BTN_DISABLED.text));
  graphics.fillStyle(bg, 1);
  graphics.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, Math.min(18, rect.h * 0.3));
  text.setColor(textColor);
  text.setPosition(rect.x + rect.w / 2, rect.y + rect.h / 2);
}
