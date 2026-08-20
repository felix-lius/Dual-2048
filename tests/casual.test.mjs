// 最小 Node 断言：休闲模式死局结算纯函数 resolveCasualOutcome
// 运行：node tests/casual.test.mjs
// game.js 顶层引用 Phaser.Scene，Node 下先补最小桩再动态导入（只做 extends，不实例化）。
globalThis.Phaser = { Scene: class {} };
const { resolveCasualOutcome, shouldShowRewardAdButton, isAdUnavailableSignal } =
  await import('../src/game.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

// 简单 mock board：只需 movesAvailable() 与 score；maxTile() 一并提供以符合函数契约
function mockBoard({ moves = true, score = 0, max = 0 } = {}) {
  return { movesAvailable: () => moves, score, maxTile: () => max };
}

// 1. 死局且总分 < 2048 -> lose（无法达标退役）
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: false, score: 1000 }), mockBoard({ moves: true, score: 0 })],
    [false, false]
  );
  assert(r.action === 'lose' && r.reason === 'scoreBelow2048', 'dead below 2048 => lose');
}

// 2. 左盘死局且总分 >= 2048 -> retire 左盘，另一盘继续
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: false, score: 3000 }), mockBoard({ moves: true, score: 500 })],
    [false, false]
  );
  assert(r.action === 'retire' && r.retireIndex === 0, 'dead >= 2048 => retire left');
}

// 3. 右盘死局且达标 -> retire 右盘
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: true, score: 500 }), mockBoard({ moves: false, score: 4096 })],
    [false, false]
  );
  assert(r.action === 'retire' && r.retireIndex === 1, 'right dead >= 2048 => retire right');
}

// 4. 两盘均已退役 -> win（双达标）
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: false, score: 2048 }), mockBoard({ moves: false, score: 2048 })],
    [true, true]
  );
  assert(r.action === 'win' && r.reason === 'bothDone', 'both retired => win bothDone');
}

// 5. 两盘同时死局且均达标 -> 直接 win（避免只退役一盘后另一盘卡死无法结算）
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: false, score: 2048 }), mockBoard({ moves: false, score: 3000 })],
    [false, false]
  );
  assert(r.action === 'win' && r.reason === 'bothDone', 'both dead & qualified => win bothDone');
}

// 6. 无死局、未双退役 -> continue
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: true, score: 100 }), mockBoard({ moves: true, score: 200 })],
    [false, false]
  );
  assert(r.action === 'continue', 'both playable => continue');
}

// 7. 一盘已退役 + 另一盘可玩 -> continue
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: false, score: 2048 }), mockBoard({ moves: true, score: 300 })],
    [true, false]
  );
  assert(r.action === 'continue', 'one retired, other playable => continue');
}

// 8. 一盘已退役 + 另一盘死局且达标 -> win（双达标）
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: false, score: 2048 }), mockBoard({ moves: false, score: 2500 })],
    [true, false]
  );
  assert(r.action === 'win' && r.reason === 'bothDone', 'retired + dead-qualified => win');
}

// 9. 一盘已退役 + 另一盘死局但总分 < 2048 -> lose
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: false, score: 2048 }), mockBoard({ moves: false, score: 1500 })],
    [true, false]
  );
  assert(r.action === 'lose', 'retired + dead below 2048 => lose');
}

// 10. 有盘出 2048 方块：本函数不判胜，边界由调用方先判（说明性断言）
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: false, score: 3000, max: 2048 }), mockBoard({ moves: false, score: 100, max: 512 })],
    [false, false]
  );
  // 若调用方未先判胜，这里会走到 lose（右盘死局且 < 2048）；上层必须先行 endGame(true)
  assert(r.action !== 'win', 'function does not detect tile-2048 win (caller handles it)');
}

// 11. hardcore 逻辑不在函数内：函数仅休闲语义，无“任一盘死局即负”分支（说明性断言）
{
  const r = resolveCasualOutcome(
    [mockBoard({ moves: false, score: 1000 }), mockBoard({ moves: true, score: 0 })],
    [false, false]
  );
  // 休闲语义下左盘死局且 < 2048 -> lose；硬核的“任一死局即负”由场景内直接判定
  assert(r.action === 'lose', 'casual function does not implement hardcore branch');
}

// ---------- 方案 B：Basic Launch 广告不可用时隐藏「看广告撤销5步」入口 ----------
// （release-checklist §4.2 用户拍板方案 B；纯函数决策，与 Phaser 渲染解耦）
{
  // 显示规则：仅失败窗口显示，且本会话未探测到广告不可投放
  assert(shouldShowRewardAdButton(false, false) === true, 'lose + ads OK => show reward ad button');
  assert(shouldShowRewardAdButton(false, true) === false, 'lose + ads unavailable => hide button (方案 B)');
  assert(shouldShowRewardAdButton(true, false) === false, 'win => never show reward ad button');
  assert(shouldShowRewardAdButton(true, true) === false, 'win + ads unavailable => hide button');

  // 不可用信号：未拿到奖励且广告从未开播 -> 记为不可用；已开播只是玩家取消 -> 不置位
  assert(isAdUnavailableSignal(false, false) === true, 'adError before adStarted => ads unavailable');
  assert(isAdUnavailableSignal(false, true) === false, 'ad started then closed => user cancel, not unavailable');
  assert(isAdUnavailableSignal(true, true) === false, 'ad finished => not unavailable');
  assert(isAdUnavailableSignal(true, false) === false, 'granted without start (no-SDK local fallback) => not unavailable');
}

// ---------- summary ----------
console.log(`\nAssertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
