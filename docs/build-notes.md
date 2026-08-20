# 构建说明 · Simultwin（双盘同步 2048）· 可玩原型

> 状态：第一版**可玩原型**（非完整产品）。验证了双盘同步手感、撤销/冻结、基本视觉与基础集成。
> 广告、教程、埋点、完整美术/音频将在后续阶段补充。

## 1. 底座与引擎

- **引擎**：Phaser 3.80.1（本地化于 `vendor/phaser.min.js`，无 webpack / 无构建工具，纯静态站点，无外网依赖）。
- **底座决策**：评估了候选仓库 `liurongqing/2048`（Phaser3 + webpack，单盘）。
  由于本作要求 **(a) 免构建的静态站点** 与 **(b) 双盘同步 / 冻结 / 撤销等专属逻辑**（候选仓库均不具备），
  最终**从零基于标准 2048 算法（Gabriele Cirulli 风格的 Tile 追踪法）实现核心**，双盘逻辑封装为可复用 `Board` 类，便于后续美术/音频/集成接入。
- **字体**：圆体感无衬线字体栈（Nunito / Quicksand / 系统圆体回退），不加载任何外部字体文件；`main.js` 在 `document.fonts.ready` 后启动（带 2s 超时兜底）。

## 2. 文件结构

```
minigame-Dual 2048/
├─ index.html            # 入口：本地 Phaser（vendor）+ 游戏脚本，零外链
├─ src/
│  ├─ board.js           # 纯逻辑 4x4 棋盘（Tile + Board），无 Phaser 依赖，可单测
│  ├─ assist.js          # 辅助系统：UndoManager(定长环形缓冲) + FreezeManager
│  ├─ integration.js      # 可选集成适配层（typeof 守卫，无集成对象时静默 no-op）
│  ├─ ui.js              # 轻量 UI：圆角 Button + Toast
│  ├─ input.js           # 输入：方向键 + 触屏滑动（点击/轻触分离回调）
│  ├─ view.js            # BoardView：单盘视觉（卡通圆角 + 同步动画 + 冻结遮罩）
│  ├─ audio.js           # WebAudio 实时合成音效（无音频文件）
│  ├─ game.js            # DualGame 主逻辑：双盘同步、胜负、撤销/冻结交互、HUD、结算
│  └─ main.js            # Phaser 配置 + 字体守卫 + 集成初始化
└─ docs/
   └─ build-notes.md     # 本文件
```

## 3. 如何本地运行

无需安装依赖、无需构建。任选其一：

```bash
# 方式 A：Python（推荐）
cd "minigame-Dual 2048"
python -m http.server 8000
# 浏览器打开 http://localhost:8000/

# 方式 B：Node
npx serve .
```

> 必须通过 **http(s) 服务器** 访问（ES Module + 字体/CORS 要求），直接双击 `index.html`（file://）会因模块跨域而失败。
> 预览 URL（本地）：**http://localhost:8000/**

## 4. 玩法与系统实现对照

| 需求 | 实现位置 | 备注 |
|---|---|---|
| 双盘并排 / 竖屏堆叠 | `game.js` `layout()` | 按视口横竖自动重排；`Scale.RESIZE` 自适应 |
| 方向键 / 滑动同步操作双盘 | `input.js` + `game.js.handleMove` | 两盘同帧结算、动画起点与时长一致 |
| 有效操作后 90%/10% 生成（仅移动盘） | `board.js.addRandomTile` + `game.js` | 未移动盘不生成、不加分 |
| 胜利：任一盘 ≥2048 | `game.js.handleMove` `maxTile()` | 先判胜 |
| 失败：硬核=任一盘死局 / 休闲=双盘死局 | `game.js.checkLose` | 先胜后负 |
| 撤销 5 次 + 广告激励桩 | `assist.js.UndoManager` + `game.js.onUndoClick` | 定长环形缓冲（capacity 40）防内存增长；耗尽时 `requestAd('rewarded')` 仅 console.log 占位 |
| 冻结 3 次 + 选盘 + 5 步倒计时 + 每1000分+1 | `assist.js.FreezeManager` + `game.js` | 冻结中该盘忽略输入；归零自动解除；得分奖励触发 Toast |
| 卡通圆角视觉 + 滑动/合并/弹出动画 | `view.js` | 圆角方块、ease-out 滑动、合并弹跳、新块弹出 |
| 可选集成（默认关闭） | `index.html` + `integration.js` | `gameLoaded()` / `gameStarted()` 兼容别名；缺集成对象时全部静默 no-op；广告桩不弹窗 |

