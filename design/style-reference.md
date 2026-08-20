# 风格参考手册 · 《Double 2048: Dual Challenge》最终版

> **用途**：把本游戏 v1.0.0（已交付）的**最终美术、音频、设计基调**整理成一份可复用参考，供你下一款「数字方块合并」类游戏照抄，保持同一工作室出品的一致风格。
> **汇编**：主理人游承峰编排；三节分别由 文策渊（设计基调）、林绘澄（视觉）、阮和鸣（音频）基于**成品代码**整理。
> **重要**：本手册数值一律以**实际实现（as-built）**为准。早期 `design/art/art-bible.md` 与 `design/audio/audio-bible.md` 仍是草案，含大量「待拍板」项；**凡与本手册冲突，以本手册为准**。
> **配套原始文档**：设计 GDD `design/gdd/dual-2048-gdd.md`、美术圣经 `design/art/art-bible.md`、音频圣经 `design/audio/audio-bible.md` 为设计阶段文档；本手册是它们的「成品快照」。

---

## 0. 速览：风格签名与成品事实（已核实）

**一句话风格签名**

> calm-but-playful 的「糖果卡通风」——画面明亮圆润暖洋洋，让高强度数字合并看起来轻松愉快；听觉上零音频文件、移动音是一记极轻的下扫「嗖」、音乐默认安静。

**五条最关键的成品事实**（与早期草案不同，移植时务必注意）：

1. **按钮是静态的，零按下动效**。`ui.js` 按钮只有「常态 / 禁用灰态」两态，按下无任何缩放 / 加深 / 下沉（草案建议的「按下加深 13%」已被推翻，`theme.js` 的 `PRESS_DARKEN_RATIO` 是无调用方死代码）。反馈完全交给音效 + 即时响应。
2. **方块是纯扁平圆角实色**，无投影 / 高光 / 2048 辉光 / 星芒角标（草案建议的质感均未落地）。合并放大是 1.18（非草案 1.20），遮罩即时出现无淡入。
3. **合并音 `merge` 已被下线**（ITER-V12-001，双盘专属决策：一次滑动两盘齐合会炸 5–8 声）。单盘新游戏建议加回（管线 `board.js` 已返回 `merges[]` / `maxMerge`，接一行即恢复）。
4. **线上实际听不到 BGM**：音乐默认关，且 `setMusicEnabled()` 无 UI 入口、生产零调用 → 音乐引擎休眠。新游戏务必补一个音乐开关按钮。
5. **广告是 Master→0 整体静音，不是 duck**。`duckMusic()` 仅测试调用过，生产零调用。

---

## 一、设计基调与 UX 一致性（整理：文策渊）

> 本节不讲机制细节、不讲代码，只讲「这款游戏为什么让人觉得轻松又耐玩」，以及「换一款游戏怎么把这份感觉搬过去」。

### 一句话情绪身份

> **calm-but-playful 的「糖果卡通风」——画面明亮圆润暖洋洋，让「同时管两个棋盘」这件本来很有压力的事，看上去轻松、玩起来愉快。**

拆开说三层：

| 层次 | 想让玩家感到 | 我们怎么做到 |
| --- | --- | --- |
| 第一眼（0–3 秒） | 「哦，这个看起来不难，随便玩玩」 | 暖奶油→蜜桃的渐变背景、圆角糖果色方块、没有首页没有登录，**加载完直接就能滑** |
| 上手期（1–3 分钟） | 「我知道该干什么，按哪儿都有反应」 | 三颗颜色固定的功能按钮、教程自动弹一次、每个操作都有一句短提示 |
| 深度期（10 分钟以后） | 「这游戏其实挺有讲究的」 | 双盘互相牵制、撤销 / 冻结要省着用、硬核与休闲两种活法 |

**反面清单（这款游戏刻意不要的东西）**：不要黑暗高对比的"硬核科技风"、不要计时压迫、不要红色警告满屏、不要开局强制看广告、不要背景音乐一进来就轰你。

### 设计支柱：三条，全游戏所有决策都对齐它们

**支柱 1 · 双线协同挑战** — 核心动词是「**一次滑动，双盘同步**」。难度不来自操作变复杂，而来自取舍变多了（操作复杂度不变，决策复杂度翻倍）。

**支柱 2 · 低门槛、高上限** — 无首页、无主菜单、无登录、无教学关，加载完成即进入对局；硬核 / 休闲两种活法，辅助资源要不要现在用、留给谁用是长期可练的东西。

**支柱 3 · 公平可控的辅助** — 撤销与冻结被定义为「**缓压工具**」而不是「**碾压手段**」：

| 自律条款 | 做法 | 为什么 |
| --- | --- | --- |
| 有限次 | 撤销 5 次/局、冻结 3 次/局 | 让「什么时候用」变成真正决策 |
| 可赚取但要付出 | 每累计 1000 总分 +1 次冻结 | 奖励技术而非奖励耐心 |
| 有时效 | 冻结只持续 5 次有效移动 | 不能"永久停掉半个棋盘"规避难度 |
| 不能刷 | 冻结奖励**不随撤销回退** | 堵死"撤销→重刷"无限循环 |
| 无效操作不惩罚 | 撞墙滑动不消耗资源、不计时 | 玩家不因手滑被扣东西 |

### UX 一致性原则（风格统一的真正核心）

**原则 1 · 双生镜像：对称即秩序** — 两盘完全同构镜像（同尺寸 / 同色板 / 同网格），同帧同步动画，共享总分居中、左右分数对称。可迁移规则：**多个并列玩法单元时，让它们在视觉上完全平等，共享指标放正中。**

**原则 2 · 语义按钮色编码：颜色 = 含义，全局唯一** — 每个功能绑定一个固定颜色，全游戏只代表这一件事：

