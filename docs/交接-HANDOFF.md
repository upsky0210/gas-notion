# 交接文件 — SkyNote(給下一個接手的 AI/工程師)

最後更新:**2026-07-27**。狀態:**功能完成、A/B 兩版皆上線**;A 版 @32 與 B 版 @10 的內容尚待使用者驗收。
專案原名 GAS Notion,2026-07-27 起對外品牌名為 **SkyNote**(避開 Notion 商標;使用者要用它爭取校外研習)。
使用者是學校網域(skps.tp.edu.tw)最高管理員,個人使用此筆記系統,並已部署校園版供全校同仁使用、可對校內研習展示。UI 一律台灣正體中文。

## 一句話說明

類 Notion 筆記系統:前後端都跑在 Google Apps Script(V8),前端 Editor.js 區塊編輯,資料存使用者自己的 Google Sheets(索引)+ Drive(內容 JSON)。可直接開 /exec 或嵌入 Google Sites。有「個人版(A)」與「學校網域版(B)」兩種部署,共用同一份程式碼。

## 部署資訊

### A 版 — 個人帳號(upskychen@gmail.com,clasp default)
- 專案:`C:\AI\Codex\gas-notion\`(本 repo)。Script:https://script.google.com/d/1AXBMDHN8vBZ4YNlVac0tFH8yUkHaVK2bcDJWpBj2uhFWI1Wu82dDDA7D/edit
- **主部署**(app 本體,MYSELF):`AKfycbx5WRBX8QOrAxKfWnIaVrBwfG-ulWDiX7j6ZpEqgrtgUNLPev__MKRHZ9ICeEKff-k5Cg`(目前 **@32**)
- **公開分享部署**(ANYONE_ANONYMOUS,只服務 `?s=<token>`):`AKfycbwAUNmjY1TNA-trnACmFlTJO0sqR_VsMOr4ubcxsBD2sdNLbzXhsGUHSQpTKUVjqUe2mw`,id 烙在 Code.js 的 PUBLIC_DEPLOY_ID。

### B 版 — 學校網域(upsky@skps.tp.edu.tw,clasp `-u school`)
- 專案:`C:\AI\Codex\gas-notion-schoolB\`。**2026-07-27 起改為本 repo 的 `schoolB` 分支 + git worktree**(先前是 repo 外的獨立資料夾、完全不在版控)。scriptId `1kKCOJcWtiV1nC3BTqA09Xlr_iKjU9_-8njxX3yJo1mrzJ8npa5xX66Y2`
- **主部署**(網域版,給老師,USER_ACCESSING/DOMAIN):`AKfycbw5cuW_5UhPMG0j6aGhc3mH7WTat83agPtP9Of-5yO5lIp5vhBfgfFBqFN4Izbt9a_6Kw`(目前 **@10**)。URL:`https://script.google.com/a/macros/skps.tp.edu.tw/s/<id>/exec`
- **公開分享部署**(USER_DEPLOYING/ANYONE_ANONYMOUS):`AKfycbwkNhS-wLcwVgWHg9yJnAnjqqXfHVWrUi5re1waLuhQUuX0v2X1uKTkvcDYWzAIls-OVA`,id 烙在 schoolB Code.js 的 PUBLIC_DEPLOY_ID。
- B 版已通過完整驗收(建頁/分享/取消分享全正常);網域**未擋**匿名 web app(已匿名探測回 200)。

## 改版流程(重要)

### 本地測試 — 這條規則 2026-07-27 起改變了

以前是「本地完全無法執行/測試」。現在**前端可以在一般瀏覽器跑**,用 `demo/` 的假後端:

```
node demo/build.mjs                                  # 從 index.html 產生 demo/index.html
python -m http.server 5599 --directory demo          # 或 npx serve demo
```

原理:前端所有後端呼叫都收斂在 `index.html` 的單一 `run()`,只用到
`google.script.run.withSuccessHandler(...).withFailureHandler(...)[fn](...)`,
所以補一個同形狀的 `google.script.run` 就能整份接管(45 個 API)。資料存 localStorage。

