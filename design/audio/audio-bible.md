# 《双倍 2048：双重挑战》音频圣经（Audio Bible）v1.0

| 项 | 内容 |
| --- | --- |
| 文档标题 | 《双倍 2048：双重挑战》音频圣经（Audio Bible） |
| 版本 | v1.0（草案，待用户评审拍板） |
| 日期 | 2026-08-07 |
| 作者 / 角色 | 阮和鸣（audio-director：音频方向 / 音效设计 / 实现策略 / 配音方向） |
| 关联文档 | `design/gdd/dual-2048-gdd.md` v1.0（GDD v1.1 当前不存在，本版以其 v1.0 为准）；`design/art/art-bible.md` v1.0（视觉身份） |
| 受众 | 团队（含程基岩落地）+ 用户评审；用户无技术背景，术语均给通俗解释 |
| 硬约束 | **零外部音频文件、可离线运行**；沙箱无外网，游戏包自包含 |

---

## 0. 使用说明

1. 这是一份**听觉/音频规范说明书**，不是代码。工程（程基岩）按本文档的事件表、混音参数、API 草图落地到 Web Audio。
2. 本文档与 Art Bible v1.0 **无冲突**，听觉身份对齐其视觉身份（奶油→蜜桃渐变 / 卡通圆润 / calm-but-playful）。
3. **核心结论（见 §3）**：音频全部用 **Web Audio API 程序化合成（振荡器 + 短包络 / 滤波噪声）** 实现，游戏**不需要任何外部音频文件**，完全离线可运行。
4. 文中「主推」= 我的专业建议；「备选」= 另一条可行路线。**凡是标了「待拍板」的，都需要用户/主理人确认后再实施。**

---

## 1. 音乐方向（Music Direction）

### 1.1 情绪定位（一句话）
> **「甜甜的糖、暖暖的光，轻轻摇摆不抢戏」——温暖、卡通、略微上扬，但绝不喧宾夺主，让玩家能安静思考。**

对齐 Art Bible 的视觉情绪（奶油白→蜜桃粉、圆润糖果感、calm-but-playful）。音频应当像「背景里一杯温奶茶的气泡声」，而非舞台 BGM。

| 维度 | 主推建议 | 说明（通俗解释） |
| --- | --- | --- |
| 整体情绪 | 温暖、轻快、略带俏皮；**非 distracting**（不分散注意力） | 思考型益智游戏，音乐必须退到背景 |
| 调性（Key） | **C 大调 / G 大调**，偏好五声音阶（pentatonic） | 五声音阶怎么弹都好听、不刺耳，契合卡通甜味 |
| 速度（Tempo） | **88–108 BPM**（松弛、不赶） | 太快车让人紧张，太慢显沉闷 |
| 配器音色 | 柔和三角波 / 正弦「铃铛 + 垫底 pad」+ 极轻的木鱼/沙锤 | 像八音盒 + 暖垫，不用真乐器采样 |
| 动态范围 | 低；音乐整体比 SFX 低 ~10–14 dB | 音乐是「氛围」，反馈音才是「信号」 |

### 1.2 循环 vs 自适应（Loop vs Adaptive）
- **主推：短循环 + 轻自适应分层（loop + light adaptive layering）。**
  - 一段 **8–16 秒** 无缝循环的轻旋律/分解和弦床（程序化生成，见 §3.3）。
  - **自适应分层（可选，第二阶段再做）**：当总分跨过阈值（如 0 / 2000 / 8000）时，渐入一层更亮的 arpeggio 或轻打击，给「越玩越燃」的微妙推进，但始终克制。
- **备选**：纯静态单循环，不做分层（最简单、最稳，首版足够）。