| 功能 | 颜色 | 色值 | 语义直觉 |
| --- | --- | --- | --- |
| 撤销 | 天蓝 | `#7EC8E3` | 回退、过去、冷静 |
| 冻结 | 奶油黄 | `#FFC94D` | 暂停、按住、当心 |
| 重开 | 珊瑚橙 | `#F26D5B` | 重来、破坏性操作 |
| 开始 / 再来一局 | 草绿 | `#5FC25A` | 前进、确认、正向行动 |
| 禁用态 | 中性灰 | `#C9C9C9` | 现在不能点 |
| 次要功能（语言等） | 灰米 | `#D8C9B5` | 不抢注意力 |

三色 Toast 分级：常规（奶油黄底深字）/ 成功（薄荷绿底白字）/ 警示（珊瑚橙底白字）。可迁移规则：**先定 4–6 个语义色写死在配置文件，之后所有新按钮只能从表里挑色。**

**原则 3 · 一致的「按下反馈」语言（as-built）** — 按钮只有「常态 / 禁用灰态」两态，**按下时零动态效果**（不缩放、不加深、不下沉）。取而代之的是"按下瞬间就出结果"：pointerdown 那一刻功能立即执行，配一声极轻点击音。可迁移规则：**先定义"按下时会发生什么"这一句话，全游戏所有可点元素只用这一句。**

**原则 4 · 数字是首要标识，颜色只是辅助** — 方块永远有清晰数字，颜色只分段位；`32 / 64` 深底用白字、其余深字（不照抄经典 2048 低对比黄底白字）；**任何一次颜色变了，都必同时伴随文字或图标变化**（冻结→锁+步数、退役→DONE 文字、结算→大标题+副标题）。

**原则 5 · 低干扰：安静是一种尊重**

| 项目 | 默认状态 | 理由 |
| --- | --- | --- |
| 背景音乐 | **默认关** | 网页小游戏常在办公室/地铁打开，默认出声是冒犯 |
| 音效 | 默认开、音量轻 | 提供操作确认，不构成噪音 |
| 静音开关 | 左上角常驻小按钮（♪ / ✕），一键切换并记住 | 想静音 1 秒就能静音 |
| Toast | 停留约 0.7 秒后淡出上移，全程约 2 秒 | 说完就走，不挡棋盘 |
| Toast 堆叠 | 同屏**只保留最新一条** | 快速连点不糊屏 |
| 弹窗 | 全程只有 2 个（首次教程、切换难度确认） | 弹窗是打断，能不弹就不弹 |
| 广告 | 只在**失败结算**出现可选"看广告撤销 5 步" | 玩家最想继续时自己选，不强推 |
| 广告不可用时 | **整个按钮隐藏**，不留灰按钮 | 不让玩家白点一次再吃失败提示 |

### 如何移植（保留 / 可变 / 易翻车）

**必须保留（12 项识别码）**：糖果卡通轻松基调 · 语义色按钮编码 · 数字为主颜色为辅 · 颜色变化必配文字图标 · 一致的按下反馈语言 · 低干扰音频 · 短促 Toast 同屏只留一条 · 零启动成本 · 教程弹一次+?常驻 · 辅助"有限次+可赚取+防刷" · 中英双语就地切换 · 横竖屏都保持布局逻辑。

**可以自由更换**：玩法单元数量（单盘/三盘/6×6…）· 张力来源（限步/重力/属性）· 辅助种类（炸弹/换位/洗牌，但守支柱3）· 胜利目标 · 难度分档 · 具体色值（只要仍明亮低饱和暖调糖果感）· 广告触发点位（但必须玩家主动选、看完才给、不可用就隐藏）。

**最易翻车三点**：① 语义色被稀释（超 6 色时该合并功能而非加色）；② 按下反馈两套并存（新增元素前先确认守同一条规则）；③ 辅助变主导策略（每加辅助都问：能不能无限循环 / 配合撤销刷）。

### 新游戏风格自查表（节选关键项）

- [ ] 用一句话写下情绪身份，且含"轻松/愉快"类词；背景明亮暖调；主要元素圆角；字体圆润
- [ ] 已列语义色表（≤6 个），所有按钮取自该表，同一功能各界面同色
- [ ] 写下唯一一条"按下时会发生什么"，全部可点元素遵守；按下后功能立即执行
- [ ] 数字是首要标识；每次颜色变化都同时有文字/图标
- [ ] 音乐默认关、静音开关常驻可见且记住；无任何音频在玩家未操作时突然出现
- [ ] 从加载到能操作无首页无登录；首次教程 ≤4 条；辅助有限次且获取公开可预期；广告不可用就隐藏入口

---

## 二、视觉风格（整理：林绘澄）

> 这是一份「照抄配方」。所有色值、字号、圆角、动画时长都是**已跑通的实测值**。做下一款数字合并游戏时，把色板/字体/圆角/动画表直接搬进新项目的 `theme.js`，视觉风格就自动一致了。

### 一句话定位

> **「一块甜甜的糖，两颗一起跳」** —— 明亮、圆润、暖洋洋的**糖果卡通风**，让高强度的数字合并看起来轻松愉快。

| 关键词 | 含义 | 成品体现 |
| --- | --- | --- |
| **圆润 Round** | 拒绝尖角 | 方块圆角 = 格宽 25%；按钮圆角 = 高 30%（上限 18px）；徽章/侧标签纯胶囊 |
| **明亮 Bright** | 高明度低压抑 | 背景 90%+ 明度；深色只出现在遮罩和文字 |
| **温暖 Warm** | 全局暖色调 | 奶油→蜜桃→沙→橘→金黄一条暖主线；冷色只做功能语义 |
| **轻盈 Light** | 少阴影大留白 | **零投影零描边零渐变纹理**，全是实色圆角矩形（比经典 2048 更轻） |
| **双生 Twin** | 左右同构镜像 | 两盘同套绘制代码、同帧同长动画，只靠位置和小胶囊区分 |

