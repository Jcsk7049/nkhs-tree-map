# 校園樹木 QRCode 量測登記系統 — MVP 核心路徑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建一個學生掃 QRCode 就能進入單棵樹頁面、輸入測角儀角度與水平距離自動算出樹高、支援完全離線填寫並於恢復網路後自動同步到 Google Sheet 的 PWA 量測工具。

**Architecture:** 純前端 PWA(無框架,vanilla JS)搭配 Google Apps Script Web App 作為 API 層,資料寫入 Google Sheet。前端邏輯拆成可獨立單元測試的純函式模組(計算、驗證、離線佇列),再由 UI 層組裝。Apps Script 端無法用一般測試框架執行,故把「網域驗證」邏輯抽成純函式先在 Node 端測試過,再原樣複製進 `.gs` 檔(Apps Script 不支援 import,此為刻意重複)。

**Tech Stack:** Vanilla HTML/CSS/JS、Vitest(單元測試)、fake-indexeddb(模擬瀏覽器 IndexedDB)、Google Apps Script(V8 runtime)、Google Sheets。

## Global Constraints

- 角度輸入必須介於 0~90 度(不含 90),水平距離必須大於 0 — 規格〈錯誤處理與離線〉
- 帳號登入僅用於擋外部路人,**不可**用登入帳號推斷填寫人 — 規格〈使用情境限制〉
- 填寫人身份一律由表單內手動輸入的姓名＋班級座號記錄 — 規格〈核心元件2〉
- 表單頁面與計算邏輯必須在完全離線狀態下也能完整運作 — 規格〈錯誤處理與離線〉
- 離線送出的資料要存本機,待網路恢復後自動背景同步,同步成功才從佇列移除 — 規格〈資料流程〉
- 資料庫欄位固定為:樹編號、量測時間戳、填寫人姓名、填寫人班級座號、仰角、水平距離、計算後樹高、樹圍、同步狀態 — 規格〈資料模型〉

---

### Task 1: 專案骨架 + 樹高計算與輸入驗證模組

**Files:**
- Create: `package.json`
- Create: `src/calc.js`
- Test: `tests/calc.test.js`

**Interfaces:**
- Produces:
  - `calculateTreeHeight(angleDeg: number, distanceM: number, eyeHeightM?: number): number` — 三角函數法算樹高,預設 `eyeHeightM = 1.5`(量測者眼高),回傳公尺,四捨五入到小數點後 2 位
  - `validateMeasurementInput({ angleDeg, distanceM, girthCm }): { valid: boolean, errors: string[] }` — 角度需 `0 < angleDeg < 90`,距離需 `distanceM > 0`,樹圍需 `girthCm > 0`

- [ ] **Step 1: 初始化專案與測試工具**

```bash
cd "C:\NKHS tree map"
npm init -y
npm install --save-dev vitest fake-indexeddb
```

編輯 `package.json`,在 `"scripts"` 加入:

```json
"scripts": {
  "test": "vitest run"
}
```

- [ ] **Step 2: 寫失敗測試**

建立 `tests/calc.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { calculateTreeHeight, validateMeasurementInput } from '../src/calc.js';

describe('calculateTreeHeight', () => {
  it('45度角、距離10公尺時,樹高應為距離+眼高', () => {
    // tan(45deg) = 1, so height above eye = distance * 1 = 10
    const height = calculateTreeHeight(45, 10, 1.5);
    expect(height).toBeCloseTo(11.5, 2);
  });

  it('0度角時,樹高等於眼高', () => {
    const height = calculateTreeHeight(0, 10, 1.5);
    expect(height).toBeCloseTo(1.5, 2);
  });

  it('未指定眼高時預設為1.5公尺', () => {
    const height = calculateTreeHeight(45, 10);
    expect(height).toBeCloseTo(11.5, 2);
  });

  it('60度角、距離5公尺', () => {
    // tan(60deg) ≈ 1.7320508, height above eye ≈ 8.6603
    const height = calculateTreeHeight(60, 5, 1.5);
    expect(height).toBeCloseTo(10.16, 2);
  });
});

describe('validateMeasurementInput', () => {
  it('合法輸入應通過驗證', () => {
    const result = validateMeasurementInput({ angleDeg: 45, distanceM: 10, girthCm: 80 });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('角度為0應該不合法', () => {
    const result = validateMeasurementInput({ angleDeg: 0, distanceM: 10, girthCm: 80 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('角度必須大於0度且小於90度');
  });

  it('角度為90應該不合法', () => {
    const result = validateMeasurementInput({ angleDeg: 90, distanceM: 10, girthCm: 80 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('角度必須大於0度且小於90度');
  });

  it('距離為0或負數應該不合法', () => {
    const result = validateMeasurementInput({ angleDeg: 45, distanceM: 0, girthCm: 80 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('水平距離必須大於0');
  });

  it('樹圍為0或負數應該不合法', () => {
    const result = validateMeasurementInput({ angleDeg: 45, distanceM: 10, girthCm: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('樹圍必須大於0');
  });

  it('多個欄位同時不合法應回傳多個錯誤訊息', () => {
    const result = validateMeasurementInput({ angleDeg: 0, distanceM: -5, girthCm: 0 });
    expect(result.errors.length).toBe(3);
  });
});
```

