# 學生免掃 QR 選樹(階段 2)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 學生在 App 內從唯讀地圖點選、或用「我的位置」找最近的樹,進入量測,不需掃 QR。

**Architecture:** 新增學生用 `public/trees.html`(Leaflet 地圖 + 公開摘要標色 + 定位),純函式放 `src/nearby.js`;殼層學生分頁改為「樹木/量測」,選樹時 iframe 通知殼層改 hash;快取與文件同步。設計見 `docs/superpowers/specs/2026-09-20-student-tree-picker-design.md`。

**Tech Stack:** 原生 ES module、Leaflet(已在 `public/vendor/leaflet/`)、Geolocation API、Service Worker、vitest。無新增相依。

## Global Constraints

- 後端 `apps-script/` **完全不改**;通行碼/鎖定/教師端/已印 QR/`tree.html` 本身不改。
- `src/config.js` 是設定單一來源;頁面不得寫死 `API_URL` / `GOOGLE_CLIENT_ID`,且須 `import { API_URL } from '../src/config.js'`(`tests/duplication-sync.test.js` 會檢查列表內頁面)。
- 定位資料**只在本機使用**:不得放進任何網路請求、localStorage、IndexedDB。
- `src/swCacheList.js` 與 `public/sw.js` 的 `CACHE_FILES` 逐字一致;快取版本 `tree-map-v13` → `tree-map-v14`(`public/sw.js`、`DEPLOY.md`、`docs/WORKLOG.md` 同步)。
- 介面文字繁體中文;主題色 `#2e7d32`;沿用 map.html 的地圖設定(`L.map('map', { preferCanvas: true, maxZoom: 21, zoomSnap: 0.5 })`、NLSC 航照圖 `https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}`、`maxNativeZoom: 19`、attribution `© 內政部國土測繪中心`)。
- 測試:`npx vitest run`(bash)/ `npx.cmd vitest run`(PowerShell),每個 task 結束前全綠。
- commit 訊息結尾**必須**是:`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`(不得換成執行者自己的模型名)。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/nearby.js` | Create | 純函式:距離、最近 N 棵、距離格式化 |
| `tests/nearby.test.js` | Create | 對應單元測試 |
| `public/trees.html` | Create | 學生選樹頁:地圖、標色、定位、最近清單、點選進量測 |
| `tests/treesHtml.test.js` | Create | 原始碼層級檢查(匯入、隱私、選樹導向) |
| `src/appShell.js` `public/app.html` | Modify | 學生分頁 樹木/量測、placeholder 引導 |
| `tests/appShell.test.js` `tests/appHtml.test.js` | Modify | 配合新分頁 |
| `src/swCacheList.js` `public/sw.js` | Modify | 快取新增資源、升 v14 |
| `tests/duplication-sync.test.js` | Modify | trees.html 相依檢查、CACHE_FILES 檔案皆存在 |
| `DEPLOY.md` `docs/WORKLOG.md` | Modify | 版本號與階段 2 說明 |

---

### Task 1: 純函式 `src/nearby.js`

**Files:**
- Create: `src/nearby.js`
- Test: `tests/nearby.test.js`

**Interfaces:**
- Produces:
  - `distanceMeters(a: {x:number,y:number}, b: {x:number,y:number}): number` — x=經度、y=緯度(與 `nkhs-trees.json` 一致),haversine,單位公尺
  - `nearestTrees(trees: Array<{no,sp,x,y}>, pos: {x,y}, n?: number = 5): Array<{no,sp,x,y,meters:number}>` — 由近到遠,同距離依 `no` 數字排序,不修改輸入,`n<=0` 回 `[]`
  - `formatDistance(meters: number): string` — `<10` 顯示 `約 N 公尺`(四捨五入到整數,最小 1)、`<1000` 四捨五入到 5 公尺 `約 N 公尺`、`>=1000` `約 X.X 公里`

- [ ] **Step 1: Write the failing test**

```js
// tests/nearby.test.js
import { describe, it, expect } from 'vitest';
import { distanceMeters, nearestTrees, formatDistance } from '../src/nearby.js';

