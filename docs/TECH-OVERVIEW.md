# 技術總覽與交接報告稿 — 南港高工 校園樹木量測

> 用途:①給做這個專案的同學**自己先學懂**;②週三交接時當**口頭報告稿**。
> 讀法:先看第 1 節(一頁),再看第 4 節(流程),最後背第 10、11 節。
> 所有數字與檔名都可在專案裡查到;查不到的標「待確認」。
> 對象:老師(模具科,懂一點 Java,不是網頁工程師)。

---

## 1. 一頁總覽

### 1.1 一句話
- 學生用手機掃樹牌 QR(或在地圖上選樹),填「仰角、距離、樹圍」,系統算出樹高、存進 Google Sheet,老師在地圖上看各樹高度並匯出 Excel。

### 1.2 誰用、解決什麼

| 角色 | 做什麼 | 入口 |
|---|---|---|
| 學生 | 選樹/掃 QR → 填量測值 → 送出 | App 網址 → 「我是學生」(分頁:樹木、掃描、量測) |
| 老師 | Google 登入 → 管名單/通行碼 → 看地圖 → 印 QR 標籤 → 匯出 Excel → 管理教師帳號 | App 網址 → 「我是老師」(分頁:名單、地圖、QR 標籤、管理) |

- 取代:紙本記錄再手動打字。
- 學生端解決:離線也能填、打錯通行碼會立刻發現、姓名不能亂填。
- 老師端解決:樹高上色地圖、匯出成 Excel 回填官方「校園樹木資訊平臺」。
- 樹木範圍:官方平台上南港高工 861 棵(`data/nkhs-trees.json`)。

### 1.3 大架構圖

```
┌──────────────────────┐        ① 下載網頁/程式(只讀檔案)        ┌────────────────────────┐
│ 手機 / 電腦 瀏覽器   │ ◄──────────────────────────────────────── │ GitHub Pages           │
│ (PWA:可裝到主畫面)   │                                            │ 靜態網站(public/ src/ │
│  ├ Service Worker    │                                            │ data/)               │
│  ├ IndexedDB 離線佇列 │                                            └────────────────────────┘
│  └ 相機(掃 QR)      │
└───┬────────┬─────────┘
    │        │ ② 送出量測 / 老師動作 / 讀公開摘要(HTTPS + JSON)
    │        ▼
    │   ┌───────────────────────────┐   讀寫    ┌───────────────────────┐
    │   │ Google Apps Script        │ ────────► │ Google Sheet          │
    │   │ (後端,Code.gs)          │ ◄──────── │ 量測紀錄/學生名單/    │
    │   │ 驗證、重算樹高、防重複    │           │ 教師名單              │
    │   └───────────┬───────────────┘           └───────────────────────┘
    │               │ ④ 向 Google 查 ID Token 是否有效
    │               ▼
    │        Google 登入服務(oauth2.googleapis.com/tokeninfo)
    │
    ├─③ 老師登入:Google Identity Services(accounts.google.com/gsi/client)
    │
    ├─⑤ 地圖底圖:國土測繪中心 NLSC 圖磚(wmts.nlsc.gov.tw)
    │
    └─⑥ 樹木清單:官方平台快照 data/nkhs-trees.json(電腦上用腳本抓一次,放進 repo)
```

- 兩個「伺服器」都是別人的:網頁在 GitHub、後端在 Google。學校不用養主機。
- 沒有資料庫軟體:資料就是 Google Sheet 的幾個分頁。

---

## 2. 技術清單

