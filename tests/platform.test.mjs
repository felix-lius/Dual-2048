// platform.test.mjs —— PlatformAdapter 自检（无 Phaser 依赖）
// 运行：node tests/platform.test.mjs
//
// 适配层是一个**可选**的集成接缝：本游戏零外部依赖，纯静态。
// 只有当宿主页面注入了 window.__GAME_PLATFORM__ = { SDK: <instance> } 时才会真正上报事件 / 处理广告；
// 否则所有方法一律静默 no-op，游戏照常完整可玩。
//
// 校验要点：
//   1) 无平台对象：所有公开方法都不抛错（静默 no-op）；
//      requestRewardedAd 解析 true（本地测试可继续）、requestMidgameAd 解析 false；
//      旧别名 requestAd('rewarded'|'midgame') 同样解析 true/false。
//   2) 注入通用假平台 SDK（含 init() / game.* / 回调式 ad.requestAd）：
//      init 抓取正确实例；SDK.init() 完成前发出的事件不丢失（排队补发）；
//      onGamePlay -> gameplayStart、happytime 节流、pause/resume 防双调用；
//      requestAd 以 (type, {adStarted, adFinished, adError}) 回调式调用，
//      adFinished -> true、adError -> false。
//   3) 未就绪防护：访问 sdk.ad / sdk.game 抛错不得逸出，广告解析 false。
//   4) SDK.init() 失败：广告一律 false。

import { PlatformAdapter } from '../src/platform.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

// ---------- 1) 无平台对象：no-op 安全性 ----------
{
  const a = new PlatformAdapter();
  a.init(); // window 未定义 -> sdk=null
  assert(a.sdk === null, 'no platform: init() leaves sdk null');

  let threw = false;
  try {
    a.loadingStart();
    a.loadingStop();
    a.onGamePlay();
    a.happyTime();
    a.pause();
    a.resume();
    a.onGamePlay(); // 重复调用也不应抛
    a.onGamePlay();
  } catch (e) {
    threw = true;
    console.error('FAIL: threw on no-op call: ' + e.message);
  }
  assert(!threw, 'no platform: loadingStart/stop/onGamePlay/happyTime/pause/resume do not throw');

  // 广告：缺失平台时 rewarded 解析 true（本地测试可继续），midgame 解析 false
  const rw = await a.requestRewardedAd();
  const mid = await a.requestMidgameAd();
  assert(rw === true, 'no platform: requestRewardedAd resolves true');
  assert(mid === false, 'no platform: requestMidgameAd resolves false');

  // 旧别名兼容
  const r1 = await a.requestAd('rewarded');
  const r2 = await a.requestAd('midgame');
  assert(r1 === true, 'no platform: requestAd("rewarded") alias resolves true');
  assert(r2 === false, 'no platform: requestAd("midgame") alias resolves false');

  assert((await a.ready()) === false, 'no platform: ready() resolves false');
}