describe('distanceMeters', () => {
  it('同一點為 0', () => {
    expect(distanceMeters({ x: 121.6, y: 25.05 }, { x: 121.6, y: 25.05 })).toBe(0);
  });
  it('緯度差 0.001 度約 111 公尺', () => {
    const d = distanceMeters({ x: 121.6, y: 25.05 }, { x: 121.6, y: 25.051 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
  it('經度差在 25 度緯度約 0.906 倍', () => {
    const d = distanceMeters({ x: 121.6, y: 25 }, { x: 121.601, y: 25 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(102);
  });
  it('對稱', () => {
    const a = { x: 121.6, y: 25.05 };
    const b = { x: 121.61, y: 25.06 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});

describe('nearestTrees', () => {
  const trees = [
    { no: '3', sp: '榕樹', x: 121.6, y: 25.0003 },
    { no: '1', sp: '樟樹', x: 121.6, y: 25.0001 },
    { no: '2', sp: '楓香', x: 121.6, y: 25.0002 },
    { no: '10', sp: '茄冬', x: 121.6, y: 25.0002 },
  ];
  const pos = { x: 121.6, y: 25 };
  it('由近到遠,最多 n 棵,帶 meters', () => {
    const r = nearestTrees(trees, pos, 3);
    expect(r.map((t) => t.no)).toEqual(['1', '2', '10']);
    expect(r[0].meters).toBeGreaterThan(10);
    expect(r[0].meters).toBeLessThan(12);
  });
  it('同距離依樹號數字排序(2 在 10 前)', () => {
    expect(nearestTrees(trees, pos, 4).map((t) => t.no)).toEqual(['1', '2', '10', '3']);
  });
  it('預設 5 棵、不修改輸入、n<=0 回空陣列', () => {
    const copy = JSON.parse(JSON.stringify(trees));
    expect(nearestTrees(trees, pos)).toHaveLength(4);
    expect(trees).toEqual(copy);
    expect(nearestTrees(trees, pos, 0)).toEqual([]);
  });
  it('空清單回空陣列', () => {
    expect(nearestTrees([], pos, 5)).toEqual([]);
  });
});

describe('formatDistance', () => {
  it('小於 10 公尺:四捨五入到整數,最小 1', () => {
    expect(formatDistance(0.2)).toBe('約 1 公尺');
    expect(formatDistance(7.4)).toBe('約 7 公尺');
  });
  it('10~1000 公尺:四捨五入到 5 公尺', () => {
    expect(formatDistance(12)).toBe('約 10 公尺');
    expect(formatDistance(13)).toBe('約 15 公尺');
    expect(formatDistance(999)).toBe('約 1000 公尺');
  });
  it('1000 公尺以上:公里一位小數', () => {
    expect(formatDistance(1000)).toBe('約 1.0 公里');
    expect(formatDistance(1540)).toBe('約 1.5 公里');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/nearby.test.js`
Expected: FAIL(找不到 `../src/nearby.js`)

- [ ] **Step 3: Write minimal implementation**

```js
// src/nearby.js
// 「離我最近的樹」用的純函式。座標欄位沿用官方資料:x=經度、y=緯度。定位資料只在這裡算距離,不送出、不儲存。
const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

export function distanceMeters(a, b) {
  const dLat = toRad(b.y - a.y);
  const dLon = toRad(b.x - a.x);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.y)) * Math.cos(toRad(b.y)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestTrees(trees, pos, n = 5) {
  if (!(n > 0)) return [];
  return trees
    .map((t) => ({ ...t, meters: distanceMeters(pos, t) }))
    .sort((p, q) => p.meters - q.meters || Number(p.no) - Number(q.no))
    .slice(0, n);
}

export function formatDistance(meters) {
  if (meters >= 1000) return `約 ${(Math.round(meters / 100) / 10).toFixed(1)} 公里`;
  if (meters < 10) return `約 ${Math.max(1, Math.round(meters))} 公尺`;
  return `約 ${Math.round(meters / 5) * 5} 公尺`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/nearby.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/nearby.js tests/nearby.test.js
git commit -m "feat: 新增 nearby 純函式(距離、最近 N 棵、距離格式化)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 學生選樹頁 `public/trees.html`

**Files:**
- Create: `public/trees.html`
- Test: `tests/treesHtml.test.js`

**Interfaces:**
- Consumes: `nearestTrees`、`formatDistance`(Task 1);`matchSummary`(`src/heightColors.js`,已存在);`buildHash`(`src/appShell.js`);`isEmbedded`(`src/embed.js`);`API_URL`(`src/config.js`)
- Produces: 網址 `trees.html`(獨立)/`trees.html?embed=1`(殼層內嵌);選樹後導向 `tree.html?treeId=<no>`(獨立)或殼層 hash `#/student/measure?treeId=<no>`(內嵌)

- [ ] **Step 1: Write the failing test**

```js
// tests/treesHtml.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/trees.html', import.meta.url), 'utf8');

describe('trees.html 學生選樹頁(原始碼層級檢查)', () => {
  it('從 config.js 匯入 API_URL,不自己寫死網址或用戶端 ID,且不載入教師登入', () => {
    expect(html).toMatch(/import\s*\{[^}]*API_URL[^}]*\}\s*from\s*'\.\.\/src\/config\.js'/);
    expect(html).not.toMatch(/script\.google\.com/);
    expect(html).not.toMatch(/accounts\.google\.com\/gsi/);
    expect(html).not.toMatch(/teacherGate/);
  });
  it('使用 nearby / heightColors / appShell / embed 模組與本地 Leaflet', () => {
    for (const m of ['nearby', 'heightColors', 'appShell', 'embed']) {
      expect(html).toMatch(new RegExp(`from\\s+'\\.\\./src/${m}\\.js'`));
    }
    expect(html).toContain('./vendor/leaflet/leaflet.js');
    expect(html).toContain('./vendor/leaflet/leaflet.css');
    expect(html).toContain('../data/nkhs-trees.json');
  });
  it('選樹:內嵌時改殼層 hash,否則導向 tree.html?treeId=', () => {
    expect(html).toMatch(/window\.top\.location\.hash\s*=\s*buildHash\('student',\s*'measure'/);
    expect(html).toMatch(/tree\.html\?treeId=/);
  });
  it('定位只在本機使用:不寫入儲存、不放進網路請求', () => {
    expect(html).toMatch(/navigator\.geolocation\.getCurrentPosition/);
    expect(html).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    const fetchCalls = [...html.matchAll(/fetch\(([^)]*)\)/g)].map((m) => m[1]);
    for (const args of fetchCalls) {
      expect(args).not.toMatch(/latitude|longitude|coords|pos\b/);
    }
  });
  it('有定位失敗提示、GPS 不準提示、離線提示', () => {
    expect(html).toContain('10~30 公尺');
    expect(html).toContain('請直接掃');
    expect(html).toMatch(/navigator\.onLine/);
  });
  it('語言、viewport、theme-color 正確', () => {
    expect(html).toMatch(/<html lang="zh-Hant-TW"/);
    expect(html).toMatch(/name="viewport"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/treesHtml.test.js`
Expected: FAIL(檔案不存在)

- [ ] **Step 3: Write `public/trees.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>選一棵樹</title>
  <link rel="stylesheet" href="./vendor/leaflet/leaflet.css" />
  <style>
    html, body { height: 100%; margin: 0; font-family: sans-serif; }
    body { display: flex; flex-direction: column; }
    [hidden] { display: none !important; }
    #bar { padding: 8px 10px; background: #fff; border-bottom: 1px solid #ccc; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 14px; }
    #bar button { font-size: 15px; padding: 8px 12px; cursor: pointer; }
    #locate { background: #2e7d32; color: #fff; border: 0; border-radius: 4px; }
    .legend { display: inline-flex; align-items: center; gap: 4px; color: #444; }
    .dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; border: 2px solid #fff; box-shadow: 0 0 0 1px #888; }
    #message { color: #b26a00; padding: 0 10px 6px; font-size: 14px; background: #fff; min-height: 1.3em; }
    #message.error { color: #c62828; }
    #offline { background: #fff3e0; border: 1px solid #ef6c00; color: #a34700; padding: 8px 12px; font-size: 14px; }
    #map { flex: 1; min-height: 0; }
    #nearby { background: #fff; border-top: 1px solid #ccc; max-height: 38%; overflow: auto; }
    #nearby h2 { font-size: 15px; margin: 8px 10px 4px; }
    #nearby ul { list-style: none; margin: 0; padding: 0; }
    #nearby li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-top: 1px solid #eee; font-size: 15px; }
    #nearby li button, .popup button { font-size: 14px; padding: 6px 10px; cursor: pointer; background: #2e7d32; color: #fff; border: 0; border-radius: 4px; }
    .popup button { display: block; width: 100%; margin-top: 6px; }
  </style>
</head>
<body>
  <div id="offline" hidden>目前沒有網路,無法顯示地圖。請直接掃樹上的 QRCode 開始量測。</div>
  <div id="bar">
    <button type="button" id="locate">我的位置</button>
    <span class="legend"><span class="dot" style="background:#2e7d32"></span>已量測</span>
    <span class="legend"><span class="dot" style="background:#9e9e9e"></span>尚未量測</span>
  </div>
  <div id="message"></div>
  <div id="map"></div>
  <section id="nearby" hidden>
    <h2>離我最近的樹</h2>
    <ul id="nearby-list"></ul>
  </section>

  <script src="./vendor/leaflet/leaflet.js"></script>
  <script type="module">
    import { API_URL } from '../src/config.js';
    import { nearestTrees, formatDistance } from '../src/nearby.js';
    import { matchSummary } from '../src/heightColors.js';
    import { buildHash } from '../src/appShell.js';
    import { isEmbedded } from '../src/embed.js';

    const MEASURED_COLOR = '#2e7d32';
    const UNMEASURED_COLOR = '#9e9e9e';
    const GPS_HINT = '定位可能不準(樓間或樹冠下可能偏差 10~30 公尺),請核對樹種再量測。';

    const messageEl = document.getElementById('message');
    const offlineEl = document.getElementById('offline');
    const locateBtn = document.getElementById('locate');
    const nearbyEl = document.getElementById('nearby');
    const nearbyList = document.getElementById('nearby-list');

    function say(text, isError = false) {
      messageEl.textContent = text;
      messageEl.className = isError ? 'error' : '';
    }

    function updateOffline() {
      offlineEl.hidden = navigator.onLine;
    }
    window.addEventListener('online', updateOffline);
    window.addEventListener('offline', updateOffline);
    updateOffline();

    // 選樹:殼層內嵌時請殼層切到「量測」分頁;獨立開啟時直接進量測頁。
    function selectTree(no) {
      if (isEmbedded(window.location.search) && window.top !== window) {
        window.top.location.hash = buildHash('student', 'measure', { treeId: no });
      } else {
        window.location.href = `./tree.html?treeId=${encodeURIComponent(no)}`;
      }
    }

    const map = L.map('map', { preferCanvas: true, maxZoom: 21, zoomSnap: 0.5 });
    const NLSC = 'https://wmts.nlsc.gov.tw/wmts';
    L.tileLayer(`${NLSC}/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}`, {
      maxNativeZoom: 19, maxZoom: 21, attribution: '© 內政部國土測繪中心',
    }).addTo(map);

    let trees = [];
    let measurements = new Map();
    const markers = new Map();
    const markerLayer = L.layerGroup().addTo(map);

    function popupFor(tree) {
      const box = document.createElement('div');
      box.className = 'popup';
      const title = document.createElement('strong');
      title.textContent = `${tree.no}｜${tree.sp}`;
      box.append(title);
      const m = measurements.get(tree.no);
      const info = document.createElement('div');
      info.textContent = m ? `最新樹高 ${m.height} 公尺` : '還沒有人量過';
      box.append(info);
      const go = document.createElement('button');
      go.type = 'button';
      go.textContent = '量測這棵';
      go.addEventListener('click', () => selectTree(tree.no));
      box.append(go);
      return box;
    }

    function styleFor(no) {
      const measured = measurements.has(no);
      const color = measured ? MEASURED_COLOR : UNMEASURED_COLOR;
      return { radius: 6, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.95 };
    }

    function renderTrees() {
      markerLayer.clearLayers();
      markers.clear();
      for (const tree of trees) {
        const marker = L.circleMarker([tree.y, tree.x], styleFor(tree.no));
        marker.bindPopup(() => popupFor(tree));
        marker.addTo(markerLayer);
        markers.set(tree.no, marker);
      }
    }

    async function loadSummary() {
      if (!API_URL || API_URL.indexOf('PASTE_') === 0) return;
      try {
        const res = await fetch(`${API_URL}?action=summary`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (body.status !== 'ok') throw new Error(body.error || '後端回應異常');
        measurements = matchSummary(trees, body.trees).byNo;
        for (const [no, marker] of markers) marker.setStyle(styleFor(no));
      } catch (err) {
        say(`量測狀態載入失敗(地圖仍可使用):${err.message}`, true);
      }
    }

    let youMarker = null;
    let accuracyCircle = null;

    function showNearby(pos) {
      nearbyList.replaceChildren();
      for (const t of nearestTrees(trees, pos, 5)) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = `${t.no}｜${t.sp}(${formatDistance(t.meters)})`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '量測這棵';
        btn.addEventListener('click', () => selectTree(t.no));
        li.append(label, btn);
        nearbyList.append(li);
      }
      nearbyEl.hidden = false;
    }

    const GEO_ERRORS = {
      1: '沒有取得定位權限。請在瀏覽器允許定位,或直接在地圖上點選樹。',
      2: '目前無法取得位置。請直接在地圖上點選樹。',
      3: '定位逾時。請再按一次「我的位置」,或直接在地圖上點選樹。',
    };

    locateBtn.addEventListener('click', () => {
      if (!('geolocation' in navigator)) {
        say('這個瀏覽器不支援定位,請直接在地圖上點選樹。', true);
        return;
      }
      locateBtn.disabled = true;
      say('定位中…');
      navigator.geolocation.getCurrentPosition(
        (p) => {
          locateBtn.disabled = false;
          const pos = { x: p.coords.longitude, y: p.coords.latitude };
          if (youMarker) youMarker.remove();
          if (accuracyCircle) accuracyCircle.remove();
          youMarker = L.circleMarker([pos.y, pos.x], { radius: 8, color: '#fff', weight: 2, fillColor: '#1976d2', fillOpacity: 1 }).addTo(map);
          accuracyCircle = L.circle([pos.y, pos.x], { radius: p.coords.accuracy || 0, color: '#1976d2', weight: 1, fillOpacity: 0.1 }).addTo(map);
          map.setView([pos.y, pos.x], 19);
          showNearby(pos);
          say(GPS_HINT);
        },
        (err) => {
          locateBtn.disabled = false;
          say(GEO_ERRORS[err.code] || GEO_ERRORS[2], true);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    });

    try {
      const res = await fetch('../data/nkhs-trees.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      trees = (await res.json()).trees;
      map.fitBounds(L.latLngBounds(trees.map((t) => [t.y, t.x])), { padding: [20, 20] });
      renderTrees();
      loadSummary();
    } catch (err) {
      say(`樹木資料載入失敗:${err.message}。請直接掃樹上的 QRCode。`, true);
    }
  </script>
</body>
</html>
```


- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: PASS(含新的 treesHtml 測試與既有測試)

- [ ] **Step 5: 本機看一眼(可選)**

啟動 `static-preview`(`.claude/launch.json`),開 `http://localhost:8123/public/trees.html`:地圖與 861 個點出現;按「我的位置」在允許定位後出現藍點與最近清單。此步驟由控制者另外做,實作者可略過。

- [ ] **Step 6: Commit**

```bash
git add public/trees.html tests/treesHtml.test.js
git commit -m "feat: 新增學生選樹頁 trees.html(地圖、標色、我的位置、最近 5 棵)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: 殼層學生分頁、快取與文件

**Files:**
- Modify: `src/appShell.js`、`public/app.html`、`tests/appShell.test.js`、`tests/appHtml.test.js`、`src/swCacheList.js`、`public/sw.js`、`tests/duplication-sync.test.js`、`DEPLOY.md`、`docs/WORKLOG.md`

**Interfaces:**
- Consumes: `public/trees.html`(Task 2)、`src/nearby.js`(Task 1)
- Produces: `STUDENT_TABS = [{id:'trees',label:'樹木',page:'trees.html'},{id:'measure',label:'量測',page:'tree.html'}]`;`parseHash('#/student')` → `{role:'student',tab:'trees',treeId:''}`;`frameSrc('student','trees')` → `'./trees.html?embed=1'`;`frameSrc('student','measure',{})` 仍為 `null`

- [ ] **Step 1: 更新測試(先紅)**

`tests/appShell.test.js`:
- 第 11 行改為 `expect(STUDENT_TABS.map((t) => t.id)).toEqual(['trees', 'measure']);`(並把測試標題「學生階段 1 只有量測」改為「學生兩個分頁:樹木/量測」)
- 第 30 行 `parseHash('#/student')` 的期望改為 `{ role: 'student', tab: 'trees', treeId: '' }`
- 在 `describe('frameSrc / buildHash'` 內新增:
```js
  it('學生樹木分頁對應 trees.html', () => {
    expect(frameSrc('student', 'trees')).toBe('./trees.html?embed=1');
  });
```
`tests/appHtml.test.js` 新增:
```js
  it('量測分頁沒選樹時,placeholder 引導到「樹木」分頁並有按鈕', () => {
    expect(html).toContain('請先到「樹木」分頁選一棵樹');
    expect(html).toMatch(/id="go-trees"/);
    expect(html).not.toContain('之後版本會加入直接選樹');
  });
```
`tests/duplication-sync.test.js` 新增(放在 app.html 相依檢查的 describe 之後;`existsSync`、`path` 若未匯入請補):
```js
describe('trees.html 與快取清單', () => {
  it('trees.html 每個 ../src/*.js import 都在 CACHE_FILES 內', () => {
    const imports = extractModuleImports(readRepoFile('public/trees.html'));
    expect(imports.length).toBeGreaterThan(0);
    for (const importPath of imports) expect(CACHE_FILES).toContain(importPath);
  });
  it('選樹頁與其資源在清單內', () => {
    for (const file of ['./trees.html', '../src/nearby.js', '../src/heightColors.js', '../data/nkhs-trees.json',
      './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css']) {
      expect(CACHE_FILES).toContain(file);
    }
  });
  it('CACHE_FILES 每一項都是真實存在的檔案(cache.addAll 只要有一個 404 整批失敗)', () => {
    for (const file of CACHE_FILES) {
      expect(existsSync(new URL(file, new URL('../public/sw.js', import.meta.url))), file).toBe(true);
    }
  });
});
```
Run: `npx vitest run` → 預期上述新增/修改的測試 FAIL。

- [ ] **Step 2: 實作 `src/appShell.js`**

```js
export const STUDENT_TABS = [
  { id: 'trees', label: '樹木', page: 'trees.html' },
  { id: 'measure', label: '量測', page: 'tree.html' },
];
```
並在 `frameSrc` 中維持既有邏輯(`trees` 分頁走通用分支,自然回 `./trees.html?embed=1`)。

- [ ] **Step 3: 實作 `public/app.html`**

把 `#placeholder` 改為:
```html
    <div id="placeholder" hidden>
      請先到「樹木」分頁選一棵樹,或直接掃樹上的 QRCode。
      <p><button type="button" id="go-trees">去選樹</button></p>
    </div>
```
並在 `<script type="module">` 內、`route()` 定義之後加:
```js
    document.getElementById('go-trees').addEventListener('click', () => {
      window.location.hash = buildHash('student', 'trees');
    });
```
(`.role`/tabbar 樣式沿用;`#go-trees` 用與 `.role` 相近的按鈕樣式即可,例如 `padding: 10px 16px; font-size: 16px; background:#2e7d32; color:#fff; border:0; border-radius:4px;`。)

- [ ] **Step 4: 更新快取清單**

`src/swCacheList.js` 與 `public/sw.js` 的 `CACHE_FILES` 都改為(逐字一致):
```js
  './app.html',
  './tree.html',
  './trees.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  '../data/nkhs-trees.json',
  '../src/appShell.js',
  '../src/calc.js',
  '../src/offlineQueue.js',
  '../src/submit.js',
  '../src/treePage.js',
  '../src/studentCode.js',
  '../src/config.js',
  '../src/trend.js',
  '../src/trendView.js',
  '../src/nearby.js',
  '../src/heightColors.js',
  '../src/embed.js',
```
`public/sw.js` 的 `CACHE_NAME` 改 `tree-map-v14`;`DEPLOY.md`、`docs/WORKLOG.md` 內的 `tree-map-v13` 同步改 `tree-map-v14`。

- [ ] **Step 5: 更新文件**

`docs/WORKLOG.md`:「頁面」表加 `public/trees.html`(學生選樹:地圖標色、我的位置、最近 5 棵);「待辦」把階段 2 標為完成,並註明尚未實機驗證定位與殼層內選樹流程。`DEPLOY.md`「安裝成 App」一節補一句:學生可在「樹木」分頁選樹,定位只在本機使用;選樹地圖需要網路。使用條列/表格。

- [ ] **Step 6: Run full tests**

Run: `npx vitest run`
Expected: PASS(全部)

- [ ] **Step 7: Commit**

```bash
git add src/appShell.js public/app.html tests/appShell.test.js tests/appHtml.test.js src/swCacheList.js public/sw.js tests/duplication-sync.test.js DEPLOY.md docs/WORKLOG.md
git commit -m "feat: 學生分頁加入「樹木」選樹,快取納入選樹頁與 Leaflet,升 v14" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** 地圖點選(Task 2)、標色已量測/未量測(Task 2 `styleFor`)、我的位置+最近 5 棵(Task 1、2)、定位失敗退回(Task 2 `GEO_ERRORS`)、隱私不儲存不上傳(Task 2 測試)、離線提示(Task 2 `#offline`)、殼層兩分頁與 placeholder 引導(Task 3)、快取與 v14(Task 3)。「我的紀錄」與搜尋清單依設計明確不做。
- **Placeholder scan:** 無 TBD;Task 2 有一處明確的 import 修正說明(只匯入 `matchSummary`),實作者須照做。
- **Type consistency:** `nearestTrees`/`formatDistance`/`distanceMeters` 於 Task 1 定義,Task 2 以相同簽名使用;`buildHash('student','measure',{treeId})` 與階段 1 一致;`STUDENT_TABS` 在 Task 3 定義並與測試一致。
- **已知取捨:** `trees.html` 的行為(定位、marker)無瀏覽器自動測試,靠原始碼層級檢查 + 使用者 Chrome 實測;離線時地圖圖磚不可用,頁面只保證可開啟並提示。
