# 量測核可(圓餅統計 + 老師核可)— 設計規格

日期:2026-09-25 狀態:抗辯審查後修訂,待使用者確認
前置:學號功能(`2026-09-25-student-id-design.md`,已完成)

## 目標
同一棵樹會有多位學生(一個年級兩班)量測,難免有人量錯。系統把「上次核可後」的量測分組畫成圓餅圖(樹高、樹圍各一張),預設選最多人的組,老師確認後以「該組平均」登記;**只有核可過的值**會出現在趨勢圖、地圖、選樹頁、每棵樹 Excel 匯出。

## 使用者決定(brainstorming 定案)
| 項目 | 決定 |
|---|---|
| 分組 | 老師在頁面選組距:樹高 0.1 / 0.5 / 1 m(預設 0.5);樹圍 1 / 5 / 10 cm(預設 5) |
| 登記值 | 被選組的平均 |
| 樹圍 | 與樹高各自一張圓餅、各自選組;一次核可同時送出兩者 |
| 一批 | 該樹所有「待核可」的有效量測(上次核可之後進來的) |
| 入口 | 老師端新增「核可」分頁 |
| 其他顯示 | 地圖/選樹頁/每棵樹 Excel 一律用核可值;未核可顯示「待核可」 |
| 選組 | 預設最多人;同票選數值較小的組並警示;老師可改選任何有資料的組 |
| 撤銷 | 每棵樹可撤銷「最近一次有效核可」(撤銷後那批回到待核可,可能與之後的量測併成一批——已知取捨) |
| 附帶 | 完整量測紀錄 Excel(學號拆入學年/科別/班級/座號),老師專用 |

## 資料(Google Sheet)
**「量測紀錄」** 第 11 欄「核可編號」。學生寫入仍只寫 1–10 欄。
- **待核可** = 有效量測(`parseMeasurementRow` 不為 null)且第 11 欄「空白,或對不到任何狀態為『有效』的核可編號」。
- 核可時(鎖內)若 `getMaxColumns() < 11` 先 `insertColumnsAfter(10, 1)`;每次核可都寫一次標題 `核可編號`。
- 只寫受影響的列,寫前逐列確認第 10 欄(用戶端紀錄編號)與讀取時相同,不同就中止回 `BATCH_CHANGED`。

**「核可紀錄」**(只在核可時於鎖內建立),13 欄:
`核可編號 | 樹號 | 量測日 | 核可時間 | 核可老師 | 樹高 | 樹高組別 | 樹高人數 | 樹圍 | 樹圍組別 | 樹圍人數 | 狀態 | 撤銷時間`
- 核可編號 `Utilities.getUuid()`;狀態 `有效`/`已撤銷`;組別文字如 `12.0–12.5 m`;撤銷時間之外撤銷老師併入狀態文字不另開欄(`已撤銷 by x@y`)。
- 文字欄經 `sanitizeCellText`,整列先設 `'@'` 純文字格式(時間存 ISO 字串,讀回時 `Date` 也轉 ISO)。
- **這一列寫入 = 核可生效(commit point)**。寫入順序:先標記第 11 欄,最後寫核可紀錄。中途失敗 → 第 11 欄的編號對不到有效核可 → 那批自動仍是待核可,不會消失、不會重複。
- **撤銷 = 只把狀態改為已撤銷**(一次寫入即生效);第 11 欄不清,因為對不到有效核可就自動回到待核可。

## 分組與平均(前後端共用規則,逐字對應)
- 整數單位:樹高 `u = Math.round(h * 100)`(公分);樹圍 `u = Math.round(g * 10)`(公釐)。
- 組距以同單位整數傳遞與比對:樹高 `10 | 50 | 100`、樹圍 `10 | 50 | 100`(API 也用這些整數)。
- 組別 `k = Math.floor(u / w)`;範圍 `[k·w, (k+1)·w)`。
- 平均:`Math.round(sum(u) / n) / 100`(樹高 m)、`/ 10`(樹圍 cm)。
- **每位學生只算最新一筆**:同一批內同學號取量測時間最新者(其餘仍屬本批、仍被標記)。「人數」即去重後筆數。
- 預設組:人數最多;同票取 `k` 最小並 `tie: true`。樹圍全空 → 無樹圍組。
- 前端 `src/approval.js` 的 `groupValues`、後端 `Code.gs` 的同名函式;`tests/approval.test.js` 與 `tests/codeGs.test.js` 跑同一組案例(12.3 m/0.1、12.5 m/0.5、85.0 cm/5、[10, 10.01] 平均=10.01)。

