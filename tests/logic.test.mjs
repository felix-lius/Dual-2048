// 最小 Node 断言：覆盖 board.js（合并 / 胜利 / 死局 / 序列化）与 assist.js
// （UndoManager 环形缓冲 / FreezeManager 冻结与里程碑奖励）。
// 运行：node tests/logic.test.mjs
import { Board, Tile } from '../src/board.js';
import { UndoManager, FreezeManager } from '../src/assist.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

// ---------- Board: Tile ----------
const t1 = new Tile(0, 0, 2);
assert(t1.value === 2 && t1.x === 0 && t1.y === 0, 'Tile stores x,y,value');
const t2 = new Tile(1, 1, 4);
assert(t2.id === t1.id + 1, 'Tile id increments');
t1.savePosition();
t1.updatePosition({ x: 2, y: 3 });
assert(t1.previousPosition.x === 0 && t1.previousPosition.y === 0, 'Tile savePosition captures prev');
assert(t1.x === 2 && t1.y === 3, 'Tile updatePosition updates');

// ---------- Board: setup ----------
const b = new Board(4);
assert(b.cells.length === 4, 'Board has size columns');
assert(b.availableCells().length === 14, 'Board setup leaves 14 empty (2 tiles)');
assert(b.score === 0, 'Board score starts 0');

// ---------- Board: merge + score ----------
const b2 = new Board(4);
b2.cells = b2.empty();
b2.insertTile(new Tile(0, 0, 2));
b2.insertTile(new Tile(1, 0, 2));
const res = b2.move('left');
assert(res.moved === true, 'merge move reports moved');
assert(b2.cells[0][0].value === 4, 'left merge combines to 4 at col0');
assert(b2.cells[1][0] === null, 'merged source cell cleared');
assert(res.scoreGained === 4, 'merge score gained = 4');
// 音频增强：move() 额外返回 grid / merges / maxMerge（audio-bible §5.1）
assert(Array.isArray(res.grid) && res.grid.length === 4 && res.grid[0].length === 4, 'move returns grid number[][] (4x4)');
assert(res.grid[0][0] === 4 && res.grid[1][0] === 0, 'grid reflects merged value at (x=0,y=0), source cell empty(0)');
assert(Array.isArray(res.merges) && res.merges.length === 1, 'move returns merges array with 1 entry');
assert(res.merges[0].value === 4 && res.merges[0].r === 0 && res.merges[0].c === 0, 'merge entry {value,r,c} correct (cell x=0,y=0)');
assert(res.maxMerge === 4, 'maxMerge = highest merged value (4)');

// ---------- Board: multi-merge（同时多合并，maxMerge 取最高） ----------
const bm = new Board(4);
bm.cells = bm.empty();
bm.insertTile(new Tile(0, 0, 2));
bm.insertTile(new Tile(1, 0, 2)); // 合并 -> 4
bm.insertTile(new Tile(0, 1, 4));
bm.insertTile(new Tile(1, 1, 4)); // 合并 -> 8
const rmt = bm.move('left');
assert(rmt.merges.length === 2, 'multi-merge records both merges');
assert(rmt.maxMerge === 8, 'maxMerge is highest merged value (8)');
assert(rmt.grid[0][0] === 4 && rmt.grid[0][1] === 8, 'grid reflects both merges');

// ---------- Board: no-op move ----------
const b3 = new Board(4);
b3.cells = b3.empty();
b3.insertTile(new Tile(0, 0, 2));
const r3 = b3.move('left');
assert(r3.moved === false, 'move left with single tile at edge => no move');
assert(Array.isArray(r3.merges) && r3.merges.length === 0, 'no-op move => empty merges');
assert(r3.maxMerge === 0, 'no-op move => maxMerge 0');
assert(Array.isArray(r3.grid) && r3.grid.length === 4, 'no-op move still returns grid');

// ---------- Board: win detection ----------
const b4 = new Board(4);
b4.cells = b4.empty();
b4.cells[0][0] = new Tile(0, 0, 2048);
assert(b4.maxTile() === 2048, 'maxTile detects 2048 (win)');
assert(b4.maxTile() >= 2048, 'win threshold met');

// ---------- Board: dead state ----------
const b5 = new Board(4);
b5.cells = b5.empty();
const vals = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]];
for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) b5.cells[x][y] = new Tile(x, y, vals[x][y]);
assert(b5.availableCells().length === 0, 'dead board has no empty cells');
assert(b5.tileMatchesAvailable() === false, 'dead board no matches');
assert(b5.movesAvailable() === false, 'dead board => no moves available');

// ---------- Board: serialize / restore roundtrip ----------
const b6 = new Board(4);
b6.score = 1234;
b6.cells[2][2] = new Tile(2, 2, 64);
const snap = b6.serialize();
assert(snap.score === 1234, 'serialize captures score');
assert(snap.grid[2][2] === 64, 'serialize captures tile value');
const b7 = new Board(4);
b7.restore(snap);
assert(b7.score === 1234, 'restore score');
assert(b7.cells[2][2] && b7.cells[2][2].value === 64, 'restore tile');
assert(b7.cells[2][2].previousPosition === null, 'restored tile has no previousPosition');

// ---------- Board: addRandomTile ----------
const b8 = new Board(4);
b8.cells = b8.empty();
const added = b8.addRandomTile();
assert(added !== null && (added.value === 2 || added.value === 4), 'addRandomTile value 2 or 4');