- [ ] **Step 3: 執行測試確認失敗**

```bash
npx vitest run tests/calc.test.js
```

預期結果:FAIL,錯誤訊息為找不到 `src/calc.js` 模組。

- [ ] **Step 4: 寫最小實作**

建立 `src/calc.js`:

```javascript
export function calculateTreeHeight(angleDeg, distanceM, eyeHeightM = 1.5) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const heightAboveEye = distanceM * Math.tan(angleRad);
  const totalHeight = heightAboveEye + eyeHeightM;
  return Math.round(totalHeight * 100) / 100;
}

export function validateMeasurementInput({ angleDeg, distanceM, girthCm }) {
  const errors = [];

  if (!(angleDeg > 0 && angleDeg < 90)) {
    errors.push('角度必須大於0度且小於90度');
  }
  if (!(distanceM > 0)) {
    errors.push('水平距離必須大於0');
  }
  if (!(girthCm > 0)) {
    errors.push('樹圍必須大於0');
  }

  return { valid: errors.length === 0, errors };
}
```

- [ ] **Step 5: 執行測試確認通過**

```bash
npx vitest run tests/calc.test.js
```

預期結果:全部 PASS。

- [ ] **Step 6: Commit**

```bash
cd "C:\NKHS tree map"
git add package.json package-lock.json src/calc.js tests/calc.test.js
git commit -m "feat: 新增樹高計算與輸入驗證純函式模組"
```

---

### Task 2: 離線待同步佇列模組(IndexedDB)

**Files:**
- Create: `src/offlineQueue.js`
- Test: `tests/offlineQueue.test.js`

**Interfaces:**
- Consumes: 無(獨立模組,操作瀏覽器原生 `indexedDB` 全域物件,測試時由 `fake-indexeddb` 提供)
- Produces:
  - `enqueue(record: object): Promise<number>` — 將一筆待同步紀錄存入佇列,回傳自動產生的 id
  - `listPending(): Promise<Array<{ id: number, record: object }>>` — 列出所有待同步紀錄
  - `remove(id: number): Promise<void>` — 同步成功後移除該筆紀錄
  - 每筆 `record` 物件形狀:`{ treeId, timestamp, studentName, studentClassNo, angleDeg, distanceM, girthCm, calculatedHeight }`

- [ ] **Step 1: 寫失敗測試**

建立 `tests/offlineQueue.test.js`:

```javascript
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueue, listPending, remove } from '../src/offlineQueue.js';

const sampleRecord = {
  treeId: 'A-023',
  timestamp: '2026-09-18T09:00:00.000Z',
  studentName: '王小明',
  studentClassNo: '土木三甲-12',
  angleDeg: 45,
  distanceM: 10,
  girthCm: 80,
  calculatedHeight: 11.5,
};

describe('offlineQueue', () => {
  it('enqueue後應該能在listPending看到該筆紀錄', async () => {
    await enqueue(sampleRecord);
    const pending = await listPending();
    expect(pending.length).toBe(1);
    expect(pending[0].record).toEqual(sampleRecord);
    expect(typeof pending[0].id).toBe('number');
  });

  it('remove後該筆紀錄應該從listPending消失', async () => {
    const id = await enqueue(sampleRecord);
    await remove(id);
    const pending = await listPending();
    expect(pending.find((p) => p.id === id)).toBeUndefined();
  });

  it('可以同時存在多筆待同步紀錄', async () => {
    await enqueue(sampleRecord);
    await enqueue({ ...sampleRecord, treeId: 'A-024' });
    const pending = await listPending();
    expect(pending.length).toBe(2);
  });
});
```

