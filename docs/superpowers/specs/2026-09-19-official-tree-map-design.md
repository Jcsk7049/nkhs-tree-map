# 官方樹木地圖 + QRCode 標籤對應 — 設計規格

日期:2026-09-19

## 目標
- 把官方 edutreemap 已有的南港高工 861 棵樹(樹號、樹種、經緯度)放到自己的地圖上
- QRCode 內容 = 官方樹號,標籤印樹號+樹種,QR 對應到地圖上實際那棵樹

## 查證事實(2026-09-19)
- 官方 API 無 CORS 標頭 → 網站不能即時呼叫,改用靜態快照
- `Map/GetMapIndex` 取學校代碼(市立南港高工 = `393401`)
- `Map/GetPointGroup?n&w&s&e` 回經緯度範圍內的樹點:`{no, n(樹種代碼), s(學校代碼), x(經度), y(緯度)}`,需以 `s` 過濾學校
- `Book/GetBookIndex` 的 `treeList` 有 `tree_id`(=樹種代碼)→`tree_name`
- NLSC 航照圖磚 `wmts.nlsc.gov.tw/.../PHOTO2/...` 允許跨網域

## 元件
1. `scripts/fetch-official-trees.mjs` — 抓官方資料 → `data/nkhs-trees.json`
2. `src/treeData.js` — 純函式:normalizeTrees、treesInBounds、filterBySpecies、speciesSummary、sortForWalking
3. `public/map.html` — Leaflet + NLSC 航照;樹點(灰=未貼牌/綠=已貼牌);點樹 popup;樹種篩選;兩點框選加入列印清單;已貼牌進度存 localStorage
4. `public/qrcodes.html` — 讀取列印清單;標籤加印樹種;依座標蛇行排序

## 不做
- 自己新增地圖上不存在的樹、跨裝置同步貼牌進度、量測值回寫地圖
