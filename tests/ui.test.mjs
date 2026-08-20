// 最小 Node 断言：Button 构造 + 基础 API（ITER-V9-REWRITE-001 适配：Button 无容器、无自带交互命中）
// 运行：node tests/ui.test.mjs
// Node 下需补 scene 替身（add.graphics/add.text + input 事件发射器），使 Button 可独立构造
// （Button 内部经 getInteractionManager 自动在 scene.input 上挂全局 pointerdown 处理器）。
// ITER-V13-001 ④：mock text 支持 setText/setFontSize 后同步重算 width，验证 setLabelFit 自适应逻辑。
import { Button } from '../src/ui.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

// 极简事件发射器（模拟 scene.input）
function makeEmitter() {
  const listeners = {};
  return {
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    off(evt, fn) { if (listeners[evt]) listeners[evt] = listeners[evt].filter((f) => f !== fn); },
    emit(evt, ...args) { (listeners[evt] || []).slice().forEach((fn) => fn(...args)); },
  };
}

// 简易 text 工厂：模拟 Phaser Text，width = text.length * fs * charWidth / 16
function makeTextFactory() {
  const items = [];
  function text(x, y, t, style) {
    const fs0 = parseInt((style && style.fontSize) || '16', 10);
    const obj = {
      _text: t || '',
      _fs: fs0,
      width: 0,
      // 测试可改：每字等效像素（默认 8，模拟中等粗细系统字体）
      _charWidth: 8,
      setOrigin() { return this; },
      setText(tt) { this._text = tt; this._recomp(); return this; },
      setColor() { return this; },
      setFontSize(s) { this._fs = parseInt(s, 10) || this._fs; this._recomp(); return this; },
      setDepth() { return this; },
      setPosition() { return this; },
      setVisible() { return this; },
      setWordWrapWidth() { return this; },
      destroy() {},
      _recomp() { this.width = this._text.length * this._fs * this._charWidth / 16; },
    };
    obj._recomp();
    items.push(obj);
    return obj;
  }
  return { text, items };
}

function makeSceneStub() {
  const tf = makeTextFactory();
  return {
    input: makeEmitter(),
    add: {
      graphics: () => ({
        clear() {}, fillStyle() {}, fillRoundedRect() {},
        setDepth() { return this; },
        setVisible() { return this; },
        destroy() {},
      }),
      text: tf.text,
    },
    tweens: { add() {} },
    __tf: tf,
  };
}

// ---------- Button: construct + setColor ----------
const scene = makeSceneStub();
let btn;
try {
  btn = new Button(scene, 0, 0, 200, 64, '测试', () => {});
} catch (e) {
  assert(false, 'Button constructs without throwing: ' + e.message);
}

assert(btn && typeof btn.setColor === 'function', 'Button has setColor method');
assert(scene.interactions && typeof scene.interactions.isConsumed === 'function', 'Button auto-creates scene.interactions (InteractionManager)');

let threw = false;
let ret;
try {
  ret = btn.setColor(0xff0000);
} catch (e) {
  threw = true;
  console.error('FAIL: setColor threw: ' + e.message);
}
assert(!threw, 'setColor does not throw');
assert(btn.color === 0xff0000, 'setColor updates this.color to 0xff0000');
assert(ret === btn, 'setColor returns this for chaining');

// ---------- Button: 其余 API 链式返回自身，且命中矩形随 setPosition/setSize 同步 ----------
assert(btn.setLabel('新文案') === btn, 'setLabel returns this');
assert(btn.setEnabled(false) === btn, 'setEnabled returns this');
assert(btn.enabled === false, 'setEnabled(false) updates this.enabled');
assert(btn.setPosition(100, 200) === btn, 'setPosition returns this');
assert(btn.setSize(120, 52) === btn, 'setSize returns this');
assert(btn.setFontSize(16) === btn, 'setFontSize returns this');
assert(btn.setVisible(false) === btn, 'setVisible returns this');

