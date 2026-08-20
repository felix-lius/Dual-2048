// ui.js —— 轻量 UI 构件：圆角按钮 + 分段切换 + 顶部提示 Toast
// ITER-V9-REWRITE-001：Button / SegToggle 推倒重写 ——
//   交互一律走 InteractionManager 场景级矩形命中：无 Phaser 自带交互命中体系（命中区/顶层优先）、
//   无容器命中区，无任何动态效果（无 scale / darken / 定时器 / tween / 全局监听）。
//   视觉与命中都由同一份 rect 驱动（位置/尺寸即命中矩形），从根上消除
//   “原点/深度/容器尺寸与命中区不同步导致点击失灵”。
// 配色/字体统一取自 theme.js（美术圣经 v1.0）。

import { FONT_STACK, BTN_DEFAULT, BTN_DISABLED,
         hexToStr, TOAST, TOAST_SUCCESS, TOAST_WARNING,
         SEG_BG, SEG_ACTIVE_BG, SEG_ACTIVE_TEXT, SEG_INACTIVE_TEXT } from './theme.js';
import { getInteractionManager, drawButton } from './interaction.js';
import { Audio } from './audio.js';

// 统一按钮点击音（audio-bible §2 #12 buttonTap）。no-op-safe：Audio 不可用或抛错均不影响点击。
function playButtonTap() {
  try { if (Audio && typeof Audio.play === 'function') Audio.play('buttonTap'); }
  catch (e) { /* no-op */ }
}

// Button：极简按钮（用户核心诉求：零动效、零定时器、零全局监听、点击立即响应）。
// pointerdown 即触发 onClick，无颜色加深/文字下沉/缩放/自动恢复按下态等任何动态视觉。
// 内部：InteractionManager.register 一个矩形（位置/尺寸即 rect）+ graphics/text 绘制；
// 不创建容器、不用 Phaser 自带交互命中。setEnabled(false)：绘制灰态且命中检测跳过。
// 旧模型 onDisabledClick（禁用点击反馈）保留构造签名兼容；新命中模型下禁用项被跳过、
// 不消费手势、不再调用该回调（点击会落空到场景 tap，不会误触其它按钮）。
export class Button {
  constructor(scene, x, y, w, h, label, onClick, opts = {}) {
    this.scene = scene;
    this.x = x;               // 中心坐标
    this.y = y;
    this.w = w;
    this.h = h;
    this.onClick = onClick;
    this.onDisabledClick = opts.onDisabledClick || null; // 签名兼容，新模型不触发
    this.enabled = true;
    this.color = opts.color != null ? opts.color : BTN_DEFAULT.bg;
    this.disabledColor = BTN_DISABLED.bg;
    this.disabledTextColor = hexToStr(BTN_DISABLED.text);
    this.textColor = opts.textColor || hexToStr(BTN_DEFAULT.text);
    this.fontSize = opts.fontSize || 22;
    const depth = opts.depth != null ? opts.depth : 10;

    this.bg = scene.add.graphics().setDepth(depth);
    this.label = scene.add.text(0, 0, label, {
      fontFamily: FONT_STACK,
      fontSize: this.fontSize + 'px',
      fontStyle: '800',
      color: this.textColor,
      align: 'center',
    }).setOrigin(0.5).setDepth(depth);

    // 命中矩形 = 中心 (x,y) + 尺寸 (w,h) 换算的左上角矩形，与绘制完全同源
    this.handle = getInteractionManager(scene).register(
      { x: x - w / 2, y: y - h / 2, w, h },
      () => { playButtonTap(); if (this.onClick) this.onClick(); }
    );

    this.draw();
  }

  setLabel(text) {
    this.label.setText(text);
    return this;
  }

  // 自适应文字：先按 this.fontSize 渲染，若超 maxW-padX 则逐级缩字号至 minFontSize；
  // 再按文字实际宽度 + padX 同步按钮宽度（不超 maxW，最小 100）。
  // 解决「横屏窄按钮 + 双语长短不一 + 竖屏更窄」导致的文字溢出被裁。
  // maxW 缺省用当前按钮宽度；minFontSize 缺省 = max(10, fontSize-6)；padX 缺省 32。
  // label.width 不可用（如测试 mock）时降级：保持宽度 + 初始字号，仅重绘。
  setLabelFit(text, opts = {}) {
    const maxW = opts.maxW != null ? opts.maxW : this.w;
    const minFontSize = opts.minFontSize != null ? opts.minFontSize : Math.max(10, this.fontSize - 6);
    const padX = opts.padX != null ? opts.padX : 32;
    const targetW = Math.max(40, maxW - padX);
    // 还原初始字号 + 单行展示（关 wordWrap 避免无谓换行）
    this.label.setFontSize(this.fontSize + 'px');
    this.label.setText(text);
    try { this.label.setWordWrapWidth(0); } catch (e) { /* no-op */ }
    const lw = this.label.width;
    const measurable = typeof lw === 'number' && isFinite(lw) && lw > 0;
    if (!measurable) {
      // 无测量数据：保持当前宽度 + 字号，仅触发一次重绘
      this.draw();
      return this;
    }
    // 缩字号直到放得下
    let fs = this.fontSize;
    while (fs > minFontSize && this.label.width > targetW) {
      fs -= 1;
      this.label.setFontSize(fs + 'px');
    }
    // 按钮宽度：文字宽度 + 横向内边距，夹在 [100, maxW]
    const needW = Math.min(maxW, Math.max(100, Math.ceil(this.label.width + padX)));
    if (Math.abs(needW - this.w) > 0.5) {
      this.setSize(needW, this.h);
    } else {
      this.draw();
    }
    return this;
  }

