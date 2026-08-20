// board.js —— 纯逻辑 4x4 棋盘（无 Phaser 依赖，可独立复用 / 单测）
// 坐标约定：cells[x][y]，x = 列(横向)，y = 行(纵向)，取值 0..size-1
// 动画所需信息通过 Tile 的 previousPosition / mergedFrom 暴露给视图层。

let __tileId = 0;

export class Tile {
  constructor(x, y, value) {
    this.id = ++__tileId;
    this.x = x;
    this.y = y;
    this.value = value;
    this.previousPosition = null; // 移动前的位置（用于滑入动画）
    this.mergedFrom = null;       // [tile, tile]，合并时记录来源（用于合并动画）
  }
  savePosition() {
    this.previousPosition = { x: this.x, y: this.y };
  }
  updatePosition(pos) {
    this.x = pos.x;
    this.y = pos.y;
  }
}

const VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export class Board {
  constructor(size = 4) {
    this.size = size;
    this.cells = this.empty();
    this.score = 0;
    this.setup();
  }

  empty() {
    const cells = [];
    for (let x = 0; x < this.size; x++) {
      const col = [];
      for (let y = 0; y < this.size; y++) col.push(null);
      cells.push(col);
    }
    return cells;
  }

  // 初始随机放 2 个块
  setup() {
    this.cells = this.empty();
    this.score = 0;
    this.addRandomTile();
    this.addRandomTile();
  }

  withinBounds(cell) {
    return (
      cell.x >= 0 && cell.x < this.size &&
      cell.y >= 0 && cell.y < this.size
    );
  }

  cellContent(cell) {
    return this.withinBounds(cell) ? this.cells[cell.x][cell.y] : null;
  }

  cellAvailable(cell) {
    return !this.cellContent(cell);
  }

  insertTile(tile) {
    this.cells[tile.x][tile.y] = tile;
  }

  removeTile(tile) {
    this.cells[tile.x][tile.y] = null;
  }

  availableCells() {
    const cells = [];
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        if (!this.cells[x][y]) cells.push({ x, y });
      }
    }
    return cells;
  }

  randomAvailableCell() {
    const cells = this.availableCells();
    if (cells.length === 0) return null;
    return cells[Math.floor(Math.random() * cells.length)];
  }

  // 90% 出 2，10% 出 4
  addRandomTile() {
    const cell = this.randomAvailableCell();
    if (!cell) return null;
    const value = Math.random() < 0.9 ? 2 : 4;
    const tile = new Tile(cell.x, cell.y, value);
    this.insertTile(tile);
    return tile;
  }

  prepareTiles() {
    this.eachTile((tile) => {
      tile.mergedFrom = null;
      tile.savePosition();
    });
  }

  moveToTile(tile, cell) {
    this.removeTile(tile);
    tile.updatePosition(cell);
    this.insertTile(tile);
  }

  buildTraversals(vector) {
    const t = { x: [], y: [] };
    for (let i = 0; i < this.size; i++) {
      t.x.push(i);
      t.y.push(i);
    }
    // 逆序遍历保证从移动方向最前端开始处理
    if (vector.x === 1) t.x.reverse();
    if (vector.y === 1) t.y.reverse();
    return t;
  }

  findFarthestPosition(cell, vector) {
    let previous;
    let current = { x: cell.x, y: cell.y };
    do {
      previous = current;
      current = { x: previous.x + vector.x, y: previous.y + vector.y };
    } while (this.withinBounds(current) && this.cellAvailable(current));
    return { farthest: previous, next: current };
  }

  // 执行一次方向滑动。返回 { moved, scoreGained }（兼容旧调用方）。
  // 音频增强（audio-bible §5.1 方案 A）：额外返回
  //   grid: number[][]（合并后网格值，便于渲染/单测）、
  //   merges: [{value, r, c}]（本次移动新合成的合并块；r=行=cell.y, c=列=cell.x）、
  //   maxMerge: number（最高合并后数值，0 表示本回合无合并）。
  // 注意：frozen 由上层（DualGame）控制，本方法不感知冻结；合并/生成逻辑完全不变。
  move(direction) {
    const vector = VECTORS[direction];
    if (!vector) return { moved: false, scoreGained: 0, grid: this._gridSnapshot(), merges: [], maxMerge: 0 };

    this.prepareTiles();
    const trav = this.buildTraversals(vector);
    let moved = false;
    let scoreGained = 0;
    const merges = [];
    let maxMerge = 0;

    trav.x.forEach((x) => {
      trav.y.forEach((y) => {
        const tile = this.cellContent({ x, y });
        if (!tile) return;
        const pos = this.findFarthestPosition({ x, y }, vector);
        const next = this.cellContent(pos.next);
        if (next && next.value === tile.value && !next.mergedFrom) {
          // 合并
          const merged = new Tile(pos.next.x, pos.next.y, tile.value * 2);
          merged.mergedFrom = [tile, next];
          this.insertTile(merged);
          this.removeTile(tile);
          tile.updatePosition(pos.next);
          scoreGained += merged.value;
          // 记录合并块（坐标约定 cells[x][y]，x=列, y=行；音频用 r=行,c=列）
          merges.push({ value: merged.value, r: merged.y, c: merged.x });
          if (merged.value > maxMerge) maxMerge = merged.value;
        } else {
          this.moveToTile(tile, pos.farthest);
        }
        if (!(tile.x === x && tile.y === y)) moved = true;
      });
    });

    this.score += scoreGained;
    return { moved, scoreGained, grid: this._gridSnapshot(), merges, maxMerge };
  }

  // 当前棋盘网格值快照（number[][]，x=列,y=行），供 move() 返回与渲染层使用
  _gridSnapshot() {
    const grid = [];
    for (let x = 0; x < this.size; x++) {
      const col = [];
      for (let y = 0; y < this.size; y++) {
        const t = this.cells[x][y];
        col.push(t ? t.value : 0);
      }
      grid.push(col);
    }
    return grid;
  }

  // 是否还有可行操作（有空格 或 存在相邻可合并）
  movesAvailable() {
    return this.availableCells().length > 0 || this.tileMatchesAvailable();
  }

  tileMatchesAvailable() {
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const tile = this.cells[x][y];
        if (!tile) continue;
        // 仅检查右、下两个方向即可覆盖全部相邻对
        const right = this.cellContent({ x: x + 1, y });
        const down = this.cellContent({ x, y: y + 1 });
        if ((right && right.value === tile.value) ||
            (down && down.value === tile.value)) {
          return true;
        }
      }
    }
    return false;
  }

  maxTile() {
    let max = 0;
    this.eachTile((t) => { if (t.value > max) max = t.value; });
    return max;
  }

  eachTile(cb) {
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const t = this.cells[x][y];
        if (t) cb(t);
      }
    }
  }

  // 序列化：网格值 + 分数（供撤销快照使用）
  serialize() {
    const grid = [];
    for (let x = 0; x < this.size; x++) {
      const col = [];
      for (let y = 0; y < this.size; y++) {
        const t = this.cells[x][y];
        col.push(t ? t.value : 0);
      }
      grid.push(col);
    }
    return { grid, score: this.score };
  }

  // 反序列化：用网格值重建棋盘（新 Tile，无 previousPosition）
  restore(state) {
    this.cells = this.empty();
    this.score = state.score || 0;
    const grid = state.grid;
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const v = grid[x][y];
        if (v) this.cells[x][y] = new Tile(x, y, v);
      }
    }
  }
}
