# Juice / VFX 提品菜单 · Simultwin 复审前
> 编制：林绘澄（美术与视觉） · 依据 `design/style-reference.md`（as-built）+ `src/theme.js` / `view.js` / `ui.js` / `game.js` 实测代码
> 铁律：零粒子、零外部资源、扁平糖果风不变（无投影/辉光/渐变纹理）。工作量 S≤0.5天 · M≤2天 · L>2天。
> 复审定位：LOW-RISK/HIGH-IMPACT 直接进 TOP5（§7）；NICE-TO-HAVE 见 I9/I12/I14。

## 1. 合并 / 生成 / 弹出反馈
### I1 合并 pop 微调 + 双盘同帧合并 bump「twin 时刻」
- 做法：`view.js` merge 分支把缩放 1.18 提为常量（单盘 1.20）；当 `handleMove` 两盘同回合都有 merge 时 bump 到 1.22。时长/缓动不动（66ms Quad.easeOut yoyo，delay 49.5ms）。
- 为什么：合并是全局最高频“爽点帧”，1.18 在手机上偏小；双盘同时合是本作卖点，值得专属刻度。
- 代码位置：`src/view.js render()` L222-227；`src/game.js handleMove()` L932-937（results 已有，读 merges 标志即可）。
- 工作量：S ｜ 影响：手感更脆 ｜ 风格风险：零（仍是纯扁平缩放）。
### I2 合并 1 帧扁平白闪（非辉光）
- 做法：merge 目标块容器内叠一层 Graphics，`fillStyle(0xFFFFFF, 0.32)` 画同尺寸圆角矩形，alpha→0（~90ms）后销毁。
- 为什么：平面风格里“白闪=亮一下”，是辉光/火花的最便宜替身；双盘同时合一眼可见。
- 代码位置：`src/view.js render()` merge 分支（紧接 L222）。
- 工作量：S ｜ 影响：合并反馈显著变亮 ｜ 风格风险：低，alpha 必 ≤0.32、时长 ≤100ms，否则双盘两团白光糊屏。
### I3 生成块弹出（保持 110ms Back.easeOut，只许 1 个数字级微调）
- 做法：文档明示“糖果感来源，别改”——保持现状即低风险；若要更“糖”，只调 overshoot 1.0→1.06，不碰时长。
- 代码位置：`src/view.js render()` `e.kind==='new'` L215-218。
- 工作量：S ｜ 影响：微 ｜ 风格风险：超出 1.06 显塑料。

## 2. 按钮 / UI 交互
### I4 按下加深反馈 ⚠️ 改“静态按钮”as-built 事实，需主理人拍板
- 做法：`theme.js` 已有死代码 `PRESS_DARKEN_RATIO=0.13`；给 Button 加按下→`darken(bg,0.13)`、抬起→恢复，不动几何不缩放（与美术圣经原意图一致，只是当初实现被跳过）。
- 为什么：QA 与玩家对“按了有无反应”极敏感，是性价比最高的质感升级。
- ⚠️ 会改变 style-reference §0 事实1「按钮零动效」——批准后需同步文档。
- 代码位置：`src/interaction.js _onPointerDown` L21-33（补全局 pointerup + onPress/onRelease 回调）；`src/ui.js Button` L54-57。
- 工作量：S ｜ 影响：响应感↑↑ ｜ 风格风险：低（与“即时响应”原则不冲突）。
### I5 分数 count-up
- 做法：`_updateScoreCaptions` 由直接 setText 改为 250ms 计数 tween（旧→新，Quad.easeOut）；仅数值增加时播，resize/语言切换仍直写。
- 为什么：分数跳动是休闲游戏“精致感”标配。
- 代码位置：`src/game.js _updateScoreCaptions()` L344-351 / `refreshHUD()` L324-339。
- 工作量：S-M ｜ 影响：中 ｜ 风格风险：低；三个 Text 并发 tween，destroy 前 killTweensOf。
### I6 冻结“待选择”态 + 撤销可用态
- 做法：`freeze.beginSelect()` 时按钮 darken(bg,0.13) 表示“已上膛”；撤销可用时可加 2px 深色描边（flat 描边不破坏风格）。
- 为什么：状态可见性=可访问性，也是打磨感来源（玩家知道此刻点了会怎样）。
- 代码位置：`src/game.js onFreezeClick()` L1119-1134 / `handleTap()` L1013-1027 / `refreshHUD()` L331-338；`src/ui.js drawButton()` L86-97。
- 工作量：S ｜ 影响：中 ｜ 风格风险：低（描边色取 `TILE_TEXT_DARK`，勿新增色）。
### I7 Toast 胶囊化（去直角矩形背景）
- 做法：`showToast` 改为 Container = Graphics 胶囊（圆角=高一半，底色照旧）+ Text；复用“同屏一条”与 700/1300ms 淡出。
- 为什么：`Text.backgroundColor` 是直角矩形，是当前 UI 最“裸”的一处；胶囊化立刻贴回糖果风。
- 代码位置：`src/ui.js showToast()` L300-337。
- 工作量：M ｜ 影响：高（每个提示都变好看）｜ 风格风险：低（注意 destroy 与 `__toastText` 复用）。

