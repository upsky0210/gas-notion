# 分享方式 B:學校網域一個網址,每人資料各自私有

用你的學校 Workspace 管理員帳號部署**一份**,發一個網址給全網域。每位同事用學校帳號開啟,看到的是**自己的筆記**(資料自動建立在各自的雲端硬碟),彼此完全看不到對方內容。程式碼只有一份,你 push 一次全網域立即更新——這是 B 相對 A 的最大優點。

程式已經支援這個模式(儲存位置指標存在 per-user 的 UserProperties),**只需要換部署設定,不用改程式碼**。

## 部署步驟(用學校管理員帳號)

1. 用學校帳號開 https://script.google.com/home/usersettings ,開啟「Google Apps Script API」。
2. 讓 Claude 代跑(推薦):在終端機執行 `clasp login --user school`,瀏覽器跳出時用**學校帳號**授權,然後告訴 Claude,由它建立專案、推送、部署。
   或手動:script.google.com 用學校帳號建立新專案,把 `Code.js`(貼到 Code.gs)、`index.html` 貼進去;「專案設定」勾選「在編輯器中顯示 appsscript.json」,把 manifest 換成下面內容。
3. **appsscript.json 的 webapp 區塊要用 B 版設定**(這是 A/B 唯一差異):

```json
{
  "timeZone": "Asia/Taipei",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_ACCESSING",
    "access": "DOMAIN"
  }
}
```

4. 部署 →「新增部署作業」→「網頁應用程式」:
   - 執行身分:**存取網頁應用程式的使用者**
   - 誰可以存取:**「(你的網域)」中的所有人**
5. 把 `/exec` 網址發給同事(或嵌進學校的 Google Sites)。

## 同事第一次使用

開網址 → Google 要求授權(存取「自己的」試算表與雲端硬碟)→ 允許 → 自動建立自己的「GAS Notion DB / Pages / Assets / Versions」→ 看到歡迎頁。因為應用程式和使用者同屬一個 Workspace 網域,屬於「內部應用程式」,通常不會出現「未經驗證」的紅色警告。

## 注意

- 每人的資料存各自的 Drive、算各自的儲存配額;你(部署者)看不到別人的筆記內容。
- 執行時間等配額算在「存取者」頭上,單人筆記用量遠碰不到上限。
- 改版:你在本機改完 → `clasp push -f`(用 school credentials)→「管理部署作業」更新版本,全網域立即生效。
- 若要限縮成「只有某些人」而非全網域,GAS 網頁應用程式沒有「指定名單」選項,得在程式裡用 `Session.getActiveUser().getEmail()` 加白名單——需要時再說。
