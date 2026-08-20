// ITER-V9-REWRITE-001：InteractionManager / Button / SegToggle 场景级矩形命中自检（无 Phaser 依赖）
// 运行：node tests/interaction.test.mjs
// 覆盖：矩形命中（contains 边界）、z 序（顶层优先）、disabled 跳过、visible 跳过、
//       SegToggle 左右半各自命中（点当前项无操作）、consumed 标志（按钮消费后 input 不再当滑动）、
//       setLabel/setEnabled 后 rect/绘制状态正确、320/360/390/430 四种宽度下的按钮与切换命中。
import { pointInRect, getInteractionManager, drawButton, InteractionManager } from '../src/interaction.js';
import { Button, SegToggle } from '../src/ui.js';
import { BTN_DISABLED, hexToStr } from '../src/theme.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

// ---------- 替身 ----------
function makeEmitter() {
  const listeners = {};
  return {
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); },
    off(evt, fn) { if (listeners[evt]) listeners[evt] = listeners[evt].filter((f) => f !== fn); },
    emit(evt, ...args) { (listeners[evt] || []).slice().forEach((fn) => fn(...args)); },
  };
}

function makeSceneStub() {
  const scene = { input: makeEmitter() };
  scene.add = {
    graphics: () => ({
      _fillColor: null, _visible: true,
      clear() {},
      fillStyle(c) { this._fillColor = c; },
      fillRoundedRect() {},
      setDepth() { return this; },
      setVisible(v) { this._visible = v; return this; },
    }),
    text: (x, y, label, style) => ({
      _x: x, _y: y, _text: label || '', _color: (style && style.color) || null,
      _fontSize: (style && style.fontSize) || null, _visible: true,
      setOrigin() { return this; },
      setPosition(x, y) { this._x = x; this._y = y; return this; },
      setText(s) { this._text = s; return this; },
      setColor(c) { this._color = c; return this; },
      setFontSize(fs) { this._fontSize = fs; return this; },
      setDepth() { return this; },
      setVisible(v) { this._visible = v; return this; },
      get width() { return String(this._text == null ? '' : this._text).length * 8; },
      get height() { return 16; },
    }),
  };
  return scene;
}

function tap(scene, x, y) { scene.input.emit('pointerdown', { x, y }); }

// ---------- 1) pointInRect：contains 边界 ----------
{
  const r = { x: 100, y: 50, w: 40, h: 30 };
  assert(pointInRect(100, 50, r) === true, 'top-left corner on boundary hit');
  assert(pointInRect(140, 80, r) === true, 'bottom-right corner on boundary hit');
  assert(pointInRect(100, 80, r) === true, 'left-bottom boundary hit');
  assert(pointInRect(140, 50, r) === true, 'right-top boundary hit');
  assert(pointInRect(99, 50, r) === false, 'just outside left misses');
  assert(pointInRect(141, 80, r) === false, 'just outside right misses');
  assert(pointInRect(120, 49, r) === false, 'just above misses');
  assert(pointInRect(120, 81, r) === false, 'just below misses');
}

// ---------- 2) 基础命中 + consumed 标志 ----------
{
  const scene = makeSceneStub();
  const mgr = getInteractionManager(scene);
  let a = 0, b = 0;
  mgr.register({ x: 10, y: 10, w: 50, h: 30 }, () => a++);
  mgr.register({ x: 100, y: 100, w: 50, h: 30 }, () => b++);
  tap(scene, 30, 25);
  assert(a === 1 && b === 0, 'pointerdown hits the matching rect only');
  assert(mgr.isConsumed() === true, 'button hit sets consumed=true');
  tap(scene, 200, 200);
  assert(a === 1 && b === 0, 'empty area hits nothing');
  assert(mgr.isConsumed() === false, 'empty pointerdown auto-resets consumed=false');
  mgr.resetConsumed();
  assert(mgr.isConsumed() === false, 'resetConsumed() exposes and clears the flag');
}

