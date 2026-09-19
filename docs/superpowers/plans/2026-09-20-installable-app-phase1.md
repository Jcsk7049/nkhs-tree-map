# 可安裝整合 App — 階段 1(殼層與安裝)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `app.html` 單一入口,把學生與老師的既有頁面整合成一個可安裝到主畫面的 PWA,有底部導覽與離線開啟。

**Architecture:** `app.html` 是純前端殼層:首頁選身分(學生/老師),依身分顯示底部分頁;每個分頁用 `<iframe>` 承載**現有頁面**(加 `?embed=1` 隱藏各頁自己的「← 教師端」連結),第一次點開才建立、之後只切換顯示,所以切換不重載。殼層本身**不做登入**:老師在第一個分頁的既有閘門登入後,憑證存在 sessionStorage,同源的其他分頁 iframe 會自動沿用並各向後端驗證一次。路由/分頁邏輯放進可單元測試的純函式模組 `src/appShell.js`。

**Tech Stack:** 原生 ES module、Service Worker、Web App Manifest、vitest。無新增相依。

## Global Constraints

- 後端 API、通行碼雜湊、連錯鎖定、教師名單驗證**完全不改**(不動 `apps-script/`)。
- 已印出的 QR(`tree.html?treeId=…`)與舊網址(`teacher/roster/map/qrcodes.html`)**照常可用**,不做導向。
- `src/config.js` 仍是設定單一來源;新頁面不得自己寫死 `API_URL` / `GOOGLE_CLIENT_ID`(本階段 `app.html` 不需要它們)。
- `src/swCacheList.js` 與 `public/sw.js` 的 `CACHE_FILES` 必須逐字一致(`tests/duplication-sync.test.js` 守門);任何被快取檔案變動都要升 `CACHE_NAME`(目前 `tree-map-v12` → `tree-map-v13`)。
- 主題色 `#2e7d32`,語言 `zh-Hant-TW`,介面文字用繁體中文。
- 測試指令:`npx.cmd vitest run`(PowerShell)。每個 task 結束前全部測試必須綠。
- commit 訊息結尾加:`Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`

## 與設計文件的差異(執行前請知悉)

1. **殼層用 iframe 承載現有頁面**,而不是把 5 頁重構成單頁模組。原因:重構約 1800 行有大量回歸風險;iframe 可保留現有已驗證的頁面。代價:分頁內容各自捲動、每個老師分頁首次開啟會各向後端驗證一次(約 1~2 秒)。
2. **不做 `tree.html` 與舊教師頁的導向**(設計 §5)。原因:導向對「已裝 App 的使用者」幾乎沒有實益,卻可能造成離線/迴圈問題;保留原頁面獨立可用更安全。
3. **學生模式階段 1 只有「量測」一個分頁**。「樹木」需要不需登入的唯讀地圖、「我的紀錄」需要新介面,兩者屬階段 2。學生從 QR(`#/student/measure?treeId=…`)或 `tree.html` 進入;沒有樹號時顯示「請掃樹上的 QRCode」說明。
4. **圖示 512px 由 192px 放大產生**(手邊沒有原始向量圖),會略糊,之後可替換檔案而不需改程式。

## File Structure

| 檔案 | 動作 | 責任 |
|---|---|---|
| `src/appShell.js` | Create | 純函式:解析 `location.hash`、各身分的分頁清單、分頁對應的 iframe 網址 |
| `src/embed.js` | Create | 純函式+一個 DOM 輔助:判斷是否內嵌、內嵌時隱藏 `[data-embed-hide]`、內嵌時導覽保留 `embed=1` |
| `public/app.html` | Create | 殼層頁:選身分首頁、底部導覽、iframe 管理、加入主畫面說明 |
| `public/roster.html` `map.html` `qrcodes.html` | Modify | 匯入 `embed.js`;返回連結加 `data-embed-hide`;內部導覽用 `withEmbed` |
| `public/manifest.json` | Modify | `start_url`、`id`、`scope`、多尺寸圖示 |
| `public/icon-512.png` `icon-180.png` | Create | 由 192px 放大 |
| `src/swCacheList.js` `public/sw.js` | Modify | 快取加入殼層與其模組、圖示;升版本 |
| `public/index.html` | Modify | 主要入口改指向 `app.html` |
| `tests/appShell.test.js` `tests/embed.test.js` `tests/manifest.test.js` | Create | 對應單元測試 |
| `tests/duplication-sync.test.js` | Modify | 相依檢查擴及 `app.html` |
| `docs/WORKLOG.md` `DEPLOY.md` | Modify | 更新現況與安裝說明 |

