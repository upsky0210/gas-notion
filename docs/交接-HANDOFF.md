# 交接文件 — GAS Notion(給下一個接手的 AI/工程師)

最後更新:**2026-07-08 16:40**。狀態:**功能完成、A/B 兩版皆上線並驗收通過**。
使用者是學校網域(skps.tp.edu.tw)最高管理員,個人使用此筆記系統,並已部署校園版供全校同仁使用、可對校內研習展示。UI 一律台灣正體中文。

## 一句話說明

類 Notion 筆記系統:前後端都跑在 Google Apps Script(V8),前端 Editor.js 區塊編輯,資料存使用者自己的 Google Sheets(索引)+ Drive(內容 JSON)。可直接開 /exec 或嵌入 Google Sites。有「個人版(A)」與「學校網域版(B)」兩種部署,共用同一份程式碼。

## 部署資訊

### A 版 — 個人帳號(upskychen@gmail.com,clasp default)
- 專案:`C:\AI\Codex\gas-notion\`(本 repo)。Script:https://script.google.com/d/1AXBMDHN8vBZ4YNlVac0tFH8yUkHaVK2bcDJWpBj2uhFWI1Wu82dDDA7D/edit
- **主部署**(app 本體,MYSELF):`AKfycbx5WRBX8QOrAxKfWnIaVrBwfG-ulWDiX7j6ZpEqgrtgUNLPev__MKRHZ9ICeEKff-k5Cg`(目前 @19)
- **公開分享部署**(ANYONE_ANONYMOUS,只服務 `?s=<token>`):`AKfycbwAUNmjY1TNA-trnACmFlTJO0sqR_VsMOr4ubcxsBD2sdNLbzXhsGUHSQpTKUVjqUe2mw`,id 烙在 Code.js 的 PUBLIC_DEPLOY_ID。

### B 版 — 學校網域(upsky@skps.tp.edu.tw,clasp `-u school`)
- 專案:`C:\AI\Codex\gas-notion-schoolB\`(**repo 外的獨立 clasp 專案**,避免 clasp 向上找到主 .clasp.json)。scriptId `1kKCOJcWtiV1nC3BTqA09Xlr_iKjU9_-8njxX3yJo1mrzJ8npa5xX66Y2`
- **主部署**(網域版,給老師,USER_ACCESSING/DOMAIN):`AKfycbw5cuW_5UhPMG0j6aGhc3mH7WTat83agPtP9Of-5yO5lIp5vhBfgfFBqFN4Izbt9a_6Kw`(目前 @4)。URL:`https://script.google.com/a/macros/skps.tp.edu.tw/s/<id>/exec`
- **公開分享部署**(USER_DEPLOYING/ANYONE_ANONYMOUS):`AKfycbwkNhS-wLcwVgWHg9yJnAnjqqXfHVWrUi5re1waLuhQUuX0v2X1uKTkvcDYWzAIls-OVA`,id 烙在 schoolB Code.js 的 PUBLIC_DEPLOY_ID。
- B 版已通過完整驗收(建頁/分享/取消分享全正常);網域**未擋**匿名 web app(已匿名探測回 200)。

## 改版流程(重要)

**本地無法執行/測試**:`google.script.run` 只在 GAS 環境;沒有 dev server。驗證 = push+redeploy 後請使用者操作回報,或用 `Invoke-WebRequest` 匿名探測公開端。宣稱完成前附驗收清單。

### A 版一般改版(不動分享頁渲染)
`cd gas-notion` → `clasp push -f` → `clasp redeploy AKfycbx5WRB..._MKRHZ9ICeEKff-k5Cg --description "..."`。網址不變。manifest 平常保持 access=MYSELF。

### A 版改到分享頁渲染(renderShare_/blocksToHtml_/resolveShare_)
manifest 暫改 access=ANYONE_ANONYMOUS → push → `clasp redeploy <A公開部署id>` → manifest 改回 MYSELF → push → redeploy 主部署。順序不能亂。

