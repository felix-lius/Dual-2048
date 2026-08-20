# Juice 设计菜单 · Simultwin 呈现品质提升（JU-1）

> 定位：仅 Phaser 3.80.1 原语，零外部资产/依赖，零构建改动；用户已否决粒子/烟花。
> 依据：`design/style-reference.md`（as-built 事实）+ 源码逐行核对（view.js / game.js / ui.js / audio.js / theme.js / interaction.js / input.js / board.js）。
> 约定：⚠️ = 会改变已记录的 as-built 事实，需主理人/用户显式拍板；标签 = LOW-RISK/HIGH（重提交品质优先）｜NICE-TO-HAVE｜DECISION-GATED（事实反转，待拍板）。

## 0. 判断基准（as-built 事实，别碰）
- 方块扁平实色，零投影/辉光/渐变；暖渐变底；动画哲学「只给方块本身做动画，界面元素一律即时」。
- 按钮零按下动效（`PRESS_DARKEN_RATIO` 为死代码）；遮罩/弹窗/面板即时无过渡；合并音已下线（ITER-V12-001）；音乐默认关且无开启 UI。
- 可复用音频原语（13 事件，零文件）：swipe / invalidMove / win / lose / boardRetire / undo / freezeActivate / freezeTick / buttonTap / difficultySwitch / languageSwitch / tutorialOpen / newBest。

## 1. 输入反馈
- **I-1 无效移动棋盘轻推**｜做法：无效滑动时两盘容器向失败方向位移 3px→0（90ms Quad.easeOut），配既有 invalidMove 音｜MDA：撞墙物理 → 输入被拒的实感（替代纯音效的「廉价无反应」）｜位置：game.js `handleMove` L939 `if (!anyMoved)`；动画加在 boardViews[].container｜S｜high｜⚠️ 轻微：动画哲学「界面即时」开此一处例外｜**LOW-RISK/HIGH**
- **I-2 动画锁方向缓冲指示**｜做法：busy 锁内 pendingDir 被缓冲时，在两盘外缘画一枚纯色淡三角（fillTriangle），缓冲清空即删｜MDA：反馈闭环 → 快速连滑时第二个方向「已收到」而非疑似丢输入｜位置：game.js L918-921 busy/pendingDir｜S｜med｜low（纯色几何、无动效，可复用语义色）｜NICE-TO-HAVE
- **I-3 按钮按下加深（复活 PRESS_DARKEN_RATIO）**｜做法：命中时填充色 darken(0.13) 保持 60ms 还原；改动 ui.js Button + interaction.js drawButton｜MDA：press→acknowledge；静态按钮是审读时最易读出的「廉价感」来源之一｜位置：ui.js L54-57、interaction.js L86-97、theme.js L95（死代码）｜S｜high｜⚠️ 直接反转 as-built「按钮零按下动效」（v1.0 曾显式推翻草案 13% 加深）｜**DECISION-GATED**（若拒，靠 I-1/T-3 补偿手感）

## 2. 合并 / 得分反馈
- **M-1 分数滚动（score count-up）**｜做法：记录旧分数，150ms 内把左/右/总分三处数字 tween 到新值（仅动数字，caption 保留）｜MDA：奖励延时 → 得分被「看见」而非闪现；标准糖果休闲「高分位」手感｜位置：game.js `refreshHUD` L324-339、`_updateScoreCaptions` L344-351｜S-M（需解析双行 caption 的数字段）｜high｜low（数字文本 tween，与 Toast 既有动画同类）｜**LOW-RISK/HIGH**
- **M-2 合并「+值」浮动字（每盘最高档 1 条）**｜做法：merge 分支在合并格上方生成 '+N' Text，90ms 上浮 24px + 淡出；每盘只出最高档 1 条防刷屏｜MDA：合并价值可视化 → 强化奖励时刻（经典 2048 级 juice，纯文本无粒子）｜位置：view.js `render` merge 分支 L222-227（Text 生成到 scene）｜S｜high｜med（新增文字元素，纯文本仍在 flat 内；纯数字无须 i18n）｜**LOW-RISK/HIGH**
- **M-3 合并音：每滑取两盘最高档 1 声**｜做法：audio.js 加 case 'merge'（style-ref §3 音阶梯 `[261.63..1318.51]`，`peak=0.16−tier×0.0056`，同回合只播 1 声）；game.js handleMove 在两盘 maxMerge 取最大播 1 声｜MDA：核心循环「嗖+啵」双层 → 合并被听到（不只被看到）｜位置：audio.js `play()`、game.js L944 swipe 旁（`results[i].maxMerge` 已由 board.js L175 返回）｜S｜high｜⚠️ 反转 ITER-V12-001「合并音下线」——但 style-ref 明文建议双盘「同回合只取最高档 1 声」｜**DECISION-GATED（推荐做）**
- **M-4 段位里程碑 toast（128/512/2048 首达）**｜做法：任一盘首次达档位值时弹一条常规 toast｜MDA：段位重置叙事 → 长线目标感｜位置：game.js handleMove 结算回调 + i18n 新键｜S｜med｜low（⚠️ 与「得分奖励冻结」toast 抢单槽，需合并或排队）｜NICE-TO-HAVE

