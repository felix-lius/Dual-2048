// view.js —— BoardView：单个棋盘的视觉表现（卡通圆角 + 同步动画 + 冻结遮罩）
// 负责把一个纯逻辑 Board 渲染成 Phaser 对象，并依据 Tile 的 previousPosition /
// mergedFrom 播放滑动、合并弹跳、新块弹出动画。双盘共用此类，保证逻辑可复用。
// 视觉常量（色板/字体/遮罩色）统一取自 theme.js（美术圣经 v1.0）。

import { FONT_STACK, TILE_FONT, TILE_COLORS, tileColorFor, hexToStr,
         BOARD_FRAME, BOARD_EMPTY,
         FREEZE_OVERLAY, FREEZE_OVERLAY_ALPHA,
         RETIRED_OVERLAY, RETIRED_OVERLAY_ALPHA } from './theme.js';

const SIZE = 4;
const ANIM_MS = 110; // 滑动时长

export class BoardView {
  constructor(scene, index) {
    this.scene = scene;
    this.index = index;
    this.container = scene.add.container(0, 0).setDepth(0);
    this.bg = scene.add.graphics();
    this.container.add(this.bg);
    this.tileLayer = scene.add.container(0, 0);
    this.container.add(this.tileLayer);

    this.tileViews = {}; // tile.id -> { container, g, text, value, gx, gy }
    this.lastRenderFP = null; // 上次 render 的棋盘指纹（防御性重绘跳过，见 render()）
    this.cellSize = 80;
    this.gap = 10;
    this.pad = 12;
    this.boardPx = 320;

    this.freezeOverlay = null;
    this.freezeSteps = 0;
    this.retiredOverlay = null; // 退役遮罩（休闲模式达标盘标记）
  }

  // 文字大小随格子缩放；大数字略缩
  fontSize() {
    let s = Math.floor(this.cellSize * 0.42);
    return s;
  }

  cellToLocal(gx, gy) {
    const start = this.pad + this.cellSize / 2;
    return {
      x: start + gx * (this.cellSize + this.gap),
      y: start + gy * (this.cellSize + this.gap),
    };
  }