### 1.3 不同场景的 BGM 行为
| 场景 | BGM 行为 | 说明 |
| --- | --- | --- |
| 菜单 / 开始 | 略亮一点的菜单小调（可用同一套材料的变体） | 让人放松进入 |
| 对局进行中（active play） | 低音量氛围床（musicGain ≈ 0.25–0.30） | 不压过思考 |
| 胜利（win） | **短促明亮 stinger**（约 1.2–1.8s，渐出），BGM 可短暂让位 | 见 §2 `win` 事件 |
| 失败（lose） | **柔和下行 stinger**（约 1.5–2.0s），BGM 渐弱后维持低音量 | 见 §2 `lose` 事件 |
| 广告播放中（adStart→adEnd） | BGM **duck（压低）或暂停**，adEnd 后恢复 | 避免与广告音频打架 |

### 1.4 程序化音乐（Procedural Music）建议
由于本作零文件，音乐也**建议程序化生成**（非必须，但最契合约束）：
- 用一组预定义音符序列（C 大调五声音阶，如 `C4 E4 G4 A4 C5`）做随机/顺序分解 arpeggio；
- 每个音符 = 三角波振荡器 + 短 attack（5–10ms）/ 中等 release（200–400ms）+ 低通滤波（~2kHz）；
- 叠一层正弦 pad（长 release）做暖底；
- 用 `setInterval` / `AudioContext.currentTime` 调度，循环长度对齐音符数（无缝）。

---

## 2. 音效事件表（SFX Event Table）

> 触发条件列对应 `src/` 中的确切代码位置（详见 §5 集成注）。优先级：**must** = 必备；**optional** = 锦上添花（可后补）。
> 所有 SFX 默认程序化合成，**时长 0.05–0.4s**，**单事件峰值增益低**（见 §3.2 总线）。