  setEnabled(b) {
    this.enabled = b;
    this.handle.setEnabled(b); // 禁用：命中检测跳过 + 绘制灰态
    this.draw();
    return this;
  }

  setColor(color) {
    this.color = color;
    this.draw();
    return this;
  }

  setPosition(x, y) {
    this.x = x; this.y = y;
    this.handle.setRect({ x: x - this.w / 2, y: y - this.h / 2, w: this.w, h: this.h });
    this.draw();
    return this;
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.handle.setRect({ x: this.x - w / 2, y: this.y - h / 2, w, h });
    this.draw();
    return this;
  }

  // 响应式字号（竖屏窄按钮缩字防溢出）；不影响命中区（命中区由 setSize/rect 决定）
  setFontSize(fs) {
    this.label.setFontSize(fs + 'px');
    return this;
  }

  setVisible(v) {
    this.handle.setVisible(v); // 不可见：命中跳过
    this.bg.setVisible(v);
    this.label.setVisible(v);
    return this;
  }

  destroy() {
    this.handle.destroy(); // 从 InteractionManager 移除，不再命中
    this.bg.destroy();
    this.label.destroy();
  }

  draw() {
    drawButton(this.bg, this.label, { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }, {
      bg: this.color,
      textColor: this.textColor,
      enabled: this.enabled,
      disabledBg: this.disabledColor,
      disabledTextColor: this.disabledTextColor,
    });
  }
}

// SegToggle：分段切换（两个半圆胶囊拼接 + 文本），用于语言/难度等二选一。
// ITER-V9-REWRITE-001：改为「左右两半各自独立矩形」——
//   option[0] 左半 rect、option[1] 右半 rect，各自 register：
//   点击左半 → onChange(options[0].key)；点击右半 → onChange(options[1].key)；
//   点当前项 = 无操作（已是当前）。不再是「整条切换」，彻底消除“只有左半能点”。
// 绘制：当前项深底白字胶囊、另一项浅底灰字（复用 SEG_* 色），无动态效果。
// options: [{ key, label }, ...]（当前按两半实现，取前两项）；currentKey 为当前选中；onChange(key)。
export class SegToggle {
  constructor(scene, x, y, w, h, options, currentKey, onChange, opts = {}) {
    this.scene = scene;
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.options = (options || []).slice();
    this.currentKey = currentKey;
    this.onChange = onChange;
    this.activeBg = opts.activeBg != null ? opts.activeBg : SEG_ACTIVE_BG;
    this.activeTextColor = opts.activeTextColor != null ? opts.activeTextColor : hexToStr(SEG_ACTIVE_TEXT);
    this.inactiveTextColor = opts.inactiveTextColor != null ? opts.inactiveTextColor : hexToStr(SEG_INACTIVE_TEXT);
    this.bgColor = opts.bgColor != null ? opts.bgColor : SEG_BG;
    this.fontSize = opts.fontSize || 14;
    this.gap = opts.gap != null ? opts.gap : 2; // 两半之间的视觉分隔缝（命中矩形无死区，两半平铺）
    const depth = opts.depth != null ? opts.depth : 10;

    this.bg = scene.add.graphics().setDepth(depth);
    this.labels = [0, 1].map(() => scene.add.text(0, 0, '', {
      fontFamily: FONT_STACK,
      fontStyle: '800',
      fontSize: this.fontSize + 'px',
      align: 'center',
    }).setOrigin(0.5).setDepth(depth));

    const mgr = getInteractionManager(scene);
    const halfW = w / 2;
    // 左半：x 覆盖 [x - halfW, x)；右半：x 覆盖 [x, x + halfW)（平铺无死区）
    this.leftHandle = mgr.register(
      { x: x - halfW, y: y - h / 2, w: halfW, h },
      () => this._clickHalf(0)
    );
    this.rightHandle = mgr.register(
      { x: x, y: y - h / 2, w: halfW, h },
      () => this._clickHalf(1)
    );

    this.draw();
  }

  // 点击某一半：若该半即当前项 → 无操作（已是当前）；否则切换并回调
  _clickHalf(i) {
    const o = this.options[i];
    if (!o || o.key === this.currentKey) return;
    this.setCurrent(o.key);
    if (this.onChange) this.onChange(o.key);
  }

  setCurrent(key) {
    this.currentKey = key;
    this.draw();
    return this;
  }

