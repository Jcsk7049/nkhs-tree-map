# 學生端「掃描 QR Code」分頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 學生在 App 內直接用相機掃樹牌上的 QR Code,辨識到官方樹木後一鍵進入量測,不必離開 App 改用手機內建相機。

**Decisions(使用者已確認):** 入口=學生底部新增分頁「掃描」(順序:樹木｜掃描｜量測,預設仍進「樹木」);解碼=內建 jsQR(Apache-2.0,`public/vendor/jsqr/`,已由控制者放入,不得修改)。

**Architecture:** 新增 `public/scan.html`:按「開啟相機」才要求相機權限→`getUserMedia`(後鏡頭優先)→每約 120ms 把畫面縮到 ≤640px 丟給全域 `jsQR`→結果交給純函式 `parseTreeIdFromQr`(`src/qrScan.js`)驗證必須是官方樹號→顯示「樹號｜樹種」確認卡→按「量測這棵」以與 `trees.html` 相同方式進入量測(內嵌時改殼層 hash)。殼層(`app.html`)在切換分頁時用 `postMessage` 通知各 iframe 是否顯示,`scan.html` 隱藏時立刻關相機(省電、隱私、關掉 iOS 相機指示燈)。全部離線可用(解碼在本機、樹木名單已快取)。

**Tech Stack:** 原生 ES module、`getUserMedia`、canvas、jsQR(全域)、Service Worker、vitest。

## Global Constraints

- 後端 `apps-script/` **完全不改**;既有頁面行為不變(`trees.html`、`tree.html` 不動;`tests/treesHtml.test.js` 中對 `trees.html` 的斷言必須維持綠)。
- **隱私**:相機畫面/截圖**只在本機記憶體處理**:不得存進 localStorage/sessionStorage/IndexedDB,不得放進任何網路請求;`scan.html` 內不得出現 `fetch(` 以外的網路(`fetch` 只允許讀 `../data/nkhs-trees.json`)。
- **QR 內容一律視為不可信**:只從中取出 `treeId` 並須在官方樹號集合內才接受;**絕不**依 QR 內容導向任意網址;顯示一律用 `textContent`。
- `public/vendor/jsqr/*` 不得修改;`LICENSE` 保留。
- 被快取的檔案改動 → `CACHE_NAME` 升 `tree-map-v18`(`public/sw.js`、`DEPLOY.md`、`docs/WORKLOG.md` 的「目前版本」敘述同步;**不改**歷史實測紀錄);`src/swCacheList.js` 與 `public/sw.js` 的 `CACHE_FILES` 逐字一致;新增到清單:`./scan.html`、`./vendor/jsqr/jsQR.js`、`../src/qrScan.js`(所有 `scan.html` 匯入的 `../src/*.js` 都要在清單內,`tests/duplication-sync.test.js` 會守)。
- 介面文字繁體中文;主題色 `#2e7d32`;iframe 需可用相機:殼層建立 iframe 時設 `frame.allow = 'camera; geolocation'`。
- 測試 `npx vitest run`,結束前全綠。commit 訊息結尾**必須**是:`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`(不得換成執行者自己的模型名)。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `public/vendor/jsqr/{jsQR.js,LICENSE,README.md}` | 已存在(控制者放入) | 第三方解碼函式庫 |
| `src/qrScan.js` | Create | 純函式 `parseTreeIdFromQr(text, officialNos)` |
| `tests/qrScan.test.js` | Create | 單元測試 + 「用專案 QR 產生器產生真實樹牌 QR → jsQR 解碼 → 解析」端到端測試 |
| `public/scan.html` | Create | 掃描頁 |
| `tests/scanHtml.test.js` | Create | 原始碼層級檢查 |
| `src/appShell.js` `tests/appShell.test.js` | Modify | 學生第 3 個分頁「掃描」 |
| `public/app.html` `tests/appHtml.test.js` | Modify | iframe `allow`、分頁顯示狀態 `postMessage` |
| `src/swCacheList.js` `public/sw.js` `tests/duplication-sync.test.js` | Modify | 快取清單與 v18 |
| `DEPLOY.md` `docs/WORKLOG.md` | Modify | 說明與版本 |