| 技術 | 是什麼 | 用在哪 | 為什麼選它 | 替代方案 / 取捨 |
|---|---|---|---|---|
| HTML / CSS / JavaScript(ES modules,無建置) | 網頁三件套;`import`/`export` 讓每個檔案當一個模組 | `public/*.html`、`src/*.js` | 改檔案→推上 GitHub 就上線,沒有編譯步驟,接手者只要會改文字檔;語法像 Java | React/Vue 等框架:功能多但要 Node 建置環境,老師接手門檻高。取捨:頁面多了之後有些重複碼(各頁各有一段設定與樣式) |
| PWA(manifest + Service Worker + 離線佇列 IndexedDB) | 讓網頁像 App:可裝到主畫面、可離線、可背景補送 | `public/manifest.json`、`public/sw.js`、`src/offlineQueue.js` | 校園樹旁常沒訊號;不必上架 App Store / Google Play | 原生 App:要開發者帳號、審核、維護兩套。取捨:iPhone 的 PWA 行為與 Android 有差異(待確認),離線開啟與相機權限仍待實機驗證 |
| GitHub Pages | GitHub 提供的免費靜態網站託管 | 網站 `https://jcsk7049.github.io/nkhs-tree-map/public/app.html` | 免費、push 後約 1 分鐘自動發布、有版本紀錄可 Revert | 學校自己的主機/雲端:要人維護、要錢。取捨:目前掛在個人帳號下;網址含帳號名,轉移後網址會變(見第 8 節) |
| Google Apps Script(後端) | Google 提供的雲端 JavaScript,可綁在試算表上當簡易 API | `apps-script/Code.gs`(部署成 Web App) | 免費、免主機、和 Sheet 天生整合、內建 SHA-256 與快取與鎖 | Node/Python 伺服器 + 資料庫:彈性大但要維護與費用。取捨:有每日用量限制、冷啟動較慢(第 8 節) |
| Google Sheet(資料庫) | 雲端試算表 | 分頁「量測紀錄」「學生名單」「教師名單」 | 老師本來就會用、可直接開啟檢視/編輯/匯出、沒有資料庫要維護 | MySQL/Firebase 等:查詢強、能處理大量。取捨:不適合超大量資料、沒有真正的交易機制(靠程式加鎖) |
| Google 登入(ID Token / OAuth 用戶端 ID) | 老師用 Google 帳號證明身分,瀏覽器拿到一張簽名的「身分證」(ID Token) | `src/teacherGate.js`、`Code.gs` 的 `verifyGoogleToken` | 不必自己做帳號密碼系統;老師名單只是 Sheet 裡的信箱 | 自建帳密:要處理密碼儲存與外洩。取捨:需要 Google Cloud 建 OAuth 用戶端 ID;換網域要重新授權來源 |
| Leaflet + 國土測繪中心 WMTS 圖磚 | Leaflet:開源地圖函式庫;圖磚:官方地圖切成的小圖片 | `public/map.html`、`public/trees.html`、`public/vendor/leaflet/` | 免費、輕量;官方航照/電子地圖適合校園尺度 | Google Maps:要 API 金鑰與計費。取捨:圖磚必須有網路;偶有灰色方塊=官方該處沒圖 |
| jsQR + getUserMedia(掃 QR) | getUserMedia:瀏覽器開相機的功能;jsQR:純 JS 把影像解成 QR 文字 | `public/scan.html`、`src/qrScan.js`、`src/cameraSession.js`、`public/vendor/jsqr/` | 影像只在手機上辨識、不上傳;放進專案內所以離線可用 | 瀏覽器內建 BarcodeDetector:iPhone 不一定支援(待確認)。取捨:jsQR 未壓縮約 約 267 KB;辨識速度依手機而異 |
| qrcode-generator(產生 QR) | 開源的 QR 產生函式庫 | `public/qrcodes.html`、`public/vendor/qrcode.mjs` | 純 JS、離線可產生、MIT 授權 | 線上 QR API:會把網址送給外部服務。取捨:標籤網址一換,已印樹牌作廢 |
| 自寫 xlsx 產生器 | 用程式直接組出 .xlsx(其實是 zip 內含 XML) | `src/xlsx.js` | 原本匯出 CSV 在老師電腦上整列擠在 A 欄;.xlsx 欄位一定分開、數字為數字 | 引入 SheetJS 等函式庫:省事但增加第三方碼與體積。取捨:自己維護,只支援目前需要的簡單格式 |
| SHA-256 + pepper(通行碼雜湊) | 雜湊=單向指紋;pepper=只存在後端的秘密字串 | `Code.gs` 的 `hashCode`、`getPepper` | Sheet 裡只有指紋,連 Sheet 擁有者也看不到通行碼 | 直接存明碼:最簡單但外洩就全曝光。取捨:通行碼只有 7 碼,若 Sheet 與 pepper 同時外洩,離線暴力破解成本偏低(WORKLOG 有「加長到 8 碼」候選) |
| vitest(自動測試)+ GitHub Actions(CI) | vitest:JS 測試工具;Actions:推到 master 或開 PR 時自動跑測試 | `tests/`(32 個檔)、`.github/workflows/test.yml` | 改壞了會亮紅燈;AI 協助開發時特別需要這道把關 | 純手動測試:容易漏。取捨:測試只證明「程式邏輯」,不證明實機行為(第 7 節) |
| Node.js | 電腦上執行 JS 的環境 | **只用在**:跑測試、更新樹木資料腳本 `scripts/fetch-official-trees.mjs` | 網站本身不需要 Node;它只是開發工具 | — |

- 沒有用到:資料庫軟體、Java、Python、前端框架、打包工具(webpack 等)。
- 有一支 PowerShell 腳本 `scripts/make-icons.ps1` 產生主畫面圖示,平常用不到。

---

## 3. 資料夾地圖

| 資料夾 | 放什麼 |
|---|---|
| `public/` | 網頁本體:各頁 `.html`、`sw.js`、`manifest.json`、圖示、`vendor/`(第三方函式庫原樣放入) |
| `src/` | 純 JavaScript 模組(計算、離線佇列、送出、殼層路由、掃描、匯出等),盡量不碰畫面,方便測試 |
| `data/` | `nkhs-trees.json`:官方 861 棵樹的快照(樹號、樹種、經緯度) |
| `apps-script/` | 後端 `Code.gs`(整份貼到 Apps Script)與後端說明 `README.md` |
| `tests/` | 自動測試(32 個檔案) |
| `scripts/` | 一次性工具:抓官方樹木資料、產生圖示 |
| `docs/` | 交接說明書、開發紀錄、本文件、`superpowers/` 內的設計規格與實作計畫(開發歷史) |
| `.github/` | `workflows/test.yml`:push 或 PR 時自動跑測試 |

### 最重要的檔案

| 檔案 | 一句話 |
|---|---|
| `apps-script/Code.gs` | 整個後端:驗證通行碼、驗證老師、重算樹高、寫 Sheet、公開摘要 |
| `public/app.html` | 統一入口(殼層):選身分、底部分頁,用 iframe 載入各頁 |
| `public/tree.html` + `src/treePage.js` | 學生量測頁:填表、驗證、送出 |
| `src/calc.js` | 樹高公式與輸入範圍檢查(前端版) |
| `src/submit.js` + `src/offlineQueue.js` | 送出;失敗時存進 IndexedDB,之後補送 |
| `public/sw.js` + `src/swCacheList.js` | Service Worker 與離線快取清單(兩份要一致,有測試守門) |
| `src/config.js` | 後端網址 `API_URL`、`GOOGLE_CLIENT_ID`:設定的唯一來源 |
| `src/teacherGate.js` + `src/teacherApi.js` | 老師登入閘門與呼叫後端的共用函式 |

---

## 4. 四個核心流程

### 4a. 學生量測與送出