因為每個測試需要乾淨的資料庫,在同檔案最上方加入 `beforeEach` 重建資料庫:

```javascript
beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('tree-map-offline-queue');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});
```

(把這段插在 `describe('offlineQueue', ...)` 內、第一個 `it` 之前)

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run tests/offlineQueue.test.js
```

預期結果:FAIL,找不到 `src/offlineQueue.js` 模組。

- [ ] **Step 3: 寫最小實作**

建立 `src/offlineQueue.js`:

```javascript
const DB_NAME = 'tree-map-offline-queue';
const STORE_NAME = 'pending';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add({ record });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listPending() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run tests/offlineQueue.test.js
```

預期結果:全部 PASS。

- [ ] **Step 5: Commit**

```bash
cd "C:\NKHS tree map"
git add src/offlineQueue.js tests/offlineQueue.test.js
git commit -m "feat: 新增IndexedDB離線待同步佇列模組"
```

---

### Task 3: 送出邏輯(線上直送 / 離線排隊 / 恢復網路自動同步)

**Files:**
- Create: `src/submit.js`
- Test: `tests/submit.test.js`

**Interfaces:**
- Consumes:
  - `enqueue`, `listPending`, `remove` from `src/offlineQueue.js`(Task 2)
- Produces:
  - `submitMeasurement(record: object, fetchImpl: typeof fetch, apiUrl: string): Promise<{ status: 'sent' | 'queued' }>` — 嘗試直接 POST,失敗(網路錯誤或 fetch reject)則存入離線佇列
  - `syncPendingQueue(fetchImpl: typeof fetch, apiUrl: string): Promise<{ synced: number, failed: number }>` — 讀出所有待同步紀錄,逐筆嘗試送出,成功則從佇列移除,失敗則保留

- [ ] **Step 1: 寫失敗測試**

建立 `tests/submit.test.js`:

```javascript
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitMeasurement, syncPendingQueue } from '../src/submit.js';
import { listPending } from '../src/offlineQueue.js';

const sampleRecord = {
  treeId: 'A-023',
  timestamp: '2026-09-18T09:00:00.000Z',
  studentName: '王小明',
  studentClassNo: '土木三甲-12',
  angleDeg: 45,
  distanceM: 10,
  girthCm: 80,
  calculatedHeight: 11.5,
};

beforeEach(async () => {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('tree-map-offline-queue');
    req.onsuccess = resolve;
    req.onerror = resolve;
    req.onblocked = resolve;
  });
});

describe('submitMeasurement', () => {
  it('fetch成功時應直接回傳sent,不進佇列', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('sent');
    expect(mockFetch).toHaveBeenCalledOnce();
    const pending = await listPending();
    expect(pending.length).toBe(0);
  });

  it('fetch失敗(網路錯誤拋出例外)時應存入離線佇列', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'));
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('queued');
    const pending = await listPending();
    expect(pending.length).toBe(1);
    expect(pending[0].record).toEqual(sampleRecord);
  });

  it('fetch回應ok為false時應存入離線佇列', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const result = await submitMeasurement(sampleRecord, mockFetch, 'https://example.com/api');
    expect(result.status).toBe('queued');
    const pending = await listPending();
    expect(pending.length).toBe(1);
  });
});

describe('syncPendingQueue', () => {
  it('佇列為空時回傳synced:0, failed:0', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const result = await syncPendingQueue(mockFetch, 'https://example.com/api');
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it('佇列中的紀錄同步成功後應從佇列移除', async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error('offline'));
    await submitMeasurement(sampleRecord, failingFetch, 'https://example.com/api');

    const succeedingFetch = vi.fn().mockResolvedValue({ ok: true });
    const result = await syncPendingQueue(succeedingFetch, 'https://example.com/api');

    expect(result).toEqual({ synced: 1, failed: 0 });
    const pending = await listPending();
    expect(pending.length).toBe(0);
  });

  it('同步失敗的紀錄應保留在佇列中', async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error('offline'));
    await submitMeasurement(sampleRecord, failingFetch, 'https://example.com/api');

    const stillFailingFetch = vi.fn().mockRejectedValue(new Error('still offline'));
    const result = await syncPendingQueue(stillFailingFetch, 'https://example.com/api');

    expect(result).toEqual({ synced: 0, failed: 1 });
    const pending = await listPending();
    expect(pending.length).toBe(1);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run tests/submit.test.js
```

預期結果:FAIL,找不到 `src/submit.js` 模組。

- [ ] **Step 3: 寫最小實作**

建立 `src/submit.js`:

```javascript
import { enqueue, listPending, remove } from './offlineQueue.js';

async function postRecord(record, fetchImpl, apiUrl) {
  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    throw new Error(`API回應失敗: ${response.status}`);
  }
}