### 2.1 方块色板 2 → 2048（含空格，全部取自 `theme.js`）

| 数值 | 背景 hex | 数字 hex | 字色规则 | 通俗说明 | 灰度明度 |
| --- | --- | --- | --- | --- | --- |
| **0 空格** | `#F3E7D3` | — | — | 沙色凹陷格 | 81 |
| **2** | `#FFF6E3` | `#6B5B3E` | 深字 | 奶油白，最浅 | 93 |
| **4** | `#FFEBC8` | `#6B5B3E` | 深字 | 麦穗黄 | 85 |
| **8** | `#FFC97B` | `#4A2A0E` | 深字 | 蜜橘 | 64 |
| **16** | `#FFA95E` | `#4A2A0E` | 深字 | 橘橙 | 50 |
| **32** | `#F75C40` | `#FFFFFF` | **白字** | 亮橘红 | 28 |
| **64** | `#E84A30` | `#FFFFFF` | **白字** | 深橘红 | 22 |
| **128** | `#FFE28A` | `#5C4700` | 深字 | 亮黄，进「黄金段位」 | 77 |
| **256** | `#FFD75E` | `#5C4700` | 深字 | 金黄 | 71 |
| **512** | `#FFC93C` | `#5C4700` | 深字 | 琥珀金 | 63 |
| **1024** | `#FFBC26` | `#5C4700` | 深字 | 深金黄 | 57 |
| **2048** | `#FFB014` | `#5C4700` | 深字 | **王者金**（成品无辉光，靠颜色收尾） | 52 |
| 超 2048 兜底 | `#3C3A32` | `#FFFFFF` | 白字 | 深炭色，防越界露白 | — |

**深/白字硬规则**：只有 **32 和 64 用白字**，其余用深字（`#6B5B3E` / `#4A2A0E` / `#5C4700`）。

**两段式结构（最值得抄的逻辑）**：第一段「加热」2→64 明度单调下降（93→22）；第二段「黄金」128→2048 **明度故意跳回高位 77** 再下降——这是刻意的「段位重置」信号（段内单调、段间跳变）。

### 2.2 主色板 / 语义按钮色 / 遮罩 / Toast

| 用途 | hex | 说明 |
| --- | --- | --- |
| 背景渐变 顶→底 | `#FFF9EF` → `#FFE6D2` | 暖奶油→蜜桃（方案 A 定稿） |
| 棋盘外框 / 空格 | `#E7D0A8` / `#F3E7D3` | 暖沙「托盘」 |
| 主/次/浅/白文字 | `#1F3A4D` / `#6B5B3E` / `#9C8F7C` / `#FFFFFF` | — |
| 撤销 / 冻结 / 重开 | `#7EC8E3` / `#FFC94D` / `#F26D5B` | 天蓝=回退 · 奶油黄=暂停 · 珊瑚橙=重来 |
| 开始·再来一局 | `#5FC25A` | 草绿=行动确认（⚠️ 对比度 2.25，见 §7.3） |
| 首页 / 全屏 / 语言 / 禁用 | `#2BC7A0` / `#8F7BFF` / `#D8C9B5` / `#C9C9C9` | 薄荷绿=回主菜单 · 蓝紫=系统功能 · 灰米=次要 · 灰=不可点 |
| 冻结 / 退役 / 结算遮罩 | `#1D3557`@55% / `#2A9D8F`@60% / `#1D3557`@78% | **统一深海军蓝，只调透明度分层级** |
| Toast 常规/成功/警示 | `#FFF3C4` / `#2BC7A0` / `#F26D5B` | 成功/警示为薄荷绿/珊瑚橙底白字（⚠️ 成功对比度 2.15） |

> **一个统一规律**：所有遮罩用同一支 `#1D3557`，只靠透明度分层级（55% 局部 → 60% 模态 → 78% 终局）。透明度越高 = 这件事越「终结」。

### 2.3 色卡示例（不打开游戏也能看懂配色逻辑）

