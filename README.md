# 南港高工 校園樹木量測

- 是什麼:掃樹牌 QR → 學生填角度/距離/樹圍 → 存進 Google Sheet → 地圖依樹高著色的手機網頁(PWA)
- 正式網址:https://jcsk7049.github.io/nkhs-tree-map/public/app.html
- 技術:HTML + CSS + JavaScript(無需編譯)、GitHub Pages、Google Apps Script、Google Sheet

## 文件
| 文件 | 內容 |
|---|---|
| [docs/HANDOVER.md](docs/HANDOVER.md) | **交接說明書(接手老師先讀這份)** |
| [DEPLOY.md](DEPLOY.md) | 前端部署與各功能說明 |
| [apps-script/README.md](apps-script/README.md) | 後端部署、安全設計、驗證清單 |
| [docs/WORKLOG.md](docs/WORKLOG.md) | 開發紀錄、踩過的坑 |

## 開發
- `npm install` 安裝測試工具,`npm test` 跑全部自動測試(推上 GitHub 也會自動跑)