  // 更新选项与文案（语言切换后难度标签要重取）；保留仍在的 currentKey，否则回退第一项
  setOptions(options) {
    this.options = (options || []).slice();
    if (!this.options.some((o) => o.key === this.currentKey)) {
      this.currentKey = this.options[0] ? this.options[0].key : this.currentKey;
    }
    this.draw();
    return this;
  }

  setPosition(x, y) {
    this.x = x; this.y = y;
    const halfW = this.w / 2;
    this.leftHandle.setRect({ x: x - halfW, y: y - this.h / 2, w: halfW, h: this.h });
    this.rightHandle.setRect({ x: x, y: y - this.h / 2, w: halfW, h: this.h });
    this.draw();
    return this;
  }

  // 响应式缩放（竖屏缩小+改字号）：尺寸/命中矩形/文案三者同步，
  // 视觉与命中一致 —— 否则会出现“看得到但点不到/点到别处”的失灵。
  resize(w, h, fontSize) {
    this.w = w; this.h = h;
    if (fontSize != null) {
      this.fontSize = fontSize;
      this.labels.forEach((l) => l.setFontSize(fontSize + 'px'));
    }
    const halfW = w / 2;
    this.leftHandle.setRect({ x: this.x - halfW, y: this.y - h / 2, w: halfW, h });
    this.rightHandle.setRect({ x: this.x, y: this.y - h / 2, w: halfW, h });
    this.draw();
    return this;
  }

  setVisible(v) {
    this.leftHandle.setVisible(v);
    this.rightHandle.setVisible(v);
    this.bg.setVisible(v);
    this.labels.forEach((l) => l.setVisible(v));
    return this;
  }

  destroy() {
    this.leftHandle.destroy();
    this.rightHandle.destroy();
    this.bg.destroy();
    this.labels.forEach((l) => l.destroy());
  }

  draw() {
    const g = this.bg;
    g.clear();
    const r = this.h / 2; // 胶囊圆角 = 高一半
    const gap = this.gap;
    const halfW = this.w / 2;
    const top = this.y - this.h / 2;
    const leftActive = this.options[0] && this.options[0].key === this.currentKey;
    const rightActive = this.options[1] && this.options[1].key === this.currentKey;
    // 左半：当前项深底 / 未选浅底（左侧圆角、右侧平直）
    g.fillStyle(leftActive ? this.activeBg : this.bgColor, 1);
    g.fillRoundedRect(this.x - halfW, top, halfW - gap / 2, this.h, { tl: r, tr: 0, bl: r, br: 0 });
    // 右半：当前项深底 / 未选浅底（右侧圆角）
    g.fillStyle(rightActive ? this.activeBg : this.bgColor, 1);
    g.fillRoundedRect(this.x + gap / 2, top, halfW - gap / 2, this.h, { tl: 0, tr: r, bl: 0, br: r });
    // 文本：两半各自居中，当前白字、未选灰字
    if (this.options[0]) {
      this.labels[0].setPosition(this.x - halfW / 2, this.y);
      this.labels[0].setText(this.options[0].label);
      this.labels[0].setColor(leftActive ? this.activeTextColor : this.inactiveTextColor);
    }
    if (this.options[1]) {
      this.labels[1].setPosition(this.x + halfW / 2, this.y);
      this.labels[1].setText(this.options[1].label);
      this.labels[1].setColor(rightActive ? this.activeTextColor : this.inactiveTextColor);
    }
  }
}

// 顶部/中部短暂提示。variant: undefined=默认奶油黄 | 'success'=薄荷绿 | 'warning'=珊瑚橙
// Toast 非按钮、无交互；仅保留淡出 tween（非交互路径动态效果，不在本次“按键动效清零”范围内）。
export function showToast(scene, msg, y = null, variant) {
  const yy = y != null ? y : Math.max(60, scene.scale.height * 0.1);
  const palette = variant === 'success' ? TOAST_SUCCESS
    : variant === 'warning' ? TOAST_WARNING
    : TOAST;
  // 快速连点时避免同屏堆积多个 Text：复用上一个仍在展示的 toast
  // （杀掉其 tween 再销毁，减少同一帧频繁建/销 Text 的抖动与纹理生命周期风险）。
  const prev = scene.__toastText;
  if (prev && prev.scene) {
    scene.tweens.killTweensOf(prev);
    prev.destroy();
  }
  const t = scene.add.text(scene.scale.width / 2, yy, msg, {
    fontFamily: FONT_STACK,
    fontSize: '22px',
    fontStyle: '800',
    color: palette.text,
    backgroundColor: palette.bg,
    padding: { x: 14, y: 8 },
    align: 'center',
  }).setOrigin(0.5).setDepth(1000);
  scene.__toastText = t;

  scene.tweens.add({
    targets: t,
    alpha: 0,
    y: yy - 26,
    duration: 1300,
    delay: 700,
    ease: 'Quad.easeIn',
    onComplete: () => {
      // 场景关闭/重开可能已把 t 销毁（t.scene 变 undefined）；已销毁则不再操作
      if (t && t.scene) t.destroy();
      if (scene.__toastText === t) scene.__toastText = null;
    },
  });
  return t;
}