步驟:
1. 學生選樹:掃樹牌 QR(`scan.html`)或在地圖點樹(`trees.html`)→ 進入 `tree.html?treeId=<官方樹號>`。
2. 填班級座號、通行碼、仰角、水平距離、樹圍。
3. 前端先驗證:範圍檢查(`calc.js`)與通行碼檢查碼(`studentCode.js`);打錯一個字元離線也能立刻發現。
4. 產生 `clientRecordId`(這筆的唯一編號,防重複用),用 `fetch` POST 給 Apps Script。
5. 後端:驗證輸入 → 驗證通行碼(雜湊比對、連錯鎖定)→ 加鎖 → 查重複 → **自己重算樹高** → 寫進 Sheet。
6. 回 `{status:'ok', studentName}`,畫面顯示名簿姓名。
7. 若沒網路或後端暫時出錯:存進 IndexedDB 佇列;有網路時自動補送。

```
學生手機                          Apps Script                    Google Sheet
   │  填表、前端驗證                  │                               │
   │── POST {樹號,座號,通行碼,角度,距離,樹圍,clientRecordId} ─►│
   │                                  │ 驗證欄位範圍                   │
   │                                  │ 比對 SHA-256(pepper|座號|碼)  │──讀「學生名單」
   │                                  │ 加鎖 → 查最近 2000 列有無重複  │──讀「量測紀錄」
   │                                  │ 樹高 = 眼高+距離×tan(仰角) 重算│
   │                                  │ 寫入新列(姓名取名簿的)       │──寫「量測紀錄」
   │◄──────── {status:'ok', studentName} ────────────────────────│
   │                                                                  
   │ (斷網時)POST 失敗 → 存 IndexedDB 佇列 → 畫面「已暫存」         │
   │ (恢復網路)自動逐筆補送 → 成功才從佇列移除                      │
```

- 為什麼 Content-Type 用 `text/plain`:用 `application/json` 會觸發瀏覽器的 CORS 預檢(OPTIONS),Apps Script 不回應預檢,請求會被擋(`src/submit.js` 註解)。body 仍是 JSON 字串。
- Apps Script 的回應永遠是 HTTP 200,成功或失敗由 JSON 的 `status`/`code` 判斷(`Code.gs` 開頭註解)。
- 結果分類:
  - `VALIDATION_FAILED`、`STUDENT_REJECTED`:永久拒絕,移出佇列
  - `STUDENT_LOCKED`:當場告知,不入佇列
  - 網路/伺服器錯誤:入佇列稍後重試

涉及檔案:`public/scan.html`、`public/trees.html`、`public/tree.html`、`src/treePage.js`、`src/calc.js`、`src/studentCode.js`、`src/submit.js`、`src/offlineQueue.js`、`apps-script/Code.gs`(`handleMeasurement`)。

### 4b. 老師登入與管理

步驟:
1. 老師開 App → 選「我是老師」→ 頁面載入 Google 的登入元件(`accounts.google.com/gsi/client`)。
2. 老師用 Google 帳號登入,瀏覽器拿到 **ID Token**(Google 簽名的身分證明),存在 `sessionStorage`(關分頁就沒了)。
3. 每個老師動作(名單、匯出、教師管理)都把 ID Token 連同動作名稱送給後端。
4. 後端 `verifyTeacher`:
   - 先讀 token 內的 `exp` 預檢是否過期
   - 呼叫 Google `tokeninfo` 驗簽章
   - 檢查 `aud` = 我們的 OAuth 用戶端 ID、`email_verified` 為真
   - 信箱在「教師名單」分頁
5. 全部通過才執行動作(`roster-list/import/reset/status/unlock`、`teacher-list/add/remove`)。

```
老師瀏覽器                Google                 Apps Script              Sheet
   │── 點「使用 Google 登入」──►│                      │                     │
   │◄──── ID Token(簽名)─────│                      │                     │
   │── POST {action:'roster-list', idToken} ─────────►│                     │
   │                            │◄─ tokeninfo 驗簽 ───│                     │
   │                            │── aud/exp/email ───►│                     │
   │                                                   │── 信箱在教師名單? ─►│
   │◄──────────── 通過:回名單 / 不通過:AUTH_* 或 TEACHER_REJECTED ─────────│
```

- 前端的登入閘門**只擋介面**;真正的把關每次都在後端(`DEPLOY.md`「兩端架構」)。
- 教師驗證有 30 秒逾時(`src/teacherApi.js`)。
- 增減老師只要改 Sheet「教師名單」分頁(或用管理分頁),不必重新部署後端。

涉及檔案:`src/teacherGate.js`、`src/teacherApi.js`、`src/session.js`、`public/roster.html`、`public/admin.html`、`Code.gs`(`verifyGoogleToken`、`handleTeacherAction`)。

### 4c. 樹高怎麼算

- 原理:站在離樹 D 公尺的水平地面,用量角器/手機量到樹頂的仰角 θ。
  - 樹頂比眼睛高 `D × tan(θ)`
  - 再加上眼睛離地高度(眼高)

```
樹頂 ●
     │╲
     │ ╲
  h  │  ╲  仰角 θ
  上 │   ╲
  眼 │____╲ ← 眼睛(離地 1.5 m)
     │      D(水平距離)
 地面 ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
```

公式(`src/calc.js`、`Code.gs` 的 `computeHeight`,兩邊相同):

```
樹高 = D × tan(θ) + 眼高(1.5 m),四捨五入到 0.01 m
```

| 範例 | 計算 | 結果 |
|---|---|---|
| θ = 45°、D = 10 m | 10 × tan45° + 1.5 = 10 + 1.5 | 11.5 m |
| θ = 30°、D = 15 m | 15 × 0.5774 + 1.5 | 10.16 m |
| θ = 60°、D = 10 m | 10 × 1.7321 + 1.5 | 18.82 m |

