/*
 * 從正式版的 ../index.html 產生 demo/index.html
 *
 * 只做兩件事:
 *   1. 在主要 <script> 前面插入 mock-backend.js(接管 google.script.run)
 *   2. 加一條「示範模式」提示條,避免有人以為資料真的存到雲端
 *
 * 不修改 ../index.html。每次正式版改動後重跑這支就能同步,不會有兩份程式碼各自漂移。
 *
 * 用法:node demo/build.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'index.html');
const OUT = join(here, 'index.html');

// 這段字串必須跟 index.html 裡的 run() 開頭完全一致。
// 如果正式版改了寫法,這裡會直接報錯 —— 這是刻意的,寧可壞掉也不要默默產出壞檔案。
const ANCHOR = `<script>
  const run = (fn, ...args) => new Promise((resolve, reject) => {`;

// 正式版的 <title> 與 viewport 是 Code.js 的 doGet() 用 HtmlService 加上去的
// (.setTitle('SkyNote') / .addMetaTag('viewport', ...)),不在 index.html 裡。
// 獨立版少了這兩樣,分頁沒有標題、手機也不會套用 device-width,所以在這裡補回來,
// 讓 demo 跟正式版看起來一致。
const HEAD_FIX = `
<title>SkyNote</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
`;

const BADGE = `
<script src="mock-backend.js"></script>
<style>
  #demoBadge {
    position: fixed; left: 12px; bottom: 12px; z-index: 99999;
    display: flex; align-items: center; gap: 8px;
    background: #4a4a48; color: #fff; opacity: .92;
    font: 12px/1.5 "Noto Sans TC", "Microsoft JhengHei", sans-serif;
    padding: 7px 10px; border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  #demoBadge button {
    background: rgba(255,255,255,.16); color: #fff; border: 0;
    border-radius: 4px; padding: 3px 7px; cursor: pointer; font-size: 12px;
  }
  #demoBadge button:hover { background: rgba(255,255,255,.28); }
</style>
`;

const BADGE_BODY = `
<div id="demoBadge">
  <span>示範模式 — 資料只存在這台瀏覽器,不會上傳</span>
  <button onclick="__demoReset()">重設資料</button>
  <button onclick="this.parentNode.remove()">×</button>
</div>
`;

const html = await readFile(SRC, 'utf8');

if (!html.includes(ANCHOR)) {
  console.error('✗ 在 ../index.html 找不到預期的 run() 區塊。');
  console.error('  正式版可能改過寫法,請更新 build.mjs 裡的 ANCHOR 字串後再試。');
  process.exit(1);
}

if (!html.includes('</body>')) {
  console.error('✗ 在 ../index.html 找不到 </body>。');
  process.exit(1);
}

if (!html.includes('<head>')) {
  console.error('✗ 在 ../index.html 找不到 <head>。');
  process.exit(1);
}

const out = html
  .replace('<head>', '<head>' + HEAD_FIX)
  .replace(ANCHOR, BADGE + ANCHOR)
  .replace('</body>', BADGE_BODY + '</body>');

await writeFile(OUT, out, 'utf8');

console.log('✓ 已產生 demo/index.html');
console.log('  來源:index.html(' + html.length.toLocaleString() + ' 字元)');
console.log('  開啟方式:npx serve demo   或用編輯器的 live server');