---

### Task 1: 路由與分頁純函式 `src/appShell.js`

**Files:**
- Create: `src/appShell.js`
- Test: `tests/appShell.test.js`

**Interfaces:**
- Produces:
  - `STUDENT_TABS`、`TEACHER_TABS`: `Array<{ id: string, label: string, page: string }>`
  - `tabsFor(role: 'student'|'teacher'): Tab[]`(未知身分回 `[]`)
  - `parseHash(hash: string): { role: 'student'|'teacher'|null, tab: string|null, treeId: string }`
  - `frameSrc(role, tabId, { treeId }?): string|null`(學生量測缺樹號、或找不到分頁時回 `null`)
  - `buildHash(role, tabId, { treeId }?): string`

- [ ] **Step 1: Write the failing test**

```js
// tests/appShell.test.js
import { describe, it, expect } from 'vitest';
import { STUDENT_TABS, TEACHER_TABS, tabsFor, parseHash, frameSrc, buildHash } from '../src/appShell.js';

describe('tabsFor', () => {
  it('老師三個分頁:名單/地圖/QR 標籤', () => {
    expect(TEACHER_TABS.map((t) => t.id)).toEqual(['roster', 'map', 'labels']);
    expect(tabsFor('teacher')).toBe(TEACHER_TABS);
  });
  it('學生階段 1 只有量測', () => {
    expect(STUDENT_TABS.map((t) => t.id)).toEqual(['measure']);
    expect(tabsFor('student')).toBe(STUDENT_TABS);
  });
  it('未知身分回空陣列', () => {
    expect(tabsFor('x')).toEqual([]);
    expect(tabsFor(null)).toEqual([]);
  });
});

describe('parseHash', () => {
  it('空字串或首頁 → 沒有身分', () => {
    expect(parseHash('')).toEqual({ role: null, tab: null, treeId: '' });
    expect(parseHash('#/')).toEqual({ role: null, tab: null, treeId: '' });
  });
  it('#/teacher/map', () => {
    expect(parseHash('#/teacher/map')).toEqual({ role: 'teacher', tab: 'map', treeId: '' });
  });
  it('只有身分 → 取該身分第一個分頁', () => {
    expect(parseHash('#/teacher')).toEqual({ role: 'teacher', tab: 'roster', treeId: '' });
    expect(parseHash('#/student')).toEqual({ role: 'student', tab: 'measure', treeId: '' });
  });
  it('學生量測帶樹號(含需解碼的字元)', () => {
    expect(parseHash('#/student/measure?treeId=A%2D023').treeId).toBe('A-023');
  });
  it('不認得的身分或分頁 → 視為首頁,不丟例外', () => {
    expect(parseHash('#/hacker/x')).toEqual({ role: null, tab: null, treeId: '' });
    expect(parseHash('#/teacher/nope').tab).toBe('roster');
  });
});

describe('frameSrc / buildHash', () => {
  it('老師分頁對應既有頁面並加 embed=1', () => {
    expect(frameSrc('teacher', 'roster')).toBe('./roster.html?embed=1');
    expect(frameSrc('teacher', 'map')).toBe('./map.html?embed=1');
    expect(frameSrc('teacher', 'labels')).toBe('./qrcodes.html?embed=1');
  });
  it('學生量測需要樹號,樹號要編碼', () => {
    expect(frameSrc('student', 'measure', {})).toBeNull();
    expect(frameSrc('student', 'measure', { treeId: 'A 023' })).toBe('./tree.html?embed=1&treeId=A%20023');
  });
  it('不存在的分頁回 null', () => {
    expect(frameSrc('teacher', 'nope')).toBeNull();
  });
  it('buildHash 與 parseHash 互逆', () => {
    expect(buildHash('teacher', 'map')).toBe('#/teacher/map');
    expect(parseHash(buildHash('student', 'measure', { treeId: '43667' }))).toEqual({ role: 'student', tab: 'measure', treeId: '43667' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/appShell.test.js`