// ---------- 2) 注入通用假平台 SDK：挂载点 / 事件排队 / 回调式广告 ----------
{
  const calls = [];
  let adCallbackShapeOk = false;
  let initCount = 0;
  const fakeSdk = {
    // 必须先 await SDK.init() 才能访问 game / ad
    init: () => { initCount++; return Promise.resolve(); },
    game: {
      loadingStart: () => calls.push('loadingStart'),
      loadingStop: () => calls.push('loadingStop'),
      gameplayStart: () => calls.push('gameplayStart'),
      gameplayStop: () => calls.push('gameplayStop'),
      happytime: () => calls.push('happytime'),
    },
    ad: {
      // 回调式：返回 undefined（旧 Promise 包法会立即 resolve true）
      requestAd: (type, cbs) => {
        calls.push('requestAd:' + type);
        adCallbackShapeOk = !!cbs &&
          typeof cbs.adStarted === 'function' &&
          typeof cbs.adFinished === 'function' &&
          typeof cbs.adError === 'function';
        if (type === 'rewarded') {
          cbs.adStarted();
          cbs.adFinished();
        } else {
          cbs.adError('adNotAvailable');
        }
        return undefined;
      },
    },
  };
  globalThis.window = { __GAME_PLATFORM__: { SDK: fakeSdk } };

  const a = new PlatformAdapter();
  const inited = a.init();
  assert(inited === true, 'fake SDK: init() returns true');
  assert(a.sdk === fakeSdk, 'fake SDK: init() grabs window.__GAME_PLATFORM__.SDK');

  // SDK.init() 尚未 resolve —— 此刻发出的事件必须排队而非丢弃
  a.loadingStart();
  a.onGamePlay();
  assert(calls.length === 0, 'fake SDK: events issued before SDK.init() resolves are queued, not lost');

  const ok = await a.ready();
  assert(ok === true, 'fake SDK: ready() resolves true after SDK.init()');
  assert(initCount === 1, 'fake SDK: SDK.init() called exactly once (memoized)');
  assert(calls[0] === 'loadingStart' && calls[1] === 'gameplayStart',
    'fake SDK: queued events replay in original order (loadingStart -> gameplayStart)');

  a.loadingStop();
  a.happyTime(); // 第一次：触发
  a.happyTime(); // 3s 内：应被节流跳过
  a.pause();
  a.pause();     // 已暂停：应跳过（不重复 gameplayStop）
  a.resume();
  a.resume();    // 已恢复：应跳过（不重复 gameplayStart）
  a.onGamePlay(); // 因已 _gamePlayed，不再触发 gameplayStart

  const rw = await a.requestRewardedAd();
  const startedAfterRewarded = a.lastAdStarted;
  const mid = await a.requestMidgameAd();
  const startedAfterMidgame = a.lastAdStarted;

  assert(calls.includes('loadingStart'), 'fake SDK: loadingStart called');
  assert(calls.includes('loadingStop'), 'fake SDK: loadingStop called');
  assert(calls.filter((c) => c === 'gameplayStart').length === 2,
    'fake SDK: gameplayStart called twice (onGamePlay once + resume once)');
  assert(calls.filter((c) => c === 'happytime').length === 1,
    'fake SDK: happytime throttled to once within 3s');
  assert(calls.filter((c) => c === 'gameplayStop').length === 1,
    'fake SDK: gameplayStop called once (pause guard)');
  assert(calls.includes('requestAd:rewarded'), 'fake SDK: requestAd("rewarded") called');
  assert(calls.includes('requestAd:midgame'), 'fake SDK: requestAd("midgame") called');
  assert(adCallbackShapeOk, 'fake SDK: requestAd receives {adStarted, adFinished, adError} callbacks');
  assert(rw === true, 'fake SDK: rewarded resolves true on adFinished');
  assert(mid === false, 'fake SDK: midgame resolves false on adError');
  assert(startedAfterRewarded === true, 'fake SDK: lastAdStarted true after adStarted fired');
  assert(startedAfterMidgame === false, 'fake SDK: lastAdStarted false when ad never started (adError)');

  globalThis.window = undefined;
}

// ---------- 3) 未就绪防护：访问 sdk.ad / sdk.game 抛错不得逸出 ----------
{
  const throwing = {
    init: () => Promise.resolve(),
    get game() { throw new Error('sdkNotInitialized'); },
    get ad() { throw new Error('sdkNotInitialized'); },
  };
  globalThis.window = { __GAME_PLATFORM__: { SDK: throwing } };

  const a = new PlatformAdapter();
  a.init();
  await a.ready();

  let threw = false;
  try {
    a.loadingStart();
    a.onGamePlay();
    a.happyTime();
    a.pause();
    a.resume();
  } catch (e) { threw = true; }
  assert(!threw, 'sdkNotInitialized: game.* access errors are swallowed (no throw escapes)');

  let adThrew = false;
  let adResult = null;
  try {
    adResult = await a.requestRewardedAd();
  } catch (e) { adThrew = true; }
  assert(!adThrew, 'sdkNotInitialized: requestRewardedAd does not reject/throw');
  assert(adResult === false, 'sdkNotInitialized: requestRewardedAd resolves false (no free reward)');

  globalThis.window = undefined;
}

// ---------- 4) SDK.init() 失败：广告一律 false ----------
{
  const failing = {
    init: () => Promise.reject(new Error('sdk init failed')),
    game: { gameplayStart: () => { throw new Error('should not be called'); } },
    ad: { requestAd: () => { throw new Error('should not be called'); } },
  };
  globalThis.window = { __GAME_PLATFORM__: { SDK: failing } };

  const a = new PlatformAdapter();
  a.init();
  const ok = await a.ready();
  assert(ok === false, 'init failure: ready() resolves false');

  let threw = false;
  try { a.onGamePlay(); a.loadingStart(); } catch (e) { threw = true; }
  assert(!threw, 'init failure: game events silently dropped without throwing');

  const rw = await a.requestRewardedAd();
  assert(rw === false, 'init failure: rewarded resolves false (never grants reward without a working SDK)');

  globalThis.window = undefined;
}

console.log(`\nPlatform assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
