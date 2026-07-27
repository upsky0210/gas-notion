# SkyNote 本地示範版

讓 `index.html` 的前端在**一般瀏覽器**裡跑起來,不需要 GAS、不需要登入、沒有那條
「這個應用程式是由 Google Apps Script 建立」的警告橫幅。

## 為什麼做得到

前端所有後端呼叫都收斂在 `index.html` 裡的這一個函式:

```js
const run = (fn, ...args) => new Promise((resolve, reject) => {
  google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[fn](...args);
});
```

所以只要補一個同形狀的 `google.script.run`,就能整份接管 45 個 API。
`mock-backend.js` 做的就是這件事,資料存在瀏覽器 `localStorage`。

## 用法

```bash
node demo/build.mjs
```

會從 `../index.html` 產生 `demo/index.html`(注入 mock + 示範模式提示條)。
接著用任何靜態伺服器打開,例如:

```bash
python -m http.server 5599 --directory demo
```

然後開 http://localhost:5599

正式版改過之後**重跑一次 build.mjs** 就同步了。`demo/index.html` 是產物,
已加進 `.gitignore`,不會有兩份程式碼各自漂移的問題。

## 能做什麼 / 不能做什麼

**能**:頁面樹、新增/刪除/拖曳排序、編輯與自動儲存、全文搜尋、待辦彙整、
版本快照、回收桶、範本、`/` 區塊選單、`[[頁面連結]]`、文字顏色與字級、佈景主題、
圖片(存成 data URL)。

**不能**:真的呼叫 Gemini(一律回罐頭字串)、真的寄信 / 讀行事曆 / Tasks / Classroom
(回假資料)、真的分享(回 `example.invalid` 假網址)。這些在示範版沒有意義,
也避免不小心動到真實資料。

## 注意

- 資料只在這台瀏覽器的 `localStorage`,**不是**真的筆記。清空:console 打 `__demoReset()`
- `demo/` 已列入 `.claspignore`,不會被 `clasp push` 推上 GAS
- 若要拿這個當對外試用版:`index.html` 的前端原始碼會可被檢視(view-source),
  但後端 `Code.js` 完全不在裡面
