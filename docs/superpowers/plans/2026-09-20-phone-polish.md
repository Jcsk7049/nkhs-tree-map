# 手機體驗修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正使用者 iPhone 真機錄影發現的 4 個問題:①主畫面圖示是純綠方塊 ②名單表格在手機過擠 ③已安裝的 App 不會提示有新版 ④切分頁時老師閘門先閃一張空白「教師登入」卡片。

**Architecture:** ①用使用者提供的樹圖(`scripts/icon-source.png`,透明背景黑線)以 PowerShell/System.Drawing 產生 180/192/512 圖示(綠底 `#2e7d32`、白色樹),並留下可重跑的腳本;②`roster.html` 加窄螢幕(≤600px)卡片式版面;③`app.html` 偵測新的 Service Worker 接手時顯示「有新版本」橫幅,**由使用者按下才重整**(不自動重整,避免學生填到一半被重整而遺失);④各老師頁閘門的初始文字改為「載入中…」,`teacherGate.js` 在進入登入流程時把它換成登入提示。

**Tech Stack:** 原生 ES module、CSS、Service Worker、PowerShell(System.Drawing)、vitest。無新增相依。

## Global Constraints

- 不動後端 `apps-script/`;不改學生流程、通行碼、鎖定、教師驗證邏輯(`teacherGate.js` 只改「初始/登入提示文字」的處理,不改驗證流程)。
- 被快取檔案改動(`app.html`、圖示)→ `CACHE_NAME` 升 `tree-map-v16`(`public/sw.js`、`DEPLOY.md`、`docs/WORKLOG.md` 的「目前版本」敘述同步;**不改**歷史實測紀錄);`src/swCacheList.js` 與 `public/sw.js` 的 `CACHE_FILES` 維持逐字一致。
- `manifest.json` 圖示尺寸與檔案必須維持 192x192 與 512x512(`tests/manifest.test.js` 會驗 PNG 實際尺寸),`icon-180.png` 必須是 180x180。
- 介面文字繁體中文;主題色 `#2e7d32`。
- 橫幅不可自動重整頁面;只在「原本已有 Service Worker 控制頁面」時才顯示(第一次安裝不顯示)。
- 測試 `npx vitest run`,結束前全綠。commit 訊息結尾**必須**是:`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`(不得換成執行者自己的模型名)。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `scripts/icon-source.png` | 已存在(控制者放入) | 使用者提供的樹圖原檔(512x512,透明背景、黑色線條) |
| `scripts/make-icons.ps1` | Create | 產生 `public/icon-180/192/512.png` |
| `public/icon-180.png` `icon-192.png` `icon-512.png` | Modify(重新產生) | 綠底白樹 |
| `public/roster.html` | Modify | 窄螢幕卡片版面 |
| `public/app.html` | Modify | 「有新版本」橫幅 |
| `src/teacherGate.js` | Modify | 登入流程把「載入中…」換成登入提示 |
| `public/teacher.html` `roster.html` `map.html` `qrcodes.html` `admin.html` | Modify | 閘門初始文字「載入中…」 |
| `tests/phonePolish.test.js` | Create | 原始碼層級檢查(四項) |
| `public/sw.js` `DEPLOY.md` `docs/WORKLOG.md` | Modify | 快取 v16 與說明 |

---

### Task 1: 四項手機體驗修正

**Files:** 如上表。