export async function submitMeasurement(record, fetchImpl, apiUrl) {
  try {
    await postRecord(record, fetchImpl, apiUrl);
    return { status: 'sent' };
  } catch (err) {
    await enqueue(record);
    return { status: 'queued' };
  }
}

export async function syncPendingQueue(fetchImpl, apiUrl) {
  const pending = await listPending();
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await postRecord(item.record, fetchImpl, apiUrl);
      await remove(item.id);
      synced += 1;
    } catch (err) {
      failed += 1;
    }
  }

  return { synced, failed };
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run tests/submit.test.js
```

預期結果:全部 PASS。

- [ ] **Step 5: Commit**

```bash
cd "C:\NKHS tree map"
git add src/submit.js tests/submit.test.js
git commit -m "feat: 新增量測資料送出邏輯(線上直送/離線排隊/自動同步)"
```

---

### Task 4: 網域驗證純函式(供 Apps Script 端複製使用)

**Files:**
- Create: `src/authDomain.js`
- Test: `tests/authDomain.test.js`

**Interfaces:**
- Produces:
  - `isAllowedDomain(email: string, allowedDomain: string): boolean` — 檢查 email 的網域是否等於 `allowedDomain`(不分大小寫),email 格式不正確一律回傳 `false`

- [ ] **Step 1: 寫失敗測試**

建立 `tests/authDomain.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { isAllowedDomain } from '../src/authDomain.js';

