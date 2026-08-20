// input.js —— 输入适配：方向键 + 触屏滑动
// 把方向意图与“点击/轻触”分别回调给上层，由 GameScene 决定如何处理
// （例如冻结选择阶段，轻触用于选择棋盘）。
//
// ITER-V9-REWRITE-001 交互分层：
//   按钮手势由 InteractionManager 的全局 pointerdown 处理器优先命中（置 consumed=true）。
//   InteractionManager 在 GameScene.create 中先于 setupInput 创建，其 pointerdown 处理器
//   先注册先执行；本文件 pointerdown 处理器随后读取 isConsumed() 判定本手势归属：
//     - 已被按钮消费 → 不记录滑动起点，pointerup 直接 return（不再当滑动/点击）；
//     - 未被按钮消费 → 记录滑动起点，保持现有滑动/点击逻辑（冻结选盘 onTap 照旧）。

const KEY_MAP = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
};

export function setupInput(scene, handlers) {
  const kb = scene.input.keyboard;
  if (kb) {
    // 阻止方向键滚动页面
    const KC = Phaser.Input.Keyboard.KeyCodes;
    kb.addCapture([KC.UP, KC.DOWN, KC.LEFT, KC.RIGHT]);
    ['UP', 'DOWN', 'LEFT', 'RIGHT'].forEach((k) => {
      kb.on('keydown-' + k, () => {
        if (handlers.onDirection) handlers.onDirection(KEY_MAP[k]);
      });
    });
  }

  const interactions = scene.interactions || null;
  let sx = 0, sy = 0;
  let gestureConsumed = false; // 当前手势是否已被按钮消费（pointerup 直接返回）
  const SWIPE_THRESHOLD = 30;

  scene.input.on('pointerdown', (p) => {
    // InteractionManager 的 pointerdown 处理器先于本处注册并完成按钮命中，
    // 此处读取其消费标记决定本手势归属（每帧 pointerdown 自动复位，无跨手势污染）。
    gestureConsumed = !!(interactions && interactions.isConsumed());
    if (gestureConsumed) return; // 按钮手势：不记录滑动起点
    sx = p.x; sy = p.y;
  });

  scene.input.on('pointerup', (p) => {
    if (gestureConsumed) return; // 按钮已消费的手势，不再参与滑动/点击判定
    const dx = p.x - sx;
    const dy = p.y - sy;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx < SWIPE_THRESHOLD && ady < SWIPE_THRESHOLD) {
      // 视为点击而非滑动
      if (handlers.onTap) handlers.onTap(p);
      return;
    }
    if (adx > ady) {
      if (handlers.onDirection) handlers.onDirection(dx > 0 ? 'right' : 'left');
    } else {
      if (handlers.onDirection) handlers.onDirection(dy > 0 ? 'down' : 'up');
    }
  });
}