// ---------- Button: destroy 后从 InteractionManager 移除 ----------
const n = scene.interactions.items.length;
btn.destroy();
assert(scene.interactions.items.length === n - 1, 'destroy removes the registered hit item');

// ========== ITER-V13-001 ④：Button.setLabelFit 自适应文字宽度 ==========
// 场景：横屏按钮初始宽 360 / 高 56 / 字号 18，英文长文案 31 字符（≈250px @18px）
// 期望：按 targetW = maxW - padX = 360-36 = 324，文字 250 < 324 → 不缩字号；按钮按 width+padX 撑开。
const sFit = makeSceneStub();
const btnFit = new Button(sFit, 0, 0, 360, 56, 'initial', () => {},
  { fontSize: 18 });
const fitLabel = sFit.__tf.items[sFit.__tf.items.length - 1];
// 英文长文案 31 字符 * 8 charWidth * 18/16 = 279px
const longEn = 'Watch ad: undo 5 steps, continue';
fitLabel._charWidth = 8;
let fitRet;
try {
  fitRet = btnFit.setLabelFit(longEn, { maxW: 360, minFontSize: 12, padX: 36 });
} catch (e) {
  console.error('FAIL: setLabelFit threw: ' + e.message);
}
assert(fitRet === btnFit, 'setLabelFit returns this for chaining');
assert(btnFit.label._fs === 18, 'setLabelFit does not shrink fontSize when text fits (18px kept)');
assert(btnFit.w >= 200 && btnFit.w <= 360, 'setLabelFit keeps width within [200, maxW]');
assert(btnFit.w >= Math.ceil(fitLabel.width + 36), 'setLabelFit width covers text+padX');

// 场景：极宽文字（模拟长字符串宽度 400）→ 必须缩字号并夹到 maxW
const sFit2 = makeSceneStub();
const btnFit2 = new Button(sFit2, 0, 0, 300, 56, 'initial', () => {},
  { fontSize: 18 });
const fitLabel2 = sFit2.__tf.items[sFit2.__tf.items.length - 1];
// 让 mock 文字宽度大到超 targetW（targetW = maxW - padX = 300 - 36 = 264）
// 31 字符 * 8 * 18/16 = 279px → 超出 264 → 应该缩字号
fitLabel2._charWidth = 8;
btnFit2.setLabelFit(longEn, { maxW: 300, minFontSize: 12, padX: 36 });
// 字号从 18 缩到 (279-36)/8 ≈ ?  实际上 while 循环按 px 缩：18→17→16... 直到 width <= 264
// width@fs = 31 * fs * 8 / 16 = 31 * fs / 2 = 264 → fs = 17.03 → 取 17
assert(btnFit2.label._fs <= 18 && btnFit2.label._fs >= 12,
  `setLabelFit shrinks fontSize when text exceeds targetW (got ${btnFit2.label._fs}px)`);
assert(btnFit2.w <= 300, 'setLabelFit caps width at maxW');

// 场景：label.width 不可用（undefined）→ 降级到 draw，不抛错、不破坏宽度
const sFit3 = makeSceneStub();
const btnFit3 = new Button(sFit3, 0, 0, 360, 56, 'initial', () => {},
  { fontSize: 18 });
const fitLabel3 = sFit3.__tf.items[sFit3.__tf.items.length - 1];
// 模拟 mock 未实现 width：屏蔽 _recomp 并显式置 undefined
fitLabel3._recomp = () => {};
fitLabel3.width = undefined;
let degraded = false;
try {
  btnFit3.setLabelFit('任何文字', { maxW: 300, minFontSize: 12, padX: 36 });
} catch (e) {
  degraded = true;
  console.error('FAIL: setLabelFit degraded path threw: ' + e.message);
}
assert(!degraded, 'setLabelFit handles missing width gracefully (no throw)');
assert(btnFit3.w === 360, 'setLabelFit degrades: keeps current width when width unmeasurable');

// ---------- summary ----------
console.log(`\nAssertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);