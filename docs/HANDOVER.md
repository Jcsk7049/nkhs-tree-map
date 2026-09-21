# 交接說明書 — 南港高工 校園樹木量測

> 給接手的老師。不需要會寫程式也能日常使用;要改設定時,照第 3 節的表格找檔案即可。

## 0. 30 秒看懂

- **系統做什麼**:學生掃樹牌 QR、用手機填角度/距離/樹圍,資料自動進 Google Sheet,老師在地圖上看各樹高度。
- **三塊架構**:

```
 手機網頁 (GitHub Pages)  ──>  Apps Script (後端)  ──>  Google Sheet (資料)
 public/ + src/                apps-script/Code.gs       量測紀錄 / 學生名單 / 教師名單
```

- **全部是 JavaScript(不是 Java、沒有 Python)**:前端與後端都是 JavaScript,語法像 Java 但更簡單(第 7 節有小抄);另有一支 PowerShell 圖示腳本(`scripts/make-icons.ps1`),平常用不到。
- **沒有要維護的伺服器**:
  - 沒有資料庫(資料在 Google Sheet)
  - 沒有編譯/打包步驟(改檔案、推上 GitHub 就上線)
  - 網頁放 GitHub Pages(免費),後端跑在 Google Apps Script(免費)

## 1. 帳號與網址總表

| 項目 | 目前掛在誰名下 | 網址 / 位置 | 交接後應換成誰(學校填) |
|---|---|---|---|
| GitHub repo | 個人帳號 `Jcsk7049` | https://github.com/Jcsk7049/nkhs-tree-map | |
| GitHub Pages(網站) | 同上 repo | https://jcsk7049.github.io/nkhs-tree-map/public/app.html | |
| Google Sheet(資料庫) | 個人 Gmail 測試版 | 待確認(在該 Gmail 的雲端硬碟) | |
| Apps Script(後端) | 個人 Gmail 測試版,綁在上面的 Sheet | 試算表 → 擴充功能 → Apps Script | |
| Google OAuth 用戶端 ID(教師登入) | 個人 Gmail 測試版 | Google Cloud Console → 憑證 | |
| 後端 API 網址 | — | `src/config.js` 的 `API_URL` | |
| 教師名單 | 測試信箱 | Sheet 的「教師名單」分頁 | |

## 2. 不用寫程式就能做的事

- 老師先開 App 網址 → 選「我是老師」→ Google 登入(信箱要在教師名單內)。
- 老師端底部分頁:**名單 / 地圖 / QR 標籤 / 管理**;學生端底部分頁:**樹木 / 掃描 / 量測**。

| 想做什麼 | 在哪裡 |
|---|---|
| 換學生名單、發通行碼 | 老師 →「名單」→ 貼名單 → 匯入 → 列印紙條(通行碼只顯示一次) |
| 重設通行碼(學生忘記) | 「名單」→ 該生「重設通行碼」(會一併解除鎖定) |
| 停用學生 | 「名單」→ 該生「停用」(可再「啟用」) |
| 解除鎖定 | 「名單」→ 該生「解除鎖定」 |
| 增減老師 | 「管理」→ 教師帳號 → 新增 / 移除(不能移除自己、至少留一位) |
| 匯出 Excel | 「管理」→「下載 Excel (.xlsx)」(次要:改下載 CSV) |
| 印 QR 標籤 | 「QR 標籤」→ 輸入樹號範圍 → 產生 → 列印 / 另存 PDF |
| 看地圖著色 | 「地圖」→「著色」選「樹高」(灰=未量測,藍色越深越高) |
| 安裝到主畫面 | Android Chrome:選單 → 安裝應用程式;iPhone Safari:分享 → 加入主畫面 |

## 3. 想改什麼 → 改哪裡

- 用法:開檔案 → 搜尋「搜尋關鍵字」→ 修改 → 照最後一欄收尾。
- 不寫行號(會漂移),一律用關鍵字搜尋。