| # | 事件名（event key） | 触发条件（代码位置） | 期望音色（desired character） | 优先级 | 实现提示（程序化合成） |
| --- | --- | --- | --- | --- | --- |
| 1 | `merge` | `board.js move()` 合并发生；`game.js handleMove()` 在渲染前统计本回合合并 | **软「啵」pop，音高随方块值升高**（值越大越亮越高） | must | 正弦/三角振荡器，基频按合并后数值分档（见 §2.1），3ms attack + 90–140ms decay，轻微上滑音（pitch glide）；可叠 5ms 极短噪声瞬态增加「触感」。2048 合并额外触发 `win` stinger |
| 2 | `tileSpawn` | `board.js addRandomTile()`（仅有效移动的盘生成新块） | **轻柔「噗」**，比 merge 更弱、更短 | optional* | 正弦 ~ 播放，基频随新块值（2/4）轻微不同；低增益（≈merge 的 50%）；*注：原任务清单未列，但新块出现是核心反馈，主推补上，待拍板 |
| 3 | `swipe` | `game.js handleMove()` 判定 `anyMoved` 后（有效移动） | **微妙 whoosh（风声）**，方向无关、很轻 | must | 白噪声 → 带通滤波（~800Hz–1.5kHz），120–200ms，向下扫频，低增益；不抢戏 |
| 4 | `invalidMove` | `game.js handleMove()` 第 651 行 `if (!anyMoved) return;` | **低沉闷响 / 轻柔「不行」**，很短 | optional | 正弦 ~120Hz + 快速 80ms decay，低增益；或两音小二度「nope」。*太频繁会烦，主推做得很轻或默认关 |
| 5 | `win` | `game.js endGame(true)`（含 `bothDone`） | **明亮上行琶音**（大调五声，带微光） | must | 4–5 个三角/正弦「铃」音阶进（如 C E G C E），每音 60–90ms，叠短延迟做空间感；~1.2–1.8s |
| 6 | `lose` | `game.js endGame(false)` | **柔和下行音**（轻轻收尾，不悲伤） | must | 3 音下行（如 A F D）正弦/三角 + 低通，release 300–500ms；温和、不挫败 |
| 7 | `boardRetire` | `game.js resolveCasualOutcome()` 返回 `retire` → `showRetired()` + Toast | **温暖「叮 + 轻和弦」**（达标而非失败） | must | 两音大三度铃（如 C–E），暖、肯定；区别于 `lose` |
| 8 | `undo` | `game.js onUndoClick()` 成功 `undo.undo()` 返回快照 | **轻柔倒带 / 回退「boop」** | must | 短下行滑音（反向 whoosh）150ms 低增益；或柔和双音 |
| 9 | `freezeActivate` | `game.js handleTap()` → `freeze.applyTo(i)` 成功锁盘 | **水晶般微光 shimmer** | must | 高正弦 + 轻微失谐泛音，快 attack，短延迟做微颤（vibrato/shimmer），200–300ms |
| 10 | `freezeTick` | `game.js handleMove()` → `freeze.tick()` 冻结盘步数 -1（每次有效移动） | **极轻 tick**（每步一下） | optional | 极短高频 blip（正弦 ~1500Hz，25ms）低增益；随冻结步数递减给「读秒」感 |
| 11 | `freezeBonus` | `game.js handleMove()` → `freeze.checkBonus(total)` 返回 gained>0 | **正向小铃**（得分奖励 +1 冻结） | optional | 单/双音上行铃（如 E–G），与 `boardRetire` 区分；配合 Toast |
| 12 | `buttonTap` | `ui.js Button` 的 `onClick`（撤销/冻结/重开/再来一局等） | **tiny click（小点击）**，一致、短 | must | 短噪声 click + 微小正弦 thump，20–30ms，中低增益；全按钮统一 |
| 13 | `difficultySwitch` | `ui.js SegToggle`（modeToggle）`onChange` 切换硬核/休闲 | **双音切换（上/下对）** | must | 快速两音（如 600→500Hz）各 60ms；明确「模式变了」 |
| 14 | `languageSwitch` | `ui.js SegToggle`（langToggle）`onChange` 切换中/EN | **单/双音轻 blip**，与难度不同音高 | must | 用区别于 `difficultySwitch` 的音高（如 700Hz 软单音或反向对）；避免两切换听感雷同 |
| 15 | `tutorialOpen` | 「怎么玩」覆盖层打开（GDD §7，原型未实现） | **友好「噗开」**（上行两音 + 空气感） | optional* | *原型无教程，列为未来事件；若上「怎么玩」必须配，待阶段 1 实现 |
| 16 | `adStart` | `src/integration.js requestAd('rewarded')` 真实接入时（当前为桩） | **柔和「进场」cue**（暖低音 / whoosh in） | must* | *真实广告接回阶段（阶段 2）再做；提示「广告开始」，并把 BGM duck |
| 17 | `adEnd` | 广告完成/关闭回调（阶段 2） | **柔和「退场」cue**（whoosh out / 回位音） | must* | *同上；恢复 BGM 音量 |
| 18 | `newBest` | `game.js endGame()` 破纪录 `newBest` + `_flashBestBadge()` | **明亮单铃 ding**（庆祝） | optional | 可并入 `win` 或在结算时追加一记清亮铃；区分于普通计分 |

**默认主推事件集（must）**：`merge`、`swipe`、`win`、`lose`、`boardRetire`、`undo`、`freezeActivate`、`buttonTap`、`difficultySwitch`、`languageSwitch`，以及阶段 2 的 `adStart`/`adEnd`。
**锦上添花（optional，建议后补）**：`tileSpawn`、`invalidMove`、`freezeTick`、`freezeBonus`、`tutorialOpen`、`newBest`。

### 2.1 `merge` 音高阶（按合并后数值分档）
合并后新块值越高 → 基频越高、音色越亮（让「冲大数」有听觉正反馈）：

| 合并后数值（tier） | 基频参考（Hz） | 听感 |
| --- | --- | --- |
| 4 / 8 / 16（tier 1） | ~220–330 | 软、低 |
| 32 / 64（tier 2） | ~330–440 | 略亮 |
| 128 / 256（tier 3） | ~440–587 | 更亮 |
| 512 / 1024（tier 4） | ~587–784 | 明亮 sparkle |
| 2048（tier 5） | ~784+ | 特殊辉煌（同时触发 `win`） |

> 实现：用 `baseFreq * 2^(step/12)` 或简单按 tier 映射；同一回合多合并可叠加（注意 §3.2 复音预算）。