範圍限制(前後端相同):
- 仰角要大於 0 度、小於 90 度
- 距離 > 0 且 ≤ 500 m(`MAX_DISTANCE_M`)
- 樹圍 > 0 且 ≤ 2000 cm(`MAX_GIRTH_CM`)
- 算出的樹高 ≤ 100 m(`MAX_HEIGHT_M`)

**後端重算,不信任前端**:
- 前端也會算(給學生即時看),但寫進 Sheet 的樹高是 `handleMeasurement` 用仰角與距離**重新算的**。
- 為什麼:前端程式在別人手機上,可被改;只有後端是我們控制的。
- 時間戳同理:前端的時間只在「過去一年內、未來 10 分鐘內」才採信,否則改用伺服器時間(`trustedTimestamp`)。

### 4d. 離線與更新

步驟:
1. 第一次開 App:瀏覽器安裝 Service Worker,把 `swCacheList.js` 列的檔案(網頁、模組、Leaflet、jsQR、樹木快照、圖示)全部存進快取 `tree-map-v18`。
2. 之後開 App:**快取優先**(先拿快取,沒有才上網)→ 沒訊號也能開學生頁、填表。
3. 沒訊號送出:進 IndexedDB 佇列,有網路(`online` 事件)自動補送。
4. 我們改了程式:把 `sw.js` 的 `CACHE_NAME` 版本號 +1 → 瀏覽器發現 `sw.js` 變了 → 重新安裝、刪掉舊快取。
5. App 偵測到新的 Service Worker 接管 → 顯示「有新版本可用」橫幅,按鈕才重整(避免填到一半資料消失)。

```
開 App
  │
  ▼
Service Worker 攔截每個請求
  │
  ├─ 快取有?──是──► 直接回快取(快、可離線)
  │       │
  │       否
  │       ▼
  └────► 上網抓(例如 NLSC 圖磚、後端 API)

改版時: CACHE_NAME v18 → v19
  → 安裝新快取(cache:'reload' 繞過 HTTP 快取)
  → 刪除名稱不等於 v19 的舊快取
  → 頁面顯示「有新版本可用」
```

- 為什麼要升版:快取優先 = 版本號不變,已安裝的手機會一直用舊檔。
- 兩份清單(`src/swCacheList.js` 與 `public/sw.js`)必須逐字一致,`tests/duplication-sync.test.js` 守門。原因:Service Worker 不能 `import` 專案模組,只好複製。
- 不在快取清單(改了不用升版):`admin.html`、`roster.html`、`map.html`、`qrcodes.html`、`teacher.html`、`index.html`;老師頁需要連網。
- 圖磚需要網路:老師端 `map.html` 不在離線快取清單,離線不保證能開;學生端 `trees.html` 的底圖離線為空(離線開啟尚未實機驗證)。

涉及檔案:`public/sw.js`、`src/swCacheList.js`、`public/app.html`(註冊與更新橫幅)、`src/offlineQueue.js`、`src/submit.js`。

---

## 5. 安全與隱私設計

| 設計 | 防什麼壞事 | 位置 |
|---|---|---|
| 通行碼只存雜湊(SHA-256 + pepper + 班級座號) | Sheet 被看到或外洩時,別人拿不到明碼、也不能冒用;pepper 只在 Apps Script 內部屬性 | `Code.gs` `hashCode`、`getPepper` |
| 連錯 10 次鎖 5 分鐘(`MAX_FAILS=10`、`LOCK_SECONDS=300`) | 有人用程式狂猜通行碼;錯誤訊息一律相同,不透露座號是否存在 | `Code.gs` `verifyStudent` |
| 姓名由後端依名簿決定 | 學生冒用別人名字、亂填姓名 | `Code.gs` `handleMeasurement` |
| 樹高與時間戳後端重算 / 校時 | 前端被改、送假數字,或把某棵樹「釘」在離譜高度或最新時間 | `Code.gs` `computeHeight`、`trustedTimestamp` |
| Google Sheet 公式注入防護 | 送出 `=IMPORTXML(...)` 之類文字,被 Sheet 當公式執行、把資料外傳 | `Code.gs` `sanitizeCellText` |
| 教師驗證每次都在後端做;前端閘門只擋介面 | 有人直接打 API,或改前端程式繞過登入畫面 | `Code.gs` `verifyTeacher` |
| 公開摘要不含個資 | 公開端點洩漏學生姓名/座號;只回樹號、樹高、樹圍、時間 | `Code.gs` `summarizeRows`、`historyRows` |
| 定位與相機畫面只在本機 | 學生位置與影像被收集;定位不儲存不上傳,QR 在手機上辨識、不存檔 | `public/trees.html`、`public/scan.html`(見 `DEPLOY.md`) |
| QR 內容不可信 | 有人做假 QR 指向惡意網址或亂填樹號;只接受官方樹號名單內的樹 | `src/qrScan.js`(`parseTreeIdFromQr(text, officialNos)`) |
| 防重複寫入(`clientRecordId` + 鎖) | 雙擊送出或離線重送造成同一筆寫兩次 | `Code.gs` `hasClientRecordId` |
| 通行碼檢查碼(前端) | 手打錯一個字元卻被記成「連錯」而被鎖 | `src/studentCode.js` |

- 誠實提醒:離線暫存的紀錄會把班級座號與通行碼暫存在該裝置的 IndexedDB,直到同步成功才清除(`apps-script/README.md`)。共用平板要留意。

---

## 6. 怎麼做出來的(開發過程)

### 6.1 時間軸(依 git log,共 89 個 commit(不含本文件的 commit),2026-09-18 至 2026-09-21)

