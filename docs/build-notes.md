# 构建说明 · 双倍 2048：双重挑战（可玩原型）

> 状态：第一版**可玩原型**（非完整产品）。验证了双盘同步手感、撤销/冻结、基本视觉与平台最小接入。
> 广告、教程、埋点、完整美术/音频将在后续阶段补充。

## 1. 底座与引擎

- **引擎**：Phaser 3.80.1（本地化于 `vendor/phaser.min.js`，无 webpack / 无构建工具，纯静态站点，无外网依赖）。
- **底座决策**：评估了候选仓库 `liurongqing/2048`（Phaser3 + webpack，单盘）。
  由于本作要求 **(a) 免构建的 CDN 静态站点** 与 **(b) 双盘同步 / 冻结 / 撤销等专属逻辑**（候选仓库均不具备），
  最终**从零基于标准 2048 算法（Gabriele Cirulli 风格的 Tile 追踪法）实现核心**，双盘逻辑封装为可复用 `Board` 类，便于后续美术/音频/发布专员接入。
- **字体**：圆体感无衬线字体栈（Nunito / Quicksand / 系统圆体回退），不加载任何外部字体文件；`main.js` 在 `document.fonts.ready` 后启动（带 2s 超时兜底）。

## 2. 文件结构

```
minigame-Dual 2048/
├─ index.html            # 入口：本地 Phaser（vendor）+ 游戏脚本，零外链
├─ src/
│  ├─ board.js           # 纯逻辑 4x4 棋盘（Tile + Board），无 Phaser 依赖，可单测
│  ├─ assist.js          # 辅助系统：UndoManager(定长环形缓冲) + FreezeManager
│  ├─ platform.js      # 可选平台集成层（typeof 守卫，无平台对象时静默 no-op）
│  ├─ ui.js              # 轻量 UI：圆角 Button + Toast
│  ├─ input.js           # 输入：方向键 + 触屏滑动（点击/轻触分离回调）
│  ├─ view.js            # BoardView：单盘视觉（卡通圆角 + 同步动画 + 冻结遮罩）
│  ├─ audio.js           # WebAudio 实时合成音效（无音频文件）
│  ├─ game.js            # DualGame 主逻辑：双盘同步、胜负、撤销/冻结交互、HUD、结算
│  └─ main.js            # Phaser 配置 + 字体守卫 + 平台集成初始化
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
| 撤销 5 次 + 看广告桩 | `assist.js.UndoManager` + `game.js.onUndoClick` | 定长环形缓冲（capacity 40）防内存增长；耗尽时 `Platform.requestAd('rewarded')` 仅 console.log 占位 |
| 冻结 3 次 + 选盘 + 5 步倒计时 + 每1000分+1 | `assist.js.FreezeManager` + `game.js` | 冻结中该盘忽略输入；归零自动解除；得分奖励触发 Toast |
| 卡通圆角视觉 + 滑动/合并/弹出动画 | `view.js` | 圆角方块、ease-out 滑动、合并弹跳、新块弹出 |
| 可选平台集成（默认关闭） | `index.html` + `platform.js` | `gameLoaded()` / `gameStarted()` 兼容别名；缺平台对象时全部静默 no-op；广告桩不弹窗 |

## 5. 已知限制（原型级）

- **网络依赖**：无。Phaser 已本地化（`vendor/phaser.min.js`），字体走系统字体栈回退，音效由 WebAudio 实时合成，完全可离线运行；可选平台集成层在缺失时静默 no-op。
- **冻结步数计数口径**：采用“每次**有效全局移动** -1”（任一盘发生移动即计一步）。若希望“每次方向键按下都计”，属一行改动，可在 `game.js.handleMove` 调整。
- **冻结奖励与撤销**：`lastMilestone` 为单调里程碑、不参与撤销回滚，因此撤销不会刷出额外冻结次数（符合防刷预期）；代价是撤销到 1000 分阈值之前会同时回退已获得的奖励冻结次数。
- **视觉/音效**：纯色块 + 系统/网络圆体，无图片/音频资源；未做教程与广告真实接入。
- **埋点/分析**：未接入（后续阶段）。
- **浏览器实测**：核心算法已用 Node 跑通 29 项断言（合并、胜负、序列化、冻结、撤销环形缓冲）；渲染/动画需在浏览器中最终确认（本环境无头，未跑浏览器端 E2E）。

## 6. 后续接入提示

- **美术**：`view.js` 的 `COLORS` 表与 `drawBackground()` / `paintTile()` 是改配色与圆角的唯一入口。
- **音频**：在 `game.js.handleMove`（合并/生成）与 `endGame`（胜/负）处挂载音效钩子即可。
- **发布 / 平台集成**：所有可选平台调用集中在 `platform.js`，真实广告把 `requestAd` 内的注释代码解注释即可；不接入任何平台时游戏照常完整可玩。

---

## GitHub 仓库与在线部署（2026-08-08）

> **文档时效性提示**：上面第 1～6 节写于最早的原型阶段，部分描述已过时（例如 §1/§2/§5 提到
> Phaser 与字体走 CDN、存在 `menu.js`）。当前实际状态是：**Phaser 已本地化为
> `vendor/phaser.min.js`（1.13MB），无 CDN 依赖；无 `menu.js`（已去首页，直接启动 GameScene）；
> 音效全部由 WebAudio 实时合成，项目不加载任何图片/音频资源文件。**
> 本节内容以当前实际代码为准（所有结论均经过逐文件核实）。

本节记录开源发布到 GitHub 的技术决策，覆盖三件事：哪些文件不上传、在线 Demo 怎么部署、仓库体积是否需要特殊处理。

### 1. `.gitignore` 决策说明

根目录新增了 `.gitignore`，分 9 节、带中文注释。实测结果：**80 个文件中忽略 25 个、入库 55 个**，
且经 `git check-ignore` 逐条验证——该忽略的全部命中，`src/` `vendor/` `assets/` `preview/`
`tests/` `docs/` `design/` `tools/`(脚本) 无一被误伤。

| 忽略对象 | 理由 |
|---|---|
| `psproc.txt`、`suspects.txt` | **安全红线**。前者含本机全部运行进程、完整命令行与软件安装路径；后者含 QQMusic / Weixin / WPS / NVIDIA 安装路径，且路径中带 Windows 用户名 `10955`。属个人信息泄露，公开仓库一旦收录，爬虫会永久留存，Git 历史也极难彻底清除 |
| `psdiag.txt`、`sync.txt` | 无隐私，但只是几行调试输出（`RO_before[platform.js]=False` 之类），属无意义残留 |
| `build/` | 见下方专项说明 |
| `*.zip` | `double-2048-v1.0.0.zip`（364KB）是废弃发布包，平台不收 zip。已全库确认仅此 1 个 zip，通配不会误伤 |
| `tools/_gen.log`、`tools/_fonts.txt`、`*.log` | 脚本运行副产品，属「上次在你电脑上跑出来的结果」。`tools/` 下的脚本本身照常上传 |
| `.workbuddy/` | 见下方专项说明 |
| OS/编辑器噪音、`node_modules/`、`__pycache__/`、`.env` | 常规忽略；Node 与 `.env` 两节是**预防性**的，当前项目并不存在这些文件 |

> **关于 `ps*.txt` 通配写法**：评估后**不采用**。当前只有固定的 4 个诊断文件，显式逐个列出更精确；
> 而通配会把未来任何以 `ps` 开头的 txt 一并吞掉（例如 `psd-notes.txt`），出问题时极难排查。
> 已改为「显式 4 行 + 未来统一用 `_diag-` 前缀」的方案。

#### 1.1 专项决策：`build/` **不入库**（明确结论）

先摆事实：用 `diff -rq` 对 `index.html`、`src/`、`vendor/` 与 `build/` 下的对应内容做了逐字节比对，
**结果完全一致，零差异**——`build/` 就是纯拷贝，没有任何编译、压缩、转译。

结论是**不上传**，三条理由：

1. **纯重复内容，且会制造双份 diff**。仓库凭空多 1.4MB；更麻烦的是以后每改一次 `src/`，
   都要产生「源码 + 拷贝」两份一模一样的改动记录，代码审查噪音翻倍，还容易出现
   「改了 src 忘了同步 build」的版本不一致事故（这类事故在手工 cp 的项目里非常常见）。
2. **重新生成成本≈0**。虽然项目确实没有构建脚本，但"构建"就是一条命令：
   ```bash
   rm -rf build && mkdir -p build && cp -r index.html src vendor build/
   ```
3. **最关键：部署在线 Demo 根本用不到 `build/`**。入口 `index.html` 本来就在仓库根目录，
   且资源引用全是相对路径，GitHub Pages 直接发布根目录即可跑通（详见第 2 节）。
   `build/` 仅用于本地打包存档，是本地动作，不需要版本控制。

> 若日后改主意，删掉 `.gitignore` 里的 `build/` 那一行即可。

#### 1.2 专项决策：`.workbuddy/` 默认忽略（可逆）

`.workbuddy/memory/*.md`（4 个文件 / 92KB）是 AI 协作的每日工作日志，包含内部讨论过程、
阶段性结论，以及本机绝对路径（会暴露 Windows 用户名）。**默认忽略**，理由是它属于「过程草稿」
而非游戏成品，且含本机路径。

但这是个**可逆的取舍**：这份开发实录本身其实是项目亮点（完整的 AI 协作开发过程记录，
对读者有参考价值）。若想公开，删掉 `.gitignore` 里的 `.workbuddy/` 一行即可——
**删之前请先通读一遍这 4 个 md**，确认没有绝对路径（形如 `C:\Users\10955\...`）、密钥或私人信息。

### 2. GitHub Pages 部署方案

本项目是纯静态、零构建、零运行时资源加载，是 Pages 最理想的场景。

#### 2.1 先说结论

> **推荐方案：直接用 `main` 分支的仓库根目录发布，不建分支、不写 Actions、不改任何代码。**

#### 2.2 关键前提已核实：资源引用**全部是相对路径**

这一条直接决定 Pages 能否跑通，已逐文件确认：

| 位置 | 引用写法 | 判定 |
|---|---|---|
| `index.html` | `<script src="./vendor/phaser.min.js">` | ✅ 相对 |
| `index.html` | `<script type="module" src="./src/main.js">` | ✅ 相对 |
| `src/main.js` | `import { GameScene } from './game.js'` 等 4 处 | ✅ 相对 |
| 全 `src/` 目录 | 正则扫描 `/xxx` 形式的绝对路径 | ✅ **0 处命中** |
| 运行时资源加载 | 扫描 `this.load.*` / `fetch(` / `.mp3` / `.png` | ✅ **0 处**，音效由 WebAudio 实时合成，不读任何资源文件 |

**这意味着 Pages 的子路径部署没有障碍。** 说明一下为什么这点如此关键：Pages 的 URL 形如
`https://<用户名>.github.io/<仓库名>/`，游戏是跑在 `/<仓库名>/` 这个**子目录**下的。
如果代码里写的是绝对路径 `/src/main.js`，浏览器会去 `https://<用户名>.github.io/src/main.js`
找文件，直接 404 白屏。本项目用的是 `./src/main.js`，会正确解析到
`https://<用户名>.github.io/<仓库名>/src/main.js`。**不需要做任何路径改造。**

#### 2.3 方案对比

| 方案 | 评价 |
|---|---|
| **① 根目录 + main 分支** | ✅ **推荐**。入口 `index.html` 已在根目录，相对路径已验证，零改造、零维护，push 即更新 |
| ② `/docs` 目录发布 | ❌ **不可行**。Pages 的这个选项要求 `docs/` 下有 `index.html` 作为站点入口，但本项目 `docs/` 已被工程文档占满（`build-notes.md`、`release/`、`icon-spec.md` 等 10 个文件），没有 `index.html`。强行启用只会把文档目录当网站发布，游戏根本不会出现 |
| ③ `gh-pages` 分支 | ⚠️ 可行但多余。需要手工维护第二个分支并反复同步 src/vendor，等于把已经否决的 `build/` 问题换个地方重演 |
| ④ GitHub Actions 自动同步 | ⚠️ 可行但杀鸡用牛刀。本项目无构建步骤，Actions 唯一的活就是 `cp` 三个路径。方案 ① 已经免费达成同样效果，多写一个 workflow 只是增加维护面 |

#### 2.4 推荐方案分步操作

前置：仓库需为 **Public**（私有仓库用 Pages 需要 GitHub Pro）。

```bash
# 1) 本地初始化并推送（在 Git Bash 中执行，路径含空格必须加引号）
cd "C:/Users/10955/WorkBuddy/minigame-Dual 2048"
git init
git add -A

# 2) 【重要】提交前自查：确认隐私文件没被加进来，下面应输出 4 行 "被忽略"
for f in psproc.txt suspects.txt psdiag.txt sync.txt; do
  git check-ignore -q "$f" && echo "$f 已忽略 OK" || echo "!!! $f 未被忽略，停下检查 !!!"
done

git commit -m "chore: initial public release of Double 2048"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

然后在网页上操作：

1. 打开仓库页面 → 顶部 **Settings**（设置）
2. 左侧边栏找到 **Pages**
3. **Source** 选 `Deploy from a branch`
4. **Branch** 选 `main`，右边的目录下拉框选 **`/ (root)`**，点 **Save**
5. 等待约 **1～3 分钟**（首次部署偶尔到 10 分钟）。页面顶部会出现绿色横幅显示网址
6. 访问 `https://<你的用户名>/<仓库名>/`，形如 `https://yourname.github.io/double-2048/`

之后每次 `git push` 到 main，Pages 会自动重新发布，无需任何额外操作。

#### 2.5 本项目特有的坑（已排查，均不阻塞）

- **零外部依赖，天然适配 Pages**：`index.html` 不引用任何外部脚本或 CDN，
  Phaser 引擎（`vendor/phaser.min.js`）与全部游戏代码均随仓库本地加载。
  可选的「平台集成层」（`src/platform.js`）仅当宿主页面注入了
  `window.__GAME_PLATFORM__` 时才生效，否则每个公开方法都带 `try/catch` 守卫、全部静默 no-op
  （`init()` 返回 false、`ready()` resolve(false) 且永不 reject），游戏本体照常完整可玩。
- **Jekyll 的下划线规则**：Pages 默认跑 Jekyll，会忽略下划线开头的文件/目录。
  已全库扫描，下划线文件只有 `tools/_fonts.txt` 和 `tools/_gen.log`，两个都已被 `.gitignore` 忽略，
  **运行时文件无一以下划线开头，不受影响**。
  不过仍建议加一个空的 `.nojekyll` 文件到根目录作为保险（跳过 Jekyll 处理，顺带让部署更快）：
  ```bash
  cd "C:/Users/10955/WorkBuddy/minigame-Dual 2048" && touch .nojekyll
  ```
- **仓库名带空格**：本地文件夹名 `minigame-Dual 2048` 含空格。GitHub 仓库名**不允许空格**
  （会被自动转成 `-`）。建议直接起名 `double-2048` 之类，本地文件夹名不必改。
- **大小写敏感**：Windows 文件系统不区分大小写，Pages 的服务器区分。当前所有 import 路径
  与实际文件名大小写一致（已核对 13 个 `src/` 文件），无隐患。

### 3. 仓库体积评估：**不需要 Git LFS**

按 `.gitignore` 过滤后的实际入库体积：**55 个文件 / 约 5.08 MB**（原目录 80 文件 / 7.0MB，
忽略掉 25 个文件 / 约 1.9MB）。

| 目录 | 入库体积 | 占比 | 说明 |
|---|---|---|---|
| `assets/` | 2036 KB | 39% | 发布素材：封面 3 张 + 图标 3 张 + 首帧 2 张 + 实拍截图 3 张 |
| `preview/` | 1419 KB | 27% | 两支 18s 预览视频（mp4） |
| `vendor/` | 1154 KB | 22% | `phaser.min.js`，单个最大文件 |
| `docs/` | 207 KB | 4% | 工程与发布文档 |
| `src/` | 151 KB | 3% | 游戏源码 13 个文件 |
| `design/` | 116 KB | 2% | GDD / art-bible / audio-bible |
| `tests/` | 62 KB | 1% | 9 套 Node 原生测试 |
| `tools/` | 22 KB | <1% | 3 个生成脚本（已剔除日志） |

**判断依据**（对照 GitHub 官方限制）：

- 单文件 **100MB 硬限制** / 50MB 警告线 → 本项目最大文件 `vendor/phaser.min.js` 仅 **1.13MB**，
  距离警告线还差 44 倍，安全
- 仓库 **1GB 建议上限** → 当前 5.08MB，用了 **0.5%**
- LFS 的适用场景是「大型二进制资源反复修改」（如几十 MB 的贴图、音频、模型）。
  本项目的二进制文件（png/mp4）是**发布素材，基本一次定稿不再改动**，不会撑大历史

**结论：无需 Git LFS，直接普通提交即可。** 引入 LFS 反而会带来配额管理、
clone 需装 LFS 客户端等额外负担，得不偿失。

> 唯一值得留意的是：若后续反复重录预览视频（每支约 700KB），每个版本都会在 Git 历史里留一份。
> 即便重录 20 次也才增加约 28MB，仍远低于上限，不必担心。

### 4. 本地运行说明

#### 4.1 为什么不能双击 `index.html` 直接打开

用 `file://` 协议打开会**白屏**，有两个原因：

1. **ES Module 的 CORS 限制（主因）**：`index.html` 用
   `<script type="module" src="./src/main.js">` 加载游戏，而 ES Module 强制走 CORS 检查。
   `file://` 协议下页面来源是 `null`，浏览器会直接拒绝加载模块并报
   `Cross-origin request blocked`。注意 `vendor/phaser.min.js` 是普通脚本，反而能加载成功——
   所以现象是「Phaser 加载了但游戏没起来」。
   顺带一提，`main.js` 里挂了全局错误横幅（`showErrorBanner`），此时页面顶部通常会飘一条
   红色 `[runtime error]` 提示，可据此确认是这个问题。
2. **Web Audio 的上下文限制**：`audio.js` 全靠 WebAudio 实时合成音效，
   `AudioContext` 在 `file://` 下行为不一致，且需要用户手势才能启动。

**必须通过 http(s) 本地服务器访问。**

#### 4.2 两种最简起服务方式（Windows Git Bash 可直接执行）

```bash
# ── 方式 A：Python（推荐，Windows 装了 Python 就有，无需装任何东西）──
cd "C:/Users/10955/WorkBuddy/minigame-Dual 2048"
python -m http.server 8000
# 若提示 python 不是命令，改用 Windows 自带的启动器：
#   py -m http.server 8000
# 然后浏览器打开：http://localhost:8000/
```

```bash
# ── 方式 B：Node（需已装 Node.js，会临时下载 serve，无需写 package.json）──
npx serve "C:/Users/10955/WorkBuddy/minigame-Dual 2048" -l 8000
# 然后浏览器打开：http://localhost:8000/
```

> **路径含空格必须加引号**：文件夹名 `minigame-Dual 2048` 中间有空格，
> 不加引号 shell 会拆成 `minigame-Dual` 和 `2048` 两个参数从而报错。
> 停止服务器：在终端按 `Ctrl + C`。

#### 4.3 跑测试

```bash
cd "C:/Users/10955/WorkBuddy/minigame-Dual 2048"
node --test tests/
# 9 套件，无需 npm install（用的是 Node 原生测试运行器）
```
