# CLAUDE.md — GAS Notion

類 Notion 筆記,前後端跑 Google Apps Script,資料在使用者自己的 Google Sheets/Drive。
狀態(2026-07-08 16:40):**功能完成,A 版(個人)+ B 版(學校網域)皆上線**。

**動手前先讀 [docs/交接-HANDOFF.md](docs/交接-HANDOFF.md)**——兩版部署 id、改版流程、資料模型、分享機制、陷阱全在那,別重造脈絡。

## 最常用的改版指令

- **A 版一般改版**:`cd C:\AI\Codex\gas-notion` → `clasp push -f` → `clasp redeploy AKfycbx5WRBX8QOrAxKfWnIaVrBwfG-ulWDiX7j6ZpEqgrtgUNLPev__MKRHZ9ICeEKff-k5Cg --description "..."`(網址不變,manifest 平常保持 access=MYSELF)。
- **B 版同步**:複製 Code.js/index.html 到 `C:\AI\Codex\gas-notion-schoolB\` → 把該複本 Code.js 的 `PUBLIC_DEPLOY_ID` 改回 `AKfycbwkNhS-wLcwVgWHg9yJnAnjqqXfHVWrUi5re1waLuhQUuX0v2X1uKTkvcDYWzAIls-OVA` → `clasp -u school push -f` → `clasp -u school redeploy AKfycbw5cuW_5UhPMG0j6aGhc3mH7WTat83agPtP9Of-5yO5lIp5vhBfgfFBqFN4Izbt9a_6Kw`(學校憑證過期就請使用者 `clasp login --user school`)。
- **改到分享頁渲染**(renderShare_/blocksToHtml_/resolveShare_):要走 manifest 切 ANYONE_ANONYMOUS 重部署公開端、再切回的 dance,見 HANDOFF。

## 硬規則

- 本地跑不起來(`google.script.run` 只在 GAS 環境)→ 驗證 = 部署後請使用者操作回報,或 `Invoke-WebRequest` 匿名探測公開端;宣稱完成前附驗收清單。
- 用到新 Google 服務 → `appsscript.json` 的 oauthScopes 要同步補,使用者要重新授權。
- 任何 API key 不進程式碼、不進版控、不寫進文件(A 版分享會連程式碼複製給別人)。
- UI 文字一律**台灣正體中文**(別用簡體/日文);寫入資料的函式改完記得 `invalidateIndex_()`。
- INDEX_HEADER 加欄 → 連 TRASH_HEADER/TRASH_DEL_COL 一起改(否則回收桶會誤刪,見 HANDOFF)。
- 時效資訊(模型版本等)先查官方文件再答。