<svg viewBox="0 0 680 560" xmlns="http://www.w3.org/2000/svg" font-family="Nunito, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFF9EF"/>
      <stop offset="100%" stop-color="#FFE6D2"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="680" height="560" fill="url(#bgGrad)"/>

  <text x="20" y="30" font-size="17" font-weight="700" fill="#1F3A4D">方块色阶梯 · 浅奶油 → 橘 → 红 → 金</text>
  <text x="20" y="50" font-size="12" fill="#6B5B3E">背景即真实渐变 #FFF9EF → #FFE6D2　｜　方块圆角 = 格宽 25%　｜　仅 32 / 64 用白字</text>

  <text x="20" y="76" font-size="12" font-weight="700" fill="#6B5B3E">第一段「加热」：明度一路下降 93 → 22</text>
  <g>
    <rect x="20" y="86" width="100" height="100" rx="25" fill="#FFF6E3"/>
    <text x="70" y="145" font-size="34" font-weight="800" fill="#6B5B3E" text-anchor="middle">2</text>
    <text x="70" y="202" font-size="11" fill="#6B5B3E" text-anchor="middle">#FFF6E3</text>
    <text x="70" y="216" font-size="10" fill="#9C8F7C" text-anchor="middle">深字 · 明度93</text>

    <rect x="132" y="86" width="100" height="100" rx="25" fill="#FFEBC8"/>
    <text x="182" y="145" font-size="34" font-weight="800" fill="#6B5B3E" text-anchor="middle">4</text>
    <text x="182" y="202" font-size="11" fill="#6B5B3E" text-anchor="middle">#FFEBC8</text>
    <text x="182" y="216" font-size="10" fill="#9C8F7C" text-anchor="middle">深字 · 明度85</text>

    <rect x="244" y="86" width="100" height="100" rx="25" fill="#FFC97B"/>
    <text x="294" y="145" font-size="34" font-weight="800" fill="#4A2A0E" text-anchor="middle">8</text>
    <text x="294" y="202" font-size="11" fill="#6B5B3E" text-anchor="middle">#FFC97B</text>
    <text x="294" y="216" font-size="10" fill="#9C8F7C" text-anchor="middle">深字 · 明度64</text>

    <rect x="356" y="86" width="100" height="100" rx="25" fill="#FFA95E"/>
    <text x="406" y="145" font-size="32" font-weight="800" fill="#4A2A0E" text-anchor="middle">16</text>
    <text x="406" y="202" font-size="11" fill="#6B5B3E" text-anchor="middle">#FFA95E</text>
    <text x="406" y="216" font-size="10" fill="#9C8F7C" text-anchor="middle">深字 · 明度50</text>

    <rect x="468" y="86" width="100" height="100" rx="25" fill="#F75C40"/>
    <text x="518" y="145" font-size="32" font-weight="800" fill="#FFFFFF" text-anchor="middle">32</text>
    <text x="518" y="202" font-size="11" fill="#6B5B3E" text-anchor="middle">#F75C40</text>
    <text x="518" y="216" font-size="10" font-weight="700" fill="#C4442C" text-anchor="middle">白字 · 明度28</text>

    <rect x="580" y="86" width="100" height="100" rx="25" fill="#E84A30"/>
    <text x="630" y="145" font-size="32" font-weight="800" fill="#FFFFFF" text-anchor="middle">64</text>
    <text x="630" y="202" font-size="11" fill="#6B5B3E" text-anchor="middle">#E84A30</text>
    <text x="630" y="216" font-size="10" font-weight="700" fill="#C4442C" text-anchor="middle">白字 · 明度22</text>
  </g>

  <text x="20" y="248" font-size="12" font-weight="700" fill="#6B5B3E">第二段「黄金」：明度故意跳回 77，再降到 52 —— 刻意的「段位重置」</text>
  <g>
    <rect x="20" y="258" width="100" height="100" rx="25" fill="#FFE28A"/>
    <text x="70" y="316" font-size="28" font-weight="800" fill="#5C4700" text-anchor="middle">128</text>
    <text x="70" y="374" font-size="11" fill="#6B5B3E" text-anchor="middle">#FFE28A</text>
    <text x="70" y="388" font-size="10" fill="#9C8F7C" text-anchor="middle">深字 · 明度77</text>

    <rect x="132" y="258" width="100" height="100" rx="25" fill="#FFD75E"/>
    <text x="182" y="316" font-size="28" font-weight="800" fill="#5C4700" text-anchor="middle">256</text>
    <text x="182" y="374" font-size="11" fill="#6B5B3E" text-anchor="middle">#FFD75E</text>
    <text x="182" y="388" font-size="10" fill="#9C8F7C" text-anchor="middle">深字 · 明度71</text>

    <rect x="244" y="258" width="100" height="100" rx="25" fill="#FFC93C"/>
    <text x="294" y="316" font-size="28" font-weight="800" fill="#5C4700" text-anchor="middle">512</text>
    <text x="294" y="374" font-size="11" fill="#6B5B3E" text-anchor="middle">#FFC93C</text>
    <text x="294" y="388" font-size="10" fill="#9C8F7C" text-anchor="middle">深字 · 明度63</text>

    <rect x="356" y="258" width="100" height="100" rx="25" fill="#FFBC26"/>
    <text x="406" y="314" font-size="24" font-weight="800" fill="#5C4700" text-anchor="middle">1024</text>
    <text x="406" y="374" font-size="11" fill="#6B5B3E" text-anchor="middle">#FFBC26</text>
    <text x="406" y="388" font-size="10" fill="#9C8F7C" text-anchor="middle">深字 · 明度57</text>

    <rect x="468" y="258" width="100" height="100" rx="25" fill="#FFB014"/>
    <text x="518" y="314" font-size="24" font-weight="800" fill="#5C4700" text-anchor="middle">2048</text>
    <text x="518" y="374" font-size="11" font-weight="700" fill="#6B5B3E" text-anchor="middle">#FFB014</text>
    <text x="518" y="388" font-size="10" font-weight="700" fill="#B07A00" text-anchor="middle">王者金 · 明度52</text>

    <rect x="580" y="258" width="100" height="100" rx="25" fill="#F3E7D3"/>
    <text x="630" y="314" font-size="13" font-weight="700" fill="#9C8F7C" text-anchor="middle">空格</text>
    <text x="630" y="332" font-size="11" fill="#9C8F7C" text-anchor="middle">0</text>
    <text x="630" y="374" font-size="11" fill="#6B5B3E" text-anchor="middle">#F3E7D3</text>
    <text x="630" y="388" font-size="10" fill="#9C8F7C" text-anchor="middle">凹陷格 · 明度81</text>
  </g>

  <text x="20" y="420" font-size="12" font-weight="700" fill="#6B5B3E">灰度还原：段内层次依然清晰，说明不依赖色相也能排序</text>
  <g>
    <rect x="20" y="430" width="55" height="34" rx="9" fill="#F6F6F6"/>
    <rect x="75" y="430" width="55" height="34" rx="9" fill="#EDEDED"/>
    <rect x="130" y="430" width="55" height="34" rx="9" fill="#D1D1D1"/>
    <rect x="185" y="430" width="55" height="34" rx="9" fill="#BBBBBB"/>
    <rect x="240" y="430" width="55" height="34" rx="9" fill="#8F8F8F"/>
    <rect x="295" y="430" width="55" height="34" rx="9" fill="#818181"/>
    <rect x="360" y="430" width="53" height="34" rx="9" fill="#E3E3E3"/>
    <rect x="413" y="430" width="53" height="34" rx="9" fill="#DADADA"/>
    <rect x="466" y="430" width="53" height="34" rx="9" fill="#CFCFCF"/>
    <rect x="519" y="430" width="53" height="34" rx="9" fill="#C6C6C6"/>
    <rect x="572" y="430" width="53" height="34" rx="9" fill="#BEBEBE"/>
    <text x="47" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">2</text>
    <text x="102" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">4</text>
    <text x="157" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">8</text>
    <text x="212" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">16</text>
    <text x="267" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">32</text>
    <text x="322" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">64</text>
    <text x="386" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">128</text>
    <text x="439" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">256</text>
    <text x="492" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">512</text>
    <text x="545" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">1024</text>
    <text x="598" y="478" font-size="10" fill="#9C8F7C" text-anchor="middle">2048</text>
    <line x1="355" y1="428" x2="355" y2="468" stroke="#C9BCA6" stroke-width="2" stroke-dasharray="4 3"/>
  </g>

  <text x="20" y="506" font-size="12" font-weight="700" fill="#6B5B3E">语义按钮色编码（颜色 = 功能含义，不是装饰）</text>
  <g>
    <rect x="20" y="516" width="96" height="32" rx="10" fill="#7EC8E3"/>
    <text x="68" y="537" font-size="13" font-weight="800" fill="#1F3A4D" text-anchor="middle">撤销</text>
    <rect x="126" y="516" width="96" height="32" rx="10" fill="#FFC94D"/>
    <text x="174" y="537" font-size="13" font-weight="800" fill="#5C4700" text-anchor="middle">冻结</text>
    <rect x="232" y="516" width="96" height="32" rx="10" fill="#F26D5B"/>
    <text x="280" y="537" font-size="13" font-weight="800" fill="#FFFFFF" text-anchor="middle">重开</text>
    <rect x="338" y="516" width="96" height="32" rx="10" fill="#5FC25A"/>
    <text x="386" y="537" font-size="13" font-weight="800" fill="#FFFFFF" text-anchor="middle">开始</text>
    <rect x="444" y="516" width="96" height="32" rx="10" fill="#8F7BFF"/>
    <text x="492" y="537" font-size="13" font-weight="800" fill="#FFFFFF" text-anchor="middle">全屏</text>
    <rect x="550" y="516" width="60" height="32" rx="10" fill="#D8C9B5"/>
    <text x="580" y="537" font-size="13" font-weight="800" fill="#1F3A4D" text-anchor="middle">语言</text>
    <rect x="616" y="516" width="64" height="32" rx="10" fill="#C9C9C9"/>
    <text x="648" y="537" font-size="13" font-weight="800" fill="#7A7A7A" text-anchor="middle">禁用</text>
  </g>
