# 學生免掃 QR 選樹(階段 2)— 設計

日期:2026-09-20 ｜ 狀態:使用者已同意(對話中)｜ 上層:`2026-09-20-installable-app-design.md`

## 目標
學生在 App 內不掃 QR,也能從地圖或「離我最近」找到樹、進入量測。

## 決定(對話中已確認)
| 項目 | 決定 |
|---|---|
| 選樹方式 | 地圖點選 + 「我的位置」(定位失敗退回一般地圖) |
| 地圖標色 | 已量測=綠、尚未量測=灰(用公開摘要 API;載入失敗仍可用) |
| 附近清單 | 定位成功後列出離我最近 5 棵(樹號、樹種、距離) |
| 隱私 | 定位只在本機排序與標點,**不上傳、不儲存** |
| 離線 | 選樹地圖需要網路(底圖圖磚);離線顯示「請直接掃 QR 量測」 |
| 不做 | 「我的紀錄」分頁、樹號/樹種搜尋清單(之後再議) |

## 設計
- **新頁 `public/trees.html`**(學生用、免登入):Leaflet 航照圖 + 861 棵樹(`data/nkhs-trees.json`)以 `circleMarker` 畫出;點樹出現 popup(樹號、樹種、最新樹高若有)與「量測這棵」。
- **選樹動作**:內嵌(`embed=1` 且 `window.top !== window`)時 `window.top.location.hash = buildHash('student','measure',{treeId})`;否則 `location.href = './tree.html?treeId=…'`。與階段 1 地圖→QR 標籤的做法一致。
- **我的位置**:`navigator.geolocation.getCurrentPosition`(高精度、逾時 15 秒);成功→藍點+精度圓、縮放到 19、顯示最近 5 棵;失敗依錯誤碼顯示原因(拒絕/無法取得/逾時),地圖照常可用;固定提示「樹冠下定位可能偏差 10~30 公尺,請核對樹種」。
- **純函式 `src/nearby.js`**:`distanceMeters`(haversine)、`nearestTrees(trees, pos, n)`、`formatDistance(m)`。
- **殼層**:學生分頁改為 `樹木`(預設)、`量測`;`量測` 未選樹時 placeholder 引導回「樹木」並附按鈕;QR 掃碼路徑(`tree.html?treeId=…`、`#/student/measure?treeId=…`)不變。
- **快取**:`trees.html`、`nearby.js`、`heightColors.js`、Leaflet(js/css/圖示)、`nkhs-trees.json` 納入離線快取,離線至少能開啟頁面並顯示提示;快取升 v14。

## 不變
後端、通行碼、鎖定、教師端、已印 QR、`tree.html` 本身。

## 風險
- GPS 在校園樓間/樹下不準 → 提示語 + 仍可手動點選。
- iOS Safari 定位需 HTTPS 與使用者手勢(GitHub Pages 為 HTTPS;按鈕觸發)。
- 861 個 marker 在低階手機:沿用 `preferCanvas: true`(與教師地圖相同)。

## 測試
- 單元:距離/最近 N 棵/格式化、殼層分頁與路由、快取清單與檔案存在。
- 實機(使用者 Chrome):樹木分頁載入、點樹→量測分頁帶樹號;定位(桌機 Chrome 可模擬或允許)。
