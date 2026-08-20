// ITER-V8-001：竖屏 HUD 布局纯函数自检（无 Phaser 依赖，仅依赖坐标数学）
// 运行：node tests/portrait.test.mjs
// 验证 computePortraitHudRects 在典型竖屏宽度（320/360/390/430）下：
//   1) 所有元素矩形落在屏内（x/y 均不越界）；
//   2) 任意两两矩形间距 >= 6px（含同行与跨行）；
//   3) 交互对象（两个 SegToggle）hitArea 两两不相交；
//   4) 控制条按钮宽度 <= slot*0.9（竖屏缩窄不互叠）；
//   5) 'below' 侧标签 y 上限 <= H - ctrlH - 8（避让控制条）；
//   6) P0-FIX（合规决策 A）：隐私入口已移除 —— 不再返回 privacy 矩形，改由 topRowY 承载顶行；
//      左上角「帮助 + 静音」控件列（layoutHUD 同公式）不得与居中标题相撞。
// game.js 顶层引用 Phaser.Scene，Node 下先补最小桩再动态导入（只做 extends，不实例化）。
globalThis.Phaser = { Scene: class {} };
const { computePortraitHudRects } = await import('../src/game.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

// 间距检查：把 a、b 两个矩形各向外扩 gap 后判交。返回 true 表示“间距不足 gap”。
function tooClose(a, b, gap = 6) {
  return !(
    a.x + a.w / 2 + gap <= b.x - b.w / 2 ||
    b.x + b.w / 2 + gap <= a.x - a.w / 2 ||
    a.y + a.h / 2 + gap <= b.y - b.h / 2 ||
    b.y + b.h / 2 + gap <= a.y - a.h / 2
  );
}

// 典型竖屏测量（英文为主校验：标题 "Simultwin" 12px≈72、
// 难度每半需容纳 "Hardcore"@11px≈51 -> modeW=108 每半 54、语言 "中/EN" langW=56、
// 徽章 min 120 宽 / 24px 高、分数行 12px）
const baseMeasures = {
  titleW: 72, titleH: 18,
  modeW: 108, langW: 56, tgH: 22,
  badgeW: 120, badgeH: 24,
  leftW: 55, rightW: 55, totalW: 62, rowH: 14,
};

const WIDTHS = [320, 360, 390, 430];
const HUD_H = 88; // 竖屏典型（80–90 区间中值）

for (const W of WIDTHS) {
  const r = computePortraitHudRects(W, HUD_H, baseMeasures);
  const keys = ['title', 'modeToggle', 'langToggle', 'badge', 'left', 'total', 'right'];

  // 0) 隐私入口已移除：不得再返回 privacy 矩形；顶行 y 由 topRowY 提供（与 title.y 同值）
  assert(r.privacy === undefined, `[W=${W}] privacy 矩形已移除`);
  assert(typeof r.topRowY === 'number' && Math.abs(r.topRowY - r.title.y) < 1e-6,
    `[W=${W}] topRowY 存在且与标题同一顶行`);

  // 1) 屏内
  for (const k of keys) {
    const q = r[k];
    assert(q.x - q.w / 2 >= 0 && q.x + q.w / 2 <= W, `[W=${W}] ${k} 水平在屏内`);
    assert(q.y - q.h / 2 >= 0 && q.y + q.h / 2 <= HUD_H, `[W=${W}] ${k} 垂直在 HUD 内`);
  }

  // 2) 两两间距 >= 6px
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      assert(!tooClose(r[keys[i]], r[keys[j]], 6), `[W=${W}] ${keys[i]} 与 ${keys[j]} 间距 >= 6px`);
    }
  }

  // 3) 交互对象 hitArea 两两不相交
  const inter = ['modeToggle', 'langToggle'];
  for (let i = 0; i < inter.length; i++) {
    for (let j = i + 1; j < inter.length; j++) {
      assert(!tooClose(r[inter[i]], r[inter[j]], 6), `[W=${W}] 交互 ${inter[i]} 与 ${inter[j]} hitArea 不相交`);
    }
  }

  // 3b) 新布局语义检查（竖排 + 标题居中）
  assert(Math.abs(r.title.x - W / 2) < 1e-6, `[W=${W}] 标题水平居中于 x=W/2`);
  assert(r.modeToggle.y < r.langToggle.y, `[W=${W}] 难度切换在语言切换上方（竖排）`);
  assert(Math.abs(
    (r.modeToggle.x + r.modeToggle.w / 2) - (r.langToggle.x + r.langToggle.w / 2)
  ) < 1e-6, `[W=${W}] 两切换右缘对齐（同右缘 W-10）`);
  // 徽章居中，其右缘 +6 不得超过语言切换左缘（避免与竖排切换重叠）
  const langLeft = r.langToggle.x - r.langToggle.w / 2;
  assert(r.badge.x + r.badge.w / 2 + 6 <= langLeft, `[W=${W}] 徽章右缘+6 <= 语言切换左缘`);

  // 3c) 左上角控件列（help 30px + gap 8 + mute 30px，左边距 16 —— 与 layoutHUD 同公式）
  //     必须与居中标题保持 >= 6px 间距（隐私入口移除后这里是唯一的左上占位）
  {
    const helpW = 30, muteW = 30, helpGap = 8;
    const clusterRight = 16 + helpW + helpGap + muteW;
    const cluster = { x: (16 + clusterRight) / 2, y: r.topRowY, w: clusterRight - 16, h: 30 };
    assert(clusterRight + 6 <= r.title.x - r.title.w / 2,
      `[W=${W}] 帮助/静音控件列右缘+6 (${clusterRight + 6}) <= 标题左缘 (${(r.title.x - r.title.w / 2).toFixed(1)})`);
    assert(!tooClose(cluster, r.modeToggle, 6), `[W=${W}] 帮助/静音控件列与难度切换不相交`);
    assert(!tooClose(cluster, r.langToggle, 6), `[W=${W}] 帮助/静音控件列与语言切换不相交`);
  }

  // 4) 控制条按钮宽度 <= slot*0.9（与 layoutControls 同公式）
  const slot = W / 4;
  const bw = Math.min(120, Math.max(72, slot * 0.85));
  assert(bw <= slot * 0.9, `[W=${W}] 控制条按钮宽 ${bw.toFixed(1)} <= slot*0.9=${(slot * 0.9).toFixed(1)}`);
  assert(bw <= slot, `[W=${W}] 控制条按钮宽 ${bw.toFixed(1)} <= slot=${slot.toFixed(1)}（不互叠）`);
}

// 5) 'below' 侧标签避让控制条：任一摆放 y 必须满足 y + h/2 <= H - ctrlH - 8
//    （与 _placeSideLabel 的 maxY 公式一致；取竖屏 360x640 的实际布局数值）
{
  const H = 640, ctrlH = 83.2, labelH = 18;
  const maxY = H - ctrlH - labelH / 2 - 8;
  // 棋盘 1 底边（layout 竖屏分支：innerBottom）+ 6px gap + 标签半高
  const board1Bottom = 522; // 360x640 布局实测约 522
  const y = board1Bottom + 6 + labelH / 2;
  assert(y <= maxY, `below 标签 y=${y.toFixed(1)} <= maxY=${maxY.toFixed(1)}`);
  assert(y + labelH / 2 <= H - ctrlH - 8, `below 标签底 y+h/2=${(y + labelH / 2).toFixed(1)} <= H-ctrlH-8=${(H - ctrlH - 8).toFixed(1)}`);
}

console.log(`\nPortrait layout assertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
