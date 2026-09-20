# WORKLOG — 南港高工 校園樹木 QRCode 量測系統

最後更新:2026-09-19(session 結束時)

## 一句話現況
掃樹上 QR → 學生用「班級座號 + 個人通行碼」填量測 → 寫入 Google Sheet → 地圖依樹高著色、單棵有歷年趨勢圖。老師端(Google 登入 + 教師名單)管理學生名單、地圖、QR 標籤。**程式與前端已上線,259 個測試全過;老師登入與學生通行碼流程已實測通過。**

## 位置
| 項目 | 值 |
|---|---|
| 專案 | `C:\NKHS tree map`(git,`master`) |
| Repo | https://github.com/Jcsk7049/nkhs-tree-map(public) |
| 前端(GitHub Pages,從 repo 根目錄發布) | https://jcsk7049.github.io/nkhs-tree-map/public/ |
| 後端 | Apps Script Web App(網址在 `src/config.js` 的 `API_URL`) |
| 資料庫 | Google Sheet(使用者個人 Gmail 帳號建的測試版) |
| 測試 | `npx vitest run`(PowerShell 遇執行原則問題用 `npx.cmd`) |
| 本機預覽 | `.claude/launch.json` 的 `static-preview`(python http.server :8123) |

## 頁面
| 頁面 | 對象 | 說明 |
|---|---|---|
| `public/tree.html?treeId=<官方樹號>` | 學生 | QR 進入點;班級座號+通行碼;離線暫存;歷年趨勢圖 |
| `public/teacher.html` | 老師 | 教師端總覽(需 Google 登入 + 教師名單) |
| `public/roster.html` | 老師 | 貼名單、發/重設通行碼、停用、列印紙條 |
| `public/map.html` | 老師 | 官方 861 棵樹地圖;樹高著色;框選加入列印清單;貼牌進度 |
| `public/qrcodes.html` | 老師 | 產 QR 標籤(官方樹號+樹種,依座標蛇行排序) |
| `public/index.html` | 全部 | 兩端入口說明 |
| `public/trees.html` | 學生 | 選樹:地圖標色(已量測/未量測)、我的位置、最近 5 棵;定位只在本機使用 |
| `public/app.html` | 全部 | 統一入口(PWA 起點):選身分 + 底部導覽,以 iframe 承載既有頁面(內嵌模式 `embed=1`) |

## 架構重點
- **學生驗證**:通行碼 7 碼(6 隨機+1 檢查碼,30 字元字母表),後端只存 SHA-256(pepper|班級座號|碼);連錯 10 次鎖 5 分鐘(老師重設會解鎖);**姓名由後端依名簿決定**;樹高由後端重算、時間戳由後端校時。
- **老師驗證**:Google ID Token → tokeninfo(aud/exp/email_verified)→ email 在 Sheet「教師名單」分頁(後端自動建立,也可手動建)。
- **公開只讀(不含個資)**:`?action=summary`、`?action=history&treeId=`,5 分鐘快取,寫入時失效。
- **設定單一來源**:`src/config.js`(`API_URL`、`GOOGLE_CLIENT_ID`);測試會檢查沒有頁面自己寫死、且與 `Code.gs` 一致。
- **官方資料**:`data/nkhs-trees.json` 是官方平台快照(861 棵),更新用 `node scripts/fetch-official-trees.mjs`(官方 API 無 CORS,不能即時抓)。
- 純函式在 `src/`,`Code.gs` 用 vm 載入真檔配假 Sheet 測(`tests/codeGs.test.js`)。
- 離線:Service Worker(`public/sw.js`,目前 `tree-map-v14`,安裝時 `cache:'reload'`);`swCacheList.js` 與 `sw.js` 的清單必須一致(有測試守)。

## 使用者需要做的(未完成)
1. Sheet 加分頁 **`教師名單`**(A1 標題「教師 Google 信箱」,A2 填登入用 Gmail)。後端只有收到有效 Google 登入才會自動建,所以尚未出現是正常的。
2. 開 `teacher.html`(重新整理 2~3 次換新版)→ Google 登入 → 進教師端。
3. 名單頁貼 2~3 位測試學生 → 列印紙條 → 用通行碼在 `tree.html?treeId=43667` 試送一筆。
4. 依 `apps-script/README.md`「驗證清單」逐項跑真實環境檢查。
5. 手動刪除 `public/_tmp_roster.html`、`public/_tmp_tree.html`(我造的臨時測試頁;沒有刪除權限。已 `.gitignore`,不會被提交/部署)。

