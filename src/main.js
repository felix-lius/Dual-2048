// main.js —— 启动入口：Phaser 配置 + 全局错误覆盖层 + 可选平台集成初始化
// ITER-V6-REDO-001 ③：去首页 —— 只保留 GameScene 直接启动（默认硬核，游戏内可切模式/语言）
import './storage-migrate.js'; // RN-3：dual2048.* → simultwin.* 一次性迁移，须在读取 localStorage 的模块前执行
import { GameScene } from './game.js';
import { Platform } from './platform.js';
import { initI18n, bindGame } from './i18n.js';
import { BG_GRADIENT_TOP, hexToStr } from './theme.js';

// 全局错误覆盖层（ITER-V5-001）：不替换 #game 的 innerHTML（那会抹掉 Phaser 画布导致白屏），
// 改为在 <body> 顶部挂一个固定悬浮报错横幅，显示错误信息方便调试，游戏画布保留、继续运行。
function showErrorBanner(info) {
  let el = document.getElementById('__err_banner__');
  if (!el) {
    el = document.createElement('div');
    el.id = '__err_banner__';
    el.style.cssText =
      'position:fixed;top:0;left:0;z-index:99999;background:#b00020;color:#fff;' +
      'font:12px/1.5 monospace;padding:6px 10px;max-width:100vw;max-height:38vh;overflow:auto;' +
      'white-space:pre-wrap;word-break:break-all;box-sizing:border-box;';
    document.body.appendChild(el);
  }
  const text =
    (info && info.message) || (info && info.error && info.error.message) ||
    (info && info.reason && (info.reason.message || String(info.reason))) || String(info);
  el.textContent = '[runtime error] ' + text + (el.textContent ? '\n' + el.textContent.slice(0, 600) : '');
}
window.addEventListener('error', (e) => showErrorBanner(e));
window.addEventListener('unhandledrejection', (e) => showErrorBanner((e && e.reason) || 'unhandledrejection'));

Platform.init();

// 读取持久化语言（默认英文），确保在场景 create 前就位
initI18n();

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: hexToStr(BG_GRADIENT_TOP), // 渐变由各场景 theme.createBackgroundGradient 铺底，此色为兜底
  scale: {
    mode: Phaser.Scale.RESIZE,     // 自适应视口；GameScene 内部再做横/竖排版
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  scene: [GameScene],
};

let started = false;
function boot() {
  if (started) return;
  started = true;
  // Phaser 未加载守卫：避免沙箱/离线时 new Phaser.Game 抛 ReferenceError 黑屏
  if (typeof Phaser === 'undefined') {
    document.getElementById('game').innerHTML = '<p style="color:#06324a;padding:20px;font-family:sans-serif">Phaser 未加载，请检查 vendor/phaser.min.js</p>';
    return;
  }
  // eslint-disable-next-line no-new
  const game = new Phaser.Game(config);
  // bindGame 保留兼容（i18n 已改为事件回调驱动文案刷新，不再依赖场景重启）
  bindGame(game);
}

// 立即启动（不再等待网络字体；字体已在 index.html 用本地 font-family 兜底）
boot();
