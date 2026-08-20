// assist.test.mjs —— UndoManager 撤销逻辑（含 ITER-V13 undoMany）
import { UndoManager, FreezeManager } from '../src/assist.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

// --- 基本 push / buffer 容量 ---
const u = new UndoManager(40, 5);
for (let i = 0; i < 8; i++) u.push({ n: i });
assert(u.buffer.length === 8, 'buffer holds 8 snapshots');

// --- undoMany(5)：回退 5 步，返回最深（最早）快照 n=3，buffer 剩余 3 ---
const r = u.undoMany(5);
assert(r.steps === 5, 'undoMany returns 5 steps');
assert(r.snapshot && r.snapshot.n === 3, 'undoMany restores snapshot 5 steps back (n=3)');
assert(u.buffer.length === 3, 'buffer trimmed to 3 after undoMany(5)');

// --- 不消耗免费 undoLeft（广告奖励独立）---
assert(u.undoLeft === 5, 'undoMany does not consume free undoLeft');

// --- 超出 buffer 上限：回退 min(n, len) ---
const u2 = new UndoManager(40, 5);
u2.push({ n: 0 }); u2.push({ n: 1 });
const r2 = u2.undoMany(5);
assert(r2.steps === 2, 'undoMany caps at available count');
assert(r2.snapshot && r2.snapshot.n === 0, '...restores deepest (n=0)');
assert(u2.buffer.length === 0, 'buffer empty after over-cap undoMany');

// --- 空 buffer：steps=0, snapshot=null ---
const u3 = new UndoManager(40, 5);
const r3 = u3.undoMany(5);
assert(r3.steps === 0, 'undoMany on empty buffer returns 0 steps');
assert(r3.snapshot === null, 'undoMany on empty buffer returns null snapshot');

// --- sanity: FreezeManager bonus 阈值 ---
const f = new FreezeManager(3, 1000);
assert(f.totalLeft === 3, 'freeze starts with 3 free');
assert(f.checkBonus(2100) === 2, 'checkBonus grants 2 at 2100 score');

console.log(`\nAssertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
