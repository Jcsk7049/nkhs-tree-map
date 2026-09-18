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

   | 樹編號 | 量測時間戳 | 填寫人姓名 | 填寫人班級座號 | 仰角 | 水平距離 | 計算後樹高 | 樹圍 | 同步狀態 |
   |---|---|---|---|---|---|---|---|---|

   注意:`Code.gs` 的 `doPost` 是依欄位順序 `appendRow`,務必確認分頁二標題列順序與上表一致,否則寫入的資料會對錯欄。

## Step 2:掛上 Apps Script 程式碼

1. 開啟上述試算表,選單「擴充功能 → Apps Script」。
2. 將本目錄下 `Code.gs` 的內容貼入編輯器(檔名建議也命名為 `Code.gs`)。
3. 確認 `ALLOWED_DOMAIN` 常數已依實際校網域調整(目前設定為 `nkhs.edu.tw`)。
4. 儲存專案。

## Step 3:部署為 Web App

在 Apps Script 編輯器內:

1. 「部署 → 新增部署作業 → 選取類型:網頁應用程式」。
2. 設定:
   - **執行身分**:「以存取應用程式的使用者身分」(確保每個請求都用該使用者的真實身分執行,`Session.getActiveUser()` 才能取到正確 email)
   - **有權限存取的使用者**:「僅限 `nkhs.edu.tw` 網域的使用者」(依校方 Google Workspace 網域設定調整)
3. 點擊部署,並在跳出的授權畫面完成 OAuth 授權(僅限您自己的帳號操作,AI 無法代為進行)。
4. 部署完成後記下產生的 **Web App URL**,供後續 Task 6 的前端串接使用。

**Web App URL:** ___________________________________________ (部署後由人類填入)

## Step 4:手動驗證清單(TODO,部署後由人類逐項執行)

- [ ] 用校網域帳號登入瀏覽器,直接對 Web App URL 送出測試 POST(可用瀏覽器 devtools console 執行 `fetch` 或用 Postman),確認 Sheet 的「量測紀錄」分頁新增一列資料,「同步狀態」欄為「已同步」
- [ ] 用非校網域的 Google 帳號登入後嘗試存取同一 URL,確認回應為 `{ "error": "非校網域帳號,拒絕存取" }`,且 Sheet 沒有新增資料
- [ ] 對 Web App URL 加上 `?treeId=A-023` 送出 GET 請求,確認回傳的 JSON 陣列內容與 Sheet 中該樹編號的所有紀錄一致

### 測試 POST 範例(瀏覽器 devtools console)

```javascript
fetch('<Web App URL>', {
  method: 'POST',
  body: JSON.stringify({
    treeId: 'A-023',
    timestamp: new Date().toISOString(),
    studentName: '王小明',
    studentClassNo: '301-12',
    angleDeg: 35,
    distanceM: 10,
    girthCm: 120,
    calculatedHeight: 7.0,
  }),
}).then((r) => r.json()).then(console.log);
```

### 測試 GET 範例

```javascript
fetch('<Web App URL>?treeId=A-023').then((r) => r.json()).then(console.log);
```

---

## 與 `src/authDomain.js` 的關係

`Code.gs` 內的 `isAllowedDomain` 函式邏輯與 `src/authDomain.js` 的 `isAllowedDomain` 等價地重複維護 —
因 Apps Script 執行環境不支援 ES module 的 `import`/`export`,無法直接共用同一份程式碼。
若未來變更網域檢查邏輯,**兩處都要同步修改**,並考慮在 PR 描述中互相提醒。