| 日期 | 階段 | 重點 |
|---|---|---|
| 09-18 | MVP | 設計規格 → 實作計畫 → 計算/離線佇列/送出模組 → Apps Script 後端 → PWA 殼 → 量測頁;隨後多輪自我審查修正(離線快取漏檔、防公式注入、去重、改用 Google 登入) |
| 09-19 | 官方樹木地圖 | 861 棵官方樹地圖、QR 標籤產生器(對應官方樹號)、量測值回地圖依樹高著色、歷年趨勢圖、公開摘要端點 |
| 09-19 | 教師/學生分離 | 學生改用「個人通行碼」、老師用 Google 登入 + 教師名單;紅隊審查後修正(後端重算樹高、放寬鎖定計數、前後端統一上限) |
| 09-20 | 可安裝 App(階段 1) | `app.html` 殼層:選身分、底部導覽、iframe 承載各頁;manifest 與圖示 |
| 09-20 | 學生免掃 QR 選樹(階段 2) | `trees.html`:地圖標色、我的位置、最近 5 棵 |
| 09-20 | 匯出與教師管理(階段 3) | 匯出 CSV → 改為 .xlsx;教師帳號新增/移除;解除鎖定 |
| 09-20 | 手機修正 | 依 iPhone 錄影修圖示、名單卡片版面、新版本橫幅、閘門不閃空白 |
| 09-21 | 掃描 QR | `scan.html`:相機 + jsQR,相機生命週期修正,快取升 v18 |
| 09-21 | 交接文件 | `docs/HANDOVER.md`、README、GitHub Actions 自動測試、本文件 |

- 設計與計畫文件都在 `docs/superpowers/specs/` 與 `docs/superpowers/plans/`(規格 5 份、計畫 7 份)。

### 6.2 用 AI 協助的方式(誠實說明)

- 這個專案是**在 AI(Claude)協助下開發**的,不是純手寫。做法有固定流程:
  1. **先設計**:功能先寫成設計規格(spec),確認需求再動手。
  2. **再計畫**:拆成小任務的實作計畫(plan)。
  3. **寫測試**:重要邏輯先有測試(通行碼演算法、樹高計算、後端 `Code.gs` 用假 Sheet 測)。
  4. **分工實作**:AI 依計畫寫程式。
  5. **獨立審查**:另一個 AI 角色做安全/紅隊審查,發現問題再修(例如樹高後端重算、鎖定計數的競態)。
  6. **實機驗證**:真人在真正的 Google 登入、Sheet、iPhone 上測試,並把結果記在 `docs/WORKLOG.md`。
- 人做的事:決定需求、選方向、實機測試、判斷取捨。AI 做的事:寫程式、寫測試、寫文件、審查。
- 這代表:學生需要能**解釋架構與取捨**,不需要背每一行程式;改動時靠自動測試把關。

### 6.3 測試數量
- 2026-09-22 在本機執行 `npx vitest run`:**32 個測試檔、399 個測試全部通過**。
- 注意:`docs/WORKLOG.md` 內寫的「291 個測試」是較舊的數字,以這裡為準。

---

## 7. 品質與驗證現況

依 `docs/WORKLOG.md` 整理(未驗證者不要說成已完成):

| 項目 | 狀態 | 依據 |
|---|---|---|
| 計算、驗證、離線佇列、後端邏輯(假 Sheet) | 有單元測試(399 個) | `npx vitest run` |
| 真實 Google 登入進教師端、匯入名單、學生用通行碼送出成功(姓名帶入、樹高後端重算、趨勢圖更新) | 已實測(2026-09-19) | WORKLOG |
| 殼層(`app.html`)老師端:登入、名單、地圖、QR 標籤 | 已實測(桌機 Chrome,2026-09-20) | WORKLOG |
| iPhone 加入主畫面、獨立 App 內老師登入、定位、名單匯入 | 已實測(iPhone 錄影/截圖,2026-09-20;v16 圖示與 5 個底部項目) | WORKLOG |
| 學生選樹地圖(桌機):點樹彈窗、我的位置、最近 5 棵 | 已實測(桌機 Chrome) | WORKLOG |
| .xlsx 匯出 | 已實測(真正的 Excel,欄位正常、無修復提示) | WORKLOG |
| 教師 `teacher-list` 在真實後端可用;假憑證打新動作皆回 `AUTH_REJECTED` | 已實測(部分) | WORKLOG |
| 掃描分頁 | 只在電腦瀏覽器用**假相機**(canvas 串流)測過 | WORKLOG |
| iPhone 獨立 App 的相機權限與辨識速度、Android、實際印出樹牌的辨識率 | **尚未驗證** | WORKLOG |
| 安裝版 App 離線開啟殼層與學生量測頁、Android 安裝 | **尚未驗證** | WORKLOG |
| 錯誤通行碼被擋、連錯 10 次鎖定 → 名單頁鎖定標記 → 解除鎖定的真實操作 | **尚未驗證**(僅有單元測試與假 Sheet) | WORKLOG |
| 教師帳號新增/移除(`teacher-add/remove`)的真實操作 | **尚未驗證** | WORKLOG |
| 手機實際掃 QR、平板真機(校園 WiFi/死角離線) | **尚未驗證** | WORKLOG |
| 手機/平板真機定位在樹旁的準確度 | **尚未驗證** | WORKLOG |
| 4 個分頁 +「換身分」在 375px 手機是否過擠 | **尚未驗證**(v16 截圖顯示 5 項完整,細節待確認) | WORKLOG |
| QR 標籤頁手機橫向溢出 | 已知未處理 | WORKLOG |
| 樹高量測的實地準確度(與真實樹高比對) | **尚未驗證**(第 11 節 Q9) | 無紀錄 |

---

## 8. 已知限制與取捨(誠實清單)