---

## 3. 混音与实现策略（Mixing & Implementation Strategy）

### 3.1 核心推荐：Web Audio API 程序化合成（PROCEDURAL SYNTHESIS）★

> **强烈建议：所有音频（SFX + 音乐）用 Web Audio API 在运行时程序化合成（振荡器 oscillator + 增益包络 envelope + 滤波噪声 filtered noise / 延迟 delay），游戏不引用任何 `.mp3/.ogg/.wav` 文件。**

**理由（rationale）：**
1. **零外部音频文件** —— 包体不含任何音频资源，符合「无外网依赖 + 自包含离线运行」硬约束（GDD §10.1/§10.5）；沙箱无外网也能跑。
2. **无外部资产依赖 / 无授权风险** —— 不依赖任何第三方音频素材/字体/采样，**天然规避版权与分发问题**；所有声音为代码生成，可商用、无许可费。
3. **极小体积、极快加载** —— 音频不占下载/解包时间，加载更顺畅。
4. **动态可调** —— 音高/时长/混响全参数化，便于按数值档位（`merge` tier）实时变化，也便于无障碍（减少/静音）即时生效。
5. **一致性强** —— 音色由同一套合成器生成，全游戏听觉统一，对齐 Art Bible 的「统一视觉身份」。

**注意事项**：程序化合成需工程实现一个轻量 `AudioManager`（见 §5）；音乐若走程序化生成，复杂度高于采样，首版可先用极简循环（§1.4）。

### 3.2 总线结构与混音（Bus / Mix）
```
Master Gain (dual2048.muted → 0)
 ├─ Music Gain      (默认 ≈ 0.28，用户可开关；adStart 时 duck 至 ~0.10)
 └─ SFX Gain        (默认 ≈ 0.80)
      ├─ UI/反馈子组 (buttonTap, switch, undo, invalid, freezeTick)
      ├─ 玩法子组    (merge, tileSpawn, swipe)
      └─ 状态子组    (win, lose, boardRetire, freezeActivate, freezeBonus, newBest)
```
- **无 3D 距离衰减**（棋盘为 2D 固定视角，所有声源等同距），故不做空间化；仅做整体响度。
- **复音预算（polyphony）**：SFX 同时发声建议 ≤ **12 voice**；音乐 ≤ **6 oscillator voice**。同一回合多合并时，合并音可限制为「取最高 tier 的 1–2 声」避免堆叠炸响。
- **动态范围 / 限幅**：Master 末端建议加一个软限幅（`DynamicsCompressorNode`，轻阈值）防止多音齐发削波。

### 3.3 程序化合成配方速查（给工程的直接规格）
| 音色 | 节点链（示意） | 包络 |
| --- | --- | --- |
| pop（merge/tileSpawn） | `OscillatorNode(triangle/sine)` → `Gain`(env) → `BiquadFilter(lowpass ~3k)` → SFXGain | attack 3ms，decay 90–140ms |
| whoosh（swipe） | `BufferSource(白噪声)` → `BiquadFilter(bandpass 800–1.5k, Q~1)` → `Gain`(env，下扫) | 120–200ms |
| click（buttonTap） | 短噪声 burst + `Oscillator(sine ~180Hz)` → `Gain` | 20–30ms |
| shimmer（freezeActivate） | `Oscillator(sine ~1200Hz)` + detune 副本 → `Delay`(短反馈) → `Gain` | attack 5ms，200–300ms |
| 铃/琶音（win/lose/retire） | `Oscillator(triangle/sine)` 序列 → `Gain`(每音 env) → `Delay`(空间) → SFXGain | 每音 60–120ms |

### 3.4 备选：真实录制 SFX 资产规格（若用户后续想要采样音）
> 仅当程序化音色不满意、改走素材路线时使用。**仍需随包本地化（无外网）**，并自行承担授权与分发。