## 5. 已知限制（原型级）

- **网络依赖**：无。Phaser 已本地化（`vendor/phaser.min.js`），字体走系统字体栈回退，音效由 WebAudio 实时合成，完全可离线运行；可选集成层在缺失时静默 no-op。
- **冻结步数计数口径**：采用“每次**有效全局移动** -1”（任一盘发生移动即计一步）。若希望“每次方向键按下都计”，属一行改动，可在 `game.js.handleMove` 调整。
- **冻结奖励与撤销**：`lastMilestone` 为单调里程碑、不参与撤销回滚，因此撤销不会刷出额外冻结次数（符合防刷预期）；代价是撤销到 1000 分阈值之前会同时回退已获得的奖励冻结次数。
- **视觉/音效**：纯色块 + 系统/网络圆体，无图片/音频资源；未做教程与广告真实接入。
- **埋点/分析**：未接入（后续阶段）。
- **浏览器实测**：核心算法已用 Node 跑通 29 项断言（合并、胜负、序列化、冻结、撤销环形缓冲）；渲染/动画需在浏览器中最终确认（本环境无头，未跑浏览器端 E2E）。

## 6. 后续接入提示

- **美术**：`view.js` 的 `COLORS` 表与 `drawBackground()` / `paintTile()` 是改配色与圆角的唯一入口。
- **音频**：在 `game.js.handleMove`（合并/生成）与 `endGame`（胜/负）处挂载音效钩子即可。
- **集成**：所有可选集成调用集中在 `integration.js`，真实广告把 `requestAd` 内的注释代码解注释即可；不接入任何集成时游戏照常完整可玩。

---

## 工程约定与本地运行

> 本节记录仓库本身的工程约定（哪些文件不纳入版本控制、为何不需要额外工具链）与本地运行 / 测试方法。所有结论均经逐文件核实。

### 1. `.gitignore` 决策说明

根目录的 `.gitignore` 分多节、带中文注释。核心目的是把「本机专属」或「可再生成」的东西挡在版本控制之外，只保留构成游戏本身的源码与素材。

| 忽略对象 | 理由 |
|---|---|
| `psproc.txt`、`suspects.txt` | **安全红线**。前者含本机全部运行进程、完整命令行与软件安装路径；后者含 QQMusic / Weixin / WPS / NVIDIA 安装路径，且路径中带 Windows 用户名 `10955`。属个人信息泄露，公开仓库一旦收录，爬虫会永久留存 |
| `psdiag.txt`、`sync.txt` | 无隐私，但只是几行调试输出，属无意义残留 |
| `build/` | 见下方专项说明 |
| `*.zip` | 早期打的打包文件（364KB）已废弃，不再需要。已全库确认仅此 1 个 zip，通配不会误伤 |
| `tools/_gen.log`、`tools/_fonts.txt`、`*.log` | 脚本运行副产品，属「上次在你电脑上跑出来的结果」。`tools/` 下的脚本本身照常纳入 |
| `.workbuddy/` | 见下方专项说明 |
| OS/编辑器噪音、`node_modules/`、`__pycache__/`、`*.log`、`.env` | 常规忽略；Node 与 `.env` 两节是**预防性**的，当前项目并不存在这些文件 |

#### 1.1 专项决策：`build/` **不纳入版本控制**（明确结论）

用 `diff -rq` 对 `index.html`、`src/`、`vendor/` 与 `build/` 下的对应内容做了逐字节比对，**结果完全一致，零差异**——`build/` 就是纯拷贝，没有任何编译、压缩、转译。

结论是**不纳入**，三条理由：

1. **纯重复内容，且会制造双份 diff**。仓库凭空多 1.4MB；更麻烦的是以后每改一次 `src/`，都要产生「源码 + 拷贝」两份一模一样的改动记录，代码审查噪音翻倍，还容易出现「改了 src 忘了同步 build」的版本不一致事故。
2. **重新生成成本≈0**。虽然项目确实没有构建脚本，但"构建"就是一条命令：`rm -rf build && mkdir -p build && cp -r index.html src vendor build/`。
3. **入口 `index.html` 本就在仓库根目录，资源引用全是相对路径**，不需要维护第二份拷贝。

