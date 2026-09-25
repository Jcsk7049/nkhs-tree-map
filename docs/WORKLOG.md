# WORKLOG — 南港高工 校園樹木 QRCode 量測系統

最後更新:2026-09-25(學號功能 + 量測核可已推上 GitHub,`cd939c4`)

## 一句話現況
掃樹上 QR → 學生用「班級座號 + 個人通行碼」填量測 → 寫入 Google Sheet → 地圖依樹高著色、單棵有歷年趨勢圖。老師端(Google 登入 + 教師名單)管理學生名單、地圖、QR 標籤。**程式與前端已上線(快取 v18),419 個測試全過、GitHub Actions 綠燈;交接文件包已完成,進入「交給指導老師」階段。**

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
| `public/admin.html` | 老師 | 管理:匯出量測 .xlsx(主)/CSV(次)(可只匯出已量測)、教師帳號新增/移除 |
| `public/scan.html` | 學生 | 相機掃樹牌 QR → 確認樹號樹種 → 進量測;離線可用(內建 jsQR,不上傳影像) |
| `public/app.html` | 全部 | 統一入口(PWA 起點):選身分 + 底部導覽,以 iframe 承載既有頁面(內嵌模式 `embed=1`) |

## 架構重點
- **學生驗證**:通行碼 7 碼(6 隨機+1 檢查碼,30 字元字母表),後端只存 SHA-256(pepper|班級座號|碼);連錯 10 次鎖 5 分鐘(老師重設會解鎖);**姓名由後端依名簿決定**;樹高由後端重算、時間戳由後端校時。
- **老師驗證**:Google ID Token → tokeninfo(aud/exp/email_verified)→ email 在 Sheet「教師名單」分頁(後端自動建立,也可手動建)。
- **公開只讀(不含個資)**:`?action=summary`、`?action=history&treeId=`,5 分鐘快取,寫入時失效。
- **設定單一來源**:`src/config.js`(`API_URL`、`GOOGLE_CLIENT_ID`);測試會檢查沒有頁面自己寫死、且與 `Code.gs` 一致。
- **官方資料**:`data/nkhs-trees.json` 是官方平台快照(861 棵),更新用 `node scripts/fetch-official-trees.mjs`(官方 API 無 CORS,不能即時抓)。
- 純函式在 `src/`,`Code.gs` 用 vm 載入真檔配假 Sheet 測(`tests/codeGs.test.js`)。
- 離線:Service Worker(`public/sw.js`,目前 `tree-map-v18`,安裝時 `cache:'reload'`);`swCacheList.js` 與 `sw.js` 的清單必須一致(有測試守)。

## 交接狀態(2026-09-24)
- 對象:指導老師(模具科,懂一點 Java,非網頁背景);老師已裝好 VS Code。
- 交接包(都在 master、已推上 GitHub):
  - `docs/TECH-OVERVIEW.md`:給學生自己讀懂+口頭報告稿(第 10 節)+老師 20 問(第 11 節)+交接前待辦(第 9 節)
  - `docs/HANDOVER.md`:給老師的操作/修改手冊(4.1 環境安裝、4.2 VS Code 擴充、4.3 不用編譯器/除錯用 F12)
  - `CLAUDE.md` = `AGENTS.md`(逐字相同,測試守):給 Claude Code / Codex 的專案守則
  - `.github/workflows/test.yml`:push master / PR 自動跑測試
- 已實際驗證 clone 流程:全新資料夾 `git clone` → `npm install`(0 漏洞)→ `npm test` 419 全過。
- 演示/交接是否已完成:**未確認**(下個 session 先問使用者)。

