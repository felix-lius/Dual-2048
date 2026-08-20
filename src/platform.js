// platform.js —— 可选的平台集成适配层（带环境守卫，缺平台时静默 no-op）
// ─────────────────────────────────────────────────────────────────────────────
// 这是一个**可选**的集成接缝：游戏本身零依赖、纯静态，不依赖任何外部平台。
// 若宿主页面在全局注入了 `window.__GAME_PLATFORM__ = { SDK: <instance> }`，
// 本适配层会抓取该实例并就绪后上报加载/生命周期事件、处理激励视频请求。
// 若没有任何平台对象（本地开发、自托管、GitHub Pages 等），所有方法一律静默 no-op，
// 绝不抛错，游戏照常完整可玩。
//
// 公开方法（被 game.js / main.js 调用）：
//   init / ready / loadingStart / loadingStop / onGamePlay / happyTime / pause / resume /
//   requestRewardedAd / requestMidgameAd
// 保留旧调用方兼容别名：gameStarted / gameLoaded / requestAd

// 视频广告合规：广告起止需静音/恢复（audio.js 的 muteForAd/unmuteFromAd）。
// audio.js 不反向 import 本文件，无循环依赖；Node 单测下 Audio 为 ctx=null 的 no-op 单例，安全。
import { Audio } from './audio.js';

export class PlatformAdapter {
  constructor() {
    this.sdk = null;
    this._ready = false;        // SDK.init() 是否已完成（无 init 方法的桩视为立即就绪）
    this._readyPromise = null;  // 记忆化的就绪 Promise（同时充当事件排队队列）
    this._gamePlayed = false;   // onGamePlay 仅首次生效
    this._lastHappy = 0;        // happyTime 节流时间戳
    this._happyInterval = 3000; // 至少 3s 一次
    this._paused = false;       // 防止 blur/focus 与 visibilitychange 双暂停
    // 最近一次广告请求是否真正开始播放（adStarted 回调）。
    this.lastAdStarted = false;
    // 最近一次广告请求的错误（adError 回调传入；用于排查/日志，不影响语义）。
    this.lastAdError = null;
  }

  // 抓取平台 SDK 实例；缺失则 sdk=null（后续所有方法静默 no-op）。可重复调用（幂等补抓）。
  init() {
    try {
      if (typeof window !== 'undefined') {
        const plat = window.__GAME_PLATFORM__;
        if (plat && plat.SDK) {
          this.sdk = (typeof plat.SDK.getInstance === 'function') ? plat.SDK.getInstance() : plat.SDK;
        }
      }
    } catch (e) {
      this.sdk = null;
    }
    if (this.sdk) this.ready(); // 立即触发一次 SDK.init()（不阻塞调用方）
    return this.sdk != null;
  }

  // 记忆化就绪：resolve(true) 表示 SDK 可用，resolve(false) 表示无 SDK 或 init 失败。永不 reject。
  ready() {
    if (this._readyPromise) return this._readyPromise;
    if (!this.sdk) {
      this._readyPromise = Promise.resolve(false);
      return this._readyPromise;
    }
    let p;
    try {
      if (typeof this.sdk.init === 'function') {
        p = Promise.resolve(this.sdk.init());
      } else {
        this._ready = true; // 旧版 / 测试桩：无 init，视为就绪（同步，保持调用链同步语义）
        p = Promise.resolve();
      }
    } catch (e) {
      p = Promise.resolve().then(() => { throw e; });
    }
    this._readyPromise = p
      .then(() => { this._ready = true; return true; })
      .catch(() => { this._ready = false; return false; });
    return this._readyPromise;
  }

  // 统一 game.* 调用出口：就绪则同步调用；未就绪则排队到 SDK.init() 完成后按原序补发。
  _game(fn) {
    try {
      if (!this.sdk) return;
      const p = this.ready();
      if (this._ready) { this._invokeGame(fn); return; }
      p.then((ok) => { if (ok) this._invokeGame(fn); });
    } catch (e) { /* 静默 */ }
  }

  _invokeGame(fn) {
    try {
      const g = this.sdk && this.sdk.game; // 未就绪时访问可能抛错 -> 被捕获
      if (g) fn(g);
    } catch (e) { /* 静默 */ }
  }

