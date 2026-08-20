// 用 Playwright 录制《Simultwin》预览视频（横屏 + 竖屏各一段）。
// 依赖：npm install playwright && npx playwright install chromium（已在后台运行）
// 运行：NODE_PATH=<workspace>/node_modules node tools/record_video.cjs
// 输出：videos/landscape.webm / videos/portrait.webm（兼容 webm/mp4）

const { chromium } = require('playwright');

const URL = 'http://localhost:3000';
const DIRS = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
const STEP_MS = 380;          // 每步间隔
const STEPS = 45;             // 约 17s（45 * 0.38 ≈ 17.1s）+ 加载 3.5s ≈ 20s
const OUT_DIR = 'videos';

const fs = require('fs');
const path = require('path');

async function record(size, name) {
  console.log(`[record] ${name} ${size.width}x${size.height} ...`);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({
    viewport: size,
    recordVideo: { dir: OUT_DIR, size: size },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  // 等游戏加载 + 首次用户手势解锁 AudioContext（失败降级不影响渲染）
  await page.waitForTimeout(3500);
  await page.mouse.click(Math.floor(size.width / 2), Math.floor(size.height / 2));
  await page.waitForTimeout(300);

  // 模拟方向键让双盘动起来（滑动 + 合并 + 偶尔冻结/撤销以展示机制）
  for (let i = 0; i < STEPS; i++) {
    await page.keyboard.press(DIRS[i % 4]);
    await page.waitForTimeout(STEP_MS);
    // 每 12 步插入一次“冻结”展示（按 F 键，若游戏支持）—仅作演示，失败无副作用
    if (i === 12) { try { await page.keyboard.press('f'); } catch (e) {} }
  }

  const video = page.video();
  await context.close();
  await browser.close();

  // 重命名到固定文件名
  if (video) {
    const src = await video.path();
    const dst = path.join(OUT_DIR, name + '.webm');
    if (src && fs.existsSync(src)) {
      fs.renameSync(src, dst);
      console.log(`[record] saved ${dst} (${(fs.statSync(dst).size / 1024).toFixed(0)} KB)`);
    } else {
      console.log(`[record] WARN: video path missing for ${name}`);
    }
  }
  if (errors.length) console.log(`[record] ${name} console errors:`, errors.slice(0, 5));
  console.log(`[record] ${name} done`);
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  await record({ width: 1920, height: 1080 }, 'landscape');
  await record({ width: 1080, height: 1920 }, 'portrait');
  console.log('ALL DONE');
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
