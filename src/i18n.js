// i18n.js —— 轻量多语言（不依赖 Phaser）。主语言：英文。
// 用法：t('key', ...args) 取当前语言文案；{0}/{1} 为参数占位。
// setLanguage(lang) 切换语言并持久化，通过订阅回调（onLanguageChange）通知当前场景
// in-place 刷新文案 —— 绝不调用 scene.restart（ITER-V6-REDO-001 ①，根治快速连点失效）。

const STORAGE_KEY = 'simultwin.lang';

export const strings = {
  en: {
    title: 'Simultwin',
    subtitle: 'Dual-board Sync',
    modeHardcoreBtn: 'Hardcore (default)',
    modeCasualBtn: 'Casual',
    startGame: 'Start Game',
    hint: 'One swipe drives both boards at once · Push either board to the top tile',
    leftBoard: 'Left',
    rightBoard: 'Right',
    // 棋盘侧标签（用户决策③：横屏左/右，竖屏上/下）
    boardLeft: 'Left',
    boardRight: 'Right',
    boardTop: 'Top',
    boardBottom: 'Bottom',
    // HUD 分数盘 caption（ITER-V7-001 ④：竖屏时上盘/下盘，独立于侧标签短文案）
    boardScoreTop: 'Top',
    boardScoreBottom: 'Bottom',
    total: 'Total',
    modeHardcore: 'Mode: Hardcore',
    modeCasual: 'Mode: Casual',
    // 难度切换按钮短文案（ITER-V6-REDO-001 ③：HUD 难度按钮用）
    modeHardcoreShort: 'Hardcore',
    modeCasualShort: 'Casual',
    undo: 'Undo ({0})',
    freeze: 'Freeze ({0})',
    restart: 'Restart',
    fullscreen: 'Fullscreen',
    home: 'Home',
    privacy: 'Privacy',
    playAgain: 'Play Again',
    win: 'Victory!',
    winSub: 'Either board reaches the top tile',
    winBothDone: 'Both boards done!',
    winBothDoneSub: 'Top tile on both boards!',
    loseHardcore: 'Defeat',
    loseHardcoreSub: 'Hardcore: any board stuck = lose',
    loseCasual: 'Defeat',
    loseCasualSub: 'Casual: a deadlocked board below 2048',
    retiredToast: '{0} board done, keep playing the other',
    best: 'Best',
    newBest: 'New best!',
    scoreBonusFreeze: 'Score bonus: Freeze +{0}',
    frozenApplied: 'Froze {0} board ({1} steps)',
    boardAlreadyFrozen: 'That board is already frozen',
    freezeSelectCancelled: 'Freeze selection cancelled',
    tapToFreeze: 'Tap the board to freeze (Left / Right)',
    cannotFreezeNow: 'Cannot freeze now (a board is already frozen)',
    bothFrozen: 'Both boards are frozen',
    freezeUsedUp: 'Freeze uses used up',
    undoUsedUp: 'Undo uses used up (watch ad for undo - placeholder)',
    nothingToUndo: 'Nothing to undo',
    gameOverHint: 'Game over — restart to play again',
    freezeSelectingHint: 'Selecting freeze target — tap a board (Freeze to cancel)',
    privacyPlaceholder: 'Privacy: placeholder link',
    modeSwitchPrompt: 'Switch difficulty and restart?',
    confirm: 'Confirm',
    cancel: 'Cancel',
    sideLeft: 'left',
    sideRight: 'right',
    // 新手教程 / How to Play 覆盖层（每条单独一行带编号，用户决策 ITER-V11-001 ①）
    tutorialTitle: 'How to Play',
    tutorialLines: [
      '1. One set of arrow keys / swipes drives BOTH boards at once.',
      '2. Push either board to the top tile to win.',
      '3. If a board locks up, you lose. (Casual: a finished board retires and you keep playing the other.)',
      '4. Use Undo and Freeze to recover.',
    ],
    tutorialGotIt: 'Got it',
    // 看广告得撤销
    undoWatchAd: 'Watch an ad to earn 5 undos',
    undoGranted: 'Earned {0} undos!',
    // ITER-V13：失败窗口「看广告自动撤销5步」续命
    rewindAdBtn: 'Watch ad: undo 5 steps, continue',
    rewoundSteps: 'Rewound {0} steps — keep playing!',
    rewindAdCancelled: 'Ad not completed — no rewind',
    // 方案 B：广告暂不可用时，探测到不可用后提示并隐藏入口
    adUnavailable: 'Ads not available yet',
  },
  zh: {
    // 游戏名以英文品牌优先；中英页面统一显示"Simultwin"（用户决策 ITER-V11-001 ④）
    title: 'Simultwin',
    subtitle: '双盘同步',
    modeHardcoreBtn: '硬核模式（默认）',
    modeCasualBtn: '休闲模式',
    startGame: '开始游戏',
    hint: '一次滑动同时驱动两盘 · 任一方块达最高数字即胜',
    leftBoard: '左盘',
    rightBoard: '右盘',
    // 棋盘侧标签（用户决策③：横屏左/右，竖屏上/下）
    boardLeft: '左',
    boardRight: '右',
    boardTop: '上',
    boardBottom: '下',
    // HUD 分数盘 caption（ITER-V7-001 ④：竖屏时上盘/下盘，独立于侧标签短文案）
    boardScoreTop: '上盘',
    boardScoreBottom: '下盘',
    total: '总分',
    modeHardcore: '模式：硬核',
    modeCasual: '模式：休闲',
    // 难度切换按钮短文案（ITER-V6-REDO-001 ③：HUD 难度按钮用）
    modeHardcoreShort: '硬核',
    modeCasualShort: '休闲',
    undo: '撤销 ({0})',
    freeze: '冻结 ({0})',
    restart: '重开',
    fullscreen: '全屏',
    home: '首页',
    privacy: '隐私政策',
    playAgain: '再来一局',
    win: '胜利！',
    winSub: '任一棋盘达成最高数字',
    winBothDone: '双盘均达标！',
    winBothDoneSub: '两盘都达成最高数字',
    loseHardcore: '失败',
    loseHardcoreSub: '硬核：任一盘死局即负',
    loseCasual: '失败',
    loseCasualSub: '休闲：死局棋盘总分<2048',
    retiredToast: '{0}盘达标，继续另一盘',
    best: '最高分',
    newBest: '新纪录！',
    scoreBonusFreeze: '得分奖励：冻结 +{0}',
    frozenApplied: '已冻结{0}盘（{1} 步）',
    boardAlreadyFrozen: '该盘已被冻结',
    freezeSelectCancelled: '已取消冻结选择',
    tapToFreeze: '点击要冻结的棋盘（左 / 右）',
    cannotFreezeNow: '当前不可冻结（已有棋盘冻结中）',
    bothFrozen: '两盘均已冻结',
    freezeUsedUp: '冻结次数已用完',
    undoUsedUp: '撤销次数已用完（看广告得撤销 - 占位）',
    nothingToUndo: '暂无可撤销的操作',
    gameOverHint: '游戏已结束，重开一局继续',
    freezeSelectingHint: '正在选择冻结目标，点击棋盘（再点冻结可取消）',
    privacyPlaceholder: '隐私政策：占位链接',
    modeSwitchPrompt: '切换难度并重开一局？',
    confirm: '确认',
    cancel: '取消',
    sideLeft: '左',
    sideRight: '右',
    // 新手教程 / How to Play 覆盖层（每条单独一行带编号，用户决策 ITER-V11-001 ①）
    tutorialTitle: '玩法说明',
    tutorialLines: [
      '1. 同一组方向键 / 滑动同时驱动两块棋盘。',
      '2. 任一方块推到最高数字即获胜。',
      '3. 某盘锁死则判负（休闲：已达标棋盘退役，继续玩另一盘）。',
      '4. 善用「撤销」与「冻结」来脱困。',
    ],
    tutorialGotIt: '知道了',
    // 看广告得撤销
    undoWatchAd: '看广告获得 5 次撤销',
    undoGranted: '获得 {0} 次撤销！',
    // ITER-V13：失败窗口「看广告自动撤销5步」续命
    rewindAdBtn: '看广告：撤销 5 步，继续游戏',
    rewoundSteps: '已回退 {0} 步，继续游戏！',
    rewindAdCancelled: '广告未看完，未回退',
    // 方案 B：广告暂不可用时，探测到不可用后提示并隐藏入口
    adUnavailable: '广告暂未开放',
  },
};