</svg>

### 2.4 字体方案（最终定稿）

**（A）通用 UI 栈 `FONT_STACK`**（标题/分数/按钮/Toast/遮罩）：
```
"Nunito", "Quicksand", "Varela Round",
"PingFang SC", "Microsoft YaHei", "SimHei",
"Segoe UI", system-ui, sans-serif
```
**（B）方块数字专用栈 `TILE_FONT`**（只给棋盘数字）：
```
"Arial Rounded MT Bold", "Segoe UI", "Verdana", system-ui, sans-serif
```
**关键决策：UI 与数字分离**。早期混用 `Comic Sans MS` 导致 Windows 数字观感变差，最终删掉它并给数字单开一条只含拉丁数字的栈（不被中文字体接管）。**全部系统字体，不引任何外网字体**（离线合规、零延迟）。字号层级只用 800(主)/600(副) 两档，档位收敛在 13/14/16/18/20/22/24/26/28/30/40。

### 2.5 圆角 / 棋盘比例 / 动画（成品实测）

| 元素 | 圆角规则 | 实际值 |
| --- | --- | --- |
| 方块 / 空格 | 格宽 × 25% | 格宽 80 → 20 |
| 棋盘外框 | ≈ 棋盘边长 × 3% | 约 12px |
| 按钮 | `min(18, 高 × 30%)` | 高 52 → 15.6；高 60 → 18 封顶 |
| 胶囊类（徽章/侧标签/分段） | 高 ÷ 2 | 高 32 → 16 |
| 教程面板 | 固定 20px | — |
| 全屏遮罩 | 0（直角） | — |

棋盘内部一条公式定死（任何屏幕不溢出）：`GAP_RATIO=0.05`（间距=格宽5%）、`PAD_RATIO=0.03`（内边距=边长3%），只给 `boardPx` 即自动算出格子/间距/内边距并居中。

| 动画 | 效果 | 时长 | 缓动 |
| --- | --- | --- | --- |
| **方块滑动** | 旧格→新格平移 | **110ms** | `Quad.easeOut` |
| **合并弹跳** | 放大后弹回 | 延迟 49.5ms → 放大 **1.18** 66ms → yoyo 66ms | `Quad.easeOut` |
| **新块弹出** | 0→1 缩放 | **110ms** | `Back.easeOut`（糖果感来源，别改） |
| **Toast** | 停留后淡出上移 | 停留 700ms → 淡出 1300ms 上移 26px | `Quad.easeIn` |
| 冻结/退役/结算遮罩 · 教程/确认框 · 按钮 | **即时，无过渡** | — | — |

> **动画哲学**：只给「方块本身」做动画，界面元素一律即时。方块动画负责手感，界面即时负责可靠性。双盘动画由同一次输入驱动，起点/时长/缓动完全一致（同帧播放）。

### 2.6 无障碍与对比度

达到 **Standard 级**：数字优先 + 灰度可辨 + 双输入通道（键盘/触屏）+ 文字状态提示。方块数字 11 档全测 ≥3:1；主/次文字达标；但**三处按钮/Toast 对比度不达标，新游戏必须修**：

