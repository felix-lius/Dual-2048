// game.js —— DualGame 主逻辑：双盘同步、胜负判定、撤销/冻结交互、HUD、结算
// ITER-V6-REDO-001 ③：去首页 —— GameScene 直接启动（默认硬核），HUD 内置语言/难度按钮，
//                      控制条精简为 撤销/冻结/重开，全屏改 F 键触发。
// ITER-V7-001 ①：移除 250ms 动作锁（语言/模式已 in-place，无 scene.restart 竞争，锁不再必要）。
// ITER-V7-001 ②：最高分徽章 30 -> 18px、胶囊 42 -> 32px，并修复徽章 graphics 未随文字定位的根因。
// ITER-V7-001 ③：隐私政策移到左上角；语言/难度改为右上角 SegToggle 分段切换（in-place，不重启）。
// ITER-V7-001 ④：竖屏分数盘 caption 切为「上盘/下盘」（横屏仍「左盘/右盘」）。
// 红线：休闲退役规则（retired / resolveCasualOutcome / DONE 遮罩）保持现状不动。
import { Board } from './board.js';
import { UndoManager, FreezeManager } from './assist.js';
import { BoardView } from './view.js';
import { Button, SegToggle, showToast } from './ui.js';
import { InteractionManager } from './interaction.js';
import { setupInput } from './input.js';
import { Audio } from './audio.js';
import { Platform } from './platform.js';
import { t, getLanguage, setLanguage } from './i18n.js';
import { FONT_STACK, hexToStr, createBackgroundGradient, BG_GRADIENT_TOP,
         TEXT_PRIMARY, TEXT_SECONDARY, TEXT_LIGHT, TEXT_WHITE,
         TILE_COLORS,
         BTN_UNDO, BTN_FREEZE, BTN_RESTART, BTN_START,
         OVERLAY_BG, OVERLAY_ALPHA,
         SIDE_LABEL_BG, SIDE_LABEL_BG_ALPHA, SIDE_LABEL_TEXT,
         SIDE_LABEL_FONT_SIZE, SIDE_LABEL_HEIGHT, SIDE_LABEL_PAD_X,
         BEST_BADGE_BG, BEST_BADGE_BG_ALPHA, BEST_BADGE_TEXT,
         BEST_BADGE_FONT_SIZE, BEST_BADGE_HEIGHT, BEST_BADGE_PAD_X,
         BEST_BADGE_SUCCESS_BG,
         CONTROL_BTN_WIDTH, CONTROL_BTN_MIN_WIDTH, CONTROL_BTN_HEIGHT } from './theme.js';

const SIZE = 4;
const WIN_VALUE = 2048;
const ANIM_MS = 120; // 与 view.js 滑动时长配合的解锁延迟
const RETIRE_SCORE = 2048; // 休闲模式：棋盘“达标退役”的总分阈值（与胜利方块值同数值，语义不同）

// 休闲模式死局单步结算（纯函数，无 Phaser 依赖，可 Node 单测）。
// 前提：调用方必须先在外部判胜 —— 任一盘 maxTile() >= 2048 时直接 endGame(true)，
//       本函数不处理“2048 方块胜利”，该边界由调用方处理。
// 硬核模式不经过本函数（硬核为“任一盘死局即负”，由场景内直接判定）。
// 返回：
//   { action: 'continue' }                       —— 无死局盘、未双退役，继续
//   { action: 'retire', retireIndex: 0|1 }       —— 死局盘总分 >= 2048，达标退役，继续另一盘
//   { action: 'lose', reason: 'scoreBelow2048' } —— 死局盘总分 < 2048，无法退役 -> 失败
//   { action: 'win', reason: 'bothDone' }        —— 两盘均已达标/退役 -> 双达标胜利
export function resolveCasualOutcome(boards, retired) {
  // 死局且未退役的盘
  const deadIndices = [];
  for (let i = 0; i < boards.length; i++) {
    if (!retired[i] && !boards[i].movesAvailable()) deadIndices.push(i);
  }

  if (deadIndices.length > 0) {
    // 任一死局盘总分 < 2048 -> 无法达标退役 -> 失败
    if (deadIndices.some((i) => boards[i].score < RETIRE_SCORE)) {
      return { action: 'lose', reason: 'scoreBelow2048' };
    }
    // 死局盘均 >= 2048 -> 达标退役。若退役后所有盘都不再可操作 -> 双达标胜利
    // （覆盖“两盘同时死局且均达标”的边界，避免只退役一盘后另一盘卡死无法结算）
    const after = retired.slice();
    deadIndices.forEach((i) => { after[i] = true; });
    const allDone = boards.every((b, i) => after[i] || !b.movesAvailable());
    if (allDone) return { action: 'win', reason: 'bothDone' };
    return { action: 'retire', retireIndex: deadIndices[0] };
  }

  // 无死局盘：两盘均已退役 -> 双达标胜利
  if (retired[0] && retired[1]) return { action: 'win', reason: 'bothDone' };

  return { action: 'continue' };
}

// 方案 B（用户拍板 · release-checklist §4.2）：结算遮罩「看广告撤销5步」按钮的可见性 / 不可用判定。
// 纯函数（无 Phaser 依赖，可 Node 单测），把「广告能不能投」的产品规则与场景渲染解耦。
//
// 激励视频（看广告得撤销）的可用性：若宿主未提供广告能力，requestAd 会立刻回调失败。
// 探测到不可用后隐藏入口，避免玩家白点一次再吃挫败提示。

// 按钮是否显示：仅失败窗口显示；且本会话未探测到「广告不可投放」。
export function shouldShowRewardAdButton(win, adsUnavailable) {
  return !win && !adsUnavailable;
}

// 是否应记为「广告不可投放」：请求未获奖励，且广告**从未开始播放**（adStarted 未触发）。
// 广告已开播但玩家中途关闭 -> 属正常取消，不置位（下一次仍允许尝试）。
export function isAdUnavailableSignal(granted, adStarted) {
  return !granted && !adStarted;
}