- [ ] **Step 1: Write the failing tests** — 建立 `tests/phonePolish.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pngSize = (p) => {
  const b = readFileSync(new URL(`../${p}`, import.meta.url));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('①圖示:三個尺寸正確,且不再是純色方塊', () => {
  for (const [file, size] of [['public/icon-180.png', 180], ['public/icon-192.png', 192], ['public/icon-512.png', 512]]) {
    it(`${file} 是 ${size}x${size}`, () => {
      expect(pngSize(file)).toEqual([size, size]);
    });
  }
  it('圖示檔不是單色(壓縮後大小遠大於純色方塊)且產生腳本與來源圖存在', () => {
    expect(readFileSync(new URL('../public/icon-512.png', import.meta.url)).length).toBeGreaterThan(3000);
    expect(readFileSync(new URL('../scripts/make-icons.ps1', import.meta.url), 'utf8')).toContain('icon-source.png');
    expect(pngSize('scripts/icon-source.png')).toEqual([512, 512]);
  });
});

describe('②名單頁窄螢幕版面', () => {
  const html = read('public/roster.html');
  it('有 ≤600px 的媒體查詢,且座號/姓名/狀態不逐字換行(nowrap)', () => {
    expect(html).toMatch(/@media\s*\(max-width:\s*600px\)/);
    expect(html).toMatch(/white-space:\s*nowrap/);
  });
});

describe('③新版本提示橫幅', () => {
  const html = read('public/app.html');
  it('偵測 controllerchange,只在原本已有控制者時顯示,由使用者按鈕才重整', () => {
    expect(html).toMatch(/controllerchange/);
    expect(html).toMatch(/serviceWorker\.controller/);
    expect(html).toContain('有新版本');
    expect(html).toMatch(/id="update-banner"/);
    expect(html).toMatch(/id="update-reload"/);
  });
  it('不會自動重整:location.reload 只出現在按鈕的點擊處理內', () => {
    const matches = [...html.matchAll(/location\.reload\(/g)];
    expect(matches).toHaveLength(1);
    const at = html.indexOf('location.reload(');
    const before = html.slice(Math.max(0, at - 300), at);
    expect(before).toMatch(/update-reload|addEventListener\('click'/);
  });
});

describe('④老師閘門不再閃現空白卡片', () => {
  const pages = ['teacher.html', 'roster.html', 'map.html', 'qrcodes.html', 'admin.html'];
  for (const page of pages) {
    it(`${page} 的閘門初始文字是「載入中…」`, () => {
      expect(read(`public/${page}`)).toMatch(/<p id="gate-status">載入中…<\/p>/);
    });
  }
  it('teacherGate 進入登入流程時會把「載入中…」換成登入提示', () => {
    const js = read('src/teacherGate.js');
    expect(js).toContain('載入中…');
    expect(js).toContain('請用教師的 Google 帳號登入。');
  });
});

describe('快取版本', () => {
  it('sw.js 為 v16,且 CACHE_FILES 未變動內容以外的結構', () => {
    expect(read('public/sw.js')).toMatch(/CACHE_NAME = 'tree-map-v16'/);
  });
});
```

Run: `npx vitest run tests/phonePolish.test.js` → 預期多項 FAIL。記錄失敗輸出。

- [ ] **Step 2: ① 產生圖示** — 建立 `scripts/make-icons.ps1`(PowerShell 5.1,System.Drawing;只用 `scripts/icon-source.png` 的 **alpha 通道當形狀**,輸出白色樹):

```powershell
# 產生 PWA/主畫面圖示:綠底(#2e7d32)+ 白色樹。來源圖 scripts/icon-source.png 為透明背景的黑色線條,以 alpha 當形狀。
# 用法(專案根目錄):  powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root 'scripts\icon-source.png'
$green = [System.Drawing.Color]::FromArgb(255, 0x2e, 0x7d, 0x32)

$src = New-Object System.Drawing.Bitmap $srcPath
# 先把來源轉成「白色 + 原 alpha」
$white = New-Object System.Drawing.Bitmap $src.Width, $src.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $src.Height; $y++) {
  for ($x = 0; $x -lt $src.Width; $x++) {
    $a = $src.GetPixel($x, $y).A
    $white.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, 255, 255, 255))
  }
}

foreach ($n in 180, 192, 512) {
  $bmp = New-Object System.Drawing.Bitmap $n, $n, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear($green)
  $size = [int]($n * 0.62)          # 樹佔 62%,落在 maskable 安全區(80%)內
  $off = [int](($n - $size) / 2)
  $g.DrawImage($white, $off, $off, $size, $size)
  $g.Dispose()
  $out = Join-Path $root "public\icon-$n.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "wrote $out"
}
$white.Dispose(); $src.Dispose()
```
執行該腳本產生三個 PNG。執行後用一次性命令驗證(結果寫進報告,不提交):四角像素為綠 `(46,125,50)`、中心附近有白色像素;並在報告中附上你對 `icon-512.png` 的目視/像素檢查結論(例如統計白色像素占比,合理範圍約 3%~15%)。**不要**修改 `manifest.json`、不要新增其他圖示。

- [ ] **Step 3: ② `public/roster.html` 窄螢幕版面** — 先完整讀 `roster.html` 的表格結構(`<table>`、`loadRoster` 產生的每列:勾選框、班級座號、姓名、狀態(含可能的 🔒 標示)、操作(重設通行碼/停用或啟用/解除鎖定按鈕))。在既有 `<style>` 內加入:
  - 全域(非媒體查詢):`th, td` 的班級座號/姓名/狀態儲存格加 `white-space: nowrap`(不逐字換行)。
  - `@media (max-width: 600px)` 內把表格改成**卡片式**:`thead` 隱藏但**全選勾選框仍可用**(例如保留一列「全選」文字+勾選框的簡潔版本,或用 CSS 只顯示含 `#check-all` 的那一格);每個 `tr` 為 flex 換行的卡片(`display:flex; flex-wrap:wrap; gap`),第一行:勾選框 + 座號 + 姓名 + 狀態(不換行),第二行:操作按鈕群(可換行);卡片之間有分隔線;不得出現水平捲軸;按鈕維持可點大小(高度 ≥ 32px)。
  - 桌機版面(>600px)**維持原樣**。不得改動 `loadRoster` 的資料/事件邏輯(勾選、重設、停用、解除鎖定的 `data-*` 與事件委派全部維持);若需要為 CSS 加 class/`data-label`,只能加不能改既有屬性。

