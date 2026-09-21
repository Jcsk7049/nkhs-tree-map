# 給 AI 工具的專案規則(南港高工 校園樹木量測)

> 本檔與 `AGENTS.md` 內容完全相同(Claude Code 讀 `CLAUDE.md`、Codex 讀 `AGENTS.md`);兩份要一起改,有測試檢查。

## 專案是什麼
- 掃樹牌 QR → 學生填角度/距離/樹圍 → 存進 Google Sheet → 地圖依樹高著色的手機網頁(PWA)
- 純 HTML + CSS + JavaScript(無 build 步驟),前端在 GitHub Pages,後端是 Google Apps Script(`apps-script/Code.gs`)

## 先讀這些
- `docs/HANDOVER.md`:交接說明書(想改什麼 → 改哪裡、上線流程、常見的坑)
- `docs/TECH-OVERVIEW.md`:架構與技術總覽
- `docs/WORKLOG.md`:開發紀錄與踩過的坑

## 使用者是誰
- 模具科老師,懂一點 Java,網頁開發經驗很少
- 用白話繁體中文說明;每次只走一小步;先說「要改哪個檔、為什麼」
- 有風險的動作(刪檔、改網址、動後端、推上 GitHub)先問再做

## 規則:測試
- 收工前跑 `npm test`(PowerShell 遇執行原則問題用 `npx.cmd vitest run`),並回報真實輸出
- 不可為了讓測試通過而弱化或刪除測試;測試失敗就修程式或說明原因

## 規則:離線快取
- 改了 `src/swCacheList.js` 列出的任何檔案,就要把 `public/sw.js` 的 `CACHE_NAME` 版本號 +1
- `src/swCacheList.js` 與 `public/sw.js` 內的 `CACHE_FILES` 必須逐字一致(`tests/duplication-sync.test.js` 會檢查)

## 規則:不要動的東西
- 不要編輯 `public/vendor/*`(第三方套件:Leaflet、jsQR、qrcode-generator,授權 Apache-2.0/MIT/BSD)
- 不要新增 npm 套件(dependency),要加先問
- QR 標籤網址(`public/qrcodes.html` 的預設網址)已印在樹牌上,更改網址前必須警告使用者「舊樹牌會作廢」

## 規則:後端與設定
- 改了 `apps-script/Code.gs` **不會自動上線**:要人工貼到 Apps Script、部署新版本;完成後一定要提醒使用者
- `src/config.js` 與 `apps-script/Code.gs` 的 `GOOGLE_CLIENT_ID` 必須完全一致
- 頁面一律從 `src/config.js` 匯入 `API_URL`,不要寫死網址
- Google Sheet 裡是真實資料:未經詢問,不要用腳本寫入正式後端

## 規則:安全與隱私
- 學生通行碼只存雜湊值:不要記錄(log)、顯示或提交任何密鑰或通行碼
- 定位與相機資料只留在本機,不上傳
- 不要對不可信文字使用 `innerHTML`,改用 `textContent`

## 規則:Git
- 只有使用者要求時才 commit / push;commit 小而清楚,訊息說明「為什麼」
- 不要執行破壞性 git 指令(`reset --hard`、`push --force`、`clean -f`、`checkout --` 等)
- 不要順手改檔案排版或格式化整個檔案,改動範圍越小越好
