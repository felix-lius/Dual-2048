// 最小 Node 断言：i18n.js（en/zh 文案、setLanguage 切换、持久化键）
// 运行：node tests/i18n.test.mjs
import { strings, t, setLanguage, getLanguage, initI18n } from '../src/i18n.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + msg); }
}

// --- mock localStorage ---
globalThis.localStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

// --- 默认语言：英文 ---
initI18n();
assert(getLanguage() === 'en', 'default language is en');

// --- en 文案 ---
assert(strings.en.title === 'Simultwin', 'en title');
assert(strings.en.startGame === 'Start Game', 'en startGame');
assert(t('title') === 'Simultwin', 't() returns en title');
assert(t('undo', 3) === 'Undo (3)', 'en undo format');
assert(t('frozenApplied', 'left', 5) === 'Froze left board (5 steps)', 'en frozenApplied format');

// --- zh 文案 + 切换 ---
setLanguage('zh');
assert(getLanguage() === 'zh', 'getLanguage returns zh after setLanguage');
assert(localStorage.getItem('simultwin.lang') === 'zh', 'persist key simultwin.lang = zh');
// ITER-V11-001 ④：游戏名统一为 Simultwin，中英页面都显示"Simultwin"
assert(t('title') === 'Simultwin', 't() returns zh title (unified to Simultwin)');
assert(t('undo', 3) === '撤销 (3)', 'zh undo format');
assert(t('frozenApplied', '左', 5) === '已冻结左盘（5 步）', 'zh frozenApplied format');

// --- ITER-V11-001 ①：教程正文改为 tutorialLines 数组（4 条，带编号） ---
const enLines = t('tutorialLines');
setLanguage('zh');
const zhLines = t('tutorialLines');
setLanguage('en');
assert(Array.isArray(enLines) && enLines.length === 4, 'tutorialLines is 4-line array in en');
assert(Array.isArray(zhLines) && zhLines.length === 4, 'tutorialLines is 4-line array in zh');
assert(enLines && enLines[0] && /^1\./.test(enLines[0]), 'en line 1 starts with "1."');
assert(enLines && enLines[3] && /^4\./.test(enLines[3]), 'en line 4 starts with "4."');
assert(zhLines && zhLines[0] && /^1\./.test(zhLines[0]), 'zh line 1 starts with "1."');
assert(zhLines && zhLines[3] && /^4\./.test(zhLines[3]), 'zh line 4 starts with "4."');

// --- 切回 en + 持久化键仍存在 ---
setLanguage('en');
assert(getLanguage() === 'en', 'switched back to en');
assert(localStorage.getItem('simultwin.lang') === 'en', 'persist key simultwin.lang = en');

// --- 非法语言回退英文 ---
setLanguage('fr');
assert(getLanguage() === 'en', 'invalid language falls back to en');

// --- key 集合一致性：en/zh 必须含相同 key ---
const enKeys = Object.keys(strings.en).sort();
const zhKeys = Object.keys(strings.zh).sort();
assert(JSON.stringify(enKeys) === JSON.stringify(zhKeys), 'en/zh have identical key sets');
assert(enKeys.length >= 30, 'i18n covers a reasonable number of keys (' + enKeys.length + ')');

// --- 未知 key 回退为 key 本身 ---
assert(t('__nope__') === '__nope__', 'unknown key falls back to itself');

// --- summary ---
console.log(`\nAssertions: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