| 问题项 | 现状 | 建议替代 | 修后 |
| --- | --- | --- | --- |
| 主 CTA 绿 `#5FC25A`+白 | 2.25 | 底加深 `#2F8B2C`+白字（推荐） | 4.33 ✅ |
| 重开珊瑚橙 `#F26D5B`+白 | 2.95 | 底加深 `#D9452F`+白 | 4.34 ✅ |
| Toast 成功绿 `#2BC7A0`+白 | 2.15 | 字改深青 `#0A3B31` | 5.81 ✅ |

> 验收方法：截图 → 转灰度 → 相邻两档能排序 = 色板通过；对比度检查器过一遍所有「底色+字色」组合 = 无障碍通过。

### 2.7 如何移植（五条可复用配方）

1. **暖色阶梯逻辑（抄结构不是抄色号）**：分段（2–64 加热 / 128–2048 黄金）→ 段内明度严格单调（相邻差 ≥5）→ 段间明度跳回高位换色族 → 字色跟明度走（>40 深字 / <40 白字）→ 留 `TILE_FALLBACK` 越界兜底。
2. **语义按钮色编码**：建「动词→颜色」映射表，按功能对号入座（见 §2.2）。
3. **圆润 + 无缩放**：圆角用比例不用固定值；**按钮永远不缩放**，要反馈用 `darken(color, 0.13)` 改填充色不动几何；动画只给方块，界面即时。
4. **代码绘制、零图片资源**：方块/按钮/遮罩全用 `Graphics.fillRoundedRect` 画，包体极小、任意分辨率清晰、改色=改常量。
5. **一个 `theme.js` 管住全部视觉**：所有颜色/字体/圆角/动画/尺寸集中到不依赖引擎的纯常量文件（本项目 `theme.js` 只导出常量和 `hexToStr`/`darken` 两个纯函数，Node 单测能跑）—— 这是「风格可复用」成立的前提。

**把色板映射到不同最大值的三种情况**：层数更少 → 从 12 档按顺序抽样（最大值必落 `#FFB014`）；层数更多（到 8192）→ 新增第三段「紫水晶段」（`#E3D3FA`/`#C9A7F5`/`#8558DC`，明度跳回 70→47→17）；不是 2 的幂 → 色板与档位序号绑定而非数值绑定。

---

## 三、音频风格（整理：阮和鸣）

> 全文数值均从成品代码 `src/audio.js`（已核对与交付包逐字节一致）逐行核出。一句话情绪：**「甜甜的糖、暖暖的光，轻轻摇摆不抢戏。」**

### 核心听觉身份（四条不可动摇的约束）

| # | 约束 | 通俗解释 |
| --- | --- | --- |
| 1 | **零外部音频文件，100% 运行时合成** | 没有 mp3/wav/ogg，声音是代码算出来的；包体零音频资产、零版权风险、可完全离线 |
| 2 | **反馈音一律"轻"** | 高频事件（每几秒响一次）比低频事件（庆祝音）轻 15–20 dB |
| 3 | **暖色音色，避开刺耳区** | 只用三角波/正弦波（圆润），能量避开 3–4 kHz 耳道共振区 |
| 4 | **音乐默认关** | 启动不出音乐，玩家手动开；契合自动播放限制 + 休闲玩家偏好安静 |

**隐藏语义规则（建议沿用）**：向下扫（高→低）= 物体掠过/离开/结束（`swipe` 1800→450Hz、`undo` 520→300Hz）；向上扫（低→高）= 界面打开/展开（`tutorialOpen` 440→660Hz）。成本为零，一致性收益大。

### 音乐方向

| 维度 | 定稿 |
| --- | --- |
| 整体情绪 | 温暖、卡通、calm-but-playful，绝不喧宾夺主 |
| 调性 | **C 大调 / G 大调，五声音阶** |
| 成品音阶 | `C4 E4 G4 A4 C5` = `[261.63, 329.63, 392.00, 440.00, 523.25]` Hz |
| 速度 | 目标 **88–108 BPM**（⚠️ 实现步长 380ms≈79BPM 偏慢，**新游戏建议 310ms≈97BPM**） |
| 配器 | 三角波"铃" + 正弦波"暖 pad"（低八度垫底） |
| 音量 | 音乐总线 **0.28**，比音效低约 10–14 dB |

BGM 场景行为：菜单略亮变体 / 对局低音量氛围床 / 胜利短促明亮 stinger / 失败柔和下行 stinger / **切后台停音乐、回前台若开关开则重启** / **广告期间整体静音**（见下）。

### 最终 SFX 事件表（成品版 13 个事件）

| # | 事件 | 触发时机 | 音色性格 | 优先级 |
| --- | --- | --- | --- | --- |
| 1 | `swipe` | 有效移动 | **轻柔气流"嗖"** whoosh，向下扫频 | C（最轻） |
| 2 | `invalidMove` | 无效移动 | 极轻低沉"不行" | C |
| 3 | `win` | 胜利结算 | **明亮上行琶音** | A |
| 4 | `lose` | 失败结算 | **柔和下行三音** | A |
| 5 | `boardRetire` | 休闲单盘退役 | **温暖"叮+大三度轻和弦"** | A |
| 6 | `undo` | 撤销成功 | **轻柔倒带**下行滑音 | B |
| 7 | `freezeActivate` | 冻结成功 | **水晶微光 shimmer** | A |
| 8 | `freezeTick` | 冻结步数−1 | 极轻高频 blip | C |
| 9 | `buttonTap` | **所有按钮** | **统一柔和小点击** | B |
| 10 | `languageSwitch` | 中/EN 切换 | **与 `buttonTap` 完全相同** | B |
| 11 | `difficultySwitch` | 难度切换 | **双音下行切换** 700→560Hz | B |
| 12 | `tutorialOpen` | 教程打开 | 友好"噗开"上扫 | B |
| 13 | `newBest` | 破纪录 | **明亮单铃 ding** | A |