  // 加载开始：进入 loading 屏时调用
  loadingStart() {
    this._game((g) => { if (typeof g.loadingStart === 'function') g.loadingStart(); });
  }

  // 加载完成：首屏棋盘就绪后调用
  loadingStop() {
    this._game((g) => { if (typeof g.loadingStop === 'function') g.loadingStop(); });
  }

  // 游戏正式开始（玩家进入可玩状态）：仅首次调用有效。
  onGamePlay() {
    if (this._gamePlayed) return;
    this._gamePlayed = true;
    this._game((g) => { if (typeof g.gameplayStart === 'function') g.gameplayStart(); });
  }

  // 正向时刻（合并 / 得分）：内部节流到每 ~3s 至多一次，避免刷屏。
  happyTime() {
    try {
      const now = (typeof Date !== 'undefined') ? Date.now() : 0;
      if (now - this._lastHappy < this._happyInterval) return;
      this._lastHappy = now;
    } catch (e) { return; }
    this._game((g) => { if (typeof g.happytime === 'function') g.happytime(); });
  }

  // 暂停（失焦 / 切后台）：gameplayStop
  pause() {
    if (this._paused) return;
    this._paused = true;
    this._game((g) => { if (typeof g.gameplayStop === 'function') g.gameplayStop(); });
  }

  // 恢复（聚焦 / 回到前台）：gameplayStart（仅当确实暂停过才触发，避免双调用）
  resume() {
    if (!this._paused) return;
    this._paused = false;
    this._game((g) => { if (typeof g.gameplayStart === 'function') g.gameplayStart(); });
  }

  // 激励视频：看完 -> true（发放奖励）；不可用 / 关闭 -> false
  requestRewardedAd() {
    return this._requestAd('rewarded');
  }

  // 中场广告：看完 -> true；不可用 / 关闭 -> false（无 SDK 时解析为 false）
  requestMidgameAd() {
    return this._requestAd('midgame');
  }

  // 统一广告请求（永不 reject，永不同步抛错）：
  //   · 完全无平台（本地/离线开发）  -> rewarded 解析 true（可继续测试）、midgame 解析 false；
  //   · 有平台但 init 失败           -> 一律 false（绝不白送奖励）；
  //   · 有平台且就绪                -> 回调式请求，adFinished=true / adError=false。
  _requestAd(type) {
    try {
      if (!this.sdk) return Promise.resolve(type === 'rewarded');
      if (this._ready) return this._doRequestAd(type);
      return this.ready().then((ok) => (ok ? this._doRequestAd(type) : false));
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  // 回调式广告请求，自行包成 Promise 供调用方 await。
  _doRequestAd(type) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      this.lastAdStarted = false;
      try {
        const ad = this.sdk && this.sdk.ad; // 属性访问本身可能抛错 -> 被下方 catch 兜住
        if (!ad || typeof ad.requestAd !== 'function') { done(false); return; }
        ad.requestAd(type, {
          // 广告开始播放：立即静音（video-ads 合规硬性要求）
          adStarted: () => { this.lastAdStarted = true; try { Audio.muteForAd(); } catch (e) {} },
          // 广告播完：恢复声音并发放奖励
          adFinished: () => { try { Audio.unmuteFromAd(); } catch (e) {} done(true); },
          // 广告出错：恢复声音（不发放奖励），记录错误
          adError: (err) => { this.lastAdError = err; try { Audio.unmuteFromAd(); } catch (e) {} done(false); },
        });
      } catch (e) {
        done(false);
      }
    });
  }

  // ---------- 兼容旧调用方（game.js 既有引用） ----------
  // 旧语义“gameStarted”= loading 完成即开始：映射到 loadingStop + 首次 onGamePlay
  gameStarted() {
    this.loadingStop();
    this.onGamePlay();
  }
  // 旧语义“gameLoaded”= loading 完成
  gameLoaded() {
    this.loadingStop();
  }
  // 旧 requestAd(type) 转发到新分流（rewarded / midgame）
  requestAd(type = 'rewarded') {
    if (type === 'midgame') return this.requestMidgameAd();
    return this.requestRewardedAd();
  }
}

// 全局单例：game.js / main.js 均 import { Platform } 直接使用
export const Platform = new PlatformAdapter();
