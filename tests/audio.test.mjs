// 最小 Node 断言：AudioManager（audio-bible §1–§6 程序化合成）自检。
// 运行：node tests/audio.test.mjs
// 覆盖：
//   A) 无 AudioContext（无 window）时所有公共方法 no-op 且不抛错；
//   B) 注入 mock AudioContext 后 init() 建立总线、play() 各事件合成且不抛错、节点被创建；
//   C) 静音开关持久化到 localStorage（simultwin.muted）；
//   D) 未知事件 / 缺参 play 不抛错。
import { AudioManager, Audio } from '../src/audio.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

// ---------- 简易 localStorage 桩（部分环境缺失） ----------
global.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

// ---------- 最小 mock AudioContext ----------
function makeMockAudioContext() {
  const counters = { osc: 0, gain: 0, filter: 0, buffer: 0, source: 0, delay: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
  });
  function MockNode(type) {
    this.type = type || '';
    this.frequency = param();
    this.gain = param();
    this.detune = param();
    this.Q = param();
    this.buffer = null;
  }
  MockNode.prototype.connect = function () { return this; };
  MockNode.prototype.disconnect = function () { return this; };
  MockNode.prototype.start = function () {};
  MockNode.prototype.stop = function () {};

  const ctx = {
    state: 'suspended',
    currentTime: 0,
    sampleRate: 44100,
    destination: new MockNode('dest'),
    _counters: counters,
    createOscillator() { counters.osc++; return new MockNode('osc'); },
    createGain() { counters.gain++; return new MockNode('gain'); },
    createBiquadFilter() { counters.filter++; return new MockNode('filter'); },
    createDelay() { counters.delay++; return new MockNode('delay'); },
    createBufferSource() { counters.source++; const n = new MockNode('src'); return n; },
    createBuffer(ch, frames) { counters.buffer++; return { getChannelData() { return new Float32Array(frames); } }; },
    createDynamicsCompressor() { counters.filter++; return new MockNode('comp'); },
    resume() { this.state = 'running'; return Promise.resolve(); },
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
  };
  return ctx;
}

// 所有需支持的 SFX 事件（audio-bible §2）
const ALL_EVENTS = [
  'merge', 'swipe', 'invalidMove', 'win', 'lose', 'boardRetire',
  'undo', 'freezeActivate', 'freezeTick', 'buttonTap',
  'difficultySwitch', 'languageSwitch', 'tutorialOpen', 'newBest',
];

// ---------- A) 无 AudioContext：所有方法 no-op 且不抛错 ----------
{
  // 确保 window 不存在（AudioContext 不可用）→ ctx 保持 null
  delete global.window;
  let threw = false;
  let m;
  try {
    m = new AudioManager();
    m.init();                 // 无 ctx，应降级为 null，不抛
    assert(m.ctx === null, 'A: init() with no AudioContext leaves ctx=null');
    // 逐个事件 play，均不应抛错
    for (const ev of ALL_EVENTS) m.play(ev, { tier: 2 });
    m.play('merge');          // 缺 opts 也不抛
    m.play('unknownEvent');   // 未知事件静默忽略
    m.resume();
    m.setMuted(true);
    assert(m.isMuted() === true, 'A: setMuted(true) flips muted on');
    m.setMuted(false);
    assert(m.isMuted() === false, 'A: setMuted(false) flips muted off');
    const beforeToggle = m.isMuted();
    m.toggleMute();
    assert(m.isMuted() !== beforeToggle, 'A: toggleMute flips muted state');
    m.setMusicEnabled(true);
    m.setMusicEnabled(false);
    m.duckMusic(0.1);
    m.startMusic();           // musicOn=false → 直接返回，无 timer
    m.stopMusic();
    assert(typeof m.isMusicEnabled() === 'boolean', 'A: isMusicEnabled returns boolean');
  } catch (e) {
    threw = true;
    console.error('FAIL: A threw: ' + (e && e.message));
  }
  assert(!threw, 'A: all AudioManager methods no-op-safe without AudioContext');
  assert(typeof Audio === 'object' && Audio !== null, 'A: exported singleton Audio exists');
  assert(typeof Audio.play === 'function', 'A: Audio.play is a function');
}

// ---------- B) mock AudioContext：init + 各事件合成 + 节点创建 ----------
{
  const ctx = makeMockAudioContext();
  global.window = { AudioContext: function () { return ctx; } };
  let threw = false;
  let m;
  try {
    m = new AudioManager();
    m.init();
    assert(m.ctx === ctx, 'B: init() builds ctx from mock AudioContext');
    assert(m.master && m.sfxGain && m.musicGain, 'B: master/sfxGain/musicGain buses created');
    const before = ctx._counters.osc;
    for (const ev of ALL_EVENTS) m.play(ev, { tier: 1 });
    const after = ctx._counters.osc;
    assert(after > before, 'B: playing events creates oscillator nodes (synthesis ran)');
    // 音乐：开启后启动一个循环调度并立即停止（不留 pending timer）
    m.setMusicEnabled(true);
    m.startMusic();
    assert(m._musicTimer !== null, 'B: startMusic sets a loop timer when musicOn');
    m.stopMusic();
    assert(m._musicTimer === null, 'B: stopMusic clears the loop timer');
    // resume 切换 state
    m.resume();
    assert(ctx.state === 'running', 'B: resume() unlocks suspended ctx');
  } catch (e) {
    threw = true;
    console.error('FAIL: B threw: ' + (e && e.message));
  }
  assert(!threw, 'B: AudioManager works against a mock AudioContext without throwing');
}

// ---------- C) 静音开关持久化 ----------
{
  delete global.window;
  global.localStorage.removeItem('simultwin.muted');
  const m = new AudioManager();
  assert(m.isMuted() === false, 'C: default unmuted');
  m.setMuted(true);
  assert(global.localStorage.getItem('simultwin.muted') === '1', 'C: setMuted(true) persists simultwin.muted=1');
  assert(m.isMuted() === true, 'C: isMuted true after setMuted(true)');
  m.toggleMute();
  assert(global.localStorage.getItem('simultwin.muted') === '0', 'C: toggleMute persists simultwin.muted=0');
  assert(m.isMuted() === false, 'C: isMuted false after toggle');
  // 重新构造应从 localStorage 读取（= false）
  const m2 = new AudioManager();
  assert(m2.isMuted() === false, 'C: new instance reads persisted mute=false');
}

// ---------- D) 未知事件 / 缺参 ----------
{
  delete global.window;
  let threw = false;
  try {
    const m = new AudioManager();
    m.play();            // 缺事件名
    m.play('nope');      // 未知事件
    m.play('merge', {}); // 缺 tier
  } catch (e) {
    threw = true;
    console.error('FAIL: D threw: ' + (e && e.message));
  }
  assert(!threw, 'D: play() tolerates missing/unknown events and missing opts');
}

// ---------- summary ----------
console.log(`\nAudio assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
