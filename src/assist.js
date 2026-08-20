// assist.js —— 辅助系统：撤销（环形缓冲）+ 冻结
// 这两个管理器都是纯逻辑，不依赖 Phaser，方便单测与后续接入。

// ---------------------------------------------------------------------------
// 撤销管理器：定长环形缓冲保存历史快照，最多保留 capacity 个（防内存增长）。
// 免费次数为 freeUses（首版 5 次）。看广告得撤销仅留触发桩（requestAd 由上层调用）。
// ---------------------------------------------------------------------------
export class UndoManager {
  constructor(capacity = 40, freeUses = 5) {
    this.capacity = capacity;
    this.freeUses = freeUses;
    this.buffer = [];      // 历史快照栈（尾部为最近一次）
    this.undoLeft = freeUses;
  }

  // 每次「有效操作」前压入一份完整状态快照
  push(snapshot) {
    this.buffer.push(snapshot);
    if (this.buffer.length > this.capacity) this.buffer.shift(); // 丢弃最旧，保持定长
  }

  canUndo() {
    return this.undoLeft > 0 && this.buffer.length > 0;
  }

  // 取出最近一次快照并消耗一次免费次数；无可用则返回 null
  undo() {
    if (!this.canUndo()) return null;
    this.undoLeft--;
    return this.buffer.pop();
  }

  reset() {
    this.buffer = [];
    this.undoLeft = this.freeUses;
  }

  // 看广告奖励的临时撤销次数（不直接消耗 buffer，仅增加可用次数）
  grantTemp(n) {
    this.undoLeft += n;
  }

  // ITER-V13：看广告「自动回退 N 步」。连续弹出最多 n 个快照，返回最深（最早）那份作为恢复态；
  // 不消耗免费 undoLeft（广告奖励独立于免费次数）。realSteps = 实际回退步数（buffer 不足时取 len）。
  undoMany(n) {
    const steps = Math.max(0, Math.min(n, this.buffer.length));
    let snap = null;
    for (let i = 0; i < steps; i++) snap = this.buffer.pop();
    return { snapshot: snap, steps };
  }
}

// ---------------------------------------------------------------------------
// 冻结管理器：每局 3 次免费；点击后选左/右盘，锁定 5 步（每次全局有效移动 -1），
// 归零自动解除；两盘总得分每跨过 1000 分奖励 +1（仅当局，无上限）。
// lastMilestone 为“单调里程碑”，不参与撤销回滚，避免撤销+重做刷冻结次数。
// ---------------------------------------------------------------------------
export class FreezeManager {
  constructor(freeUses = 3, bonusPerScore = 1000) {
    this.freeUses = freeUses;
    this.bonusPerScore = bonusPerScore;
    this.reset();
  }

  get totalLeft() {
    return this.left + this.bonusLeft;
  }

  canFreeze() {
    return this.totalLeft > 0 && !this.frozen[0] && !this.frozen[1];
  }

  // 进入“选择要冻结的棋盘”状态
  beginSelect() {
    if (!this.canFreeze()) return false;
    this.selecting = true;
    return true;
  }

  cancelSelect() {
    this.selecting = false;
  }

  // 对指定棋盘（0=左, 1=右）应用冻结
  applyTo(boardIndex) {
    if (!this.selecting) return false;
    if (this.frozen[boardIndex]) return false;
    if (this.left > 0) this.left--;
    else this.bonusLeft--;
    this.frozen[boardIndex] = true;
    this.steps[boardIndex] = 5;
    this.selecting = false;
    return true;
  }

  // 每次全局“有效移动”后调用：冻结中的棋盘步数 -1，归零则解除
  tick() {
    for (let i = 0; i < 2; i++) {
      if (this.frozen[i]) {
        this.steps[i]--;
        if (this.steps[i] <= 0) {
          this.frozen[i] = false;
          this.steps[i] = 0;
        }
      }
    }
  }

  // 得分变化后调用，返回本次新获得的奖励冻结次数（0 表示无）
  checkBonus(combinedScore) {
    const milestone = Math.floor(combinedScore / this.bonusPerScore);
    if (milestone > this.lastMilestone) {
      const gained = milestone - this.lastMilestone;
      this.lastMilestone = milestone;
      this.bonusLeft += gained;
      return gained;
    }
    return 0;
  }

  serialize() {
    // 注意：lastMilestone 故意不纳入（保持单调，防刷）
    return {
      left: this.left,
      bonusLeft: this.bonusLeft,
      frozen: [this.frozen[0], this.frozen[1]],
      steps: [this.steps[0], this.steps[1]],
    };
  }

  restore(s) {
    this.left = s.left;
    this.bonusLeft = s.bonusLeft;
    this.frozen = [s.frozen[0], s.frozen[1]];
    this.steps = [s.steps[0], s.steps[1]];
    this.selecting = false;
  }

  reset() {
    this.left = this.freeUses;
    this.bonusLeft = 0;
    this.frozen = [false, false];
    this.steps = [0, 0];
    this.selecting = false;
    this.lastMilestone = 0;
  }
}