let _lang = 'en';
let _game = null;
// 语言变更订阅者：场景/组件注册回调，setLanguage 后由它们自行刷新文案（不再 scene.restart）
const _langChangeListeners = [];

// 订阅语言变更，返回取消订阅函数。回调签名：fn(lang)
export function onLanguageChange(fn) {
  if (typeof fn !== 'function') return () => {};
  _langChangeListeners.push(fn);
  return () => {
    const i = _langChangeListeners.indexOf(fn);
    if (i >= 0) _langChangeListeners.splice(i, 1);
  };
}

function _readStored() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) != null) {
      return localStorage.getItem(STORAGE_KEY);
    }
  } catch (e) { /* 隐私模式可能抛错，忽略 */ }
  return null;
}

export function getLanguage() {
  return _lang;
}

export function setLanguage(lang) {
  if (lang !== 'en' && lang !== 'zh') lang = 'en';
  _lang = lang;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) { /* 隐私模式不阻塞 */ }

  // ITER-V6-REDO-001 ①：只更新状态 + 通知订阅者 in-place 刷新，绝不 scene.restart。
  // 场景内由 GameScene.refreshAllTexts() 之类回调把 HUD/控制条/侧标签/结算文案统一更新。
  _langChangeListeners.forEach((fn) => {
    try { fn(lang); } catch (e) { /* 单个订阅者异常不影响其它订阅者 */ }
  });
}

// 兼容保留：由 main.js 在 new Phaser.Game 后调用注入 game 实例（不再用于场景重启）
export function bindGame(game) {
  _game = game;
}

// 初始化：从 localStorage 读取持久化语言（默认英文）。可在 boot 早期调用。
export function initI18n() {
  const stored = _readStored();
  _lang = (stored === 'en' || stored === 'zh') ? stored : 'en';
  return _lang;
}

export function t(key, ...args) {
  const dict = strings[_lang] || strings.en;
  let s = dict[key] != null ? dict[key] : (strings.en[key] != null ? strings.en[key] : key);
  // 数组/对象等非字符串值原样返回（ITER-V11-001 ①：教程正文拆为 tutorialLines 数组）
  if (typeof s !== 'string') return s;
  if (args.length) {
    s = s.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] != null ? String(args[Number(i)]) : m));
  }
  return s;
}