| 限制 | 影響 | 若要改善的方向 |
|---|---|---|
| Apps Script 有每日用量限制,冷啟動較慢(首發請求偶爾要多等幾秒,WORKLOG 曾記錄一次首發請求異常後重試正常) | 整班同時送出時可能變慢;用量上限的確切數字待確認(以 Google 官方文件為準) | 全班分批量測;若真有問題再改成有資料庫的雲端服務 |
| Google Sheet 不適合超大量資料 | 幾年後資料很多時匯出/摘要變慢(已限制重複檢查只看最近 2000 列) | 每學年新開一份 Sheet;或歷史資料封存 |
| 任何人可故意輸錯,把某學生鎖 5 分鐘 | 被搗亂的學生要等 5 分鐘,或請老師「解除鎖定」/重設通行碼 | 鎖定改成綁裝置或加驗證機制(要多一層設計) |
| 通行碼只有 7 碼(6 隨機 + 1 檢查碼),熵約 2^29 | 線上猜不可行;但 Sheet 與 pepper 若同時外洩,離線破解成本偏低 | 加長到 8 碼(前後端要同步改、舊碼全失效) |
| 用 `iframe` 殼層承載各頁 | 簡單、不必大改舊頁;但硬體返回鍵會直接離開 App、地圖「開啟量測頁」會另開分頁 | 重寫成單頁應用(工程較大) |
| 圖磚需要網路 | 離線時地圖沒有底圖 | 預先下載校園範圍圖磚(要處理官方使用條款,待確認) |
| jsQR 為未壓縮版本,約 267 KB(266,986 bytes) | 首次安裝多下載一點;離線可用是換來的 | 改用壓縮版或瀏覽器內建偵測(相容性待確認) |
| 只在 GitHub 個人帳號、個人 Gmail 下 | 網站、Sheet、Apps Script、OAuth 都掛在個人帳號;交接前不算學校資產 | 轉移 repo 或加老師為協作者;用校方帳號重建 Sheet/Apps Script/OAuth(見第 9 節) |
| 校方 Google 帳號可能限制 Apps Script「任何人可存取」 | 若被擋,學生端無法呼叫後端 | 動工前先測一次;不行則需請學校管理員放行或改架構 |
| 搬到新的 Apps Script 會重新產生 `CODE_PEPPER` | 所有學生通行碼失效,需重發 | 搬家時排定重發通行碼時間 |
| QR 內容是網址,網址一換已印樹牌全部作廢 | 大量印製後不能輕易換網域 | 印製前定案網址;或用學校自有網域轉址(待確認可行性) |
| 離線暫存的通行碼留在該裝置 IndexedDB 直到同步成功 | 共用平板有被翻看風險 | 避免共用;或改存加密後資料 |
| 列印清單與貼牌進度只存在該裝置瀏覽器 | 換裝置不同步 | 存進 Sheet |
| 測試主要是單元測試 | 手機相機、離線等要靠實機驗證(第 7 節) | 補完待驗證項目 |

---

## 9. 週三交接前待辦清單

### 清 Sheet 測試資料
- [ ] 刪「量測紀錄」中樹號 `perf-test` 的測試列(筆數以 Sheet 實際為準,用樹編號欄篩選即可)
- [ ] 刪樹號 43667 的測試量測(筆數以 Sheet 實際為準;若已被真實使用則保留)
- [ ] 刪「學生名單」測試學生(目前已知為 10101、10102、10103、111、112,以 Sheet 實際內容為準)
- [ ] (`docs/HANDOVER.md` 第 8、9 節另提到舊測試資料 `A-023`、`seed-1~3`,一併確認是否還在)

### 帳號與網址
- [ ] 確認 Sheet、Apps Script、OAuth 用戶端的擁有者與網址,填入 `docs/HANDOVER.md` 第 1 節(目前 Sheet 網址寫「待確認」)
- [ ] 確認學校子連結型態(例如學校網站底下的連結或子網域)
- [ ] 確認校方 Google 帳號能否把 Apps Script 設為「任何人可存取」
- [ ] 決定 QR 最終網址(**大量印製前**)
- [ ] 把 GitHub repo 轉移給學校帳號,或加老師為協作者

### 實機驗證(手機)
- [ ] iPhone 獨立 App:掃描相機權限與辨識速度
- [ ] Android:安裝、掃描
- [ ] 安裝版 App 離線開啟(殼層與學生量測頁)
- [ ] 實際印出的樹牌掃描辨識
- [ ] 錯誤通行碼被擋、連錯 10 次鎖定、名單頁「解除鎖定」實操
- [ ] 教師帳號新增/移除實操
- [ ] 375px 手機底部分頁是否過擠

### 教老師實作
- [ ] 教老師用自己的 Google 帳號登入教師端
- [ ] 實際操作一遍:匯入名單 → 發通行碼 → 用通行碼送出一筆 → 匯出 Excel
- [ ] 讓老師知道 `docs/HANDOVER.md` 的三種修改方式,以及自動測試(Actions)紅綠燈的意義
- [ ] 確認 GitHub Actions 為綠燈、`npm test` 全過

---

## 10. 口頭報告稿(10 分鐘)

### 段 1(約 1.5 分)— 這是什麼、解決什麼
- 一句話:學生掃樹牌 QR、手機填角度與距離,系統算樹高存進 Google Sheet,老師看地圖與匯出 Excel。
- 取代紙本;範圍是官方平台上南港高工的 861 棵樹。
- 學生端 3 個分頁(樹木/掃描/量測),老師端 4 個分頁(名單/地圖/QR 標籤/管理)。
- **示範**:打開 App 網址,選「我是學生」,展示三個分頁;再選「我是老師」。