describe('isAllowedDomain', () => {
  it('校網域帳號應該通過', () => {
    expect(isAllowedDomain('student@nkhs.edu.tw', 'nkhs.edu.tw')).toBe(true);
  });

  it('非校網域帳號應該被拒絕', () => {
    expect(isAllowedDomain('someone@gmail.com', 'nkhs.edu.tw')).toBe(false);
  });

  it('網域比對應該不分大小寫', () => {
    expect(isAllowedDomain('student@NKHS.EDU.TW', 'nkhs.edu.tw')).toBe(true);
  });

  it('格式不正確的email應該回傳false', () => {
    expect(isAllowedDomain('not-an-email', 'nkhs.edu.tw')).toBe(false);
    expect(isAllowedDomain('', 'nkhs.edu.tw')).toBe(false);
    expect(isAllowedDomain(null, 'nkhs.edu.tw')).toBe(false);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run tests/authDomain.test.js
```

預期結果:FAIL,找不到 `src/authDomain.js` 模組。

- [ ] **Step 3: 寫最小實作**

建立 `src/authDomain.js`:

```javascript
export function isAllowedDomain(email, allowedDomain) {
  if (typeof email !== 'string' || !email.includes('@')) {
    return false;
  }
  const parts = email.split('@');
  if (parts.length !== 2 || parts[1].length === 0) {
    return false;
  }
  return parts[1].toLowerCase() === allowedDomain.toLowerCase();
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run tests/authDomain.test.js
```

預期結果:全部 PASS。

- [ ] **Step 5: Commit**

```bash
cd "C:\NKHS tree map"
git add src/authDomain.js tests/authDomain.test.js
git commit -m "feat: 新增網域驗證純函式"
```

---

### Task 5: Google Apps Script 後端(Sheet API)

**Files:**
- Create: `apps-script/Code.gs`
- Create: `apps-script/README.md`

**Interfaces:**
- Consumes: `isAllowedDomain` 邏輯(從 Task 4 的 `src/authDomain.js` 原樣複製,因 Apps Script 不支援 import)
- Produces:
  - HTTP POST endpoint:接收 JSON body `{ treeId, timestamp, studentName, studentClassNo, angleDeg, distanceM, girthCm, calculatedHeight }`,寫入 Google Sheet 的「量測紀錄」分頁,新增一欄「同步狀態」固定寫入 `已同步`
  - HTTP GET endpoint(帶 `?treeId=A-023`):回傳該樹所有歷史量測紀錄的 JSON 陣列(給 Task 之後的歷史趨勢圖用,MVP 階段先建好介面)

此任務無法用 Vitest 自動化測試(Apps Script 只能在 Google 雲端執行),改用**手動驗證清單**取代 fail-then-pass。

- [ ] **Step 1: 建立 Google Sheet 與分頁結構**

手動在 Google Sheets 建立一份新試算表,命名為「校園樹木量測紀錄」,建立兩個分頁:

分頁一「樹木主檔」,第一列標題:`樹編號 | 樹種 | GPS座標 | 建立日期`

分頁二「量測紀錄」,第一列標題:`樹編號 | 量測時間戳 | 填寫人姓名 | 填寫人班級座號 | 仰角 | 水平距離 | 計算後樹高 | 樹圍 | 同步狀態`

- [ ] **Step 2: 寫 Apps Script 程式碼**

在該 Sheet 的「擴充功能 → Apps Script」中建立 `Code.gs`:

```javascript
const ALLOWED_DOMAIN = 'nkhs.edu.tw'; // 依實際校網域調整
const SHEET_NAME_RECORDS = '量測紀錄';

// 從 src/authDomain.js 原樣複製(Apps Script不支援 import,故此處刻意重複維護)
function isAllowedDomain(email, allowedDomain) {
  if (typeof email !== 'string' || email.indexOf('@') === -1) {
    return false;
  }
  const parts = email.split('@');
  if (parts.length !== 2 || parts[1].length === 0) {
    return false;
  }
  return parts[1].toLowerCase() === allowedDomain.toLowerCase();
}

function doPost(e) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isAllowedDomain(userEmail, ALLOWED_DOMAIN)) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: '非校網域帳號,拒絕存取' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);

  sheet.appendRow([
    data.treeId,
    data.timestamp,
    data.studentName,
    data.studentClassNo,
    data.angleDeg,
    data.distanceM,
    data.calculatedHeight,
    data.girthCm,
    '已同步',
  ]);

  return ContentService.createTextOutput(
    JSON.stringify({ status: 'ok' })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const userEmail = Session.getActiveUser().getEmail();
  if (!isAllowedDomain(userEmail, ALLOWED_DOMAIN)) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: '非校網域帳號,拒絕存取' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  const treeId = e.parameter.treeId;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_RECORDS);
  const rows = sheet.getDataRange().getValues();
  const header = rows[0];
  const records = rows
    .slice(1)
    .filter((row) => row[0] === treeId)
    .map((row) => {
      const record = {};
      header.forEach((key, i) => {
        record[key] = row[i];
      });
      return record;
    });

  return ContentService.createTextOutput(JSON.stringify(records)).setMimeType(
    ContentService.MimeType.JSON
  );
}
```

- [ ] **Step 3: 部署為 Web App**

在 Apps Script 編輯器內:「部署 → 新增部署作業 → 選取類型:網頁應用程式」,設定:
- 執行身分:「以存取應用程式的使用者身分」(確保每個請求都用該使用者的真實身分執行,`Session.getActiveUser()` 才能取到正確 email)
- 有權限存取的使用者:「僅限 `nkhs.edu.tw`網域的使用者」(依校方 Google Workspace 網域設定)

部署後記下產生的 Web App URL,供後續 Task 6 的前端使用。

- [ ] **Step 4: 手動驗證清單**

逐項執行並確認:

- [ ] 用校網域帳號登入瀏覽器,直接對 Web App URL 送出測試 POST(可用瀏覽器 devtools console 執行 `fetch` 或用 Postman),確認 Sheet 的「量測紀錄」分頁新增一列資料,「同步狀態」欄為「已同步」
- [ ] 用非校網域的 Google 帳號登入後嘗試存取同一 URL,確認回應為 `{ "error": "非校網域帳號,拒絕存取" }`,且 Sheet 沒有新增資料
- [ ] 對 Web App URL 加上 `?treeId=A-023` 送出 GET 請求,確認回傳的 JSON 陣列內容與 Sheet 中該樹編號的所有紀錄一致

- [ ] **Step 5: Commit**

建立 `apps-script/README.md`,記錄上述部署設定(執行身分、存取網域、Web App URL 欄位留空供之後填入)與這份手動驗證清單,連同 `Code.gs` 一起提交:

```bash
cd "C:\NKHS tree map"
git add apps-script/Code.gs apps-script/README.md
git commit -m "feat: 新增Apps Script後端API(寫入/讀取Google Sheet量測紀錄)"
```

---

### Task 6: PWA 前端外殼(manifest + service worker + 離線快取)

**Files:**
- Create: `public/manifest.json`
- Create: `public/sw.js`
- Create: `public/icon-192.png`(暫用純色佔位圖,老師可之後替換)
- Test: `tests/sw-cache-list.test.js`

**Interfaces:**
- Consumes: 無
- Produces:
  - `public/manifest.json` — PWA 安裝設定,`start_url` 指向 `./tree.html`
  - `public/sw.js` — 安裝時快取 `CACHE_FILES` 清單內所有檔案,fetch 事件優先回應快取(cache-first),確保完全離線時頁面仍可開啟
  - `src/swCacheList.js` 匯出 `CACHE_FILES: string[]` 常數,供 `sw.js` 與測試共用同一份清單來源(避免兩邊漏同步)

- [ ] **Step 1: 寫失敗測試**

建立 `tests/sw-cache-list.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { CACHE_FILES } from '../src/swCacheList.js';

describe('CACHE_FILES', () => {
  it('應包含量測頁面與其相依的核心JS模組', () => {
    expect(CACHE_FILES).toContain('./tree.html');
    expect(CACHE_FILES).toContain('./manifest.json');
    expect(CACHE_FILES).toContain('../src/calc.js');
    expect(CACHE_FILES).toContain('../src/offlineQueue.js');
    expect(CACHE_FILES).toContain('../src/submit.js');
  });

  it('清單內不應有重複項目', () => {
    const unique = new Set(CACHE_FILES);
    expect(unique.size).toBe(CACHE_FILES.length);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run tests/sw-cache-list.test.js
```

預期結果:FAIL,找不到 `src/swCacheList.js` 模組。

- [ ] **Step 3: 寫最小實作**

建立 `src/swCacheList.js`:

```javascript
export const CACHE_FILES = [
  './tree.html',
  './manifest.json',
  '../src/calc.js',
  '../src/offlineQueue.js',
  '../src/submit.js',
  '../src/authDomain.js',
];
```

建立 `public/manifest.json`:

```json
{
  "name": "校園樹木量測登記",
  "short_name": "樹木量測",
  "start_url": "./tree.html",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2e7d32",
  "icons": [
    {
      "src": "./icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

建立 `public/sw.js`(直接寫死快取清單,與 `src/swCacheList.js` 內容保持一致 — Service Worker 是獨立執行環境,無法直接 import 專案的 ES module,故此處刻意重複維護):

```javascript
const CACHE_NAME = 'tree-map-v1';
const CACHE_FILES = [
  './tree.html',
  './manifest.json',
  '../src/calc.js',
  '../src/offlineQueue.js',
  '../src/submit.js',
  '../src/authDomain.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

用任一 192x192 PNG 圖檔(暫用純色圖示)放到 `public/icon-192.png`,備註老師之後可替換成校徽或樹木圖示。

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run tests/sw-cache-list.test.js
```

預期結果:全部 PASS。

- [ ] **Step 5: Commit**

```bash
cd "C:\NKHS tree map"
git add public/manifest.json public/sw.js public/icon-192.png src/swCacheList.js tests/sw-cache-list.test.js
git commit -m "feat: 新增PWA外殼(manifest/service worker/離線快取清單)"
```

---

### Task 7: 單棵樹量測頁面 UI(整合前面所有模組)

**Files:**
- Create: `public/tree.html`
- Create: `src/treePage.js`
- Test: `tests/treePage.test.js`

**Interfaces:**
- Consumes:
  - `calculateTreeHeight`, `validateMeasurementInput` from `src/calc.js`(Task 1)
  - `submitMeasurement`, `syncPendingQueue` from `src/submit.js`(Task 3)
- Produces:
  - `buildMeasurementRecord(formValues: object, treeId: string): object` — 把表單原始輸入組成符合資料模型的 record 物件(含自動算出的 `calculatedHeight` 與 ISO 格式 `timestamp`)
  - `getTreeIdFromUrl(search: string): string` — 從 `?treeId=A-023` 這種 query string 取出樹編號

- [ ] **Step 1: 寫失敗測試**

建立 `tests/treePage.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { buildMeasurementRecord, getTreeIdFromUrl } from '../src/treePage.js';

describe('getTreeIdFromUrl', () => {
  it('應從query string取出treeId', () => {
    expect(getTreeIdFromUrl('?treeId=A-023')).toBe('A-023');
  });

  it('沒有treeId參數時回傳空字串', () => {
    expect(getTreeIdFromUrl('?foo=bar')).toBe('');
  });
});

describe('buildMeasurementRecord', () => {
  it('應該把表單輸入組成完整record並自動算出樹高', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T09:00:00.000Z'));

    const record = buildMeasurementRecord(
      {
        studentName: '王小明',
        studentClassNo: '土木三甲-12',
        angleDeg: 45,
        distanceM: 10,
        girthCm: 80,
      },
      'A-023'
    );

    expect(record).toEqual({
      treeId: 'A-023',
      timestamp: '2026-09-18T09:00:00.000Z',
      studentName: '王小明',
      studentClassNo: '土木三甲-12',
      angleDeg: 45,
      distanceM: 10,
      girthCm: 80,
      calculatedHeight: 11.5,
    });

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run tests/treePage.test.js
```

預期結果:FAIL,找不到 `src/treePage.js` 模組。

- [ ] **Step 3: 寫最小實作**

建立 `src/treePage.js`:

```javascript
import { calculateTreeHeight } from './calc.js';

export function getTreeIdFromUrl(search) {
  const params = new URLSearchParams(search);
  return params.get('treeId') || '';
}

export function buildMeasurementRecord(formValues, treeId) {
  const { studentName, studentClassNo, angleDeg, distanceM, girthCm } = formValues;
  return {
    treeId,
    timestamp: new Date().toISOString(),
    studentName,
    studentClassNo,
    angleDeg,
    distanceM,
    girthCm,
    calculatedHeight: calculateTreeHeight(angleDeg, distanceM),
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run tests/treePage.test.js
```

預期結果:全部 PASS。

- [ ] **Step 5: 建立頁面 HTML,串接所有模組**

建立 `public/tree.html`:

```html
<!DOCTYPE html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="manifest" href="./manifest.json" />
  <title>樹木量測登記</title>
  <style>
    body { font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 16px; }
    label { display: block; margin-top: 12px; font-weight: bold; }
    input { width: 100%; padding: 8px; font-size: 16px; box-sizing: border-box; }
    button { margin-top: 20px; padding: 12px; width: 100%; font-size: 16px; }
    #result { margin-top: 16px; padding: 12px; background: #e8f5e9; display: none; }
    #errors { color: #c62828; margin-top: 8px; }
  </style>
</head>
<body>
  <h1 id="tree-title">樹木量測登記</h1>
  <form id="measurement-form">
    <label>姓名 <input type="text" id="studentName" required /></label>
    <label>班級座號 <input type="text" id="studentClassNo" required /></label>
    <label>仰角(度) <input type="number" id="angleDeg" step="0.1" required /></label>
    <label>水平距離(公尺) <input type="number" id="distanceM" step="0.01" required /></label>
    <label>樹圍(公分) <input type="number" id="girthCm" step="0.1" required /></label>
    <div id="errors"></div>
    <button type="submit">送出</button>
  </form>
  <div id="result"></div>

  <script type="module">
    import { validateMeasurementInput } from '../src/calc.js';
    import { submitMeasurement, syncPendingQueue } from '../src/submit.js';
    import { buildMeasurementRecord, getTreeIdFromUrl } from '../src/treePage.js';

    const API_URL = 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE';

    const treeId = getTreeIdFromUrl(window.location.search);
    document.getElementById('tree-title').textContent = `樹木量測登記 — ${treeId}`;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js');
    }

    document.getElementById('measurement-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formValues = {
        studentName: document.getElementById('studentName').value,
        studentClassNo: document.getElementById('studentClassNo').value,
        angleDeg: Number(document.getElementById('angleDeg').value),
        distanceM: Number(document.getElementById('distanceM').value),
        girthCm: Number(document.getElementById('girthCm').value),
      };

      const validation = validateMeasurementInput(formValues);
      const errorsEl = document.getElementById('errors');
      if (!validation.valid) {
        errorsEl.textContent = validation.errors.join('、');
        return;
      }
      errorsEl.textContent = '';

      const record = buildMeasurementRecord(formValues, treeId);
      const { status } = await submitMeasurement(record, fetch, API_URL);

      const resultEl = document.getElementById('result');
      resultEl.style.display = 'block';
      resultEl.textContent =
        status === 'sent'
          ? `送出成功!計算樹高:${record.calculatedHeight} 公尺`
          : `目前離線,已存本機,計算樹高:${record.calculatedHeight} 公尺,恢復網路後將自動同步`;
    });

    window.addEventListener('online', () => {
      syncPendingQueue(fetch, API_URL);
    });
  </script>
</body>
</html>
```

- [ ] **Step 6: 執行完整測試套件確認全部通過**

```bash
npx vitest run
```

預期結果:所有測試檔案(`calc`、`offlineQueue`、`submit`、`authDomain`、`sw-cache-list`、`treePage`)全部 PASS。

- [ ] **Step 7: Commit**

```bash
cd "C:\NKHS tree map"
git add public/tree.html src/treePage.js tests/treePage.test.js
git commit -m "feat: 新增單棵樹量測頁面UI,整合計算/驗證/離線同步模組"
```

---

### Task 8: 端對端手動驗證(真實裝置)

**Files:** 無新檔案,純手動驗證。

**Interfaces:** 無。

- [ ] **Step 1: 部署前端到 GitHub Pages(或任何靜態 hosting)**

```bash
cd "C:\NKHS tree map"
git remote add origin <你的GitHub repo URL>
git push -u origin master
```

在 GitHub repo 設定中開啟 Pages,來源選 `master` 分支的 **`/ (root)`** 資料夾。

> **修正(整合審查 C2):** 早期版本寫「選 `/public` 資料夾」是錯的 — `public/tree.html` 與 `public/sw.js` 都用 `../src/*.js` 相對路徑載入模組,若把 `/public` 當站台根目錄這些路徑會 404。必須用 repo root 發佈,量測頁網址為 `https://<user>.github.io/<repo>/public/tree.html?treeId=<ID>`。詳見 repo 根目錄的 `DEPLOY.md`。

- [ ] **Step 2: 填入 Apps Script Web App URL**

把 Task 5 部署得到的 Web App URL,貼到 `public/tree.html` 中的 `PASTE_APPS_SCRIPT_WEB_APP_URL_HERE`,重新 commit 並 push。

- [ ] **Step 3: 真實平板驗證清單**

用校方平板(已加入校網域帳號),連上校園 WiFi,逐項驗證:

- [ ] 開啟 `https://<你的網址>/public/tree.html?treeId=A-023`,確認瀏覽器提示「加入主畫面」,加入後桌面出現圖示
- [ ] 從桌面圖示開啟,確認全螢幕顯示、無網址列
- [ ] 用非校網域帳號登入平板存取同一網址,確認被 Apps Script 拒絕(參照 Task 5 Step 4 的驗證方式)
- [ ] 填寫角度 45、距離 10、樹圍 80,確認畫面顯示「送出成功!計算樹高:11.5 公尺」,並在 Google Sheet 的「量測紀錄」分頁看到新增一列,同步狀態為「已同步」
- [ ] 開啟飛航模式(模擬校園死角完全離線),重新整理頁面,確認頁面仍能完整開啟並顯示表單(驗證 service worker 快取生效)
- [ ] 飛航模式下填寫並送出,確認畫面顯示「目前離線,已存本機...」,不會卡住或報錯
- [ ] 關閉飛航模式(恢復網路),等待幾秒後檢查 Google Sheet,確認剛才離線送出的那筆資料已自動出現在「量測紀錄」分頁

- [ ] **Step 4: 記錄驗證結果**

在 `apps-script/README.md` 補上一段「MVP 端對端驗證紀錄」,寫下驗證日期與上述每一項的通過/失敗結果。若有失敗項目,回到對應 Task 修正後重新跑過整份清單。

```bash
cd "C:\NKHS tree map"
git add apps-script/README.md
git commit -m "docs: 記錄MVP端對端真機驗證結果"
```