## 使用者需要做的(未完成)
- ~~GitHub 加老師為協作者~~(2026-09-25 已完成)、~~HANDOVER 第 1 節 Sheet 網址~~(已填,**推上 GitHub 前確認 Sheet 共用為「限制」**)、~~刪 `_tmp_*.html`~~(已不存在)。
1. 清 Sheet 測試資料(**筆數以 Sheet 實際為準**;週三老師試用的資料也在內,使用者說之後再刪):樹號 `perf-test`(8 筆)、43667 的測試量測、`A-023`、`seed-1~3`、測試學生 10101~10103、111、112(新學號規則下這些舊格式學生已無法從量測頁送出)。
2. 待學校回覆:子連結型態(子網域/路徑/僅連結)、校方 Google 帳號能否讓 Apps Script「任何人可存取」。老師要處理前會通知使用者。**QR 網址定案前不要大量印樹牌。**
3. **後端要重新部署**:2026-09-25 學號功能 + 量測核可都改了 `Code.gs`,需整份貼到 Apps Script → 部署新版本。部署後先在測試 Sheet 實際核可一兩棵樹再交給老師。
4. (可選)Sheet「學生名單」A1 改成「學號」。
5. ~~commit / push~~(2026-09-25 已推 `9a1d5ca`、`cd939c4`;Sheet 共用已確認為「限制」)。

## 2026-09-25 學號功能(功能 1,已完成、已推上)
- 規格 `docs/superpowers/specs/2026-09-25-student-id-design.md`、計畫 `docs/superpowers/plans/2026-09-25-student-id.md`。
- 學號 8 碼 `112|05|0|71` = 入學年|科別|班級(0 忠、1 孝,其他擋)|座號;`src/studentId.js` 的 `parseStudentId`;科別表目前只有 `05=土木科`(其他科別使用者去問老師)。
- 名單頁多「科別班級座號」欄、量測頁即時顯示拆解、前後端都擋格式;內部欄位名 `classNo` 不改(保護離線佇列)。快取 v19,426 測試全過,verifier 9/9 PASS。
- 未實測:名單頁登入後的表格與紙條(需真 Google 登入+部署新後端)。

## 2026-09-25 量測核可(功能 2,已完成、已推上;使用者已部署後端,待完整實測)
- 規格 `docs/superpowers/specs/2026-09-25-approval-design.md`(經三反方抗辯修訂)、計畫 `docs/superpowers/plans/2026-09-25-approval.md`。
- 流程:量測先「待核可」→ 老師端「核可」分頁(`approve.html`,也在 `teacher.html` 有卡片)看樹高/樹圍兩張圓餅(組距可選 0.1/0.5/1 m、1/5/10 cm)→ 預設最多人的組(同票提醒)可改選 → 核可登記該組平均;可撤銷最近一次。
- 資料:「量測紀錄」第 11 欄「核可編號」;新分頁「核可紀錄」(那一列寫入才算核可生效;撤銷只改狀態)。待核可 = 第 11 欄空白或對不到有效核可。同學號同批只算最新一筆。
- 公開 summary 只列已核可的樹 + `pending`;history 每次核可一點(日期為量測日);地圖/選樹頁三態(已核可綠/待核可橘/未量測灰);管理頁新增「完整量測紀錄 .xlsx」(含姓名學號,老師專用)。快取 v20,472 測試全過,最終審查無 Critical,verifier 10/10 PASS。
- 瀏覽器實測(假登入+假後端):清單排序與非官方樹號過濾、同學號去重、同票提醒、改選後「將登記」更新、核可/撤銷送出內容正確、375px 底部 6 鈕不換行不溢出。
- **上線影響**:部署後所有樹先變「待核可」(地圖一片橘、趨勢圖空白),要老師逐棵核可。更新過渡期舊 Service Worker 可能配舊模組:`map.html`、`approve.html` 已改成不依賴新版 `heightColors.js`。
- 未實測:真實 Apps Script 上的核可/撤銷(需部署)、手機真機操作核可頁。
- 名單頁加處理中轉圈動畫(匯入/載入/重設/停用/解鎖時停用按鈕,匯入顯示「匯入中…每位同學約 0.5 秒」)。使用者 2026-09-25 實測新後端:學號格式錯誤有被擋;紙條沒班別是因為前端還沒 push(GitHub Pages 仍是舊版)。
- 延後的小問題(審查 Minor):核可處理中組距下拉/選項仍可操作;手動改壞「核可紀錄」樹高時舊版 App 可能看到 null;無紀錄編號的舊列 key 可能相撞;地圖彈窗日期用 UTC;`apps-script/README.md` 未更新(仍寫班級座號、沒寫核可);已知權限風險:任何教師名單內帳號都能匯出全校個資。