## 後端 API
老師動作(POST,需 ID Token + 教師名單;加進 `handleTeacherAction`):
| action | 輸入 | 回傳 |
|---|---|---|
| `approval-batch` | `treeId` | `{ treeId, records: [{ key, classNo, at, height, girth }], last: null \| { id, at, height, girth } }` |
| `approval-approve` | `treeId, keys[], heightWidth, heightK, girthWidth, girthK` | `{ status:'ok', id, height, girth, heightN, girthN }` |
| `approval-undo` | `treeId, id` | `{ status:'ok', id }`(已撤銷過 → `duplicate: true`) |
| `records-export` | — | `{ rows: [{ treeId, at, name, classNo, height, girth, approved }] }` |

- `key` = `clientRecordId|height|girth`(不含個資,可重現);`keys` 是老師畫面看到的整批。
- `approval-approve`(ScriptLock 內):重讀該樹待核可列,key 集合與 `keys` 不同 → `code: 'BATCH_CHANGED'`;`heightWidth/girthWidth` 非允許整數、`heightK/girthK` 非整數、選的組沒資料 → `VALIDATION_FAILED`;樹圍全空時 `girthK` 須為 `null`。平均由後端重算,寫入前檢查為有限正數。
- `approval-undo`(ScriptLock 內):`id` 必須是該樹「最新有效」核可,否則 `BATCH_CHANGED`;已撤銷 → ok+duplicate。
- 參數型別一律 `Number.isInteger` 驗證;所有以樹號/組別為鍵的 map 用 `Object.create(null)`。
- 核可/撤銷後呼叫既有 `invalidateCachesFor(treeId)`。

公開 GET(不含個資;只用 `getSheetByName`,分頁不存在視為空;快取鍵改 `-v2`):
- `summary`:`trees: [{ no, height, girth, at, n }]` **只含有有效核可的樹**(舊版 App 相容:height 永遠是數字);新增 `pending: [{ no, count }]`(待核可筆數>0 的樹)。`at` = 該次核可的量測日,`n` = 樹高人數。
- `history`:`points: [{ at, height, girth, n }]`,每筆有效核可一點,依量測日排序。
- 輸出物件逐欄組成(白名單),測試斷言不含 `@`、姓名、學號。

**量測日**:被選樹高組內最新一筆量測的時間(不是核可時間),讓趨勢圖與官方回填日期反映實際量測。
**「最新」的兩種定義**:summary 的「最新核可值」依**量測日**取最大(晚到的舊資料被核可後不會蓋過較新的值);撤銷的「最近一次」依**核可時間**取最大(撤的是剛按下的那次)。