### B 版同步(A 版改完後把功能帶去 B)
1. 複製最新 `Code.js`、`index.html` 到 `gas-notion-schoolB\`。
2. 把 schoolB `Code.js` 的 `PUBLIC_DEPLOY_ID` 改回 **schoolB 自己的公開部署**(`AKfycbwkNhS...`)——這是複製後唯一要手動改的一行(複製會帶進 A 版的個人公開 id)。
3. 確認 schoolB `appsscript.json` 的 webapp = USER_ACCESSING/DOMAIN。
4. `cd gas-notion-schoolB` → `clasp -u school push -f` → `clasp -u school redeploy AKfycbw5cuW...`(只需重部署主部署;renderShare_ 沒改的話公開部署不用動)。
5. 若改到分享頁渲染,B 也要走 manifest 切換 dance(公開部署=USER_DEPLOYING/ANYONE_ANONYMOUS)。
- **clasp 學校憑證會過期**(invalid_rapt),過期時請使用者重跑 `clasp login --user school`。

## 檔案

- `Code.js` — 全部後端。`api_*` 是給 `google.script.run` 的公開 API,`*_` 結尾是內部函式。
- `index.html` — 全部前端(單檔:CSS + HTML + JS)。Editor.js 及工具從 jsdelivr CDN(list 用 @1,其餘 @2;**@editorjs/list@2 UMD global 名稱不同,別亂升**)。JSZip 從 cdnjs。
- `appsscript.json` — **oauthScopes 明列制**:用到新服務就要把 scope 加進清單,否則執行期報權限錯誤,且使用者要重新授權。
- `docs/研習簡報-GAS-Notion.pptx` — 給校內研習用的簡報(14 張,pptxgenjs 產)。
- `docs/分享A-*.md`、`docs/分享B-*.md` — 兩種分享模式操作文件。

## 資料模型(全部在使用者自己的 Drive,首次執行自動建立,ID 記在 UserProperties)

試算表「GAS Notion DB」六張表:
- `PageIndex`:id, title, parentId, order, updatedAt, fileId, **kind** — 頁面樹索引。order 新頁用 Date.now(),拖曳重排改寫成 0..n。**kind='folder'|'page'**(空值視為 page);folder 是純組織節點,有空 json 檔但不可開啟編輯(前端 openPage 對 folder 改呼叫 toggleFolder)。`sheet_()` 自動補 kind 欄(第 7 欄)。
- `PageText`:id, text — 存檔時抽的純文字(小寫、去 HTML、≤45000 字),全文搜尋只讀這張。
- `PageVersions`:pageId, ts, fileId, label — 版本登記(每頁留 10 版,同頁快照間隔 ≥10 分鐘)。
- `Trash`:PageIndex 七欄(含 kind)+ deletedAt = **8 欄** — 回收桶(30 天自動清,清時才真 trash Drive 檔與版本)。**TRASH_HEADER 必與 INDEX_HEADER 同步**;deletedAt 索引用具名常數 `TRASH_DEL_COL`(=7)。`trashSheet_()` 有舊 7 欄→8 欄自動遷移。**教訓**:INDEX_HEADER 加欄時,TRASH_HEADER/TRASH_DEL_COL、deletePage 的 concat、restorePage 的 slice 全要一起改,否則 purgeTrash_ 讀錯欄把 deletedAt 當 0 → 立即永久刪除(v11 出過此 bug,@16 已修)。
- `Shares`:pageId, token, createdAt, scope — 公開分享記錄/取消索引(token 60 字元隨機)。
- `Templates`:id, name, content, createdAt — 使用者自訂範本(content=Editor.js JSON 字串)。

Drive 資料夾:`GAS Notion Pages`(每頁 {id}.json)、`GAS Notion Assets`(上傳圖片,**設 ANYONE_WITH_LINK** 供 lh3 圖床顯示)、`GAS Notion Versions`(版本快照)、`GAS Notion 備份`(每週自動備份 zip,留 8 份)。

UserProperties keys:DB_SPREADSHEET_ID、PAGES_FOLDER_ID、ASSETS_FOLDER_ID、VERSIONS_FOLDER_ID、BACKUP_FOLDER_ID、GEMINI_API_KEY、GEMINI_MODEL、DAILY_ENABLED、DAILY_HOUR、AUTOBACKUP_ENABLED。`setStoredId_` 會鏡射資料夾/試算表指標到 ScriptProperties。頁面樹快取:`getUserCache` 的 `pageIndex_v1`,任何寫入都要 `invalidateIndex_()`。

## 分享機制(v12 起,A/B 通用 — 這是全系統最繞的一塊,改前務必讀懂)

`api_sharePage(pageId, scope)` 產 token → 寫 Shares 表(記錄/取消用)+ `publishShare_`:把該頁(或子樹,上限 `SHARE_MAX_ITEMS=60` 頁)的 Drive JSON 檔設為 ANYONE_WITH_LINK,並把 `token→{s:scope, r:rootId, items:[{i,t,p,f,k}]}` 存進**全域 ScriptProperties**(key `sh_<token>`,per-script 共用,匿名部署讀得到)。
`renderShare_`(匿名端執行)→ `resolveShare_(token)`:先讀 ScriptProperties(靠 fileId 用 DriveApp 讀公開連結檔——**匿名端不需要試算表存取權,這就是 B 版能運作的關鍵**);讀不到才退回舊的「讀 DB 試算表」法(A 版舊連結相容,僅 A 版部署者能讀自己試算表時可用)。
`doGet` 用 `PUBLIC_DEPLOY_ID` 擋掉「匿名者直接載入 app UI」(已實測擋得住)。取消分享=`unpublishShare_`:revoke 檔案分享 + 刪 ScriptProperties。
**已知限制**:分享後才新增的子頁不進 nav(要取消再重開分享刷新);改頁名後分享頁標題是舊的(ScriptProperties 是快照);子樹 >60 頁會截斷。**安全**:頁面 JSON 檔變 ANYONE_WITH_LINK(同圖片模式),但 fileId 不外露、token 60 字元不可猜。

## 功能現況(全部已部署,A/B 對齊)

頁面樹(**資料夾** kind='folder'、拖曳排序/搬移、樂觀建頁 tmp_ id)、Editor.js 區塊(段落/標題/清單/待辦/引用/程式碼/分隔線/**表格含樣式 tune**/圖片上傳/**Drive 檔案瀏覽器**/**YouTube 內嵌**)、debounce 2 秒自動儲存、**[[頁面連結]]**(打 [[ 跳選單,插 `<a href="#page=ID">`,點擊導頁)、全文搜尋、版本快照(可命名/還原)、**待辦彙整**(`api_allTodos` 掃全頁未勾 checklist,前端 todoView 唯讀+跳頁)、Markdown 匯出/匯入、**Notion zip 匯入**、整站備份匯出 + **每週自動備份**(backupJob trigger,存「GAS Notion 備份」留 8 份)、**回收桶**、**9 種內建範本 + 自訂範本**(Templates 表,頂欄「存範本」、範本列 ★ 顯示可刪)、六種佈景主題 + 三段頁面寬度(localStorage)、手機版(≤768px 側欄抽屜)、桌機側欄收合(html.side-hide)、**Gemini AI**(摘要/續寫/提問/翻譯,金鑰與模型存 UserProperties,預設 `gemini-flash-latest`,429/5xx 重試 3 次,連線測試按鈕)、**Google 整合**(MailApp 寄頁、CalendarApp 今日行程、Tasks 進階服務雙向、Docs/Slides 匯出、Classroom 公告、每日自動頁 trigger)、**公開分享**(單頁/子樹,見上節)。
Keep 無公開 API 無法整合(已向使用者說明)。

## 已知問題與待辦

1. **Notion zip 匯入「還是怪」**(使用者凍結,未修):已支援雙層 zip、圖片上傳接回、CSV→表格、去 HTML 標籤行、去檔名 32-hex 尾碼,但使用者匯入後仍覺得怪、未提供具體截圖。已知不支援:巢狀清單縮排、toggle/callout(aside 內容變普通段落)、database view、內部連結(降級純文字)。測試素材:`C:\Users\Upsky\Downloads\9597b39e-*.zip`。
2. **深色主題**下 Editor.js 少數彈窗元件仍偏亮(已蓋一批 override,沒蓋全)。
3. **待辦彙整**目前唯讀(掃描所有頁面 Drive 檔,頁多會慢);可考慮改成能直接勾選回寫、或存檔時維護待辦索引加速。
4. **深度美化** pass 使用者傾向之後用其他工具(如 design agent)做,別主動燒額度。
5. 使用者曾提未來想加:標籤分類、分享加密碼/到期日、命令面板(Ctrl+K)、待辦互動勾選。皆未做。

## 陷阱(別重踩)

- **本地無法執行/測試**(見改版流程)。
- clasp 3:`create --type webapp` 報「Invalid container file type」,要用 standalone;`clasp create` 會拉遠端預設 manifest **蓋掉本地 appsscript.json**(create 後要重寫 manifest)。clasp 會**向上層找 .clasp.json**(所以 B 版放在 repo 外)。
- **金鑰紀律**:Gemini API key 絕不寫進 Code.js/index.html/版控/文件——分享 A 模式會連程式碼複製給同事;使用者金鑰只存在 app 內(UserProperties)。
- Editor.js 工具 i18n 在 index.html 的 `EDITOR_I18N`;新增工具記得補中文。
- 時效性資訊(模型版本等)先查官方文件再答,別依賴訓練資料(2026-07 現況:最新 flash 是 gemini-3.5-flash;程式用別名 `gemini-flash-latest` 自動跟)。
- 瀏覽器多 Google 帳號會造成 iframe/權限錯誤(換單一帳號 profile)。
- INDEX_HEADER 加欄 → 連帶改 TRASH_HEADER 等(見資料模型 Trash 教訓)。

## 驗收方式

使用者手動驗收。每輪改動附具體清單(哪顆按鈕、預期看到什麼),請使用者截圖回報。README.md 有歷次驗收清單。