| 规格项 | 要求 |
| --- | --- |
| 格式 | **`.ogg` + `.mp3` 双份**（兼容 Safari/Chrome；内嵌网页两端） |
| 单文件时长 | **0.1–0.4s**（短促反馈音） |
| 总体积 | **< 200KB**（全部 SFX 合计） |
| 采样率 | 44.1kHz / 16-bit 足够 |
| 命名 | `sfx_merge_#.ogg`、`sfx_swipe.ogg`、`sfx_win.ogg`、`sfx_lose.ogg`、`sfx_retire.ogg`、`sfx_undo.ogg`、`sfx_freeze.ogg`、`sfx_tick.ogg`、`sfx_button.ogg`、`sfx_switch.ogg` … |
| 目录 | `assets/audio/`（本地随包） |
| 音乐 | 若用采样 BGM：循环段 `~loop 8–16s`，`.ogg+.mp3`，单首 < 150KB，低响度 |

---

## 4. 无障碍与音频策略（Accessibility）

### 4.1 静音与持久化
- **主静音开关**：`localStorage` 键 **`dual2048.muted`**（boolean）。`true` = 全音频静音（Master Gain → 0）。
- **推荐默认值**：`dual2048.muted = false`（默认不静音，但见下「音乐默认关」）。
- **建议拆分（可选，待拍板）**：另设 `dual2048.musicOn`（boolean，默认 **false**），让音乐与 SFX 独立开关——SFX 默认开、音乐默认关，更友好。

### 4.2 自动播放策略（Autoplay Policy）★
- 浏览器 / 内嵌网页 **禁止无手势自动出声**。因此：
  - `AudioContext` 在加载时**创建但保持 suspended**；
  - 必须在**首次用户手势**（第一次 `pointerdown` / `keydown`，即第一次滑动或点击）时调用 `audioCtx.resume()`，之后再出声。
- **音乐默认行为（主推）**：游戏启动后音乐**默认不自动播放**（或仅以极低音量 ~0.28 在首次手势后渐入，且提供明显开关）。环境休闲玩家偏好安静思考，音乐「默认关、用户开」最稳妥；若用户希望默认开，再翻为 `musicOn=true`。
- **SFX 默认开**（首次手势后即可响），配合 `buttonTap` 等即时反馈。

### 4.3 可见的静音控制
- 当前控制条为 撤销/冻结/重开（见 `game.js buildControls`）。**建议新增一个静音按钮**（扬声器图标），放在 HUD 右上（与语言/难度切换同区）或控制条。点击切换 `dual2048.muted` 并即时生效、持久化。
- 「减少动画」开关（Art Bible §8.4 / GDD §12）**不影响音频**；但若未来加「减少音效」选项，应联动 SFX Gain。

---

## 5. 工程集成注（Integration Note for Engineering Lead）

> 以下为**设计规格与 API 草图**，非可运行代码；落地由程基岩实现。所有事件 key 对齐 §2。

### 5.1 需要发出的事件（Events to Emit）
按 §2 表，`AudioManager.play(eventKey, payload?)` 应在以下位置调用：

| 代码位置（src/game.js 等） | 触发事件 |
| --- | --- |
| `handleMove()` 判定 `anyMoved` 之前/之后 | `invalidMove`（仅 `!anyMoved` 时）；`swipe`（有效移动时） |
| `handleMove()` 渲染前统计本回合合并 | `merge`（按合并后数值 tier，payload: `{tier, value}`）；可叠 `tileSpawn`（新块） |
| `handleMove()` → `freeze.tick()` 步数递减 | `freezeTick`（payload: `{board, stepsLeft}`） |
| `handleMove()` → `freeze.checkBonus()` gained>0 | `freezeBonus`（payload: `{gained}`） |
| `endGame(true/...)` | `win`（payload: `{reason}`） |
| `endGame(false)` | `lose` |
| 休闲 `resolveCasualOutcome` 返回 `retire` | `boardRetire`（payload: `{board}`） |
| `onUndoClick()` 成功回退 | `undo` |
| `handleTap()` → `freeze.applyTo(i)` 成功 | `freezeActivate`（payload: `{board}`） |
| `ui.js Button.onClick` | `buttonTap`（统一） |
| `SegToggle` modeToggle `onChange` | `difficultySwitch` |
| `SegToggle` langToggle `onChange` | `languageSwitch` |
| 「怎么玩」覆盖层打开（阶段 1） | `tutorialOpen` |
| `integration.js requestAd('rewarded')` 真实接回 | `adStart` / `adEnd`（广告起止回调） |
| `endGame()` 破纪录 | `newBest` |