### 段 2(約 2 分)— 用了哪些技術、為什麼
- 三塊:網頁(GitHub Pages)、後端(Google Apps Script)、資料庫(Google Sheet)。
- 全部是 JavaScript,沒有 Java、沒有要維護的主機、沒有建置步驟。
- 選擇理由:免費、學校沒有伺服器預算、老師本來就會用 Sheet。
- 配套:PWA(可裝到主畫面、可離線)、Leaflet 地圖、jsQR 掃 QR、自動測試。
- 指第 1.3 節的架構圖。

### 段 3(約 2 分)— 資料怎麼流動、樹高怎麼算
- 流程:填表 → 前端檢查 → 送後端 → 驗證身分 → 後端重算 → 寫 Sheet。
- 公式:樹高 = 距離 × tan(仰角) + 眼高 1.5 m;例:45°、10 m → 11.5 m。
- 後端重算的原因:前端可被改,後端才可信。
- **示範**:現場掃一張樹牌 QR(或在「樹木」分頁選一棵)→ 填數字 → 送出 → 展示 Sheet 新增一列(姓名是名簿的)。

### 段 4(約 1.5 分)— 離線、安全
- 離線:Service Worker 先讀快取;沒訊號就存進 IndexedDB,有網路自動補送。
- 安全:通行碼只存雜湊、連錯鎖定、姓名由後端決定、公開資料不含個資、老師驗證在後端做。
- 誠實補充:離線暫存的通行碼會留在該裝置,共用平板要留意。
- **示範**:手機切飛航模式送一筆 → 顯示「已暫存」→ 關閉飛航模式後補送(此示範需先實測過,現場前請預演)。

### 段 5(約 1.5 分)— 老師怎麼用與維護
- 老師登入 → 匯入名單 → 印通行碼紙條(只顯示一次)→ 學生量測。
- 忘記通行碼:名單頁「重設」;被鎖:「解除鎖定」。
- 匯出:管理分頁 → 下載 Excel,回填官方平台。
- 改動流程:改檔案 → `npm test` → push → Actions 綠燈;`docs/HANDOVER.md` 有「想改什麼 → 改哪裡」對照表。
- **示範**:老師端「管理」→ 下載 Excel 並打開。

### 段 6(約 1.5 分)— 現況、限制、交接
- 已實測:Google 登入、學生送出、殼層、iPhone 加入主畫面、.xlsx 匯出。
- 未驗證:iPhone 相機掃描、離線開啟、鎖定與教師新增/移除的實操(第 7 節)。
- 限制:Apps Script 用量與冷啟動、Sheet 不適合超大量資料、目前掛在個人帳號。
- 交接待辦:換校方帳號重建、清測試資料、定案 QR 網址(第 9 節)。
- 誠實說明:專案是在 AI 協助下完成,靠設計文件、測試與實機驗證把關。

---

## 11. 老師可能會問的 20 個問題與建議回答