  drawBackground() {
    const g = this.bg;
    g.clear();
    g.fillStyle(BOARD_FRAME, 1);
    g.fillRoundedRect(0, 0, this.boardPx, this.boardPx, this.pad);
    g.fillStyle(BOARD_EMPTY, 1);
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        const p = this.cellToLocal(x, y);
        g.fillRoundedRect(
          p.x - this.cellSize / 2,
          p.y - this.cellSize / 2,
          this.cellSize, this.cellSize,
          this.cellSize * 0.25
        );
      }
    }
  }

  makeTileView(value) {
    const container = this.scene.add.container(0, 0);
    const g = this.scene.add.graphics();
    // 方块数字专用字体栈（TILE_FONT）：只放拉丁数字，不混入 CJK / 卡通字体，
    // 避免 Windows 上命中 Comic Sans MS 导致数字观感差；UI 英文/中文仍用 FONT_STACK。
    const text = this.scene.add.text(0, 0, '', {
      fontFamily: TILE_FONT,
      fontStyle: '800',
      color: hexToStr(tileColorFor(2).text),
    }).setOrigin(0.5);
    container.add([g, text]);
    this.tileLayer.add(container);
    return { container, g, text, value: 0, gx: 0, gy: 0 };
  }

  paintTile(v, value) {
    v.value = value;
    const c = tileColorFor(value);
    const s = this.cellSize;
    v.g.clear();
    v.g.fillStyle(c.bg, 1);
    v.g.fillRoundedRect(-s / 2, -s / 2, s, s, s * 0.25);
    v.text.setText(String(value));
    v.text.setColor(hexToStr(c.text));
    // 大数字缩小，避免溢出
    let fs = this.fontSize();
    if (value >= 1000) fs = Math.floor(fs * 0.78);
    if (value >= 10000) fs = Math.floor(fs * 0.62);
    v.text.setFontSize(fs);
  }

  // 布局定位：设置容器左上角坐标与棋盘像素尺寸，并重绘背景与所有块。
  // ③ 方块间距由「格子尺寸比例」反推：gap ≈ cell 尺寸的 5%（原来 gap 常 >8%，已下调），
  // 外框内边距按 boardPx 的 3% 略缩并居中，保证 4×4 居中不溢出、圆角一致。
  // 传入的 gap/pad 仅作兼容占位，不再直接用于格内计算。
  layout(x, y, boardPx, gap, pad) {
    this.container.setPosition(x, y);
    this.boardPx = boardPx;
    const GAP_RATIO = 0.05;   // 方块之间间距 ≈ 格子尺寸的 5%
    const PAD_RATIO = 0.03;   // 外框到方块内边距 ≈ boardPx 的 3%（略缩）
    // boardPx = pad*2 + cellSize*SIZE + gap*(SIZE-1)，且 gap = cellSize*GAP_RATIO
    // => cellSize = boardPx*(1 - 2*PAD_RATIO) / (SIZE + GAP_RATIO*(SIZE-1))
    this.cellSize = (boardPx * (1 - 2 * PAD_RATIO)) / (SIZE + GAP_RATIO * (SIZE - 1));
    this.gap = this.cellSize * GAP_RATIO;
    const content = this.cellSize * SIZE + this.gap * (SIZE - 1);
    this.pad = (boardPx - content) / 2;  // 居中后的外框内边距
    this.drawBackground();
    // 重新摆放已有块
    for (const id in this.tileViews) {
      const v = this.tileViews[id];
      const p = this.cellToLocal(v.gx, v.gy);
      v.container.setPosition(p.x, p.y);
      v.container.setScale(1);
      this.paintTile(v, v.value);
    }
    if (this.freezeOverlay && this.freezeOverlay.o.visible) {
      this._drawFreeze(this.freezeSteps);
    }
    if (this.retiredOverlay && this.retiredOverlay.o.visible) {
      this._drawRetired();
    }
  }

  // 静态渲染（无动画）：用于初始化、撤销、重开、响应式重排
  renderStatic(board) {
    this.clearTiles();
    board.eachTile((tile) => {
      const v = this.makeTileView(tile.value);
      this.tileViews[tile.id] = v;
      v.gx = tile.x; v.gy = tile.y;
      this.paintTile(v, tile.value);
      const p = this.cellToLocal(tile.x, tile.y);
      v.container.setPosition(p.x, p.y);
      v.container.setScale(1);
    });
  }

  // 轻量棋盘状态指纹：id:value@x,y 序列（含新增块 id，能区分“加块”变化）。
  // 状态未变则视为“无需重绘”，供 render() 防御性跳过。
  fingerprint(board) {
    let s = '';
    board.eachTile((t) => { s += t.id + ':' + t.value + '@' + t.x + ',' + t.y + ';'; });
    return s;
  }

  // 带动画渲染：依据 previousPosition / mergedFrom 播放过渡
  render(board, animate) {
    // 防御性兜底：棋盘状态与上次渲染一致（如冻结盘被误调用重绘）则跳过方块重绘，
    // 避免 clear+重画 与冻结遮罩叠加产生可见闪烁。
    const fp = this.fingerprint(board);
    if (fp === this.lastRenderFP) {
      board.eachTile((t) => { t.mergedFrom = null; });
      return;
    }
    this.lastRenderFP = fp;

    const entries = [];
    const keep = new Set();

    board.eachTile((tile) => {
      keep.add(tile.id);
      if (animate && tile.mergedFrom) {
        entries.push({ id: tile.id, value: tile.value, gx: tile.x, gy: tile.y, from: tile.previousPosition, kind: 'merge' });
        tile.mergedFrom.forEach((src) => {
          entries.push({ id: 'src' + src.id, value: src.value, gx: tile.x, gy: tile.y, from: src.previousPosition, kind: 'src' });
        });
      } else {
        entries.push({
          id: tile.id, value: tile.value, gx: tile.x, gy: tile.y,
          from: tile.previousPosition,
          kind: tile.previousPosition ? 'move' : 'new',
        });
      }
    });

    entries.forEach((e) => {
      if (e.kind === 'src') {
        // 合并来源块的瞬态视图：滑入后销毁，不参与持久映射
        const v = this.makeTileView(e.value);
        const fromP = e.from ? this.cellToLocal(e.from.x, e.from.y) : this.cellToLocal(e.gx, e.gy);
        v.container.setPosition(fromP.x, fromP.y);
        this.paintTile(v, e.value);
        const toP = this.cellToLocal(e.gx, e.gy);
        this.scene.tweens.add({
          targets: v.container,
          x: toP.x, y: toP.y,
          duration: ANIM_MS, ease: 'Quad.easeOut',
          onComplete: () => v.container.destroy(),
        });
        return;
      }

      let v = this.tileViews[e.id];
      if (!v) {
        v = this.makeTileView(e.value);
        this.tileViews[e.id] = v;
      }
      v.gx = e.gx; v.gy = e.gy;
      this.paintTile(v, e.value);
      const toP = this.cellToLocal(e.gx, e.gy);

      if (animate) {
        if (e.from) {
          const fromP = this.cellToLocal(e.from.x, e.from.y);
          v.container.setPosition(fromP.x, fromP.y);
          this.scene.tweens.add({ targets: v.container, x: toP.x, y: toP.y, duration: ANIM_MS, ease: 'Quad.easeOut' });
        } else if (e.kind === 'new') {
          v.container.setPosition(toP.x, toP.y);
          v.container.setScale(0);
          this.scene.tweens.add({ targets: v.container, scale: 1, duration: ANIM_MS, ease: 'Back.easeOut' });
        } else {
          v.container.setPosition(toP.x, toP.y);
        }
        if (e.kind === 'merge') {
          this.scene.tweens.add({
            targets: v.container, scale: 1.18,
            duration: ANIM_MS * 0.6, yoyo: true, delay: ANIM_MS * 0.45, ease: 'Quad.easeOut',
          });
        }
      } else {
        v.container.setPosition(toP.x, toP.y);
        v.container.setScale(1);
      }
    });

    // 清理已不存在的持久块（理论上合并来源已通过 src 处理，这里兜底）
    for (const id in this.tileViews) {
      if (!keep.has(Number(id))) {
        // 先杀针对该容器的 tween 再销毁，避免快速撤销/重开时对已销毁对象仍有动画回调
        this.scene.tweens.killTweensOf(this.tileViews[id].container);
        this.tileViews[id].container.destroy();
        delete this.tileViews[id];
      }
    }

    // 清掉 mergedFrom，避免后续（如响应式 resize）误触发合并动画
    board.eachTile((t) => { t.mergedFrom = null; });
  }

  clearTiles() {
    for (const id in this.tileViews) {
      // 先杀 tween 再销毁容器：撤销/重开瞬间可能仍有上一帧滑动/合并动画在跑
      this.scene.tweens.killTweensOf(this.tileViews[id].container);
      this.tileViews[id].container.destroy();
    }
    this.tileViews = {};
  }

  // ---- 冻结遮罩 ----
  _drawFreeze(steps) {
    if (!this.freezeOverlay) {
      const o = this.scene.add.container(this.boardPx / 2, this.boardPx / 2);
      const g = this.scene.add.graphics();
      const t = this.scene.add.text(0, 0, '', {
        fontFamily: FONT_STACK,
        fontStyle: '800', fontSize: '28px', color: '#ffffff', align: 'center',
      }).setOrigin(0.5);
      o.add([g, t]);
      this.container.add(o);
      this.freezeOverlay = { o, g, t };
    }
    const o = this.freezeOverlay;
    o.g.clear();
    o.g.fillStyle(FREEZE_OVERLAY, FREEZE_OVERLAY_ALPHA);
    o.g.fillRoundedRect(-this.boardPx / 2, -this.boardPx / 2, this.boardPx, this.boardPx, this.pad);
    o.t.setText('冻结中\n' + steps + ' 步');
  }

  showFreeze(steps) {
    this.freezeSteps = steps;
    this._drawFreeze(steps);
    this.freezeOverlay.o.setVisible(true);
  }

  hideFreeze() {
    if (this.freezeOverlay) this.freezeOverlay.o.setVisible(false);
  }

  // ---- 退役遮罩（休闲模式达标盘：半透明遮罩 + DONE/达标 文字） ----
  _drawRetired() {
    if (!this.retiredOverlay) {
      const o = this.scene.add.container(this.boardPx / 2, this.boardPx / 2);
      const g = this.scene.add.graphics();
      const t = this.scene.add.text(0, 0, '', {
        fontFamily: FONT_STACK,
        fontStyle: '800', fontSize: '30px', color: '#ffffff', align: 'center',
      }).setOrigin(0.5);
      o.add([g, t]);
      this.container.add(o);
      this.retiredOverlay = { o, g, t };
    }
    const o = this.retiredOverlay;
    o.g.clear();
    o.g.fillStyle(RETIRED_OVERLAY, RETIRED_OVERLAY_ALPHA);
    o.g.fillRoundedRect(-this.boardPx / 2, -this.boardPx / 2, this.boardPx, this.boardPx, this.pad);
    o.t.setText('DONE 达标');
  }

  showRetired() {
    this._drawRetired();
    this.retiredOverlay.o.setVisible(true);
  }

  hideRetired() {
    if (this.retiredOverlay) this.retiredOverlay.o.setVisible(false);
  }
}