## 2026-09-25 記住我 + 地圖鎖校園(未 commit)
- 量測頁「在這支手機記住我的通行碼」(預設不勾;只有送出成功才存;沒勾就清掉;STUDENT_REJECTED 時自動忘記;「忘記這支手機」按鈕)。`src/rememberCode.js`;CLAUDE.md/AGENTS.md 安全規則補例外。使用者確認學生用自己的手機。
- 地圖(`map.html`、`trees.html`)鎖在校園範圍:官方樹木外框外擴 15%,`setMaxBounds` + `maxBoundsViscosity=1` + 最小縮放。`src/mapBounds.js`(新檔,避免舊快取模組相容問題)。
- 快取 v21,485 測試全過;瀏覽器驗證:記住我自動填入/忘記、縮到校園大小後「－」停用、無 console 錯誤。
- 使用者回報「43667 沒有顏色」:後端 summary 已有核可值 11.65 m;老師地圖預設著色是「貼牌狀態」,需切到「樹高」。
- 2026-09-25 使用者部署新後端後名單頁一度 404:Apps Script 執行紀錄全「已完成」,curl 直打正常,判定為 SW v19→v20 切換期間的暫時現象,重新載入後正常。

## 資安說法(已跟使用者更正)
- 「放在 GitHub/Google 所以安全」是錯的說法:平台可靠 ≠ 程式沒漏洞。
- 已查證:repo 內無任何密鑰;`API_URL`、`GOOGLE_CLIENT_ID` 本來就公開;真正密鑰 `CODE_PEPPER` 只在 Apps Script 指令碼屬性。
- 對老師的建議說法:有做雜湊/鎖定/後端驗證等防護、開發中有自我紅隊審查,**但未經正式資安稽核**;因涉及學生個資,正式上線前請校方資安/教務過目。

## 已驗證 / 未驗證
- 已驗證:259 個單元測試;後端已部署為新版(GET 無 action 回「不認得的請求」);正式網址上登入→送出→寫 Sheet→離線補送→地圖著色→趨勢圖(舊版流程)都實測過;名單頁/學生頁 UI 用假後端在瀏覽器測過;紅隊審查(opus)一輪並修正。
- **2026-09-19 使用者實測通過**:真實 Google 登入進教師端、名單頁貼 3 位測試學生並發通行碼、學生用班級座號+通行碼在 tree.html 送出成功(姓名由後端帶入、樹高後端重算、趨勢圖更新)。
- **未驗證**:錯誤通行碼被擋/連錯鎖定的真實行為、平板真機(校園 WiFi/死角離線)、手機實際掃 QR。
- **2026-09-20 使用者在自己的 Chrome 實測通過(app.html 殼層)**:選「我是老師」→ 名單分頁內 Google 登入成功 → 名單載入 3 位學生;切「地圖」(861 棵、已量測 3)與「QR 標籤」皆正常顯示,各分頁只有一個 iframe、返回連結已隱藏。Service Worker 啟用、快取為 `tree-map-v13`。
- **2026-09-20 使用者 iPhone 真機錄影(Safari 加入主畫面後以獨立 App 開啟)**:加入主畫面成功;學生「樹木」分頁定位可用(藍點+精度圈+最近 5 棵,約 230 公尺=人不在校內);點「量測這棵」帶樹號 43539 進量測頁;老師 Google 登入在 iPhone 獨立 App 內可用(會開 accounts.google.com 視窗後回到頁面);名單頁貼 2 位學生(111、112)匯入成功;地圖、QR 標籤分頁可切換。
  - 錄影中發現的問題:①主畫面圖示是純綠色方塊(無圖樣);②手機上名單表格過擠(「啟用」「王小明」被逐字換行);③QR 標籤頁在手機有橫向溢出;④底部導覽看不到「管理」分頁=手機仍在舊版快取(v15 前),需重開 App 2~3 次才會更新;⑤切到新分頁時,老師閘門會先閃現一張空白的「教師登入」卡片再載入。
  - 修正狀態(快取 v16):①已修(樹圖示,`scripts/make-icons.ps1` 產生);②已修(名單頁 ≤600px 改卡片式);③未處理(使用者未選);④已加提示(`app.html` 出現新版本時顯示「有新版本可用」橫幅,按鈕才重整);⑤已修(閘門初始顯示「載入中…」)。
  - 已安裝舊版的手機需重開 App 2~3 次才會更新到這一版,之後的新版會出現橫幅提示。
  - iPhone 主畫面圖示在加入當下就固定,要看到新圖示需刪除舊圖示後重新加入主畫面。