| # | 問題 | 建議回答 | 對應 |
|---|---|---|---|
| 1 | 為什麼不用資料庫/伺服器? | 學校沒有伺服器預算與維護人力。Google Sheet 老師本來就會用,可直接開啟、編輯、匯出;Apps Script 免費且不用主機。取捨:不適合超大量資料。 | 第 2、8 節 |
| 2 | 資料存在哪?安全嗎? | 存在 Google Sheet(目前是個人 Gmail,交接後應換校方帳號)。通行碼只存雜湊;公開端點不含姓名與座號;老師動作每次在後端驗證。 | 第 5 節、`Code.gs` |
| 3 | 學生很多人同時用會不會掛? | 後端寫入用鎖讓請求排隊,不會互相覆蓋(等鎖逾時 20 秒的那一筆會失敗,前端可重送);但 Apps Script 有每日用量限制與冷啟動延遲,整班同時送出可能較慢。用量上限數字待確認,建議分批量測並先做實測。 | 第 8 節、`handleMeasurement` |
| 4 | Google 改政策怎麼辦? | 有風險(Apps Script 政策或校方帳號限制)。資料在 Sheet 可隨時匯出;前端是純靜態網頁,後端 `Code.gs` 約 970 行,可改寫到其他後端。 | 第 8 節 |
| 5 | 費用? | GitHub Pages、Apps Script、Google Sheet、Google 登入在目前使用方式下都是免費(以各服務現行政策為準,待確認)。 | 第 2 節 |
| 6 | 網站掛了怎麼辦? | 先看 GitHub Actions 是否紅燈;前端改壞可 Revert 上一個好的 commit;後端可在 Apps Script 切回舊版本。資料在 Sheet 不受程式影響。 | `HANDOVER.md` 第 6 節 |
| 7 | 怎麼備份資料? | 資料在 Google Sheet:可「檔案 → 下載」成 Excel,或複製一份試算表;程式碼在 GitHub 有完整版本歷史。目前沒有自動備份機制(待確認是否要加)。 | 第 3、8 節 |
| 8 | 我不會寫程式,怎麼改? | 日常操作(名單、通行碼、匯出)不用寫程式;要改設定看 `HANDOVER.md` 第 3 節對照表;也可用 AI 工具用中文提需求,由自動測試把關。 | `HANDOVER.md` 第 2~4 節 |
| 9 | 樹高準確嗎?誤差多少? | 用三角函數估算,結果取決於仰角與距離量得準不準,以及眼高假設 1.5 m。實地誤差尚未與真實樹高比對,**不宣稱具體誤差數字**(待確認)。可做法:多人量測、趨勢圖取每天中位數(趨勢圖)。 | 第 4c、7 節 |
| 10 | 離線時資料會不會遺失? | 存在該裝置的 IndexedDB,有網路自動補送,成功才移除。不會遺失的前提:不要清瀏覽器資料/解除安裝。被後端永久拒絕的資料會移出佇列並在畫面回報。離線開啟安裝版 App 尚未實機驗證。 | 第 4d、7 節 |
| 11 | 學生忘記通行碼怎麼辦? | 通行碼只存雜湊,連老師也查不到明碼;老師在名單頁按「重設通行碼」重發(同時解除鎖定)。 | `HANDOVER.md` 第 2 節 |
| 12 | 換學期/新學年怎麼清名單? | 名單頁有匯入、停用,沒有「一鍵清空」;做法:停用畢業生、匯入新名單(已在名簿的只更新姓名)。是否需要整批清除功能待確認。 | `Code.gs` `rosterImport`、`rosterSetStatus` |
| 13 | 想加別的科系怎麼辦? | 名單匯入是班級座號 + 姓名,可直接加入別科學生;若要區分科系統計,需改 Sheet 欄位與程式(目前沒有科系欄位)。樹木範圍固定為官方 861 棵,換學校要改 `scripts/fetch-official-trees.mjs` 內的學校代碼並重抓。 | 第 3 節、`scripts/fetch-official-trees.mjs` |
| 14 | 這些程式是你自己寫的嗎? | 誠實說明:是在 AI(Claude)協助下完成的。我負責需求、方向與取捨、實機測試;AI 協助寫程式、測試與文件;有設計規格、實作計畫、獨立審查與 399 個自動測試。我能說明每個模組做什麼與為什麼這樣設計。 | 第 6 節 |
| 15 | 授權?第三方程式碼? | jsQR 1.4.0 為 Apache-2.0(授權檔在 `public/vendor/jsqr/LICENSE`);Leaflet 1.9.4 為 BSD-2-Clause;qrcode-generator 為 MIT。本專案自身沒有另附授權檔(待確認是否要加)。 | `public/vendor/` |
| 16 | 地圖底圖能用嗎? | 使用內政部國土測繪中心公開圖磚服務;圖上有標註出處。使用條款細節待確認。偶有灰色方塊是官方該處無圖。 | 第 2、8 節 |
| 17 | 學生個資怎麼處理? | 只存班級座號與姓名(老師匯入);公開端點不含個資;定位與相機影像不上傳。離線時通行碼暫存該裝置。個資法遵循細節待學校確認。 | 第 5 節 |
| 18 | 老師帳號怎麼增減? | 管理分頁 → 教師帳號 → 新增/移除(不能移除自己、至少留一位),或直接改 Sheet「教師名單」分頁。新增/移除的真實操作尚未實測。 | 第 7 節、`Code.gs` |
| 19 | 官方樹木資料更新怎麼辦? | 電腦執行 `node scripts/fetch-official-trees.mjs` 重抓快照(會檢查筆數),再升 `CACHE_NAME`、push。官方 API 不開放跨網域,網站無法即時抓。 | `HANDOVER.md` 第 3 節 |
| 20 | 之後誰維護?你畢業後呢? | 建議:GitHub repo 轉給學校帳號、Sheet/Apps Script/OAuth 用校方帳號重建、老師照 `HANDOVER.md` 操作;有自動測試與文件降低交接風險。仍需要有人負責定期確認後端與網址(待學校指派)。 | 第 9 節、`HANDOVER.md` |

---

## 12. 名詞小辭典

| 名詞 | 白話 |
|---|---|
| PWA | 用網頁技術做、但能像 App 一樣安裝到主畫面、能離線的網站 |
| Service Worker | 瀏覽器背景裡的小程式,攔截網路請求,決定用快取還是上網 |
| 快取(cache) | 把檔案先存在手機,下次不用重新下載 |
| 佇列(queue) | 排隊等待處理的清單;這裡指「還沒送出的量測」 |
| IndexedDB | 瀏覽器內建的小型資料庫,離線佇列存在這裡 |
| 靜態網站 | 網頁檔案是現成的、伺服器不用跑程式,只負責把檔案交給瀏覽器 |
| GitHub Pages | GitHub 提供的免費靜態網站託管 |
| Apps Script | Google 的雲端 JavaScript,可綁在試算表上當後端 |
| Web App | Apps Script 部署後得到一個網址,可以接收請求並回應 |
| API | 程式和程式之間講話的約定;這裡指前端呼叫後端網址 |
| JSON | 用文字表示資料的格式,例如 `{"status":"ok"}` |
| CORS | 瀏覽器的安全規則:網頁預設不能隨便呼叫別的網站,需要對方允許 |
| ES module | JavaScript 把每個檔案當一個模組,用 `import`/`export` 互相引用 |
| OAuth 用戶端 ID | 向 Google 註冊「我的網站」得到的代號,用來讓 Google 登入認得我們 |
| ID Token | Google 簽名的登入證明,後端可驗證它沒被偽造 |
| aud / exp | ID Token 內的欄位:給哪個網站用、什麼時候過期 |
| 雜湊(hash) | 把資料變成一串固定長度的「指紋」,無法反推原文 |
| pepper(加鹽) | 只存在後端的秘密字串,混進雜湊讓外人更難破解 |
| 檢查碼 | 通行碼最後一碼,用來抓出打錯字 |
| WMTS / 圖磚 | 地圖被切成許多小方塊圖片,依位置與縮放層級取用 |
| 公式注入 | 在儲存格塞 `=...`,讓試算表當公式執行;所以要在前面加單引號 |
| 冷啟動 | 一段時間沒人用後,雲端服務第一次被呼叫要多花時間啟動 |
| CI / GitHub Actions | 每次推程式就自動跑測試的機制,紅燈代表測試失敗 |
| vitest | JavaScript 的自動測試工具 |
| iframe | 在一個網頁裡嵌入另一個網頁的方式;殼層用它承載各分頁 |
| 純函式 | 相同輸入一定得到相同輸出、不碰畫面的函式,最好測試 |