**能本地驗證**:版面/RWD/深色主題、`/` 區塊選單、`[[頁面連結]]`、搜尋、待辦彙整、版本、
回收桶、範本、確認對話框(可攔截 `window.confirm` 檢查按取消時後端零呼叫)。
**不能本地驗證**:真正的 Gemini 呼叫、Google 服務(寄信/行事曆/Tasks/Classroom)、
真實分享頁渲染、GAS 效能與冷啟動。這些仍要 push 後請使用者實測。

`demo/index.html` 是產物(已 gitignore),正式版改完**重跑 build.mjs** 即同步,不會有兩份程式碼漂移。
`build.mjs` 會補上正式版由 `doGet()` 注入的 `<title>` 與 viewport meta ——
**這兩樣不在 index.html 裡**,漏了會讓 demo 的手機模式失真(踩過:誤判成 RWD 有 bug)。

**⚠ `.claspignore` 必須存在**:`.clasp.json` 設了 `skipSubdirectories:false`,
沒有它的話 `demo/mock-backend.js` 會被當成 GAS 程式碼推上正式專案。
驗證方式:`clasp status` 應只列出 appsscript.json / Code.js / index.html 三個 tracked 檔。

### A 版一般改版(不動分享頁渲染)
`cd gas-notion` → `clasp push -f` → `clasp redeploy AKfycbx5WRB..._MKRHZ9ICeEKff-k5Cg --description "..."`。網址不變。manifest 平常保持 access=MYSELF。

### A 版改到分享頁渲染(renderShare_/blocksToHtml_/resolveShare_)
manifest 暫改 access=ANYONE_ANONYMOUS → push → `clasp redeploy <A公開部署id>` → manifest 改回 MYSELF → push → redeploy 主部署。順序不能亂。

### B 版同步(A 版改完後把功能帶去 B)

**2026-07-27 起改用 git 分支,不要再手動複製檔案。**