> 若日后改主意，删掉 `.gitignore` 里的 `build/` 那一行即可。

#### 1.2 专项决策：`.workbuddy/` 默认忽略（可逆）

`.workbuddy/memory/*.md` 是 AI 协作的每日工作日志，包含内部讨论过程、阶段性结论，以及本机绝对路径（会暴露 Windows 用户名）。**默认忽略**，理由是它属于「过程草稿」而非游戏成品，且含本机路径。

但这是个**可逆的取舍**：若想公开，删掉 `.gitignore` 里的 `.workbuddy/` 一行即可——**删之前请先通读一遍这些 md**，确认没有绝对路径（形如 `C:\Users\10955...`）、密钥或私人信息。

### 2. 仓库体积评估：**不需要 Git LFS**

按 `.gitignore` 过滤后的实际入库体积：**55 个文件 / 约 5.08 MB**。

| 目录 | 入库体积 | 占比 | 说明 |
|---|---|---|---|
| `assets/` | 2036 KB | 39% | 静态素材：封面 3 张 + 图标 3 张 + 首帧 2 张 + 实拍截图 3 张 |
| `preview/` | 1419 KB | 27% | 两支 18s 预览视频（mp4） |
| `vendor/` | 1154 KB | 22% | `phaser.min.js`，单个最大文件 |
| `docs/` | 207 KB | 4% | 工程文档 |
| `src/` | 151 KB | 3% | 游戏源码 13 个文件 |
| `design/` | 116 KB | 2% | GDD / art-bible / audio-bible |
| `tests/` | 62 KB | 1% | 9 套 Node 原生测试 |
| `tools/` | 22 KB | <1% | 3 个生成脚本（已剔除日志） |

**判断依据**（对照 Git 官方限制）：

- 单文件 **100MB 硬限制** / 50MB 警告线 → 本项目最大文件 `vendor/phaser.min.js` 仅 **1.13MB**，距离警告线还差 44 倍，安全。
- 仓库 **1GB 建议上限** → 当前 5.08MB，用了 **0.5%**。
- LFS 的适用场景是「大型二进制资源反复修改」（如几十 MB 的贴图、音频、模型）。本项目的二进制文件（png/mp4）属静态素材，基本一次定稿不再改动，不会撑大历史。

**结论：无需 Git LFS，直接普通提交即可。**

### 3. 本地运行说明

#### 3.1 为什么不能双击 `index.html` 直接打开

用 `file://` 协议打开会**白屏**，有两个原因：

1. **ES Module 的 CORS 限制（主因）**：`index.html` 用 `<script type="module" src="./src/main.js">` 加载游戏，而 ES Module 强制走 CORS 检查。`file://` 协议下页面来源是 `null`，浏览器会直接拒绝加载模块并报 `Cross-origin request blocked`。注意 `vendor/phaser.min.js` 是普通脚本，反而能加载成功——所以现象是「Phaser 加载了但游戏没起来」。
2. **Web Audio 的上下文限制**：`audio.js` 全靠 WebAudio 实时合成音效，`AudioContext` 在 `file://` 下行为不一致，且需要用户手势才能启动。

**必须通过 http(s) 本地服务器访问。**

#### 3.2 两种最简起服务方式（Windows Git Bash 可直接执行）

```bash
# ── 方式 A：Python（推荐）──
cd "minigame-Dual 2048"
python -m http.server 8000
# 然后浏览器打开：http://localhost:8000/
```

```bash
# ── 方式 B：Node ──
npx serve "minigame-Dual 2048" -l 8000
# 然后浏览器打开：http://localhost:8000/
```

> **路径含空格必须加引号**：文件夹名 `minigame-Dual 2048` 中间有空格，不加引号 shell 会拆成两个参数从而报错。停止服务器：在终端按 `Ctrl + C`。

#### 3.3 跑测试

```bash
cd "minigame-Dual 2048"
node --test tests/
# 9 套件，无需 npm install（用的是 Node 原生测试运行器）
```
