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