`gas-notion-schoolB\` 是本 repo 的 **git worktree**,掛在 `schoolB` 分支。
與 `main` 的差異**固定只有 3 個檔案 4 行**(`index.html` 兩版完全相同):

| 檔案 | main(A 版) | schoolB(B 版) |
|---|---|---|
| `.clasp.json` | scriptId `1AXBMDHN...` | scriptId `1kKCOJcW...` |
| `Code.js` 第 10 行 | `PUBLIC_DEPLOY_ID = 'AKfycbwAUNmjY1TNA-...'` | `'AKfycbwkNhS-...'` |
| `appsscript.json` | `USER_DEPLOYING` / `MYSELF` | `USER_ACCESSING` / `DOMAIN` |

同步步驟:

```
cd C:\AI\Codex\gas-notion-schoolB
git merge main              # 衝突只會出現在上表三個檔案,一律保留 schoolB 這一側
clasp -u school push -f
clasp -u school deploy -i AKfycbw5cuW_5UhPMG0j6aGhc3mH7WTat83agPtP9Of-5yO5lIp5vhBfgfFBqFN4Izbt9a_6Kw -d "說明"
```

落後多少可用 `git log schoolB..main --oneline` 查。
若改到分享頁渲染,B 也要各自走一次 manifest dance(公開部署=USER_DEPLOYING/ANYONE_ANONYMOUS)。

- **clasp 學校憑證會過期**(`invalid_rapt`),過期時請使用者重跑 `clasp login --user school`。
  這是互動式 OAuth,**AI 不能代替使用者做**。

## 檔案

- `Code.js` — 全部後端。`api_*` 是給 `google.script.run` 的公開 API,`*_` 結尾是內部函式。
- `index.html` — 全部前端(單檔:CSS + HTML + JS)。Editor.js 及工具從 jsdelivr CDN(list 用 @1,其餘 @2;**@editorjs/list@2 UMD global 名稱不同,別亂升**)。JSZip 從 cdnjs。
- `appsscript.json` — **oauthScopes 明列制**:用到新服務就要把 scope 加進清單,否則執行期報權限錯誤,且使用者要重新授權。
- `.claspignore` — 擋掉 demo/docs/.claude 等不該推上 GAS 的東西(見上「本地測試」的警告)。
- `demo/mock-backend.js` — 假後端(接管 45 個 API,資料存 localStorage,附教學情境種子資料)。
- `demo/build.mjs` — 從 `index.html` 產生 `demo/index.html`;找不到預期的 `run()` 區塊會**直接報錯而非默默產出壞檔**。
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

Drive 資料夾:`SkyNote Pages`(每頁 {id}.json)、`SkyNote Assets`(上傳圖片,**設 ANYONE_WITH_LINK** 供 lh3 圖床顯示)、`SkyNote Versions`(版本快照)、`SkyNote 備份`(每週自動備份 zip,留 8 份)。試算表名為 `SkyNote DB`。

> 這些名稱 2026-07-27 從 `GAS Notion *` 改成 `SkyNote *`,**只影響新安裝**。既有部署靠 UserProperties 記的 ID 尋找資料夾/試算表,不是靠名字,所以現有使用者的資料不受影響(改名前已確認 `folderOf_`/`db_` 的邏輯)。

UserProperties keys:DB_SPREADSHEET_ID、PAGES_FOLDER_ID、ASSETS_FOLDER_ID、VERSIONS_FOLDER_ID、BACKUP_FOLDER_ID、GEMINI_API_KEY、GEMINI_MODEL、DAILY_ENABLED、DAILY_HOUR、AUTOBACKUP_ENABLED。`setStoredId_` 會鏡射資料夾/試算表指標到 ScriptProperties。頁面樹快取:`getUserCache` 的 `pageIndex_v1`,任何寫入都要 `invalidateIndex_()`。

## 分享機制(v12 起,A/B 通用 — 這是全系統最繞的一塊,改前務必讀懂)

`api_sharePage(pageId, scope)` 產 token → 寫 Shares 表(記錄/取消用)+ `publishShare_`:把該頁(或子樹,上限 `SHARE_MAX_ITEMS=60` 頁)的 Drive JSON 檔設為 ANYONE_WITH_LINK,並把 `token→{s:scope, r:rootId, items:[{i,t,p,f,k}]}` 存進**全域 ScriptProperties**(key `sh_<token>`,per-script 共用,匿名部署讀得到)。
`renderShare_`(匿名端執行)→ `resolveShare_(token)`:先讀 ScriptProperties(靠 fileId 用 DriveApp 讀公開連結檔——**匿名端不需要試算表存取權,這就是 B 版能運作的關鍵**);讀不到才退回舊的「讀 DB 試算表」法(A 版舊連結相容,僅 A 版部署者能讀自己試算表時可用)。
`doGet` 用 `PUBLIC_DEPLOY_ID` 擋掉「匿名者直接載入 app UI」(已實測擋得住)。取消分享=`unpublishShare_`:revoke 檔案分享 + 刪 ScriptProperties。
**已知限制**:分享後才新增的子頁不進 nav(要取消再重開分享刷新);改頁名後分享頁標題是舊的(ScriptProperties 是快照);子樹 >60 頁會截斷。**安全**:頁面 JSON 檔變 ANYONE_WITH_LINK(同圖片模式),但 fileId 不外露、token 60 字元不可猜。

## 功能現況(全部已部署,A/B 對齊)

頁面樹(**資料夾** kind='folder'、拖曳排序/搬移、樂觀建頁 tmp_ id)、Editor.js 區塊(段落/標題/清單/待辦/引用/程式碼/分隔線/**表格含樣式 tune**/圖片上傳/**Drive 檔案瀏覽器**/**YouTube 內嵌**)、debounce 2 秒自動儲存、**[[頁面連結]]**(打 [[ 跳選單,插 `<a href="#page=ID">`,點擊導頁)、全文搜尋、版本快照(可命名/還原)、**待辦彙整**(`api_allTodos` 掃全頁未勾 checklist,前端 todoView 唯讀+跳頁)、Markdown 匯出/匯入、**Notion zip 匯入**、整站備份匯出 + **每週自動備份**(backupJob trigger,存「GAS Notion 備份」留 8 份)、**回收桶**、**9 種內建範本 + 自訂範本**(Templates 表,頂欄「存範本」、範本列 ★ 顯示可刪)、六種佈景主題 + 三段頁面寬度(localStorage)、手機版(≤768px 側欄抽屜)、桌機側欄收合(html.side-hide)、**Gemini AI**(摘要/續寫/提問/翻譯,金鑰與模型存 UserProperties,預設 `gemini-flash-latest`,429/5xx 重試 3 次,連線測試按鈕)、**Google 整合**(MailApp 寄頁、CalendarApp 今日行程、Tasks 進階服務雙向、Docs/Slides 匯出、Classroom 公告、每日自動頁 trigger)、**公開分享**(單頁/子樹,見上節)。
Keep 無公開 API 無法整合(已向使用者說明)。

**2026-07 新增**:
- **課表 OCR 匯入**(`api_geminiVision` + 前端 `aiImportSchedule`):上傳課表照片 → Gemini 抽成二維表 → 插入表格區塊。台灣紙本課表多為直書、星期由右至左(五四三二一),prompt 已明確要求轉成由左至右且時間欄置首;另有後處理砍掉整欄皆空的欄位(表格外的直書大標常被誤判成一欄)。
- **三個班務範本**:教學日誌、聯絡簿、晨間提醒(內建範本共 12 種)。
- **對外動作送出前確認**(`confirmSend`,`index.html`):統一說明「送到哪裡/用哪個帳號/能不能收回」,套用五處——寄 Gmail、Classroom 公告、推送 Tasks、建立 Docs/Slides、**建立公開分享連結**。
  可逆的本機開關(每日自動頁、自動備份)**刻意不加**:確認視窗一多,使用者會養成反射性按下去的習慣,真正該停下來時反而擋不住。
- **Classroom 僅學校帳號可用**:個人 Gmail 帳號通常沒有課程,UI 標題與後端錯誤訊息都已標註。因此 A 版 demo 時這一格必然報錯,**對外示範建議用 B 版(學校帳號)**。

## 已知問題與待辦

1. **Notion zip 匯入「還是怪」**(使用者凍結,未修):已支援雙層 zip、圖片上傳接回、CSV→表格、去 HTML 標籤行、去檔名 32-hex 尾碼,但使用者匯入後仍覺得怪、未提供具體截圖。已知不支援:巢狀清單縮排、toggle/callout(aside 內容變普通段落)、database view、內部連結(降級純文字)。測試素材:`C:\Users\Upsky\Downloads\9597b39e-*.zip`。
2. ~~**深色主題**下 Editor.js 少數彈窗元件仍偏亮~~ — **2026-07-27 在本地 demo 實測量測色值,已無問題**:`.ce-popover__container` / 行內工具列 / 頁面連結選單皆為 `rgb(43,43,40)`,選單搜尋框 `rgb(51,51,47)`,配淺色文字。但表格的 `.tc-popover` 當下未實例化、沒驗到,若有回報再查。
2b. **手機版排版經實測沒問題**(390px:側欄正確收合、無橫向捲動、編輯區合身)。使用者回報的手機痛點是**冷啟動速度**(GAS iframe 沙盒 + CDN 載 Editor.js + script.run 握手),與排版無關,別混為一談。
3. **待辦彙整**目前唯讀(掃描所有頁面 Drive 檔,頁多會慢);可考慮改成能直接勾選回寫、或存檔時維護待辦索引加速。
4. **深度美化** pass 使用者傾向之後用其他工具(如 design agent)做,別主動燒額度。
5. 使用者曾提未來想加:標籤分類、分享加密碼/到期日、命令面板(Ctrl+K)、待辦互動勾選。皆未做。
6. **分享頁的 SkyNote 署名尚未生效**:`renderShare_` 已加上頁尾「由 SkyNote 製作」與分頁標題後綴,但公開分享部署(A 版 @17、B 版 @2)還沒重新部署,所以外部看到的仍是舊版。要生效必須走 manifest dance——**收益低(只是一行小字)、風險是漏掉最後兩步會讓 HEAD 停在 ANONYMOUS**,建議等真的要對外分享時再一併處理。
7. **可發現性,而非功能缺口**(2026-07 兩輪第三方 AI 審查的共同結論):`/` 區塊選單與 `[[頁面連結]]` 都正常運作,但兩個外部 AI 看了介面都沒發現它們存在,還建議「加上這些功能」。AI 面板更是把能力鎖在 API 金鑰後面——沒設金鑰前完全看不到「摘要/續寫/課表匯入」這些按鈕。對研習展示而言,**沒被看見的功能等於不存在**。
8. **未做圖片貼上/拖曳**:`index.html` 的 paste handler 只攔網址(外部連結自動化),不處理圖片。**未做編輯內容的 localStorage 草稿備份**(localStorage 目前只存主題/寬度/展開狀態/上次頁面)。這兩項是外部審查中最值得做的建議。

## 陷阱(別重踩)

- **本地無法執行/測試**(見改版流程)。
- clasp 3:`create --type webapp` 報「Invalid container file type」,要用 standalone;`clasp create` 會拉遠端預設 manifest **蓋掉本地 appsscript.json**(create 後要重寫 manifest)。clasp 會**向上層找 .clasp.json**(所以 B 版放在 repo 外)。
- **金鑰紀律**:Gemini API key 絕不寫進 Code.js/index.html/版控/文件——分享 A 模式會連程式碼複製給同事;使用者金鑰只存在 app 內(UserProperties)。
- Editor.js 工具 i18n 在 index.html 的 `EDITOR_I18N`;新增工具記得補中文。
- 時效性資訊(模型版本等)先查官方文件再答,別依賴訓練資料(2026-07 現況:最新 flash 是 gemini-3.5-flash;程式用別名 `gemini-flash-latest` 自動跟)。
- 瀏覽器多 Google 帳號會造成 iframe/權限錯誤(換單一帳號 profile)。
- INDEX_HEADER 加欄 → 連帶改 TRASH_HEADER 等(見資料模型 Trash 教訓)。
- **`.claspignore` 不可刪**(`skipSubdirectories:false` 會把 `demo/*.js` 當程式碼推上去)。
- **拿 demo 給第三方審查前,先確認 demo 與正式版的差異**。踩過:Codex 回報「P0 行動版嚴重橫向溢位」,追查後發現是當時 `demo/build.mjs` 還沒補 viewport meta,390px 被渲染成 980 CSS px 所致——正式版沒有這個問題。收到的意見有一部分會在修不存在的問題。
- **第三方 AI 看得到介面,看不到平台約束**。Gemini 建議做 PWA(GAS 沙盒 iframe 無法註冊 Service Worker、無法在可控路徑提供 manifest.json);Codex 建議「分服務顯示 Google 授權狀態、個別移除授權」(GAS 的 scope 是 manifest 層一次全授權,沒有這種顆粒度)。**它們對現象的觀察可信,對解法的建議要先過一次平台可行性。**
- **AI 的稱讚不能當成準備度指標**。側邊欄助手對任何有規模的專案都會說「非常令人驚豔」;具體觀察(看到什麼、沒看到什麼)才有參考價值。

## 換一台電腦接手(例如從家裡換到辦公室)

需要安裝:Git、Node.js、clasp(`npm i -g @google/clasp`)。Python 有的話可起 demo 靜態伺服器,沒有就用 `npx serve demo`。

```
git clone https://github.com/upsky0210/gas-notion.git
cd gas-notion
git worktree add ../gas-notion-schoolB schoolB      # B 版(學校網域)
clasp login                                          # A 版:upskychen@gmail.com
clasp login --user school                            # B 版:upsky@skps.tp.edu.tw
```

**不要複製 `~/.clasprc.json`** —— 那是 OAuth 憑證(等同密碼),`.gitignore` 已刻意擋著。在新機器重新登入即可。

不會跟著走的東西:**與 AI 的對話脈絡**。新對話請先讀這份文件。

## 驗收方式

使用者手動驗收。每輪改動附具體清單(哪顆按鈕、預期看到什麼),請使用者截圖回報。README.md 有歷次驗收清單。