Expected: FAIL(找不到 `../src/appShell.js`)

- [ ] **Step 3: Write minimal implementation**

```js
// src/appShell.js
// 殼層(app.html)的路由與分頁設定。純函式,不碰 DOM,方便測試。
export const STUDENT_TABS = [{ id: 'measure', label: '量測', page: 'tree.html' }];
export const TEACHER_TABS = [
  { id: 'roster', label: '名單', page: 'roster.html' },
  { id: 'map', label: '地圖', page: 'map.html' },
  { id: 'labels', label: 'QR 標籤', page: 'qrcodes.html' },
];

const ROLES = { student: STUDENT_TABS, teacher: TEACHER_TABS };

export function tabsFor(role) {
  return ROLES[role] || [];
}

const HOME = { role: null, tab: null, treeId: '' };

// 格式:#/<role>[/<tab>][?treeId=…]。任何不認得的內容都當首頁,絕不丟例外。
export function parseHash(hash) {
  const match = String(hash || '').match(/^#\/([^/?]*)(?:\/([^/?]*))?(?:\?(.*))?$/);
  if (!match) return { ...HOME };
  const tabs = tabsFor(match[1]);
  if (tabs.length === 0) return { ...HOME };
  const tab = tabs.some((t) => t.id === match[2]) ? match[2] : tabs[0].id;
  const treeId = new URLSearchParams(match[3] || '').get('treeId') || '';
  return { role: match[1], tab, treeId };
}

export function frameSrc(role, tabId, { treeId = '' } = {}) {
  const tab = tabsFor(role).find((t) => t.id === tabId);
  if (!tab) return null;
  if (role === 'student' && tabId === 'measure') {
    if (!treeId) return null;
    return `./${tab.page}?embed=1&treeId=${encodeURIComponent(treeId)}`;
  }
  return `./${tab.page}?embed=1`;
}

export function buildHash(role, tabId, { treeId = '' } = {}) {
  const base = `#/${role}/${tabId}`;
  return treeId ? `${base}?treeId=${encodeURIComponent(treeId)}` : base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx.cmd vitest run tests/appShell.test.js`
Expected: PASS(全部)

- [ ] **Step 5: Commit**

```bash
git add src/appShell.js tests/appShell.test.js
git commit -m "feat: 殼層路由與分頁純函式 appShell"
```

---

### Task 2: 內嵌模式輔助 `src/embed.js`,並套用到三個老師頁

**Files:**
- Create: `src/embed.js`
- Modify: `public/roster.html:56`(返回連結)、`public/map.html:39`(返回連結)與 `:332`(導覽)、`public/qrcodes.html:58`(連結)
- Test: `tests/embed.test.js`

**Interfaces:**
- Produces:
  - `isEmbedded(search: string): boolean`
  - `withEmbed(relativeUrl: string, search: string): string`(內嵌時在網址加 `embed=1`,否則原樣)
  - `applyEmbedMode(doc: Document, search: string): void`(內嵌時注入 `[data-embed-hide]{display:none !important}`)

- [ ] **Step 1: Write the failing test**

```js
// tests/embed.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isEmbedded, withEmbed, applyEmbedMode } from '../src/embed.js';

describe('isEmbedded / withEmbed', () => {
  it('只有 embed=1 才算內嵌', () => {
    expect(isEmbedded('?embed=1')).toBe(true);
    expect(isEmbedded('?a=1&embed=1')).toBe(true);
    expect(isEmbedded('?embed=0')).toBe(false);
    expect(isEmbedded('')).toBe(false);
  });
  it('內嵌時導覽網址保留 embed=1,非內嵌時原樣', () => {
    expect(withEmbed('./qrcodes.html', '?embed=1')).toBe('./qrcodes.html?embed=1');
    expect(withEmbed('./tree.html?treeId=1', '?embed=1')).toBe('./tree.html?treeId=1&embed=1');
    expect(withEmbed('./qrcodes.html', '')).toBe('./qrcodes.html');
  });
});