- [ ] **Step 4: ③ `public/app.html` 新版本橫幅** — 在既有 Service Worker 註冊處(`navigator.serviceWorker.register('./sw.js')` 附近)改為:
  ```js
  // 只有「原本就有 Service Worker 控制頁面」才代表這是版本更新(第一次安裝也會觸發 controllerchange,那不用提示)。
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) document.getElementById('update-banner').hidden = false;
  });
  ```
  並在頁面頂端(`#home` 之前)新增橫幅:`<div id="update-banner" hidden>有新版本可用。 <button type="button" id="update-reload">立即更新</button></div>`,樣式為頁面頂部的淺綠或淺橘細條(不遮住內容,`padding` 小,字 14px),按鈕點擊處理才呼叫 `window.location.reload()`(全檔案只能有這一處 `location.reload(`)。**不得**在 `controllerchange` 內直接重整。橫幅需受既有 `[hidden]{display:none !important}` 規則控制。

- [ ] **Step 5: ④ 閘門初始文字** — 在 `teacher.html`、`roster.html`、`map.html`、`qrcodes.html`、`admin.html` 把 `<p id="gate-status"></p>` 改為 `<p id="gate-status">載入中…</p>`(**不要**動 `public/_tmp_roster.html` 這類臨時檔,它被 `.gitignore`)。修改 `src/teacherGate.js` 的 `startSignIn`:目前是 `statusEl.textContent = statusEl.textContent || '請用教師的 Google 帳號登入。';`,改為當文字為空**或**等於 `'載入中…'` 時才設為 `'請用教師的 Google 帳號登入。'`(保留其他情況下已有的訊息,例如「登入已過期,請重新登入。」)。可在檔案頂部宣告 `const LOADING_TEXT = '載入中…';` 供比較使用。驗證流程(`verify`、`requireTeacher` 其餘部分)一律不動。

- [ ] **Step 6: 快取版本與文件** — `public/sw.js` 的 `CACHE_NAME` 改 `tree-map-v16`;`DEPLOY.md`、`docs/WORKLOG.md` 內描述「目前快取版本」的字串改 v16(歷史實測紀錄中的 v13/v14 一律不動;不確定就保留並在報告說明)。`docs/WORKLOG.md`:把「錄影中發現的問題」裡 ①②④ 標為已修、③ 標為已加提示(說明:已安裝的舊版手機要重開 App 2~3 次一次,之後新版會出現橫幅);`DEPLOY.md`「安裝成 App」補:iPhone 主畫面圖示在**加入當下**就固定,換新圖示需刪除主畫面舊圖示後重新「加入主畫面」。條列即可。

- [ ] **Step 7: Run full tests** — `npx vitest run`,預期全部 PASS(含 `tests/phonePolish.test.js`、既有 `manifest`、`duplication-sync`、`appHtml` 等)。

- [ ] **Step 8: Commit**
```bash
git add scripts/icon-source.png scripts/make-icons.ps1 public/icon-180.png public/icon-192.png public/icon-512.png public/roster.html public/app.html src/teacherGate.js public/teacher.html public/map.html public/qrcodes.html public/admin.html tests/phonePolish.test.js public/sw.js DEPLOY.md docs/WORKLOG.md
git commit -m "fix: 手機體驗修正(樹圖示、名單窄螢幕版面、新版本提示、閘門不閃空白)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

- 四項對應使用者選的 #1(圖示)、#2、#4、#5;#3(QR 標籤頁手機橫向溢出)使用者未選,不做。
- 圖示:來源圖已驗證為透明背景黑線(alpha 當形狀);腳本可重跑;尺寸與 manifest 測試相容。
- 橫幅只在有既有控制者時顯示、不自動重整(避免學生填寫中被重整)。
- teacherGate 只改提示文字處理,驗證流程不動。
- 已知限制:視覺結果(圖示外觀、卡片版面)需使用者在手機上確認;測試為原始碼層級與 PNG 尺寸檢查。