// ---------- 3) z 序：后注册在顶层，重叠点由顶层消费 ----------
{
  const scene = makeSceneStub();
  const mgr = getInteractionManager(scene);
  let top = 0, bottom = 0;
  mgr.register({ x: 0, y: 0, w: 100, h: 100 }, () => bottom++);
  mgr.register({ x: 0, y: 0, w: 100, h: 100 }, () => top++);
  tap(scene, 50, 50);
  assert(top === 1 && bottom === 0, 'topmost (last registered) consumes overlapping hit');
  // destroy 顶层后，底层恢复命中
  const items = mgr.items.slice();
  items[1].destroy();
  tap(scene, 50, 50);
  assert(bottom === 1 && top === 1, 'destroy removes top item, bottom hit resumes');
}

// ---------- 4) disabled 跳过 ----------
{
  const scene = makeSceneStub();
  const mgr = getInteractionManager(scene);
  let overClicks = 0, underClicks = 0;
  const under = mgr.register({ x: 0, y: 0, w: 100, h: 100 }, () => underClicks++);
  const over = mgr.register({ x: 0, y: 0, w: 100, h: 100 }, () => overClicks++);
  over.setEnabled(false);
  assert(over.enabled === false, 'setEnabled(false) flips handle.enabled');
  tap(scene, 50, 50);
  assert(overClicks === 0 && underClicks === 1, 'disabled item skipped, falls through to lower item');
  assert(mgr.isConsumed() === true, 'fall-through lower item still consumes');
  under.setEnabled(false);
  tap(scene, 50, 50);
  assert(mgr.isConsumed() === false, 'all disabled => gesture not consumed');
}

// ---------- 5) visible 跳过 ----------
{
  const scene = makeSceneStub();
  const mgr = getInteractionManager(scene);
  let clicks = 0;
  const h = mgr.register({ x: 0, y: 0, w: 50, h: 50 }, () => clicks++);
  h.setVisible(false);
  tap(scene, 25, 25);
  assert(clicks === 0 && mgr.isConsumed() === false, 'invisible item skipped, not consumed');
  h.setVisible(true);
  tap(scene, 25, 25);
  assert(clicks === 1, 'setVisible(true) restores hit');
}

// ---------- 6) Button：rect / setLabel / setEnabled 绘制与命中 ----------
{
  const scene = makeSceneStub();
  const mgr = getInteractionManager(scene);
  let clicks = 0;
  const btn = new Button(scene, 200, 100, 100, 40, 'GO', () => clicks++, { fontSize: 18 });
  assert(btn.handle.rect.x === 150 && btn.handle.rect.y === 80 &&
         btn.handle.rect.w === 100 && btn.handle.rect.h === 40, 'Button registers center->top-left rect');
  tap(scene, 200, 100);
  assert(clicks === 1 && mgr.isConsumed() === true, 'Button click fires onClick and consumes gesture');
  btn.setLabel('NEW');
  assert(btn.label._text === 'NEW', 'setLabel updates label text');
  // 禁用：灰态 + 命中跳过
  btn.setEnabled(false);
  assert(btn.enabled === false && btn.handle.enabled === false, 'setEnabled(false) syncs handle.enabled');
  assert(btn.bg._fillColor === BTN_DISABLED.bg, 'disabled bg drawn gray (BTN_DISABLED.bg)');
  const before = clicks;
  tap(scene, 200, 100);
  assert(clicks === before && mgr.isConsumed() === false, 'disabled Button not clickable and does not consume');
  // 恢复：常态色 + 命中
  btn.setEnabled(true);
  assert(btn.bg._fillColor === btn.color, 'enabled bg drawn normal color');
  tap(scene, 200, 100);
  assert(clicks === before + 1 && mgr.isConsumed() === true, 're-enabled Button clickable again');
  // setPosition / setSize 同步命中矩形
  btn.setPosition(300, 200);
  assert(btn.handle.rect.x === 250 && btn.handle.rect.y === 180, 'setPosition updates hit rect');
  btn.setSize(80, 30);
  assert(btn.handle.rect.w === 80 && btn.handle.rect.h === 30, 'setSize updates hit rect');
  // setVisible(false) 隐藏后不可命中
  btn.setVisible(false);
  tap(scene, 300, 200);
  assert(clicks === before + 1 && mgr.isConsumed() === false, 'invisible Button not clickable');
}