## 前端
| 檔案 | 變更 |
|---|---|
| `src/approval.js`(新) | 只匯出 `groupValues(records, { field, scale, width })` → `{ groups: [{ k, label, count, mean, latestAt }], defaultK, tie }`(含每人最新一筆去重)。純函式 |
| `public/approve.html`(新) | 讀公開 `summary.pending`,只列官方樹號(`data/nkhs-trees.json`),依筆數多→少;非官方樹號只顯示「另有 N 個非官方樹號未列出」。單棵:本批量測日期範圍、兩張 CSS `conic-gradient` 圓餅 + 組別 radio 清單(文字含人數與平均)+ 組距下拉 + 「將登記」摘要 + 核可(confirm)+ 上次核可與撤銷(confirm,帶 id)。`BATCH_CHANGED` 時提示並重新載入。全部 `textContent` |
| `src/appShell.js` | `TEACHER_TABS` 在「QR 標籤」與「管理」之間加「核可」→ `approve.html` |
| `src/heightColors.js` | 新增 `PENDING_COLOR = '#f57c00'`;`matchSummary` 另接收 `pending` 回傳 `pendingByNo` |
| `public/map.html` | 無核可但有待核可 → 橘色;圖例加「待核可」;彈窗「核可樹高 X m(量測日,N 人平均)」+「另有 P 筆待核可」 |
| `public/trees.html` | 三態:已核可(綠)/待核可(橘)/未量測(灰);說明文字同上 |
| `src/trendView.js`(+`src/trend.js` 視需要) | 每點=一次核可,折線連點;表格欄「量測日/樹高/樹圍/採用人數」;無點時「這棵樹還沒有老師核可的量測」 |
| `public/tree.html` | 送出成功訊息加「老師核可後會出現在歷年趨勢圖」 |
| `src/exportCsv.js` | 每棵樹匯出標題「最新樹高(m)」→「核可樹高(m)」、「量測時間(台灣)」→「量測日(台灣)」、「量測筆數」→「採用人數」。新增 `buildRecordsXlsx(rows)`:樹號、量測時間(台灣)、姓名、學號、入學年、科別、班級、座號、樹高、樹圍、核可狀態 |
| `public/admin.html` | 匯出區新增「下載完整量測紀錄 (.xlsx)」 |
| `src/swCacheList.js`、`public/sw.js` | 學生頁相關檔案變動 → `CACHE_NAME` +1;`approve.html` 不加入快取(比照 `roster.html`) |

## 錯誤與邊界
- 老師看頁面時有新量測/別的老師先核可/手動改 Sheet → key 集合不同 → `BATCH_CHANGED`,重新載入。
- 離線晚到的量測 → 待核可 → 進下一批;核可頁顯示本批日期範圍讓老師看出跨期。
- 寫入中途失敗 → 核可紀錄未寫 → 等於沒核可,重試即可。
- 待核可只有 1 筆也可核可(畫面顯示人數)。
- 舊版 App 讀新 summary:待核可的樹不在 `trees` 裡 → 顯示未量測,不會出現 null。

## 已知風險(告知使用者)
- `records-export` 含全校姓名+學號;任何教師名單內帳號都能取得,而教師名單可由任一老師新增。沿用既有權限模型,**不在本次處理**。
- 上線瞬間沒有任何核可 → 地圖/選樹頁顯示「待核可」、趨勢圖空白,直到老師逐棵核可;既有的少量正式量測若跨很久,第一次核可會併成一點。
- `Code.gs` 需人工貼上並部署新版本;前後端不同步時舊後端回「不認得的動作」。

## 測試(先紅後綠)
1. `tests/approval.test.js`:`groupValues` 浮點邊界、平均整數算法([10, 10.01]→10.01)、每人最新一筆去重、同票取小+`tie`、樹圍全空。
2. `tests/codeGs.test.js`:同一組分組案例跑 Code.gs 版;`approval-batch`/`approve`(平均重算、全批標記含離群值、key 不符→`BATCH_CHANGED`、非法組距/非整數/空組→`VALIDATION_FAILED`、寫核可紀錄前失敗→仍待核可、第 11 欄不存在時自動補欄)/`undo`(需 id、非最新→`BATCH_CHANGED`、重複→duplicate、撤銷後回待核可)/`records-export` 需教師身分;`summary` 只含有效核可+`pending`、`history` 用量測日;公開回應不含 `@`/姓名/學號;公開 GET 不建立分頁;樹號 `-1`、`=A1` 在兩分頁 join 正確。
3. 既有 appShell 測試:老師分頁含「核可」。
4. `tests/exportCsv.test.js`:新標題、`buildRecordsXlsx` 欄位與學號拆欄。
5. `tests/heightColors.test.js`:`matchSummary` 的 `pendingByNo`。
6. 瀏覽器實測:核可頁同票警示與改選(假資料)、375px 底部 6 個按鈕不溢出。