- **2026-09-20 iPhone 實測 v16(使用者截圖)**:主畫面圖示為綠底白樹「樹木量測」;App 已更新到含「管理」分頁的新版,底部 5 個項目(名單/地圖/QR 標籤/管理/換身分)在手機上完整顯示不被截;管理頁匯出區與教師帳號區版面正常。
- **2026-09-21 掃描分頁(scan.html)電腦瀏覽器實測**:以假相機(canvas 串流,畫面為專案產生的真樹牌 QR)驗證——掃到 43667/43020 顯示「樹號｜樹種」並在殼層內切到量測分頁;非樹牌/不在名單有對應提示;切走分頁、按「換身分」、相機啟動中切走、連點開啟、jsQR 缺失皆不會讓相機殘留。**未驗證**:iPhone 獨立 App 的相機權限與辨識速度、Android、離線開啟、實際印出樹牌的辨識成功率。
- **未驗證(安裝版 App)**:安裝後離線開啟殼層與學生量測頁、Android 安裝。
- **2026-09-20 階段 3 部分實測**:使用者已更新後端;管理頁「教師帳號」區成功載入(顯示自己的信箱與「(你)」),代表 `teacher-list` 在真實 Apps Script 上可用;用假憑證打 `teacher-list/add/remove`、`roster-unlock` 皆回 `AUTH_REJECTED`(新動作存在且需身分),`?action=summary` 與舊動作不受影響。(註:某次首發請求曾回「不認得的請求」,重打 3 次皆正常,判斷為 Apps Script 冷啟動的單次現象。)
- **2026-09-20 使用者在真正的 Excel 實測通過(.xlsx 匯出)**:欄位分成 A~F 六欄、樹號/樹高/樹圍/筆數為數字(靠右對齊)、時間為文字、中文正常、無修復提示(僅有 Windows 對下載檔的「受保護的檢視」橫幅,屬正常)。CSV 版原本在其電腦擠在 A 欄,已改以 .xlsx 為主。
- **未驗證(階段 3)**:`teacher-add/remove`、`roster-unlock`(連錯 10 次鎖定 → 名單頁 🔒 → 解除)的真實操作;4 個分頁+「換身分」在 375px 手機是否過擠。
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
- Excel 匯出(回填官方平台用):**已完成**(`admin.html`,快取升 v15)。
  - 2026-09-20 改版:主為 .xlsx(自寫 `src/xlsx.js`,無外部函式庫,欄位一定分開、數字為數字),CSV 降為次要。
  - 原因:使用者用 Excel 開 CSV 整列擠在 A 欄(Excel 依 Windows 清單分隔符號拆欄)。
- 掃描分頁待真機驗證:iPhone 獨立 App 的相機權限與辨識速度、Android。
- 平板真機測試;手機掃 QR 驗證。
- 教師端:解除單一學生鎖定的按鈕:**已完成**(名單頁);教師名單管理介面:**已完成**(`admin.html`)。
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
- `docs/superpowers/specs/`、`docs/superpowers/plans/`:各階段設計規格與實作計畫。
- `docs/HANDOVER.md`:給接手老師的操作/修改手冊(含環境安裝)。
- `docs/TECH-OVERVIEW.md`:架構與技術總覽、口頭報告稿、老師 20 問。
- `CLAUDE.md` / `AGENTS.md`:給 AI 工具的專案守則(兩份必須相同)。
- `README.md`:GitHub 首頁入口。