**精确合成参数（定稿值，可直接照抄）**：

| 事件 | 配方 |
| --- | --- |
| `swipe` | `_noise{ dur 0.11, peak 0.038, band 1800, q 1.3, sweepTo 450 }`（单层；可听区实际 1669→868Hz、约 58ms） |
| `invalidMove` | `_tone{ sine, 320Hz, dur 0.08, peak 0.08, attack 0.003, release 0.07 }` |
| `win` | 5×`_tone{ triangle, dur 0.22, peak 0.20 }`，音序 `C4 E4 G4 C5 E5`，逐音 `+i×0.11` |
| `lose` | 3×`_tone{ sine, dur 0.32, peak 0.18 }`，音序 `A4 F4 D4`，逐音 `+i×0.16` |
| `boardRetire` | `_tone{ triangle, 261.63 }` + `_tone{ triangle, 329.63, when +0.04 }`（C–E 大三度） |
| `undo` | `_tone{ sine, 520 → glideTo 300, dur 0.16, peak 0.16 }` |
| `freezeActivate` | `_tone{ sine, 1200, dur 0.30, peak 0.15, detune +8 }` + `_tone{ sine, 1800, when +0.03 }` |
| `freezeTick` | `_tone{ sine, 1500, dur 0.03, peak 0.08 }` |
| `buttonTap` | `_tone{ triangle, 700, dur 0.10, peak 0.12 }` |
| `languageSwitch` | **同 `buttonTap`** |
| `difficultySwitch` | `_tone{ triangle, 700 }` + `560Hz, when +0.07` |
| `tutorialOpen` | `_tone{ sine, 440 → glideTo 660 }` + `_noise{ dur 0.18, band 900, sweepTo 1600 }`（上扫） |
| `newBest` | `_tone{ triangle, 1046.5 (C6), dur 0.40, peak 0.18 }` |

**相对响度地图（最该照抄的一张表）**：`win`/`newBest` 比 `swipe` **+20dB**；`buttonTap`/`difficultySwitch`/`undo` **+15dB**；`invalidMove`/`freezeTick` +13~18dB；**`swipe` 是最轻的基准（约 −33dBFS）**。**黄金律：一局触发越频繁的音越轻。**

### ⚠️ 未实现 / 已移除的事件（移植前必读）

| 草案事件 | 实现状态 | 说明 |
| --- | --- | --- |
| **`merge`（合并音）** | ❌ **已移除** | ITER-V12-001 移除；`src/audio.js` 无 `case 'merge'`，全项目零调用点，调用即静默 |
| `tileSpawn` / `freezeBonus` / `adStart` / `adEnd` | ❌ 从未实现 | 新块音建议继续不做（纯噪声源）；广告改为整体静音处理 |

**为什么砍掉合并音**：一次滑动同时驱动两盘，单回合可能炸 5–8 声"啵"变成噪音团。**这是双盘专属决策，不要无条件继承**——

| 新游戏结构 | 建议 |
| --- | --- |
| **单盘**（经典 2048） | ✅ **加回合并音**，按数值分档（管道现成：`board.js` 已返回 `merges[]`/`maxMerge`，接 `play('merge', {value: maxMerge})` 一行即可） |
| 双盘/多盘/连锁 | ⚠️ 要么不做，要么同回合只取最高档 1 声，或沿用本作只留 whoosh |

### 程序化合成方法（为什么坚持零音频文件）

所有声音由 Web Audio API 运行时"算"出来，不加载任何音频文件（`assets/` 下零音频文件）。两个原语：`_tone`（振荡器+包络，有音高）与 `_noise`（滤波白噪声，气声）。好处：离线自包含 / 零版权风险 / 体积 0KB / 动态可调（音高随数值实时变）/ 听觉一致。**代价**：做不了写实音色、BGM 难有记忆点、需约 400 行 AudioManager（本项目 `src/audio.js` 可直接整份复制）。对"卡通+益智+网页"组合几乎零缺点。

### 混音总线与播放策略

```
Master Gain（静音→0）→ DynamicsCompressor（软限幅）→ destination
  ├─ Music Gain = 0.28（默认关）
  └─ SFX Gain   = 0.80（全部音效）
```
- 无 3D 空间化（2D 固定视角）；SFX 同时发声预算 ≤12 voice，音乐 ≤6 voice。
- **静音开关**：单一持久键 `localStorage: dual2048.muted`（'1'=静音）→ Master→0；HUD 内 30×30 按钮 ♪/✕ 即时切换。
- **广告**：`muteForAd()` → Master 直接置 0（整体静音），`unmuteFromAd()` 恢复用户偏好（⚠️ 非草案写的 duck；`duckMusic()` 生产零调用）。
- **自动播放策略**：AudioContext 加载即 suspended，首次用户手势（pointerdown/方向键）`resume()` 解锁；不可用时所有音频方法 no-op 不抛错。

### 如何移植

**原样保留**：`src/audio.js` 整份复制（不依赖 Phaser）· 轻 whoosh 移动音（参数一个数别改）· 音乐默认关+单一静音键 · 总线比例（音乐0.28/音效0.80）· 末端软限幅 · 响度层级 · 扫频方向语义。

**合并音分档（单盘必做）**：合并后数值每翻一倍音高跳一档，吸附到 C 大调五声音阶（永不刺耳）。推荐音阶梯 `[261.63, 329.63, 392.00, 440.00, 523.25, 659.25, 783.99, 880.00, 1046.50, 1318.51]`（C4→E6，10 档对应 4→2048）。映射公式 `tier = clamp(round((log2(v)−log2(min))/(log2(max)−log2(min)) × 9), 0, 9)`；峰值随档 `peak = 0.16 − tier×0.0056`（高音天生更响，需压低）；同回合只播最高档 1 声。