## 已驗證 / 未驗證
- 已驗證:259 個單元測試;後端已部署為新版(GET 無 action 回「不認得的請求」);正式網址上登入→送出→寫 Sheet→離線補送→地圖著色→趨勢圖(舊版流程)都實測過;名單頁/學生頁 UI 用假後端在瀏覽器測過;紅隊審查(opus)一輪並修正。
- **2026-09-19 使用者實測通過**:真實 Google 登入進教師端、名單頁貼 3 位測試學生並發通行碼、學生用班級座號+通行碼在 tree.html 送出成功(姓名由後端帶入、樹高後端重算、趨勢圖更新)。
- **未驗證**:錯誤通行碼被擋/連錯鎖定的真實行為、平板真機(校園 WiFi/死角離線)、手機實際掃 QR。
- **2026-09-20 使用者在自己的 Chrome 實測通過(app.html 殼層)**:選「我是老師」→ 名單分頁內 Google 登入成功 → 名單載入 3 位學生;切「地圖」(861 棵、已量測 3)與「QR 標籤」皆正常顯示,各分頁只有一個 iframe、返回連結已隱藏。Service Worker 啟用、快取為 `tree-map-v13`。
- **未驗證(安裝版 App)**:真機安裝(Android/iOS 加入主畫面)、安裝後離線開啟殼層與學生量測頁、殼層內的學生模式(`#/student/measure?treeId=…`)。
- 已知取捨(已寫進 README):任何人可故意輸錯把某學生鎖 5 分鐘(老師重設可解);離線暫存的通行碼會留在該平板 IndexedDB 直到同步成功。

## 交接給學校前必做
- 用**校方帳號**重建 Sheet / Apps Script / OAuth 用戶端 ID 並部署(目前是個人 Gmail 測試版)。
- 新「教師名單」填校方老師信箱;刪測試資料(樹號 `A-023`、`seed-1~3`、測試學生)。
- 更新 `src/config.js` 兩個值(並確保 `Code.gs` 的 `GOOGLE_CLIENT_ID` 相同),升 `public/sw.js` 的 `CACHE_NAME`。
- OAuth「已授權的 JavaScript 來源」要包含正式網域。

## 待辦 / 下一步候選
- 學生免掃 QR 選樹(階段 2):**已完成**(`trees.html` + 殼層「樹木」分頁,快取升 v14)。
  - 2026-09-20 使用者在桌機 Chrome 實測通過:點 43667 出現彈窗(樹種、最新樹高 2.34 公尺、「量測這棵」)、已量測標綠;按「我的位置」出現藍點與精度圈、列出最近 5 棵(桌機為網路定位,距離約 210 公尺屬預期)。地圖偶有一塊灰色方塊=國土測繪中心該處圖磚無資料,非本系統問題。
  - 尚未實機驗證:手機/平板真機定位權限(含 iOS 加入主畫面)與樹旁實際準確度
  - 2026-09-20 內建瀏覽器實測(正式網站 v14):`#/student` 預設「樹木」分頁、地圖畫布已繪出;改上層 hash 至 `#/student/measure?treeId=43667` 後量測頁載入「樹木量測登記 — 43667」、分頁高亮切到「量測」;切回「樹木」時地圖 iframe 與 canvas 為同一元素(未重載)。**未實測**:真的點擊地圖上的樹(程式難以點到單棵)、定位、標色(已量測=綠)。
- Excel 匯出(回填官方平台用)。
- 平板真機測試;手機掃 QR 驗證。
- 教師端:解除單一學生鎖定的按鈕(目前靠「重設通行碼」)、教師名單管理介面(目前手動編輯 Sheet)。
- 通行碼加長到 8 碼(紅隊建議,拿到 Sheet+pepper 時離線破解成本較低)。

## 踩過的坑(下個 session 請注意)
- **Service Worker 快取優先**:改了被快取的檔案一定要升 `CACHE_NAME` 並讓 `swCacheList.js` 同步;使用者第一次開新版要多重新整理 2~3 次。本機預覽舊 SW 會餵舊模組,測前先 unregister + 清 caches。
- **官方樹木快照被快取**:`../data/nkhs-trees.json` 現為 cache-first;用 `scripts/fetch-official-trees.mjs` 更新快照後必須升 `CACHE_NAME`,否則已安裝的用戶端會一直用舊樹清單。
- **Apps Script 更新流程**:改 `Code.gs` 後要在編輯器整份貼上並「新版本」重新部署,網址才會用新程式。GitHub Pages 前端 push 後約 1 分鐘生效,若後端沒同步部署,學生會送不出去。
- 瀏覽器預覽面板無尺寸時用 `resize_window` 設定;`location.reload()` 會切斷回傳值。
- Bash 含 `rm`/PowerShell `Remove-Item` 會被權限系統拒絕;`.gitignore` 是可行替代。
- 使用者姓名欄曾誤填樹種名(測試資料),Sheet 有假資料列,交接前清掉。
- session 中途碰過 usage limit,子代理(red-team)被中斷後用 SendMessage 續跑成功。

## 文件索引
- `DEPLOY.md`:部署與各功能說明(兩端架構、地圖、趨勢圖、QR 產生)。
- `apps-script/README.md`:後端設定、安全設計、回應代碼、真實環境驗證清單、交接清單。
- `docs/superpowers/specs/`、`docs/superpowers/plans/`:早期設計規格與 MVP 計畫。