> **关键缺口提示**：当前 `board.js move()` 仅返回 `{moved, scoreGained}`，**不直接暴露「哪些方块合并、合并后值是多少」**。要驱动 §2.1 的 `merge` 分档，建议：
> - 方案 A（主推）：`Board.move()` 额外返回 `merges: number[]`（合并后数值数组），`DualGame.handleMove` 据此发 `merge` 事件并取最高 tier；
> - 方案 B：`Tile.mergedFrom` 已存在，渲染层可遍历棋盘统计本帧合并值再上报。

### 5.2 AudioManager API 草图（签名级）
```
init()                                  // 创建 AudioContext + 总线；不自动 resume
resume()                                // 首次用户手势调用 audioCtx.resume()
setMuted(bool)                          // 写 localStorage dual2048.muted；Master Gain 0/1
isMuted() -> bool
setMusicEnabled(bool)                   // 写 dual2048.musicOn；启停 BGM（可选拆分）
play(eventKey, payload)                 // 触发 §2 中某 SFX（程序化合成）
startMusic() / stopMusic()              // 启停程序化 BGM 循环
duckMusic(level)                        // adStart 时压低，adEnd 恢复（可选）
```
- `play()` 内部按 `eventKey` 查合成配方表（§3.3），用 `audioCtx.currentTime` 调度；超复音预算时丢弃最低优先级。
- `init()` 在 `main.js` 或 `GameScene.create()` 早期调用；`resume()` 挂在全局首次 `pointerdown`/`keydown`（与 `setupInput` 同生命周期）。

### 5.3 Hook 落点小结（与 game.js 对应）
- **合并/滑动/无效**：`handleMove`（含 `board.js move` 返回值增强，见 5.1 缺口）。
- **胜负**：`endGame(win, reason)`。
- **退役**：`resolveCasualOutcome` 的 `retire` 分支。
- **撤销**：`onUndoClick`。
- **冻结激活 / 读秒**：`handleTap`（applyTo）+ `handleMove`（tick）。
- **按钮 / 切换**：`ui.js` 的 `Button.onClick`、`SegToggle.onChange`。
- **广告**：`integration.js requestAd`（阶段 2 接 `adStart`/`adEnd`）。

---

## 6. 待用户/主理人拍板项（汇总）

| # | 决策点 | 我的建议 | 影响 |
| --- | --- | --- | --- |
| 1 | 音乐默认开还是关（`dual2048.musicOn` 默认值） | **默认关，用户手动开**（最贴合 安静思考 + 自动播放策略） | 首因体验 |
| 2 | 是否拆分 SFX / 音乐独立开关 | **建议拆分**（SFX 默认开、音乐默认关） | 无障碍/体验 |
| 3 | 是否补 `tileSpawn` / `invalidMove` / `freezeTick` 等 optional 事件 | **首版做 `tileSpawn` 轻版；`invalidMove`、`freezeTick` 做得很轻或默认关** | 听感 clutter |
| 4 | 音乐走程序化生成还是预留采样位 | **程序化（零文件）**；若不满意再走 §3.4 采样 | 体积/授权 |
| 5 | 静音按钮放哪 | **HUD 右上（与语言/难度同区）** 或控制条加一个 | 可发现性 |
| 6 | `freeze` 时长 3 还是 5（GDD §16，非音频） | 不归音频，提醒主理人拍板 | 玩法 |

---

*文档结束。本文档为音频规范草案（零文件 / Web Audio 程序化合成方向），未改动任何代码；落地前请用户对 §6 决策点拍板。*