## 3. 渲染清晰度
### I8 hi-DPI 画布（隐藏的“不高级”元凶）
- 做法：`main.js` config 加 `resolution: Math.min(window.devicePixelRatio||1, 2)` + `roundPixels: true`；关键 Text 可 `setResolution(dpr)`。
- 为什么：高分屏上 canvas 默认 1x 会被浏览器放大→文字/圆角发虚，正是“看起来不高级”的隐形原因。
- 代码位置：`src/main.js` config L35-46。⚠️ 需与程基岩核对 Phaser 3.80 RESIZE+resolution 兼容。
- 工作量：S ｜ 影响：全屏锐利度↑↑ ｜ 风格风险：低；dpr>2 强制 2 防性能/内存。
### I9 间距/留白呼吸（NICE-TO-HAVE）
- 做法：竖屏 HUD 80-90px 偏挤，棋盘与控制条间距 ≥16px；核对 overlay 标题到按钮间距。
- 为什么：留白=高级感，挤压=廉价感（视觉 QA 常查“是否局促”）。
- 代码位置：`src/game.js layout()/layoutHUD()` L673-850。
- 工作量：S ｜ 影响：中 ｜ 风格风险：低，但涉及响应式回归，须横竖屏截图验收。

## 4. 胜利 / 死局时刻
### I10 胜利金闪 + 金色标题（无粒子）
- 做法：`showOverlay(win=true)`：① 全屏 #FFB014 低 alpha 闪光 0.18→0（250ms）；② 主标题 setColor(#FFD75E)（海军蓝底上对比充足）；③ 标题 scale 0.94→1（200ms Quad.easeOut）。
- 为什么：胜利需要“被庆祝”但烟花类特效会破坏扁平签名；金闪+金标题是扁平语言里的最高礼遇。
- 代码位置：`src/game.js showOverlay()` L597-630 / `repositionOverlay()` L652-670。
- 工作量：S-M ｜ 影响：高 ｜ 风格风险：低；闪光 alpha 勿超 0.18；金标题只用于 win。
### I11 失败：遮罩淡入 180ms + 标题上浮 10px
- 做法：overlayBg alpha 0→0.78（180ms）；标题 y +10→0。只改结算遮罩，不是全部即时 UI。
- 为什么：突然全屏变暗是“惊悚感”来源；柔和收场更贴 calm 定位。
- 代码位置：`src/game.js showOverlay()` win=false 分支；时序对齐 `handleMove()` L977（ANIM_MS+30）。
- 工作量：S ｜ 影响：中 ｜ 风格风险：低（改一个“即时”事实，需文档同步）。
### I12 温和棋盘沉降（NICE-TO-HAVE）
- 做法：终局前所有块 scale 1→0.97→1（180ms 两次）“叹口气”；不做塌陷散落（会被读成粒子/物理）。
- 为什么：给终局一个身体感收束。
- 代码位置：`src/view.js` render 后 + `src/game.js` 结算前（L977 前）。
- 工作量：M ｜ 影响：中 ｜ 风格风险：中（32 个 tween 的时序与性能）。

## 5. 对比度修正（质量地板，必须做）
### I13 三处替换色（已复核 WCAG，四舍五入与 style-reference 一致）
- 公式：L=0.2126R+0.7152G+0.0722B（sRGB 线性化）；ratio=(L1+.05)/(L2+.05)。
- 开始绿：`#2F8B2C`+白 = **4.33 ✅**（原 #5FC25A 2.25）→ `theme.js BTN_START.bg` L85。
- 重开珊瑚：`#D9452F`+白 = **4.34 ✅**（原 #F26D5B 2.95）→ `theme.js BTN_RESTART.bg` L82；⚠️ `MODE_HARDCORE` L91 同色同改。
- Toast 成功：底 #2BC7A0 字改 `#0A3B31` = **5.81 ✅**（原白字 2.15）→ `theme.js TOAST_SUCCESS.text` L113（`showToast` 直接消费）。
- 工作量：S（纯常量）｜ 影响：可量化的一分“整体质量”｜ 风格风险：零（同色相加深，视觉几乎不变）。

## 6. 汇总
| ID | 条目 | 工作量 | 优先级 | 风险 |
|----|------|--------|--------|------|
| I13 | 对比度地板 | S | 必做 | 零 |
| I8 | hi-DPI 锐度 | S | 必做 | 低 |
| I7 | Toast 胶囊 | M | 高 | 低 |
| I2 | 合并白闪 | S | 高 | 低 |
| I1 | pop bump / twin 时刻 | S | 高 | 零 |
| I10 | 胜利金闪/金标题 | S-M | 高 | 低 |
| I4 | 按钮按下加深 | S | 高（待拍板） | 低（改 as-built） |
| I5 | 分数 count-up | S-M | 中高 | 低 |
| I6 | 冻结/撤销状态视觉 | S | 中 | 低 |
| I11 | 失败遮罩淡入 | S | 中 | 低 |
| I3 | 生成弹出微调 | S | 中 | 低 |
| I9 | 留白呼吸 | S | 中 | 低 |
| I12 | 棋盘沉降 | M | 低 | 中 |

## 7. TOP 5 复审短清单（LOW-RISK / HIGH-IMPACT）
1. **I13 对比度地板** — 3 个常量，可量化的质量分。
2. **I8 hi-DPI 锐度** — 一行配置，全屏变清晰。
3. **I7 Toast 胶囊化** — 每屏提示都贴回糖果风。
4. **I2+I1 合并白闪 + twin bump** — 最高频爽点帧的扁平化升级。
5. **I10+I11 胜利金闪/失败淡入** — 终局仪式感，零粒子。
> 批准 I4 后应挤进 TOP5（响应感 > 状态视觉）。

## 8. 别做（anti-patterns）
1. **烟花/粒子** — 已否决，QA 扣分项。
2. **给方块加投影/辉光/渐变** — 破坏糖果扁平签名；风格漂移比“平淡”更糟。
3. **拉长动画（110ms→300ms）或全局震动** — 变“肉”不变“高级”，双盘同步更易晕。
4. **每回合新增音效/堆叠动效** — 双盘一次滑 5-8 声已是教训（ITER-V12-001）。