// ---------- ITER-V13-002 ②：spawn 规则覆盖（game.js 集成层判定） ----------
// 产品规则：仅当本盘 move().moved===true 时才 addRandomTile。
// 验证：构造一盘 4 列全填满（无空位）→ move 后 tilesBefore == tilesAfter；
// 反之构造有空位 → move 后 tilesAfter == tilesBefore + 1。
function countTiles(b) {
  let n = 0;
  for (let x = 0; x < b.size; x++) for (let y = 0; y < b.size; y++) if (b.cells[x][y]) n++;
  return n;
}
// (a) 单盘「无空位 + 无可合并」→ move().moved===false，spawn 应被上层跳过 → 块数不变
const bSpawn1 = new Board(2);
bSpawn1.cells = bSpawn1.empty();
bSpawn1.cells[0][0] = new Tile(0, 0, 2);
bSpawn1.cells[1][0] = new Tile(1, 0, 4);
bSpawn1.cells[0][1] = new Tile(0, 1, 8);
bSpawn1.cells[1][1] = new Tile(1, 1, 16);
const rSpawn1 = bSpawn1.move('left');
assert(rSpawn1.moved === false, '[spawn-rule] no-move board reports moved=false');
// 模拟 game.js 的 spawn 判定：仅在 moved 时 addRandomTile
if (rSpawn1.moved) bSpawn1.addRandomTile();
assert(countTiles(bSpawn1) === 4, '[spawn-rule] no-move board does not spawn new tile');
// (b) 单盘「有可合并」→ moved=true，spawn 应触发 → 块数+1
const bSpawn2 = new Board(4);
bSpawn2.cells = bSpawn2.empty();
bSpawn2.cells[0][0] = new Tile(0, 0, 2);
bSpawn2.cells[1][0] = new Tile(1, 0, 2);
const rSpawn2 = bSpawn2.move('left');
assert(rSpawn2.moved === true, '[spawn-rule] mergeable move reports moved=true');
const beforeSpawn2 = countTiles(bSpawn2);
if (rSpawn2.moved) bSpawn2.addRandomTile();
assert(countTiles(bSpawn2) === beforeSpawn2 + 1, '[spawn-rule] moved board spawns exactly 1 new tile');

// ---------- UndoManager ----------
const um = new UndoManager(40, 5);
assert(um.undoLeft === 5, 'UndoManager free uses 5');
assert(um.canUndo() === false, 'no undo before push');
um.push({ grid: [], score: 0 });
assert(um.canUndo() === true, 'canUndo after push');
const snap1 = um.undo();
assert(snap1 && snap1.score === 0, 'undo returns snapshot');
assert(um.undoLeft === 4, 'undo consumes one free use');
assert(um.canUndo() === false, 'no more undo after exhausting buffer');
um.push({ a: 1 });
um.push({ a: 2 });
assert(um.undo().a === 2, 'undo LIFO returns latest');
assert(um.undo().a === 1, 'undo returns earlier');
const um2 = new UndoManager(3, 99);
for (let i = 0; i < 10; i++) um2.push({ i });
assert(um2.buffer.length === 3, 'ring buffer capped at capacity');
assert(um2.buffer[0].i === 7, 'oldest evicted (keeps last 3: 7,8,9)');
um2.reset();
assert(um2.buffer.length === 0 && um2.undoLeft === 99, 'reset clears buffer + free uses');

// ---------- FreezeManager ----------
const fm = new FreezeManager(3, 1000);
assert(fm.freeUses === 3, 'FreezeManager free uses 3');
assert(fm.totalLeft === 3, 'totalLeft = free + bonus');
assert(fm.canFreeze() === true, 'canFreeze initially');
assert(fm.beginSelect() === true, 'beginSelect ok');
assert(fm.selecting === true, 'selecting flag set');
assert(fm.applyTo(0) === true, 'applyTo left board');
assert(fm.frozen[0] === true, 'left board frozen');
assert(fm.steps[0] === 5, 'freeze sets 5 steps');
assert(fm.totalLeft === 2, 'totalLeft decremented to 2');
assert(fm.canFreeze() === false, 'cannot freeze while one already frozen');
for (let i = 0; i < 5; i++) fm.tick();
assert(fm.frozen[0] === false, 'frozen auto-unfreeze at 0 steps');
assert(fm.steps[0] === 0, 'steps reset to 0');

const fm2 = new FreezeManager(0, 1000);
assert(fm2.totalLeft === 0, 'zero free uses');
const gained = fm2.checkBonus(2500);
assert(gained === 2, 'checkBonus grants 2 at 2500 (2 milestones)');
assert(fm2.totalLeft === 2, 'bonus added to totalLeft');
assert(fm2.checkBonus(2500) === 0, 'no duplicate bonus at same milestone');
assert(fm2.checkBonus(3900) === 1, 'one more milestone at 3900');

const fm3 = new FreezeManager(3, 1000);
fm3.beginSelect();
fm3.applyTo(0);
fm3.checkBonus(2000);
const s = fm3.serialize();
const fm4 = new FreezeManager(3, 1000);
fm4.restore(s);
assert(fm4.frozen[0] === true && fm4.bonusLeft === 2, 'restore freezes + bonus');
assert(fm3.lastMilestone === 2, 'lastMilestone updated by checkBonus');

// ---------- summary ----------
console.log(`\nAssertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