describe('applyEmbedMode', () => {
  const fakeDoc = () => {
    const appended = [];
    return {
      appended,
      createElement: () => ({ textContent: '' }),
      head: { appendChild: (el) => appended.push(el) },
    };
  };
  it('內嵌時注入隱藏規則,非內嵌時什麼都不做', () => {
    const a = fakeDoc();
    applyEmbedMode(a, '?embed=1');
    expect(a.appended).toHaveLength(1);
    expect(a.appended[0].textContent).toContain('[data-embed-hide]');
    const b = fakeDoc();
    applyEmbedMode(b, '');
    expect(b.appended).toHaveLength(0);
  });
});

describe('老師頁都已套用內嵌模式', () => {
  for (const page of ['roster.html', 'map.html', 'qrcodes.html']) {
    it(`${page} 匯入 embed.js 並標記返回連結`, () => {
      const html = readFileSync(new URL(`../public/${page}`, import.meta.url), 'utf8');
      expect(html).toMatch(/from\s+'\.\.\/src\/embed\.js'/);
      expect(html).toMatch(/applyEmbedMode\(/);
      expect(html).toMatch(/data-embed-hide/);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/embed.test.js`
Expected: FAIL(找不到 `../src/embed.js`)

- [ ] **Step 3: Write `src/embed.js`**

```js
// 內嵌模式:頁面被 app.html 用 iframe 承載時(網址帶 embed=1),隱藏頁面自己的「← 教師端」等返回連結,
// 因為殼層已有底部導覽;並讓頁面內部的跳轉保留 embed=1,避免跳轉後又冒出獨立頁的外觀。
export function isEmbedded(search) {
  return new URLSearchParams(search || '').get('embed') === '1';
}

export function withEmbed(relativeUrl, search) {
  if (!isEmbedded(search)) return relativeUrl;
  return relativeUrl + (relativeUrl.includes('?') ? '&' : '?') + 'embed=1';
}

export function applyEmbedMode(doc, search) {
  if (!isEmbedded(search)) return;
  const style = doc.createElement('style');
  style.textContent = '[data-embed-hide]{display:none !important}';
  doc.head.appendChild(style);
}
```

- [ ] **Step 4: Apply to the three pages**

先讀各檔對應行,再用 Edit 修改,重點:
- `roster.html:56` `<a href="./teacher.html">← 教師端</a>` 所在的 `<p class="hint no-print">` 加上 `data-embed-hide` 屬性。
- `map.html:39` 同一個 `<a href="./teacher.html">← 教師端</a>` 加 `data-embed-hide`。
- `qrcodes.html:58` 整個 `<p class="hint">…</p>` 加 `data-embed-hide`(其中「回樹木地圖」連結在殼層已有「地圖」分頁)。
- 三頁的 `<script type="module">` 開頭各加:
  `import { applyEmbedMode, withEmbed } from '../src/embed.js';` 與 `applyEmbedMode(document, window.location.search);`
- `map.html:332` 改為 `window.location.href = withEmbed('./qrcodes.html', window.location.search);`

註:被內嵌時 `map.html → qrcodes.html` 的跳轉發生在 iframe 內,殼層底部導覽的「地圖」高亮不會自動換到「QR 標籤」,這是已知的小瑕疵(不影響功能),記在 Task 6 的驗證清單。

- [ ] **Step 5: Run full tests**

Run: `npx.cmd vitest run`
Expected: PASS(含新的 embed 測試與既有 `duplication-sync` 的「每頁都從 config.js 匯入 API_URL」)

- [ ] **Step 6: Commit**

```bash
git add src/embed.js tests/embed.test.js public/roster.html public/map.html public/qrcodes.html
git commit -m "feat: 老師頁支援內嵌模式(embed=1 時隱藏返回連結、跳轉保留內嵌)"
```

---

### Task 3: 殼層頁 `public/app.html`

**Files:**
- Create: `public/app.html`
- Test: `tests/appHtml.test.js`

**Interfaces:**
- Consumes: `parseHash`、`tabsFor`、`frameSrc`、`buildHash`(Task 1)
- Produces: 網址 `app.html#/teacher/roster`、`app.html#/student/measure?treeId=…`;localStorage 鍵 `tree-map-role`(記住上次身分,`'student'|'teacher'`)

- [ ] **Step 1: Write the failing test**

```js
// tests/appHtml.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/app.html', import.meta.url), 'utf8');

describe('app.html 殼層', () => {
  it('從 appShell.js 匯入路由函式,且不自己寫死 API 網址或用戶端 ID', () => {
    expect(html).toMatch(/from\s+'\.\.\/src\/appShell\.js'/);
    expect(html).not.toMatch(/script\.google\.com/);
    expect(html).not.toMatch(/apps\.googleusercontent\.com/);
  });
  it('有 manifest、theme-color、apple-touch-icon,語言正確', () => {
    expect(html).toMatch(/<html lang="zh-Hant-TW"/);
    expect(html).toMatch(/<link rel="manifest" href="\.\/manifest\.json"/);
    expect(html).toMatch(/<meta name="theme-color" content="#2e7d32"/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\.\/icon-180\.png"/);
  });
  it('有選身分首頁的兩個入口與底部導覽容器', () => {
    expect(html).toContain('我是學生');
    expect(html).toContain('我是老師');
    expect(html).toMatch(/id="tabbar"/);
    expect(html).toMatch(/id="frames"/);
  });
  it('註冊 Service Worker', () => {
    expect(html).toMatch(/serviceWorker\.register\('\.\/sw\.js'\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/appHtml.test.js`
Expected: FAIL(檔案不存在)

- [ ] **Step 3: Write `public/app.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>南港高工 校園樹木量測</title>
  <link rel="manifest" href="./manifest.json" />
  <meta name="theme-color" content="#2e7d32" />
  <link rel="apple-touch-icon" href="./icon-180.png" />
  <style>
    html, body { height: 100%; margin: 0; }
    body { font-family: sans-serif; color: #1b1b1b; display: flex; flex-direction: column; }
    [hidden] { display: none !important; }
    #home { flex: 1; overflow: auto; padding: 24px 16px; }
    #home main { max-width: 560px; margin: 0 auto; }
    #home h1 { font-size: 24px; }
    .role { display: block; width: 100%; text-align: left; padding: 18px; border: 1px solid #bbb; border-radius: 8px; margin: 14px 0; background: #fff; font: inherit; cursor: pointer; }
    .role:hover { background: #f1f8e9; border-color: #2e7d32; }
    .role strong { display: block; font-size: 19px; margin-bottom: 6px; }
    .role span { color: #555; font-size: 14px; line-height: 1.6; }
    .install-hint { color: #555; font-size: 13px; line-height: 1.6; margin-top: 24px; }
    #frames { flex: 1; position: relative; min-height: 0; }
    #frames iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #fff; }
    #placeholder { padding: 32px 16px; color: #555; line-height: 1.7; }
    #tabbar { display: flex; border-top: 1px solid #ccc; background: #f7f7f7; padding-bottom: env(safe-area-inset-bottom); }
    #tabbar button { flex: 1; padding: 12px 4px; border: 0; background: none; font: inherit; font-size: 15px; color: #555; cursor: pointer; }
    #tabbar button[aria-current="page"] { color: #2e7d32; font-weight: bold; border-top: 3px solid #2e7d32; margin-top: -1px; }
    #tabbar .switch { flex: 0 0 auto; padding: 12px 14px; font-size: 13px; color: #888; }
  </style>
</head>
<body>
  <section id="home">
    <main>
      <h1>南港高工 校園樹木量測</h1>
      <button type="button" class="role" data-role="student">
        <strong>我是學生</strong>
        <span>掃樹上的 QRCode,輸入班級座號與老師發的通行碼,登記這棵樹的量測。</span>
      </button>
      <button type="button" class="role" data-role="teacher">
        <strong>我是老師</strong>
        <span>學生名單與通行碼、樹木地圖、QRCode 標籤。需要用教師的 Google 帳號登入。</span>
      </button>
      <p class="install-hint">
        想像 App 一樣使用:Android Chrome 選單 →「安裝應用程式」;iPhone/iPad Safari 按分享鈕 →「加入主畫面」。
      </p>
    </main>
  </section>

  <div id="frames" hidden>
    <div id="placeholder" hidden>請掃樹上貼的 QRCode 開始量測。(之後版本會加入直接選樹。)</div>
  </div>
  <nav id="tabbar" hidden></nav>

  <script type="module">
    import { parseHash, tabsFor, frameSrc, buildHash } from '../src/appShell.js';

    const ROLE_KEY = 'tree-map-role';
    const home = document.getElementById('home');
    const framesEl = document.getElementById('frames');
    const placeholder = document.getElementById('placeholder');
    const tabbar = document.getElementById('tabbar');
    const frames = new Map(); // 'role/tab/treeId' → iframe(建立後只切換顯示,不重載)

    function remember(role) {
      try { localStorage.setItem(ROLE_KEY, role); } catch (err) { /* 記不住只是每次多選一下 */ }
    }

    function showHome() {
      home.hidden = false;
      framesEl.hidden = true;
      tabbar.hidden = true;
    }

    function renderTabbar(role, activeTab, treeId) {
      tabbar.replaceChildren();
      for (const tab of tabsFor(role)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = tab.label;
        if (tab.id === activeTab) btn.setAttribute('aria-current', 'page');
        btn.addEventListener('click', () => { window.location.hash = buildHash(role, tab.id, { treeId }); });
        tabbar.appendChild(btn);
      }
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'switch';
      back.textContent = '換身分';
      back.addEventListener('click', () => { window.location.hash = '#/'; });
      tabbar.appendChild(back);
    }

    function route() {
      const { role, tab, treeId } = parseHash(window.location.hash);
      if (!role) return showHome();

      remember(role);
      home.hidden = true;
      framesEl.hidden = false;
      tabbar.hidden = false;
      renderTabbar(role, tab, treeId);

      const src = frameSrc(role, tab, { treeId });
      placeholder.hidden = src !== null;
      const activeKey = src ? `${role}/${tab}/${treeId}` : null;
      if (src && !frames.has(activeKey)) {
        const frame = document.createElement('iframe');
        frame.src = src;
        frame.title = tab;
        framesEl.appendChild(frame);
        frames.set(activeKey, frame);
      }
      for (const [key, frame] of frames) frame.hidden = key !== activeKey;
    }

    home.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-role]');
      if (btn) window.location.hash = `#/${btn.dataset.role}`;
    });
    window.addEventListener('hashchange', route);
    route();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.error('[tree-map] SW 註冊失敗', err));
    }
  </script>
</body>
</html>
```

- [ ] **Step 4: Run tests**

Run: `npx.cmd vitest run`
Expected: PASS

- [ ] **Step 5: 本機看一眼**

啟動 `.claude/launch.json` 的 `static-preview`,開 `http://localhost:8123/public/app.html`:
確認首頁兩個按鈕;點「我是學生」出現說明文字與底部導覽;點「我是老師」出現三個分頁;點分頁不會整頁重載。(老師頁登入需要正式 Google 憑證,本機 `localhost` 可能不在 OAuth 來源,登入驗證留到 Task 6。)

- [ ] **Step 6: Commit**

```bash
git add public/app.html tests/appHtml.test.js
git commit -m "feat: 新增 app.html 殼層(選身分、底部導覽、iframe 分頁)"
```

---

### Task 4: 安裝設定(manifest 與圖示)

**Files:**
- Modify: `public/manifest.json`
- Create: `public/icon-512.png`、`public/icon-180.png`
- Test: `tests/manifest.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/manifest.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../public/${p}`, import.meta.url));
const manifest = JSON.parse(read('manifest.json').toString('utf8'));
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

