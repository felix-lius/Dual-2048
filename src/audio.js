// audio.js —— AudioManager：Web Audio API 程序化合成（零外部音频文件）
// 音频圣经 v1.0 §1–§6 落地：所有 SFX + 音乐运行时合成（振荡器 + 增益包络 + 滤波噪声），
// 不引用任何 .mp3/.wav/.ogg，满足离线/自包含约束。
// 所有方法均 no-op-safe：AudioContext 不可用时（构造失败 / 自动播放策略 / Node 单测）一律不抛错。
//
// §6 决策默认值：音乐默认关（musicOn=false）、SFX 默认开、单一持久化静音开关
//   （localStorage 'simultwin.muted'）。详见 game.js create() 里的 §6 注释。

const MUTED_KEY = 'simultwin.muted';
const MUSIC_KEY = 'simultwin.musicOn';

// 安全读取 localStorage（隐私模式 / Node 环境可能抛错或不存在）
function lsGet(k) {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(k);
  } catch (e) { /* 忽略 */ }
  return null;
}
function lsSet(k, v) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
  } catch (e) { /* 忽略（隐私模式不阻塞音频） */ }
}

// C 大调五声音阶（C4 E4 G4 A4 C5）—— 程序化音乐床（audio-bible §1.4）
const MUSIC_SCALE = [261.63, 329.63, 392.0, 440.0, 523.25];

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = lsGet(MUTED_KEY) === '1';
    // §6：音乐默认 OFF（SFX 默认 ON，由总线增益决定）
    this.musicOn = lsGet(MUSIC_KEY) === '1';
    this._musicTimer = null;
    this._musicStep = 0;
    this._adMuted = false; // 广告静音态（与用户 mute 偏好分离，见 muteForAd/unmuteFromAd）
  }

  // 创建 AudioContext + 总线；不自动 resume（受浏览器自动播放策略约束）。
  // 任何失败都降级为 ctx=null（之后所有方法 no-op）。
  init() {
    try {
      if (this.ctx) return; // 幂等
      const Ctx = (typeof window !== 'undefined') &&
        (window.AudioContext || window.webkitAudioContext);
      if (!Ctx) return;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 1;
      master.connect(ctx.destination);

      const musicGain = ctx.createGain();
      musicGain.gain.value = 0.28; // audio-bible §3.2：音乐整体比 SFX 低 ~10–14 dB
      musicGain.connect(master);

      const sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.8; // SFX 子组总线（audio-bible §3.2）
      sfxGain.connect(master);

      // 末端软限幅，防止多音齐发削波（audio-bible §3.2）
      let comp = null;
      try {
        comp = ctx.createDynamicsCompressor();
        master.disconnect();
        master.connect(comp);
        comp.connect(ctx.destination);
      } catch (e) { /* 无 Compressor 则直连 destination（已在上面 connect） */ }

      this.ctx = ctx;
      this.master = master;
      this.musicGain = musicGain;
      this.sfxGain = sfxGain;
      this._comp = comp;
    } catch (e) {
      // 任何异常（环境限制）→ 降级为无声
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
    }
  }

  // 首次用户手势时调用，解锁被挂起的 AudioContext（自动播放策略）。
  // 交付清单 §4.4（iOS）：来电/切后台会把 ctx 打断，state 可能是非标准的 'interrupted'，
  // 回前台后变 'suspended'；两种情况都必须在**真实用户手势**（touchend/pointerup）里 resume()。
  // 因此判定放宽为「只要不是 running 就尝试恢复」，并吞掉 resume() 返回的 rejected Promise
  // （非手势上下文调用时 iOS 会 reject，不能让它冒泡成 unhandledrejection 触发错误横幅）。
  resume() {
    try {
      if (!this.ctx || typeof this.ctx.resume !== 'function') return;
      if (this.ctx.state === 'running') return;
      const p = this.ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => { /* 非手势上下文：静默失败，等下次手势 */ });
    } catch (e) { /* no-op */ }
  }

  // 视频广告合规（video-ads）：广告开始必须立即静音、结束后恢复。
  // 仅压主总线增益，不动音乐/SFX 子组或 this.muted 偏好位。
  muteForAd() {
    try {
      this._adMuted = true;
      if (this.master) this.master.gain.value = 0;
    } catch (e) { /* no-op */ }
  }

  // 广告结束（播完或出错）：恢复主总线增益到「用户偏好」对应值。
  // 若用户在广告期间切过静音，this.muted 已是新值 -> 维持静音，避免打断偏好。
  unmuteFromAd() {
    try {
      this._adMuted = false;
      if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    } catch (e) { /* no-op */ }
  }

  setMuted(b) {
    this.muted = !!b;
    lsSet(MUTED_KEY, this.muted ? '1' : '0');
    if (this._adMuted) return this.muted; // 广告期间保持静音，仅记录偏好
    try {
      if (this.master) this.master.gain.value = this.muted ? 0 : 1;
    } catch (e) { /* no-op */ }
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  isMuted() { return this.muted; }

  // 拆分 SFX / 音乐独立开关（audio-bible §4.1 建议项；仅控制是否允许 startMusic）
  setMusicEnabled(b) {
    this.musicOn = !!b;
    lsSet(MUSIC_KEY, this.musicOn ? '1' : '0');
    return this.musicOn;
  }

  isMusicEnabled() { return this.musicOn; }

  // ---------------- 内部合成原语 ----------------

  _now() {
    try { return this.ctx ? this.ctx.currentTime : 0; }
    catch (e) { return 0; }
  }

  // 单振荡器 + 增益包络（pop / 铃 / 和弦单体）
  // opts: { type, freq, dur, peak, attack, release, glideTo, dest, when }
  _tone(opts) {
    if (!this.ctx) return null;
    try {
      const ctx = this.ctx;
      const now = (opts.when != null) ? opts.when : this._now();
      const dur = opts.dur != null ? opts.dur : 0.18;
      const peak = opts.peak != null ? opts.peak : 0.2;
      const attack = opts.attack != null ? opts.attack : 0.005;
      const release = opts.release != null ? opts.release : Math.max(0.04, dur * 0.6);
      const osc = ctx.createOscillator();
      osc.type = opts.type || 'sine';
      const f = osc.frequency;
      f.setValueAtTime(opts.freq, now);
      if (opts.glideTo) f.exponentialRampToValueAtTime(Math.max(1, opts.glideTo), now + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
      const dest = opts.dest || this.sfxGain || this.master;
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + attack + release + 0.02);
      return { osc, g };
    } catch (e) { return null; }
  }

  // 滤波白噪声瞬态（whoosh / click）
  // opts: { dur, peak, band, q, type, sweepTo, dest }
  _noise(opts) {
    if (!this.ctx) return null;
    try {
      const ctx = this.ctx;
      const now = this._now();
      const dur = opts.dur != null ? opts.dur : 0.15;
      const peak = opts.peak != null ? opts.peak : 0.18;
      const band = opts.band != null ? opts.band : 1000;
      const q = opts.q != null ? opts.q : 1;
      const frames = Math.max(1, Math.floor((ctx.sampleRate || 44100) * dur));
      let buffer;
      try { buffer = ctx.createBuffer(1, frames, ctx.sampleRate || 44100); }
      catch (e) { return null; }
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filt = ctx.createBiquadFilter();
      filt.type = opts.type || 'bandpass';
      filt.frequency.setValueAtTime(band, now);
      if (opts.sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), now + dur);
      filt.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      const dest = opts.dest || this.sfxGain || this.master;
      src.connect(filt);
      filt.connect(g);
      g.connect(dest);
      src.start(now);
      src.stop(now + dur);
      return { src, filt, g };
    } catch (e) { return null; }
  }

  // ---------------- 统一按键音原语 ----------------
  // ITER-V11-001 ③：所有按键（撤销/冻结/重开/再来一局/确认/取消/?/♪等）点击音
  // 与语言切换音统一为一只柔和 triangle 轻 blip，避免按到任何按钮时音色杂乱。
  _playTap() {
    try {
      this._tone({ type: 'triangle', freq: 700, dur: 0.1, peak: 0.12, attack: 0.003, release: 0.09 });
    } catch (e) { /* no-op */ }
  }

  // ---------------- 公共 play ----------------

  // 触发某个 SFX 事件（程序化合成）。event 见 audio-bible §2；未知事件静默忽略。
  play(event, opts) {
    if (!this.ctx) return; // 无 AudioContext：no-op（不抛错）
    opts = opts || {};
    try {
      switch (event) {
        // ITER-V12-001 ①：合并音已去除 —— play('merge') 静默忽略（走 default），不再合成
        case 'swipe': {
          // 轻柔气流「嗖」（soft whoosh）—— v3.0 方案 D。
          // 取代 v2.0 木质嗒（用户否决：不算好听）与 v1.0 玻璃叮（用户否决：太亮太飘）。
          // 用户定调四关键词：运动感 / 简单 / 轻柔 / 不干扰 —— 故只用【单层】带通噪声下扫。
          //
          // 扫频 1800→450Hz：注意包络会在 dur 走完前很久就衰减到听不见，
          // 因此【实际可听】的是 1669→868Hz（约 0.94 个八度、约 58ms），
          // 正好落在 audio-bible §2 #3 规定的 800Hz–1.5kHz 区间内。
          // 下扫 = 物体掠过后远去：① 多普勒物理正确 ② 与衰减包络方向一致（上扫会「越轻越高」
          // 而显得发毛）③ 把余音留在耳朵不敏感的中低频，避开 3–4kHz 刺耳区。
          //
          // q=1.3（≈1.08 个八度）：比原版 0.7 更窄，用来挡住 4kHz 以上的「沙沙」；
          // 远低于会产生哨音的 Q≥4，仍是气声而非哨声。
          // peak=0.038：等效响度比 v2.0 木质嗒低约 14dB（感知只剩 1/2.6），
          // 比 buttonTap 低约 15dB —— 这是每几秒响一次的高频事件，刻意做到「存在但不抢戏」。
          // 三档可调：轻 0.026 / 标准 0.038 / 亮 0.052（只改这一个数，音色不变）。
          //
          // 不加随机抖动：_noise 每次调用都重新生成随机白噪声 buffer，天然每次不同。
          // 注意：_noise 的 dur 才是真实时长；它不支持 when/attack/release（传了会被静默忽略）。
          // 详见 docs/audio/move-sound-spec.md v3.0
          this._noise({ dur: 0.11, peak: 0.038, band: 1800, q: 1.3, sweepTo: 450 });
          break;
        }
        case 'invalidMove': {
          // 失效提示：更轻、更短、平铺直叙（避免先前沉闷感）
          this._tone({ type: 'sine', freq: 320, dur: 0.08, peak: 0.08, attack: 0.003, release: 0.07 });
          break;
        }
        case 'win': {
          // 明亮上行琶音（C E G C E），带微延迟空间感
          const seq = [261.63, 329.63, 392.0, 523.25, 659.25];
          const base = this._now();
          seq.forEach((f, i) => {
            this._tone({ type: 'triangle', freq: f, dur: 0.22, peak: 0.2, attack: 0.005, release: 0.2, when: base + i * 0.11 });
          });
          break;
        }
        case 'lose': {
          // 柔和下行（A F D），低通温暖、不挫败
          const seq = [440.0, 349.23, 293.66];
          const base = this._now();
          seq.forEach((f, i) => {
            this._tone({ type: 'sine', freq: f, dur: 0.32, peak: 0.18, attack: 0.01, release: 0.3, when: base + i * 0.16 });
          });
          break;
        }
        case 'boardRetire': {
          // 温暖「叮 + 轻和弦」（大三度 C–E），区别于 lose
          const base = this._now();
          this._tone({ type: 'triangle', freq: 261.63, dur: 0.3, peak: 0.2, attack: 0.005, release: 0.28, when: base });
          this._tone({ type: 'triangle', freq: 329.63, dur: 0.3, peak: 0.18, attack: 0.005, release: 0.28, when: base + 0.04 });
          break;
        }
        case 'undo': {
          // 轻柔倒带：下行滑音（反向 whoosh 感）
          this._tone({ type: 'sine', freq: 520, glideTo: 300, dur: 0.16, peak: 0.16, attack: 0.004, release: 0.12 });
          break;
        }
        case 'freezeActivate': {
          // 水晶般微光 shimmer：高正弦 + detune 副本 + 短延迟（§3.3）
          const base = this._now();
          const a = this._tone({ type: 'sine', freq: 1200, dur: 0.3, peak: 0.15, attack: 0.005, release: 0.26, when: base });
          if (a && a.osc) {
            try { a.osc.detune.setValueAtTime(8, base); } catch (e) { /* no-op */ }
          }
          this._tone({ type: 'sine', freq: 1200 * 1.5, dur: 0.26, peak: 0.1, attack: 0.005, release: 0.22, when: base + 0.03 });
          break;
        }
        case 'freezeTick': {
          // 极轻高频 blip（读秒感）
          this._tone({ type: 'sine', freq: 1500, dur: 0.03, peak: 0.08, attack: 0.002, release: 0.025 });
          break;
        }
        case 'buttonTap': {
          // ITER-V11-001 ③：所有按键音统一（撤销/冻结/重开/?/♪/Got it/确认/取消 等）
          this._playTap();
          break;
        }
        case 'difficultySwitch': {
          // 双音切换（700→560Hz），三角波简易上行与下行——区别于 buttonTap 但仍轻快
          const base = this._now();
          this._tone({ type: 'triangle', freq: 700, dur: 0.09, peak: 0.14, attack: 0.004, release: 0.08, when: base });
          this._tone({ type: 'triangle', freq: 560, dur: 0.09, peak: 0.14, attack: 0.004, release: 0.08, when: base + 0.07 });
          break;
        }
        case 'languageSwitch': {
          // 与 buttonTap 共用同一音色（用户决策 ITER-V11-001 ③「统一按键音」）
          this._playTap();
          break;
        }
        case 'tutorialOpen': {
          // 友好「噗开」：上行两音 + 空气感
          const base = this._now();
          this._tone({ type: 'sine', freq: 440, glideTo: 660, dur: 0.2, peak: 0.14, attack: 0.005, release: 0.18, when: base });
          this._noise({ dur: 0.18, peak: 0.05, band: 900, q: 0.7, sweepTo: 1600 });
          break;
        }
        case 'newBest': {
          // 明亮单铃 ding（庆祝，区别于普通计分）
          this._tone({ type: 'triangle', freq: 1046.5, dur: 0.4, peak: 0.18, attack: 0.004, release: 0.36 });
          break;
        }
        default:
          // 未知事件：静默忽略（不抛错）
          break;
      }
    } catch (e) { /* 任何合成异常都不应影响游戏 */ }
  }

  // ---------------- 程序化音乐 ----------------

  // 启动轻量 C/G 五声循环（triangle 铃 + sine pad）。默认仅在 musicOn 时允许。
  startMusic() {
    try {
      if (!this.ctx || this.musicOn === false) return;
      if (this._musicTimer) return; // 已在播放
      this._musicStep = 0;
      const stepMs = 380; // ~节奏松弛（audio-bible §1.1 88–108 BPM 区间取慢端）
      const tick = () => {
        try {
          if (!this.ctx) return;
          const i = this._musicStep % MUSIC_SCALE.length;
          const freq = MUSIC_SCALE[i];
          // 铃：三角波 + 低通感（用较低 peak + sine pad 叠暖底）
          this._tone({ type: 'triangle', freq, dur: 0.5, peak: 0.16, attack: 0.01, release: 0.45, dest: this.musicGain || this.sfxGain || this.master });
          // 每两步叠一次 pad 根音（长 release）
          if (this._musicStep % 2 === 0) {
            this._tone({ type: 'sine', freq: freq / 2, dur: 0.9, peak: 0.1, attack: 0.02, release: 0.85, dest: this.musicGain || this.sfxGain || this.master });
          }
          this._musicStep++;
        } catch (e) { /* 单次调度失败不影响循环 */ }
      };
      tick();
      this._musicTimer = (typeof setInterval !== 'undefined') ? setInterval(tick, stepMs) : null;
    } catch (e) { /* no-op */ }
  }

  stopMusic() {
    try {
      if (this._musicTimer && typeof clearInterval !== 'undefined') {
        clearInterval(this._musicTimer);
      }
      this._musicTimer = null;
    } catch (e) { /* no-op */ }
  }

  // 广告起止：压低 / 恢复音乐（audio-bible §1.3；adStart 阶段 2 接回）
  duckMusic(level) {
    try {
      if (this.musicGain) {
        const v = level != null ? level : 0.1;
        this.musicGain.gain.value = v;
      }
    } catch (e) { /* no-op */ }
  }
}

// 全局单例（game.js / ui.js 直接 import 此实例）
export const Audio = new AudioManager();