## 3. 系统反馈
- **S-1 终局结算：延迟 + 淡入（先让胜利弹跳落地）**｜做法：handleMove 结算延迟 ANIM_MS+30 → 约 ANIM_MS+260；showOverlay 遮罩 alpha 0→1（180ms Quad.easeOut）｜MDA：终局是情绪峰值——现在 ~150ms 遮罩直接盖住合并弹跳尾部（pop 要 ~181ms 才播完），延迟+淡入让「赢」被完整看见｜位置：game.js L977 delayedCall、`showOverlay` L597｜S｜high｜⚠️ 打破「遮罩即时」as-built（推荐作为唯一终局例外）｜**LOW-RISK/HIGH（待拍板例外）**
- **S-2 撤销恢复加滑动动画**｜做法：undo 后 diff 快照，给恢复块设 previousPosition 再 render(animate=true)，复用 110ms 滑动｜MDA：回退是可读过程 → 撤销不是「瞬移」，降低认知断裂｜位置：game.js `onUndoClick` L1053（现 renderStatic）、board.js restore｜M｜med｜low（复用方块动画语言）｜NICE-TO-HAVE
- **S-3 冻结步数数字微脉冲**｜做法：showFreeze/freezeTick 时步数 Text 一次 scale 1→1.15→1（120ms）｜MDA：读秒「滴答」感 → 冻结时效被持续感知｜位置：view.js `showFreeze` L277-281、`_drawFreeze` L258-275｜S｜med｜low（文字动效，同 Toast 类别）｜NICE-TO-HAVE

## 4. 转场与引导
- **T-1 重开/首局发牌用 spawn pop**｜做法：restart() 与初始 create() 改用 render(board, true)——新块无 previousPosition → 自动走既有 Back.easeOut 弹出｜MDA：开局即糖果感 → 「新的一局」有仪式感｜位置：game.js restart L1196、create L203（现 renderStatic）｜S｜high｜low（纯复用方块动画，零新手感）｜**LOW-RISK/HIGH**
- **T-2 教程面板 scale-in**｜做法：panel alpha 0→1 + scale 0.92→1（220ms Back.easeOut），dim 同步淡入；配既有 tutorialOpen 音｜MDA：首次引导 = 品牌第一印象 → 柔和入场降低「弹窗打断感」｜位置：game.js `_openTutorial` L452-517｜S｜high｜⚠️ 打破「面板即时」as-built｜**DECISION-GATED（推荐做）**
- **T-3 Toast 入场 pop**｜做法：showToast 开头加 scale 0.85→1（200ms Back.easeOut），保留既有停留+淡出｜MDA：高频元素精致度 → 每条提示都被「轻放」｜位置：ui.js `showToast` L300-337｜S｜med-high｜low（Toast 本已是动画元素，同类扩展）｜**LOW-RISK/HIGH**
- **T-4 难度确认框淡入**｜做法：_askSwitchMode 遮罩与按钮组 150ms 淡入｜位置：game.js `_askSwitchMode` L1210-1252｜S｜med｜⚠️ 同 S-1（遮罩/弹窗即时）｜NICE-TO-HAVE

## 5. 节奏与声音（复用现有音频原语，零新资产）
- **R-1 音乐：步长 380→310ms + 补音乐开关按钮**｜做法：audio.js `startMusic` stepMs 改 310（≈97BPM，style-ref 明文建议 380 偏慢）；HUD 静音按钮旁补音乐按钮（musicOn 持久化已存在，仅缺 UI）｜MDA：可选暖床音乐 → 沉浸与时长感（审读常开声）｜位置：audio.js L352、game.js `buildMuteButton` 旁｜S-M（HUD 空间紧张，竖屏需重排）｜high｜low（符合「音乐默认关」支柱；补的是 style-ref「移植必做」缺失项）｜**LOW-RISK/HIGH**
- **R-2 每 1000 总分轻铃**｜做法：total 跨 1000 整数倍时播一声低 peak 铃（≈newBest 半响度），与既有冻结奖励 toast 同帧｜MDA：长程奖励节奏 → 大目标感｜位置：game.js handleMove L969-974 freeze.checkBonus 旁｜S｜med｜low｜NICE-TO-HAVE
- **R-3 冻结最后 1 步音调微变**｜做法：steps===1 时 freezeTick 音高 1500→1800Hz（同一原语换参）｜MDA：时限临近 → 紧张感递进｜位置：audio.js freezeTick L303-307、view.js _drawFreeze｜S｜low-med｜low｜NICE-TO-HAVE

## 6. 汇总分层
- **LOW-RISK / HIGH（重提交品质印象，优先做）**：I-1、M-1、M-2、T-1、T-3、R-1
- **DECISION-GATED（改动 as-built 事实，需主理人拍板）**：I-3（按钮加深）、M-3（合并音）、S-1（终局淡入）、T-2（教程 scale-in）
- **NICE-TO-HAVE**：I-2、M-4、S-2、S-3、T-4、R-2、R-3

## 7. TOP-5 短名单（重提交）
1. **S-1 终局延迟+淡入** —— 现在遮罩盖掉胜利弹跳，让最爽的 ~0.3 秒被吃；这是「最后一击」级修复，肉眼可感的生产价值。
2. **M-1 分数滚动** —— 三处分数 150ms 滚动，一行 tween 换标准「高分位」手感，零冲突。
3. **T-1 发牌 spawn pop** —— 复用现成 Back.easeOut 方块动画，把「静态出现」变「弹出来」，零新手感。
4. **M-3 合并音（最高档 1 声）** —— style-ref 明文建议的双盘方案；核心循环从单层 whoosh 升级为「嗖+啵」双层。
5. **T-3 Toast 入场 pop** —— 高频元素 200ms 回弹立即提精致度，保留既有淡出，零风险。

## 8. 别做（会显廉价 / 破坏身份）
- ❌ 粒子/烟花/碎片 —— 用户已否决；也违背 flat candy。
- ❌ 方块加投影/辉光/描边 —— 打破「零投影零描边」身份，反而更像山寨 2048。
- ❌ 每次合并都响音 / 全屏震动 / 红色警示 —— 5–8 声噪音团正是合并音下线的根因；震动破坏 calm 支柱。
- ❌ 按钮缩放按压 —— 既定按压语言是「不缩放、即时响应」，加缩放等于换一套手感。