---

### Task 1: 純函式 `src/qrScan.js` 與端到端解碼測試

**Files:**
- Create: `src/qrScan.js`
- Test: `tests/qrScan.test.js`

**Interfaces:**
- Produces: `parseTreeIdFromQr(text: unknown, officialNos: Set<string>): { ok: true, treeId: string } | { ok: false, reason: 'not-tree-qr' | 'unknown-tree' }`
  - 內容(trim 後)為空、超過 2048 字元、或不是「1~15 位純數字」也不是 `http(s)` 網址帶非空 `treeId` 參數 → `not-tree-qr`
  - 取出 `candidate`(純數字時就是自己;網址時是 `searchParams.get('treeId').trim()`)後,不在 `officialNos` → `unknown-tree`;在 → `{ ok: true, treeId: candidate }`
  - `javascript:`、`data:`、`ftp:` 等非 http(s) 網址一律 `not-tree-qr`;絕不丟例外

- [ ] **Step 1: Write the failing tests**

```js
// tests/qrScan.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import qrcode from '../public/vendor/qrcode.mjs';
import { buildTreeUrl } from '../src/qrLabels.js';
import { parseTreeIdFromQr } from '../src/qrScan.js';

const official = new Set(['43667', '43020', '10']);

describe('parseTreeIdFromQr', () => {
  it('正式樹牌網址:取出 treeId', () => {
    expect(parseTreeIdFromQr('https://jcsk7049.github.io/nkhs-tree-map/public/tree.html?treeId=43667', official)).toEqual({ ok: true, treeId: '43667' });
  });
  it('換網域、多參數、前後空白也可以(只看 treeId)', () => {
    expect(parseTreeIdFromQr('  http://school.example/app/tree.html?x=1&treeId=43020#top \n', official)).toEqual({ ok: true, treeId: '43020' });
  });
  it('純數字樹號也接受', () => {
    expect(parseTreeIdFromQr('43667', official)).toEqual({ ok: true, treeId: '43667' });
  });
  it('不在官方名單 → unknown-tree', () => {
    expect(parseTreeIdFromQr('https://x.tw/tree.html?treeId=99999', official)).toEqual({ ok: false, reason: 'unknown-tree' });
    expect(parseTreeIdFromQr('99999', official)).toEqual({ ok: false, reason: 'unknown-tree' });
  });
  it('不是樹牌內容 → not-tree-qr', () => {
    for (const bad of ['', '   ', 'hello', 'WIFI:S:x;T:WPA;P:y;;', 'https://example.com/', 'https://x.tw/tree.html?treeId=', 'https://x.tw/tree.html?treeId=%20', null, undefined, 123]) {
      const r = parseTreeIdFromQr(bad, official);
      expect(r.ok, String(bad)).toBe(false);
    }
    expect(parseTreeIdFromQr('hello', official)).toEqual({ ok: false, reason: 'not-tree-qr' });
  });
  it('危險協定與超長內容一律拒絕且不丟例外', () => {
    expect(parseTreeIdFromQr('javascript:alert(1)//?treeId=43667', official).ok).toBe(false);
    expect(parseTreeIdFromQr('data:text/html,<script>?treeId=43667', official).ok).toBe(false);
    expect(parseTreeIdFromQr('ftp://x.tw/?treeId=43667', official).ok).toBe(false);
    expect(parseTreeIdFromQr(`https://x.tw/?treeId=43667&${'a'.repeat(3000)}`, official)).toEqual({ ok: false, reason: 'not-tree-qr' });
  });
  it('樹號含特殊字元(如 __proto__)不會被誤判為官方樹', () => {
    expect(parseTreeIdFromQr('https://x.tw/?treeId=__proto__', official)).toEqual({ ok: false, reason: 'unknown-tree' });
  });
});