**必须改 / 必须补**：`localStorage` 键名前缀改新游戏名 · 音乐步长 380→310ms · **补音乐开关 UI 按钮**（本作缺失）· 触发点接线到新游戏 `handleMove`/`endGame`/按钮回调。

### 示例：声音怎么被代码"造"出来

**移动音 swipe whoosh（交付定稿）**——拿一张纸从桌面轻扫过：无音高、一股气声、从明亮迅速变低沉、一眨眼、极小声。三步：① 造 110ms 白噪声 → ② 带通滤波中心 1800→450Hz 下扫（Q=1.3，产生运动感）→ ③ 增益包络 6ms 升到 0.038 再指数衰减。一行代码：`this._noise({ dur: 0.11, peak: 0.038, band: 1800, q: 1.3, sweepTo: 450 });`。**调音纪律**：嫌听不清只调 `peak`（轻 0.026 / 标准 0.038 / 亮 0.052），**永远不要为提高 `band` 让它变刺耳**。

**合并音 pop（给单盘新游戏的骨架）**：`triangle` 振荡器，频率 = 五声音阶档位，`glideTo = freq×1.05`（弹性"啵"），attack 3ms、release 120ms、dur 0.14、`peak = 0.16 − tier×0.0056`，送 SFX 总线；只播 `maxMerge` 一声。

---

## 附录：一页速查（三节合并）

```
【背景】   渐变 顶 #FFF9EF → 底 #FFE6D2   HTML body #FFF9EF
【棋盘】   外框 #E7D0A8   空格 #F3E7D3   gap=格宽×5%  pad=边长×3%  格圆角=格宽×25%
【方块】   2 #FFF6E3/#6B5B3E   4 #FFEBC8/#6B5B3E   8 #FFC97B/#4A2A0E
          16 #FFA95E/#4A2A0E  32 #F75C40/#FFFFFF  64 #E84A30/#FFFFFF
         128 #FFE28A/#5C4700 256 #FFD75E/#5C4700 512 #FFC93C/#5C4700
        1024 #FFBC26/#5C4700 2048 #FFB014/#5C4700 越界 #3C3A32/#FFFFFF
         白字仅 32/64   数字字号=格宽×42%（≥1000 ×0.78，≥10000 ×0.62）
【文字】   主 #1F3A4D  次 #6B5B3E  浅 #9C8F7C  白 #FFFFFF
【按钮】   撤销 #7EC8E3  冻结 #FFC94D  重开 #F26D5B  开始 #5FC25A
         首页 #2BC7A0  全屏 #8F7BFF  语言 #D8C9B5  禁用 #C9C9C9
         圆角 min(18, h×0.3)   控制条 120×52（最小宽72）   按下：零动效即时响应
【遮罩】   冻结 #1D3557@55%  退役 #2A9D8F@60%  结算 #1D3557@78%（统一深海军蓝只调透明度）
【Toast】  常规 #FFF3C4/#5C4700  成功 #2BC7A0/#FFFFFF  警示 #F26D5B/#FFFFFF
         22px/800  停留700ms→淡出1300ms上移26px  同屏仅1条
【字体】   UI:   "Nunito","Quicksand","Varela Round","PingFang SC","Microsoft YaHei","SimHei","Segoe UI",system-ui,sans-serif
         数字: "Arial Rounded MT Bold","Segoe UI","Verdana",system-ui,sans-serif
         字重只用 800(主)/600(副)
【动画】   滑动 110ms Quad.easeOut   新块 110ms Back.easeOut（糖果感来源，别改）
         合并 延迟45%后放大 1.18 再 yoyo  遮罩/弹窗/按钮：即时无过渡
【音频】   零文件·运行时合成   移动音 _noise{band1800→450,Q1.3,110ms,peak0.038}
         buttonTap 纯 triangle 700Hz   音乐默认关(Master0.28/SFX0.80)
         广告=Master→0 整体静音（非duck）   合并音已移除(单盘新游戏建议加回)
【无障碍】  数字优先+灰度可辨+状态必带文字+键盘/触屏双通道
         待修对比度：开始绿2.25→#2F8B2C(4.33)  重开2.95→#D9452F(4.34)
                   Toast成功2.15→字改#0A3B31(5.81)
```

### 移植必做清单（照着打勾）

- [ ] 复制 `theme.js` + `audio.js` 到新项目（改色板档位、按钮常量、键名前缀）
- [ ] 背景渐变与字体栈原样搬（HTML CSS 与 Canvas 用同一串）
- [ ] 方块 = 一次 `fillRoundedRect` + 居中 Text；按钮 = 一次 `fillRoundedRect` + Text
- [ ] 动画收进 `theme.js` 的 `ANIM` 表（本项目散在 view.js，是可改进点）
- [ ] **修三处对比度**（一开始就用修正值，别重复遗留）
- [ ] **补音乐开关 UI 按钮**（本作缺失，否则 BGM 永不可闻）
- [ ] 单盘 → **加回合并音**并按数值分档；双盘 → 保持只留 whoosh
- [ ] 所有可见文字过 i18n（本作冻结/退役遮罩中文硬编码）
- [ ] 验收：截图转灰度相邻档能排序 = 色板通过；对比度检查器过一遍 = 无障碍通过

---

*本手册由主理人游承峰汇编自《Double 2048: Dual Challenge》v1.0.0 成品代码（as-built），未改动任何现有文件。三节分别由 文策渊 / 林绘澄 / 阮和鸣 整理。凡标 ⚠️ 处为「草案有、成品无」或「已交付但建议新游戏改进」，可据以决定继承或修正；凡与早期 `art-bible.md` / `audio-bible.md` 冲突，以本手册为准。*