describe('manifest.json', () => {
  it('以殼層為安裝起點與範圍', () => {
    expect(manifest.start_url).toBe('./app.html');
    expect(manifest.scope).toBe('./');
    expect(manifest.id).toBe('./app.html');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#2e7d32');
  });
  it('宣告 192 與 512 圖示,檔案存在且尺寸與宣告一致', () => {
    const sizes = manifest.icons.map((i) => i.sizes).sort();
    expect(sizes).toEqual(['192x192', '512x512']);
    for (const icon of manifest.icons) {
      const file = icon.src.replace('./', '');
      expect(existsSync(new URL(`../public/${file}`, import.meta.url)), file).toBe(true);
      const [w, h] = pngSize(read(file));
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });
  it('iOS 用的 180px 圖示存在且尺寸正確', () => {
    expect(pngSize(read('icon-180.png'))).toEqual([180, 180]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run tests/manifest.test.js`
Expected: FAIL(`start_url` 仍是 `./tree.html`,且沒有 512 圖示)

- [ ] **Step 3: 產生圖示(PowerShell,用 System.Drawing 由 192px 放大/縮放)**

```powershell
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile("C:\NKHS tree map\public\icon-192.png")
foreach ($n in 512, 180) {
  $bmp = New-Object System.Drawing.Bitmap $n, $n
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($src, 0, 0, $n, $n)
  $g.Dispose()
  $bmp.Save("C:\NKHS tree map\public\icon-$n.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
$src.Dispose()
```

- [ ] **Step 4: 更新 `public/manifest.json`**

```json
{
  "id": "./app.html",
  "name": "校園樹木量測登記",
  "short_name": "樹木量測",
  "start_url": "./app.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2e7d32",
  "icons": [
    { "src": "./icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "./icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 5: Run tests**

Run: `npx.cmd vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/manifest.json public/icon-512.png public/icon-180.png tests/manifest.test.js
git commit -m "feat: manifest 以殼層為起點,補 512/180 圖示"
```

---

### Task 5: 離線快取與入口頁

**Files:**
- Modify: `src/swCacheList.js`、`public/sw.js`(`CACHE_FILES` 兩份逐字一致、`CACHE_NAME` → `tree-map-v13`)、`tests/duplication-sync.test.js`、`public/index.html`、`DEPLOY.md`(快取版本號)、`docs/WORKLOG.md`(版本號)

- [ ] **Step 1: 擴充相依檢查測試(先紅)**

在 `tests/duplication-sync.test.js` 的「tree.html 的模組相依…」describe 之後加:

```js
describe('app.html 的模組相依與安裝資產都必須在離線快取清單內', () => {
  it('app.html 每個 ../src/*.js import 都應出現在 CACHE_FILES', () => {
    const imports = extractModuleImports(readRepoFile('public/app.html'));
    expect(imports.length).toBeGreaterThan(0);
    for (const importPath of imports) {
      expect(CACHE_FILES).toContain(importPath);
    }
  });
  it('殼層頁與安裝圖示在清單內', () => {
    for (const file of ['./app.html', './icon-512.png', './icon-180.png']) {
      expect(CACHE_FILES).toContain(file);
    }
  });
});
```

Run: `npx.cmd vitest run tests/duplication-sync.test.js`
Expected: FAIL(清單缺 `./app.html`、`../src/appShell.js`、圖示)

- [ ] **Step 2: 更新兩份清單(逐字一致)**

`src/swCacheList.js` 與 `public/sw.js` 的 `CACHE_FILES` 都改為:

```js
  './app.html',
  './tree.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  '../src/appShell.js',
  '../src/calc.js',
  '../src/offlineQueue.js',
  '../src/submit.js',
  '../src/treePage.js',
  '../src/studentCode.js',
  '../src/config.js',
  '../src/trend.js',
  '../src/trendView.js',
```

並把 `public/sw.js` 的 `tree-map-v12` 改 `tree-map-v13`;`DEPLOY.md`、`docs/WORKLOG.md` 內的 `tree-map-v12` 同步改 `tree-map-v13`。

註:老師頁(roster/map/qrcodes/teacher)本階段**不**加入離線快取(需要連網才有意義)。離線開殼層的老師模式會看到 iframe 載入失敗,屬預期,Task 6 驗證清單有記錄。

- [ ] **Step 3: 更新 `public/index.html`**

在學生/教師兩張卡片之前加一張主要入口卡,並保留原有兩張(舊書籤與說明仍有用):

```html
    <a class="card" href="./app.html">
      <strong>開啟 App →</strong>
      <span>學生與老師的統一入口,可安裝到手機/平板主畫面。</span>
    </a>
```

- [ ] **Step 4: Run tests**

Run: `npx.cmd vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/swCacheList.js public/sw.js tests/duplication-sync.test.js public/index.html DEPLOY.md docs/WORKLOG.md
git commit -m "feat: 離線快取納入殼層與安裝資產,index 指向 app.html,快取升 v13"
```

---

### Task 6: 部署後實機驗證與文件

**Files:**
- Modify: `docs/WORKLOG.md`、`DEPLOY.md`

- [ ] **Step 1: 推上 GitHub 並確認 Pages 生效**

```bash
git push
```
約 1 分鐘後,在使用者的 Chrome(Claude in Chrome)開 `https://jcsk7049.github.io/nkhs-tree-map/public/app.html`;多重新整理 2~3 次讓新 Service Worker 接手。

- [ ] **Step 2: 實機驗證清單(逐項記錄結果,失敗照實寫)**

| # | 項目 | 預期 |
|---|---|---|
| 1 | 開 `app.html` | 首頁兩個入口 |
| 2 | 點「我是學生」 | 顯示 QR 說明;底部導覽只有「量測」 |
| 3 | 開 `app.html#/student/measure?treeId=43667` | 顯示學生填寫頁(無返回連結)、趨勢圖正常 |
| 4 | 點「我是老師」 | 底部三分頁;第一個「名單」顯示 Google 登入閘門 |
| 5 | 使用者點 Google 登入 | 名單載入 3 位測試學生 |
| 6 | 切到「地圖」「QR 標籤」 | 不需再點登入(可能停留 1~2 秒驗證);頁面沒有「← 教師端」 |
| 7 | 地圖選樹 → 產生標籤 | 跳到 QR 標籤且仍為內嵌外觀;**底部導覽高亮仍是「地圖」(已知小瑕疵)** |
| 8 | 手機/平板真機:Android Chrome「安裝應用程式」、iOS「加入主畫面」 | 有圖示、全螢幕開啟、起點是 `app.html` |
| 9 | 安裝後斷網開啟 | 殼層與學生頁可開;老師分頁載入失敗(預期) |
| 10 | 舊網址 `tree.html?treeId=43667`、`teacher.html` | 仍可獨立使用 |

注意:第 5 步的密碼類輸入(通行碼)由使用者自己輸入,不由自動化代填。

- [ ] **Step 3: 更新文件**

`docs/WORKLOG.md`:「頁面」表加入 `app.html`;「使用者需要做的」加真機安裝驗證;「已驗證/未驗證」依 Step 2 結果填寫;「待辦」把階段 2、3 列上(學生免掃 QR 選樹、Excel 匯出、教師名單管理)。`DEPLOY.md`:新增「安裝成 App」一節(Android/iOS 步驟與注意事項)。

- [ ] **Step 4: 全部測試綠後 Commit**

```bash
npx.cmd vitest run
git add docs/WORKLOG.md DEPLOY.md
git commit -m "docs: 階段 1 實機驗證結果與 App 安裝說明"
git push
```

---

## Self-Review

**Spec coverage**
- §1 入口與導覽:Task 1、3。學生「樹木」「我的紀錄」分頁 → 已在「差異」第 3 點說明延到階段 2,非遺漏。
- §3 老師共用登入:以 sessionStorage 共用(差異已說明殼層不做登入)。Task 6 第 5、6 項驗證。
- §4 安裝與離線:Task 4、5。
- §5 相容:保留舊頁、不導向(差異第 2 點)。Task 6 第 10 項驗證。
- 錯誤處理(逾時/過期統一提示):**階段 1 不做**,沿用各頁既有處理(已有 30 秒逾時);列入階段 2 待辦。
- iOS 無安裝提示的文字說明:Task 3 `install-hint`。

**Placeholder scan:** 無 TBD/TODO;Task 2 Step 4 是對既有 HTML 的定點修改,已給出確切行號、屬性與要加的程式碼。

**Type consistency:** `parseHash` 回 `{role, tab, treeId}`、`frameSrc(role, tabId, {treeId})`、`buildHash(role, tabId, {treeId})` 在 Task 1 定義,Task 3 使用一致;`withEmbed`/`applyEmbedMode` 在 Task 2 定義並使用一致。