// ---------- 7) SegToggle：左右半各自命中，点当前项无操作 ----------
{
  const scene = makeSceneStub();
  const mgr = getInteractionManager(scene);
  const fired = [];
  const tg = new SegToggle(scene, 200, 100, 100, 28,
    [{ key: 'zh', label: '中' }, { key: 'en', label: 'EN' }],
    'zh', (k) => fired.push(k), { fontSize: 14 });
  assert(tg.leftHandle.rect.x === 150 && tg.leftHandle.rect.w === 50, 'SegToggle left half rect = left 50%');
  assert(tg.rightHandle.rect.x === 200 && tg.rightHandle.rect.w === 50, 'SegToggle right half rect = right 50%');
  // 当前 = 左(zh)：点左半无操作，但手势仍被消费（不落空到棋盘）
  tap(scene, 175, 100);
  assert(fired.length === 0 && tg.currentKey === 'zh', 'click current (left) => no-op');
  assert(mgr.isConsumed() === true, 'click on current half still consumes gesture (no fall-through)');
  // 点右半 -> en
  tap(scene, 225, 100);
  assert(fired.length === 1 && fired[0] === 'en', 'click right half => onChange(en)');
  assert(tg.currentKey === 'en', 'SegToggle currentKey switched to en');
  // 当前 = 右(en)：点右半无操作
  tap(scene, 225, 100);
  assert(fired.length === 1, 'click current (right) => no-op');
  // 点左半切回 zh
  tap(scene, 175, 100);
  assert(fired.length === 2 && fired[1] === 'zh', 'click left half => onChange(zh)');
  // setOptions 后两半仍各自命中（选项文案变化不影响命中几何）
  tg.setOptions([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
  tap(scene, 225, 100);
  assert(fired.length === 3 && fired[2] === 'b', 'after setOptions, right half still fires its key');
  assert(tg.labels[1]._text === 'B', 'setOptions redraws right label text');
  // setPosition / resize 同步两半命中矩形
  tg.setPosition(400, 200);
  assert(tg.leftHandle.rect.x === 350 && tg.rightHandle.rect.x === 400, 'setPosition updates both halves');
  tg.resize(60, 22, 12);
  assert(tg.leftHandle.rect.w === 30 && tg.rightHandle.rect.w === 30, 'resize updates both halves width');
  tap(scene, 415, 200); // 右半中心 (400 + 15)
  assert(fired[fired.length - 1] === 'b', 'after resize right half still hittable');
}

// ---------- 8) consumed 契约：按钮消费后 input 不再当滑动（下一手势自动复位） ----------
{
  const scene = makeSceneStub();
  const mgr = getInteractionManager(scene);
  let clicks = 0;
  mgr.register({ x: 0, y: 0, w: 60, h: 60 }, () => clicks++);
  tap(scene, 30, 30);
  assert(clicks === 1 && mgr.isConsumed() === true, 'button gesture consumed => input.js will skip swipe/tap');
  tap(scene, 300, 300);
  assert(mgr.isConsumed() === false, 'next gesture auto-resets consumed (no cross-gesture pollution)');
}

// ---------- 9) 覆盖 320/360/390/430 宽：控制条按钮 + SegToggle 全命中 ----------
function buildPortrait(W, H = 640) {
  const scene = makeSceneStub();
  const interactions = getInteractionManager(scene);
  const n = 3;
  const slot = W / (n + 1);
  const bw = Math.min(120, Math.max(72, slot * 0.85)); // 与 layoutControls 同公式
  const y = H - 40;
  const fired = [];
  const undo = new Button(scene, slot * 1, y, bw, 52, 'undo', () => fired.push('undo'));
  const freeze = new Button(scene, slot * 2, y, bw, 52, 'freeze', () => fired.push('freeze'));
  const restart = new Button(scene, slot * 3, y, bw, 52, 'restart', () => fired.push('restart'));
  const modeW = 72, tgH = 22;
  const modeX = W - 10 - modeW / 2; // 与 layoutHUD 竖屏公式同
  const modeY = 8;
  const modeFired = [];
  const modeToggle = new SegToggle(scene, modeX, modeY, modeW, tgH,
    [{ key: 'hardcore', label: 'H' }, { key: 'casual', label: 'C' }],
    'hardcore', (k) => modeFired.push(k), { fontSize: 12 });
  return { scene, interactions, fired, modeFired, undo, freeze, restart, modeToggle, slot, bw, y, modeX, modeY, modeW, tgH };
}

for (const W of [320, 360, 390, 430]) {
  const p = buildPortrait(W);
  tap(p.scene, p.slot * 1, p.y);
  tap(p.scene, p.slot * 2, p.y);
  tap(p.scene, p.slot * 3, p.y);
  assert(p.fired.join(',') === 'undo,freeze,restart', `[W=${W}] 3 control buttons each hit at center`);
  assert(p.interactions.isConsumed() === true, `[W=${W}] last control click consumed`);

  // 相邻按钮间隙（bw < slot 时恒存在）不命中
  const gapMid = p.slot * 1.5;
  const countBefore = p.fired.length;
  tap(p.scene, gapMid, p.y);
  assert(p.fired.length === countBefore && p.interactions.isConsumed() === false,
    `[W=${W}] gap between buttons (x=${gapMid.toFixed(1)}) not hit`);

  // SegToggle：右半 -> casual；当前右半无操作；左半 -> hardcore；当前左半无操作；左右边缘可命中
  const tgL = p.modeX - p.modeW / 4;
  const tgR = p.modeX + p.modeW / 4;
  tap(p.scene, tgR, p.modeY);
  assert(p.modeFired.join(',') === 'casual', `[W=${W}] SegToggle right half => casual`);
  tap(p.scene, tgR, p.modeY);
  assert(p.modeFired.join(',') === 'casual', `[W=${W}] SegToggle current (right) => no-op`);
  tap(p.scene, tgL, p.modeY);
  assert(p.modeFired.join(',') === 'casual,hardcore', `[W=${W}] SegToggle left half => hardcore`);
  tap(p.scene, tgL, p.modeY);
  assert(p.modeFired.join(',') === 'casual,hardcore', `[W=${W}] SegToggle current (left) => no-op`);
  // 左右边缘（非中心）也可命中：先切到 casual，再点左缘 -> hardcore
  tap(p.scene, tgR, p.modeY);
  tap(p.scene, p.modeX - p.modeW / 2, p.modeY);
  assert(p.modeFired[p.modeFired.length - 1] === 'hardcore', `[W=${W}] SegToggle left edge hits left half`);
  // 左右半矩形平铺整条（无死区）：中点左右 1px 各命中其半
  tap(p.scene, p.modeX - 1, p.modeY); // 当前 hardcore，点左半无操作但被消费
  assert(p.interactions.isConsumed() === true, `[W=${W}] SegToggle left area consumes gesture`);
  tap(p.scene, p.modeX + 1, p.modeY); // 点右半 -> 切到 casual（证明右半可命中，无死区）
  assert(p.modeFired[p.modeFired.length - 1] === 'casual', `[W=${W}] SegToggle right area hittable (no dead zone)`);
}

// ---------- 10) drawButton 纯绘制：两态 + 居中 ----------
{
  const g = { clear() {}, _fc: null, fillStyle(c) { this._fc = c; }, fillRoundedRect() {} };
  const t = { _c: null, _x: 0, _y: 0, setColor(c) { this._c = c; return this; }, setPosition(x, y) { this._x = x; this._y = y; return this; } };
  drawButton(g, t, { x: 10, y: 20, w: 100, h: 50 }, { bg: 0x112233, textColor: '#ffffff', enabled: true });
  assert(g._fc === 0x112233, 'drawButton normal bg color');
  assert(t._c === '#ffffff', 'drawButton normal text color');
  assert(t._x === 60 && t._y === 45, 'drawButton centers text on rect center');
  drawButton(g, t, { x: 10, y: 20, w: 100, h: 50 }, { bg: 0x112233, textColor: '#ffffff', enabled: false });
  assert(g._fc === BTN_DISABLED.bg, 'drawButton disabled bg gray');
  assert(t._c === hexToStr(BTN_DISABLED.text), 'drawButton disabled text gray');
}

// ---------- summary ----------
console.log(`\nInteraction assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
