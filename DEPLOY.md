# 前端部署說明(GitHub Pages)

> Apps Script 後端的部署另見 `apps-script/README.md`。

## GitHub Pages 設定

| 項目 | 設定值 |
|---|---|
| Source(來源) | Deploy from a branch |
| Branch(分支) | `master` |
| Folder(資料夾) | **`/ (root)`** — 不是 `/public` |

## 為什麼必須用 repo root,不能用 `/public`

- `public/tree.html` 與 `public/sw.js` 都用 `../src/calc.js` 這種相對路徑載入 `src/` 下的模組。
- 若把 `/public` 當成站台根目錄,`../src/...` 會指到站台根目錄之外 → 一律 404,頁面完全沒有送出功能。
- 以 repo root 發佈時,`/public/tree.html` 的 `../src/calc.js` 正確解析成 `/src/calc.js`,`src/` 與 `public/` 維持同層,離線快取清單(`public/sw.js` 的 `CACHE_FILES`)也才抓得到檔案。

## 站台網址與 QRCode

以 repo root 發佈後,量測頁面的網址會是:

```
https://<user>.github.io/<repo>/public/tree.html?treeId=<ID>
```

**QRCode 必須指向上面這個含 `/public/` 的網址**(每棵樹一個 `treeId`)。

## 部署步驟

```bash
cd "C:\NKHS tree map"
git remote add origin <你的 GitHub repo URL>
git push -u origin master
```

1. GitHub repo → Settings → Pages,依上表設定 Branch = `master`、Folder = `/ (root)`。
2. 把 Apps Script Web App URL 填入 `public/tree.html` 的 `PASTE_APPS_SCRIPT_WEB_APP_URL_HERE`。
3. 把 Google OAuth Client ID 填入 `public/tree.html` 的 `PASTE_GOOGLE_OAUTH_CLIENT_ID_HERE`(建立方式見 `apps-script/README.md`),並同步填入 `apps-script/Code.gs` 的同名常數。
4. commit 並 push;兩個佔位字串只要有一個沒填,頁面會顯示「系統尚未設定完成」並停用表單。
5. 每次改動 `public/` 或 `src/` 下被快取的檔案後,記得把 `public/sw.js` 的 `CACHE_NAME` 版本號 +1,舊裝置才會換到新檔案。

## QRCode 標籤產生器

- 網址:`https://jcsk7049.github.io/nkhs-tree-map/public/qrcodes.html`(請從正式網址開啟,產生的 QR 才是正式網址)
- 用「前綴 + 起迄 + 位數」或貼清單輸入樹編號 → 產生標籤 → 列印 / 另存 PDF
- QR 內容為 `<tree.html 網址>?treeId=<編號>`;日後換網域,改頁面上的網址欄位重新列印即可
- 錯誤更正等級用 Q(約可容忍 25% 破損),戶外貼紙建議用防水、耐曬材質並護貝

## 樹木地圖(官方樹號 → QRCode 標籤)

- 網址:`https://jcsk7049.github.io/nkhs-tree-map/public/map.html`
- 資料來源:官方「校園樹木資訊平臺」南港高工 861 棵(樹號、樹種、經緯度),存成靜態快照 `data/nkhs-trees.json`
  - 官方 API 不開放跨網域呼叫,網站無法即時抓,所以用腳本在電腦上抓一次
  - 更新快照:`node scripts/fetch-official-trees.mjs`(會檢查筆數與官方統計一致),再 commit + push
- 地圖操作:點樹看樹號/樹種 → 加入列印清單 / 標記已貼牌;「框選加入清單」點兩個對角;樹種下拉可篩選
- 灰=未貼牌、綠=已貼牌、橘框=在列印清單。**列印清單與貼牌進度只存在該裝置的瀏覽器**,換裝置不會同步
- 「產生 QRCode 標籤」→ 標籤印官方樹號 + 樹種,預設依座標蛇行排序(北到南),貼牌走一圈不必來回跑
- 底圖:內政部國土測繪中心 NLSC 航照(PHOTO2)/電子地圖(EMAP)

## 地圖依樹高著色(量測值回到地圖)

- 地圖「著色」選「樹高」:未量測=灰,<5 / 5–10 / 10–15 / 15–20 / ≥20 m 為藍色由淺到深;點樹可看最新樹高/樹圍/日期/筆數
- 資料來源:Apps Script 的公開摘要 `GET <Web App URL>?action=summary`(**不需登入**、每棵樹只回最新一筆、**不含學生姓名/座號**),5 分鐘快取,新資料寫入時自動清除快取
- 只依官方樹號對應;Sheet 裡對不到官方樹號的資料(如測試用的 `A-023`)不會出現在地圖
- `API_URL` 在 `public/tree.html` 與 `public/map.html` 各有一份,必須相同(`tests/duplication-sync.test.js` 會檢查)
- 更新 `apps-script/Code.gs` 後,**必須在 Apps Script 重新部署新版本**(部署 → 管理部署作業 → 編輯 → 新版本),Web App 才會用新程式

## 歷年趨勢圖(量測頁下方)

- 學生掃 QR 進入 `tree.html?treeId=<官方樹號>`,表單下方會顯示「這棵樹的歷年量測」:樹高、樹圍兩張折線圖 + 最近 5 筆表格
- 資料來源:Apps Script 公開端點 `GET <Web App URL>?action=history&treeId=<樹號>`(**不需登入**、最多最近 200 筆、**不含姓名/座號/紀錄編號**),每棵樹各自快取 5 分鐘,該樹有新量測寫入時自動清除該樹快取
- 每筆量測一個淡色圓點;同一天多筆取**當天中位數**畫折線與實心點(單筆量錯不會拉歪折線)。日期以台灣時間(UTC+8)計
- 送出成功後圖會自動重新載入;離線或載入失敗只在該區顯示一行小字,**不影響填表與離線暫存**
- 圖為手刻 SVG,無外部函式庫;新增的 `src/trend.js`、`src/trendView.js` 已加入離線快取清單,快取版本為 `tree-map-v4`
- 更新 `Code.gs` 後同樣要在 Apps Script **重新部署新版本**

## 登入狀態的沿用規則(`src/session.js`)

- 頁面開啟時,以上次存下的 ID Token **自己的到期時間**(`exp`)判斷,不靠存檔時間:
  - 還有效(且距到期 > 5 分鐘)→ 沿用
  - 已過期 + **線上** → 顯示「登入已過期,請點下方按鈕重新登入」,**表單鎖住**,不假裝還在登入(未上傳的紀錄登入後自動補送)
  - 已過期 + **離線** → 仍沿用,讓學生在死角能填完存進本機佇列(補送時再要求登入)
  - Google 登入元件載不到(離線或校園網路擋住)→ 有存過登入就沿用,至少能填表存本機