<!-- pointers:start -->
| 想改什麼 | 檔案 | 搜尋關鍵字 | 改完要做的事 |
|---|---|---|---|
| 主題色(綠色 #2e7d32) | `public/app.html` | `#2e7d32` | 其他頁面、`src/trendView.js` 與 `public/manifest.json` 也有同色,一併搜尋;若改到列在 `src/swCacheList.js` 的檔案(如 `app.html`、`trendView.js`),要升 `CACHE_NAME` |
| 校名 / 標題文字 | `public/app.html` | `南港高工 校園樹木量測` | `public/index.html` 有同句;通行碼紙條的校名在 `public/roster.html`;升 `CACHE_NAME` |
| 量測者眼高(後端) | `apps-script/Code.gs` | `EYE_HEIGHT_M` | 前端 calc 要同步改;後端重新部署 |
| 量測者眼高(前端 calc) | `src/calc.js` | `eyeHeightM = 1.5` | 要與後端相同;升 `CACHE_NAME`;`npm test` |
| 距離上限(公尺) | `apps-script/Code.gs` | `MAX_DISTANCE_M` | `src/calc.js` 同名常數要同步;後端重新部署;升 `CACHE_NAME` |
| 樹圍上限(公分) | `src/calc.js` | `MAX_GIRTH_CM` | `Code.gs` 同名常數要同步;後端重新部署;升 `CACHE_NAME` |
| 樹高上限(公尺) | `apps-script/Code.gs` | `MAX_HEIGHT_M` | `src/calc.js` 同名常數要同步;後端重新部署;升 `CACHE_NAME` |
| 連錯幾次鎖定 | `apps-script/Code.gs` | `MAX_FAILS` | 後端重新部署 |
| 鎖定秒數 | `apps-script/Code.gs` | `LOCK_SECONDS` | 後端重新部署 |
| 通行碼長度(不建議改) | `src/studentCode.js` | `CODE_BODY_LENGTH` | 見下方說明;需前後端同改,舊碼全失效 |
| 教師頁分頁清單 | `src/appShell.js` | `TEACHER_TABS` | 升 `CACHE_NAME`;`npm test` |
| 學生頁分頁清單 | `src/appShell.js` | `STUDENT_TABS` | 升 `CACHE_NAME`;`npm test` |
| QR 標籤預設網址 | `public/qrcodes.html` | `baseUrlInput.value` | 此頁不在離線快取,**不用**升 `CACHE_NAME`;**網址一換,已印樹牌作廢(第 9 節 c)** |
| 後端網址 | `src/config.js` | `API_URL` | 升 `CACHE_NAME`;`npm test` |
| Google 用戶端 ID(前端) | `src/config.js` | `GOOGLE_CLIENT_ID` | 必須與 Code.gs 相同;升 `CACHE_NAME` |
| Google 用戶端 ID(後端) | `apps-script/Code.gs` | `GOOGLE_CLIENT_ID` | 必須與 `src/config.js` 相同;後端重新部署 |
| 離線快取版本 | `public/sw.js` | `CACHE_NAME` | 版本號 +1(見第 5 節) |
| 更新官方樹木資料 | `scripts/fetch-official-trees.mjs` | `nkhs-trees.json` | 電腦執行 `node scripts/fetch-official-trees.mjs`;升 `CACHE_NAME` |
| 地圖著色的顏色 / 級距 | `src/heightColors.js` | `NO_DATA_COLOR` | 同檔案 `BANDS` 是各級距顏色;升 `CACHE_NAME` |
| 地圖預設圖層(航照/電子地圖) | `public/map.html` | `aerial.addTo(map)` | 此頁不在離線快取,**不用**升 `CACHE_NAME` |
<!-- pointers:end -->

- **通行碼長度為什麼不建議改**:
  - 前端 `src/studentCode.js` 與後端 `Code.gs` 有同一套產生/檢查碼演算法,必須一致(有測試對照)
  - 改長度 = 兩邊都要改,且已發的所有通行碼失效
  - 目前 7 碼(6 碼隨機 + 1 碼檢查碼)已足夠;WORKLOG 有「加長到 8 碼」的候選,非必要不做
- 眼高、各量測上限在前後端各有一份,**兩邊數字要一樣**(後端才是最終裁判)。

## 4. 怎麼改:三種方式

| 方式 | 適用情境 | 做法 |
|---|---|---|
| A. GitHub 網頁直接編輯 | 只改文字或一個數字 | repo 頁面開檔案 → 鉛筆圖示 → 修改 → Commit changes |
| B. 電腦 + VS Code | 較大改動、想先本機試 | 安裝 Node.js 與 VS Code → 下載 repo → `npm install` → 改檔案 → `npm test` → commit + push |
| C. AI 工具(例如 Claude) | 不會寫程式,但能用中文講需求 | 開專案資料夾 → 講需求 → 由自動測試把關 → 看測試結果再推上去 |

- **改完一定要**:
  - 電腦上跑 `npm test`,要全部通過
  - 推上 GitHub 後看 repo 的 **Actions** 頁:綠燈=通過,紅燈=有測試失敗,先修好再說
  - 只在 GitHub 網頁改(方式 A)也會觸發自動測試,記得回頭看燈號
- Windows PowerShell 出現「執行原則」錯誤時,把 `npx` 換成 `npx.cmd`(`npm` 同理):

```powershell
npx.cmd vitest run
```

## 5. 上線流程

### 前端(網頁)
1. 改完 → push 到 `master` → GitHub Pages 約 1 分鐘後生效。
2. **改了「被快取的檔案」(= 列在 `src/swCacheList.js` 裡的檔案,例如 `app.html`、`tree.html`、`trees.html`、`scan.html`、`src/*.js` 的部分模組、`data/nkhs-trees.json`、圖示),要把 `public/sw.js` 的 `CACHE_NAME` 版本號 +1**;`admin.html`、`roster.html`、`map.html`、`qrcodes.html`、`teacher.html`、`index.html` **不在**快取清單內,改了不用升版:
   - 原因:網站用 Service Worker 做離線快取,快取優先
   - 版本號不變,已安裝的手機會一直用舊檔案
   - `src/swCacheList.js` 與 `public/sw.js` 的清單必須一致(有測試守門)
3. 手機開 App 會出現「有新版本可用」橫幅,按一下重整即可;舊手機可能要重開 2~3 次。

### 後端(Apps Script)
1. 開 Sheet → 擴充功能 → Apps Script。
2. 把 `apps-script/Code.gs` **整份**貼上 → 存檔。
3. 部署 → **管理部署作業** → 鉛筆 → 版本選「**新版本**」→ 部署。
4. 網址不變,`API_URL` 不用改。沒重新部署,新功能不會生效。

## 6. 改壞了怎麼辦

| 狀況 | 做法 |
|---|---|
| 前端改壞 | GitHub → Commits → 找上一個好的 commit(綠燈)→ 對壞的那個按 **Revert** |
| 資料會不會不見 | 不會。資料在 Google Sheet,不受程式改動影響 |
| 後端改壞 | Apps Script → 部署 → 管理部署作業 → 編輯 → 版本切回舊版本 → 部署 |
| 不確定哪裡壞 | 跑 `npm test`,看哪個測試紅燈,訊息會指出問題 |

## 7. Java → JavaScript 小抄

| Java | JavaScript | 備註 |
|---|---|---|
| `int x = 5;` | `let x = 5;` / `const x = 5;` | `const` 不能重新指定,預設用它 |
| 宣告型別 | 不寫型別 | 變數可以放任何東西 |
| `"a" + x` | `` `a${x}` `` | 反引號字串,`${}` 內放變數 |
| `List<String>` | `[1, 2, 3]` | 陣列,長度可變 |
| for 迴圈處理清單 | `.map(...)` `.filter(...)` | `.map` 轉換每一項,`.filter` 留下符合的 |
| 自訂 class / Map | `{ name: 'A', age: 3 }` | 物件,用 `obj.name` 取值 |
| `==` 比較 | `===` | 一律用三個等號(不做型別轉換) |
| `null` | `null` 與 `undefined` | `undefined` = 沒設定過 |
| `int f(int a) {...}` | `function f(a) {...}` / `(a) => ...` | 箭頭函式是簡短寫法 |
| `package` / `import` | `import ... from` / `export` | 每個檔案就是一個模組 |
| `System.out.println` | `console.log(...)` | 在瀏覽器 F12 主控台看 |
| 一定要有 class | 不用 class | 本專案幾乎都是「檔案 + 函式」 |
| 等待結果 | `async` / `await` | `await` 等網路回應完再往下 |

本專案真實範例(`src/nearby.js` 的 `distanceMeters`,原樣引用):

```js
export function distanceMeters(a, b) {
  const dLat = toRad(b.y - a.y);
  const dLon = toRad(b.x - a.x);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.y)) * Math.cos(toRad(b.y)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
```

- `export function distanceMeters(a, b)`:對外提供的函式,`a`、`b` 是兩個座標點(像 Java 的 `public static`,但不用寫型別)
- `const dLat = toRad(b.y - a.y);`:緯度差轉成弧度(`y` = 緯度,`toRad` 是同檔案的小函式)
- `const dLon = toRad(b.x - a.x);`:經度差轉成弧度(`x` = 經度)
- `const h = ... ** 2 ...`:球面距離公式(Haversine)的中間值,`** 2` 是平方
- `return 2 * EARTH_RADIUS_M * Math.asin(...)`:乘上地球半徑得到公尺數;`Math.min(1, ...)` 防止誤差讓數值超過 1
- 用法:`nearestTrees` 用它算「離我最近的 5 棵樹」

## 8. 常見的坑

- **Service Worker 快取優先**:改了被快取的檔案一定要升 `CACHE_NAME`,`swCacheList.js` 要同步;第一次開新版可能要多重新整理 2~3 次。
- **官方樹木快照也被快取**:更新 `data/nkhs-trees.json` 後必須升 `CACHE_NAME`,否則已安裝的手機一直用舊樹清單。
- **後端要手動重新部署**:改 `Code.gs` 後整份貼上並用「新版本」部署;前端 push 了但後端沒部署,學生可能送不出去。
- **前端 push 約 1 分鐘才生效**。
- **本機預覽被舊快取騙**:測試前先在瀏覽器 unregister Service Worker 並清除 caches。
- **Sheet 可能有測試假資料**:交接前清掉(樹號 `A-023`、`seed-1~3`、測試學生)。
- **PowerShell 執行原則**:用 `npx.cmd` / `npm.cmd`。
- **地圖偶有灰色方塊**:國土測繪中心該處圖磚沒資料,不是本系統問題。

## 9. 交接給學校前必做清單

### 四個風險(先看)
- [ ] **(a) 最先確認**:校方 Google 帳號的管理員可能限制 Apps Script 網頁應用程式「任何人可存取」。若被擋,學生端無法呼叫後端。動工前先測一次。
- [ ] **(b) `CODE_PEPPER` 會重新產生**:搬到新的 Apps Script 後,內部密碼加鹽設定(`CODE_PEPPER`)重新產生,**所有學生通行碼失效,需重新發放**。
- [ ] **(c) 網址先定案再印牌**:QR 內容是網址,網址一換已印的樹牌全部作廢。**網址(含子網域)必須在大量印製前定案。**
- [ ] **(d) 換網域**:在 Google 用戶端設定加入新的「已授權的 JavaScript 來源」;學生需重新加入主畫面。

### 搬家步驟
- [ ] 用**校方帳號**重建 Google Sheet(分頁「量測紀錄」,標題列見 `apps-script/README.md`)
- [ ] 建 Apps Script、貼 `Code.gs`、部署為 Web App(執行身分=我、存取=任何人)
- [ ] 建 OAuth 用戶端 ID,「已授權的 JavaScript 來源」含正式網域
- [ ] 更新 `src/config.js` 的 `API_URL`、`GOOGLE_CLIENT_ID`,並讓 `Code.gs` 的 `GOOGLE_CLIENT_ID` 相同
- [ ] 升 `public/sw.js` 的 `CACHE_NAME`
- [ ] 新「教師名單」填校方老師信箱
- [ ] 刪測試資料(樹號 `A-023`、`seed-1~3`、測試學生)
- [ ] 刪 `public/_tmp_roster.html`、`public/_tmp_tree.html`(臨時測試頁,已 `.gitignore`,不會被提交)
- [ ] 重新匯入學生名單並發放通行碼
- [ ] 依 `apps-script/README.md` 的「驗證清單」逐項跑一次
- [ ] `npm test` 全過、GitHub Actions 綠燈

## 10. 文件索引

| 文件 | 內容 |
|---|---|
| `README.md` | 專案簡介與連結 |
| `docs/HANDOVER.md` | 本文件 |
| `DEPLOY.md` | 前端部署、各功能說明、兩端架構 |
| `apps-script/README.md` | 後端部署、安全設計、回應代碼、驗證清單 |
| `docs/WORKLOG.md` | 開發紀錄、已驗證/未驗證、踩過的坑 |
| `.github/workflows/test.yml` | 自動測試設定 |
| `tests/handoverDocs.test.js` | 檢查本文件第 3 節對照表是否還正確 |