// 端到端:用專案自己的 QR 產生器產生「真的樹牌 QR」,轉成像素,交給 jsQR 解碼,再交給 parseTreeIdFromQr。
describe('真實樹牌 QR → jsQR 解碼 → 解析', () => {
  const require = createRequire(import.meta.url);
  const jsQR = require('../public/vendor/jsqr/jsQR.js');

  function renderToRgba(text, { scale = 4, margin = 4 } = {}) {
    const qr = qrcode(0, 'Q');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const size = (n + margin * 2) * scale;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        if (!qr.isDark(r, c)) continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const i = (((r + margin) * scale + dy) * size + (c + margin) * scale + dx) * 4;
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
          }
        }
      }
    }
    return { data, size };
  }

  it('印出來的 QR(qrcodes.html 同樣的產生方式)能被解出網址並解析出樹號', () => {
    const url = buildTreeUrl('https://jcsk7049.github.io/nkhs-tree-map/public/tree.html', '43667');
    const { data, size } = renderToRgba(url);
    const decoded = jsQR(data, size, size, { inversionAttempts: 'dontInvert' });
    expect(decoded).not.toBeNull();
    expect(decoded.data).toBe(url);
    expect(parseTreeIdFromQr(decoded.data, official)).toEqual({ ok: true, treeId: '43667' });
  });
  it('縮小(scale=2)與較小安靜區(margin=2)仍可解碼', () => {
    const url = buildTreeUrl('https://jcsk7049.github.io/nkhs-tree-map/public/tree.html', '43020');
    const { data, size } = renderToRgba(url, { scale: 2, margin: 2 });
    const decoded = jsQR(data, size, size, { inversionAttempts: 'dontInvert' });
    expect(decoded && decoded.data).toBe(url);
  });
  it('沒有 QR 的空白畫面回傳 null(不會誤判)', () => {
    const size = 200;
    const blank = new Uint8ClampedArray(size * size * 4).fill(255);
    expect(jsQR(blank, size, size, { inversionAttempts: 'dontInvert' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qrScan.test.js`
Expected: FAIL(找不到 `../src/qrScan.js`)。記錄失敗輸出。(若「真實樹牌 QR」describe 因 `createRequire`/UMD 載入方式有問題失敗,請調查原因並在報告中說明,**不得**刪除或弱化該端到端測試;可改用 `vm`/`Function` 載入 UMD 檔並取得 `jsQR`。)

- [ ] **Step 3: Write `src/qrScan.js`**

```js
// src/qrScan.js
// 學生端「掃描」分頁用的純函式:把掃到的 QR 文字轉成官方樹號。QR 內容視為不可信,只取 treeId 並須在官方名單內。
const MAX_QR_LENGTH = 2048;

export function parseTreeIdFromQr(text, officialNos) {
  const raw = String(text === null || text === undefined ? '' : text).trim();
  if (raw === '' || raw.length > MAX_QR_LENGTH) return { ok: false, reason: 'not-tree-qr' };

  let candidate = null;
  if (/^\d{1,15}$/.test(raw)) {
    candidate = raw;
  } else {
    try {
      const url = new URL(raw);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const value = (url.searchParams.get('treeId') || '').trim();
        if (value !== '') candidate = value;
      }
    } catch (err) {
      candidate = null;
    }
  }
  if (candidate === null) return { ok: false, reason: 'not-tree-qr' };
  return officialNos.has(candidate) ? { ok: true, treeId: candidate } : { ok: false, reason: 'unknown-tree' };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/qrScan.test.js` 然後 `npx vitest run`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add public/vendor/jsqr src/qrScan.js tests/qrScan.test.js
git commit -m "feat: 學生掃描 QR 的解析函式與 jsQR 端到端解碼測試" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
(`public/vendor/jsqr` 為控制者已放入、尚未提交的檔案,由本 commit 一併加入,**內容不得更動**。)

---

### Task 2: 掃描頁、殼層分頁、快取與文件

**Files:**
- Create: `public/scan.html`、`tests/scanHtml.test.js`
- Modify: `src/appShell.js`、`tests/appShell.test.js`、`public/app.html`、`tests/appHtml.test.js`、`src/swCacheList.js`、`public/sw.js`、`tests/duplication-sync.test.js`、`DEPLOY.md`、`docs/WORKLOG.md`

**Interfaces:**
- Consumes: `parseTreeIdFromQr`(Task 1);`isEmbedded`(`src/embed.js`);`buildHash`(`src/appShell.js`);全域 `jsQR`(`./vendor/jsqr/jsQR.js`);`../data/nkhs-trees.json`(`{trees:[{no,sp,x,y}]}`)
- Produces: 學生分頁 `STUDENT_TABS = [trees, scan, measure]`(`scan` → `{id:'scan', label:'掃描', page:'scan.html'}`);`frameSrc('student','scan')` → `'./scan.html?embed=1'`;`parseHash('#/student')` 仍預設 `trees`;殼層對每個 iframe 廣播 `{ type: 'tab-visibility', visible: boolean }`(`postMessage`,目標 origin 為 `window.location.origin`)

- [ ] **Step 1: 更新/新增測試(先紅)**

`tests/appShell.test.js`:學生分頁 id 斷言改為 `['trees', 'scan', 'measure']`(標題同步);加 `expect(frameSrc('student', 'scan')).toBe('./scan.html?embed=1');`;`parseHash('#/student')` 的斷言(預設 trees)維持不變。

`tests/appHtml.test.js` 追加:
```js
  it('iframe 允許相機,且切換分頁時通知各 iframe 是否顯示', () => {
    expect(html).toMatch(/frame\.allow\s*=\s*'camera; geolocation'/);
    expect(html).toMatch(/postMessage\(\s*\{\s*type:\s*'tab-visibility'/);
    expect(html).toMatch(/window\.location\.origin/);
  });
```
`tests/duplication-sync.test.js`:仿照既有 `trees.html` 區塊,新增「scan.html 每個 `../src/*.js` import 都在 CACHE_FILES 內」與「`./scan.html`、`./vendor/jsqr/jsQR.js`、`../src/qrScan.js` 在清單內」兩個測試(既有「CACHE_FILES 每一項皆存在」測試會自動涵蓋新檔案存在)。

新增 `tests/scanHtml.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/scan.html', import.meta.url), 'utf8');

describe('scan.html 掃描頁(原始碼層級檢查)', () => {
  it('載入本地 jsQR 與純函式模組,不載入教師登入或外部腳本', () => {
    expect(html).toContain('./vendor/jsqr/jsQR.js');
    expect(html).toMatch(/from\s+'\.\.\/src\/qrScan\.js'/);
    expect(html).toMatch(/from\s+'\.\.\/src\/embed\.js'/);
    expect(html).toMatch(/from\s+'\.\.\/src\/appShell\.js'/);
    expect(html).not.toMatch(/teacherGate|accounts\.google\.com|script\.google\.com/);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
  });
  it('按下按鈕才要求相機,後鏡頭優先,video 有 playsinline(iOS 必要)', () => {
    expect(html).toMatch(/getUserMedia\(/);
    expect(html).toMatch(/facingMode:\s*\{\s*ideal:\s*'environment'/);
    expect(html).toMatch(/<video[^>]*playsinline/);
    expect(html).toMatch(/id="start"/);
  });
  it('隱私:不存檔、不上傳(只讀樹木名單)', () => {
    expect(html).not.toMatch(/localStorage|sessionStorage|indexedDB|toDataURL|toBlob|XMLHttpRequest|sendBeacon/);
    const fetches = [...html.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
    expect(fetches.length).toBeGreaterThan(0);
    for (const args of fetches) expect(args).toContain('nkhs-trees.json');
  });
  it('分頁隱藏/離開時關閉相機', () => {
    expect(html).toMatch(/type\s*!==\s*'tab-visibility'|type\s*===\s*'tab-visibility'/);
    expect(html).toMatch(/e\.origin\s*!==\s*(window\.)?location\.origin|event\.origin\s*!==\s*(window\.)?location\.origin/);
    expect(html).toContain("'pagehide'");
    expect(html).toContain('visibilitychange');
    expect(html).toMatch(/getTracks\(\)\.forEach\(\(\w+\) => \w+\.stop\(\)\)/);
  });
  it('掃到後用 textContent 顯示樹號與樹種,並以 trees.html 相同方式進入量測', () => {
    expect(html).toMatch(/parseTreeIdFromQr\(/);
    expect(html).toMatch(/window\.top\.location\.hash\s*=\s*buildHash\('student',\s*'measure'/);
    expect(html).toMatch(/tree\.html\?treeId=/);
    expect(html).not.toMatch(/innerHTML/);
  });
  it('有相機不可用時的替代說明,語言與 viewport 正確', () => {
    expect(html).toContain('相機 App');
    expect(html).toMatch(/<html lang="zh-Hant-TW"/);
    expect(html).toMatch(/name="viewport"/);
  });
});
```
Run `npx vitest run` → 預期上述新增/修改的測試 FAIL(記錄失敗輸出)。

- [ ] **Step 2: `src/appShell.js`** — `STUDENT_TABS` 改為:
```js
export const STUDENT_TABS = [
  { id: 'trees', label: '樹木', page: 'trees.html' },
  { id: 'scan', label: '掃描', page: 'scan.html' },
  { id: 'measure', label: '量測', page: 'tree.html' },
];
```

- [ ] **Step 3: `public/scan.html`** — 建立下列完整頁面(繁體中文;`textContent` 顯示;相機關閉一律經 `stopCamera()`):

```html
<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#2e7d32" />
  <title>掃描樹上的 QR Code</title>
  <style>
    html, body { margin: 0; font-family: sans-serif; color: #1b1b1b; }
    [hidden] { display: none !important; }
    main { max-width: 560px; margin: 0 auto; padding: 16px; }
    h1 { font-size: 22px; margin: 4px 0 8px; }
    .hint { color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 12px; }
    #stage { position: relative; width: 100%; aspect-ratio: 3 / 4; max-height: 60vh; background: #000; border-radius: 8px; overflow: hidden; }
    #video { width: 100%; height: 100%; object-fit: cover; }
    #stage .frame { position: absolute; inset: 15% 15%; border: 3px solid #fff; border-radius: 12px; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35); pointer-events: none; }
    button { font-size: 17px; padding: 12px 18px; cursor: pointer; margin: 10px 10px 0 0; border-radius: 6px; border: 1px solid #999; background: #f5f5f5; }
    button.primary { background: #2e7d32; color: #fff; border: 0; }
    button[disabled] { opacity: 0.5; }
    #status { min-height: 1.5em; margin: 10px 0; font-size: 15px; color: #555; }
    #status.error { color: #c62828; }
    #found { border: 2px solid #2e7d32; border-radius: 8px; padding: 14px; margin-top: 12px; }
    #found-title { font-size: 20px; font-weight: bold; margin: 0 0 4px; }
    .fallback { color: #777; font-size: 13px; line-height: 1.6; margin-top: 20px; }
  </style>
  <script src="./vendor/jsqr/jsQR.js"></script>
</head>
<body>
  <main>
    <h1>掃描樹上的 QR Code</h1>
    <p class="hint">按下「開啟相機」,把樹牌上的 QR Code 放進白框內,掃到會自動辨識。</p>
    <div id="stage" hidden>
      <video id="video" playsinline muted autoplay></video>
      <div class="frame"></div>
    </div>
    <button type="button" class="primary" id="start">開啟相機</button>
    <div id="status" role="status" aria-live="polite"></div>
    <section id="found" hidden>
      <p id="found-title"></p>
      <button type="button" class="primary" id="go">量測這棵</button>
      <button type="button" id="again">重新掃描</button>
    </section>
    <p class="fallback">相機用不了?也可以直接用手機內建的相機 App 掃樹牌,會打開這棵樹的量測頁。</p>
  </main>

  <script type="module">
    import { parseTreeIdFromQr } from '../src/qrScan.js';
    import { isEmbedded } from '../src/embed.js';
    import { buildHash } from '../src/appShell.js';

    const stage = document.getElementById('stage');
    const video = document.getElementById('video');
    const startBtn = document.getElementById('start');
    const statusEl = document.getElementById('status');
    const foundEl = document.getElementById('found');
    const foundTitle = document.getElementById('found-title');
    const goBtn = document.getElementById('go');
    const againBtn = document.getElementById('again');

    const SCAN_INTERVAL_MS = 120;
    const MAX_DECODE_WIDTH = 640;
    const HINT_COOLDOWN_MS = 1500;

    let officialNos = new Set();
    let treeByNo = new Map();
    let treesLoaded = false;
    let stream = null;
    let scanning = false;
    let timer = 0;
    let lastHintAt = 0;
    let pendingTreeId = '';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function say(text, isError = false) {
      statusEl.textContent = text;
      statusEl.className = isError ? 'error' : '';
    }

    async function loadTrees() {
      if (treesLoaded) return;
      const res = await fetch('../data/nkhs-trees.json');
      if (!res.ok) throw new Error(`樹木名單載入失敗(HTTP ${res.status})`);
      const { trees } = await res.json();
      officialNos = new Set(trees.map((t) => t.no));
      treeByNo = new Map(trees.map((t) => [t.no, t]));
      treesLoaded = true;
    }

    // 所有關閉相機的路徑都走這裡:停止解碼、停掉每一條 track(關掉相機指示燈)。
    function stopCamera() {
      scanning = false;
      clearTimeout(timer);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      video.srcObject = null;
      stage.hidden = true;
    }

    // 回到「尚未開啟」的畫面(分頁被切走、頁面被隱藏時)。已掃到的結果卡保留。
    function toIdle() {
      stopCamera();
      if (foundEl.hidden) {
        startBtn.hidden = false;
        say('');
      }
    }

    function explainCameraError(err) {
      switch (err && err.name) {
        case 'NotAllowedError':
        case 'SecurityError':
          return '沒有相機權限。請到手機設定允許這個 App 使用相機,或改用手機內建的相機 App 掃樹牌。';
        case 'NotFoundError':
        case 'OverconstrainedError':
          return '找不到可用的相機。';
        case 'NotReadableError':
          return '相機正被其他程式使用,請關閉後再試。';
        default:
          return `無法開啟相機(${(err && err.message) || '未知原因'})。`;
      }
    }

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        say('這個瀏覽器不能使用相機,請改用手機內建的相機 App 掃樹牌。', true);
        return;
      }
      startBtn.disabled = true;
      say('正在開啟相機…');
      try {
        await loadTrees();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
        foundEl.hidden = true;
        startBtn.hidden = true;
        stage.hidden = false;
        scanning = true;
        say('對準樹牌上的 QR Code…');
        tick();
      } catch (err) {
        stopCamera();
        startBtn.hidden = false;
        say(explainCameraError(err), true);
      } finally {
        startBtn.disabled = false;
      }
    }

    function tick() {
      if (!scanning) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) handleScan(code.data);
      }
      if (scanning) timer = setTimeout(tick, SCAN_INTERVAL_MS);
    }

    function handleScan(text) {
      const result = parseTreeIdFromQr(text, officialNos);
      if (!result.ok) {
        const now = Date.now();
        if (now - lastHintAt > HINT_COOLDOWN_MS) {
          lastHintAt = now;
          say(result.reason === 'unknown-tree' ? '這棵樹不在校園樹木名單內。' : '這不是樹木的 QR Code,請對準樹牌。', true);
        }
        return;
      }
      stopCamera();
      pendingTreeId = result.treeId;
      const tree = treeByNo.get(result.treeId);
      foundTitle.textContent = tree ? `${result.treeId}｜${tree.sp}` : result.treeId;
      foundEl.hidden = false;
      startBtn.hidden = true;
      say('已掃到樹牌!');
      try { if (navigator.vibrate) navigator.vibrate(60); } catch (err) { /* 不支援震動就算了 */ }
    }

    // 與 trees.html 相同:殼層內嵌時請殼層切到「量測」分頁;獨立開啟時直接進量測頁。
    function goMeasure(treeId) {
      if (isEmbedded(window.location.search) && window.top !== window) {
        try {
          window.top.location.hash = buildHash('student', 'measure', { treeId });
          return;
        } catch (err) {
          // 落到下面的整頁導向
        }
      }
      window.location.href = `./tree.html?treeId=${encodeURIComponent(treeId)}`;
    }

    startBtn.addEventListener('click', startCamera);
    goBtn.addEventListener('click', () => goMeasure(pendingTreeId));
    againBtn.addEventListener('click', () => {
      foundEl.hidden = true;
      startCamera();
    });

    // 殼層切換分頁時通知是否顯示;被切走就立刻關相機(省電、隱私)。只接受同源訊息。
    window.addEventListener('message', (e) => {
      if (e.origin !== window.location.origin || !e.data || e.data.type !== 'tab-visibility') return;
      if (e.data.visible === false) toIdle();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) toIdle();
    });
    window.addEventListener('pagehide', stopCamera);
  </script>
</body>
</html>
```

- [ ] **Step 4: `public/app.html`** — (a) 建立 iframe 處加 `frame.allow = 'camera; geolocation';`;(b) 在 `route()` 更新各 frame 的 `hidden` 之後,對每個已建立的 frame 廣播顯示狀態:
```js
      for (const [key, frame] of frames) {
        const visible = key === activeKey;
        frame.hidden = !visible;
        try {
          frame.contentWindow.postMessage({ type: 'tab-visibility', visible }, window.location.origin);
        } catch (err) { /* iframe 尚未載入完成時忽略 */ }
      }
```
(把既有 `for (const [key, frame] of frames) frame.hidden = key !== activeKey;` 換成上面的迴圈;其餘 `route()` 邏輯、橫幅、`hadController` 一律不動。)

- [ ] **Step 5: 快取與版本** — `src/swCacheList.js` 與 `public/sw.js` 的 `CACHE_FILES` 各加(兩處逐字一致):`'./scan.html'`、`'./vendor/jsqr/jsQR.js'`、`'../src/qrScan.js'`;`public/sw.js` 的 `CACHE_NAME` 改 `tree-map-v18`;`DEPLOY.md`、`docs/WORKLOG.md` 的「目前快取版本」敘述改 v18(歷史紀錄不動;不確定就保留並回報);`tests/phonePolish.test.js` 內對 `tree-map-v17` 的斷言與標題同步改 v18。

- [ ] **Step 6: 文件** — `docs/WORKLOG.md`:「頁面」表加 `public/scan.html`(學生:相機掃樹牌 QR → 確認樹號樹種 → 進量測;離線可用);「待辦」加一條「掃描分頁待真機驗證:iPhone 獨立 App 的相機權限與辨識速度、Android」;`DEPLOY.md`「安裝成 App」補一節「掃描 QR」:第一次按「開啟相機」會跳出相機權限詢問;iPhone 獨立 App 若拒絕過權限要到「設定→該 App→相機」開啟;相機不可用時可改用手機內建相機 App 掃(會直接打開量測頁);第三方 jsQR(Apache-2.0)放在 `public/vendor/jsqr/`。條列即可。

- [ ] **Step 7: Run full tests** — `npx vitest run`,預期全部 PASS(含新的 scanHtml、appShell、appHtml、duplication-sync 測試)。

- [ ] **Step 8: Commit**
```bash
git add public/scan.html tests/scanHtml.test.js src/appShell.js tests/appShell.test.js public/app.html tests/appHtml.test.js src/swCacheList.js public/sw.js tests/duplication-sync.test.js tests/phonePolish.test.js DEPLOY.md docs/WORKLOG.md
git commit -m "feat: 學生端新增「掃描」分頁(相機掃樹牌 QR,離線可用),快取升 v18" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

- **需求覆蓋:** 學生分頁「掃描」(Task 2);內建 jsQR、離線可用(vendored + 快取);掃到 → 確認卡 → 進量測;iOS `playsinline`、按鈕觸發權限、權限拒絕/找不到相機等錯誤說明;分頁切走關相機(postMessage);隱私(無儲存/無上傳,測試把關);QR 不可信(僅取 treeId+官方名單驗證)。
- **實測價值:** Task 1 的端到端測試用專案自己的 QR 產生器(與 `qrcodes.html` 相同 `qrcode(0,'Q')`)產生樹牌 QR,證明 jsQR 讀得懂我們實際印出的碼。
- **已知限制:** 相機權限、iOS 獨立 App 內 `getUserMedia`、實際辨識速度/對焦只能在真機驗證(列入待辦);`scan.html` 為原始碼層級測試,無 DOM/相機自動測試。
- **重複:** `goMeasure` 與 `trees.html` 的 `selectTree` 邏輯相同(約 8 行),為避免動到已驗證的 `trees.html` 而刻意不抽共用模組,之後可重構。