// ITER-V8-001 + 竖排 HUD：竖屏 HUD 坐标纯函数（无 Phaser 依赖，可 Node 单测）。
// 输入：W 屏宽、hudH HUD 高、measures 各元素测量宽高；输出各元素中心坐标。
// 布局约定（保证任意 W >= 320 不重叠、交互对象 hitArea 不相交、同行/行间间距 >= 6px）：
//   顶行：左上 帮助/静音按钮（由 layoutHUD 按 topRowY 摆放），正中 标题(跨屏居中 x=W/2)，
//         右上 难度切换(modeToggle，右缘对齐)；
//   难度切换正下方：语言切换(langToggle)，两者竖排、右缘对齐；
//   第二行：最高分徽章居中；第三行：[左盘分 | 总分 | 右盘分]。
// P0-FIX（合规决策 A）：HUD 隐私入口已移除，本函数不再输出 privacy 矩形；
//   左上角帮助/静音按钮沿用顶行中心 y（= 返回值 topRowY，与 title.y 同值）。
// measures 字段：titleW/titleH, modeW/langW/tgH(切换),
//   badgeW/badgeH(徽章), leftW/rightW/totalW/rowH(分数/总分)。
export function computePortraitHudRects(W, hudH, m) {
  const tgGap = 6;                 // 两个 SegToggle 竖排之间的最小间距
  const T = hudH * 0.17;           // 顶行中心 y（难度切换与标题在此行）
  const modeY = T;                 // 难度切换：顶行
  const langY = modeY + m.tgH + tgGap; // 语言切换：难度正下方（竖排）
  const badgeY = hudH * 0.53;      // 徽章行中心 y
  const row3Y = hudH * 0.84;       // 分数/总分行中心 y

  // 正中：标题跨屏居中（x = W/2），顶行
  const titleX = W / 2;
  const titleY = T;

  // 右上竖排：难度切换最上（右缘对齐 W-10），语言切换在其正下方、同样右缘对齐
  const modeX = W - 10 - m.modeW / 2;
  const langX = W - 10 - m.langW / 2;

  return {
    topRowY:    T,
    title:      { x: titleX, y: titleY, w: m.titleW, h: m.titleH },
    modeToggle: { x: modeX, y: modeY, w: m.modeW, h: m.tgH },
    langToggle: { x: langX, y: langY, w: m.langW, h: m.tgH },
    badge:      { x: W / 2, y: badgeY, w: m.badgeW, h: m.badgeH },
    left:       { x: W * 0.24, y: row3Y, w: m.leftW, h: m.rowH },
    total:      { x: W / 2, y: row3Y, w: m.totalW, h: m.rowH },
    right:      { x: W * 0.76, y: row3Y, w: m.rightW, h: m.rowH },
  };
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    // 无首页后 data 恒为空，默认硬核；HUD 难度按钮可随时切换
    this.mode = (data && data.mode) || 'hardcore';
  }

  create() {
    // 背景渐变（暖奶油 -> 蜜桃，方案 A）；solid 色作为兜底
    this.bgGradient = createBackgroundGradient(this);
    this.cameras.main.setBackgroundColor(hexToStr(BG_GRADIENT_TOP));
    this.busy = false;
    this.pendingDir = null; // 动画锁内的单向方向缓冲：只记住最近一次，动画结束再处理
    this.gameOver = false;
    this.hasMoved = false;  // 是否已发生首次有效移动（之后难度切换需确认弹窗，语言始终可切）
    this.modeSwitchDialog = null; // 难度切换确认弹窗（打开期间屏蔽棋盘/HUD 命中）
    // 方案 B（产品决策）：若宿主未提供广告能力，requestAd 会直接回调失败。一旦探测到
    // 「广告根本没开始播」即置位，之后结算遮罩不再显示「看广告撤销 5 步」按钮，避免白点。
    this.adsUnavailable = false;
    // 历史最高总分（本地持久化，隐私模式用 try/catch 兜底）
    try { this.bestScore = Number(localStorage.getItem('simultwin.bestScore')) || 0; }
    catch (e) { this.bestScore = 0; }

    this.boards = [new Board(SIZE), new Board(SIZE)];
    this.retired = [false, false]; // 休闲模式：达标退役标记（0=左盘, 1=右盘）
    this.undo = new UndoManager(40, 5);
    this.freeze = new FreezeManager(3, 1000);
    this.boardViews = [new BoardView(this, 0), new BoardView(this, 1)];

    // ITER-V9-REWRITE-001：场景级矩形命中管理器（无 Phaser 自带交互命中）。
    // 必须先于 buildHUD/buildControls 创建：其 pointerdown 处理器先注册，
    // 保证 setupInput 的 pointerdown 处理器随后能读到 isConsumed()。
    this.interactions = new InteractionManager(this);

    // 音频：创建 AudioContext + 总线（受自动播放策略约束，仍处 suspended，首次手势再 resume）。
    // §6 决策默认：音乐 OFF、SFX ON、单一持久化静音开关。no-op-safe。
    Audio.init();

    // 可选平台集成层：场景启动即初始化并上报 loading 开始（缺失平台对象时静默 no-op）
    Platform.init();
    Platform.loadingStart();

    this.buildHUD();
    this.buildHelpButton();   // 始终可见的 "?" 帮助按钮（重开教程覆盖层）
    this.buildMuteButton();   // 静音/扬声器切换（§6 决策：单一持久化静音开关）
    this.buildControls();
    this.buildOverlay();
    this.buildSideLabels();
    this.layout();

    setupInput(this, {
      onDirection: (d) => this.handleMove(d),
      onTap: (p) => this.handleTap(p),
    });

    // §4.2 自动播放策略：任意 pointerdown（首次用户手势）解锁 AudioContext。no-op-safe。
    // release-checklist §4.4（iOS）：AudioContext 被来电/切后台打断后，只有在**真实用户手势**里
    // 调 resume() 才会恢复，visibilitychange 无效。故 pointerdown 与 pointerup 都补一次
    // （Phaser 的 pointerup 由原生 touchend 同步派发，仍处在手势上下文内）。
    if (this.input && typeof this.input.on === 'function') {
      this.input.on('pointerdown', () => Audio.resume());
      this.input.on('pointerup', () => Audio.resume());
    }

    // F 键全屏切换（ITER-V6-REDO-001 ③）：全屏能力保留，控制条按钮移除改键盘触发。
    // F 不在 input.js 的 addCapture（仅方向键）之列，与方向键捕获不冲突。
    if (this.input && this.input.keyboard) {
      this.input.keyboard.on('keydown-F', () => this.onFullscreen());
    }

    // 初始静态渲染
    this.boardViews.forEach((v, i) => v.renderStatic(this.boards[i]));
    this.refreshHUD();

    this.scale.on('resize', this.layout, this);

    // 加载完成：首屏棋盘已渲染 -> 上报 loading 结束并标记“开始游玩”
    Platform.loadingStop();
    Platform.onGamePlay();

    // 失焦 / 切后台 -> 暂停计时；回到前台 -> 恢复。
    // 适配器内部有 _paused 守卫，blur 与 visibilitychange 同时触发也不会双暂停。
    this._platformHandlers = {};
    if (typeof document !== 'undefined') {
      this._platformHandlers.vis = () => {
        if (document.hidden) { Platform.pause(); Audio.stopMusic(); }
        else {
          Platform.resume();
          Audio.resume(); // 桌面/安卓可直接恢复；iOS 需真实手势，由下方 touchend 兜底
          if (Audio.isMusicEnabled()) Audio.startMusic();
        }
      };
      document.addEventListener('visibilitychange', this._platformHandlers.vis);
      // release-checklist §4.4：iOS 从后台/来电返回后必须在 touchend 手势里 resume()。
      // 文档级监听作为 Phaser pointerup 之外的兜底（画布未覆盖处的触摸同样能解锁）。
      this._platformHandlers.touch = () => Audio.resume();
      try {
        document.addEventListener('touchend', this._platformHandlers.touch, { passive: true });
      } catch (e) {
        document.addEventListener('touchend', this._platformHandlers.touch);
      }
    }
    if (typeof window !== 'undefined') {
      this._platformHandlers.blur = () => { Platform.pause(); Audio.stopMusic(); };
      this._platformHandlers.focus = () => { Platform.resume(); if (Audio.isMusicEnabled()) Audio.startMusic(); };
      window.addEventListener('blur', this._platformHandlers.blur);
      window.addEventListener('focus', this._platformHandlers.focus);
    }
    // 场景销毁时移除监听，避免泄漏
    if (this.events && typeof this.events.on === 'function') {
      this.events.once('shutdown', () => this._removePlatformHandlers());
    }

    // 首次运行（localStorage 未标记）自动弹出教程
    this._maybeShowTutorial();
  }

  // 移除失焦/可见性监听（场景 shutdown 时调用）
  _removePlatformHandlers() {
    const h = this._platformHandlers;
    if (!h) return;
    try {
      if (typeof document !== 'undefined') {
        if (h.vis) document.removeEventListener('visibilitychange', h.vis);
        if (h.touch) document.removeEventListener('touchend', h.touch);
      }
      if (typeof window !== 'undefined') {
        if (h.blur) window.removeEventListener('blur', h.blur);
        if (h.focus) window.removeEventListener('focus', h.focus);
      }
    } catch (e) { /* 忽略 */ }
    this._platformHandlers = null;
  }

  // ---------------- HUD ----------------
  buildHUD() {
    const font = FONT_STACK;
    this.titleText = this.add.text(0, 0, t('title'), {
      fontFamily: font, fontStyle: '800', fontSize: '22px', color: hexToStr(TILE_COLORS[2048].bg),
    }).setOrigin(0.5, 0.5).setDepth(5);

    this.leftScoreText = this.add.text(0, 0, '', {
      fontFamily: font, fontStyle: '800', fontSize: '20px', color: hexToStr(TEXT_PRIMARY), align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(5);

    this.rightScoreText = this.add.text(0, 0, '', {
      fontFamily: font, fontStyle: '800', fontSize: '20px', color: hexToStr(TEXT_PRIMARY), align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(5);

    this.totalText = this.add.text(0, 0, '', {
      fontFamily: font, fontStyle: '800', fontSize: '16px', color: hexToStr(TEXT_SECONDARY),
    }).setOrigin(0.5, 0.5).setDepth(5);

    // ④ 历史最高总分：HUD 顶部正中，18px 加粗 + 半透明胶囊徽章（ITER-V7-001 ②：30 -> 18px）
    this.bestBadge = this.add.graphics().setDepth(5);
    this.bestScoreText = this.add.text(0, 0, '', {
      fontFamily: font, fontStyle: '800', fontSize: BEST_BADGE_FONT_SIZE + 'px',
      color: hexToStr(BEST_BADGE_TEXT),
    }).setOrigin(0.5, 0.5).setDepth(6);
    // ITER-V8-001：徽章尺寸随方向自适应（横屏用 theme 常量，竖屏 layoutHUD 缩到 14px/24h）
    this.bestBadgeFontSize = BEST_BADGE_FONT_SIZE;
    this.bestBadgeHeight = BEST_BADGE_HEIGHT;

    // ③ 右上角分段切换：难度 / 语言（SegToggle，当前项明亮、另一项灰暗；in-place 切换不重启）
    // 语言：中 | EN —— 点击整条切换语言，仍走 setLanguage + refreshAllTexts（无 scene.restart）。
    this.langToggle = new SegToggle(this, 0, 0, 80, 28,
      [{ key: 'zh', label: '中' }, { key: 'en', label: 'EN' }],
      getLanguage(),
      (key) => {
        setLanguage(key);
        Audio.play('languageSwitch'); // 语言切换轻 blip（区别于难度切换）
        this.refreshAllTexts();
      },
      { depth: 6, fontSize: 14 });

    // 难度：硬核 | 休闲（en: Hardcore | Casual）—— 点击切换模式并刷新 HUD，不重启
    this.modeToggle = new SegToggle(this, 0, 0, 148, 28,
      [
        { key: 'hardcore', label: t('modeHardcoreShort') },
        { key: 'casual', label: t('modeCasualShort') },
      ],
      this.mode,
      (key) => {
        // 首次有效移动后难度不可直切：弹确认框（确认→切难度+重开；取消→保持）
        if (this.hasMoved) { this._askSwitchMode(key); return; }
        this.mode = key === 'casual' ? 'casual' : 'hardcore';
        Audio.play('difficultySwitch'); // 难度切换双音（模式变了）
        this.refreshAllTexts();
      },
      { depth: 6, fontSize: 14 });
  }

  refreshHUD() {
    this._updateScoreCaptions();
    const total = this.boards[0].score + this.boards[1].score;
    this.totalText.setText(t('total') + ' ' + total);
    this.bestScoreText.setText(t('best') + ' ' + this.bestScore);
    this._drawBestBadge();

    this.undoBtn.setLabel(t('undo', this.undo.undoLeft));
    this.undoBtn.setEnabled(this.undo.canUndo() && !this.gameOver);

    const fLeft = this.freeze.left + this.freeze.bonusLeft;
    this.freezeBtn.setLabel(t('freeze', fLeft));
    this.freezeBtn.setEnabled(
      !this.gameOver && fLeft > 0 && !(this.freeze.frozen[0] && this.freeze.frozen[1])
    );
  }

  // ④ 分数盘 caption：横屏「左盘/右盘」，竖屏「上盘/下盘」（en: Left/Right vs Top/Bottom）。
  // 在 refreshHUD（游戏事件）与 layout（resize）两处都会调用，方向变化即时切换。
  // ITER-V8-001：竖屏 12px 单行（"上盘 1234"），横屏 20px 双行（"左盘\n1234"）——竖屏压缩 HUD 无法容纳双行。
  _updateScoreCaptions() {
    const landscape = this.scale.width >= this.scale.height;
    const cap0 = landscape ? t('leftBoard') : t('boardScoreTop');
    const cap1 = landscape ? t('rightBoard') : t('boardScoreBottom');
    const sep = landscape ? '\n' : ' ';
    this.leftScoreText.setText(cap0 + sep + this.boards[0].score);
    this.rightScoreText.setText(cap1 + sep + this.boards[1].score);
  }

  // ① 语言/模式 in-place 后统一刷新全部文案：HUD + 控制条 + 侧标签 + 结算遮罩。
  // 不重启场景；side label 文案在 layout() 的 _placeSideLabel 里按 getLanguage() 重取。
  refreshAllTexts() {
    this.refreshHUD();
    this.langToggle.setCurrent(getLanguage());
    this.modeToggle.setOptions([
      { key: 'hardcore', label: t('modeHardcoreShort') },
      { key: 'casual', label: t('modeCasualShort') },
    ]);
    this.modeToggle.setCurrent(this.mode);
    this.restartBtn.setLabel(t('restart'));
    // ITER-V13：结算遮罩文案随语言即时刷新（含新增「看广告撤销5步」按钮）
    this.overlayBtn.setLabel(t('playAgain'));
    this.overlayUndoBtn.setLabel(t('rewindAdBtn'));
    // ITER-V13-001 ④：语言切换可能改文案长度，按钮宽度/字号重新 fit
    this._fitOverlayUndoBtn();
    // ITER-V13-002 ①：副标题按当前语言重写并重 fit（如果当前在 overlay 中可见）
    if (this._overlaySubTextCurrent) this._fitOverlaySubText();
    this.layout();
  }

  // ④ 重绘最高分徽章胶囊（尺寸随文案自适应；ITER-V8-001：高/字号由方向决定，见 layoutHUD）
  _drawBestBadge() {
    if (!this.bestBadge || !this.bestScoreText) return;
    const w = Math.max(this.bestScoreText.width + BEST_BADGE_PAD_X * 2, 120);
    const h = this.bestBadgeHeight;
    this.bestBadge.clear();
    this.bestBadge.fillStyle(BEST_BADGE_BG, BEST_BADGE_BG_ALPHA);
    this.bestBadge.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  }

  // ④ 破纪录短暂高亮徽章（薄荷绿），随后恢复常态
  _flashBestBadge() {
    if (!this.bestBadge || !this.bestScoreText) return;
    const w = Math.max(this.bestScoreText.width + BEST_BADGE_PAD_X * 2, 120);
    const h = this.bestBadgeHeight;
    this.bestBadge.clear();
    this.bestBadge.fillStyle(BEST_BADGE_SUCCESS_BG, BEST_BADGE_BG_ALPHA);
    this.bestBadge.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.time.delayedCall(900, () => this._drawBestBadge());
  }

  // ---------------- 控制条 ----------------
  buildControls() {
    // ITER-V8-001：构造用 theme 基准宽；layoutControls 里按 slot 再缩（竖屏窄屏必缩，避免按钮互叠）
    this.undoBtn = new Button(this, 0, 0, CONTROL_BTN_WIDTH, CONTROL_BTN_HEIGHT, t('undo', 5), () => this.onUndoClick(),
      { color: BTN_UNDO.bg, textColor: hexToStr(BTN_UNDO.text), fontSize: 20,
        onDisabledClick: () => this.onUndoClick() });
    this.freezeBtn = new Button(this, 0, 0, CONTROL_BTN_WIDTH, CONTROL_BTN_HEIGHT, t('freeze', 3), () => this.onFreezeClick(),
      { color: BTN_FREEZE.bg, textColor: hexToStr(BTN_FREEZE.text), fontSize: 20,
        onDisabledClick: () => this.onFreezeClick() });
    // ③ 控制条精简为 3 按钮：撤销/冻结/重开。
    // ITER-V7-001 ①：重开不再带动作锁 —— restart() 幂等（重建棋盘），快速连点无副作用，点击立即响应。
    this.restartBtn = new Button(this, 0, 0, CONTROL_BTN_WIDTH, CONTROL_BTN_HEIGHT, t('restart'), () => this.restart(),
      { color: BTN_RESTART.bg, textColor: hexToStr(BTN_RESTART.text), fontSize: 20 });

    // 合规决策 A：HUD 左上角的「隐私政策」入口已移除。
    // 本游戏仅用 localStorage 存本地偏好，未采集任何外部数据，隐私政策非强制；
    // 而原入口点击只弹 toast、不跳转，属「可见但无效的 UI」，已移除。
    // i18n 的 privacy / privacyPlaceholder 键保留（未来接入真实链接时可直接复用）。
  }

  // ---------------- 新手教程 / How to Play ----------------
  // 始终可见的 “?” 帮助按钮（深度 30，左上角隐私链接旁），点击重新打开教程。
  // 纯 InteractionManager 命中（无 Phaser 自带交互命中）。
  buildHelpButton() {
    this.tutorialOpen = false;
    this.tutorialObjects = null;
    this.helpBtn = new Button(this, 0, 0, 30, 30, '?', () => this._openTutorial(),
      { color: 0xEDE3D2, textColor: hexToStr(TEXT_PRIMARY), fontSize: 22, depth: 30 });
  }

  // §6 决策默认：音乐关、SFX 开、单一持久化静音开关（localStorage 'simultwin.muted'）。
  // 静音/扬声器切换按钮：深度 30，与 helpBtn 同列左上角（隐私链接旁），命中走 InteractionManager。
  // 标签：♪ 有声 / ✕ 已静音（随状态即时切换）。no-op-safe（Audio 不可用时不报错）。
  buildMuteButton() {
    this.muteBtn = new Button(this, 0, 0, 30, 30, Audio.isMuted() ? '✕' : '♪',
      () => { Audio.toggleMute(); this._updateMuteLabel(); },
      { color: 0xEDE3D2, textColor: hexToStr(TEXT_PRIMARY), fontSize: 22, depth: 30 });
    this._updateMuteLabel();
  }

  _updateMuteLabel() {
    if (this.muteBtn && typeof this.muteBtn.setLabel === 'function') {
      this.muteBtn.setLabel(Audio.isMuted() ? '✕' : '♪');
    }
  }

  // 首次运行：localStorage 未标记则自动弹出教程（标记后不再弹）
  _maybeShowTutorial() {
    let seen = false;
    try { seen = localStorage.getItem('simultwin.seenTutorial') === '1'; } catch (e) { /* 隐私模式 */ }
    if (!seen) this._openTutorial();
  }

  // 打开教程覆盖层（纯 InteractionManager 模态，复用同一方法供首 run 与 “?” 重开）。
  // 防堆叠：已开则不重复打开。
  //   dim 全屏 graphics(深度960) + 全屏命中矩形（先注册=底层，消费手势，阻断穿透到棋盘/HUD/帮助按钮）；
  //   panel 圆角矩形(961) + 标题/正文(962) + “Got it” 按钮(962，后注册=顶层，优先命中)。
  _openTutorial() {
    if (this.tutorialOpen) return;
    const W = this.scale.width, H = this.scale.height;
    this.tutorialOpen = true;

    const dim = this.add.graphics().setDepth(960).setVisible(true);
    dim.fillStyle(OVERLAY_BG, 0.6);
    dim.fillRect(0, 0, W, H);

    // 全屏命中矩形：先注册（底层），点遮罩外仅消费手势（不落空到棋盘/HUD/帮助按钮）
    const dimHit = this.interactions.register(
      { x: 0, y: 0, w: W, h: H },
      () => { /* 点遮罩外：吞掉手势 */ }
    );

    // 面板圆角矩形
    const panelW = Math.min(W * 0.86, 480);
    const panelH = Math.min(H * 0.66, 380);
    const px = W / 2 - panelW / 2;
    const py = H / 2 - panelH / 2;
    const panel = this.add.graphics().setDepth(961).setVisible(true);
    panel.fillStyle(0xFFFDF8, 1);
    panel.fillRoundedRect(px, py, panelW, panelH, 20);

    const title = this.add.text(W / 2, py + 38, t('tutorialTitle'), {
      fontFamily: FONT_STACK, fontStyle: '800', fontSize: '26px',
      color: hexToStr(TEXT_PRIMARY), align: 'center',
    }).setOrigin(0.5).setDepth(962);

    // ITER-V12-001 ②：教程正文左对齐 + 按真实行高动态堆叠（含自动换行），杜绝窄屏文字重叠
    const tutorialLines = (t('tutorialLines') && t('tutorialLines').length) ? t('tutorialLines') : [];
    const bodySize = '15px';
    const titleH = 26;                                 // 标题 26px
    const titleBottomPad = 18;                         // 标题 → 正文留白
    const gotItReserve = 64;                           // 底部 Got it 按钮区留白
    const lineGap = 14;                                // 各编号要点之间的行距（足够大，避免叠加）
    const wrapW = panelW - 48;                         // 左右各 24px 内边距
    const bodyX = px + 24;                             // 左对齐起始 x（面板内侧左边距）
    // 先以原点(0,0)建文本并测量真实高度（含自动换行），再按高度顺序堆叠 + 行距
    const bodies = tutorialLines.map((line) => this.add.text(
      bodyX, 0, line,
      {
        fontFamily: FONT_STACK, fontStyle: '600', fontSize: bodySize,
        color: hexToStr(TEXT_SECONDARY), align: 'left',
        wordWrap: { width: wrapW },
      }
    ).setOrigin(0, 0).setDepth(962));
    const blockH = bodies.reduce((acc, b) => acc + b.height, 0) +
      lineGap * Math.max(0, bodies.length - 1);
    // 正文块垂直居中于「标题下沿 + 留白」与「Got it 区上沿」之间
    const titleBottom = py + 38 + titleH / 2 + titleBottomPad;
    const availBottom = py + panelH - gotItReserve;
    let cy = titleBottom + Math.max(0, (availBottom - titleBottom - blockH) / 2);
    for (const b of bodies) {
      b.setY(cy);
      cy += b.height + lineGap;
    }

    // “Got it” 按钮：后注册（顶层），先于 dim 被命中
    const gotIt = new Button(this, W / 2, py + panelH - 40, 180, 48, t('tutorialGotIt'),
      () => this._closeTutorial(),
      { color: BTN_START.bg, textColor: hexToStr(BTN_START.text), fontSize: 20, depth: 962 });

    this.tutorialObjects = { dim, dimHit, panel, title, bodies, gotIt };
    Audio.play('tutorialOpen'); // 友好「噗开」（audio-bible §2 #15）
  }

  // 关闭教程：销毁遮罩/全屏命中/面板/文案/按钮，并写入 localStorage 标记
  _closeTutorial() {
    if (!this.tutorialOpen) return;
    try { localStorage.setItem('simultwin.seenTutorial', '1'); } catch (e) { /* 隐私模式不阻塞 */ }
    const o = this.tutorialObjects;
    if (o) {
      o.dimHit.destroy();   // 移除全屏命中矩形（InteractionManager 句柄）
      o.dim.destroy();
      o.panel.destroy();
      o.title.destroy();
      // ITER-V11-001 ①：教程正文改为多条独立 Text，逐条 destroy
      if (Array.isArray(o.bodies)) {
        for (let i = 0; i < o.bodies.length; i++) {
          try { o.bodies[i].destroy(); } catch (e) { /* no-op */ }
        }
      }
      o.gotIt.destroy();
    }
    this.tutorialObjects = null;
    this.tutorialOpen = false;
  }

  onFullscreen() {
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (e) { /* 忽略 */ }
  }

  // ---------------- 结算遮罩 ----------------
  buildOverlay() {
    this.overlayBg = this.add.graphics().setDepth(900).setVisible(false);
    // ITER-V13-002 ①：拆成「主标题（40px）+ 副标题（18px + wordWrap）」两段独立 Text，
    // 解决「Casual: a deadlocked board below 2048」这类长副标题在竖屏溢出被裁。
    this.overlayText = this.add.text(0, 0, '', {
      fontFamily: FONT_STACK, fontStyle: '800',
      fontSize: '40px', color: hexToStr(TEXT_WHITE), align: 'center',
    }).setOrigin(0.5).setDepth(901).setVisible(false);
    this.overlaySubText = this.add.text(0, 0, '', {
      fontFamily: FONT_STACK, fontStyle: '600',
      fontSize: '18px', color: hexToStr(TEXT_WHITE), align: 'center',
    }).setOrigin(0.5).setDepth(901).setVisible(false);
    this.overlayBtn = new Button(this, 0, 0, 200, 60, t('playAgain'), () => this.restart(),
      { color: BTN_START.bg, textColor: hexToStr(BTN_START.text), fontSize: 24, depth: 902 });
    this.overlayBtn.setVisible(false);
    // ITER-V13：失败窗口额外提供「看广告自动撤销5步」续命按钮（仅失败显示；胜利窗口不显示）
    this.overlayUndoBtn = new Button(this, 0, 0, 360, 56, t('rewindAdBtn'),
      () => this.onWatchAdUndo(),
      { color: BTN_FREEZE.bg, textColor: hexToStr(BTN_FREEZE.text), fontSize: 18, depth: 902 });
    this.overlayUndoBtn.setVisible(false);
    // ITER-V13-001 ④：按钮宽度/字号按当前文字自适应（横屏窄、竖屏更窄、中英文长短不一都不溢出）
    this._fitOverlayUndoBtn();
    // ITER-V13-002 ①：副标题按画布宽自动 wordWrap + 字号微缩，永不溢出
    this._fitOverlaySubText();
    this.overlayShowUndo = false;     // 是否显示「看广告撤销」按钮（仅失败）
    this.overlayUndoEnabled = true;   // 按钮是否可用（buffer 为空时置灰）
  }

  // ITER-V13-002 ①：副标题字号按画布宽自适应（16→18px），wordWrap 宽度 = 画布 80%。
  // 解决中英文长副标题（如 "Casual: a deadlocked board below 2048"）在竖屏溢出被裁。
  _fitOverlaySubText() {
    if (!this.overlaySubText) return;
    const W = this.scale && this.scale.width ? this.scale.width : 360;
    const H = this.scale && this.scale.height ? this.scale.height : 640;
    const wrapW = Math.max(160, Math.floor(W * 0.85));
    // 竖屏（H>W）字号压到 16px，横屏保持 18px；避免竖屏 + 长文案双行后顶部挤压
    const fs = H > W ? 16 : 18;
    this.overlaySubText.setStyle({ fontSize: fs + 'px', wordWrap: { width: wrapW } });
    // 重新应用当前文本以触发换行计算
    if (this._overlaySubTextCurrent) {
      this.overlaySubText.setText(this._overlaySubTextCurrent);
    }
  }

  showOverlay(win, reason) {
    let title;
    let sub;
    if (win) {
      if (reason === 'bothDone') { title = t('winBothDone'); sub = t('winBothDoneSub'); }
      else { title = t('win'); sub = t('winSub'); }
    } else {
      if (this.mode === 'hardcore') { title = t('loseHardcore'); sub = t('loseHardcoreSub'); }
      else { title = t('loseCasual'); sub = t('loseCasualSub'); }
    }
    this.overlayText.setText(title);
    // ITER-V13-002 ①：副标题独立 Text + 自适应字号 + wordWrap
    this._overlaySubTextCurrent = sub;
    this._fitOverlaySubText();
    // ITER-V13：失败窗口额外提供「看广告撤销5步」；胜利窗口不显示该按钮
    const showUndo = !win;
    // 方案 B：广告不可用时隐藏该按钮，避免玩家白点一次再吃挫败提示。
    // overlayShowUndo 同步置 false，让 repositionOverlay 走「单按钮居中」排布，不留空洞。
    const undoBtnVisible = shouldShowRewardAdButton(win, this.adsUnavailable);
    const canUndo = showUndo && this.undo.buffer.length > 0;
    this.overlayShowUndo = undoBtnVisible;
    this.overlayUndoEnabled = canUndo;
    this.overlayUndoBtn.setVisible(undoBtnVisible);
    this.overlayUndoBtn.setEnabled(canUndo);
    // ITER-V13-001 ④：按钮宽度/字号按当前画布 + 文案自适应（先 fit 再定位）
    this._fitOverlayUndoBtn();
    this.repositionOverlay(this.scale.width, this.scale.height);
    this.overlayBg.setVisible(true);
    this.overlayText.setVisible(true);
    this.overlaySubText.setVisible(true);
    // ITER-V9-REWRITE-001：overlayBtn 命中已由 InteractionManager 常驻注册，
    // setVisible(true) 即恢复可命中（无需重新开启交互）
    this.overlayBtn.setVisible(true);
  }

  hideOverlay() {
    this.overlayBg.setVisible(false);
    this.overlayText.setVisible(false);
    this.overlaySubText.setVisible(false);
    // setVisible(false) 即命中跳过（无需关闭交互）
    this.overlayBtn.setVisible(false);
    this.overlayUndoBtn.setVisible(false);
  }

  // ITER-V13-001 ④：overlayUndoBtn 宽度/字号按当前画布 + 文案自适应
  // （横屏/竖屏、中英长短不一都不会再溢出被裁）。
  _fitOverlayUndoBtn() {
    if (!this.overlayUndoBtn) return;
    const W = this.scale && this.scale.width ? this.scale.width : 360;
    // 最大宽度 = 画布宽 - 左右边距（≥200 维持按钮手感，≤420 防超长）
    const maxW = Math.max(200, Math.min(420, W - 32));
    this.overlayUndoBtn.setLabelFit(t('rewindAdBtn'),
      { maxW, minFontSize: 12, padX: 36 });
  }

  repositionOverlay(W, H) {
    this.overlayBg.clear();
    this.overlayBg.fillStyle(OVERLAY_BG, OVERLAY_ALPHA);
    this.overlayBg.fillRect(0, 0, W, H);
    const showUndo = !!this.overlayShowUndo;
    if (showUndo) {
      // 失败窗口：主标题上移 → 副标题 → Play Again → 看广告撤销
      this.overlayText.setPosition(W / 2, H * 0.22);
      this.overlaySubText.setPosition(W / 2, H * 0.34);
      this.overlayBtn.setPosition(W / 2, H * 0.52);
      this.overlayUndoBtn.setPosition(W / 2, H * 0.68);
    } else {
      // 胜利窗口：主标题 + 副标题居中，仅一个按钮
      this.overlayText.setPosition(W / 2, H * 0.30);
      this.overlaySubText.setPosition(W / 2, H * 0.42);
      this.overlayBtn.setPosition(W / 2, H * 0.60);
      this.overlayUndoBtn.setPosition(W / 2, H * 0.68); // 仍定位，仅不可见
    }
  }

  // ---------------- 布局（响应式：横屏并排 / 竖屏堆叠） ----------------
  layout() {
    const W = this.scale.width;
    const H = this.scale.height;
    const landscape = W >= H;

    if (this.bgGradient) this.bgGradient.redraw();

    // ③ 最高分徽章居中醒目：HUD 高度略增（min 100px）容纳 18px 徽章 + 标题/总分纵排
    // ITER-V8-001：竖屏 HUD 压缩到 80–90px（元素重排见 layoutHUD），横屏保持原状。
    const hudH = landscape
      ? Math.max(100, H * 0.13)
      : Phaser.Math.Clamp(Math.round(H * 0.14), 80, 90);
    const ctrlH = Math.max(72, H * 0.13);
    // ITER-V8-001：竖屏侧标签略缩（22 -> 18），横屏保持 theme 常量
    this.sideLabelHeight = landscape ? SIDE_LABEL_HEIGHT : Math.min(SIDE_LABEL_HEIGHT, 18);
    const areaTop = hudH + 6;
    const areaBottom = H - ctrlH - 6;
    const areaH = areaBottom - areaTop;
    const areaW = W - 24;
    const pad = 10;

    if (landscape) {
      const gap = Math.min(40, W * 0.04);
      const perW = (areaW - gap) / 2;
      let boardPx = Math.min(perW, areaH * 0.96);
      boardPx = Math.floor(boardPx);
      const totalW = boardPx * 2 + gap;
      const startX = (W - totalW) / 2;
      const cy = areaTop + areaH / 2;
      this.boardViews[0].layout(startX, cy - boardPx / 2, boardPx, gap, pad);
      this.boardViews[1].layout(startX + boardPx + gap, cy - boardPx / 2, boardPx, gap, pad);
      // ③ 侧标签（横屏：左盘=左、右盘=右，置于各盘上方外侧，辅助冻结选盘）
      this._placeSideLabel(0, 'boardLeft', 'above');
      this._placeSideLabel(1, 'boardRight', 'above');
    } else {
      const gap = Math.min(24, H * 0.025);
      // ITER-V8-001：为“上盘上方 / 下盘下方”的侧标签预留空间，避免标签压到 HUD 或控制条
      const labelSpace = this.sideLabelHeight + 10;
      const innerTop = areaTop + labelSpace;
      const innerBottom = areaBottom - labelSpace;
      const perH = (innerBottom - innerTop - gap) / 2;
      let boardPx = Math.min(areaW * 0.96, perH);
      boardPx = Math.floor(boardPx);
      const totalH = boardPx * 2 + gap;
      const cx = W / 2;
      const startY = innerTop + (innerBottom - innerTop - totalH) / 2;
      this.boardViews[0].layout(cx - boardPx / 2, startY, boardPx, gap, pad);
      this.boardViews[1].layout(cx - boardPx / 2, startY + boardPx + gap, boardPx, gap, pad);
      // ③ 侧标签（竖屏：上盘=上、下盘=下，置于各盘上/下方外侧）
      this._placeSideLabel(0, 'boardTop', 'above');
      this._placeSideLabel(1, 'boardBottom', 'below');
    }

    // ITER-V8-001：暴露给 _placeSideLabel（'below' 避让控制条）与后续布局使用
    this.hudH = hudH;
    this.ctrlH = ctrlH;
    this.layoutHUD(W, hudH);
    this.layoutControls(W, H, ctrlH);
    this.repositionOverlay(W, H);
    // ④ resize 时 caption（左/右 vs 上/下）随横竖屏即时切换
    this._updateScoreCaptions();
    this.boardRects = this.boardViews.map((v) => ({
      x: v.container.x, y: v.container.y, w: v.boardPx, h: v.boardPx,
    }));
  }

  // ITER-V8-001：HUD 布局按横/竖屏分两套 —— 竖屏压缩到 80–90px 重排，根除互相挤压。
  // 原则：元素间至少 6px 间距；任何两个交互对象（Button/SegToggle/隐私链接）hitArea 不相交。
  layoutHUD(W, hudH) {
    const landscape = this.scale.width >= this.scale.height;

    if (landscape) {
      // ---------- 横屏（保留原逻辑）：标题居中、徽章居中、总分居中、左右分居左右、切换右上竖排、帮助/静音左上 ----------
      // 恢复横屏字号/尺寸（从竖屏切回横屏时须还原，否则字体仍是竖屏小号）
      this.titleText.setFontSize('22px');
      this.leftScoreText.setFontSize('20px');
      this.rightScoreText.setFontSize('20px');
      this.totalText.setFontSize('16px');
      this.bestBadgeFontSize = BEST_BADGE_FONT_SIZE;
      this.bestBadgeHeight = BEST_BADGE_HEIGHT;
      this.bestScoreText.setFontSize(BEST_BADGE_FONT_SIZE + 'px');
      this.modeToggle.resize(148, 28, 14);
      this.langToggle.resize(80, 28, 14);

      const cy = hudH / 2;
      // 中心纵列：标题(小) -> 最高分徽章(居中醒目) -> 总分
      this.titleText.setPosition(W / 2, hudH * 0.12);
      this.bestScoreText.setPosition(W / 2, hudH * 0.42);
      // ② 徽章 graphics 必须与文字同位置（原缺失 -> 胶囊画在左上角 (0,0)，白字飘在米色底）
      this.bestBadge.setPosition(W / 2, hudH * 0.42);
      this.totalText.setPosition(W / 2, hudH * 0.74);
      // 左右盘分数：微移向内（0.22/0.78），避开顶部两侧控件与中间徽章
      this.leftScoreText.setPosition(W * 0.22, cy);
      this.rightScoreText.setPosition(W * 0.78, cy);
      // ③ 右上角分段切换：难度在上、语言在下，竖排右缘对齐（顶部正中让给最高分徽章）
      const toggles = [this.modeToggle, this.langToggle];
      let ty = 14;
      for (const tg of toggles) {
        tg.setPosition(W - 12 - tg.w / 2, ty + tg.h / 2);
        ty += tg.h + 6;
      }
      // 左上角控件列：“?” 帮助按钮 + 静音按钮（隐私入口已移除，两者左对齐排布，间距 8px 不相交）
      const helpW = this.helpBtn ? this.helpBtn.w : 30;
      const muteW = this.muteBtn ? this.muteBtn.w : 30;
      const helpGap = 8;   // help 与 mute 间距
      if (this.helpBtn) this.helpBtn.setPosition(16 + helpW / 2, 18);
      if (this.muteBtn) this.muteBtn.setPosition(16 + helpW + helpGap + muteW / 2, 18);
      this._drawBestBadge();
      return;
    }

    // ---------- 竖屏：三行重排，避免与标题/分数/徽章互相挤压 ----------
    const tgH = 22;
    const modeW = 108;   // 加宽：每半 = 54px，足够容纳英文 "Hardcore"(~51px @11px) 不裁切
    const langW = 56;    // 语言切换较窄（中/EN），保持右缘对齐竖排
    const modeFont = 11; // 难度英文标签需完整可见
    const langFont = 12; // 语言标签短，字号略大
    this.modeToggle.resize(modeW, tgH, modeFont);
    this.langToggle.resize(langW, tgH, langFont);
    this.titleText.setFontSize('12px'); // 竖排切换占右上，标题缩到 12px 以在 320px 宽屏仍居中且不重叠
    this.leftScoreText.setFontSize('12px');
    this.rightScoreText.setFontSize('12px');
    this.totalText.setFontSize('12px');
    // 徽章竖屏自适应缩小（14px / 24h），避免与顶行/分数行重叠
    this.bestBadgeFontSize = 14;
    this.bestBadgeHeight = 24;
    this.bestScoreText.setFontSize(this.bestBadgeFontSize + 'px');
    // 先按竖屏 12px 单行刷新 caption，保证下方 measures 拿到的是最终文案宽度（位置不依赖宽度，仅为正确性）
    this._updateScoreCaptions();

    const measures = {
      titleW: this.titleText.width,
      titleH: Math.max(this.titleText.height, 14),
      modeW, langW, tgH,
      badgeW: Math.max(this.bestScoreText.width + BEST_BADGE_PAD_X * 2, 120),
      badgeH: this.bestBadgeHeight,
      leftW: this.leftScoreText.width,
      rightW: this.rightScoreText.width,
      totalW: this.totalText.width,
      rowH: Math.max(this.totalText.height, 12),
    };
    const r = computePortraitHudRects(W, hudH, measures);
    // 竖屏左上角控件列：“?” 帮助按钮 + 静音按钮（隐私入口已移除），沿用顶行中心 y
    const helpW = this.helpBtn ? this.helpBtn.w : 30;
    const muteW = this.muteBtn ? this.muteBtn.w : 30;
    const helpGap = 8;
    if (this.helpBtn) this.helpBtn.setPosition(16 + helpW / 2, r.topRowY);
    if (this.muteBtn) this.muteBtn.setPosition(16 + helpW + helpGap + muteW / 2, r.topRowY);
    this.titleText.setPosition(r.title.x, r.title.y);
    this.modeToggle.setPosition(r.modeToggle.x, r.modeToggle.y);
    this.langToggle.setPosition(r.langToggle.x, r.langToggle.y);
    this.bestScoreText.setPosition(r.badge.x, r.badge.y);
    this.bestBadge.setPosition(r.badge.x, r.badge.y);
    this.leftScoreText.setPosition(r.left.x, r.left.y);
    this.totalText.setPosition(r.total.x, r.total.y);
    this.rightScoreText.setPosition(r.right.x, r.right.y);
    this._drawBestBadge();
  }

  // ITER-V8-001：控制条按钮宽度响应式 —— 竖屏 W≈360 时 slot=90，固定 120 宽必然互叠。
  // 宽度取 min(120, slot*0.85)（下限 72 保持可点），并同步 setSize 更新 hitArea，
  // 视觉与命中一致，杜绝"看得到但点到别处/点不到"的失灵。
  layoutControls(W, H, ctrlH) {
    const y = H - ctrlH / 2;
    const n = 3; // ③ 去首页后控制条仅 撤销/冻结/重开，slot 自动铺开
    const slot = W / (n + 1);
    const bw = Math.min(CONTROL_BTN_WIDTH, Math.max(CONTROL_BTN_MIN_WIDTH, slot * 0.85));
    const fs = W < H ? 16 : 20; // 竖屏窄按钮缩字，避免文案溢出
    this.undoBtn.setSize(bw, CONTROL_BTN_HEIGHT).setFontSize(fs);
    this.freezeBtn.setSize(bw, CONTROL_BTN_HEIGHT).setFontSize(fs);
    this.restartBtn.setSize(bw, CONTROL_BTN_HEIGHT).setFontSize(fs);
    this.undoBtn.setPosition(slot * 1, y);
    this.freezeBtn.setPosition(slot * 2, y);
    this.restartBtn.setPosition(slot * 3, y);
  }

  // ---------------- 棋盘侧标签（用户决策③：横屏左/右，竖屏上/下） ----------------
  // 小圆角胶囊（半透明底 + 文字），放棋盘外侧（横屏=各盘上方，竖屏=上盘上方/下盘下方），
  // 不占棋盘内部空间；layout() 每次重排时刷新文案与位置，语言 in-place 切换经 refreshAllTexts -> layout() 自动更新。
  buildSideLabels() {
    this.sideLabels = [this._makeSideLabel(), this._makeSideLabel()];
  }

  _makeSideLabel() {
    const g = this.add.graphics();
    const t = this.add.text(0, 0, '', {
      fontFamily: FONT_STACK,
      fontStyle: '800',
      fontSize: SIDE_LABEL_FONT_SIZE + 'px',
      color: hexToStr(SIDE_LABEL_TEXT),
      align: 'center',
    }).setOrigin(0.5);
    const container = this.add.container(0, 0, [g, t]).setDepth(4);
    container.setVisible(false);
    return { container, g, t, w: 0, h: SIDE_LABEL_HEIGHT };
  }

  // 画胶囊：圆角 = 高一半（糖果胶囊），尺寸随文案自适应；高度随方向（竖屏 18 / 横屏 22）
  _drawSideLabel(lbl, text) {
    const h = this.sideLabelHeight || SIDE_LABEL_HEIGHT;
    lbl.t.setText(text);
    const w = Math.max(lbl.t.width + SIDE_LABEL_PAD_X * 2, h);
    lbl.w = w;
    lbl.h = h;
    lbl.g.clear();
    lbl.g.fillStyle(SIDE_LABEL_BG, SIDE_LABEL_BG_ALPHA);
    lbl.g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    lbl.t.setY(0);
  }

  // 放置：side = 'above'（棋盘上方外侧）| 'below'（棋盘下方外侧）
  // ITER-V8-001：'below' 的 y 上限必须避开控制条 —— H - ctrlH - 标签半高 - 8（原实现忽略 ctrlH，
  // 竖屏下盘标签直接落在控制条上，视觉重叠 + 顶层优先命中把点击路由给下层对象 -> 按键失灵根因）。
  _placeSideLabel(i, key, side) {
    const lbl = this.sideLabels[i];
    this._drawSideLabel(lbl, t(key));
    const W = this.scale.width;
    const H = this.scale.height;
    const gap = 6;
    const bv = this.boardViews[i];
    const cx = bv.container.x + bv.boardPx / 2;
    let x = cx;
    let y = bv.container.y - gap - lbl.h / 2; // above
    if (side === 'below') {
      y = bv.container.y + bv.boardPx + gap + lbl.h / 2;
    }
    // 夹紧在屏内（不溢出；标签在棋盘外侧，尽量不压棋盘内容）
    // 'below' 上限让出 ctrlH + 8px 缓冲；'above' 仅夹在屏内（竖屏布局已为上方标签预留空间）
    const ctrlH = this.ctrlH || 0;
    const maxY = side === 'below' ? H - ctrlH - lbl.h / 2 - 8 : H - lbl.h / 2 - 6;
    lbl.container.setPosition(
      Phaser.Math.Clamp(x, lbl.w / 2 + 6, W - lbl.w / 2 - 6),
      Phaser.Math.Clamp(y, lbl.h / 2 + 6, maxY)
    );
    lbl.container.setVisible(true);
  }

  // ---------------- 输入处理 ----------------
  handleMove(dir) {
    if (this.gameOver) return;
    if (this.freeze.selecting) {
      // 冻结选择期：方向输入不静默吞掉，给可感知提示
      showToast(this, t('freezeSelectingHint'));
      return;
    }
    if (this.busy) {
      // 动画锁内不丢输入：单向 pending 方向缓冲，只记住最近一次，动画结束再处理
      this.pendingDir = dir;
      return;
    }

    // 首次手势（方向键 / 滑动）解锁 AudioContext（自动播放策略）
    Audio.resume();

    const snapshot = this.serializeFull();
    // results 存 move() 完整返回（对象），供动画/生成判定 + 合并音分档
    const results = [null, null];
    let anyMoved = false;

    for (let i = 0; i < 2; i++) {
      if (this.freeze.frozen[i] || this.retired[i]) { results[i] = null; continue; }
      const r = this.boards[i].move(dir);
      results[i] = r;
      if (r.moved) anyMoved = true;
    }

    if (!anyMoved) { Audio.play('invalidMove'); return; } // 无效操作：不压栈、不生成

    Platform.happyTime(); // 正向时刻（有效移动/合并），适配器内部节流到 ~3s 一次

    // 有效移动：仅播放轻快"咻"滑动声；合并音按 ITER-V12-001 ① 已去除，避免干扰
    Audio.play('swipe');

    this.undo.push(snapshot);
    this.hasMoved = true;              // 首次有效移动已发生：之后难度切换须确认
    const frozenBeforeTick = this.freeze.frozen[0] || this.freeze.frozen[1];
    this.freeze.tick();                 // 冻结步数 -1（有效移动才计）
    this.syncFreezeOverlays();
    if (frozenBeforeTick) Audio.play('freezeTick'); // 冻结读秒感（仅冻结进行中）

    // ITER-V13-002 ②：仅在「本盘产生有效移动」的棋盘上生成新块；
    // 若本盘无有效移动（moved=false），即使另一盘动了，本盘也不出新块。
    // 上一版本用 if (results[i]) 判断，因 Board.move() 始终返回对象（moved=false 也为 truthy），
    // 会导致两盘只要没冻结/退役就各出 1 块——与产品规则不符，现已收紧到 .moved 判定。
    for (let i = 0; i < 2; i++) {
      if (results[i] && results[i].moved) this.boards[i].addRandomTile();
    }

    // 动画期：只对「发生有效移动」的盘做动画渲染；冻结/退役盘状态未变不重绘（消除闪烁）
    this.busy = true;
    for (let i = 0; i < 2; i++) {
      if (results[i] && results[i].moved) this.boardViews[i].render(this.boards[i], true);
    }
    this.refreshHUD();

    // 得分奖励冻结（每 1000 分 +1）
    const total = this.boards[0].score + this.boards[1].score;
    const gained = this.freeze.checkBonus(total);
    if (gained > 0) {
      showToast(this, t('scoreBonusFreeze', gained));
      this.refreshHUD();
    }

    // 胜负判定：先胜后负（动画结束后统一结算；休闲模式可能触发“退役/双达标”）
    this.time.delayedCall(ANIM_MS + 30, () => {
      this.busy = false;
      const nextDir = this.pendingDir;
      this.pendingDir = null;

      // ① 先判胜：任一盘合出 2048 方块 -> 胜利（优先于失败）
      const won = this.boards.some((b) => b.maxTile() >= WIN_VALUE);
      if (won) {
        this.endGame(true);
      } else if (this.mode === 'hardcore') {
        // ② 硬核：任一盘死局即负
        if (!this.boards[0].movesAvailable() || !this.boards[1].movesAvailable()) {
          this.endGame(false);
        }
      } else {
        // ③ 休闲：单步结算（退役 / 失败 / 双达标）
        const outcome = resolveCasualOutcome(this.boards, this.retired);
        if (outcome.action === 'retire') {
          const i = outcome.retireIndex;
          this.retired[i] = true;
          this.boardViews[i].showRetired();
          showToast(this, t('retiredToast', t(i === 0 ? 'sideLeft' : 'sideRight')));
          Audio.play('boardRetire');
        } else if (outcome.action === 'lose') {
          this.endGame(false);
        } else if (outcome.action === 'win') {
          showToast(this, t('winBothDone'));
          this.endGame(true, 'bothDone');
        }
      }

      // ④ 动画期间缓冲的方向：游戏未结束才处理（已结束则丢弃）
      if (nextDir && !this.gameOver) this.handleMove(nextDir);
    });
  }

  handleTap(p) {
    if (this.freeze.selecting) {
      const i = this.boardIndexAt(p.x, p.y);
      if (i != null) {
        if (this.freeze.applyTo(i)) {
          this.boardViews[i].showFreeze(this.freeze.steps[i]);
          Audio.play('freezeActivate'); // 水晶般微光 shimmer
          this.refreshHUD();
          showToast(this, t('frozenApplied', t(i === 0 ? 'sideLeft' : 'sideRight'), this.freeze.steps[i]));
        } else {
          showToast(this, t('boardAlreadyFrozen'));
          this.freeze.cancelSelect();
        }
      }
    }
  }

  boardIndexAt(px, py) {
    for (let i = 0; i < this.boardRects.length; i++) {
      const r = this.boardRects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return null;
  }

  // ---------------- 辅助系统交互 ----------------
  onUndoClick() {
    if (this.gameOver) { showToast(this, t('gameOverHint')); return; }
    if (this.freeze.selecting) this.freeze.cancelSelect();
    const snap = this.undo.undo();
    if (!snap) {
      if (this.undo.undoLeft <= 0) {
        this._requestUndoViaAd(); // 看广告得撤销（无外部平台时静默解析 true，本地测试可继续）
      } else {
        showToast(this, t('nothingToUndo'));
      }
      return;
    }
    this.restoreFull(snap);
    Audio.play('undo'); // 轻柔倒带
    this.boardViews.forEach((v, i) => { v.renderStatic(this.boards[i]); });
    this.syncFreezeOverlays();
    this.syncRetiredOverlays();
    this.refreshHUD();
  }

  // 看广告得撤销：请求激励视频，看完 -> 发放临时撤销次数；不可用/关闭 -> 保持原状。
  _requestUndoViaAd() {
    showToast(this, t('undoWatchAd'));
    Platform.requestRewardedAd().then((granted) => {
      if (granted) {
        this.undo.grantTemp(this.undo.freeUses); // 奖励等于初始免费次数
        this.refreshHUD();
        showToast(this, t('undoGranted', this.undo.freeUses), null, 'success');
      } else {
        this._noteAdUnavailable(); // 同一信号：广告压根没开始播 -> 记为不可用（方案 B）
        showToast(this, t('undoUsedUp'), null, 'warning');
      }
    });
  }

  // 方案 B 判定：广告请求失败且「从未开始播放」(lastAdStarted=false) -> 平台侧不可投放
  // （Basic Launch / 拦截 / 无填充），置位后结算遮罩不再显示看广告按钮。
  // 若广告已开始播放而玩家中途关闭，则属正常取消，不置位（下次仍可看）。
  _noteAdUnavailable() {
    if (!isAdUnavailableSignal(false, Platform.lastAdStarted)) return false;
    this.adsUnavailable = true;
    return true;
  }

  // ITER-V13：失败窗口「看广告自动撤销5步」续命。看完激励视频 -> 自动回退 5 步并恢复对局；
  // 不可用/未看完 -> 不回退；已无历史 -> 提示无内容可撤销。
  onWatchAdUndo() {
    if (!this.gameOver) return; // 仅在失败遮罩期间有效
    showToast(this, t('rewindAdBtn'));
    Platform.requestRewardedAd().then((granted) => {
      if (!granted) {
        // 方案 B：广告根本没开始播 -> 提示「广告暂未开放」并隐藏入口；
        // 已开始播但玩家中途关闭 -> 维持原「未看完，未回退」提示，按钮保留。
        if (this._noteAdUnavailable()) {
          showToast(this, t('adUnavailable'), null, 'warning');
          this.overlayUndoBtn.setVisible(false);
        } else {
          showToast(this, t('rewindAdCancelled'), null, 'warning');
        }
        return;
      }
      const res = this.undo.undoMany(5); // 不消耗免费 undoLeft（广告奖励独立）
      if (!res.snapshot) {
        showToast(this, t('nothingToUndo'), null, 'warning');
        return;
      }
      // 回退 5 步：恢复棋盘/冻结/退役快照，刷新视图，关闭遮罩，恢复对局
      this.restoreFull(res.snapshot);
      this.boardViews.forEach((v, i) => v.renderStatic(this.boards[i]));
      this.syncFreezeOverlays();
      this.syncRetiredOverlays();
      this.gameOver = false;
      this.busy = false;
      this.pendingDir = null;
      this.hideOverlay();
      this.refreshHUD();
      showToast(this, t('rewoundSteps', res.steps), null, 'success');
    });
  }

  onFreezeClick() {
    if (this.gameOver) { showToast(this, t('gameOverHint')); return; }
    const fLeft = this.freeze.left + this.freeze.bonusLeft;
    if (fLeft <= 0) { showToast(this, t('freezeUsedUp')); return; }
    if (this.freeze.frozen[0] && this.freeze.frozen[1]) { showToast(this, t('bothFrozen')); return; }
    if (this.freeze.selecting) {
      this.freeze.cancelSelect();
      showToast(this, t('freezeSelectCancelled'));
      return;
    }
    this.freeze.beginSelect();
    if (!this.freeze.selecting) {
      showToast(this, t('cannotFreezeNow'));
      return;
    }
    showToast(this, t('tapToFreeze'));
  }

  syncFreezeOverlays() {
    for (let i = 0; i < 2; i++) {
      if (this.freeze.frozen[i]) this.boardViews[i].showFreeze(this.freeze.steps[i]);
      else this.boardViews[i].hideFreeze();
    }
  }

  // 按 retired 状态同步退役遮罩（撤销 / 重开时调用）
  syncRetiredOverlays() {
    for (let i = 0; i < 2; i++) {
      if (this.retired[i]) this.boardViews[i].showRetired();
      else this.boardViews[i].hideRetired();
    }
  }

  // ---------------- 状态快照（撤销用） ----------------
  serializeFull() {
    return {
      boards: this.boards.map((b) => b.serialize()),
      freeze: this.freeze.serialize(),
      retired: this.retired.slice(), // 撤销可回到退役前状态
    };
  }

  restoreFull(s) {
    this.boards.forEach((b, i) => b.restore(s.boards[i]));
    this.freeze.restore(s.freeze);
    // 旧快照可能无 retired 字段，兜底为未退役
    this.retired = s.retired ? s.retired.slice() : [false, false];
  }

  // ---------------- 结束 / 重开 ----------------
  endGame(win, reason) {
    this.gameOver = true;
    this.pendingDir = null; // 结算后丢弃缓冲方向，避免重开后误执行
    const total = this.boards[0].score + this.boards[1].score;
    let newBest = false;
    if (total > this.bestScore) {
      this.bestScore = total;
      try { localStorage.setItem('simultwin.bestScore', String(total)); } catch (e) { /* 隐私模式不阻塞 */ }
      showToast(this, t('newBest'), null, 'success');
      newBest = true;
    }
    this.refreshHUD();
    // ④ 破纪录短暂高亮徽章（须在 refreshHUD 常态重绘之后，否则会被覆盖）
    if (newBest) this._flashBestBadge();
    this.syncFreezeOverlays();
    // 胜负 / 破纪录 音效（audio-bible §2 #5/#6/#18）
    Audio.play(win ? 'win' : 'lose');
    if (newBest) Audio.play('newBest');
    this.showOverlay(win, reason);
  }

  restart() {
    this.boards = [new Board(SIZE), new Board(SIZE)];
    this.retired = [false, false];
    this.undo.reset();
    this.freeze.reset();
    this.boardViews.forEach((v) => { v.clearTiles(); v.hideFreeze(); v.hideRetired(); });
    this.boardViews.forEach((v, i) => v.renderStatic(this.boards[i]));
    this.gameOver = false;
    this.busy = false;
    this.pendingDir = null;
    this.hasMoved = false; // 重开后允许难度直切（首次有效移动前）
    // 注意：adsUnavailable 刻意**不**在重开时复位 —— 它是「本次会话平台侧广告不可投放」的事实，
    // 一局一复位会让玩家每局都白点一次那颗按钮，与方案 B「隐藏入口」的目的相悖。
    this.hideOverlay();
    this.refreshHUD();
  }

  // ---------------- 难度切换确认弹窗（首次有效移动后） ----------------
  // 纯 InteractionManager 模态：全屏遮罩 + 全屏命中矩形（先注册=底层，消费手势、阻断穿透到棋盘/HUD），
  // 其上再注册 Confirm/Cancel 按钮（后注册=顶层，优先命中）。打开期间 HUD/棋盘命中被遮罩吞掉 -> 模态。
  _askSwitchMode(targetKey) {
    if (this.modeSwitchDialog) return; // 已开则不叠对话框
    const W = this.scale.width;
    const H = this.scale.height;

    // 半透明遮罩（深度 950）
    const bg = this.add.graphics().setDepth(950).setVisible(true);
    bg.fillStyle(OVERLAY_BG, 0.55);
    bg.fillRect(0, 0, W, H);

    // 全屏命中矩形：先注册（底层），点遮罩空白仅消费手势（不落空到棋盘/HUD）
    const dimHit = this.interactions.register(
      { x: 0, y: 0, w: W, h: H },
      () => { /* 点遮罩外：吞掉手势，无操作 */ }
    );

    // 标题文案（深度 951）
    const text = this.add.text(W / 2, H * 0.4, t('modeSwitchPrompt'), {
      fontFamily: FONT_STACK, fontStyle: '800', fontSize: '20px',
      color: hexToStr(TEXT_WHITE), align: 'center', wordWrap: { width: W * 0.8 },
    }).setOrigin(0.5).setDepth(951);

    // 确认 / 取消 按钮（后注册=顶层，先于 dim 被命中）
    const onConfirm = () => {
      this.mode = targetKey === 'casual' ? 'casual' : 'hardcore';
      Audio.play('difficultySwitch'); // 经确认框切换难度同样给切换音
      this.modeToggle.setCurrent(this.mode);
      this.restart();
      this._closeModeSwitchDialog();
    };
    // ITER-V12-001 ③：取消时把难度按钮视觉回退到原难度（this.mode 仍为 A），
    // 避免点击 B 后按钮已移位、取消后玩家误以为当前是 B。
    const onCancel = () => {
      this.modeToggle.setCurrent(this.mode);
      this._closeModeSwitchDialog();
    };
    const confirmBtn = new Button(this, W / 2 - 70, H * 0.5, 120, 48, t('confirm'), onConfirm,
      { fontSize: 18, depth: 952 });
    const cancelBtn = new Button(this, W / 2 + 70, H * 0.5, 120, 48, t('cancel'), onCancel,
      { fontSize: 18, depth: 952 });

    this.modeSwitchDialog = { bg, dimHit, text, confirmBtn, cancelBtn };
  }

  // 关闭难度切换确认弹窗：销毁遮罩/全屏命中/文案/两个按钮（Button.destroy 同步移除其 InteractionManager 句柄）
  _closeModeSwitchDialog() {
    const d = this.modeSwitchDialog;
    if (!d) return;
    d.dimHit.destroy();   // 移除全屏命中矩形（InteractionManager 句柄）
    d.bg.destroy();
    d.text.destroy();
    d.confirmBtn.destroy();
    d.cancelBtn.destroy();
    this.modeSwitchDialog = null;
  }
}
